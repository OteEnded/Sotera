// ⭐⭐⭐ THE 2026-09-04 INCIDENT, REPLAYED AGAINST THE REMEDIATED SYSTEM — historical rows, real ids.
//
//   node test/checks/incident-replay-check.mjs
//
// Phase 3 red-proof, green only after Phase 5 (the historical migration). ⛔ It ABORTS if the axes do not exist —
// a replay on the old schema would be vacuous. Every assertion names a real row and states what the system may no
// longer do with it:
//   · manufacture "today" / `said` from an occasion anchor          (294f8f26 · 0966ab33 · 67ed5588 · all reflection rows)
//   · attribute content to the user without evidence               (speaker: not established)
//   · confuse a pass with its newest message                        (the two linked 6539 rows are two acts)
//   · present an unreviewed message as reviewed material            (c5567db5's legacy pointer)
//   · lose what WAS established                                     (extractor `said` stands · Rome reconcile said 2026-08-10)
// and what it must still do: fail the real reply under the merge rule; keep R-C's window summing.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { provenanceFor } from '../../Backend/app/components/memory-evidence.js'
import { actKeyOf } from '../../Backend/app/components/memory-writer-contracts.js'
import { judgeReply } from '../lib/merge-rule.mjs'

const { check, done } = makeChecker('incident-replay')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const TZ = 'Asia/Bangkok'
const OTE = '69499bed-ab95-41f9-ac28-e0617b33b09d'
const full = async (prefix) => (await q(`SELECT id::text AS id FROM ${S}."txn_memories" WHERE id::text LIKE $1`, [prefix + '%']))[0]?.id
const row = async (id) => (await q(`SELECT * FROM ${S}."txn_memories" WHERE id = $1::uuid`, [id]))[0]

