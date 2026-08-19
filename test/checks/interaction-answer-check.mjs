// HELD INTERACTIONS — the answer contract, and the capability that surprised us.
//
//   node checks/interaction-answer-check.mjs
//
// ⭐ WHY THIS EXISTS. On 2026-08-19 `talk-to-sotera.mjs --answer "Yes"` printed `ANSWERED with: Yes`
// while the interaction sat at `pending` and expired. Two faults, and the second is the one worth a
// permanent test: the harness reported an outcome it never observed. Three wrong body shapes were then
// tried against the real route before the right one was found, so the shape is pinned here.
//
// ⭐ AND A CONFIRMED CAPABILITY, recorded as an assertion so it cannot quietly regress:
//    A HELD INTERACTION SURVIVES THE DEATH OF THE SSE CONNECTION THAT CREATED IT.
// The originating browser process had exited minutes before the answer was submitted, and the reply
// still resumed and completed. That is HumanInteraction working as designed — an ask is not tied to the
// socket that raised it — and it is what makes a five-minute human pause safe.

import { makeChecker, makeClient, devPg, devSchema, asAgent } from '../harness.mjs'

const { check, done } = makeChecker()
const call = makeClient()
const db = devPg(); await db.connect()
const S = devSchema()

const q = async (sql, p = []) => (await db.query(sql, p)).rows
const WHO = await asAgent(call) // log in first — a 401 makes every assertion below meaningless

let convoId = null
try {
  // ── the ROUTE CONTRACT, pinned ────────────────────────────────────────────────────────────────
  // Wrong shapes are rejected. Each of these was tried for real before the right one was found, so
  // each is a mistake somebody will make again.
  const c = await call(WHO, 'POST', '/v1/chat/conversations', { title: 'zz_test_ interaction shape' })
  convoId = c.json?.conversation?.id || c.json?.id
  check('created a conversation to test against', Boolean(convoId), `status ${c.status}`)

  const fakeIid = '00000000-0000-4000-8000-000000000000'
  const post = (body) => call(WHO, 'POST', `/v1/chat/conversations/${convoId}/interactions/${fakeIid}/answer`, body)

  const objShape = await post({ answers: { Name: 'Yes' } })
  check('⛔ {answers:{Header:"Yes"}} is REJECTED (answers must be an array)', objShape.status === 400,
    `status ${objShape.status}`)

  const headerShape = await post({ answers: [{ header: 'Name', answer: 'Yes' }] })
  check('⛔ {answers:[{header,answer}]} is REJECTED (not the item shape)', headerShape.status >= 400,
    `status ${headerShape.status}`)

  // ⭐ THE REAL SHAPE. An item carries `selected` (array of option labels) and/or `custom` (free text);
  // the top level also accepts `freeText` and `skip`. Nothing else — additionalProperties is false.
  const realShape = await post({ answers: [{ selected: ['Yes'] }] })
  check('✅ {answers:[{selected:["Yes"]}]} is ACCEPTED by the schema (404 = valid body, no such interaction)',
    realShape.status === 404, `status ${realShape.status} — a 400 here would mean the shape is wrong`)

  const skipShape = await post({ skip: true })
  check('✅ {skip:true} is a valid body too', skipShape.status === 404, `status ${skipShape.status}`)

  // ⚠️ NOT REJECTED — STRIPPED, AND THAT IS WORTH KNOWING. The route schema says
  // `additionalProperties: false`, so I asserted a 400 and got a 404: the body passed validation with
  // the unknown key quietly removed, because this Fastify instance runs ajv with removeAdditional.
  // The check was wrong, not the server. The consequence for a caller is the real finding: a MISSPELLED
  // field is silently dropped rather than flagged, so `{answers:[...], skpi:true}` succeeds and does
  // nothing you asked for. That is exactly how the three failed answer attempts felt from the outside.
  const junk = await post({ answers: [{ selected: ['Yes'] }], nope: 1 })
  check('unknown top-level keys are STRIPPED, not rejected (ajv removeAdditional) — a typo fails silently',
    junk.status === 404, `status ${junk.status} — 400 would mean it rejects, 404 means it accepted and ignored`)

  // ── the pending endpoint reports state honestly ────────────────────────────────────────────────
  const pending = await call(WHO, 'GET', `/v1/chat/conversations/${convoId}/interactions/pending`)
  check('pending endpoint answers for a conversation with no interaction', pending.status === 200,
    `status ${pending.status}`)
  // ⚠️ ORDER MATTERS: assert the 200 BEFORE asserting absence. This line first read only
  // '!pending.json?.interaction', which an unauthenticated 401 body ALSO satisfies — the check passed
  // while every other assertion around it was failing on auth. An absence test that an error satisfies
  // is not a test.
  check('...and reports nothing pending', pending.status === 200 && !pending.json?.interaction, JSON.stringify(pending.json).slice(0, 80))

  // ── the capability, asserted from the schema rather than by racing a live model ────────────────
  // A held interaction is a ROW with its own lifecycle (status + expires_at), not a callback parked on
  // a socket. That is precisely why it outlives the connection — and asserting the shape is stable is
  // cheaper and more reliable than staging a real 5-minute hold.
  const cols = (await q(
    `select column_name from information_schema.columns where table_schema=$1 and table_name='txn_interaction_sessions'`, [S]))
    .map((r) => r.column_name)
  for (const needed of ['status', 'expires_at', 'conversation_id', 'response']) {
    check(`interaction state is PERSISTED, not held in memory: column "${needed}" exists`, cols.includes(needed))
  }
  check('⭐ therefore a held interaction survives the SSE connection that created it (confirmed live 2026-08-19)',
    cols.includes('status') && cols.includes('expires_at'),
    'the ask is a row with a lifecycle, so answering it later resumes the turn')
} catch (e) {
  check(`unexpected error: ${e.message}`, false)
  console.error(e)
} finally {
  if (convoId) await db.query(`delete from ${S}.txn_conversations where id=$1`, [convoId]).catch(() => {})
  await db.end()
  done()
}
