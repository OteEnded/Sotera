// MEMORY COGNITION · THE TOOL-RESULT PROJECTION. Leak 1, fixed at the interface rather than with a rule.
//
// ⭐⭐⭐ THE MEASUREMENT THAT DEFINES THIS FILE. Five live runs, 2026-08-21, one ordinary question about a
// friend. The cognition block was clean every time and she still answered in our vocabulary:
//
//   V1  *"From this room, I don't have direct access to memories of Hermes"*            1 tool
//   V2  *"my memory stores are scoped to this room… this is reachability, not absence"*  4 tools
//   V3  *"It's in another room, so I need your permission… conversationHandle: a9ce46…"* 5 tools
//   V5  *"I don't see anything about Hermes in this room's records"*                     3 tools
//
// ⛔⛔ AND V2 IS THE ONE THAT SETTLES IT: her block held the real Thai exchange with Hermes, every item
// `recalled`, nothing unreachable — and she wrote *"there's data about him in your other room(s) that I
// can't see from here"*, then paraphrased the content she had just said she could not see. The cognition
// block does not override the tool payload. `recall_memory` said "0 in this room" and THAT framing won.
//
// ⭐ Ote's instruction: *"if the Memory Cognition Layer has already resolved the relevant information, the
// underlying memory tools shouldn't be allowed to inject their internal storage/access vocabulary into her
// conversational reasoning. We should solve that at the interface between the cognition layer and the
// tools, not by adding another L1 instruction telling her not to say 'room'."*
//
// ── ⛔ WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────────
//   · NOT suppression of the tools. She may still look as deep as she likes — the depth ceiling Ote
//     rejected stays rejected, and V3 got the BEST answer of the five while calling the MOST tools. Tool
//     count was never the objective.
//   · NOT deletion of information. The searched-set quantifier is load-bearing — it exists because she once
//     answered a flat *"No."* about a store she had not searched — so every count, every "what was not
//     searched", every availability and every warrant survives. What changes is the WORDS.
//   · NOT applied to the record. Only the MODEL-FACING copy is projected. The UI stream, the persisted
//     segments and the audit trail keep the raw payload, because that is Ote's evidence and mine.

import { findImplementationLeaks } from './memory-cognition-vocabulary.js'

/**
 * ⭐ THE TOOLS WHOSE RESULTS TALK ABOUT STORAGE. Only these are projected: a web search or a todo list has
 * no internal vocabulary to leak, and touching them would be scope creep with a blast radius.
 */
export const PROJECTED_TOOLS = Object.freeze(new Set([
  'recall_memory', 'recall_own_memory', 'recall_own_history', 'list_memories', 'list_archived_memories',
  'search_conversations', 'inspect_around', 'recall_memory_source', 'recall_lessons', 'recall_intention',
  'request_room_access',
]))

/**
 * ⛔ KEYS WHOSE VALUE IS PURE ARCHITECTURE TUITION. These are the sentences that TAUGHT her the words —
 * *"This is the ROOM you are in. A room is a context this person uses you for. What is stored in a room
 * stays in that room."* — and they carry no fact she needs.
 * ⚠️ Their INFORMATION is preserved by the renames below (counts, extents, what was not searched). Dropping
 * the prose is not dropping the meaning.
 */
const DROP_KEYS = new Set([
  'note', 'howToReadThis', 'howToReadThese', 'whatTheNumberMeans', 'grain', 'ifEmpty',
])

/**
 * ⭐ RENAMES. The left side is a key she reads; the right side says the same thing in words a person uses.
 * ⓘ `storedMemoriesYouCannotReadFromHere` is the clearest case: the fact (how many are out of reach) is
 * exactly as informative under a name that does not contain a container.
 */
const RENAME_KEYS = new Map(Object.entries({
  storedMemoriesYouCannotReadFromHere: 'thingsICannotReachFromHere',
  otherRoomsOfThisPerson: 'otherPlacesWeHaveTalked',
  roomsElsewhere: 'otherPlacesWithMatches',
  matchedElsewhere: 'matchesElsewhere',
  matchedHere: 'matchesHere',
  conversationHandle: 'conversationRef',
  room: 'here',
  rooms: 'reach',
  room_name: 'whoseSpace',
  scope: 'extent',
  provenance: 'whereThisCameFrom',
  didNotSearch: 'notLookedAt',
  searched: 'lookedAt',
  notSearched: 'notLookedAt',
  elsewhere: 'beyondHere',
  storedMemories: 'thingsKept',
}))

