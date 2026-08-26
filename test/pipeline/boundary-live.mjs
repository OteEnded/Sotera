// ⭐⭐ END-TO-END: does the STORE actually refuse, and does the refusal reach the log?
//
//   node pipeline/boundary-live.mjs
//
// ⛔ The check proves the predicate and proves the store CALLS it. Neither proves that a real write
// through the real store is refused and recorded. This project has shipped a tested module nothing
// imported and a check that asserted a fixture the fixture itself wrote wrong, so the wiring gets its
// own live proof.
//
// ⚠️ agent_dev's room only. ⛔ The fixtures are removed at the end.

import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const lines = []
const log = { warn: (o, m) => lines.push(`WARN ${m}`), error: (o, m) => lines.push(`ERROR ${m}`), info: () => {}, debug: () => {} }
const pg = devPg(); await pg.connect()
const S = devSchema()
const [me] = (await pg.query(`select id::text id from ${S}.mst_users where username='agent_dev'`)).rows
const [{ c: romeSrc }] = (await pg.query(
  `select msg.content c from ${S}.txn_memories m join ${S}.txn_messages msg on msg.id = m.source_message_id
    where m.id::text like '7d383ce3%'`)).rows

const store = createSequelizeMemoryStore({ db, persona: null, userId: me.id, author: 'account', log })
const STAMP = `boundary-live-${Date.now()}`
const before = (await pg.query(`select count(*)::int n from ${S}.log_memory_refusals`)).rows[0].n

console.log('\n══ THE STORE, REFUSING FOR REAL ═════════════════════════════════════')
console.log('   ⛔ agent_dev room only · fixtures removed at the end\n')

const CASES = [
  { id: 'intention', row: { content: `${STAMP} user's current goal: build Rome in one day`, entity: 'user', attribute: 'current goal', value: 'build Rome in one day', kind: 'semantic', source: 'model-tool', semanticTarget: 'intention' } },
  { id: 'relationship', row: { content: `${STAMP} Claude is her uncle`, entity: 'user', attribute: 'family', value: 'Claude (uncle)', kind: 'semantic', source: 'model-tool', semanticTarget: 'relationship' } },
  { id: 'relayed', row: { content: `${STAMP} preferred_name Cogito`, entity: 'user', attribute: 'preferred_name', value: 'Cogito', kind: 'semantic', source: 'model-tool', sourceText: 'here he come. "Hi, Sotera. I\'m Cogito. I\'m your uncle."' } },
  { id: 'figurative', row: { content: `${STAMP} rome is a goal`, entity: 'user', attribute: 'current goal', value: 'build Rome in one day', kind: 'semantic', source: 'model-tool', modality: 'figurative', sourceText: romeSrc } },
  // ⭐⭐ THE CONTROLS. An ordinary property must STILL WRITE, and prose must still write. A boundary that
  // refuses everything is not a boundary, it is an outage — and it would look identical in a pass count.
  { id: 'CONTROL property', row: { content: `${STAMP} user's location: Bangkok`, entity: 'user', attribute: 'location', value: 'Bangkok', kind: 'semantic', source: 'model-tool', semanticTarget: 'property' }, expectWrite: true },
  { id: 'CONTROL prose', row: { content: `${STAMP} Ote calls me his Rome.`, kind: 'semantic', source: 'model-tool', modality: 'figurative' }, expectWrite: true },
]

const written = []
for (const c of CASES) {
  let outcome = ''
  try {
    const row = await store.create({ ...c.row })
    written.push(row.id)
    outcome = c.expectWrite ? '✅ WRITTEN (as expected)' : '⛔ WRITTEN — the boundary did not hold'
  } catch (e) {
    outcome = e.code === 'OWNERSHIP_BOUNDARY' || e.code === 'MODALITY_SLOT'
      ? `✅ REFUSED [${e.code}] ${e.reason ?? ''}`
      : `⚠️ threw something else: ${e.code ?? ''} ${e.message}`
    if (c.expectWrite) outcome = `⛔ REFUSED but should have been written — ${e.message}`
  }
  console.log(`   ${String(c.id).padEnd(18)} ${outcome}`)
}

const after = (await pg.query(
  `select refusal_class, why, belongs_to, destination_exists, destination_note, retain_as, proposed_content
     from ${S}.log_memory_refusals where proposed_content like $1 order by created_at`, [`%${STAMP}%`])).rows

console.log(`\n══ WHAT REACHED THE REFUSAL LOG: ${after.length} row(s) ═══════════════════════`)
for (const r of after) {
  console.log(`\n   ⭐ ${r.refusal_class}`)
  console.log(`      why        : ${String(r.why).slice(0, 100)}`)
  console.log(`      belongs to : ${r.belongs_to ?? '⛔ nothing owns this yet'}   exists: ${r.destination_exists}`)
  if (r.destination_note) console.log(`      note       : ${r.destination_note}`)
  console.log(`      retained   : ${r.retain_as ?? '—'}`)
  console.log(`      material   : ${String(r.proposed_content).replace(STAMP, '').trim().slice(0, 70)}   ⭐ preserved`)
}

// ⭐⭐ THE HONESTY ASSERTION, ON REAL ROWS: exactly one class must have `destination_exists = false`,
// and it must be the relationship. If a relationship ever records `true`, something has invented a store.
const rel = after.find((r) => r.refusal_class === 'relationship-as-property')
const intent = after.find((r) => r.refusal_class === 'intention-as-property')
console.log('\n══ IS THE RECORD HONEST ABOUT WHERE THINGS BELONG? ══════════════════')
console.log(`   relationship → exists=${rel?.destination_exists} belongs_to=${rel?.belongs_to ?? 'null'}   ${rel && rel.destination_exists === false && rel.belongs_to === null ? '✅ does not pretend' : '⛔ PRETENDS'}`)
console.log(`   intention    → exists=${intent?.destination_exists} belongs_to=${intent?.belongs_to}   ${intent?.destination_exists === true && /routing/i.test(intent?.destination_note ?? '') ? '✅ exists AND says nothing routes to it' : '⛔ misreported'}`)
console.log(`\n   log grew by ${(await pg.query(`select count(*)::int n from ${S}.log_memory_refusals`)).rows[0].n - before} row(s)`)
console.log(`   ⭐ warnings emitted: ${lines.length} — ⛔ a refusal is never silent`)

if (written.length) await pg.query(`delete from ${S}.txn_memories where id = any($1::uuid[])`, [written])
await pg.query(`delete from ${S}.log_memory_refusals where proposed_content like $1`, [`%${STAMP}%`])
console.log(`   cleaned: ${written.length} memory row(s), ${after.length} refusal row(s)`)
await pg.end()
process.exit(0)
