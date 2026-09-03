// ⭐⭐⭐ THE WRITE RECEIPT — a QUEUED write becomes an OBSERVED outcome. PURE.
//
// No store, no IO, no config, no model. It owns exactly three things, and owning all three in ONE place
// is the point: **the bound, the vocabulary, and the wait**.
//
// ── ⚠️⚠️ WHAT THIS EXISTS TO END, MEASURED TWICE ───────────────────────────────────────────────────
//  · 2026-09-03 · `keep()` returned `{ok:true, queued:true}` while the M2 gate REFUSED the write on the
//    first governed slot. Nothing was written — ⛔ and the model, `effected()` and every retention-rate
//    figure built on that column were told the retention happened.
//  · 2026-09-03 · the model's own `remember_fact` serialised a KEPT fact and a REFUSED one
//    BYTE-IDENTICALLY: `{"ok":true,"queued":true,"settled":{}}`. ⭐ A Promise flattens to an empty
//    object, so the payload carried a field that LOOKS like data and holds none.
//
// ── ⭐⭐⭐ THE CONTRACT, RATIFIED 2026-09-04 ────────────────────────────────────────────────────────
//     persisted   ok: true    a real row id
//     refused     ok: false   ⛔ no id
//     accepted    ok: false   ⛔ no id — ⚠️ and THE OPERATION MAY STILL COMPLETE LATER
//
// ⛔⛔ **STATE IS AUTHORITATIVE.** Ote: *"`ok:false` means 'not successfully completed/known', NOT
// specifically 'refused'; consumers must inspect `state`."* ⇒ a consumer that branches on `ok` alone
// cannot tell a refusal from a timeout, and those have opposite remedies.
//
// ── ⭐⭐ AND WHY THE BOUND LIVES HERE RATHER THAN IN `@ote/memory` ──────────────────────────────────
// Ote: *"Do not put the bound into `@ote/memory`."* The package owns the tool handler; the HOST owns the
// shared serial write lane and everything the bound depends on. ⇒ the package awaits a promise that
// ALWAYS settles and knows no number — bounded by construction, ⛔ never by agreement.
//
// ⚠️ THE BOUND IS NOT OPTIONAL. The lane is shared and serial per (persona, user), so a wait inherits
// whatever is queued ahead of it. On 2026-08-26 a write took **60 seconds** because 59 CPU-placed aux
// calls had starved the embedder.

/**
 * ⭐ THE SINGLE BOUND. Ote, 2026-09-04: *"RETAIN_WAIT_MS remains the single bound… One wait → one bound
 * is preferable to introducing two independent timeout constants."*
 *
 * ⓘ The NAME outlived its origin — it began as `retain()`'s wait and now bounds every queued write. It is
 * kept verbatim because it is the name Ote locked and the one a reader will grep for; ⛔ renaming it would
 * buy accuracy at the cost of the only thing a constant's name is really for.
 *
 * ⓘ Sized against the work it waits on: a CPU embed is ~1–2 s and the reconcile adds a little. Measured
 * over 329 real `retain` calls on this lane: p50 8 ms, p95 23 ms, worst 2 288 ms — ⭐ never near it.
 */
export const RETAIN_WAIT_MS = 20000

/** ⭐ A private sentinel, so a timeout can never be confused with a value the write returned. */
const TIMEOUT = Symbol('write-receipt-timeout')

/**
 * ⭐⭐⭐ THE RECEIPT STATES — ⛔ NOT a new vocabulary. These are exactly the strings `retain()` has
 * recorded since 2026-09-02, declared once instead of retyped as literals at each site.
 * ⭐ A check can now assert against the declaration rather than against a string it spelled itself.
 */