/**
 * ⭐ TERM REWRITES INSIDE STRING VALUES, longest-first so *"memory stores"* is rewritten before *"store"*.
 * ⛔ Ordered and explicit rather than clever: a regex that guessed would change meanings we depend on.
 */
const TERMS = [
  [/\bnot room-scoped\b/gi, 'the same wherever I am'],
  [/\broom-scoped\b/gi, 'tied to where it happened'],
  [/\bmemory stores?\b/gi, 'what I have kept'],
  [/\bdurable memor(y|ies)\b/gi, 'what I have kept'],
  [/\bepisodic memor(y|ies)\b/gi, 'things I remember happening'],
  [/\bstored memor(y|ies)\b/gi, 'things I have kept'],
  [/\bin (this|that) room\b/gi, 'here'],
  [/\b(?:from|of) (?:this|that) room\b/gi, 'from here'],
  [/\banother room\b/gi, 'somewhere else'],
  [/\bother rooms?\b/gi, 'other places we have talked'],
  [/\bthe ROOM\b/g, 'here'],
  [/\brooms?\b/gi, 'places we have talked'],
  [/\bscoped to\b/gi, 'only covers'],
  [/\bscope\b/gi, 'extent'],
  [/\bauthoriz(ed|ation)\b/gi, 'allowed'],
  [/\bpermission\b/gi, 'being allowed'],
  [/\bdisclosure\b/gi, 'being shown'],
  [/\bgrant(ed)?\b/gi, 'allowed'],
  [/\bunreachability\b/gi, 'being out of my reach'],
  [/\breachability\b/gi, 'whether I can reach it'],
  [/\brequest_room_access\b/gi, 'asking to see it'],
  [/\binspect_around\b/gi, 'looking at what surrounds it'],
  [/\brecall_own_history\b/gi, 'looking back over what I have said'],
  [/\brecall_memory\b/gi, 'looking through what I have kept'],
  [/\blist_memories\b/gi, 'listing what I have kept'],
  [/\bsearch_conversations\b/gi, 'searching what we have said'],
  [/\bremember_fact\b/gi, 'keeping a fact'],
  [/\bthe store\b/gi, 'what I have kept'],
  [/\bstores?\b/gi, 'what I have kept'],
]

const rewriteString = (s) => {
  let out = String(s)
  for (const [re, to] of TERMS) out = out.replace(re, to)
  return out
}

// ══ ⭐⭐⭐ STEP A · A TOOL RESULT STATES ITS OWN SCOPE ══════════════════════════════════════════════
//
// RFC §3D, ratified 2026-08-23: *"Retrieval is evidence. Cognition is interpretation."* A tool's
// *"nothing in this room"* is a TRUE fact about one query over one population; the inference *"therefore I
// have no memories of Hermes"* belongs to cognition, which holds the other populations.
//
// ⭐⭐ THE MEASUREMENT THIS ACTS ON — the 2×2, 2026-08-23. With tools as the only source she asserted a
// global absence in **both** languages; with the block as the only source she recalled real episodes in
// **both**. ⇒ the denial tracked the ARM, not the language. What the payload was missing is not politeness,
// it is **the scope of its own answer**.
//
// ⭐⭐⭐ AND THE MECHANISM IS GRAMMAR, NOT PERSUASION. *"found nothing"* can be read as "nothing anywhere";
// *"found nothing **there**"* cannot. The sentence names the population it looked at and reports what it
// found **in that population**, which is exactly and only what the tool is entitled to say.
//
// ⛔ WHAT THIS IS NOT:
//   · NOT "making the tool sound better" — Ote named that as the wrong level of the stack. The test is
//     whether the SCOPE is stated, never whether the sentence reads more nicely.
//   · NOT hiding or dropping anything. The sentence is PREPENDED; every count, list and field survives
//     underneath it, and the raw payload still goes to the stream, the segments and the audit.
//   · NOT a claim about what exists elsewhere. The tool does not know, so it does not say. ⛔ Adding
//     "…but there may be more elsewhere" would be cognition's job done badly by the wrong layer.
//   · NOT a nudge toward fewer tool calls. Ote, twice: *"do not optimize for fewer tool calls."*

/**
 * ⭐ WHAT EACH TOOL ACTUALLY LOOKED AT, in her words — the KIND of material, ⛔ never a container.
 * ⓘ Absent from this map ⇒ no sentence is emitted. A population we cannot name honestly is one we must not
 * describe, and a guessed scope would be worse than none.
 */
