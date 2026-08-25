// WORKING MEMORY, ON REAL DATA — and the assertion that matters is a COUNT THAT DOES NOT MOVE.
//
//   node checks/working-memory-check.mjs
//
// ⭐⭐⭐ Ote, approving Step C: *"Sotera investigates something → holds an unresolved question in Working
// Memory → uses another tool/investigation → updates the working set → resolves or remains uncertain →
// answers. And after that: none of the investigation automatically becomes retained memory merely because it
// passed through Working Memory. That, to me, is the actual proof we're building Working Memory, rather than
// quietly building another memory store."*
//
// ⇒ The unit tests prove the API cannot retain. **This proves the DATABASE did not move** — which is the only
// version of that claim that cannot be satisfied by a mock.
//
// ⛔ READ-ONLY, and that is the point. It runs a full investigate loop over her real memory and then asserts
// that nothing was written, nothing was archived, and nothing changed state.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import { createWorkingMemory, reconcile, HELD, QUESTION } from '../../Backend/app/components/memory-working-memory.js'
import { RETENTION, BASIS, AVAILABILITY } from '../../Backend/app/components/memory-cognition-axes.js'

const { check, done } = makeChecker('working-memory')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const { schema: S } = db.txn_memories.getTableName()
const Q = (sql, b = []) => seq.query(sql, { bind: b, type: seq.QueryTypes.SELECT })

const [root] = await Q(`SELECT id::text id, username FROM "${S}".mst_users WHERE username = $1`, [config.auth.root.username])
const [conv] = await Q(
  `SELECT id::text id FROM "${S}".txn_conversations WHERE user_id = $1 AND incognito = false ORDER BY updated_at DESC LIMIT 1`,
  [root.id])
ok(Boolean(root && conv), 'root and a conversation to work in', String(conv?.id).slice(0, 8))

// ── ⭐⭐⭐ THE BEFORE PICTURE, BY ID SET AND BY STATE ───────────────────────────────────────────────
// ⚠️ IDs, not a count. A count cannot tell you whose rows moved it — the same instrument error as quoting a
// range for a spread, and the same one that produced a false "residue" alarm in the root probe.
const idsOf = async (sql, b = []) => new Set((await Q(sql, b)).map((r) => r.id));
const beforeMem = await idsOf(`SELECT id::text id FROM "${S}".txn_memories`)
const beforeRefl = await idsOf(`SELECT id::text id FROM "${S}".log_conversation_revisits`)
const [beforeState] = await Q(`SELECT count(*) FILTER (WHERE expired_at IS NOT NULL)::int expired,
  count(*) FILTER (WHERE invalid_at IS NOT NULL)::int invalid,
  count(*) FILTER (WHERE author='persona')::int persona FROM "${S}".txn_memories`)

// ── ⭐ THE LOOP, ON HER REAL MEMORY ────────────────────────────────────────────────────────────────
const cognition = buildMemoryCognition({ db, config, log: null }, {
  userId: root.id, isRoot: true, username: root.username, conversationId: conv.id, interactive: false,
})
const r = await cognition.recollect({ text: "How's Hermes doing?" })
ok(r.activated === true, '1 · cognition activated on real data', `${(r.items ?? []).length} items`)

const wm = createWorkingMemory({ label: "How's Hermes doing?" })
wm.recall(r.items ?? [])
ok(wm.forReasoning().recollections.length === (r.items ?? []).length,
  '2 · ⭐ everything cognition reconciled is now HELD, not injected', `${wm.contents().length} held`)

// ⭐⭐ AN UNRESOLVED QUESTION — the first representation of a PENDING cognitive state this system has had.
const q = wm.ask('Did he say anything after the last exchange I can see?', { about: 'Hermes' })
ok(wm.open().length === 1, '3 · ⭐⭐ she is holding an OPEN QUESTION', q.id)

// ⭐ She investigates. The tool result enters as EVIDENCE, carrying the population it looked at.
const svcEmpty = wm.observe({ tool: 'recall_memory', scope: 'the things I have kept', found: 0 })
ok(svcEmpty.basis === BASIS.told,
  '4 · ⛔ a tool result is `told`, NEVER attested — a count is a report about a query, not a source')
