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

/**
 * ⭐⭐ PROJECT ONE TOOL RESULT INTO PLAIN SPEECH. Pure; returns a new structure.
 *
 * ⛔ Recursive over keys AND values, because she reads a key as readily as a sentence — which is how
 * `storedMemoriesYouCannotReadFromHere` taught her in the first place.
 */
export function projectForModel(toolName, value) {
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
  return walk(value)
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
export function plainSpokenToolResult(toolName, json, { enabled = true, onLeak = null } = {}) {
  if (!enabled || !PROJECTED_TOOLS.has(toolName) || typeof json !== 'string' || !json.length) return json
  let parsed
  try { parsed = JSON.parse(json) } catch {
    // ⓘ A non-JSON result is prose the tool wrote. Still rewrite the terms — that is where the words are.
    return rewriteString(json)
  }
  const projected = projectForModel(toolName, parsed)
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
