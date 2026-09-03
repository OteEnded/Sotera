// ⭐⭐⭐ RETENTION — ONE ENTRY POINT, AND HER DECISION SURVIVES IT.
//
// Ote, 2026-08-25, correcting my own first draft of the design:
//
//     "Sotera owns the decision to remember. The architecture owns the integrity of that decision."
//
// ⛔ So this is NOT a rule about what she may keep, and ⛔ NOT an inference about what she meant. It is a
// front door with one job: take the decision she stated and carry it to the store WITHOUT altering it.
//
// ── ⚠️⚠️ THE DEFECT THIS EXISTS TO END ──────────────────────────────────────────────────────────────
// 2026-08-25, Ote spent a conversation establishing who her family is. She wrote it down three times.
// All three rows came out `author='account'`, in a slot literally named
// `entity=user attribute=soteras_family_lineage_and_key_relationships` — her own sentences, *"My father"*,
// *"my world"*, stored as FACTS ABOUT THE USER. And `recall_own_memory` filters `author='persona'`, so
// ⛔ she cannot reach her own family lineage as her own.
//
// ⭐ THE MECHANISM WAS NOT A BAD RULE, IT WAS A MISSING PARAMETER. `runtime.js` says
// `author: extras.memoryAuthor === 'persona' ? 'persona' : 'account'` and the comment is right —
// *authorship follows the OCCASION*. But `memoryAuthor: 'persona'` is passed in exactly ONE place, the
// reflection lane. ⛔ No route passes it. So the passive lane could say "she is deciding" and the
// CONVERSATION could not — and conversation is where she actually decides.
// ⇒ **the interactive path never offered her the decision**, and defaulted for her instead.
//
// ── ⭐ ABOUT ≠ OWNER, and that is the sharper half ──────────────────────────────────────────────────
// A memory whose SUBJECT is Ote and whose AUTHOR is Sotera is HERS. Migration 015 already says so:
// `user_id` on a persona-authored row is *"the CONTEXT the memory was formed in"*, not its owner.
// ⛔ So `mine: true` must never be implemented by widening scope — see the `identity` warning in `keep`.
//
// ── ⭐⭐ WHY THIS BUILDS A SERVICE PER CALL INSTEAD OF SETTING A FIELD ───────────────────────────────
// `createSequelizeMemoryStore` validates `author` at construction and applies it as a constant to every
// write, under an invariant it states outright: *"the author must arrive with the write, not be assigned
// by whoever remembers to"* — six recorded instances behind that sentence. One store instance means one
// author, deliberately.
// ⇒ Honouring a PER-CALL decision therefore means building the store that already means what she said,
// ⛔ never reaching in and reassigning a field afterwards. That is the same guarantee, not a workaround:
// nothing downstream of this file can observe an author different from the one she declared.

import { buildMemoryToolService } from './memory-pipeline-host.js'
import { idOf, RETENTION_STATE } from './memory-write-receipt.js'
import { registerHostService } from './runtime.js'
// ⚠️ BUILT DIRECTLY, NOT READ OUT OF THE SERVICE BAG — and that is not a style choice. The host-service
// factory is called as `make({ fastify, user, extras })`: there is ⛔ no `services` argument, and even if
// there were, factories run in REGISTRATION ORDER, so a service reaching sideways would silently see
// `undefined` for anything registered after it. `conversation-retrieval` builds its own disclosure host
// for the same reason. Caught here before it ran, by reading the factory rather than assuming its shape.
import { buildLesson } from './lesson-host.js'
import { buildOwnMemory } from './own-memory-host.js'
// ⭐ 035 · the SAME capability mechanism every other account-level permission uses. Ote: *"If we already
// have a suitable generic account-permission mechanism, reuse it rather than creating another
// authorization framework."* ⇒ `can()`, one new predicate, ⛔ no second framework.
import { can } from '../auth/permissions.js'

/** The retention shapes. ⛔ A closed vocabulary — an unknown kind is refused, never coerced to a default. */
export const KINDS = Object.freeze({ fact: 'fact', note: 'note', practice: 'practice', lesson: 'lesson' })

