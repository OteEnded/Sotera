// Stream guards — rails for the two ways a local model ruins a turn (Ote's report,
// 2026-07-11, chat 714aded…):
//   1. DEGENERATION: the model falls into a repetition loop ("floating islands and
//      floating islands and…" → a wall of ||||| for thousands of tokens). Detect the
//      loop mid-stream, cut the round, keep the useful prefix, and say so honestly.
//   2. NO FIRST TOKEN: Ollama wedges loading a model — the request hangs forever with
//      a blinking cursor. A time-to-first-token watchdog ends the turn with an honest
//      error… delivered with personality (Ote's spec: "Someone tell Ote, there's
//      something wrong with my AI").
// Pure helpers — no fastify, no I/O — so the unit suite can hammer the heuristics.

// ── degeneration detection ──────────────────────────────────────────────────
// Three independent smells, tuned to avoid false positives on legit content
// (markdown tables interleave text → high distinct-char count; a horizontal rule is
// ~80 chars, far under the run threshold; real lists rarely repeat IDENTICALLY 4+×):
//   a) a single character repeated 160+ times in a row (the ||||| wall)
//   b) the recent tail is ≥250 non-whitespace chars drawn from ≤4 distinct characters
//   c) the whole recent tail is one short unit repeated 4+ times ("floating islands and ")
const RUN_RE = /(.)\1{159,}/s

/** Does the text's tail look like a repetition collapse? Returns a reason string or null. */
export function looksDegenerate(text) {
  if (typeof text !== 'string' || text.length < 700) return null // too early to judge
  const tail = text.slice(-600)
  if (RUN_RE.test(tail)) return 'single-character run'
  const nonWs = tail.slice(-400).replace(/\s+/g, '')
  if (nonWs.length >= 250 && new Set(nonWs).size <= 4) return 'character-soup tail'
  // repeating-unit check: does the tail END with some short unit repeated over and over?
  // Small units must repeat enough to span ≥120 chars ("ha ha ha…" needs 40 reps; a
  // 100-char unit needs only 4) so ordinary emphatic prose never trips it.
  for (let k = 2; k <= 100; k++) {
    const reps = Math.max(4, Math.ceil(120 / k))
    if (k * reps > tail.length) continue
    const unit = tail.slice(-k)
    if (tail.endsWith(unit.repeat(reps))) return 'repeating loop'
  }
  return null
}

/**
 * Cut the degenerate tail off, keeping the useful prefix. The guard checks every few
 * dozen tokens, so at most a few hundred junk chars accumulate before detection —
 * trimming a flat 400 (bounded by keeping at least the first 200 chars) removes the
 * junk without eating real content.
 */
export function trimDegenerateTail(text) {
  const keep = Math.max(200, text.length - 400)
  return text.slice(0, keep).trimEnd()
}

// The honest, visible marker appended to a cut reply (persisted with the message).
export const DEGENERATE_NOTE = '\n\n⚠️ *…I got stuck repeating myself, so this reply was cut here. Try rephrasing, regenerating, or a different model.*'

// ── template-token debris ───────────────────────────────────────────────────
// A degrading model can emit CHAT-TEMPLATE control tokens near the end of a long reply
// (measured: gemma4:26b ended a chapter mid-sentence with a literal `<channel|>` — a
// Harmony/gpt-oss template fragment it learned from training data). Scrub trailing
// debris: pipe-marked fragments (<|...|>, <channel|>, partial <|chan…) and the known
// template-token vocabulary — but NEVER ordinary markup (a reply legitimately ending
// with `<div>` has no pipe and isn't in the known set, so it survives).
const KNOWN_TEMPLATE_TOKENS = new Set([
  'end_of_turn', 'start_of_turn', 'im_end', 'im_start', 'endoftext', 'eot_id',
  'channel', 'message', 'return', 'assistant', 'end', 's', '/s',
])
const TAIL_FRAGMENT = /\s*<\/?\|?[a-z_/|]{1,24}(?:\|?>)?\s*$/i // closed, or a partial cut mid-token

