// ⭐⭐⭐ MEMORY LINEAGE — *which mechanism wrote this row*, and *what the row rests on*.
//
// PURE. No store, no model, no host, no config. Two vocabularies and the readers for them.
//
// ── ⛔⛔ WHAT THIS MODULE IS NOT ────────────────────────────────────────────────────────────────────
// It is **not modality**. Ote, 2026-08-26: *"provenance on extraction — but only to distinguish
// extraction from other sources. Do not treat it as modality."*
//
// The Rome row proves why the two must never be joined. `7d383ce3` — *"user's current goal: build Rome
// in one day"* — was produced by EXTRACTION from a turn where Ote said those exact words as a PROVERB.
//   · mechanism  = extraction    ✅ true, and this module answers it
//   · provenance = quoted        ✅ true — he really did say them
//   · modality   = figurative    ⛔ the only axis that would have caught it, and it does not exist yet
// ⇒ ⭐ a row can be perfectly `quoted`, correctly attributed to `extraction`, and still be a complete
// misreading of what the person meant. Neither axis here offers **any** protection against that, and a
// module that implied otherwise would be worse than no module. Modality is Ote's decision A.
//
// ── ⭐⭐ AND IT IS NOT CONFIDENCE ──────────────────────────────────────────────────────────────────
// Nothing here returns, caps, raises or suggests a number. Measured 2026-08-26 across all 92 rows: 88 of
// them carry a confidence that is a pure lookup on (writer, provenance), and the 4 that vary are the
// identity resolver's certainty that *a naming act occurred* — a different quantity wearing the same
// column. Adding a third input to that number would deepen the overload, not resolve it.

// ── ⭐ THE MECHANISM AXIS ───────────────────────────────────────────────────────────────────────────
//
// ⚠️ THIS IS A READING OF `source`, NOT A NEW COLUMN. `source` already encodes the producer in a prefix
// and the OCCASION in the id after it (`conversation:<uuid>`, `episode:<cid>@<n>`, `doc:<path>@<sha>`).
// Those are two questions in one string — but the answer to the first is already there, and minting a
// second column to restate it would create exactly the kind of divergent pair this arc keeps unpicking.
// What was missing is that nothing ever PARSED it, so "is this an extraction?" had no answer in code.
export const MECHANISM = Object.freeze({
  extraction: 'extraction',       // the auto-extractor, from one conversational turn
  modelTool: 'model-tool',        // she called a memory tool herself
  document: 'document',           // ingested from a repository file at a pinned commit
  episode: 'episode',             // the episode distiller, over a conversation window
  lesson: 'lesson',               // a lesson she drew about her own practice
  decline: 'decline',             // a record that she DECLINED to remember something
  consolidation: 'consolidation', // a Knowledge Card built from member memories
  unrecorded: 'unrecorded',       // `source` is null — the honest record of a writer that said nothing
  unknown: 'unknown',             // a tag no reader here recognises ⇒ see `UNKNOWN_IS_A_FAILURE` below
})

// ⛔ AN EXPLICIT PREFIX LIST DROPS WHAT IT WAS NOT TOLD ABOUT — the tenth instance of that family cost
// this project a fixture that wrote rows wrong, and the one before it blanked six languages. So this
// list is paired with `mechanismOf` returning `unknown` LOUDLY and a check that fails on any live row
// landing there. A new writer inventing a prefix gets a red test, not a silent bucket.
const PREFIXED = Object.freeze([
  ['conversation:', MECHANISM.extraction],
  ['doc:', MECHANISM.document],
  ['episode:', MECHANISM.episode],
  ['lesson:', MECHANISM.lesson],
  ['decline:', MECHANISM.decline],
])
const EXACT = Object.freeze({
  'model-tool': MECHANISM.modelTool,
  consolidation: MECHANISM.consolidation,
})

/** ⭐ Which mechanism wrote a row, from its `source` tag. PURE. Never throws. */
export function mechanismOf(source) {
  if (source == null || String(source).trim() === '') return MECHANISM.unrecorded
  const s = String(source)
  if (EXACT[s]) return EXACT[s]
  for (const [prefix, mech] of PREFIXED) if (s.startsWith(prefix)) return mech
  return MECHANISM.unknown
}

/** ⭐ The OCCASION half of `source` — the id after the prefix. Null when the tag carries none. */
export function occasionOf(source) {
  if (source == null) return null
  const s = String(source)
  for (const [prefix] of PREFIXED) if (s.startsWith(prefix)) return s.slice(prefix.length) || null
  return null
}

/** Did the auto-extractor write this row? The one question Ote asked this axis to answer. */
export const isExtraction = (source) => mechanismOf(source) === MECHANISM.extraction

/** ⚠️ `unknown` is a defect, not a category. Callers assert on this rather than tolerating it. */
export const UNKNOWN_IS_A_FAILURE = true

