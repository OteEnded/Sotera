// Persona Memory V3 — the OBSERVATION type (RFC_MEMORY_SLOT_RESOLVER §3/§4). Phase 2.
//
// An Observation is ONE perceived claim, from ANY source: a chat turn, the model's own memory tool, an
// auto-extractor, a document, vision, a sensor, or Reflection re-reading what we already know. Making
// it the single input abstraction is what lets every future observer join the pipeline without a
// parallel path or a special case — "here's an observation" is the whole contract.
//
// This module is the output contract of INTERPRETATION (the stage that decides TYPE + intent) and the
// input to Normalization → Owner → Resolution → Conflict → Persistence. PURE: no db, no embedder, no
// side effects, so the pipeline's shape is unit-testable on its own.

import { identityAttributeOf } from './memory-identity.js'

// The observation TYPE — decided by Interpretation, and what the Resolver Router keys on (Phase 3).
// `fact` is the honest v1 catch-all: the generic extractor produces durable facts WITHOUT discriminating
// preference/biography/relationship yet. Typing them properly is a later Interpretation upgrade; until
// then `fact` routes exactly like a preference (to the Slot Resolver).
export const OBSERVATION_TYPE = {
  identity: 'identity', // name / preferredName / pronouns / title — the reserved identity namespace
  preference: 'preference',
  biography: 'biography',
  relationship: 'relationship',
  episodic: 'episodic',
  // a CONSOLIDATED topic summary proposed by Dreaming/Reflection (RFC §14): prose PLUS the evidence it
  // summarises, with supersede-the-prior-card semantics. Its own shape, so its own resolver.
  card: 'card',
  fact: 'fact', // untyped durable fact (generic extractor / remember_fact) — resolves like a preference
}
const TYPES = new Set(Object.values(OBSERVATION_TYPE))

// INTENT — what the observation is DOING (RFC §7's adoption policy reads this):
//   assert         = stating something ("I'm Claude", "my favorite word is sonder")  → discovery
//   prefer-address = asking to be addressed differently ("call me Jack")             → preference
//   update/correct = explicitly revising a previous claim
//   forget         = asking us to drop it
export const OBSERVATION_INTENT = { assert: 'assert', preferAddress: 'prefer-address', update: 'update', correct: 'correct', forget: 'forget' }

const str = (v, max) => {
  const s = (v == null ? '' : String(v)).trim()
  return max && s.length > max ? s.slice(0, max) : s
}
const clamp = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null)
const MAX_PROSE = 4000 // a summary/story body; longer belongs in an evidence store, not a memory
const MAX_MEMBERS = 500 // evidence ids on one card
const MAX_VALUE = 400 // an atomic fact's value

// The canonical "this claim is about the account holder" vocabulary. Lives here (observation semantics)
// so Interpretation and the store's Owner Resolution share ONE definition. The store additionally folds
// in the account's own username/display name, which only it knows.
export const SELF_ENTITY = 'user'
export const SELF_OWNER_ALIASES = new Set(['', 'user', 'me', 'i', 'myself', 'self', 'the user', 'current user', 'my'])
const isSelfOwner = (owner) => SELF_OWNER_ALIASES.has(String(owner ?? '').trim().toLowerCase())

// Semantic slot types — the family a mis-typed identity claim can be UPGRADED from. Episodic prose is
// deliberately excluded (it has no slot to speak of), and an already-identity observation stays identity.
const UPGRADEABLE = new Set([OBSERVATION_TYPE.fact, OBSERVATION_TYPE.preference, OBSERVATION_TYPE.biography, OBSERVATION_TYPE.relationship])

/**
 * makeObservation — construct + validate one observation. Returns null when it can't be a usable claim
 * (no attribute, or no value), so a bad extraction is DROPPED at the top of the pipeline rather than
 * throwing mid-write. Never throws.
 *
 * @param {object} o
 * @param {string} [o.type]     OBSERVATION_TYPE — defaults to `fact` (untyped durable fact)
 * @param {string} [o.owner]    RAW owner label as perceived ("user", "me", "agent_dev", "Rex"); Owner
 *                              Resolution canonicalizes it later. Empty/absent = the authenticated user.
 * @param {string} o.attribute  what property this claim is about, AS STATED
 * @param {*}      o.value      the claim's value
 * @param {string} [o.intent]   OBSERVATION_INTENT — defaults to `assert`
 * @param {number} [o.confidence] 0..1 how sure the observer is (identity thresholds on this)
 * @param {number} [o.importance] 1..10
 * @param {string} [o.source]   the WRITER: 'model-tool' | 'auto-extractor' | 'reflection' | 'vision' …
 * @param {string} [o.namespace]
 * @param {string} [o.sourceMessageId] provenance
 * @param {object} [o.context]  free-form observer context (never interpreted by the pipeline)
 * @returns {object|null}
 */