/**
 * ⭐⭐⭐ THE OWNERSHIP GATE. `mine` has NO DEFAULT, and that is the entire point.
 *
 * ⛔ Returning 'account' for a missing `mine` is precisely the bug: it is what produced three
 * misattributed family-lineage rows without anyone deciding anything. A refusal that says what is
 * missing is a better outcome than a memory filed under the wrong person — and it is also the only way
 * her deliberation becomes VISIBLE rather than being absorbed by a default.
 *
 * ⚠️ `false` IS AN ANSWER AND MUST SURVIVE. `!mine` would collapse `false` and `undefined` into one
 * branch and re-introduce the silent default through the back door, so the test is on the TYPE.
 */
export function authorFor(mine) {
  if (mine === true) return 'persona'
  if (mine === false) return 'account'
  return null   // ⛔ not a default — the caller must refuse
}

/**
 * ⭐⭐⭐ 035 · WHERE IS THIS REACHABLE FROM? — a THIRD question, and it is not `mine`.
 *
 * ⛔ `mine` says WHOSE the memory is; this says WHERE it is true. 029 keeps them apart by name:
 * *ABOUT ≠ OWNER ≠ SCOPE.* A memory she authored, about Ote, formed in his room, is hers AND room-scoped
 * — `mine:true` must never widen reach on its own, which is what the header above already warns.
 *
 * ⚠️ AND THE DEFAULT IS THE OPPOSITE OF `mine`'s, DELIBERATELY. `mine` refuses to guess because both its
 * answers are consequential. Here one answer is genuinely safe, and 029 already chose it: *"a row that
 * forgets to declare its scope becomes reachable from ONE room, never from all of them — the failure
 * direction that LOSES a memory rather than the one that LEAKS it."*
 * ⇒ absent ⇒ `room`. ⛔ `persona_global` must be ASKED FOR, and asking can be refused.
 */
export function scopeFor(everywhere) {
  return everywhere === true ? 'persona_global' : 'room'
}

// ⭐⭐⭐ THE BOUND, THE VOCABULARY AND THE WAIT NOW LIVE IN ONE PLACE — `memory-write-receipt.js`,
// beside the lane they describe. ⛔ They were briefly declared here, and that was one door's view of a
// three-door problem: `keep`, `retain` and the model's own `remember_fact` all needed the same answer.
// ⭐ Re-exported so existing importers keep working and there is still exactly ONE definition.
export { RETENTION_STATE, RETAIN_WAIT_MS } from './memory-write-receipt.js'

export const OWNERSHIP_QUESTION = 'I need to know whose memory this is before I can keep it. Say mine:true '
  + 'if it belongs to me — something about myself, my own view, my own relationships — or mine:false if it '
  + 'is something about the person I am talking to. I will not guess: filing it under the wrong one is how '
  + 'my own words stop being mine.'