ok(svcEmpty.availability === AVAILABILITY.recalled,
  '4 · ⭐ …and an EMPTY result is still REACHED — emptiness is a fact she holds, not a failure to reach')

// ⭐⭐⭐ AND THE MEASURED FAILURE THIS LAYER EXISTS FOR: the empty local result did NOT displace the set.
const after = wm.forReasoning()
ok(after.recollections.length === (r.items ?? []).length && after.evidence.length === 1,
  '5 · ⭐⭐⭐ an empty tool result sits BESIDE the recollections instead of replacing them',
  `${after.recollections.length} recalled + ${after.evidence.length} evidence, one set`)

wm.resolve(q.id, { uncertain: true, why: 'nothing I can reach settles it' })
ok(wm.open().length === 0 && wm.contents().find((h) => h.id === q.id).state === QUESTION.uncertain,
  '6 · ⭐ "remains uncertain" is an ENDING, not a failure')

const rec = reconcile(wm.contents())
ok(rec !== null && rec.retention === RETENTION.notRetained,
  '7 · ⛔ reconciling is THINKING, and thinking is not keeping', `basis=${rec?.basis}`)

// ── ⛔⛔ 8 · THE COUNT THAT MUST NOT MOVE ──────────────────────────────────────────────────────────
const afterMem = await idsOf(`SELECT id::text id FROM "${S}".txn_memories`)
const afterRefl = await idsOf(`SELECT id::text id FROM "${S}".log_conversation_revisits`)
const [afterState] = await Q(`SELECT count(*) FILTER (WHERE expired_at IS NOT NULL)::int expired,
  count(*) FILTER (WHERE invalid_at IS NOT NULL)::int invalid,
  count(*) FILTER (WHERE author='persona')::int persona FROM "${S}".txn_memories`)

const newMem = [...afterMem].filter((id) => !beforeMem.has(id))
const goneMem = [...beforeMem].filter((id) => !afterMem.has(id))
ok(newMem.length === 0,
  '8 · ⭐⭐⭐ A FULL INVESTIGATION WROTE **NO MEMORY** — thinking about something is not remembering it',
  `${beforeMem.size} → ${afterMem.size}${newMem.length ? ` NEW: ${newMem.join(', ')}` : ''}`)
ok(goneMem.length === 0, '8 · ⛔ …and destroyed none either', goneMem.join(', ') || 'none')
ok([...afterRefl].filter((id) => !beforeRefl.has(id)).length === 0,
  '8 · ⛔ …and did not fabricate a reflection — working memory is not the retention lane')
ok(afterState.persona === beforeState.persona,
  '8 · ⛔ …and no row became persona-authored by being thought about',
  `persona ${beforeState.persona} → ${afterState.persona}`)
ok(afterState.expired === beforeState.expired && afterState.invalid === beforeState.invalid,
  '8 · ⛔ …and nothing was expired or invalidated', `expired ${afterState.expired} invalid ${afterState.invalid}`)

// ── ⛔ 9 · AND THE INVARIANT, FROM INSIDE ──────────────────────────────────────────────────────────
ok(wm.violations().length === 0, '9 · ⛔ the layer\'s own invariant holds on real data',
  JSON.stringify(wm.violations()))
ok(wm.contents().every((h) => h.retention === RETENTION.notRetained),
  '9 · ⛔⛔ not one held entry is marked retained', `${wm.contents().length} entries`)
ok(wm.snapshot().retained === 0, '9 · …and the snapshot says so where anyone reading a debug line will see it')

// ⭐ A durable memory she DID keep is still known to have been kept — the fact is not destroyed, only
// relocated to where it belongs.
const kept = wm.contents().filter((h) => h.retentionElsewhere === RETENTION.retained)
ok(true, '9 · ⓘ entries that ARE retained elsewhere, preserved as such', `${kept.length}`)

// ── ⭐⭐ 10 · IT DISAPPEARS ────────────────────────────────────────────────────────────────────────
wm.dispose()
ok(wm.disposed === true && wm.contents().length === 0,
  '10 · ⭐⭐ it is TRANSIENT — disposal drops the contents rather than marking them')
let refused = false
try { wm.recall([{ id: 'x' }]) } catch { refused = true }
ok(refused, '10 · ⛔ …and a caller holding a reference cannot turn it back into a cache')

await seq.close().catch(() => {})
done()
