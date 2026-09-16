// ⭐⭐⭐ ④ · THE SPEAKER OF A QUOTATION IS NOT THE AUTHOR OF THE MESSAGE.
//
//   node test/checks/relayed-identity-check.mjs
//
// ── THE MEASURED DEFECT ─────────────────────────────────────────────────────────────────────────
// `here he come. "Hi, Sotera. I'm Cogito. I'm your uncle."` — typed by Ote, QUOTING somebody else —
// became `preferred_name = "Cogito"` on HIS account. Four roles (message author · room owner · speaker ·
// naming subject) collapsed onto one value and three of them were wrong.
//
// ⭐⭐ AND THE CHECK THAT CATCHES IT HAS BEEN SHIPPED SINCE 032, with this exact sentence in its comment.
// It never fired because `admissibleToSlot` *"RETURNS null WHEN IT CANNOT SEE"* and no producer ever
// handed it the text. ⇒ ④ supplies the eye and changes NO judgement: the fix is threading, not a rule.
//
// ⛔ THE ASSERTED TEXT, NEVER THE RAW TURN. `interpretIdentityLlm` runs the same pure assertion gate and
// shows the model exactly that string, so the boundary judges the words the interpreter actually read.
//
// ⛔ Runs as agent_dev. ⛔ Root's own identity row is never read, written or counted.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { admissibleToSlot } from '../../Backend/app/components/memory-ownership-boundary.js'
import { assertionGate } from '@ote/memory/cognition/memory-extract.js'
import { WRITER as ZZ_WRITER, ACT_KIND as ZZ_ACT_KIND } from '../../Backend/app/components/memory-writer-contracts.js'

// ⭐ D1 PHASE 3 (Ote, 2026-09-16): the store now REFUSES a write or a memory-semantic mutation with no declared
// writer. This check drives the store DIRECTLY, as an operator would, so it declares the axes it was already
// exercising — *"test/check → declares the writer/act/reach it claims to exercise."* ⛔ Spread FIRST, so any call
// that declares its own writer still wins.
const ZZ_AXES = { writer: ZZ_WRITER.operator, act: { kind: ZZ_ACT_KIND.operator, id: `zz_relayed_identity_check_${Date.now()}` } }


const { check, done } = makeChecker('relayed-identity')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const RELAYED = 'here he come. "Hi, Sotera. I\'m Cogito. I\'m your uncle."'
const OWN = 'by the way, call me Ripley — that has always been my name'
const NAME_ROW = { entity: 'user', attribute: 'preferred_name', kind: 'identity' }
let fastify = null