export const POPULATION = new Map(Object.entries({
  recall_memory: 'the things I have kept',
  recall_own_memory: 'the things I have kept about myself',
  list_memories: 'the things I have kept',
  list_archived_memories: 'the things I have set aside',
  recall_own_history: 'my own past conversations',
  search_conversations: 'the conversations I can look back over',
  recall_lessons: 'what I have learned about how I work',
  recall_intention: 'what I have been meaning to do',
}))

/** Array fields a read may return its results in. ⓘ Order is irrelevant; the first present one wins. */
const RESULT_ARRAYS = ['matches', 'memories', 'items', 'results', 'lessons', 'intentions', 'evidence']

/**
 * How many things this result actually contains, or **null when it cannot be determined**.
 * ⛔ NULL IS THE IMPORTANT RETURN. A shape we do not recognise gets no sentence rather than a guessed one —
 * the same discipline as `ownerOf` returning `unknown`: fail to silence, never to a confident wrong answer.
 * ⓘ `count` is trusted over `array.length` when present, because a read can be paged: `list` caps at 1000
 * and a length taken from a truncated page would say "3" about a set of 3000.
 */
function foundCount(v) {
  if (!v || typeof v !== 'object') return null
  if (typeof v.count === 'number') return v.count
  for (const k of RESULT_ARRAYS) if (Array.isArray(v[k])) return v[k].length
  return null
}

/** ⓘ Spoken counts, matching the cognition renderer. Beyond twelve a numeral is what a person would say. */
const WORDS = ['nothing', 'one thing', 'two things', 'three things', 'four things', 'five things',
  'six things', 'seven things', 'eight things', 'nine things', 'ten things', 'eleven things', 'twelve things']
const spokenCount = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : `${n} things`)

/**
 * ⭐⭐⭐ THE SENTENCE. Derived entirely from the tool name, the query it was given and the count it
 * returned — ⛔ nothing invented, nothing inferred.
 *
 * @returns {string|null} null when the population or the count cannot be established honestly.
 */
export function scopeSentence(toolName, value, { query = null } = {}) {
  const among = POPULATION.get(toolName)
  if (!among) return null
  const n = foundCount(value)
  if (n === null) return null
  const about = typeof query === 'string' && query.trim() ? ` for ${query.trim()}` : ''
  // ⭐ "there" is the load-bearing word, and it is doing grammatical work rather than rhetorical work:
  // it binds the finding to the population named in the same sentence.
  return `I looked through ${among}${about} and found ${spokenCount(n)} there.`
}

/**
 * ⭐ Pull the human-meaningful part of a tool's arguments, for the sentence. PURE.
 * ⛔ Only the query text — never a limit, an id, a handle or a flag, because those are machinery and this
 * string is read by her.
 */
export function queryOf(args) {
  let a = args
  if (typeof a === 'string') { try { a = JSON.parse(a) } catch { return null } }
  if (!a || typeof a !== 'object') return null
  for (const k of ['query', 'q', 'text', 'about', 'subject', 'entity', 'search']) {
    const v = a[k]
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80)
  }
  return null
}

/**
 * ⭐⭐ PROJECT ONE TOOL RESULT INTO PLAIN SPEECH. Pure; returns a new structure.
 *
 * ⛔ Recursive over keys AND values, because she reads a key as readily as a sentence — which is how
 * `storedMemoriesYouCannotReadFromHere` taught her in the first place.
 */
export function projectForModel(toolName, value, { query = null } = {}) {
  if (!PROJECTED_TOOLS.has(toolName)) return value
  const walk = (v) => {
    if (v === null || v === undefined) return v
    if (typeof v === 'string') return rewriteString(v)
    if (Array.isArray(v)) return v.map(walk)
    if (typeof v !== 'object') return v
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      if (DROP_KEYS.has(k)) continue
      const key = RENAME_KEYS.get(k) ?? rewriteString(k)
      out[key] = walk(val)
    }
    return out
  }
  const projected = walk(value)
  // ⭐⭐⭐ STEP A · THE SCOPE SENTENCE GOES FIRST, because key order is reading order. `count: 0` two lines
  // down is a number; a sentence above it that names what was looked through is the frame the number lands
  // in. ⛔ Prepended, never substituted — everything the payload carried is still underneath.
  const said = scopeSentence(toolName, projected, { query })
  if (said && projected && typeof projected === 'object' && !Array.isArray(projected)) {
    return { thisLook: said, ...projected }
  }
  return projected
}

/**
 * ⭐⭐⭐ THE ENTRY POINT THE ROUTE CALLS. Takes the serialised result she would have read and returns the
 * one she will read.
 *
 * @param {string} toolName
 * @param {string} json      the raw serialised tool result
 * @param {{ enabled?: boolean, onLeak?: (words: string[]) => void }} [opts]
 * @returns {string} the projected serialisation, or the original when projection does not apply
 */
