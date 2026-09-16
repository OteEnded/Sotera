// ⭐ MEASUREMENT for derivation ③ — WHAT DOES THE MODEL ACTUALLY RECEIVE from `remember_fact`?
//
//   node test/maintenance/measure-remember-fact-result.mjs
//
// ⛔ Not reasoned about — SERIALISED, exactly as `chat-site.route.js` serialises it:
//     resultStr = typeof result === 'string' ? result : JSON.stringify(result)
//
// Two calls: one that will SUCCEED and one that the M2 gate will REFUSE on the governed canary slot.
// ⭐ If both serialise identically, the model cannot tell a kept fact from a refused one — which is the
// defect, stated as a measurement rather than as an argument.
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryToolService } from '../../Backend/app/components/memory-pipeline-host.js'
import { devPg, devSchema } from '../harness.mjs'
import { WRITER as ZZ_WRITER, ACT_KIND as ZZ_ACT_KIND } from '../../Backend/app/components/memory-writer-contracts.js'

// ⭐ D1 PHASE 3 (Ote, 2026-09-16): the store now REFUSES a write or a memory-semantic mutation with no declared
// writer. This check drives the store DIRECTLY, as an operator would, so it declares the axes it was already
// exercising — *"test/check → declares the writer/act/reach it claims to exercise."* ⛔ Spread FIRST, so any call
// that declares its own writer still wins.
const ZZ_AXES = { writer: ZZ_WRITER.operator, act: { kind: ZZ_ACT_KIND.operator, id: `zz_measure_remember_fact_result_${Date.now()}` } }


const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (s, p = []) => (await pg.query(s, p)).rows

const [me] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
if (!me) throw new Error('agent_dev not found')
const t = Date.now()
const ATTR_OK = `zz_rf_${t}`
const CANARY = 'build tag for this cycle'

const mem = buildMemoryToolService(fastify, { ...ZZ_AXES, userId: me.id, author: 'account', scope: 'room' })

// ⭐ EXACTLY what `PortableComponents/Packages/Memory/index.js:113` hands back from the tool handler.
const a = mem.reconcileFactAsync({ entity: 'user', attribute: ATTR_OK, value: 'probe' })
const b = mem.reconcileFactAsync({ entity: 'user', attribute: CANARY, value: `zz_rf_never_${t}` })

console.log('── what the tool handler RETURNS (own keys) ────────────────────────────')
console.log(`  will SUCCEED : keys=${JSON.stringify(Object.keys(a))}  settled is a ${a.settled?.constructor?.name}`)
console.log(`  will REFUSE  : keys=${JSON.stringify(Object.keys(b))}`)

console.log('\n── ⭐⭐⭐ WHAT THE MODEL RECEIVES — JSON.stringify, the route\'s own line ──')
console.log(`  will SUCCEED : ${JSON.stringify(a)}`)
console.log(`  will REFUSE  : ${JSON.stringify(b)}`)
console.log(`\n  ⇒ identical: ${JSON.stringify(a) === JSON.stringify(b)}`)

// let both settle, then show what actually happened
await mem._drainWrites().catch(() => {})
await new Promise((r) => { setTimeout(r, 500) })
const [okRow] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE attribute = $1`, [ATTR_OK])
const [refused] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE value = $1`, [`zz_rf_never_${t}`])
const live = await q(
  `SELECT m.value FROM ${S}."txn_memories" m JOIN ${S}."mst_slots" s ON s.id = m.slot_id
    WHERE s.canonical_label = $1 AND s.user_id = $2::uuid AND m.invalid_at IS NULL AND m.expired_at IS NULL`,
  [CANARY, me.id])

console.log('\n── ⚠️ WHAT ACTUALLY HAPPENED, which the model was NOT told ─────────────')
console.log(`  the first  wrote ${okRow.n} row(s)`)
console.log(`  the second wrote ${refused.n} row(s)   ⇐ REFUSED by the M2 gate`)
console.log(`  canary still live: ${JSON.stringify(live.map((r) => r.value))}`)

await pg.query(`DELETE FROM ${S}."txn_memories" WHERE attribute = $1`, [ATTR_OK])
await pg.query(`DELETE FROM ${S}."mst_slots" WHERE canonical_label = $1`, [ATTR_OK])
const [clean] = await q(
  `SELECT (SELECT count(*)::int FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_rf_%') AS m,
          (SELECT count(*)::int FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_rf_%') AS s`)
console.log(`\n⭐ teardown ASSERTED: memories=${clean.m} slots=${clean.s}`)
await pg.end(); await db.txn_memories.sequelize.close()
