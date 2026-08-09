// Reflection — the PURE component (roadmap step 5, R2). Reflection distils STABLE OPERATIONAL notes
// (L3 Persona Notes) about HOW to work well with a user, from already-grounded signals (their known
// facts + consolidated Knowledge Cards). Ote's law: Cards own CONSOLIDATION (what I know about topic X,
// grounded, no reinterpretation); Reflection owns REINTERPRETATION (how I should collaborate with this
// user) → L3. Never merge.
//
// PORTABILITY (Ote's framing): Reflection is a portable COMPONENT; the TRIGGER is a swappable host
// concern. This file is the component's pure core — prompt + parse, NO IO/clock/fastify. The trigger
// (today a nightly cron; tomorrow the Feature runtime on conversation-close / idle / manual) lives in
// the host adapter and merely CALLS this. Mirrors memory-consolidate.js (pure) vs -host.js (IO).

const clampLen = (s, n) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, n)

/**
 * The induction prompt. Given the user's known facts + consolidated cards + the persona's existing
 * notes, ask for a FEW new operational notes — grounded, non-duplicative, actionable. Pure string.
 * @param {{memories?:Array<{content:string}>, cards?:Array<{content:string}>, existingNotes?:string[], maxNotes?:number}} o
 */
export function buildReflectionPrompt({ memories = [], cards = [], existingNotes = [], maxNotes = 5 } = {}) {
  const bullets = (arr) => (arr.length ? arr.map((x) => `- ${clampLen(typeof x === 'string' ? x : x.content, 300)}`).join('\n') : '(none)')
  return (
    'You maintain a short set of PERSONA NOTES — operational reminders to YOURSELF about HOW to work well ' +
    'with this specific user (their communication style, preferences, current focus, recurring working ' +
    'patterns). These are NOT facts about the user (those are remembered separately) and NOT topic ' +
    'summaries — they are guidance for how you should collaborate.\n\n' +
    `From the signals below, write at most ${maxNotes} SHORT operational notes. Rules:\n` +
    '- Ground every note in the signals; do NOT invent preferences or infer beyond what they support.\n' +
    '- Each note is ONE concise, actionable sentence about how to work with this user.\n' +
    '- Do NOT restate a raw fact ("the user uses Rust") unless it changes HOW you should respond.\n' +
    '- Do NOT duplicate an existing note; add only genuinely new, durable guidance.\n\n' +
    `KNOWN FACTS ABOUT THE USER:\n${bullets(memories)}\n\n` +
    `CONSOLIDATED KNOWLEDGE CARDS:\n${bullets(cards)}\n\n` +
    `YOUR EXISTING NOTES:\n${bullets(existingNotes)}\n\n` +
    'Return ONLY a JSON array of strings — the NEW notes to add (no prose, no keys). ' +
    'Return [] if there is nothing new durably worth noting.'
  )
}

/**
 * Parse an LLM reply → an array of clean note strings. Tolerant: pulls the first JSON array, coerces to
 * trimmed strings, drops empties, dedups (case-insensitive), caps count + length. Also drops notes that
 * merely echo an existing one. Pure.
 * @param {string} raw
 * @param {{maxNotes?:number, maxLen?:number, existingNotes?:string[]}} o
 * @returns {string[]}
 */
/**
 * Why the reply produced no notes. `parseNotes` returning `[]` covers FOUR different situations and treating
 * them as one is a silent zero: measured, the reflection model returns a literal `[]` — a deliberate, correct
 * "nothing here worth noting" — and that read identically to a parse failure.
 *   'declined'      the model returned a valid EMPTY list  → healthy, the answer is "nothing worth noting"
 *   'all-deduped'   it proposed notes, all already known   → healthy, nothing NEW
 *   'unparseable'   the reply had content but no JSON array → a real prompt/format problem
 *   'empty-reply'   the model emitted nothing at all        → a provider/thinking-channel failure
 */
export function classifyNotesReply(raw, { maxNotes = 5, maxLen = 240, existingNotes = [] } = {}) {
  const text = String(raw ?? '').trim()
  if (!text) return 'empty-reply'
  const arr = parseArray(text)
  if (arr === null) return 'unparseable'
  if (arr.length === 0) return 'declined'
  return parseNotes(raw, { maxNotes, maxLen, existingNotes }).length ? null : 'all-deduped'
}

/** PURE: the first JSON array in the text, or null when there isn't one. Shared so classify + parse agree. */
function parseArray(raw) {
  try {
    const m = String(raw ?? '').match(/\[[\s\S]*\]/)
    if (!m) return null
    const arr = JSON.parse(m[0])
    return Array.isArray(arr) ? arr : null
  } catch { return null }
}

export function parseNotes(raw, { maxNotes = 5, maxLen = 240, existingNotes = [] } = {}) {
  const arr = parseArray(raw)
  if (!Array.isArray(arr)) return []
  const seen = new Set(existingNotes.map((n) => clampLen(n, maxLen).toLowerCase()))
  const out = []
  for (const item of arr) {
    const note = clampLen(typeof item === 'string' ? item : (item?.note ?? item?.text ?? ''), maxLen)
    if (!note) continue
    const key = note.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(note)
    if (out.length >= maxNotes) break
  }
  return out
}

/**
 * Select + cap the signals fed to the prompt (highest-importance first, then whatever order the caller
 * gave). Keeps the induction prompt bounded regardless of how much the user knows. Pure.
 */
export function selectSignals(rows = [], { max = 30 } = {}) {
  return rows
    .slice()
    .sort((a, b) => (b?.importance ?? 0) - (a?.importance ?? 0))
    .slice(0, max)
}
