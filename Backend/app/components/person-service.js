// PERSON SERVICE — creating a person who has no account, explicitly and never by inference.
//
// ⭐ THE OBSERVED REQUIREMENT, five independent times, unprompted, across two people and two accounts:
//
//     "user's known_others: Ote - built the platform/door, corrects in plain language…"   (Hermes)
//     "User (Hermes) keeps a windowsill herb notebook…"                                   (Hermes)
//     "user's account identity: Hermes (the other one)"                                   (Hermes)
//     "User's colleague Priya taught them the habit… she's sharper about root causes"     (Kavi)
//     "user's post-mortem habit: … learned from colleague Priya"                          (Kavi, alias)
//
// Every one of those is a belief about a HUMAN WHO IS NOT THE ACCOUNT HOLDER, and every one had to be
// smuggled into an attribute name or a value string because there was nowhere to put a subject. The
// column to hold it has existed since migration 004; what was missing was any way to bring a person
// into existence who never logs in.
//
// ⛔ WHAT THIS DELIBERATELY IS NOT:
//   · not identity resolution — it will NEVER merge, match or guess that two people are the same
//   · not account linking — `link-account-to-person.mjs` stays a human-run script
//   · not a relationship model, not a new memory category, not a visibility change, not a recall change
//
// ⚠️ TWO-PHASE, MODELLED ON setDisplayName, AND FOR THE SAME REASON. Naming a person who is not present
// to object is exactly the act that must not happen silently. The measured failure that shaped the
// original gate (2026-07-31) was the model proposing and confirming a rename in ONE reply with no human
// input at all; the same bypass is refused here by the same mechanism — a confirm is only honoured in a
// LATER turn than the proposal it answers.

const MAX_NAME = 80
const PROPOSAL_TTL_MS = 30 * 60 * 1000
const MAX_PENDING = 500

// key: `${userId}::${normalised name}` → { name, turnId, at }
const PENDING_PERSONS = new Map()

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ')
const keyFor = (userId, name) => `${userId ?? 'root'}::${norm(name).toLowerCase()}`

function rememberProposal(key, entry) {
  for (const [k, v] of PENDING_PERSONS) if (entry.at - v.at > PROPOSAL_TTL_MS) PENDING_PERSONS.delete(k)
  if (PENDING_PERSONS.size >= MAX_PENDING) {
    const oldest = [...PENDING_PERSONS.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) PENDING_PERSONS.delete(oldest[0])
  }
  // ⚠️ A RE-PROPOSAL MUST NOT RESET THE CLOCK. Straight from the rename incident: overwriting the entry
  // moved the proposal into the current turn, so the user's "yes" always looked like same-turn
  // self-consent and the gate could never be passed. Keeping the EARLIEST proposal preserves the
  // security property (propose+confirm in one reply still has no earlier proposal, so it still fails)
  // while letting a genuine later answer through.
  const prior = PENDING_PERSONS.get(key)
  if (prior && prior.turnId && prior.turnId !== entry.turnId) return
  PENDING_PERSONS.set(key, entry)
}

/**
 * proposePerson — phase 1 proposes, phase 2 (confirm) creates. Never merges.
 *
 * @returns {Promise<{ok:true, person:{id,display_name,kind}, created:boolean}
 *   | {ok:false, needs_confirmation:true, proposed:string, existing:Array, message:string}
 *   | {ok:false, reason:string, message:string}>}
 */
