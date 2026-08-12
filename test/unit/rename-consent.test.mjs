// THE RENAME CONSENT GATE — it must refuse the model consenting for the user, and ONLY that.
//
//   node --test "unit/**/*.test.mjs"
//
// ⚠️ BOTH BUGS THIS COVERS WERE FOUND IN CONVERSATION, NOT BY A TEST — which is the argument for
// talking to her rather than only driving her:
//
//   2026-07-31  the model called set_display_name{name}, read `needs_confirmation`, and called
//               set_display_name{name, confirm:true} IN THE SAME REPLY. The account was renamed with
//               no user input, and the reply said "Done — I'll call you Kestrel".
//   2026-08-12  the fix for that made the opposite failure possible. I said "call me Claude", she
//               proposed and asked; I said "yeah please do"; she RE-PROPOSED and confirmed in that
//               reply — and re-proposing overwrote the ledger entry with the CURRENT turn, so her own
//               confirm looked same-turn and was refused. She asked again. Answering again would loop
//               forever: every "yes" arrives in a turn where she has just re-proposed.
//
// The gate is a security property with a usability edge, and the edge is where it broke. No database,
// no server: the ledger is in-process and that is exactly what makes it testable here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setDisplayName, _pendingRenameCount } from '../../Backend/app/components/profile-service.js'

// A user row good enough to rename, recording what actually landed.
const fakeUser = (id = 'u1') => {
  const row = { id, display_name: null, update: async (p) => { Object.assign(row, p); return row } }
  return row
}
// fastify stub: no pending interaction ever answered, so the "held turn resumed" escape never applies
// and every pass below is the consent rule itself rather than the ask_user side door.
const fastify = {
  log: { info() {}, warn() {} },
  db: { txn_interaction_sessions: { findOne: async () => null } },
  models: { mst_users: null },
}
const asUser = (row) => ({ id: row.id, username: 'agent_dev', display_name: row.display_name, ...row })

// The service loads the row itself; give it one. (findByPk is the only db surface setDisplayName uses
// for the row — if that changes, this stub failing loudly is the correct outcome.)
function withRow(row) {
  fastify.db.mst_users = { findByPk: async () => row }
  return asUser(row)
}

test('phase one never writes — a proposal is a question, not a change', async () => {
  const row = fakeUser()
  const r = await setDisplayName(fastify, withRow(row), 'Claude', { turnId: 't1', conversationId: 'c1' })
  assert.equal(r.ok, false)
  assert.equal(r.needs_confirmation, true)
  assert.equal(row.display_name, null, 'the account must be untouched until the human answers')
})

test('⛔ THE 2026-07-31 BYPASS: propose and confirm in ONE turn is still refused', async () => {
  const row = fakeUser('u2')
  const user = withRow(row)
  await setDisplayName(fastify, user, 'Kestrel', { turnId: 'same', conversationId: 'c1' })
  const r = await setDisplayName(fastify, user, 'Kestrel', { confirm: true, turnId: 'same', conversationId: 'c1' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'consent_not_received')
  assert.equal(row.display_name, null, 'no rename without a human in the loop')
})

test('✅ a confirm on a LATER turn applies — the user replied in between', async () => {
  const row = fakeUser('u3')
  const user = withRow(row)
  await setDisplayName(fastify, user, 'Claude', { turnId: 't1', conversationId: 'c1' })
  const r = await setDisplayName(fastify, user, 'Claude', { confirm: true, turnId: 't2', conversationId: 'c1' })
  assert.equal(r.ok, true)
  assert.equal(row.display_name, 'Claude')
})

test('⭐ THE 2026-08-12 LOOP: re-proposing before confirming must not reset the clock', async () => {
  const row = fakeUser('u4')
  const user = withRow(row)
  // turn 1 — she proposes and asks
  await setDisplayName(fastify, user, 'Claude', { turnId: 't1', conversationId: 'c1' })
  // turn 2 — I said yes. She re-proposes (harmless) and then confirms, both in this reply.
  await setDisplayName(fastify, user, 'Claude', { turnId: 't2', conversationId: 'c1' })
  const r = await setDisplayName(fastify, user, 'Claude', { confirm: true, turnId: 't2', conversationId: 'c1' })
  assert.equal(r.ok, true, 'the user DID answer — refusing here is the loop that cannot be escaped')
  assert.equal(row.display_name, 'Claude')
})

test('…and the loop fix does not open the bypass: a re-proposal of a DIFFERENT name still gates', async () => {
  const row = fakeUser('u5')
  const user = withRow(row)
  await setDisplayName(fastify, user, 'Claude', { turnId: 't1', conversationId: 'c1' })
  // a name the user never saw proposed, invented and confirmed inside one reply
  await setDisplayName(fastify, user, 'Kestrel', { turnId: 't2', conversationId: 'c1' })
  const r = await setDisplayName(fastify, user, 'Kestrel', { confirm: true, turnId: 't2', conversationId: 'c1' })
  assert.equal(r.ok, false, 'a name proposed and confirmed in the same reply is still self-consent')
  assert.equal(row.display_name, null)
})

test('the ledger stays bounded — it is an in-memory map on a live server', () => {
  assert.ok(_pendingRenameCount() < 500, `${_pendingRenameCount()} pending`)
})
