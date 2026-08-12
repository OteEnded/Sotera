// Profile Service — the user PROFILE layer (Ote's framing 2026-07-29). A small, canonical view of
// "who the user is RIGHT NOW", distinct from Memory ("why you know that, how it evolved, and
// everything else you've learned"). The Context Composer injects the PROFILE, never raw memories, so
// it never has to reconcile conflicting identity itself.
//
//   Profile   = the reconciled result: a few canonical fields (today: preferredName).
//   Memory    = the full evidentiary store (episodic/semantic/cards) — see memory-v2-service.js.
//   Composer  = injects the profile unconditionally into L1 identity — see context-composer.js.
//
// SOURCES of the profile, by precedence (getProfile):
//   1. account display_name  — authoritative, set by the user (settings) or the model (set_display_name).
//      request.user is loaded FRESH from the DB every request (auth/index.js), so a change shows next turn.
//      ⚠️ THIS USED TO HAVE A SEPARATE SOURCE 2 FOR ROOT — `config.json auth.root.displayName` — because
//      root had no user row. Root got one on 2026-08-06, and on 2026-08-07 its name moved onto that row
//      (Ote: *"no need to save displayname to config, it should came from db"*). So root now resolves
//      through source 1 like everybody else and this list is one shorter. Only root's CREDENTIALS
//      (username, password) remain in config — they must be readable when the database is the thing
//      that is broken. Numbering below is unchanged so existing references still line up.
//   3. REMEMBERED IDENTITY — the `preferred_name` identity slot captured from conversation ("I'm
//      Claude"), read from Memory via resolveProfile (Memory V3 Phase 1, RFC §7). This is the NEW
//      source, inserted BETWEEN the account name and username: so the greeting is right even before
//      the user is ever asked, but an explicit account name still wins. The Composer just consumes
//      `preferredName` and never cares which source won.
//
// getProfile stays a PURE SYNC read of account/config (the cheap, always-available path). resolveProfile
// is the async PROJECTION over knowledge: account/config ▸ remembered identity ▸ none. Per RFC §10 the
// Profile is a projection over Memory — it stores nothing new; it resolves across sources.

import { logUserChange } from '../auth/user-changes.js'
import { buildMemoryV2 } from './memory-v2-host.js'
import { IDENTITY_ATTR } from '@ote/memory/cognition/memory-identity.js'

const MAX_NAME = 100 // matches the display_name column + the /me and admin schemas

// ── CONSENT LEDGER for the two-phase rename ──────────────────────────────────────────────────────
// Rename proposals awaiting the user's answer, keyed by user id.
//
// WHY THIS EXISTS (measured 2026-07-31, chat 164b8c4a): the two-phase gate below required two CALLS,
// not two TURNS — so the model called set_display_name{name}, read `needs_confirmation`, and called
// set_display_name{name, confirm:true} in the SAME reply with no user input whatsoever. The account
// was renamed without consent, and the reply then said "Done — I'll call you Kestrel". A prompt rule
// cannot hold this gate (it had one, and the model talked past it); consent has to be checked where
// the write happens.
//
// In-memory is correct: a proposal is only meaningful inside the turn/conversation that made it, and a
// restart SHOULD forget it — the model just proposes again.
//
// ⚠️ IT MUST ALSO FORGET ON ITS OWN. As first written this only deleted on a SUCCESSFUL confirm, so every
// proposal a user never answered — the common case, since declining is just not replying — stayed for the
// life of the process. One small object per user is not much, but "grows with users, never shrinks" is a
// leak whatever its constant, and it is exactly the class of thing Ote asked to be rid of. Found by
// auditing my own additions rather than by it hurting, which is the only cheap time to find it.
// Pruned on write (no timer to leak in turn) with a hard cap as a backstop.
const PENDING_RENAMES = new Map() // userId -> { name, turnId, at:number }
const RENAME_PROPOSAL_TTL_MS = 30 * 60 * 1000 // an unanswered proposal is dead long before this
const MAX_PENDING_RENAMES = 500
function rememberProposal(userId, entry) {
  const now = entry.at
  for (const [k, v] of PENDING_RENAMES) if (now - v.at > RENAME_PROPOSAL_TTL_MS) PENDING_RENAMES.delete(k)
  // backstop: if something pathological outpaces the TTL, drop the oldest rather than grow without bound
  if (PENDING_RENAMES.size >= MAX_PENDING_RENAMES) {
    const oldest = [...PENDING_RENAMES.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) PENDING_RENAMES.delete(oldest[0])
  }
  // ⚠️ A RE-PROPOSAL MUST NOT RESET THE CLOCK — found live 2026-08-12, in conversation, not by a test.
  //
  // I told her "call me Claude", she proposed and asked. I said "yeah please do". She then RE-PROPOSED
  // and confirmed in that same reply — and the consent check refused it, because overwriting the entry
  // had moved the proposal's turnId to the current turn, making her own confirm look same-turn. She
  // asked again. Answering again would loop forever: the user can never say yes, because every yes
  // arrives in a turn where she has just re-proposed.
  //
  // Keeping the EARLIEST proposal for the same name preserves the security property exactly. The
  // measured bypass (propose + confirm in ONE reply, no user input) still fails: there is no earlier
  // proposal, so the turnId still matches the current turn and it is still refused. What now succeeds
  // is the legitimate case it was blocking by accident — a proposal from an earlier turn that the user
  // has actually answered since.
  const prior = PENDING_RENAMES.get(userId)
  if (prior && prior.name === entry.name && prior.turnId && prior.turnId !== entry.turnId) return
  PENDING_RENAMES.set(userId, entry)
}
// Test-only introspection. A bound that nothing checks is a hope, not a bound — and this map exists
// precisely because an unchecked assumption (two calls == consent) turned out to be false.
export function _pendingRenameCount() { return PENDING_RENAMES.size }