// ── ⭐⭐⭐ THE DERIVATION AXIS · WHAT A MEMORY RESTS ON ══════════════════════════════════════════════
//
// Ote, 2026-08-26: *"evidence lineage on synthesis — preserve the distinction between occasion written
// (`source_message_id`) and what the memory was derived from (`evidence`)."*
//
// ⭐⭐ THEY ARE DIFFERENT QUESTIONS AND THE ROME ROWS ARE THE PROOF. `676e17b9` — *"we will build 'Rome'
// together as our shared project and life's mission"* — carries `source_message_id` = the message Ote
// sent on **2026-08-25**, sixteen days after the metaphor was coined. That id is entirely correct as an
// answer to *when was this written*, and entirely wrong as an answer to *what is this based on*: she was
// synthesising from memories already in her context, not from that turn.
// ⇒ asking one column both questions is how a row ends up pointing at a message that does not contain it.
//
//   `source_message_id`    THE OCCASION   — the turn during which the write happened
//   `evidence.derivedFrom` THE DERIVATION — the material the claim actually rests on
//
// ⛔ POINTERS, NEVER A SECOND COPY. This records ids. The same rule the disclosure log follows: a record
// that carries the material becomes another copy of it, in a place nobody is auditing.
export const BASIS = Object.freeze({
  turn: 'turn',             // the words of the current turn
  // ⭐⭐⭐ PRESENCE, NOT USAGE — AND THE DISTINCTION IS THE WHOLE POINT OF THE NAME.
  //
  // `inContext` records a fact that is simply TRUE: *these memories were in front of her when this row
  // was written.* ⛔ It does NOT claim she used them, reasoned from them, or agreed with them. Calling it
  // `memories` would have made it a claim about derivation that nothing here can verify — and inventing
  // a derivation is a smaller version of the exact failure this arc exists to fix, where an inference
  // acquired the authority of an observation.
  //
  // ⇒ a reader asking *"what could this have been built from?"* gets a bounded, honest answer. A reader
  // asking *"what WAS it built from?"* gets told that nobody recorded that, which is the truth.
  inContext: 'in-context',
  memories: 'memories',     // memories this was EXPLICITLY built from (a card names its members)
  messages: 'messages',     // specific earlier messages
  document: 'document',     // a file at a pinned commit
  priorMemory: 'prior',     // an earlier version of this same belief
})
const BASIS_VALUES = new Set(Object.values(BASIS))

/** The key `derivedFrom` lives under inside `evidence`. Named so nothing has to spell it twice. */
export const LINEAGE_KEY = 'derivedFrom'

/**
 * derivedFrom — build the lineage envelope. PURE.
 *
 * ⚠️ AN EMPTY LINEAGE IS NULL, NOT `{}`. "We recorded that it rests on nothing" and "we did not record"
 * must not look alike — that ambiguity is what let a 4-in-5 fact drop stay invisible for a week.
 *
 * @param {object} o
 * @param {string} o.basis              one of BASIS
 * @param {string[]} [o.memoryIds]      ids of memories this was synthesised from
 * @param {string[]} [o.messageIds]     ids of messages this was read from
 * @param {object}   [o.document]       { repo, path, commit } — pinned, so the reference cannot rot
 * @param {string}   [o.via]            which retrieval path put the material in front of her
 * @returns {object|null}
 */
export function derivedFrom({ basis, memoryIds = [], messageIds = [], document = null, via = null } = {}) {
  if (!BASIS_VALUES.has(basis)) return null
  const ids = (a) => [...new Set((Array.isArray(a) ? a : []).filter(Boolean).map(String))]
  const mem = ids(memoryIds)
  const msg = ids(messageIds)
  // A basis of `memories` or `messages` that names none is not a lineage — it is a claim about a
  // lineage. Refuse it rather than persisting an envelope that says nothing and looks like it does.
  if ((basis === BASIS.memories || basis === BASIS.inContext) && !mem.length) return null
  if (basis === BASIS.messages && !msg.length) return null
  if (basis === BASIS.document && !document?.path) return null
  const out = { basis }
  if (mem.length) out.memoryIds = mem
  if (msg.length) out.messageIds = msg
  if (document?.path) out.document = { repo: document.repo ?? null, path: String(document.path), commit: document.commit ?? null }
  if (via) out.via = String(via)
  return out
}

/**
 * withDerivedFrom — attach a lineage to an existing `evidence` payload. PURE, ADDITIVE.
 *
 * ⚠️ `evidence` ALREADY HOLDS FOUR UNRELATED PAYLOADS in the live store — card membership, slot-mint
 * metadata, document-ingest fields and decline reasons — with no discriminator between them. Clobbering
 * the column would silently destroy one of them, so this merges under its own key and touches nothing
 * else. ⛔ Never `evidence = { derivedFrom }`.
 */
export function withDerivedFrom(evidence, lineage) {
  if (!lineage) return evidence ?? null
  const base = (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) ? evidence : {}
  return { ...base, [LINEAGE_KEY]: lineage }
}

/** Read a lineage back out. Null when the row carries none — which most rows do, honestly. */
export function derivedFromOf(evidence) {
  const l = evidence?.[LINEAGE_KEY]
  return (l && typeof l === 'object' && BASIS_VALUES.has(l.basis)) ? l : null
}

/**
 * ⭐ THE ONE ASSERTION THIS MODULE MAKES ABOUT A ROW: its occasion is not its derivation.
 *
 * A lineage whose only `messageIds` entry is the row's own `source_message_id` has recorded the
 * OCCASION twice and the DERIVATION not at all. That is the exact collapse this axis exists to prevent,
 * so it is detectable rather than merely discouraged.
 */
export function lineageRestatesTheOccasion(row) {
  const l = derivedFromOf(row?.evidence)
  if (!l || !row?.source_message_id) return false
  const msg = l.messageIds ?? []
  return msg.length === 1 && msg[0] === String(row.source_message_id) && !(l.memoryIds ?? []).length
}
