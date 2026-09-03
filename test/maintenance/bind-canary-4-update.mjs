// ⭐⭐⭐ STEP 4 · THE FIRST LIVE GOVERNED UPDATE — through the REAL writer, on the REAL corpus.
//
//   node test/maintenance/bind-canary-4-update.mjs [NEW-TAG]
//
// ⭐ This is an OPERATOR act, and that is not a workaround: `commitToMemory` — the model-tool path — has
// its own closed field list and cannot supply a claim kind yet, so the only writer that can declare one
// today is `reconcileFact` called directly. Step 5 observes what the model-tool path does instead.
//
// ── ⚠️⚠️ WHY THIS SCRIPT WIRES `auditLog`, AND WHAT IT COST TO LEARN ──────────────────────────────
// The first run of this act confirmed FIVE of Ote's six and failed the fourth: `supersedes_id` was set
// correctly and `log_memory_changes` held NOTHING. The cause was HERE, ⛔ not in the gate — this script
// built the service with `createMemoryV2Service({store, slotStore})` and the host's contract is explicit:
//
//     store     REQUIRED — memory is broken without it
//     slotStore OPTIONAL — absent means facts write with slot_id null
//     auditLog  OPTIONAL — ⚠️ absent means beliefs still change, THE TRAIL IS MISSING
//
// ⇒ a harness that omits an OPTIONAL adapter does not observe the system; it observes a system missing a
// part. ⭐ The same family as the persistence-boundary lesson: an assertion about a trail must run against
// the wiring that actually produces the trail. So the three adapters are now wired the way
// `memory-v2-host.js` wires them, `snapshot` included.
//
// ⛔ It asserts the six things Ote named, each against the BEFORE snapshot rather than against a hope:
//   ① the superseded value became HISTORICAL, ⛔ not deleted   ② exactly ONE live row remains
//   ③ the new row carries `question_id_at_admission`            ④ a supersede audit exists
//   ⑤ the bind is still in place                                ⑥ ⛔ NO sibling slot changed
import { readFileSync, writeFileSync } from 'node:fs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { createSlotStore } from '../../Backend/app/components/memory-slot-store-host.js'
import { logMemoryChange, snapshot } from '../../Backend/app/audit/memory-log.js'
import { createMemoryV2Service } from '@ote/memory/cognition/memory-v2-service.js'
import { devSchema } from '../harness.mjs'
import { SLOT, QUESTION, ACTOR } from './bind-canary-common.mjs'

/** ⭐ The same SHAPE, a new tag — exactly what a build-tag slot is FOR. */
const NEW_VALUE = process.argv[2] || 'CANARY-884127'
/** ⭐ The value the slot held when Ote approved the act — history must still show it. */
const APPROVED_ORIGINAL = 'CANARY-653912'

const before = JSON.parse(readFileSync(new URL('../results/canary-bind-before.json', import.meta.url), 'utf8'))
const SLOT_ID = before.slot.id
const START = new Date().toISOString()

let fail = 0
const ok = (label, pass, detail = '') => {
  if (!pass) fail += 1
  console.log(`${pass ? '  OK ' : '  ❌ '} ${label}${detail ? `\n        ${detail}` : ''}`)
}

loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const schema = devSchema()
const seq = db.txn_memories.sequelize
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT, logging: false })
const S = `"${schema}"`

const userId = before.room.id
// ⭐ ALL THREE ADAPTERS, wired as `memory-v2-host.js` wires them. ⛔ The audit one is not optional HERE:
// confirmation ④ is an assertion ABOUT the trail, so a harness without it could only ever fail.
const store = createSequelizeMemoryStore({ db, persona: null, userId })
const slotStore = createSlotStore({ db, persona: null, userId })
const auditLog = (entry) => logMemoryChange(db, {
  ...entry, ...(entry?.before ? { before: snapshot(entry.before) } : {}),
})
const mem = createMemoryV2Service({ store, slotStore, auditLog, persona: null, userId, actor: ACTOR })