// Did the user ANSWER an ask_user question in this conversation since the proposal? This is what makes
// the ask_user path legal within ONE turn: a held turn resumes in place, so the turnId does not change
// even though the human really did answer. Without this, hardening the gate would have broken exactly
// the interaction Ote asked us to prefer.
//
// ONLY 'answered' COUNTS. The lifecycle also has skipped / cancelled / timeout, and my first version of
// this check accepted anything that was not 'pending' — which would have made **Skip** authorise a
// rename. It cannot: on a skip the host tells the model "the user chose to skip — proceed with your best
// judgment", i.e. explicitly that no answer was given. Ote hit Skip on the very first live run of this
// gate, which is how the hole surfaced. Same lesson as always — the check has to reject exactly what it
// means to reject, and "not pending" was too generous by three statuses.
const CONSENTING_STATUS = 'answered'
async function interactionAnsweredSince(fastify, conversationId, sinceMs) {
  if (!conversationId || !sinceMs) return false
  try {
    const rows = await fastify.db.txn_interaction_sessions.findAll({
      where: { conversation_id: conversationId },
      order: [['updated_at', 'DESC']],
      limit: 5,
    })
    return rows.some((r) => r.status === CONSENTING_STATUS && new Date(r.updated_at).getTime() >= sinceMs - 1000)
  } catch {
    return false // can't prove an answer -> treat as unconfirmed (fail CLOSED on a consent check)
  }
}

// (`rootConfiguredName` lived here until 2026-08-07. Root's name moved to root's own user row, so this
//  file no longer reads config at all — the root branch of getProfile went with it.)

/**
 * getProfile — the reconciled canonical view for a caller. PURE READ, no writes, never throws
 * (a broken profile must never break a turn). Returns { preferredName, source }:
 *   preferredName : string | null — how to address the user (null = fall back to username)
 *   source        : 'account' | 'config' | 'none' — provenance, for diagnostics/telemetry
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ id:string|null, username?:string, displayName?:string|null, isRoot?:boolean }} user
 */
export function getProfile(fastify, user = {}) {
  try {
    // ⚠️ ROOT USED TO BE A SPECIAL CASE HERE, READING config.json. It is not any more (2026-08-07):
    // root's name lives on root's own user row, so it arrives on `user.displayName` exactly like
    // everyone else's and this function no longer needs to know root exists. Deleting the branch IS
    // the fix — a second source is what let the file and the row drift apart.
    const name = typeof user?.displayName === 'string' && user.displayName.trim() ? user.displayName.trim() : null
    // (FUTURE inferred-slot fallback slots in HERE, between account and 'none'.)
    return { preferredName: name, source: name ? 'account' : 'none' }
  } catch {
    return { preferredName: null, source: 'none' }
  }
}

/**
 * resolveProfile — the async PROJECTION (RFC §10). Full precedence: account/config (getProfile) ▸
 * REMEMBERED IDENTITY (the preferred_name slot captured from conversation) ▸ none. An explicit account
 * name always wins; remembered identity fills the gap the greeting bug left. PURE READ, never throws
 * (a broken projection must never break a turn) — degrades to the account/config result.
 *
 * `readIdentity` is injectable for tests; by default it reads the identity slot from Memory (scoped to
 * this user + persona). Only queried for real users with no account name — root/anonymous return early.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ id:string|null, username?:string, displayName?:string|null, isRoot?:boolean }} user
 * @param {{ persona?:string|null, readIdentity?:()=>Promise<{value:string|null}|null> }} [opts]
 * @returns {Promise<{ preferredName:string|null, source:'account'|'config'|'remembered'|'none' }>}
 */
export async function resolveProfile(fastify, user = {}, { persona, readIdentity } = {}) {
  const base = getProfile(fastify, user)
  if (base.preferredName) return base // explicit account/config name is authoritative
  if (!user?.id) return base // root/anonymous — no per-user remembered slot
  try {
    const read = readIdentity || (() => buildMemoryV2(fastify, { userId: user.id, persona }).getIdentity({ attribute: IDENTITY_ATTR.preferredName }))
    const ident = await read()
    if (ident?.value && String(ident.value).trim()) {
      return { preferredName: String(ident.value).trim(), source: 'remembered' }
    }
  } catch { /* projection must never break a turn */ }
  return base
}

