// Interaction Runtime (Streaming Semantics RFC — RFC_STREAMING_SEMANTICS.md).
//
// Interaction is a first-class output ROLE, distinct from reasoning and the canonical answer:
// conversational narration of what the runtime is DOING ("🔎 Searching the web…"). It is
// SYSTEM-generated (the runtime KNOWS a tool started — no parsing, no heuristic on model text), so
// every model narrates consistently. It is visible during the turn, recorded as an
// `{type:'interaction'}` segment for the audit trail, and NEVER replayed (segments don't re-enter
// context — only role+content do). Runtime-generated is the built half of the roadmap; model-emitted
// narration ("Let me check…") is deferred until there's evidence to classify it well.
//
// NARRATE BY LATENCY, NOT BY TOOL TYPE. Humans narrate work that makes you WAIT ("give me a sec, let
// me look that up") — not instant work ("let me calculate 2+2"). So we narrate only user-visible,
// >~500ms / multi-step operations (search, fetch), and STAY SILENT for fast/mechanical tools (time,
// calc, json) and fast state-writes that have their own UI (memory writes, working memory, todos,
// schedules). Silent tools return null → the route emits nothing.
//
// PROTOCOL ROOM (future, not built): an interaction event may later carry a lifecycle
// (`phase: 'start'|'update'|'complete'` + an `id`) so "🔎 Searching…" → "🔎 Searching (3 sources)…"
// → "✓ Search complete" works without changing the role's semantics. Body Parts (Milestone B —
// Eye/Ear/Browser) will register as emitters through this same role.

// Only genuinely user-visible, latency-bearing operations narrate. Ordered most-specific first.
const NARRATE = [
  { test: (n) => /^recall_memory$|search_memory/.test(n), icon: '🧠', text: 'Recalling relevant memories…' },
  { test: (n) => /search_conversation/.test(n), icon: '💬', text: 'Searching past conversations…' },
  { test: (n) => /search_web|web_search|^search$/.test(n), icon: '🔎', text: 'Searching the web…' },
  { test: (n) => /fetch_url|fetch_page|read_url|browse/.test(n), icon: '🌐', text: 'Reading the page…' },
]

/**
 * Narration for a tool about to run — but ONLY for user-visible, latency-bearing work. Fast /
 * mechanical / own-UI tools return null (no narration). Never throws.
 * @param {string} name  the tool being called
 * @returns {{icon:string, text:string}|null}  narration, or null to stay silent
 */
export function describeToolInteraction(name = '') {
  const n = String(name || '').trim()
  for (const r of NARRATE) if (r.test(n)) return { icon: r.icon, text: r.text }
  return null // fast / mechanical / own-UI tools narrate nothing (latency-based policy)
}

// ── the EYE's narration (vision relay) ────────────────────────────────────────────────────────────
// Ote, 2026-08-03: "can you add more varient phase, so it look more dynamic and less boring?"
//
// Two different things make this less boring, and only one of them is flavour:
//   1. PROGRESS — a real fact the runtime knows. Describing 4 images is four sequential model calls,
//      and a single frozen "Reading the image…" for ~a minute reads like a hang (the same complaint
//      that produced the Playwright heartbeat rule). "Image 2 of 4" is information, not decoration.
//   2. VARIETY — the phrasing pool below. Pure flavour, so it must never carry meaning: a reader who
//      ignores the wording and reads only the counter loses nothing.
// The pool is deliberately plain-spoken (what a person would say while looking at your photo) and
// carries no claim about what the picture contains — the runtime does not know that yet, and a
// narration that guesses would be the model-narration ambiguity this RFC defers.
const VISION_OPENERS = [
  { icon: '👀', text: 'Reading the image' },
  { icon: '👀', text: 'Taking a look' },
  { icon: '🖼️', text: 'Looking at what you sent' },
  { icon: '🔍', text: 'Studying the picture' },
  { icon: '👀', text: 'Having a look at the image' },
  { icon: '🖼️', text: 'Reading what is in the picture' },
]

/**
 * Narration for ONE image about to be described by the relay.
 *
 * @param {{index?:number, total?:number, rng?:() => number}} [opts]
 *   index — 0-based position of the image being read RIGHT NOW
 *   total — how many images this turn will describe (progress is shown only when >1)
 *   rng   — injectable for tests; production uses Math.random so repeat turns don't read identically
 * @returns {{icon:string, text:string}}  never null — the relay is always slow enough to narrate
 */
export function describeVisionInteraction({ index = 0, total = 1, rng = Math.random } = {}) {
  const n = Number.isInteger(total) && total > 0 ? total : 1
  const i = Number.isInteger(index) && index >= 0 ? Math.min(index, n - 1) : 0
  const roll = typeof rng === 'function' ? rng() : 0
  const pick = VISION_OPENERS[Math.min(VISION_OPENERS.length - 1, Math.max(0, Math.floor(roll * VISION_OPENERS.length)))]
  // With several images the COUNTER is the point, so it replaces the flavour's own object ("the
  // image" would contradict "3 of 4"); with one image there is no progress to report.
  const text = n > 1 ? `${pick.text.replace(/ (the image|what you sent|the picture|at the image|what is in the picture)$/, '')} — image ${i + 1} of ${n}…` : `${pick.text}…`
  return { icon: pick.icon, text }
}
