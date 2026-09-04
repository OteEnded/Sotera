// ⭐⭐⭐ STEP 5 · THE REFUSAL CONTROL — what happens when a writer that CANNOT declare a claim kind
// meets a governed slot. Ote, 2026-09-03: *"Do not teach the tool before this test."*
//
//   node test/maintenance/bind-canary-5-refusal.mjs
//
// ── ⭐⭐ TWO WRITERS ARE OBSERVED, BECAUSE THE TOOL PATH IS NOT THE ONLY CLOSED FIELD LIST ──────────
//   A · THE MODEL-TOOL WRITER — `keep()` calls `mem.reconcileFactAsync({entity, attribute, value})`
//       (retention-host.js:261). Three fields. ⛔ No kind can reach the gate through it.
//   B · THE EXTRACTOR / PIPELINE WRITER — `commitToMemory(mem, obs)` builds its own explicit arg list.
//       ⭐ This one is proved BEHAVIOURALLY rather than by a source scan: a `claimKind` is supplied AT
//       THE CALLER and a delegating spy records what actually reached the store. Present at one end,
//       absent at the other ⇒ the closed list is DEMONSTRATED, ⛔ not grepped for.
//
// ⛔ Neither write may leave a trace: the new canary value must stay live and no replacement row may exist.
import { readFileSync, writeFileSync } from 'node:fs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { createSlotStore } from '../../Backend/app/components/memory-slot-store-host.js'
import { logMemoryChange, snapshot } from '../../Backend/app/audit/memory-log.js'
import { commitToMemory } from '../../Backend/app/components/memory-pipeline-host.js'
import { createMemoryV2Service } from '@ote/memory/cognition/memory-v2-service.js'
import { devSchema } from '../harness.mjs'
import { SLOT, QUESTION, ACTOR, OCCASION } from './bind-canary-common.mjs'

const ATTEMPT_A = 'CANARY-000111-tool'
const ATTEMPT_B = 'CANARY-000222-extractor'

const before = JSON.parse(readFileSync(new URL('../results/canary-bind-before.json', import.meta.url), 'utf8'))
const SLOT_ID = before.slot.id

let fail = 0
const ok = (label, pass, detail = '') => {
  if (!pass) fail += 1
  console.log(`${pass ? '  OK ' : '  ❌ '} ${label}${detail ? `\n        ${detail}` : ''}`)
}

loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const schema = devSchema()
const seq = db.txn_memories.sequelize
seq.options.logging = false
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT, logging: false })
const S = `"${schema}"`
const userId = before.room.id

// ⭐ A recording logger — the refusal's ONLY channel on the async path, so it is captured rather than lost.
const logged = []
const log = { error: (...a) => logged.push(a), warn: (...a) => logged.push(a), info: () => {}, debug: () => {} }

// ⭐ THE CONSUMING OCCASION. Since 2026-09-04 a write to the (bound) canary slot must be able to name
// the occasion it happens in — otherwise it cannot establish that it is not the very act that
// declared or bound `build-tag`. ⛔ Distinct from OCCASION.declare / .propose / .confirm, which is
// exactly the separation the rule asks for.
const realStore = createSequelizeMemoryStore({ db, persona: null, userId, log, occasion: OCCASION.refusal })
// ⭐ THE BOUNDARY SPY — delegating, so what it records is the row that genuinely went on to be written.
const seen = []
const store = new Proxy(realStore, {
  get: (t, p) => (p !== 'create' ? Reflect.get(t, p) : async (row) => { seen.push(row); return t.create(row) }),
})
const slotStore = createSlotStore({ db, persona: null, userId, log })
const auditLog = (entry) => logMemoryChange(db, { ...entry, ...(entry?.before ? { before: snapshot(entry.before) } : {}) })
const mem = createMemoryV2Service({ store, slotStore, auditLog, persona: null, userId, actor: ACTOR, log })

const state = async () => {
  const rows = await Q(
    `SELECT id::text, value, (invalid_at IS NULL AND expired_at IS NULL) AS live
       FROM ${S}."txn_memories" WHERE slot_id = :s ORDER BY created_at`, { s: SLOT_ID })
  const [c] = await Q(
    `SELECT (SELECT count(*)::int FROM ${S}."log_memory_changes" WHERE slot_id = :s) AS audit,
            (SELECT question_id::text FROM ${S}."mst_slots" WHERE id = :s) AS bound`, { s: SLOT_ID })
  return { rows, live: rows.filter((r) => r.live), audit: c.audit, bound: c.bound }
}

const S0 = await state()
console.log('── BEFORE THE REFUSAL CONTROL ─────────────────────────────────────────')
console.log(`rows=${S0.rows.length} live=${JSON.stringify(S0.live.map((r) => r.value))} audit_rows=${S0.audit} bound=${!!S0.bound}`)
if (S0.live.length !== 1) { console.log('⛔ not exactly one live row — STOP'); await seq.close(); process.exit(1) }
const LIVE_VALUE = S0.live[0].value