export const RETENTION_STATE = Object.freeze({
  persisted: 'persisted',
  refused: 'refused',
  accepted: 'accepted',
  unrepresented: 'unrepresented',
  declined: 'declined',
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ⭐ A row id, from whichever shape the layer beneath answered in. PURE.
 *
 * ⓘ `recordId` is the practice store's answer. Ote's 039 ruling: `persisted` means the decision became
 * durable Sotera-owned state, ⛔ not that it landed in one particular table.
 */
export function idOf(r) {
  if (!r || typeof r !== 'object') return null
  for (const k of ['id', 'memoryId', 'memory_id', 'recordId']) {
    const v = r[k]
    if (typeof v === 'string' && UUID.test(v.trim())) return v.trim().toLowerCase()
  }
  return null
}

// ── ⭐⭐⭐ THE TWO AUDIENCES ────────────────────────────────────────────────────────────────────────
//
// Ote, 2026-09-04: *"Tell the model what happened, not how to repair a capability it does not possess."*
//
// ⚠️⚠️ AND THE REASON IS MEASURED, ⛔ not stylistic. The store's refusal text names `claimKind` — a field
// the model's tool path **cannot supply** (`commitToMemory` and `keep`'s call are both closed field
// lists, and Ote has ruled the tool is not to be taught yet). Handing her that text would describe a
// remedy she does not have, which is precisely the shape that produced **9 attempts at a withheld tool
// across 3 days**: she read a capability into a message and spent turns guessing at it.
//
// ⇒ the developer half keeps the code and the full diagnosis; the model half says what happened and stops.

/** ⭐ What a model is told when a governed write was refused. Ote's approved wording. */
const MODEL_REFUSED_GOVERNED =
  'That was not saved. This memory is governed and this write could not be admitted.'

/**
 * ⚠️ …and what it is told for EVERY OTHER refusal.
 *
 * ⛔ THE GOVERNANCE SENTENCE MUST NOT BE SAID ABOUT A NON-GOVERNANCE REFUSAL. The same path also carries
 * ownership-boundary and slot-admissibility refusals, and telling her *"this memory is governed"* about
 * one of those would be a plainly FALSE statement about the world — the opposite of the honesty this
 * whole change is for. ⭐ Ote approved the sentence above for the governed case; this is that same
 * principle applied where the governed case does not hold.
 */
const MODEL_REFUSED_OTHER = 'That was not saved. The write could not be admitted.'

/** ⚠️ `accepted` is UNKNOWN, ⛔ never failed — so what she is told must not read as a refusal. */
const MODEL_ACCEPTED =
  'I do not know whether that was saved. The write is still in progress and may still complete.'

/** ⭐ The M2 replacement gate's code, matched EXACTLY — ⛔ never by sniffing the message text. */
const GOVERNED_REFUSAL = 'REPLACEMENT_REFUSED'

/**
 * ⭐⭐ THE MODEL-FACING PROJECTION — built by the HOST, ⛔ never assembled by the package.
 *
 * ⛔ It carries NO `code`, NO developer `why`, NO `settled`, NO `queued`, NO `stage`, NO `observation`.
 * ⓘ `queued:true` was never a fact about the world; it described the transport.
 */
export function forModel(receipt) {
  const state = receipt?.state ?? RETENTION_STATE.accepted
  if (state === RETENTION_STATE.persisted) {
    return { ok: true, state, id: receipt?.id ?? null }
  }
  if (state === RETENTION_STATE.refused) {
    return {
      ok: false,
      state,
      why: receipt?.code === GOVERNED_REFUSAL ? MODEL_REFUSED_GOVERNED : MODEL_REFUSED_OTHER,
    }
  }
  return { ok: false, state: RETENTION_STATE.accepted, why: MODEL_ACCEPTED }
}

/**
 * ⭐⭐⭐ THE ONE BOUNDED WAIT. Turn the lane's promise into a receipt that ALWAYS settles.
 *
 * ⚠️ Leaving the lane's own promise unawaited on timeout is safe: `enqueueWrite` attaches its own
 * absorbing continuation, so a later rejection cannot escape as an unhandled one.
 *
 * ⭐ The refusal arrives as a VALUE, ⛔ not a throw — `pipeline.ingest` catches the store's error and
 * carries `code` through deliberately (*"the host classifies; the pipeline only declines to erase"*).
 * The catch below is for a throw that escapes it anyway, ⛔ never the ordinary refusal path.
 *
 * @param {Promise<any>} pending the lane's promise for this write
 * @param {{waitMs?: number}} [opts]
 * @returns {Promise<{ok:boolean, state:string, id:string|null, why:string|null, code:string|null, forModel:object}>}
 */
export async function settleWrite(pending, { waitMs = RETAIN_WAIT_MS } = {}) {
  const wrap = (r) => ({ ...r, forModel: forModel(r) })
  if (!pending || typeof pending.then !== 'function') {
    return wrap({
      ok: false, state: RETENTION_STATE.accepted, id: null, code: null,
      why: 'this writer returned no receipt, so whether a row exists is unknown',
    })
  }
  let timer = null
  try {
    const settled = await Promise.race([
      pending,
      new Promise((r) => { timer = setTimeout(() => r(TIMEOUT), waitMs) }),
    ])
    if (settled === TIMEOUT) {
      return wrap({
        ok: false, state: RETENTION_STATE.accepted, id: null, code: null,
        why: 'the write was still in flight when the wait elapsed',
      })
    }
    if (settled?.ok === false) {
      return wrap({
        ok: false, state: RETENTION_STATE.refused, id: null,
        why: settled.error || 'the write failed', code: settled.code ?? null,
      })
    }
    const id = idOf(settled?.result) ?? idOf(settled)
    // ⭐⭐ NO ID, NO `persisted`. ⓘ The database enforces this too (038's receipt CHECK) — the third time
    // this project has paid for *"the tool accepted it"* being read as *"a row exists"*.
    if (!id) {
      return wrap({
        ok: false, state: RETENTION_STATE.accepted, id: null, code: null,
        why: 'the write reported no row id', result: settled,
      })
    }
    return wrap({ ok: true, state: RETENTION_STATE.persisted, id, why: null, code: null, result: settled })
  } catch (e) {
    return wrap({
      ok: false, state: RETENTION_STATE.refused, id: null,
      why: e?.message || 'the write failed', code: e?.code ?? null,
    })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const STATE_IS_AUTHORITATIVE =
  'A receipt reports three states and ok is a convenience over them, never a substitute: ok:false means '
  + '"not successfully completed or not known", which covers BOTH a refusal and a timeout. Those have '
  + 'opposite remedies — a refusal will not succeed if retried unchanged, and an accepted write may '
  + 'already have landed — so a consumer must inspect state. The model is told what happened and never '
  + 'how to repair a capability it does not possess; the developer half keeps the code and the full '
  + 'diagnosis, and the two are different texts about one truth.'
