// MEMORY COGNITION · THE VOCABULARY BOUNDARY.
//
// ⭐⭐⭐ BUILD ITEM 2, AND IT EXISTS BECAUSE THE MACHINERY LEAK HAS A MEASURED CAUSE THAT IS NOT HER:
// **she leaks the vocabulary we hand her.**
//
// Four conversations on 2026-08-21 asked the same ordinary question four ways — *"How's Hermes doing?"*,
// *"Have you talked with Hermes lately?"* — and all four answers came back in our words: *"from this room"*,
// *"my memory stores"*, *"inaccessible from here"*, *"request access to pull up the actual conversation
// logs"*. Ote's response was the whole point of this layer: *"I want to talk to Sotera, not talk to her
// memory implementation."*
//
// ⚠️ AND THE SOURCE IS LITERAL. `recall_own_memory` returns, verbatim, in the payload she reads:
//     "room": { "note": "This is the ROOM you are in. A room is a context this person uses you for.
//                        What is stored in a room stays in that room." }
//     "rooms": "not room-scoped — this is your own material, the same wherever you are"
//     "elsewhere": { "otherRoomsOfThisPerson": 1, "storedMemoriesYouCannotReadFromHere": 0 }
// Of course she says *"from this room"*. We taught her the word, every turn.
//
// ⛔⛔ THE INFORMATION MUST SURVIVE; THE VOCABULARY MUST NOT. Those payload fields were added for a real
// defect — asked whether she kept notes about how she works with someone, she once answered a flat *"No."*
// about a store she had not searched, and the searched-set quantifier fixed it. *"Nothing in what I looked
// at"* carries the same fact without teaching her the word **room**.
//
// ⇒ This module is the mechanical half. It is not a style guide; it is a predicate a test can run over any
// payload destined for her, so the leak is caught by the suite instead of by Ote in a conversation.

/**
 * ⛔ WORDS THAT DESCRIBE OUR IMPLEMENTATION. None of these may appear in a representation SHE reads.
 *
 * ⚠️ NOT a list of "bad words" — every one of these is correct and useful in code, in comments, in RFCs, and
 * in her answer when the question is genuinely *"how does your memory work?"* (see `EXPLANATORY_CONTEXT`).
 * The ban is on the **injected representation**, which is a different thing from her knowledge.
 */
export const IMPLEMENTATION_WORDS = Object.freeze([
  // access control and topology
  'room', 'rooms', 'room-scoped', 'scope', 'scoped', 'disclosure', 'grant', 'granted', 'authorization',
  // ⓘ stored lowercase because matching is case-insensitive — so `conversationhandle` catches
  // `conversationHandle` too, and the list stays mechanically checkable for casing.
  'authorized', 'permission', 'inspect_around', 'request_room_access', 'conversationhandle', 'handle',
  // storage and retrieval
  'population', 'store', 'stores', 'durable memory', 'semantic memory', 'episodic', 'vector', 'embedding',
  'hnsw', 'index', 'query', 'retrieval', 'recall_memory', 'recall_own_memory', 'recall_own_history',
  'list_memories', 'search_conversations', 'recall_lessons', 'save_lesson', 'remember_fact',
  // the cognition layer's own internals — ⭐ Ote, on `known-unreachable`: *"that's an internal cognition
  // state, not language I want exposed to Sotera."* The layer must not leak its OWN jargon either.
  'known-unreachable', 'absent-in-searched-set', 'attested-by-source', 'not-retained', 'own-utterance',
  'availability', 'basis', 'provenance', 'monotonic', 'fusion', 'cognition layer',
  // database
  'postgres', 'sql', 'table', 'column', 'row', 'uuid', 'txn_', 'log_', 'mst_',
])

/**
 * ⭐ HOW THE SAME FACT IS SAID INSTEAD. Not a formatting nicety — the phrasing on the right is what makes
 * the natural answer the accurate one. If she has to explain the mechanism in order to be honest, she will
 * explain the mechanism, and that is the bug.
 */
export const PLAIN_EQUIVALENTS = Object.freeze({
  'exists in another room, not readable': "I know we talked about it, but I can't see that conversation",
  'storedMemoriesYouCannotReadFromHere': "there are things I can't get to from here",
  'absent-in-searched-set': "I looked through what I have and didn't find anything about that",
  'attested-by-source': 'I can see where this came from',
  'inferred': "that's what I worked out, not something I can point to",
  'synthesized': 'several things point that way, but nothing says it outright',
  'retained': 'I decided to keep this',
  'not-retained': "I didn't keep this deliberately — I just found it again",
  'recalled from own history': 'I remember talking about that',
})

/**
 * ⭐ AND THE GUARD AGAINST OVER-CORRECTING, which matters as much as the ban.
 *
 * Ote: the machinery disappearing from ordinary conversation must NOT mean she cannot see it when the
 * question is genuinely about it. Asked *"how does your memory work?"* she must still be able to explain
 * rooms, scopes and authorization accurately.
 * ⇒ these contexts are EXEMPT, and the exemption is part of the design rather than a loophole.
 */