// ══ A · THE MODEL-TOOL WRITER ═══════════════════════════════════════════════════════════════════
console.log('\n── A · THE MODEL-TOOL WRITER (`keep` → reconcileFactAsync, three fields) ──')
const immediate = mem.reconcileFactAsync({ entity: SLOT.entity, attribute: SLOT.label, value: ATTEMPT_A })
console.log(`immediate return  ${JSON.stringify(immediate)}`)
try { await mem._drainWrites() } catch { /* the lane absorbs; the world state is the evidence */ }
await new Promise((r) => setTimeout(r, 250))

const SA = await state()
ok('A1 · the refusal held — ⛔ NO replacement row was written',
  SA.rows.length === S0.rows.length && !SA.rows.some((r) => r.value === ATTEMPT_A),
  `rows ${S0.rows.length} → ${SA.rows.length} · attempted value present: ${SA.rows.some((r) => r.value === ATTEMPT_A)}`)
ok('A2 · ⭐ the new canary value is STILL LIVE — a refusal leaves the previous belief exactly as it was',
  SA.live.length === 1 && SA.live[0].value === LIVE_VALUE,
  `live=${JSON.stringify(SA.live.map((r) => r.value))} (was ${JSON.stringify([LIVE_VALUE])})`)
ok('A3 · ⛔ nothing was retired and no audit row was written — the refusal did not MUTATE',
  SA.audit === S0.audit && SA.rows.filter((r) => r.live).length === 1,
  `audit ${S0.audit} → ${SA.audit}`)
const refusalLogged = logged.some((a) => JSON.stringify(a).includes('REPLACEMENT_REFUSED')
  || JSON.stringify(a).toLowerCase().includes('refused a replacement'))
ok('A4 · the refusal reached the LOG', refusalLogged, `log entries captured: ${logged.length}`)

// ⚠️⚠️ THE CONSEQUENCE OTE ASKED THIS CANARY TO EXPOSE, and it is not the refusal itself.
ok('A5 · ⚠️⚠️ …but the WRITER was told `{ok:true, queued:true}` BEFORE the gate ever ran — '
  + '`reconcileFactAsync` returns at enqueue time, so a governed refusal is INVISIBLE to the model tool',
  immediate?.ok === true && immediate?.queued === true, JSON.stringify(immediate))

// ══ B · THE EXTRACTOR / PIPELINE WRITER ═════════════════════════════════════════════════════════
console.log('\n── B · THE EXTRACTOR SEAM (`commitToMemory`, its own arg list) ────────────')
const seenBefore = seen.length
let thrown = null
try {
  // ⭐ THE CALLER SUPPLIES A KIND. If `commitToMemory` were open, this would be ALLOWED.
  await commitToMemory(mem, {
    owner: SLOT.entity, attribute: SLOT.label, value: ATTEMPT_B, claimKind: QUESTION.key,
  })
} catch (e) { thrown = e }

const rowB = seen.slice(seenBefore).at(-1) ?? null
ok('B1 · ⭐⭐ the closed field list DROPPED the supplied `claimKind` — present at the caller, absent at '
  + 'the store. ⛔ Demonstrated, not grepped',
  !!rowB && Object.hasOwn(rowB, 'claimKind') === false,
  `store saw claimKind: ${rowB ? Object.hasOwn(rowB, 'claimKind') : 'NO ROW REACHED THE STORE'}`)
ok('B2 · and the write was REFUSED — synchronously, so THIS caller does learn',
  thrown?.code === 'REPLACEMENT_REFUSED', thrown ? `${thrown.code}: ${thrown.message}` : 'NOT REFUSED')
ok('B3 · the refusal names the slot\'s question and the missing kind',
  thrown?.slotKind === QUESTION.key && (thrown?.claimKind ?? null) === null,
  `slotKind=${thrown?.slotKind} claimKind=${thrown?.claimKind ?? 'null'}`)

const SB = await state()
ok('B4 · ⭐ the world is as it was — same rows, same live value, same audit count, still bound',
  SB.rows.length === S0.rows.length && SB.live.length === 1 && SB.live[0].value === LIVE_VALUE
  && SB.audit === S0.audit && SB.bound === S0.bound,
  `rows=${SB.rows.length} live=${JSON.stringify(SB.live.map((r) => r.value))} audit=${SB.audit} bound=${!!SB.bound}`)

console.log('\n── the slot\'s full history, unchanged by both attempts ────────────────')
for (const r of SB.rows) console.log(`  ${String(r.value).padEnd(16)} live=${r.live ? 'YES' : 'no '}`)

writeFileSync(new URL('../results/canary-bind-refusal.json', import.meta.url),
  JSON.stringify({ captured_at: new Date().toISOString(), attempted: { A: ATTEMPT_A, B: ATTEMPT_B },
    immediate_return_to_model_tool: immediate,
    thrown: thrown ? { code: thrown.code, reason: thrown.reason, scope: thrown.scope, slotKind: thrown.slotKind, claimKind: thrown.claimKind, message: thrown.message } : null,
    before: S0, after: SB, log_entries: logged.length }, null, 2), 'utf8')

console.log(fail === 0 ? '\n⭐⭐⭐ REFUSAL CONTROL CONFIRMED.' : `\n⛔ ${fail} ASSERTION(S) FAILED.`)
await seq.close()
process.exit(fail === 0 ? 0 : 1)
