// ⭐⭐⭐ THE DREAMING RESOLVER — a resolver SIBLING, ⛔ not a second memory-writing system.
//
// M2.a + M2.c. PURE: no stores, no IO, no config. `matches` and the proposal are handed in.
//
// ── ⭐⭐ WHY A RESOLVER AND NOT A WRITER ─────────────────────────────────────────────────────────
// `memory-resolver-router.js` states the extension point in its own words:
//
//     "THE PIPELINE NEVER CHANGES. ONLY THE RESOLVER MAP GROWS."
//     "relationship | … → (future siblings, added to the map — nothing else changes)"
//
// ⇒ Dreaming REGISTERS a resolver. ⛔ It does not build a writer, and it does not call the store.
// ⓘ Ote, 2026-09-01: *"Dreaming gets its own resolver. Do not route Dreaming through default."*
//
// ── ⭐⭐⭐ AND RECONCILIATION STAYS IN THE MEMORY LAYER, BY CONSTRUCTION ──────────────────────────
// This file computes NO plan of its own. It hands the resolved slot's live rows and the incoming value to
// `resolveConflict` — the memory layer's own pure stage — and reports what came back.
//
//     Dreaming proposes.  The conflict stage decides.  Persistence acts.
//
// ⇒ if that plan is UPDATE, an existing row is superseded — ⭐ and that is **the memory layer deciding on
// Dreaming's proposal**, ⛔ NOT Dreaming withdrawing a memory. **O-1 is not violated.**
// ⓘ Ote ruled exactly this: *"Dreaming may propose supersession, but may never perform it itself."*
//
// ── ⛔⛔ THE DRY-RUN SAFETY BOUNDARY ─────────────────────────────────────────────────────────────
// `commit()` — the write path the router would call — **always returns IGNORE and writes nothing.**
// The plan is COMPUTED and REPORTED by `planFor()`, which is pure and persists nothing.
// ⇒ ⭐ there is no code path in this file that can write. Not "disabled" — **absent.**

import { resolveConflict, CONFLICT, WIRE_ACTION } from '@ote/memory/cognition/memory-conflict.js'
import { validateProposal, mayPublish, renderProposal } from './dreaming-proposal.js'

export { CONFLICT, WIRE_ACTION }

/** ⭐ Dreaming's observation type. ⛔ Deliberately NOT `card` — O-8 made Consolidation a separate consumer. */
export const DREAMING_TYPE = 'dreaming'

/**
 * ⭐⭐ The dry-run slot address for a proposal.
 *
 * ⚠️⚠️ THIS IS A DRY-RUN CONVENTION, ⛔ NOT A SEMANTIC DECISION. Which slot a Dreaming commitment occupies
 * is unruled; this exists so the dry run can RECALL SOMETHING SPECIFIC and report what it found. A real
 * write would need Ote's ruling on slot identity first, and this function is where that ruling would land.
 */
export function slotAddressFor(p = {}) {
  const act = p?.slots?.act ?? p?.slots?.a ?? null
  return { entity: 'sotera', attribute: act ? `dreaming:${p.form}:${act}` : `dreaming:${p.form}` }
}

/** The value a proposal asserts, for the conflict stage's comparison. ⭐ The RENDERED string — because
 *  that is what a commitment would carry, and comparing anything else would compare the wrong thing. */
export const valueOf = (p) => renderProposal(p)

/**
 * ⭐⭐⭐ planFor — RECALL → RESOLVE → PLAN, and it explains itself.
 *
 * ⛔ PURE. Computes nothing persistent. Returns the plan **plus the reasoning**, because a plan without
 * its context cannot be evaluated — which is the whole point of the dry run.
 *
 * @param {object} o
 * @param {object} o.proposal   the structured proposal
 * @param {object[]} o.matches  live rows occupying the slot, NEWEST-FIRST (the caller recalls them)
 * @param {string} o.destination 'room' | 'persona_global'
 */
export function planFor({ proposal, matches = [], destination = 'room' } = {}) {
  const valid = validateProposal(proposal)
  if (!valid.ok) {
    return { ok: false, stage: 'grammar', why: valid.why, plan: null }
  }
  const publish = mayPublish(proposal, { destination })
  if (!publish.ok) {
    // ⭐ A publication refusal is NOT a conflict outcome. It is a boundary refusal, and it is reported as
    // its own stage so a reader never mistakes "may not be published here" for "already known".
    return { ok: false, stage: 'publication', why: publish.why, forbidden: publish.forbidden ?? [], plan: null }
  }
  const value = valueOf(proposal)
  const primary = matches[0] ?? null
  const plan = resolveConflict({ matches, value })

  // ⭐⭐ THE REASONING. Derived from the same inputs the stage saw, so it cannot drift from the verdict.
  let why
  if (!primary) why = 'no live row occupies this slot — nothing to compare against'
  else if (plan.action === CONFLICT.NOOP) why = 'the current belief in this slot already says exactly this — reinforce, do not re-add'
  else if (plan.action === CONFLICT.DUPLICATE) why = `the current belief already says exactly this, and ${plan.collapse.length} duplicate row(s) occupy the same slot — reinforce and converge`
  else if (plan.action === CONFLICT.UPDATE) why = 'the slot is occupied by a DIFFERENT value — the new row supersedes it and history is kept'
  else why = `plan ${plan.action}`

  return {
    ok: true,
    stage: 'conflict',
    plan,
    wire: WIRE_ACTION[plan.action] ?? plan.action,
    why,
    rendered: value,
    recalled: {
      count: matches.length,
      // ⭐⭐ REPORT THE FIELD THE CONFLICT STAGE ACTUALLY COMPARED, and label it. `reconcilePlan`
      // compares `existing.value`; surfacing `content` instead would show a reader a field the decision
      // did not use — the "reader and test shared a lens" trap, one layer up. Both are reported.
      primary: primary
        ? { id: primary.id, comparedField: 'value', comparedValue: primary.value ?? null,
            content: primary.content ?? null, created_at: primary.created_at ?? null }
        : null,
      others: matches.slice(1).map((m) => m.id),
    },
    publication: publish.why,
  }
}

/**
 * ⭐ createDreamingResolver — the router-contract sibling.
 *
 * ⛔⛔ `commit()` ALWAYS RETURNS IGNORE AND WRITES NOTHING. This is M2.a's safety boundary, and it is
 * structural: this module imports no store and has no write path to disable.
 *
 * ⓘ Ote's ruling: *"6c maps to CONFLICT.IGNORE. Don't create a parallel Dreaming-specific vocabulary."*
 * ⇒ 6c — *sufficient but not worth committing* — is reported as the memory layer's own reserved
 * `CONFLICT.IGNORE` (*"perceived but not worth believing"*), ⛔ not as a Dreaming-only word.
 */
export function createDreamingResolver({ log = null } = {}) {
  async function commit(obs) {
    log?.debug?.({ form: obs?.form }, 'memory.dreaming: proposal received — dry run, nothing written')
    return {
      ok: true,
      action: CONFLICT.IGNORE,
      dryRun: true,
      why: 'M2 dry run — Dreaming proposes and the plan is reported; ⛔ no commitment is persisted',
    }
  }
  return { commit }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the return value. */
export const DREAMING_PROPOSES_THE_LAYER_DECIDES =
  'Dreaming registers a resolver rather than building a writer, so the plan is computed by the memory '
  + "layer's own conflict stage and executed by its persistence. If that plan supersedes an existing row, "
  + 'the memory layer decided it on Dreaming\'s proposal -- Dreaming did not withdraw anything. At this '
  + 'stage commit() always returns IGNORE and there is no write path in this module to disable.'