const [liveBefore] = await Q(
  `SELECT id::text, value FROM ${S}."txn_memories"
    WHERE slot_id = :s AND invalid_at IS NULL AND expired_at IS NULL`, { s: SLOT_ID })
if (!liveBefore) { console.log('⛔ no live row on the canary slot — STOP'); await seq.close(); process.exit(1) }

console.log('── THE ACT ────────────────────────────────────────────────────────────')
console.log(`slot       ${SLOT_ID}  (${SLOT.entity} / ${SLOT.label} · ${SLOT.room})`)
console.log(`old value  ${JSON.stringify(liveBefore.value)}   row ${liveBefore.id}`)
console.log(`new value  ${JSON.stringify(NEW_VALUE)}`)
console.log(`claimKind  ${QUESTION.key}`)

const w = await mem.reconcileFact({
  entity: SLOT.entity, attribute: SLOT.label, value: NEW_VALUE, claimKind: QUESTION.key,
})
console.log(`result     ${JSON.stringify({ ok: w?.ok, action: w?.action, id: w?.id })}`)
// ⭐ the audit write is fire-and-forget by design; give it its tick before reading the trail back.
await new Promise((r) => setTimeout(r, 250))

console.log('── ⭐ THE SIX CONFIRMATIONS ────────────────────────────────────────────')
ok('the write was ALLOWED and it was an UPDATE', w?.ok === true && w?.action === 'update',
  `ok=${w?.ok} action=${w?.action}`)

const [oldAfter] = await Q(
  `SELECT id::text, value, (invalid_at IS NOT NULL) AS retired, invalid_at
     FROM ${S}."txn_memories" WHERE id = :i`, { i: liveBefore.id })
const [original] = await Q(
  `SELECT id::text, value, (invalid_at IS NOT NULL) AS retired FROM ${S}."txn_memories"
    WHERE slot_id = :s AND value = :v`, { s: SLOT_ID, v: APPROVED_ORIGINAL })
ok('① the superseded value is HISTORICAL, ⛔ NOT deleted — and the ORIGINAL approved value is still there too',
  !!oldAfter && oldAfter.value === liveBefore.value && oldAfter.retired === true
  && !!original && original.value === APPROVED_ORIGINAL,
  `superseded: present=${!!oldAfter} value=${JSON.stringify(oldAfter?.value)} retired=${oldAfter?.retired}`
  + `\n        ${APPROVED_ORIGINAL}: present=${!!original} retired=${original?.retired}`)

const liveRows = await Q(
  `SELECT id::text, value FROM ${S}."txn_memories"
    WHERE slot_id = :s AND invalid_at IS NULL AND expired_at IS NULL`, { s: SLOT_ID })
ok('② exactly ONE live row remains, and it holds the new value',
  liveRows.length === 1 && liveRows[0].value === NEW_VALUE,
  `live=${liveRows.length} values=${JSON.stringify(liveRows.map((r) => r.value))}`)

const [newRow] = await Q(
  `SELECT id::text, question_id_at_admission::text AS pin, supersedes_id::text AS sup, value
     FROM ${S}."txn_memories" WHERE id = :i`, { i: w?.id })
const [question] = await Q(
  `SELECT id::text FROM ${S}."mst_slot_questions" WHERE question_key = :k`, { k: QUESTION.key })
ok('③ the new row is PINNED to the declared question — ⛔ not a green built on an expected NULL',
  newRow?.pin === question.id, `pin=${newRow?.pin ?? 'NULL'} expected=${question.id}`)

const audit = await Q(
  `SELECT action, actor, reason, memory_id::text, related_id::text, before, after
     FROM ${S}."log_memory_changes" WHERE slot_id = :s AND created_at >= :t ORDER BY created_at`,
  { s: SLOT_ID, t: START })