export function plainSpokenToolResult(toolName, json, { enabled = true, onLeak = null, args = null } = {}) {
  if (!enabled || !PROJECTED_TOOLS.has(toolName) || typeof json !== 'string' || !json.length) return json
  let parsed
  try { parsed = JSON.parse(json) } catch {
    // ⓘ A non-JSON result is prose the tool wrote. Still rewrite the terms — that is where the words are.
    return rewriteString(json)
  }
  const projected = projectForModel(toolName, parsed, { query: queryOf(args) })
  let out
  try { out = JSON.stringify(projected) } catch { return json }
  // ⚠️ REPORT WHAT STILL GOT THROUGH RATHER THAN CLAIMING SUCCESS. A term list catches only what it was
  // told about, which is this repo's most-repeated defect; the residue is measured, not assumed to be zero.
  if (onLeak) {
    const left = findImplementationLeaks(out).map((l) => l.word)
    if (left.length) onLeak(left)
  }
  return out
}

// ══ ⭐⭐⭐ C2 · A TOOL RESULT ARRIVES AS EVIDENCE, BESIDE WHAT SHE IS ALREADY HOLDING ════════════════
//
// Ote: *"tools → evidence → cognition → working memory → Sotera → answer. The tool result should no longer
// compete with the cognition block as a second source of truth. It should become evidence that cognition can
// inspect, reconcile, question, and incorporate into working memory. If the tool says 'nothing in X', that
// remains a fact about X — it must not silently become 'nothing exists.'"*
//
// ⭐ STEP A gave the result its own SCOPE. C2 gives it its RELATION to the reconciled set — which is the
// half that stops it standing alone. ⛔ And the relation is ARITHMETIC, not interpretation: it is derived
// from two counts and makes no judgement about what either means.
//
// ⛔ NOTHING IS REMOVED. The projected payload follows underneath, and the raw payload still goes to the
// stream, the segments and the audit. ⛔ No claim about what exists elsewhere is added — the tool does not
// know, and cognition already said what it could reach.

/**
 * ⭐⭐ ONE SENTENCE PLACING THIS LOOK BESIDE THE HOLD. Returns null when there is nothing to relate to.
 *
 * @param {{found:number|null}} evidence    what this look returned
 * @param {{recollections:number, openQuestions:number}} holding  what the hold already contains
 */
export function relateToHold(evidence, holding) {
  const held = Number(holding?.recollections) || 0
  // ── ⭐⭐⭐ THE ONE RELATION THAT HOLDS AT **ANY** COUNT · A LOOK CANNOT UNDO A PARTICIPATION FACT ────
  //
  // ⭐ Ote, 2026-08-25, and this implements exactly that sentence: *"An empty result from one memory query
  // must not override positive evidence from another Sotera-owned source… memory query = evidence about one
  // population; relationship/history retrieval = evidence about continuity."*
  //
  // ⚠️⚠️ MEASURED THE SAME DAY, and the failure was worse than a false absence. With the extent in the
  // cognitive block but NOT beside the tool payload, `recall_memory` returned its room-scoped `reach`
  // framing, she wrote *"the things I've kept … aren't reachable … it's out of reach in this room"*, and
  // then handed the relationship to the person asking: **"I know you've had 185 conversations with her."**
  // ⇒ she did not disbelieve the number; she could not reconcile it with being told she could not reach
  // any of it, so she reassigned its OWNER. A fact she cannot own reads as somebody else's.
  //
  // ⛔ THIS IS NOT A PRECEDENCE RULE AND IT ADJUDICATES NOTHING. Both statements stay true and both are
  // still shown: the tool looked through what she has KEPT, and the count of conversations she has HAD is
  // a different population that no memory read observed. ⭐ It is the same arithmetic the zero-branch below
  // already uses — a look into P says nothing about Q — applied to a population whose size is known.
  // ⛔ AND IT HIDES NOTHING: the payload follows underneath, unaltered, and the raw result still goes to the
  // stream, the segments and the audit. Ote ruled that out in advance — *"I also don't want this solved by
  // simply hiding tool output."*
  // ⓘ The clauses arrive PRE-RENDERED from the cognition layer, in the conversation's language, because the
  // month table lives there. This module interpolates a string it was handed and formats nothing.
  const continuity = (Array.isArray(holding?.continuity) ? holding.continuity : [])
    .filter((s) => typeof s === 'string' && s.trim())
  if (continuity.length) {
    // ⚠️ POPULATION-AGNOSTIC ON PURPOSE. The first version opened *"That was one look at what I have
    // kept"* — which is a claim about WHICH population was looked at, and it was already wrong the first
    // time it fired beside `recall_intention`. ⭐ `thisLook` (step A) names the population; this sentence
    // may only say that the look was ONE look, which is true of every look there is.
    return `That was one look, and it does not change my own history. ${continuity.join(' ')}`
  }
  if (!held) return null // ⛔ nothing to relate to; the scope sentence already stands on its own
  const found = Number.isFinite(evidence?.found) ? evidence.found : null
  if (found === null) return null // ⛔ unknown count ⇒ no arithmetic, so no sentence
  // ⓘ Spelled, like every other count the layer speaks — *"five things"* is speech, *"5 things"* is a report.
  const already = spokenCount(held)
  // ⭐ THE LOAD-BEARING CASE. An empty look next to a non-empty hold used to read as "nothing"; now it reads
  // as one look that changed nothing — which is exactly what it was. ⓘ Pure arithmetic: zero found, so
  // nothing added, whatever the query was about.
  if (found === 0) return `That was one look, and it does not change the ${already} I can already reach.`
  // ⛔⛔ AND THERE IS NO POSITIVE BRANCH, WHICH IS A CORRECTION TO MY OWN FIRST VERSION.
  //
  // ⚠️⚠️ IT SAID *"That adds to the six things I can already reach."* — and the live run showed what that
  // means in practice: `recall_memory` for "Hermes" returned THREE rows that were an interaction preference,
  // a physical state and a current goal. **None of them about Hermes.** The tool is a nearest-neighbour index
  // with no relevance floor (the floor lives in cognition), so its count is "how many rows came back", never
  // "how many are about this".
  // ⇒ ⭐ *"It does not change what I can reach"* is ARITHMETIC and survives that. *"It adds to what I can
  // reach"* is a claim that the results are RELEVANT — which this layer cannot know and the tool cannot
  // assess. ⛔ So it is not made.
  // ⚠️ And Ote named this hazard in advance: *"I don't want Working Memory to inherit or hide that
  // [relevance] defect."* The first version did worse than hide it — it amplified it.
  return null
}