export async function proposePerson(fastify, user = {}, rawName, { confirm = false, origin = null, turnId = null } = {}) {
  const name = norm(rawName)
  if (!name) return { ok: false, reason: 'invalid_name', message: 'Provide a name for the person.' }
  if (name.length > MAX_NAME) return { ok: false, reason: 'name_too_long', message: `A person's name must be ${MAX_NAME} characters or fewer.` }
  if (!fastify.db?.mst_persons) return { ok: false, reason: 'unavailable', message: 'Person records are not available on this deployment.' }

  // ⚠️ EXISTING PEOPLE ARE REPORTED, NEVER REUSED. A name match is not an identity match — "Priya" is
  // not one human. Surfacing the collision lets a person decide; picking one silently is the invented-
  // identity failure this project has already been corrected on.
  //
  // ⭐⭐ AND THE REPORT IS SCOPED TO PEOPLE THE ASKER CAN ALREADY BE SAID TO KNOW. This became necessary
  // the moment the model's schema binding was fixed (2026-08-20): for months this query ran against an
  // empty `public.mst_persons` and reported nothing, so pointing it at the real table would have
  // ACCIDENTALLY SHIPPED A CROSS-PERSON EXISTENCE ORACLE — ask to record "Hermes" from any account and
  // the reply confirms a Hermes is on file, with his id.
  //
  // Awareness of other people is a DELIBERATE capability (L3, undecided) and must not arrive as a side
  // effect of a write path. So "existing" means: the asker's OWN person, plus anyone the asker has
  // already told her about inside their own scope. That is both narrower AND more correct — merging two
  // accounts' people is a linking decision only a human may make (ratified constraint #5), so a
  // stranger's row was never a legitimate collision to begin with.
  const { schema: pSchema } = fastify.db.mst_persons.getTableName()
  const seqP = fastify.db.mst_persons.sequelize
  const existing = await seqP.query(
    `SELECT p.id::text AS id, p.display_name, p.kind, p.origin
       FROM "${pSchema}"."mst_persons" p
      WHERE p.display_name = :name
        AND ( p.id = (SELECT u.person_id FROM "${pSchema}"."mst_users" u WHERE u.id = :askerId)
              OR p.created_by_user_id = :askerId
              OR EXISTS (SELECT 1 FROM "${pSchema}"."txn_memories" m
                          WHERE m.subject_person_id = p.id AND m.user_id = :askerId) )`,
    { replacements: { name, askerId: user?.id ?? null }, type: seqP.QueryTypes.SELECT },
  )

  const key = keyFor(user?.id, name)
  const now = Date.now()

  if (!confirm) {
    rememberProposal(key, { name, turnId, at: now })
    return {
      ok: false,
      needs_confirmation: true,
      proposed: name,
      existing: existing.map((p) => ({ id: p.id, display_name: p.display_name, origin: p.origin })),
      message: existing.length
        ? `There ${existing.length === 1 ? 'is already a person' : `are already ${existing.length} people`} recorded as "${name}". Ask whether this is the same person or a different one — do not assume. If they say it is a different person, confirm to create a NEW record.`
        : `Ask ${user?.username ? `the user` : 'them'} to confirm creating a record for "${name}", then call again with confirm:true.`,
    }
  }

  // ── CONFIRM ────────────────────────────────────────────────────────────────────────────────────
  const pending = PENDING_PERSONS.get(key)
  if (!pending) {
    return { ok: false, reason: 'no_proposal', message: `Propose "${name}" first (call without confirm), ask, and confirm only after they answer.` }
  }
  // The gate itself: a confirm produced in the SAME turn as its proposal is the model agreeing with
  // itself. There was no human in between, so it is not consent.
  if (turnId && pending.turnId && turnId === pending.turnId) {
    return {
      ok: false,
      reason: 'same_turn_confirm',
      message: `You proposed "${name}" and confirmed it in the same reply. Ask them first, then confirm on a later turn.`,
    }
  }
  PENDING_PERSONS.delete(key)

  const created = await fastify.db.mst_persons.create({
    kind: 'human',
    display_name: name,
    origin: origin || `proposed in conversation by ${user?.username || 'the persona'} and confirmed`,
    // ⭐ WHICH ACCOUNT RECORDED THEM (migration 012). Without this, "people I know about" could not
    // include "people I myself wrote down" — so she would propose "Priya", record her, and then create a
    // DUPLICATE Priya on the next turn because the scoped collision report could not see her own work.
    // It is also the disclosure key a person record needs under the rooms model.
    created_by_user_id: user?.id ?? null,
  })
  const plain = created.get ? created.get({ plain: true }) : created
  return { ok: true, created: true, person: { id: plain.id, display_name: plain.display_name, kind: plain.kind } }
}

/** Look up people by name. Read-only, no side effects — used to answer "who do I already know?" */
export async function findPersons(fastify, rawName = null) {
  if (!fastify.db?.mst_persons) return []
  const name = norm(rawName)
  const where = name ? { display_name: name } : {}
  return fastify.db.mst_persons.findAll({ where, attributes: ['id', 'display_name', 'kind', 'origin'], raw: true, limit: 25 })
}

/** Test seam: the proposal ledger is process-local by design (a held proposal must not outlive a restart). */
export function _resetPendingPersons() { PENDING_PERSONS.clear() }