const supersedeRow = audit.find((a) => a.action === 'supersede')
ok('④ the supersede is AUDITED — `supersedes_id` on the new row AND a change-log entry naming the actor',
  newRow?.sup === liveBefore.id && !!supersedeRow,
  `supersedes=${newRow?.sup ?? 'NULL'} log_rows=${audit.length} `
  + `entry=${supersedeRow ? JSON.stringify({ action: supersedeRow.action, actor: supersedeRow.actor, memory_id: supersedeRow.memory_id, related_id: supersedeRow.related_id }) : 'NONE'}`)

const [slotNow] = await Q(
  `SELECT s.question_id::text AS qid, q.question_key,
          (SELECT count(*)::int FROM ${S}."log_slot_bindings" WHERE slot_id = s.id) AS bindings
     FROM ${S}."mst_slots" s LEFT JOIN ${S}."mst_slot_questions" q ON q.id = s.question_id
    WHERE s.id = :i`, { i: SLOT_ID })
ok('⑤ the BIND is still in place — a write does not disturb the binding',
  slotNow?.question_key === QUESTION.key && slotNow.bindings === 2,
  `asks=${slotNow?.question_key} binding_rows=${slotNow?.bindings}`)

// ⭐ ⑥ THE BLAST-RADIUS CONTROL — fingerprints compared against the recorded prior state, ⛔ not a count.
const sibsNow = await Q(
  `SELECT id::text, entity, canonical_label, namespace, question_id::text, write_count, updated_at
     FROM ${S}."mst_slots" WHERE user_id = :u::uuid AND id <> :s::uuid ORDER BY id`,
  { u: userId, s: SLOT_ID })
const fp = (r) => `${r.id}|${r.entity}|${r.canonical_label}|${r.namespace}|${r.question_id ?? ''}|${r.write_count}|${new Date(r.updated_at).toISOString()}`
const drifted = sibsNow.filter((r, i) => fp(r) !== fp(before.siblings[i] ?? {}))
ok(`⑥ ⛔ NO sibling slot changed — all ${before.siblings.length} fingerprints identical to the BEFORE snapshot`,
  sibsNow.length === before.siblings.length && drifted.length === 0,
  drifted.length ? `drifted: ${drifted.map((d) => d.canonical_label).join(', ')}` : 'byte-identical')

const [totals] = await Q(
  `SELECT (SELECT count(*)::int FROM ${S}."mst_slots" WHERE question_id IS NOT NULL) AS bound_slots,
          (SELECT count(*)::int FROM ${S}."txn_memories" WHERE question_id_at_admission IS NOT NULL) AS pinned,
          (SELECT count(*)::int FROM ${S}."txn_memories") AS memories`)
console.log(`── corpus: bound_slots=${totals.bound_slots} pinned_rows=${totals.pinned} memories=${totals.memories}`)

const allRows = await Q(
  `SELECT id::text, value, supersedes_id::text, question_id_at_admission::text AS pin, invalid_at, created_at
     FROM ${S}."txn_memories" WHERE slot_id = :s ORDER BY created_at`, { s: SLOT_ID })
console.log('── the slot\'s full history ────────────────────────────────────────────')
for (const r of allRows) {
  console.log(`  ${new Date(r.created_at).toISOString()}  ${String(r.value).padEnd(16)}`
    + ` live=${!r.invalid_at ? 'YES' : 'no '}  pin=${r.pin ? 'build-tag' : 'NULL     '}  supersedes=${r.supersedes_id ?? '—'}`)
}
writeFileSync(new URL('../results/canary-bind-after-update.json', import.meta.url),
  JSON.stringify({ captured_at: new Date().toISOString(), new_value: NEW_VALUE,
    write: { ok: w?.ok, action: w?.action, id: w?.id }, slot: slotNow, rows: allRows, audit, totals }, null, 2), 'utf8')

console.log(fail === 0 ? '\n⭐⭐⭐ ALL SIX CONFIRMED.' : `\n⛔ ${fail} CONFIRMATION(S) FAILED.`)
await seq.close()
process.exit(fail === 0 ? 0 : 1)
