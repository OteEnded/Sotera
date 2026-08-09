// Persona Memory V3 — the CONFLICT RESOLVER (RFC_MEMORY_SLOT_RESOLVER §9). Phase 4.
//
// Given a resolved slot's current live row(s) and an incoming value, decide HOW the new claim relates to
// what we already believe — and return a semantic PLAN. Persistence then just executes it. That split is
// the point: this stage is epistemology (is this correcting me? replacing history? a contradiction? a
// second value? should someone confirm?), not storage.
//
// PHASE 4 SCOPE (Ote: "extract today's logic. Don't make it smarter yet."): v1 emits exactly the four
// outcomes the store already produced — NEW · NOOP · DUPLICATE · UPDATE. The rest of the vocabulary is
// RESERVED here so the shape is known and later stages have somewhere to land:
//   CONTRADICTION  conflicting claims — flag / keep both at lower confidence
//   VERSION        bi-temporal history rather than supersede
//   APPEND         a genuinely multi-valued slot ("also speaks French")
//   IGNORE         perceived but not worth believing
//   DEFER          decline to decide now — hand to Reflection
//   ASK / CONFIRM  needs a human yes → a held-turn ask_user (identity address-changes are the first
//                  consumer; the Identity Resolver's `defer` is this vocabulary's sibling today and
//                  unifies here when ASK is wired)
//
// PURE: no db, no embedder, no writes. `reconcilePlan` (the original add/noop/update primitive) stays the
// value-comparison seed underneath.

import { reconcilePlan } from './memory-extract.js'

/** The plan vocabulary. v1 emits the first four; the rest are reserved (see the header). */
export const CONFLICT = {
  NEW: 'new',
  NOOP: 'noop',
  DUPLICATE: 'duplicate',
  UPDATE: 'update',
  CONTRADICTION: 'contradiction',
  VERSION: 'version',
  APPEND: 'append',
  IGNORE: 'ignore',
  DEFER: 'defer',
  ASK: 'ask',
}

// WIRE names: what callers, tool results and the eval harness have always seen. The internal vocabulary
// is the RFC's; the reported action stays stable so extracting this stage changes no observable output.
export const WIRE_ACTION = { [CONFLICT.NEW]: 'add', [CONFLICT.NOOP]: 'noop', [CONFLICT.DUPLICATE]: 'collapse', [CONFLICT.UPDATE]: 'update' }

const plan = (action, o = {}) => ({
  action,
  target: o.target ?? null, // the primary live row this plan concerns
  write: !!o.write, // Persistence must create a new row
  reinforce: !!o.reinforce, // Persistence must bump usage on `target` instead
  supersedes: o.supersedes ?? null, // the new row supersedes this one (and it gets invalidated)
  collapse: o.collapse ?? [], // duplicate live rows in the same slot → invalidate (slot self-heals)
})

/**
 * resolveConflict — the stage. PURE.
 * @param {object}   input
 * @param {object[]} input.matches  ALL live rows occupying the resolved slot, NEWEST-FIRST (so
 *                                  matches[0] is the current belief and the rest are duplicates that
 *                                  slipped in — a race, or an older double-writer).
 * @param {*}        input.value    the incoming value
 * @param {string}   [input.intent] the observation's intent (reserved: drives CORRECT/FORGET later)
 * @returns {{action:string, target:string|null, write:boolean, reinforce:boolean, supersedes:string|null, collapse:string[]}}
 */
export function resolveConflict({ matches = [], value, intent = null } = {}) {
  const primary = matches[0] || null
  const extras = matches.slice(1).map((r) => r.id)

  // nothing in this slot yet → a new belief
  if (!primary) return plan(CONFLICT.NEW, { write: true })

  // same value: reinforce what we believe (repetition IS a signal), and converge the slot to ONE live
  // row if duplicates exist. DUPLICATE is reported as the legacy 'collapse'.
  if (reconcilePlan(primary, value).action === 'noop') {
    return plan(extras.length ? CONFLICT.DUPLICATE : CONFLICT.NOOP, { target: primary.id, reinforce: true, collapse: extras })
  }

  // value changed → the new row supersedes the current belief (history kept via supersedes_id +
  // invalid_at), and any duplicates collapse in the same write.
  return plan(CONFLICT.UPDATE, { target: primary.id, write: true, supersedes: primary.id, collapse: extras })
}