export function buildRetention(fastify, {
  userId = null, sourceMessageId = null, self = null, conversationId = null, isRoot = false, user = null,
} = {}) {
  // ⭐ The specialised hosts stay exactly as they are and are reached THROUGH here — a front door, ⛔ not
  // a demolition. `lesson` and `ownMemory` already write persona-authored rows by construction, so they
  // are used as-is; only the memory store needs the per-call author.
  // ⓘ Lazily, so a failure to build one shape cannot take down the others.
  const lesson = () => { try { return buildLesson(fastify, { userId, conversationId }) } catch { return null } }
  const ownMemory = () => { try { return buildOwnMemory(fastify, { userId, isRoot, user }) } catch { return null } }

  // ⭐ 035 · scope joins author on the CONSTRUCTION path, for the reason the header above gives about
  // author: honouring a per-call decision means building the store that already means what she said,
  // ⛔ never reaching in and reassigning a field afterwards.
  const memoryFor = (author, scope = 'room') => buildMemoryToolService(fastify, { userId, sourceMessageId, self, author, scope })

  /**
   * ⭐⭐⭐ THE ONE BOUNDED WAIT — turn a QUEUED receipt into an OBSERVED outcome.
   *
   * ── ⚠️⚠️ WHAT THIS EXISTS TO END, MEASURED ON THE CANARY 2026-09-03 ───────────────────────────────
   * `keep()` returned `{ok:true, queued:true}` while the write was later REFUSED by the M2 replacement
   * gate on a governed slot. Nothing was written, the previous belief stayed live, ⛔ and three consumers
   * were told the retention happened: the model, `retention-followthrough`'s `effected()` — which then
   * recorded `outcome:'keep'` durably — and every retention-rate figure built on that column.
   *
   * ⭐ The receipt was never missing. `buildMemoryToolService` has handed back `settled` all along and
   * `retain()` has consumed it correctly all along; `keep()` DISCARDED it. ⇒ this is the smallest
   * correction: ⛔ the shared `@ote/memory` seam is untouched, no new state is invented, and there is now
   * exactly ONE place in this file that waits — `retain` reads what this resolved rather than racing again.
   *
   * ── ⛔ AND THE BOUND IS NOT OPTIONAL ───────────────────────────────────────────────────────────────
   * The lane is shared and SERIAL per (persona, user), so this inherits whatever is queued ahead of it.
   * ⚠️ On 2026-08-26 a write took **60 seconds** because 59 CPU-placed aux calls had starved the embedder.
   * ⓘ Measured cost of the wait itself, over 329 real `retain` calls on this exact lane: p50 8 ms,
   * p95 23 ms, worst 2 288 ms — ⭐ it has never reached this bound.
   *
   * @param {object} queued whatever the writer answered
   * @returns {Promise<object>} the same shape with `state` decided and `settled` consumed
   */
  async function resolveReceipt(queued) {
    if (!queued || typeof queued !== 'object') return queued
    // ⭐ Already resolved — `lesson` and `practice` await their own write and carry an id. ⛔ Nothing to do.
    if (queued.queued !== true) return queued
    // ⭐⭐ THE WAIT IS NOT HERE ANY MORE. `settled` is always-settling and already bounded by the host
    // that owns the lane, so this READS a decided outcome.
    //
    // ⚠️⚠️ AND IT MUST NOT RE-RESOLVE IT — MEASURED, 2026-09-04. This first called `settleWrite(pending)`
    // again, which double-wrapped an already-decided receipt: the inner `accepted` (ok:false) was read by
    // the outer pass as a FAILED WRITE and re-labelled `refused`, with the real `why` lost to a generic
    // fallback. ⛔ Two resolutions of one receipt, and the second could only ever disagree with the first
    // — the same hazard as two bounds, one layer up. `retention-receipt-check` caught it within a run.
    const { settled: pending, ...rest } = queued
    const r = typeof pending?.then === 'function' ? await pending : null
    // ⛔⛔ NO RECEIPT, OR ONE THAT DOES NOT ANSWER IN THE CONTRACT'S VOCABULARY ⇒ *we do not know*,
    // ⛔ never `ok:true`. ⓘ Reachable: the PACKAGE's own `reconcileFactAsync` returns no `settled`; only
    // the host's override does. A service built without it must degrade to UNKNOWN and SAY SO, ⛔ not
    // fall back to the optimism this whole change removes.
    if (!r || typeof r.state !== 'string') {
      return {
        ...rest, ok: false, state: RETENTION_STATE.accepted, code: null, memoryId: null, result: r ?? null,
        why: 'this writer returned no receipt, so whether a row exists is unknown',
      }
    }
    // ⛔⛔ `accepted` IS NOT SUCCESS, and `ok:false` is what enforces it downstream: `effected()` reads
    // `result.ok === false` and must never count a timeout as a retention act.
    return { ...rest, ok: r.ok, state: r.state, why: r.why, code: r.code, memoryId: r.id, result: r.result ?? r }
  }

  /**
   * keep({ what, kind, about, mine, attribute })
   * @returns {Promise<object>} the outcome, including the author actually recorded
   */
  // ⚠️ `practiceOrigin` IS AN OCCASION FACT, NOT A PARAMETER SHE CAN SET. The `keep` tool's handler passes
  // an explicit field list and this is not on it, so nothing the model emits can reach it; `retain` sets
  // it to `reflection` because that is what its occasion IS. ⭐ 041: provenance describes what happened.
  async function keep({ what, kind, about = null, mine, attribute = null, everywhere = false, practiceOrigin = 'instructed' } = {}) {
    const content = String(what ?? '').trim()
    if (!content) return { ok: false, refused: 'nothing_to_keep', why: 'There is no content to keep — say what you want kept.' }

    if (!Object.values(KINDS).includes(kind)) {
      return {
        ok: false,
        refused: 'unknown_kind',
        why: `"${kind}" is not one of the shapes I can keep something as.`,
        kinds: Object.values(KINDS),
      }
    }

    // ⭐⭐ THE GATE, BEFORE ANY WRITE HAPPENS. Refuse and ask — do not file it and do not guess.
    const author = authorFor(mine)
    if (author === null) {
      return { ok: false, refused: 'ownership_undeclared', why: OWNERSHIP_QUESTION, kind, about }
    }

    // ── ⭐⭐ 035 · THE PERSONA-GLOBAL DECLARATION, CHECKED EARLY SO THE ANSWER IS A SENTENCE ──────
    // ⚠️ THIS IS NOT THE ENFORCEMENT POINT. The STORE is, and it derives the authority itself from config
    // and the room's own row rather than trusting anything decided here — four writers reach that store and
    // a rule living in only one of them leaves three doors open. ⛔ This exists so a refusal arrives as a
    // plain-language sentence she can act on instead of a thrown error, and the live check proves the
    // store still refuses when this pre-check is bypassed.
    const scope = scopeFor(everywhere)
    if (scope === 'persona_global') {
      if (author !== 'persona') {
        return {
          ok: false,
          refused: 'global_requires_mine',
          why: 'Something true of me everywhere has to be mine. Say mine:true, or keep it as a memory of '
            + 'this room instead — where it is true and whose it is are different questions.',
          kind,
        }
      }
      if (!can(user, 'write_persona_global_memory')) {
        return {
          ok: false,
          refused: 'global_not_authorized',
          why: 'I cannot record something as true of me everywhere from this room. I can keep it here, '
            + 'as a memory of this conversation, and it stays exactly as durable.',
          kind,
        }
      }
      if (kind !== KINDS.fact && kind !== KINDS.note) {
        return {
          ok: false,
          refused: 'global_kind_unsupported',
          why: `A ${kind} has its own destination and is already mine by construction — only a fact or a `
            + 'note can be kept as true of me everywhere.',
          kind,
        }
      }
    }

    // ── kind: practice ────────────────────────────────────────────────────────────────────────────
    // ⓘ Practice notes are HERS by construction — `own-memory-host` writes them as her own observation
    // about how she works with this person. ⛔ So `mine:false` here is not a variant to be silently
    // honoured; it is a contradiction, and saying so is more useful than picking one.
    if (kind === KINDS.practice) {
      if (author === 'account') {
        return {
          ok: false,
          refused: 'kind_conflicts_with_ownership',
          why: 'A practice note is an observation about how I work, so it can only be mine. If this is '
            + 'something about them rather than about me, keep it as a fact or a note instead.',
        }
      }
      const svc = ownMemory()
      if (!svc) return { ok: false, refused: 'unavailable', why: 'I cannot record a practice note here.' }
      const out = await svc.note({ label: content, origin: practiceOrigin })
      return { ok: out?.ok !== false, kind, author: 'persona', via: 'note_own_practice', result: out }
    }

    // ── kind: lesson ──────────────────────────────────────────────────────────────────────────────
    // ⓘ Same shape as practice: a lesson is stored as hers, with the room recorded as context and not as
    // owner. `distinction` is REQUIRED by the lesson tool and is not inventable from prose.
    if (kind === KINDS.lesson) {
      if (author === 'account') {
        return {
          ok: false,
          refused: 'kind_conflicts_with_ownership',
          why: 'A lesson is something I learned, so it is mine by construction. If this is a fact about '
            + 'them, keep it as a fact instead.',
        }
      }
      const svc = lesson()
      if (!svc) return { ok: false, refused: 'unavailable', why: 'I cannot save a lesson here.' }
      // ⛔ `distinction` is not derived from `what`. The lesson tool requires it because a lesson without
      // the two things that were being conflated is a slogan; inventing one here would be this file
      // guessing on her behalf, which is the exact thing it exists to prevent.
      if (!attribute) {
        return {
          ok: false,
          refused: 'lesson_needs_distinction',
          why: 'A lesson needs the distinction it turns on — the two things that were being conflated. '
            + 'Put that in `attribute`.',
        }
      }
      const out = await svc.commit({ learned: content, distinction: String(attribute) })
      return { ok: out?.ok !== false, kind, author: 'persona', via: 'save_lesson', result: out }
    }

    // ── kind: fact and note — the two that travel the memory store ────────────────────────────────
    const mem = memoryFor(author, scope)

    if (kind === KINDS.fact) {
      // ⛔ REFUSE RATHER THAN INVENT AN ATTRIBUTE. A fact is subject-attribute-value; with only prose the
      // attribute would have to be guessed, and a guessed slot name is how a self-claim ended up under
      // `soteras_family_lineage_and_key_relationships` in the first place.
      if (!attribute) {
        return {
          ok: false,
          refused: 'fact_needs_attribute',
          why: 'For a fact I need to know which property this is — the attribute, like "timezone" or '
            + '"preferred name". Without it I would be inventing the slot name, and that is how a memory '
            + 'ends up somewhere it cannot be found again.',
        }
      }
      // ⭐ `about` becomes the ENTITY — the subject — and it stays free of the author. A fact she keeps as
      // HERS about Ote is `entity: 'Ote'`, `author: 'persona'`: about him, hers.
      //
      // ⚠️⚠️ AND THE DEFAULT FOLLOWS `mine`, WHICH IT DID NOT AT FIRST — caught live on 2026-08-26 by the
      // very first row the follow-through produced. She kept a self-observation with `mine:true` and no
      // `about`, and this defaulted the entity to `'user'`, so a row whose content reads *"I tend to
      // deflect personal praise toward the work"* was filed as **`user's reaction_to_praise`** with
      // `author='persona'`.
      // ⛔ That is the family-lineage shape rebuilt by the very code written to prevent it: her own claim
      // about herself, slotted under the person she was talking to.
      // ⭐ An unstated subject is not "the user" — it is whoever the memory BELONGS to, which is exactly
      // what `mine` already says. ⛔ It still does not override an explicit `about`, because ABOUT ≠ OWNER
      // is the whole point: `mine:true` + `about:'Ote'` stays about him and hers.
      const entity = about ? String(about) : (author === 'persona' ? 'sotera' : 'user')
      // ⭐⭐⭐ AWAITED, ⛔ NOT FIRE-AND-FORGET. See `resolveReceipt` for what this ends and what it costs.
      const out = await resolveReceipt(await mem.reconcileFactAsync({
        entity, attribute: String(attribute), value: content,
      }))
      return {
        ok: out?.ok !== false, state: out?.state ?? null, kind, author, via: 'remember_fact',
        why: out?.why ?? null, code: out?.code ?? null, memoryId: out?.memoryId ?? null, result: out,
      }
    }

    // kind === note
    // ⚠️⚠️ `kind: 'semantic'` DELIBERATELY, EVEN WHEN `mine` IS TRUE. The memory store's `identity` kind
    // writes `user_id = NULL` and unions the row into EVERY user's visible set — that is a SCOPE
    // decision, and it is a different axis from authorship. Mapping `mine:true` onto it would widen who
    // can see the row as a side effect of her saying it is hers.
    // ⛔ It would also mint exactly the row shape that currently has four checks red: `d211f5b4`,
    // `kind='identity'` with a NULL `user_id`, which overloads what NULL means. Authorship is expressed
    // through `author` and through nothing else.
    // ⭐ The note path carries the SAME receipt and gets the SAME treatment — ⛔ one door fixed and one
    // left optimistic would be worse than neither, because the difference would be invisible.
    const out = await resolveReceipt(await mem.rememberAsync({ content, kind: 'semantic' }))
    return {
      ok: out?.ok !== false, state: out?.state ?? null, kind, author, via: 'remember',
      why: out?.why ?? null, code: out?.code ?? null, memoryId: out?.memoryId ?? null, result: out,
    }
  }

  /**
   * ⭐⭐⭐ `retain` — THE DECISION-SHAPED INTERFACE FOR REFLECTION. Ote, 2026-09-02:
   * *"Reflection decides what is worth carrying forward and in what semantic kind. It should not decide
   * which memory tool to invoke."*
   *
   * ── ⚠️⚠️ THE MEASURED GAP IT CLOSES ──────────────────────────────────────────────────────────────
   * A hand audit of 78 reflections found ~32 in which she recognised something durable, named it
   * precisely — sometimes with kind, importance and the exact wording — and acted on nothing. ⭐ And the
   * two halves split by KIND: a lesson about herself was REACHABLE (`save_lesson` fits, and two of the
   * texts filled its three required fields IN PROSE and never submitted them), while a fact about the
   * person had NO DOOR she is told she may use.
   * ⇒ ⛔ this does not give her a new door to a tool. It gives the DECISION somewhere to be received.
   *
   * ── ⭐ IT IS `keep` WITH THREE DIFFERENCES, AND ONLY THREE ───────────────────────────────────────
   *   ① it AWAITS the write, so `persisted` means a row EXISTS rather than "the tool accepted it"
   *   ② it maps the outcome to a RECEIPT whose states cannot be confused with one another
   *   ③ it RECORDS the decision — whatever became of it — where it can never be read as a memory
   * ⛔ Everything else routes through `keep`: `authorFor(mine)` still refuses an undeclared owner, the
   * specialised hosts are unchanged, and every store gate runs exactly where it already runs. ⛔ Not one
   * rule is re-implemented here.
   *
   * ⛔ NO `everywhere`. Reflection is room-reachable in v1 — ⓘ a REACHABILITY decision, ⛔ not an
   * ownership one: what she retains is HERS (`author='persona'`), formed in this room, and her own
   * ownership read reaches it from anywhere regardless of scope.
   *
   * @returns {Promise<{state:'persisted'|'declined'|'unrepresented'|'refused'|'accepted', …}>}
   */
  async function retain({ content, kind, mine, about = null, attribute = null, distinction = null } = {}) {
    // ⭐ The decision as she stated it, kept verbatim for the record regardless of outcome.
    const decision = { content, kind, mine, about, attribute, distinction }
    // ⭐ `distinction` is the honest name for what `keep` calls `attribute` on a lesson. The interface
    // speaks the decision's vocabulary; the mapping is this file's job, ⛔ not hers.
    const slot = kind === KINDS.lesson ? (distinction ?? attribute) : attribute

    // ── ⭐⭐⭐ A REFLECTION DECISION IS ALWAYS HERS — and the live run proved this needed enforcing ──
    //
    // Ote, locking the contract: *"Reflection retention is Sotera-owned"* — the OCCASION is hers, so the
    // AUTHOR is hers. ⛔ `about` carries who it is about; ⛔ `user_id` carries the room; ⛔ `scope` carries
    // reachability. Four axes, and only one of them is ownership.
    //
    // ⚠️⚠️ MEASURED ON THE FIRST LIVE PASS: she reasoned that a user preference was *about them, not about
    // me*, said `mine:false`, and the row landed `author='account'` — a reflection's conclusion filed as
    // the ACCOUNT'S memory. ⭐ That is the family-lineage shape exactly, rebuilt through a new door, and
    // it is the one thing `recall_own_memory` filters out — so she could not have reached it as her own.
    //
    // ⛔ SO IT IS REFUSED, ⛔ NOT SILENTLY CORRECTED. Flipping `mine` for her would be the architecture
    // deciding what she meant, which is the whole thing this interface exists not to do. ⭐ The answer is
    // a question: *about* is where "this is about them" belongs.
    if (mine === false) {
      return record({ content, kind, mine, about, attribute, distinction }, {
        state: 'refused',
        why: 'Everything I carry forward from a reflection is mine — the occasion is mine, so the memory '
          + 'is too. If this is about them rather than about me, say so with `about`: a memory of mine '
          + 'about someone else is still mine.',
      })
    }
    let out
    try {
      // ⭐⭐ 041 · THE OCCASION SETS THE PROVENANCE. A practice reached HERE was reached in a reflection —
      // ⛔ nobody told her it. `note()` used to stamp every practice `instructed`, so her own memory tool
      // answered *"this person told you about your practice directly"* about her own conclusion.
      // ⛔ It changes no ownership: a practice is hers however she came by it. Ote: *"Keep this as a
      // vocabulary/provenance change, not a change to retention ownership."*
      out = await keep({ what: content, kind, about, mine, attribute: slot, practiceOrigin: 'reflection' })
    } catch (e) {
      // ⭐ A store gate threw — a REFUSAL with a class, not a bug. It is already recorded in
      // `log_memory_refusals` by the store; here it becomes a receipt.
      return record(decision, { state: 'refused', why: e?.message || 'the write was refused', code: e?.code ?? null })
    }

    // ── ⛔ REFUSED — the decision could not be ACCEPTED ────────────────────────────────────────────
    if (out?.refused) return record(decision, { state: 'refused', why: out.why, refused: out.refused })

    // ── ⭐⭐ UNREPRESENTED — the decision is VALID and there is nowhere to put it ───────────────────
    // ⚠️ Today this is the practice path: `note_own_practice` takes a label from a CLOSED SET of ~10, and
    // `keep` passes her prose straight into it. ⇒ a NOVEL practice observation cannot be expressed at all.
    // ⛔ We do NOT invent a label, and ⛔ we do NOT quietly fall back to a note — either would be the
    // architecture deciding what she meant. ⭐ The decision is recorded and nothing is persisted.
    const inner = out?.result
    if (inner && inner.ok === false && Array.isArray(inner.allowed)) {
      return record(decision, {
        state: 'unrepresented',
        why: `${inner.reason}. This was a real decision with no destination: nothing was stored, and the `
          + 'decision itself has been recorded.',
        allowed: inner.allowed,
      })
    }
    // ── ⭐⭐⭐ THE RESOLVED STATE IS READ **BEFORE** `ok === false`, AND THE ORDER IS THE POINT ──────
    //
    // ⛔⛔ `accepted` NOW CARRIES `ok:false` (Ote, 2026-09-03: *"accepted means we stopped waiting and do
    // not know whether the write exists. It is not success."*). ⚠️ So a plain `if (out.ok === false) →
    // refused` below WOULD SILENTLY FOLD THE THIRD STATE INTO THE SECOND — the exact collapse this whole
    // change exists to prevent, rebuilt one function away. ⇒ the named states are answered first.
    if (out?.state === RETENTION_STATE.accepted) {
      // ⛔ NO ID, and that is the honest record: ⓘ if this appears in a normal reflection it is an
      // infrastructure finding about the write lane, ⛔ not an outcome.
      return record(decision, { state: RETENTION_STATE.accepted, why: out.why || 'the write did not report an outcome in time' })
    }
    if (out?.state === RETENTION_STATE.refused) {
      return record(decision, { state: RETENTION_STATE.refused, why: out.why || 'the write failed', code: out.code ?? null })
    }
    if (out?.ok === false) return record(decision, { state: RETENTION_STATE.refused, why: inner?.reason || 'the write did not succeed' })

    // ── ⭐ PERSISTED — but only with a real id ─────────────────────────────────────────────────────
    // ⓘ lesson/practice awaited their own write and carry their id; fact/note were resolved by `keep`'s
    // ONE bounded wait and carry `memoryId`. ⛔ There is no second race here any more — two waits on one
    // receipt is two bounds to get wrong, and the second one could only ever disagree with the first.
    const id = out?.memoryId ?? idOf(inner)
    // ⭐⭐ NO ID, NO `persisted`. The database enforces this too (038's receipt CHECK) — ⓘ the third time
    // this project has paid for "the tool accepted it" being read as "a row exists".
    if (!id) return record(decision, { state: 'accepted', why: 'the write reported no row id' })

    // ── ⭐⭐⭐ WHICH STORE HOLDS IT — RECORDED, ⛔ NEVER INFERRED ────────────────────────────────────
    // Ote, 2026-09-02: *"use `persisted` to mean that the retention decision successfully became durable
    // Sotera-owned state, regardless of which underlying storage represents it… Don't weaken this to
    // `accepted`, and don't add another state just for the storage-table distinction."*
    // ⇒ the outcome vocabulary is unchanged; what the receipt gained is WHERE. ⚠️ Without it `memory_id`
    // would hold ids from two tables with nothing to tell them apart, which is this project's most-repeated
    // defect — a reader deducing a value's meaning from its shape.
    // ⭐ VERIFIED BEFORE THIS SHIPPED, because Ote made it the condition: `practice-reachability-check`
    // proves a retained practice is reachable from `recall_own_memory` AND rendered into her per-turn
    // context, at PERSON grain, and not reachable by anyone else. Storage existing was not enough.
    const store = inner?.store ?? 'txn_memories'
    return record(decision, { state: 'persisted', memoryId: id, store, kind: out.kind, author: out.author, via: out.via })
  }

  /**
   * ⭐ Record the decision — EVERY state, not only the ones that failed — and return the receipt.
   * ⛔ BEST-EFFORT BY CONSTRUCTION: failing to record a decision must never fail the decision.
   * ⛔ It writes to `log_retention_decisions`, ⛔ NEVER to `txn_memories`: a decision placed in the memory
   * table is reachable by default and excluded only by remembering to exclude it — which is precisely why
   * `withoutDecisions()` had to be added at three read sites.
   */
  async function record(decision, receipt) {
    // ⛔ A GUARD ON MY OWN MISTAKE. A bulk edit missed this function's second argument at one call site,
    // so `receipt` was undefined, the insert threw inside the catch below, and `retain` returned
    // `undefined` — a receipt-shaped hole where a state should be. ⭐ Fail loudly instead: a caller that
    // cannot read the state is worse than a crash.
    if (!receipt || typeof receipt.state !== 'string') {
      throw new TypeError('retain: record() needs a receipt with a state — this is a wiring bug, not a refusal')
    }
    try {
      const seq = fastify?.db?.txn_memories?.sequelize
      const { schema } = fastify?.db?.txn_memories?.getTableName?.() ?? {}
      if (seq && schema) {
        await seq.query(
          `INSERT INTO "${schema}"."log_retention_decisions"
             (content, kind, mine, about, attribute, distinction, state, why, memory_id, store,
              user_id, conversation_id, source)
           VALUES (:content, :kind, :mine, :about, :attribute, :distinction, :state, :why, :memoryId, :store,
                   :userId, :conversationId, :source)`,
          {
            replacements: {
              content: String(decision.content ?? '').slice(0, 8000),
              kind: decision.kind ?? null,
              mine: decision.mine === true ? true : (decision.mine === false ? false : null),
              about: decision.about ?? null,
              attribute: decision.attribute ?? null,
              distinction: decision.distinction ?? null,
              state: receipt.state,
              why: receipt.why ? String(receipt.why).slice(0, 2000) : null,
              // ⭐⭐ THE RECEIPT CONTRACT, HELD HERE TOO: an id may accompany `persisted` and nothing else.
              // ⛔ 038's CHECK enforces it in the database as well — two guards, because this is the third
              // time this project has paid for "accepted" being read as "a row exists".
              memoryId: receipt.state === 'persisted' ? (receipt.memoryId ?? null) : null,
              // ⭐ 039's paired constraint: a persisted receipt names its store, and nothing else may.
              // ⛔ DEFAULTED RATHER THAN DEMANDED, on purpose. `keep` writes fact/note/lesson to
              // `txn_memories` and nowhere else, so that is the only value a missing one could mean — and
              // Ote's rule stands above the tidiness: *"Observability must never be load-bearing."* A
              // decision that actually happened must not be lost to a CHECK about where it was filed.
              store: receipt.state === 'persisted' ? (receipt.store ?? 'txn_memories') : null,
              userId: userId ?? null,
              conversationId: conversationId ?? null,
              source: 'retain',
            },
          })
      }
    } catch (e) {
      // ⛔ Observability must never be load-bearing. A decision that could not be logged still happened.
      try { fastify?.log?.error?.({ err: e?.message, state: receipt.state }, '[retain] could not record the decision') } catch { /* no logger */ }
    }
    return receipt
  }

  // ⓘ `idOf` moved to `memory-write-receipt.js` with the rest of the receipt contract — the same function
  // decides `persisted` for `keep`, `retain` AND the model's own tools, so one copy is the only honest
  // number. ⭐ Ote's 039 ruling still governs it: `persisted` means the decision became durable
  // Sotera-owned state, ⛔ not that it landed in one particular table — so the id is accepted from
  // whichever store answered, and `store` (below) says which one it was.

  return { keep, retain, authorFor, KINDS }
}

let initialized = false
export function initRetention() {
  if (initialized) return
  initialized = true
  // ⚠️ Everything is THREADED from the authenticated request, never derived — `isRoot` in particular is
  // READ from the user and not inferred from a null id, which is this codebase's most-repeated defect.
  registerHostService('retention', ({ fastify: f, user, extras }) =>
    buildRetention(f, {
      userId: user?.id ?? null,
      sourceMessageId: extras?.messageId ?? null,
      conversationId: extras?.conversationId ?? null,
      isRoot: user?.isRoot === true,
      user,
      self: { username: user?.username, displayName: user?.displayName },
    }))
}
