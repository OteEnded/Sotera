// CONTEXT USAGE — what the assembled prompt actually spent, by category.
//
// The overflow guard already estimated the whole prompt, but only to decide whether to WARN. That made
// the number invisible in the normal case, which is exactly when it is interesting: measured, tool
// definitions are ~95% of a small prompt (7266 tokens with tools on vs 363 off) and nothing surfaced it
// until a turn broke. This module turns the same estimate into a breakdown the operator can read.
//
// PURE — the caller passes the already-assembled pieces. It deliberately re-uses `estTokens` from the
// composer so there is exactly ONE chars→tokens heuristic in the codebase; if that estimator improves,
// the guard and this display move together instead of disagreeing.
//
// ⚠️ These are ESTIMATES (chars/4 + a flat per-image cost), not the provider's tokenizer. The UI must
// say so — a number that looks authoritative and is 15% off is worse than one labelled approximate.
import { estTokens, estTokensFromChars } from './context-composer.js'

// A flat cost per image, matching the overflow guard. Real cost varies by model and resolution; this is
// a placeholder that is honest about being one.
export const IMAGE_TOKENS = 600

// ---- last-measured usage per conversation -------------------------------------------------------
// The meter is computed from the prompt actually SENT, so it only exists after a reply. That made it
// vanish the moment you left a chat and reopened it (Ote: "when they came back, ctx measure is not
// there?") — which is exactly backwards for a gauge whose job is telling you how full a conversation is
// BEFORE you decide to keep going.
//
// Deliberately in-memory and bounded, not a DB column: it is a measurement of the last turn, not state
// the conversation owns, and a restart genuinely has not measured anything yet. The meter simply
// reappears on the next reply — the same honesty rule as the local attribution ledger.
const lastByConvo = new Map()
const MAX_CONVOS = 500 // bounded like every other module-level map here; a leak is a leak at any constant

export function rememberContextUsage(conversationId, usage) {
  if (typeof conversationId !== 'string' || !conversationId || !usage) return
  if (lastByConvo.size >= MAX_CONVOS && !lastByConvo.has(conversationId)) {
    lastByConvo.delete(lastByConvo.keys().next().value) // Map preserves insertion order → oldest first
  }
  lastByConvo.delete(conversationId) // re-insert so it moves to the young end
  lastByConvo.set(conversationId, usage)
}

/** The last measured usage for a conversation, or null if nothing has been measured this process. */
export function lastContextUsage(conversationId) {
  return lastByConvo.get(conversationId) || null
}

/** Test seam — the store is process-global. */
export function _resetContextUsage() { lastByConvo.clear() }

// Which system-prompt part belongs to which display category. Keys come from composeSystemContext's
// `parts`. An unknown key falls back to 'persona' rather than being dropped — a category that silently
// loses tokens would make the total lie, and the total is the whole point.
const PART_CATEGORY = {
  persona: 'persona',
  instructions: 'persona',
  identity: 'persona',
  timezone: 'persona',
  'memory-rules': 'rules',
  'continuity-rule': 'rules',
  'todo-rule': 'rules',
  'working-memory-rule': 'rules',
  'ask-user-rule': 'rules',
  'profile-rule': 'rules',
  'search-rule': 'rules',
  skill: 'skills',
  'skill-files': 'skills',
  'skill-catalogue': 'skills',
  'schedule-pointer': 'rules',
}

// Display order + labels. Ordered biggest-concept-first rather than by size, so the list does not
// reshuffle between turns — a table whose rows move is hard to read at a glance.
export const CATEGORY_LABELS = [
  ['persona', 'Persona & identity'],
  ['rules', 'Behaviour rules'],
  ['skills', 'Skills'],
  ['tools', 'Tool definitions'],
  ['memory', 'Memory & summary'],
  ['messages', 'Messages'],
  ['runtime', 'Runtime context'],
  ['images', 'Images'],
]

const contentTokens = (msgs) => (Array.isArray(msgs) ? msgs : [])
  .reduce((n, m) => n + estTokens(typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content || '')), 0)

/**
 * Break the assembled prompt down by category.
 *
 * @param {object}   input
 * @param {Array}    input.systemParts  [{ key, chars }] — composeSystemContext().parts
 * @param {Array}    input.preHistory   system messages placed BEFORE history (pinned/notes/summary)
 * @param {Array}    input.history      the conversation messages actually sent
 * @param {Array}    input.tail         runtime-tail system messages (datetime/hints/recall/evidence)
 * @param {Array|null} input.toolDefs   tool definitions as sent to the provider
 * @param {number}   input.window       context window in tokens; 0/null = unknown
 * @returns {{window:number|null, used:number, free:number|null, usedPct:number|null,
 *            categories:Array<{key:string,label:string,tokens:number,pct:number|null}>,
 *            parts:Array<{key:string,tokens:number}>, estimated:true}}
 */
export function contextBreakdown({
  systemParts = [],
  preHistory = [],
  history = [],
  tail = [],
  toolDefs = null,
  window = 0,
} = {}) {
  const buckets = Object.create(null)
  const add = (key, tokens) => { if (tokens > 0) buckets[key] = (buckets[key] || 0) + tokens }

  const parts = []
  for (const p of systemParts) {
    const tokens = estTokensFromChars(p?.chars)
    parts.push({ key: p?.key || 'unknown', tokens })
    add(PART_CATEGORY[p?.key] || 'persona', tokens)
  }

  add('tools', toolDefs ? estTokens(JSON.stringify(toolDefs)) : 0)
  add('memory', contentTokens(preHistory))
  add('messages', contentTokens(history))
  add('runtime', contentTokens(tail))

  // Images ride inside history messages but cost nothing like their text length, so they are counted
  // separately and NOT double-counted: the estimator only ever saw the message's `content`.
  const imageCount = (Array.isArray(history) ? history : [])
    .reduce((n, m) => n + (Array.isArray(m?.images) ? m.images.length : 0), 0)
  add('images', imageCount * IMAGE_TOKENS)

  const used = Object.values(buckets).reduce((a, b) => a + b, 0)
  const win = window > 0 ? window : null
  const pctOf = (n) => (win ? Math.round((n / win) * 1000) / 10 : null)

  const categories = CATEGORY_LABELS
    .filter(([key]) => (buckets[key] || 0) > 0)
    .map(([key, label]) => ({ key, label, tokens: buckets[key], pct: pctOf(buckets[key]) }))

  return {
    window: win,
    used,
    // Free space can go NEGATIVE when the prompt overflows, and it must be allowed to: clamping at 0
    // would render an over-budget turn identically to a perfectly-full one, which is the same class of
    // defect as a guard that only fires on "too big" and never on "no room to answer".
    free: win ? win - used : null,
    usedPct: pctOf(used),
    categories,
    parts: parts.filter((p) => p.tokens > 0),
    estimated: true,
  }
}