/**
 * setDisplayName — the WRITE behind the model's set_display_name tool. Updates the account's
 * display_name through the SAME audited path as the self-service /me route (logUserChange), so a
 * model-driven change is logged exactly like a user-driven one. display_name has NO cooldown (only
 * username does), so this is cheap and reversible.
 *
 * Root is config-only (no DB row): setting root's name from a chat is refused with a clear reason
 * — the model should tell the user their root display name lives in config.json (auth.root).
 *
 * TWO-PHASE: the first call (confirm falsy) never writes — it returns `needs_confirmation` so the model
 * asks the user; a follow-up call with `{ confirm: true }` applies it. Setting the SAME name is a no-op
 * ok (no confirm needed). The confirm gate lives here (service), not the prompt.
 *
 * @param {{ confirm?:boolean }} [opts]
 * @returns {Promise<{ok:true, displayName:string}
 *   | {ok:false, needs_confirmation:true, proposed:string, current:string|null, message:string}
 *   | {ok:false, reason:string, message:string}>}
 */
export async function setDisplayName(fastify, user = {}, rawName, { confirm = false, turnId = null, conversationId = null } = {}) {
  const name = typeof rawName === 'string' ? rawName.trim() : ''
  if (!name) {
    return { ok: false, reason: 'invalid_name', message: 'Provide a non-empty name to set as the display name.' }
  }
  if (name.length > MAX_NAME) {
    return { ok: false, reason: 'name_too_long', message: `Display name must be ${MAX_NAME} characters or fewer.` }
  }
  if (user?.isRoot || user?.id == null) {
    return {
      ok: false,
      reason: 'root_profile_in_config',
      message: "This account's display name is configured in config.json (auth.root), not in the database — I can't change it from a chat. It can be set there.",
    }
  }
  // DEFENCE IN DEPTH: name the columns. This runs in the PERSONA layer, and its return values
  // flow back to the model as a tool result — so a bare findByPk (which selects every column,
  // including the admin-only `system_note`) puts staff-only text one careless `return row` away
  // from a model's context. Nothing here needs more than these three.
  // (`id` is the PK — row.update() needs it; `display_name` is the only field read or written.)
  const row = await fastify.db.mst_users.findByPk(user.id, { attributes: ['id', 'display_name'] })
  if (!row) return { ok: false, reason: 'user_not_found', message: 'Could not find the account to update.' }
  if (row.display_name === name) {
    return { ok: true, displayName: name } // idempotent — already set (no-op, no confirm needed, no audit row)
  }
  // TWO-PHASE CONFIRM (Ote 2026-07-30). Renaming an account is a real, cross-conversation change, so it
  // must NOT happen without the user's explicit yes. The soft "ask first" prompt rule was bypassable —
  // proven live: the model called set_display_name and renamed the account with no confirmation. So the
  // gate lives HERE, in the service: the FIRST call (confirm falsy) never writes — it returns
  // needs_confirmation so the model asks the user; only a follow-up call with confirm:true applies it.
  if (!confirm) {
    // remember WHEN and in WHICH turn this was proposed — the confirm below is checked against it
    if (turnId) rememberProposal(String(user.id), { name, turnId, at: Date.now() })
    return {
      ok: false,
      needs_confirmation: true,
      proposed: name,
      current: row.display_name ?? null,
      message: `Not changed yet. First ASK THE USER (ask_user, or plain text) and wait for their answer — then, only if they said yes, call set_display_name again with { "name": "${name}", "confirm": true }. Confirming in this same reply will be refused: your own confirmation is not the user's.`,
    }
  }
  // CONSENT CHECK — narrow on purpose. It rejects exactly one thing: a confirm arriving in the SAME turn
  // that proposed the name, with no answer from the user in between. Everything else still passes —
  // a confirm on a LATER turn (the user replied in plain text), or a same-turn confirm after an ask_user
  // question was actually answered (the held turn resumed). A wider check would break the ask_user path;
  // a narrower one would not have caught the bypass that was measured.
  const pending = PENDING_RENAMES.get(String(user.id))
  if (pending && pending.name === name && turnId && pending.turnId === turnId) {
    if (!(await interactionAnsweredSince(fastify, conversationId, pending.at))) {
      return {
        ok: false,
        reason: 'consent_not_received',
        needs_confirmation: true,
        proposed: name,
        message: `Refused: you proposed "${name}" and confirmed it yourself in the same reply — the user never answered. End your reply by ASKING them (ask_user with Yes/No, or plain text), and confirm only after they have actually replied.`,
      }
    }
  }
  PENDING_RENAMES.delete(String(user.id)) // consented and applied — the proposal is spent
  const old = row.display_name
  await row.update({ display_name: name })
  try {
    await logUserChange(fastify.db, { userId: user.id, field: 'display_name', oldValue: old, newValue: name, actor: user })
  } catch { /* audit is best-effort — the change already landed */ }
  return { ok: true, displayName: name }
}