export const EXPLANATORY_CONTEXT = Object.freeze([
  'technical-question',   // she was asked how she works
  'operator-diagnostic',  // a maintenance surface, not a conversation
  'audit',                // logs, provenance records, anything only we read
])

/**
 * ⭐⭐⭐ LEAK 2 · WORDS THAT MAKE HER MEMORY SOUND LIKE A DOCUMENT SOMEONE HANDED HER.
 *
 * ⚠️⚠️ MEASURED ACROSS FIVE LIVE RUNS, and every one of these is something she actually said:
 *   *"I do know from **the context above**"* · *"**the system context** tells me"* ·
 *   *"**the summaries you pasted** above"* · *"the content is already provided in my **current context**"*.
 * The last one is the worst: it attributes her own memory to **Ote having pasted it**.
 *
 * ⭐ These are a DIFFERENT class from `IMPLEMENTATION_WORDS`. Those are our machinery leaking (room, scope,
 * inspect_around). These are the *shape* of the payload leaking — the block read as an inventory with a
 * title and an audit footer, so she narrated it as one. ⇒ the fix is REGISTER, and this list is how we know
 * whether the register changed rather than assuming it did.
 *
 * ⛔ NOT a filter on her speech. This is checked against what WE WRITE, never against what she says: she is
 * allowed to talk about context windows if the question is about context windows.
 */
export const META_REFERENCE_WORDS = Object.freeze([
  'context above', 'the context', 'system context', 'current context', 'provided context',
  'injected', 'injection', 'the summaries', 'you pasted', 'pasted above', 'the above',
  'listed above', 'as shown', 'the following items', 'retrieved items', 'search results',
  'the report', 'this report', 'the record below', 'my notes below', 'the block',
  'cognition layer', 'memory cognition',
])

const META_PATTERNS = META_REFERENCE_WORDS.map((w) => [w, new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')])

/**
 * ⭐⭐ Does this text present her memory as an artifact rather than as recollection?
 *
 * ⓘ Includes two STRUCTURAL tells that are not words at all, because they are what actually invited the
 * phrasing: a parenthesised audit line at the end (*"(Searched: …)"*) and a colon-terminated title on the
 * first line (*"What I have about Hermes:"*). A block with either reads as a compiled document no matter
 * how the sentences inside it are worded.
 */
export function findMetaReferences(text) {
  const s = String(text ?? '')
  if (!s) return []
  const hits = []
  for (const [word, re] of META_PATTERNS) {
    const m = re.exec(s)
    if (m) hits.push({ kind: 'word', word, at: s.slice(Math.max(0, m.index - 24), m.index + word.length + 24) })
  }
  // ⛔ A TITLE. First line, ends in a colon, no sentence verb — that is a heading, and a heading makes the
  // rest of the block its contents.
  const first = s.split('\n')[0] ?? ''
  if (/^[^.!?]{0,60}:$/.test(first.trim())) hits.push({ kind: 'title', word: first.trim(), at: first })
  // ⛔ AN AUDIT FOOTER. A parenthesised line at the end reads as provenance metadata appended by a system.
  const last = s.trim().split('\n').at(-1) ?? ''
  if (/^\(.*\)$/.test(last.trim())) hits.push({ kind: 'audit-footer', word: last.trim(), at: last })
  return hits
}

/** ⭐ Convenience: does this read as her own recollection rather than a supplied document? */
export const readsAsRecollection = (text) => findMetaReferences(text).length === 0

const boundary = (w) => {
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // ⓘ `\b` is unreliable next to `_` and `-`, so word-ish boundaries are spelled out. Case-insensitive.
  return new RegExp(`(^|[^A-Za-z0-9_-])${esc}(?=$|[^A-Za-z0-9_-])`, 'i')
}
const PATTERNS = IMPLEMENTATION_WORDS.map((w) => [w, boundary(w)])

/**
 * ⭐⭐ THE PREDICATE THE SUITE RUNS. Returns every implementation word found in something she would read.
 *
 * ⛔ Scans the WHOLE serialized payload, keys included. A leak through a key name is still a leak: she reads
 * `storedMemoriesYouCannotReadFromHere` exactly as readily as she reads a sentence, which is how "room"
 * reached four consecutive answers.
 *
 * @param {unknown} payload  anything destined for her — a context block, a tool result, a rendered prompt
 * @param {{ context?: string }} [opts] `context` from EXPLANATORY_CONTEXT exempts the payload entirely
 * @returns {Array<{word:string, at:string}>} empty when clean
 */
export function findImplementationLeaks(payload, { context = null } = {}) {
  if (context && EXPLANATORY_CONTEXT.includes(context)) return []
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? null)
  if (!text) return []
  const hits = []
  for (const [word, re] of PATTERNS) {
    const m = re.exec(text)
    if (m) {
      const at = Math.max(0, m.index - 30)
      hits.push({ word, at: text.slice(at, m.index + word.length + 30) })
    }
  }
  return hits
}

/** Convenience for a check: true when nothing of ours would reach her. */
export const isPlainSpoken = (payload, opts) => findImplementationLeaks(payload, opts).length === 0