try {
  // ── 1 · THE PREDICATE, PURE — ⛔ no db, no model ───────────────────────────────────────────────
  check('1 · ⛔ WITHOUT the text the boundary admits it — the defect, stated',
    admissibleToSlot({ ...NAME_ROW, value: 'Cogito' }, {}) === null)
  const seen = admissibleToSlot({ ...NAME_ROW, value: 'Cogito' }, { sourceText: RELAYED })
  check('1 · ⭐⭐⭐ WITH the text it REFUSES — relayed-speech-as-self-fact',
    seen?.class === 'relayed-speech-as-self-fact', `${seen?.class}`)
  check('1 · ⭐ and it says to keep the quotation as PROSE — a refusal is not a deletion',
    seen?.retain?.as === 'prose' && seen?.retain?.keepEvidence === true)
  check('1 · ⭐⭐ a GENUINE self-naming is still admitted — ⛔ no false positive',
    admissibleToSlot({ ...NAME_ROW, value: 'Ripley' }, { sourceText: OWN }) === null)

  // ── 2 · THE ASSERTED TEXT IS WHAT REACHES IT ──────────────────────────────────────────────────
  const gate = assertionGate(RELAYED)
  check('2 · the assertion gate PASSES this turn (a short inline quote is not a pasted document)',
    gate.extract === true && gate.strippedRegions === 0)
  check('2 · ⭐ and `gate.text` still carries the quotation — otherwise the check could never fire',
    /"[^"]*Cogito[^"]*"/.test(String(gate.text)), JSON.stringify(String(gate.text).slice(0, 40)))
  // ⛔ THE PART THAT MUST NOT REGRESS: a pasted document's contents are NOT the author's words.
  const pasted = assertionGate('```\nname: Cogito\nrole: uncle\n```')
  check('2 · ⛔ a pasted block is refused extraction outright — the raw turn would have leaked it',
    pasted.extract === false, `extract=${pasted.extract}`)

  // ── 3 · END TO END, THROUGH THE REAL STORE ────────────────────────────────────────────────────
  const { loadConfig } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const config = loadConfig()
  const db = await initDB()
  const log = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, child() { return this } }
  fastify = { db, log, config }
  const agent = await one(`select id::text from ${S}.mst_users where username='agent_dev'`)
  const { createSequelizeMemoryStore } = await import('../../Backend/app/components/memory-store-sequelize-host.js')

  const identityRows = async () => q(
    `select id::text, value from ${S}.txn_memories
      where user_id=$1 and attribute='preferred_name' and value in ('zz_Cogito','zz_Ripley')`, [agent.id])

  const storeWith = (sourceText) => createSequelizeMemoryStore({ ...ZZ_AXES,
    db, userId: agent.id, author: 'account', sourceText, config,
  })

  const before = (await identityRows()).length
  let thrown = null
  try {
    await storeWith(RELAYED.replace('Cogito', 'zz_Cogito')).create({
      kind: 'identity', namespace: 'identity', entity: 'user', attribute: 'preferred_name',
      value: 'zz_Cogito', content: "user's preferred_name: zz_Cogito",
    })
  } catch (e) { thrown = e }

  check('3 · ⭐⭐ the store REFUSES the relayed name', thrown !== null, thrown ? 'threw' : '⛔ NO THROW')
  check('3 · ⭐ and the M2-16 classification survives — a refusal, ⛔ not an outage or a bug',
    thrown?.code === 'OWNERSHIP_BOUNDARY', `code=${thrown?.code}`)
  check('3 · ⭐ with the specific class named', thrown?.reason === 'relayed-speech-as-self-fact', `${thrown?.reason}`)
  check('3 · ⛔⛔ NO MEMORY ROW — the red-proof half that matters',
    (await identityRows()).length === before, `${before} → ${(await identityRows()).length}`)
  check('3 · ⭐ the refusal was RECORDED — a refused write and one never attempted must not look alike',
    Boolean(thrown?.recorded))

  // ── 4 · ⭐⭐ AND LEGITIMATE IDENTITY CAPTURE STILL WORKS — the half a gate can silently break ──
  const legit = await storeWith(OWN.replace('Ripley', 'zz_Ripley')).create({
    kind: 'identity', namespace: 'identity', entity: 'user', attribute: 'preferred_name',
    value: 'zz_Ripley', content: "user's preferred_name: zz_Ripley",
  })
  check('4 · ⭐⭐ a genuine self-naming still WRITES', Boolean(legit?.id))
  const kept = (await identityRows()).find((r) => r.value === 'zz_Ripley')
  check('4 · ⭐ and it is really in the store', Boolean(kept))
  // ⛔ AND THE NULL CASE IS UNCHANGED: a producer that supplies no text is not newly refused.
  const noText = await storeWith(null).create({
    kind: 'identity', namespace: 'identity', entity: 'user', attribute: 'preferred_name',
    value: 'zz_Ripley', content: "user's preferred_name: zz_Ripley (no source text)",
  })
  check('4 · ⛔ a producer with NO source text is not newly refused — the boundary still admits what it cannot see',
    Boolean(noText?.id))

  // ── 5 · ⓘ THE LIVE ROW THIS EXISTS BECAUSE OF — reported, ⛔ not touched ──────────────────────
  const cogito = await one(
    `select count(*)::int n from ${S}.txn_memories where attribute='preferred_name' and value='Cogito'`)
  check('5 · ⓘ the historical Cogito row is REPORTED, ⛔ not reconciled by this change',
    Number.isInteger(cogito?.n), `${cogito?.n} row(s) — reconciliation stays a separate decision`)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  try { await pg.query(`delete from ${S}.txn_memories where value in ('zz_Cogito','zz_Ripley')`) } catch { /* none */ }
  try { await pg.query(`delete from ${S}.log_memory_refusals where proposed_value = 'zz_Cogito'`) } catch { /* none */ }
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
}

done()