export function makeObservation(o = {}) {
  let type = TYPES.has(o.type) ? o.type : (o.content != null && o.attribute == null ? OBSERVATION_TYPE.episodic : OBSERVATION_TYPE.fact)
  const intent = Object.values(OBSERVATION_INTENT).includes(o.intent) ? o.intent : OBSERVATION_INTENT.assert
  const owner = str(o.owner, 80)

  // POLYMORPHIC SHAPES (§14.1). An observation's REQUIRED fields depend on its type, because different
  // kinds of claim are genuinely different shapes — not because episodic is a special case:
  //   EpisodicObservation  { content }          — prose; there is no slot to fill (a dream summary, a story)
  //   Identity/Fact/…      { attribute, value } — slot-shaped
  // Each resolver knows how to interpret its own shape. Anything malformed is DROPPED here (returns null).
  // Fields EVERY shape carries, in one place — so adding a shape can't quietly drop provenance or clamps.
  const common = {
    type,
    owner,
    intent,
    confidence: clamp(o.confidence, 0, 1),
    importance: Number.isFinite(o.importance) ? Math.max(1, Math.min(10, Math.round(o.importance))) : null,
    source: o.source ? str(o.source, 120) : null,
    namespace: o.namespace ? str(o.namespace, 80) : null,
    sourceMessageId: o.sourceMessageId ?? null,
    context: o.context ?? null,
  }

  if (type === OBSERVATION_TYPE.episodic) {
    const content = str(o.content ?? o.value, MAX_PROSE)
    if (!content) return null
    return {
      ...common,
      content,
      attribute: null,
      value: null,
      // PERSISTENCE HINT (like `namespace`): which storage tier this prose belongs in —
      // 'semantic' (a durable prose claim) | 'episodic' (an event) | 'identity' (persona-GLOBAL, a
      // different scope axis entirely). Null → the store's own default. It is NOT the observation type:
      // the type describes the claim's SHAPE (prose), the kind describes where it lands.
      kind: o.kind ? str(o.kind, 40) : null,
    }
  }

  // CardObservation — a consolidated summary + the evidence it rests on. Dreaming proposes it; the
  // CardResolver decides which existing card (if any) it supersedes and Persistence executes.
  if (type === OBSERVATION_TYPE.card) {
    const topic = str(o.topic, 120)
    const summary = str(o.summary ?? o.content, MAX_PROSE)
    if (!topic || !summary) return null
    return {
      ...common,
      topic,
      content: summary,
      attribute: null,
      value: null,
      memberIds: Array.isArray(o.memberIds) ? o.memberIds.filter(Boolean).slice(0, MAX_MEMBERS) : [],
    }
  }

  let attribute = str(o.attribute, 80)
  if (!attribute) return null
  const rawValue = o.value
  if (rawValue == null || (typeof rawValue === 'string' && !rawValue.trim())) return null

  // IDENTITY IS ROUTED BY SEMANTICS, NOT BY ORIGIN (Phase 5.5). Whoever produced this claim, if it is
  // about the account holder AND names an identity attribute, it becomes an IDENTITY observation here —
  // before Resolution — and its attribute is canonicalized onto the single identity slot. So the model's
  // remember_fact("name"), the extractor, Reflection and any future producer all converge on the
  // IdentityResolver instead of quietly minting a parallel generic slot.
  if (isSelfOwner(owner) && (UPGRADEABLE.has(type) || type === OBSERVATION_TYPE.identity)) {
    const canonical = identityAttributeOf(attribute)
    if (canonical) {
      type = OBSERVATION_TYPE.identity
      attribute = canonical
    }
  }
  return {
    ...common,
    type, // may have been UPGRADED to identity just above, so it overrides `common`
    // owner '' = the authenticated user (Owner Resolution collapses self-labels)
    attribute,
    value: typeof rawValue === 'string' ? str(rawValue, MAX_VALUE) : rawValue,
  }
}

/** True if `o` looks like a constructed observation of ANY shape (cheap guard for stage inputs). */
export function isObservation(o) {
  if (!o || typeof o !== 'object' || !TYPES.has(o.type)) return false
  if (o.type === OBSERVATION_TYPE.episodic) return !!o.content
  if (o.type === OBSERVATION_TYPE.card) return !!o.topic && !!o.content
  return !!o.attribute && o.value != null
}