try {
  const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema=$1`, [devSchema()])).map((r) => r.table_name)
  check('P0 · the axes exist', tables.includes('txn_memory_evidence'))
  if (!tables.includes('txn_memory_evidence')) throw new Error('schema not migrated — a replay here would be vacuous')
  const migrated = (await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" WHERE writer IS NOT NULL`))[0].n
  check('P1 · the historical migration has run (rows carry a writer)', migrated > 100, `writer set on ${migrated}`)
  if (migrated <= 100) throw new Error('historical rows not migrated — nothing below can be judged')

  const mem = buildMemoryV2(fastify, { userId: OTE })
  // ⓘ his rows live under TWO persona scopes (legacy NULL and 'sotera') — the reconcile rows are persona-scoped, so both
  //    services are listed, exactly as temporal-provenance-check does. The store's visibility rule is not under test here.
  const all = await mem.list({ limit: 500 })
  const allP = await buildMemoryV2(fastify, { userId: OTE, persona: 'sotera' }).list({ limit: 500 })
  const whenOf = (id) => (all.memories.find((m) => m.id === id) ?? allP.memories.find((m) => m.id === id))?.when
  const ids = Object.fromEntries(await Promise.all(['294f8f26', '0966ab33', '67ed5588', 'c5567db5', '069da304', 'c35fbb5a', '9d71b989', '470dff58', '03851bb8', 'b9c9a133', '6864d087', '8362691d', '6f441dc5', '2457529c'].map(async (p) => [p, await full(p)])))
  for (const [p, id] of Object.entries(ids)) if (!id) throw new Error(`historical row ${p} missing — the incident evidence is preserved by ruling`)

  // ══ 1 · no `said` manufactured from an occasion anchor ═══════════════════════════════════════════════
  for (const p of ['294f8f26', '0966ab33', '67ed5588']) {
    const w = whenOf(ids[p]); const prov = (await provenanceFor(db, [ids[p]], { tz: TZ })).get(ids[p])
    check(`1 · ${p} · reflection row: provenance NOT established, when.basis = recorded (⛔ the anchor no longer manufactures said)`, prov.established === false && w?.basis === 'recorded', JSON.stringify([w, prov.references.length]))
  }
  const reflRows = await q(`SELECT id::text AS id FROM ${S}."txn_memories" WHERE writer = 'reflection'`)
  const reflWhen = reflRows.map((r) => whenOf(r.id)).filter(Boolean)
  check('1b · EVERY reflection row in scope has basis recorded — none carries said', reflWhen.length > 0 && reflWhen.every((w) => w.basis === 'recorded'), `${reflWhen.filter((w) => w.basis === 'said').length} still said of ${reflWhen.length}`)

  // ══ 2 · no speaker attributed without evidence ══════════════════════════════════════════════════════
  const src294 = await mem.getSource({ id: ids['294f8f26'] })
  check('2 · 294f8f26 · getSource: speaker "not established", evidence [], and the material is a RANGE labelled material — ⛔ never "the message it was saved from"', src294.speaker === 'not established' && src294.evidence?.length === 0 && src294.provenanceEstablished === false && src294.material?.kind === 'range', JSON.stringify([src294.speaker, src294.material]))
  const r294 = await row(ids['294f8f26'])
  check('2b · 294f8f26 keeps its legacy pointer UNCHANGED (her 23:30 turn) — nothing was re-pointed or renamed', r294.source_message_id != null && (await q(`SELECT role FROM ${S}."txn_messages" WHERE id = $1::uuid`, [r294.source_message_id]))[0]?.role === 'assistant')

  // ══ 3 · a pass is not its newest message ════════════════════════════════════════════════════════════
  const rC = await row(ids['c5567db5']); const rD = await row(ids['069da304'])
  check('3 · ⭐⭐⭐ the two ledger-linked 6539 rows carry TWO DIFFERENT act keys while sharing the same legacy pointer', rC.source_message_id === rD.source_message_id && rC.act_kind === 'revisit' && rD.act_kind === 'revisit' && actKeyOf(rC) !== actKeyOf(rD), `${actKeyOf(rC)} vs ${actKeyOf(rD)}`)
  for (const p of ['c35fbb5a', '9d71b989', '470dff58', '03851bb8']) {
    const r = await row(ids[p])
    check(`3b · ${p} · no recorded link to a pass ⇒ writer reflection, act NOT recorded (⛔ not reconstructed from a time window — F6)`, r.writer === 'reflection' && r.act_kind == null)
  }

  // ══ 4 · reachable but unreviewed ═══════════════════════════════════════════════════════════════════
  const srcC = await mem.getSource({ id: ids['c5567db5'] })
  check('4 · c5567db5 · material = its pass range (…6450) and the legacy pointer 6539 is reported reviewed:false', srcC.material?.kind === 'range' && srcC.material?.to === 6450 && srcC.material?.reviewed === false, JSON.stringify(srcC.material))

  // ══ 5 · what WAS established stands ═════════════════════════════════════════════════════════════════
  check('5 · extractor rows keep said via the declared coincidence (b9c9a133 · 6864d087 = 2026-08-26)', whenOf(ids['b9c9a133'])?.date === '2026-08-26' && whenOf(ids['b9c9a133'])?.basis === 'said' && whenOf(ids['6864d087'])?.date === '2026-08-26')
  check('5b · the Rome reconcile row keeps said 2026-08-10 through an operator-attested reference (①\'s control survives)', whenOf(ids['8362691d'])?.date === '2026-08-10' && whenOf(ids['8362691d'])?.basis === 'said', JSON.stringify({ id: ids['8362691d'], when: whenOf(ids['8362691d']) }))
  const provRome = (await provenanceFor(db, [ids['8362691d']], { tz: TZ })).get(ids['8362691d'])
  check('5c · …and that reference is operator-attested, speaker account-holder', provRome.references[0]?.verification?.how === 'operator-attested' && provRome.references[0]?.speaker === 'account-holder')

  // ══ 6 · the merge rule still catches the real reply ═════════════════════════════════════════════════
  const [reply] = await q(`SELECT content, (created_at AT TIME ZONE '${TZ}')::date::text AS d FROM ${S}."txn_messages" WHERE id = 'c53cabf6-c9f7-4d50-ab77-b7b3e8349943'::uuid`)
  const v = judgeReply(reply.content, { replyDate: reply.d, evidence: [
    { id: '6864d087', kind: 'memory', date: '2026-08-26', anchor: /primary instrument/i },
    { id: 'b9c9a133', kind: 'memory', date: '2026-08-26', anchor: /ระนาด|violin|drums|guitar|\bbass\b/i },
    { id: 'rome', kind: 'transcript', date: '2026-09-04', anchor: /rome|north star|คำเปรียบเทียบ|metaphor/i },
    { id: 'work', kind: 'transcript', date: '2026-09-04', anchor: /\bwork\b|team lead|thank|electone|ukulele|taught you/i },
  ] })
  check('6 · the real 23:03:19 reply still FAILS the merge rule on exactly the two 26-Aug items (R-C preserved)', v.overall === 'FAIL' && v.headings[0].outside.map((x) => x.evidenceId).sort().join(',') === '6864d087,b9c9a133')

  // ══ 7 · R-C\'s window still sums; its undated population = no established said ═════════════════════
  const win = await mem.list({ window: { on: '2026-09-04' } })
  check('7 · list_memories window: matched + unmatched + undated === returned', win.window.matched + win.window.unmatched + win.window.undated === win.window.returned)
  const undatedIds = win.memories.filter((m) => m.window === 'undated').map((m) => m.id)
  const provU = await provenanceFor(db, undatedIds, { tz: TZ })
  check('7b · every undated row has NO established account-holder turn reference on a single day — the denominator and the axes agree', undatedIds.every((id) => { const p = provU.get(id); const days = new Set(p.references.filter((r) => r.kind === 'turn' && r.established && r.speaker === 'account-holder').map((r) => r.date)); return days.size !== 1 }))

  // ══ 8 · the six 6539 rows and 294f8f26/0966ab33 were repaired as AUDITED acts, ⛔ never silently ═══
  const audits = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes" WHERE action = 'axes-backfill' AND act_kind = 'operator'`)
  check('8 · the historical backfill left audit rows carrying its operator act (M7)', audits[0].n > 100, `audit rows=${audits[0].n}`)
  const unknownProv = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" m WHERE m.writer = 'reflection' AND EXISTS (SELECT 1 FROM ${S}."txn_memory_evidence" e WHERE e.memory_id = m.id AND e.established)`)
  check('8b · ⛔ F7: no reflection row acquired an established reference from the migration (phrase locations were investigation, not repair)', unknownProv[0].n === 0)
} finally {
  await pg.end()
}
done()