/**
 * ⭐⭐⭐ THE C2 ENTRY POINT. Wraps `plainSpokenToolResult` and adds the relation line.
 *
 * ⛔ Shape-preserving and additive: `thisLook` (step A) then `alongside` (C2) then the payload. A reader that
 * only understood the payload still gets the payload.
 * ⓘ `holding` is supplied by the caller from the cognitive hold's snapshot, so this stays PURE and cannot
 * reach into the hold itself.
 */
export function evidenceForModel(toolName, json, { enabled = true, onLeak = null, args = null, holding = null } = {}) {
  const projected = plainSpokenToolResult(toolName, json, { enabled, onLeak, args })
  // ⛔⛔ ONLY TOOLS WHOSE POPULATION WE CAN NAME, and this bug was caught by its own test: a `web_search`
  // result came back carrying *"that does not change the five things I can already reach"*. That is a
  // CATEGORY ERROR — a web search is not a look into her memory — and it is exactly the scope creep this
  // module's header warns about. ⇒ gate on `POPULATION`, which is the same list that licenses a scope
  // sentence, so the two can never disagree about which tools this layer speaks for.
  if (!POPULATION.has(toolName)) return projected
  if (!enabled || !holding || typeof projected !== 'string' || !projected.startsWith('{')) return projected
  let parsed
  try { parsed = JSON.parse(projected) } catch { return projected }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return projected
  const said = relateToHold({ found: foundCount(parsed) }, holding)
  if (!said) return projected
  // ⭐ `thisLook` first (what this look covered), then `alongside` (how it sits) — reading order is the
  // order the two facts have to be understood in.
  const { thisLook, ...rest } = parsed
  const out = thisLook ? { thisLook, alongside: said, ...rest } : { alongside: said, ...rest }
  try { return JSON.stringify(out) } catch { return projected }
}

/** ⭐ The population a tool looked at, in her words — or null when we cannot name it honestly. */
export const populationOf = (toolName) => POPULATION.get(toolName) ?? null

/**
 * ⭐ How many things a SERIALISED tool result contains, or null. ⛔ Null is the important return: an
 * unrecognised shape gets no count rather than a guessed zero, because "I do not know how many" and "none"
 * are different facts and conflating them would manufacture an absence.
 */
export function countFromToolResult(json) {
  if (typeof json !== 'string' || !json.startsWith('{')) return null
  try { return foundCount(JSON.parse(json)) } catch { return null }
}