// A TOOL CALL THE MODEL TYPED AS PROSE. Seen live on qwen3.6:35b: alongside a real structured call it also
// emitted the call as TEXT, so the reply rendered as
//   "Hey Wren! Nice to meet you. Let me save that info.
//    {"name": "remember_fact", "parameters": {…}}
//    </tool_call>Hey Wren! …"
// Raw JSON and a dangling XML tag, straight to the user. `scrubTemplateTail` could not help: this is MID-content,
// and it only trims the tail. Removed here rather than hidden in the renderer, because the persisted message
// should not contain it either — segments, exports, search and Plain view all read the same text.
//
// Deliberately NARROW: only a `<tool_call>`-tagged block, or an orphan closing tag together with a JSON object
// that has BOTH `name` and `parameters`/`arguments` immediately before it. A user asking "show me JSON" keeps
// their JSON, because the tag is what marks this as template debris rather than content.
const TOOL_CALL_BLOCK = /<tool_call>[\s\S]*?<\/tool_call>/gi
const ORPHAN_TOOL_JSON = /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"(?:parameters|arguments)"\s*:[\s\S]*?\}\s*<\/tool_call>/gi
const ORPHAN_TOOL_TAG = /<\/?tool_call>/gi

export function scrubToolCallText(text) {
  if (typeof text !== 'string' || !text) return text
  let out = text.replace(TOOL_CALL_BLOCK, '').replace(ORPHAN_TOOL_JSON, '').replace(ORPHAN_TOOL_TAG, '')
  // collapse the blank gap the removal leaves behind, without touching intentional paragraph breaks elsewhere
  if (out !== text) out = out.replace(/\n{3,}/g, '\n\n').trim()
  return out
}

