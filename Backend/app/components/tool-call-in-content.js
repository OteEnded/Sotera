// ⭐⭐⭐ A TOOL CALL THAT ARRIVED AS TEXT — DETECT IT, ⛔ NEVER EXECUTE IT.
//
// PURE. No stores, no IO, no config, no model. A string goes in; a description comes out.
//
// ── ⚠️⚠️ THE MEASURED DEFECT (Ote, 2026-09-19, message `5f424d2d`) ───────────────────────────────
// Mid-conversation, with `toolsEnabled: true` and tools demonstrably working in the same session, the
// model emitted this into the CONTENT channel instead of ollama's native `tool_calls`:
//
//     ได้เลยพ่อ รอสักครู่นะ 💻✨
//     <function=fetch_url_content>
//     <parameter=url> https://en.touhouwiki.net/... </parameter>
//     <parameter=maxChars> 15000 </parameter>
//     </function>
//
// ⇒ ollama returned NO `tool_calls`, so nothing ran, the raw markup was persisted and shown to him, and
// he had to say *"เรียก tools แล้วหาข้อมูลมา"* before the turn recovered. ⬤ Measured blast radius at the
// time of writing: **2 assistant turns, 1 conversation, both 2026-09-18.** Rare — ⛔ not systemic.
//
// ⬤ The tools were real (`fetch_url_content`, `search_web` are registered), the adapter's streaming
// tool-call accumulation is correct, and the same two tools executed normally minutes later. ⇒ the
// slippage is at the MODEL/TEMPLATE layer, ⛔ not in our dispatch.
//
// ── ⛔⛔ WHY THIS ONLY LOOKS, AND WILL NOT EXECUTE ───────────────────────────────────────────────
// Executing a call parsed out of the content channel would decide a question nobody has ruled:
// **does a tool call written as prose count as an EMITTED tool call?** The dispatch boundary
// (`authorizeToolCall`) exists precisely to govern what may execute, and routing text through it is a
// semantic change to what an emission IS — the `decision-emission-action` family. ⭐ Ote's call, and it
// is not made here. ⛔ There is no execution path in this module and nothing imports a runtime into it.
//
// ── ⭐ ARG KEYS, NEVER ARG VALUES ────────────────────────────────────────────────────────────────
// Same boundary `log_tool_calls` already holds: a parameter VALUE is content (here, a URL he asked
// about). This returns parameter NAMES and a byte count, ⛔ never the values. A detector that quoted the
// payload would mint a second copy of conversation content under different retention.
//
// ── ⚠️ IT DETECTS ONE MEASURED FORMAT AND UNDER-REPORTS EVERYTHING ELSE, DELIBERATELY ────────────
// The pattern below matches the Hermes/Qwen XML form — the ONLY form observed. ⛔ I did not add
// speculative patterns for formats nobody has seen: an invented pattern produces false positives, and a
// false positive here teaches us a rate that is not real.
// ⭐ THE LOSS DIRECTION IS CHOSEN: under-reporting means we miss occurrences and learn a floor;
// over-reporting would manufacture a defect. A floor is recoverable — see `loss-direction-decides-severity`.

/** ⛔ Exported so a check can assert the INTENT, not merely the regex. */
export const A_TEXT_TOOL_CALL_IS_OBSERVED_NEVER_RUN =
  'A tool call that arrives as text in the content channel is recorded and surfaced, never executed. '
  + 'Whether prose constitutes an emitted tool call is an unruled semantic question, and the dispatch '
  + 'boundary may not be widened by a parser. The detector reports parameter NAMES and a byte count, '
  + 'never parameter values, and it matches only the one format that has actually been observed — so it '
  + 'reports a FLOOR on how often this happens, never an estimate.'

/** ⭐ The one observed format. `<function=NAME> … </function>`, with `<parameter=KEY> … </parameter>`. */
const FUNCTION_BLOCK = /<function=([A-Za-z0-9_.-]{1,64})>([\s\S]{0,8000}?)<\/function>/g
const PARAM_KEY = /<parameter=([A-Za-z0-9_.-]{1,64})>/g

/** ⭐ A cheap pre-test, so the common case (every ordinary turn) costs one `indexOf`. */
export const mightContainTextToolCall = (text) => typeof text === 'string' && text.includes('<function=')

/**
 * ⭐⭐ Did this assistant text contain a tool call written as prose?
 *
 * @param {string} text  the assistant turn's content
 * @returns {{found: boolean, count: number, calls: Array<{name: string, paramKeys: string[]}>, bytes: number|null}}
 *   ⛔ `calls[].paramKeys` are NAMES ONLY. There is no field carrying a value, so a caller cannot log one
 *   by accident — the same guarantee `log_tool_calls` gets from its schema.
 */
export function detectToolCallInContent(text) {
  const empty = { found: false, count: 0, calls: [], bytes: null }
  if (!mightContainTextToolCall(text)) return empty

  const calls = []
  // ⚠️ `lastIndex` is reset explicitly: these regexes are module-level and `g`-flagged, so a previous
  // call would otherwise resume mid-string and silently miss the first block. That is a real bug class
  // in shared stateful regexes, not a hypothetical one.
  FUNCTION_BLOCK.lastIndex = 0
  let m = FUNCTION_BLOCK.exec(text)
  while (m) {
    const [, name, body] = m
    const paramKeys = []
    PARAM_KEY.lastIndex = 0
    let p = PARAM_KEY.exec(body)
    while (p) {
      if (!paramKeys.includes(p[1])) paramKeys.push(p[1])
      p = PARAM_KEY.exec(body)
    }
    calls.push({ name, paramKeys: paramKeys.sort() })
    m = FUNCTION_BLOCK.exec(text)
  }
  if (!calls.length) return empty

  let bytes = null
  try { bytes = Buffer.byteLength(text, 'utf8') } catch { bytes = null }
  return { found: true, count: calls.length, calls, bytes }
}

/**
 * ⭐ One line for the operator log. ⛔ Carries names and key names only.
 * ⓘ Shaped as a string rather than an object so it reads in a tail; the caller supplies the structured
 * fields separately, which is the idiom the rest of this codebase's warn sites use.
 */
export const describeTextToolCall = (d) =>
  (d?.calls ?? []).map((c) => `${c.name}(${c.paramKeys.join(',') || 'no parameters'})`).join(' ');