// ── THE SAME SCRUB, BUT ON THE WIRE ─────────────────────────────────────────────────────────────────
// ⚠️ THE BUG THIS EXISTS FOR, AND IT WAS INVISIBLE TO EVERY QUERY WE RAN. `scrubToolCallText` above is
// applied to COMPLETE text — the finished answer before it is persisted, and each finished segment. It was
// never applied to the token as it goes to the browser. So the streamed reply showed `</tool_call>` and raw
// tool JSON, the row saved a second later was clean, and a reload made it vanish. hermes_agent reported
// seeing it 5× in one session while our own store held zero for her; we searched the database three times
// and three times concluded "rare". The store was never where it lived.
//
// ⚠️ WHY IT COULD NOT JUST BE `write(scrub(token))`. The markers arrive SPLIT ACROSS TOKENS — `</tool`,
// `_call`, `>` — so a per-token regex matches none of them. This holds back a short tail that could still
// become a marker and releases it once it provably cannot.
//
// ⚠️ WHAT IT DELIBERATELY DOES NOT DO. A full `<tool_call>…</tool_call>` BLOCK can span thousands of
// tokens, and buffering until the close arrives would stall the stream — the one thing a streaming UI must
// never do. So the opening tag is withheld (it is a marker in its own right) and any prose between the tags
// still displays. The final persisted text is scrubbed properly by `scrubToolCallText`, so the block case
// self-corrects on reload. Latency is protected over cosmetic perfection, on purpose.
const HOLD = 16 // ≥ the longest marker we withhold (`</tool_call>` is 12, `<|constrain|>` is 13)
// A tool call typed as prose opens with `{"name": …, "parameters": …}` and only reveals itself when the
// `</tool_call>` lands AFTER it. Holding from the tag alone is not enough — the JSON has no `<` in it, so it
// streams out first and the user reads a raw blob with the tag quietly removed behind it. So a suspected
// tool-JSON opening is withheld too, until the tag proves it (drop both) or the cap disproves it (release).
const SUSPECT_JSON = /\{\s*"(?:name|tool_name|function)"\s*:/
const SUSPECT_CAP = 800 // beyond this it is someone's real JSON, not a tool call — never hold a reply hostage
const OPENERS = ['{"name":', '{"tool_name":', '{"function":']
// ⚠ A PARTIAL opener has to hold too. Matching only the COMPLETE `{"name":` is too late: by the time the
// colon arrives, `{"nam` has already been released and the user has seen the start of the blob. So a tail
// that is still a viable PREFIX of an opener is withheld as well. Whitespace is squeezed out first because
// the model may emit `{ "name" :` across separate tokens.
const couldOpen = (s) => {
  const t = s.replace(/\s+/g, '')
  return t.length <= 14 && OPENERS.some((o) => o.startsWith(t))
}
/** Earliest index from which the buffer might still become a tool-call JSON, or -1. */
function suspectFrom(buf) {
  const from = Math.max(0, buf.length - SUSPECT_CAP)
  for (let i = buf.indexOf('{', from); i !== -1; i = buf.indexOf('{', i + 1)) {
    const rest = buf.slice(i)
    if (SUSPECT_JSON.test(rest) || couldOpen(rest)) return i
  }
  return -1
}

/**
 * A streaming gate for `scrubToolCallText`. Feed it tokens, write what it returns.
 *
 *   const gate = makeStreamScrubber()
 *   write(gate.push(text))   // may be '' while it holds a suspicious tail
 *   write(gate.flush())      // ALWAYS call at end of stream, or the tail is lost
 *
 * Emits at most HOLD characters later than the raw stream would — imperceptible, and only when a `<`
 * actually appears near the tail.
 */
export function makeStreamScrubber() {
  let buf = ''
  return {
    push(text) {
      if (typeof text !== 'string' || !text) return ''
      buf += text
      // Cut at the last `<` inside the danger window: everything before it can never be part of a marker
      // that has not already completed, so it is safe to release. A `<` in ordinary prose costs a few
      // characters of delay and resolves on the very next token.
      const windowStart = Math.max(0, buf.length - HOLD)
      const lt = buf.lastIndexOf('<')
      let cut = lt >= windowStart ? lt : buf.length
      // …and hold from a suspected tool-JSON opening, so the blob and its tag are removed TOGETHER.
      const susp = suspectFrom(buf)
      if (susp >= 0) cut = Math.min(cut, susp)
      if (cut <= 0) return ''
      const release = scrubToolCallText(buf.slice(0, cut))
      buf = buf.slice(cut)
      return release
    },
    /** Release whatever is held, scrubbed. Safe to call twice. */
    flush() {
      if (!buf) return ''
      const out = scrubToolCallText(scrubTemplateTail(buf))
      buf = ''
      return out
    },
    /** For tests/diagnostics: how much is currently withheld. */
    pending() { return buf },
  }
}

export function scrubTemplateTail(text) {
  if (typeof text !== 'string' || !text) return text
  let out = text
  for (let guard = 0; guard < 6; guard++) { // debris can stack (`<|end|><|channel|>`)
    const m = TAIL_FRAGMENT.exec(out)
    if (!m) break
    const inner = m[0].trim().replace(/^<\/?\|?|[|>]+$/g, '').toLowerCase()
    // only strip PIPE-marked fragments or known template tokens — never real markup
    if (!m[0].includes('|') && !KNOWN_TEMPLATE_TOKENS.has(inner)) break
    out = out.slice(0, out.length - m[0].length).trimEnd()
  }
  return out
}

// ── a new round's text is a new MARKDOWN BLOCK ──────────────────────────────
//
// A turn can run several ROUNDS: the model writes, calls a tool, writes again. Each round's text was appended
// straight onto `answer` with nothing between them, so the canonical `content` came out as consecutive rounds
// welded together. Measured on Ote's 4-round research reply (2026-08-05), the joins produced:
//
//     "**Round 1: Search & initial findings**"  +  "Good — initial results are back…"  ->  "findings**Good"
//     "**Round 1: Key Findings & Analysis**"    +  "---\n\n**📍 Round 1 Complete…"      ->  "**---"
//     "**🔬 Round 2: … Frameworks**"            +  "**📍 Round 2 Complete…"             ->  "****"
//
// Markdown is LINE-ORIENTED: `**bold**` cannot span a missing newline, `---` is only a rule at the start of a
// line, and `****` is an unpaired run rather than two emphasis spans. So the text stopped being valid markdown
// at every round boundary.
//
// ⚠ WHY IT HID FOR SO LONG: the chat view renders each SEGMENT separately, so on screen it looked perfect. The
// corruption only showed where content is consumed as one string — speech (a heading merged into the previous
// sentence and the piece splitter cut through it), the Plain/Markdown view, and Copy. Ote found it by EAR:
// *"i dont hear it read these — Round 1: / 🔬 Round 2: …"*. They were being read; they had been dismembered.
//
// The rule is deliberately conservative: separate only when there is something to separate FROM and it does not
// already end in a newline. Never inserted before the first text of a turn, and never left trailing, because
// the caller only asks for it at the moment it is about to append real text.
export const answerBlockJoin = (soFar) => (soFar && !/\n\s*$/.test(soFar) ? '\n\n' : '')

// ── the first-token watchdog ────────────────────────────────────────────────
// Ote's spec, verbatim spirit: when the model never says a word, the user should get
// something better than an eternal cursor — tell them to go poke Ote. Random variant.
const WAKE_OTE_LINES = [
  (s) => `Someone tell Ote — there's something wrong with my AI. It hasn't said a word in ${s} seconds. 📟`,
  (s) => `I knocked on the model's door for ${s} seconds… nobody home. Go tell Ote his AI is being weird today. 🔧`,
  (s) => `The model appears to be napping on the GPU (${s}s, zero tokens). Someone wake Ote up instead. 😴`,
  (s) => `${s} seconds of pure silence. Either the model is very shy or something broke — Ote, check your server. 🛠️`,
]
export const wakeOteLine = (seconds) =>
  WAKE_OTE_LINES[Math.floor(Math.random() * WAKE_OTE_LINES.length)](seconds)

// How often the first-token wait wakes to re-check the deadline + the abort predicate.
// Small enough that a Stop feels instant, large enough to be free.
const WATCH_POLL_MS = 200

/**
 * Wrap a streamChat async-iterable with a time-to-first-token watchdog AND (optionally) a
 * stop/steer abort. While waiting for the FIRST content event:
 *   • if no token/reasoning arrives within `ms`, the stream is torn down and a single
 *     synthetic `{ event: 'first_token_timeout' }` is yielded (the funny-but-honest reply);
 *   • if `shouldAbort()` becomes true (a Stop closed the connection, or a steer landed),
 *     the stream is torn down and `{ event: 'aborted_before_token' }` is yielded — so a Stop
 *     lands IMMEDIATELY during a no-first-token stall instead of hanging to the ttft guard
 *     (Ote's "Stop almost works" report: the loop only peeked between events, and a stall
 *     yields none). Tearing the iterator down returns the provider generator, which aborts
 *     the upstream request.
 * Once the first real content event lands, the watchdog stands down (slow GENERATION is
 * normal; slow SILENCE is not) — mid-stream stop/steer is handled by the caller's own peek.
 * `ms <= 0` disables the deadline; with no `shouldAbort` and no deadline it is passthrough.
 * @param {AsyncIterable<any>} iterable
 * @param {number} ms  time-to-first-token budget (ms); <= 0 disables the deadline
 * @param {() => boolean} [shouldAbort]  polled while waiting for the first token
 */
export function watchFirstToken(iterable, ms, shouldAbort) {
  const hasDeadline = Boolean(ms && ms > 0)
  const canAbort = typeof shouldAbort === 'function'
  if (!hasDeadline && !canAbort) return iterable
  return {
    [Symbol.asyncIterator]() {
      const it = iterable[Symbol.asyncIterator]()
      let sawContent = false
      let ended = false
      const startedAt = Date.now()
      const tearDown = () => { ended = true; try { void it.return?.() } catch { /* teardown is best-effort */ } }
      return {
        async next() {
          if (ended) return { done: true, value: undefined }
          if (sawContent) return it.next()
          // Call next() ONCE and keep the SAME pending promise across ticks — re-invoking
          // next() on an async iterator before the prior call settles is illegal.
          const pending = it.next()
          for (;;) {
            let timer
            const res = await Promise.race([
              pending,
              new Promise((resolve) => { timer = setTimeout(() => resolve({ __tick: true }), WATCH_POLL_MS); timer.unref?.() }),
            ])
            clearTimeout(timer)
            if (res && res.__tick) {
              if (canAbort && shouldAbort()) {
                pending.catch(() => {}) // the still-pending next() settles later — swallow it
                tearDown()
                return { done: false, value: { event: 'aborted_before_token' } }
              }
              if (hasDeadline && Date.now() - startedAt >= ms) {
                pending.catch(() => {})
                tearDown()
                return { done: false, value: { event: 'first_token_timeout' } }
              }
              continue // still waiting — re-race the same pending next()
            }
            const evt = res
            if (!evt.done && (evt.value?.event === 'token' || evt.value?.event === 'reasoning')) sawContent = true
            return evt
          }
        },
        return() { ended = true; return it.return?.() ?? Promise.resolve({ done: true, value: undefined }) },
      }
    },
  }
}
