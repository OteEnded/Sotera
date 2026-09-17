// ⭐⭐⭐ THE READ-SIDE ADMISSION PROJECTION — Ote's controls A–G, 2026-09-17.
//
//   node test/checks/admission-read-projection-check.mjs
//
// ── ⭐ WHAT WAS RULED, AND WHAT THIS PROVES ────────────────────────────────────────────────────────
//
//     *"A downstream consumer may READ an existing admission verdict as a factual record of what the
//      memory system established during the admission act."*
//     *"…but the verdict alone does not authorize the consumer to turn that information into a new
//      semantic claim about how the two memories should be presented together."*
//
// ⇒ this suite proves the FIRST half works and the SECOND half is STRUCTURALLY IMPOSSIBLE to violate:
// the projection carries the admission vocabulary unchanged, and ⛔ there is no function anywhere in the
// module that could turn a verdict into "compatible", "conflict", "contradiction" or "current".
//
// ── ⛔⛔ THE CONTROL THAT MATTERS MOST IS **A** ─────────────────────────────────────────────────────
// `NO-RECORDED-VERDICT ≠ DEFER`. A DEFER means an evaluation HAPPENED and failed to establish the
// warrant; an absent row means NO SUCH EVALUATION IS RECORDED. ⭐ A projection that answered DEFER for a
// pair it has never seen would manufacture an act that never occurred — and it would pass every other
// control in this file. That is why A is first.
import { makeChecker, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import {
  READ_ADMISSION, indexAdmissionFacts, verdictBetween, projectAdmissionFacts,
} from '../../Backend/app/components/memory-admission-read.js'
import * as READMOD from '../../Backend/app/components/memory-admission-read.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { WRITER as W, ACT_KIND as AK } from '../../Backend/app/components/memory-writer-contracts.js'

const { check, done } = makeChecker()
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const schema = devSchema()
const seq = db.txn_memories.sequelize
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r = {}) => seq.query(s, { replacements: r })

const t = Date.now()
const ACT = `zz_rdadm_${t}`
const MADE = []
let userId = null

/** ⭐ Insert a ledger row DIRECTLY. Legitimate for a READ projection: the thing under test is reading
 *  what is recorded. ⛔ And it cannot fabricate nonsense — 053's CHECK refuses an ABSTAIN with a NULL
 *  side and an ADMIT whose keys differ, so every fixture below is a semantically valid record. */
const ledger = (incoming, incumbent, outcome, inKey, cumKey, why = 'fixture') => X(
  `INSERT INTO "${schema}"."log_memory_admissions"
     (incoming_id, incumbent_id, incoming_question_key, incumbent_question_key,
      outcome, why, route, writer, act_kind, act_id, occasion, persona, user_id)
   VALUES (:a, :b, :ik, :ck, :o, :w, 'q-route', 'operator', 'operator', :act, :act, NULL, :u)`,
  { a: incoming, b: incumbent, ik: inKey, ck: cumKey, o: outcome, w: why, act: ACT, u: userId },
)

try {
  const [u] = await Q(`SELECT id::text FROM "${schema}"."mst_users" WHERE username = 'agent_dev'`)
  if (!u) throw new Error('agent_dev not found — this check must never run as root')
  userId = u.id

  // ══ 0 · ⭐⭐⭐ THE STRUCTURAL REGRESSION CONTROL (Ote §6) — THE FORBIDDEN MAPPINGS CANNOT EXIST ═════
  //
  // ⛔ "ADMIT → compatible · DEFER → unresolved conflict · ABSTAIN → contradictory" are NOT established.
  // ⭐ Asserted over the module's REAL EXPORT SURFACE, ⛔ not over a comment: a helper added later with
  // any of those names fails this check before it can acquire a caller.
  const exported = Object.keys(READMOD)
  const banned = /compatib|conflict|contradict|current|merge|present|jointly|shouldshow|hide/i
  check('0 · ⭐⭐⭐ NO FORBIDDEN VOCABULARY IN THE EXPORT SURFACE — ⛔ the verdict cannot become a '
    + 'presentation decision, and the ABSENCE of those helpers IS the contract',
  !exported.some((k) => banned.test(k)), `exports: ${exported.join(', ')}`)
  check('0a · ⭐ the four states are exactly four, and NO-RECORDED-VERDICT is one of them',
    Object.keys(READ_ADMISSION).length === 4 && READ_ADMISSION.none === 'NO-RECORDED-VERDICT',
    JSON.stringify(READ_ADMISSION))
  // ⭐ The source must not quietly grow a mapping table either — a `const X = { ADMIT: 'compatible' }`
  // would pass the export check above. ⛔ Asserted on the file, with comments stripped so the file's own
  // PROHIBITIONS (which name the banned words on purpose) cannot make this vacuous or falsely red.
  const src = readFileSync(new URL('../../Backend/app/components/memory-admission-read.js', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  check('0b · ⭐⭐ …and no mapping table hides in the CODE either (comments stripped, so the file’s own '
    + 'written prohibitions cannot make this vacuous)', !banned.test(src),
  banned.test(src) ? `found: ${src.match(banned)}` : 'clean')

  // ── fixtures: two ordinary memories, written through the REAL path ────────────────────────────────
  const mem = buildMemoryV2(fastify, {
    userId, writer: W.operator, act: { kind: AK.operator, id: ACT },
  })
  const a1 = await mem.reconcileFact({ entity: 'user', attribute: `zz_rdadmA${t}`, value: 'alpha', source: 'zz_rdadm' })
  const a2 = await mem.reconcileFact({ entity: 'user', attribute: `zz_rdadmB${t}`, value: 'beta', source: 'zz_rdadm' })
  MADE.push(a1.id, a2.id)

  // ══ A · ⭐⭐⭐ NO RECORDED VERDICT — and it is ⛔ NOT a DEFER ═══════════════════════════════════════
  // ⭐ the SAME store the host builds — persona null (DEFAULT_PERSONA), so the scoping under test is the
  // production scoping, ⛔ not a relaxed one.
  const store = createSequelizeMemoryStore({ db, persona: null, userId })
  // ⚠️⭐ THE PRECONDITION IS ASSERTED, ⛔ NOT ASSUMED — and the first draft of this control got it wrong.
  // `zz_rdadmA<t>` and `zz_rdadmB<t>` differ by ONE CHARACTER, so the cosine arm GROUPED them, admission
  // really ran, and a real DEFER was really recorded. ⭐ The projection was right and the CONTROL was
  // wrong. ⇒ find an ordered pair the ledger provably has no row for, and FAIL LOUDLY if none exists,
  // rather than asserting an absence the fixtures do not guarantee.
  const NONEA = `zz_rdadm_none_${t}`
  const n1 = await mem.reconcileFact({ entity: 'user', attribute: `${NONEA}_aurora`, value: 'one', source: 'zz_rdadm' })
  const n2 = await mem.reconcileFact({ entity: 'project', attribute: `${NONEA}_kiln`, value: 'two', source: 'zz_rdadm' })
  MADE.push(n1.id, n2.id)
  const rawA = await store.admissionFactsFor([n1.id, n2.id])
  const projA = projectAdmissionFacts(rawA, [n1.id, n2.id])
  const vA = verdictBetween(indexAdmissionFacts(rawA), n1.id, n2.id)
  check('A0 · ⚠️⭐ PRECONDITION ASSERTED — the ledger genuinely holds NO row for this ordered pair. '
    + '⛔ Without this the control would "prove" absence using a pair that was never isolated',
  rawA.filter((f) => f.incomingId === n1.id && f.incumbentId === n2.id).length === 0,
  `${rawA.length} ledger rows among the pair`)
  check('A · ⭐⭐⭐ TWO MEMORIES WITH NO LEDGER ENTRY READ AS **NO-RECORDED-VERDICT** — ⛔ NOT DEFER. '
    + 'A DEFER means an evaluation happened; an absent row means none is recorded',
  vA.outcome === READ_ADMISSION.none && vA.recorded === false,
  `outcome=${vA.outcome} recorded=${vA.recorded}`)
  check('A1 · ⭐⭐ …and the projection INVENTS NO PAIRS — ⛔ it never enumerates unevaluated combinations, '
    + 'which would assert they were candidates for one another',
  projA.evaluatedPairs === 0 && projA.recorded.length === 0, JSON.stringify(projA.byOutcome))
  check('A2 · ⭐ the projected object carries NO currency/compatibility key at all',
    !banned.test(JSON.stringify(projA)), Object.keys(projA).join(','))

  // ══ B · ⭐⭐ A GENUINE DEFER, WRITTEN BY THE REAL ADMISSION PATH ═══════════════════════════════════
  const dAttr = `zz_rdadmD${t}`
  const d1 = await mem.reconcileFact({ entity: 'user', attribute: dAttr, value: 'first', source: 'zz_rdadm' })
  const d2 = await mem.reconcileFact({ entity: 'user', attribute: dAttr, value: 'second, different', source: 'zz_rdadm' })
  MADE.push(d1.id, d2.id)
  const rawB = await store.admissionFactsFor([d1.id, d2.id])
  const vB = verdictBetween(indexAdmissionFacts(rawB), d2.id, d1.id) // ⭐ incoming → incumbent
  check('B · ⭐⭐ A REAL DEFER IS READ BACK AS **DEFER**, EXACTLY — ⛔ not translated into anything',
    vB.outcome === READ_ADMISSION.defer && vB.recorded === true,
    `outcome=${vB.outcome} pairs=${rawB.length}`)
  const [bRows] = await Q(`SELECT
      count(*) FILTER (WHERE invalid_at IS NOT NULL)::int dead,
      count(*) FILTER (WHERE contradicted_at IS NOT NULL)::int contra
    FROM "${schema}"."txn_memories" WHERE id IN (:i)`, { i: [d1.id, d2.id] })
  check('B1 · ⭐⭐ NEITHER MEMORY IS MARKED contradicted, invalidated, current OR compatible — ⭐ DEFER '
    + 'REMAINS COEXISTENCE, ⛔ it is not a refusal and not a conflict',
  bRows.dead === 0 && bRows.contra === 0, `dead=${bRows.dead} contradicted=${bRows.contra}`)
  check('B2 · ⭐ the DEFER record carries its own `why`, ⛔ not an interpretation supplied by the reader',
    typeof vB.fact?.why === 'string' && vB.fact.why.length > 10, String(vB.fact?.why).slice(0, 60))

  // ══ C · ⭐⭐ ABSTAIN — two ESTABLISHED and DIFFERENT question identities ═══════════════════════════
  // ⓘ Inserted directly: ABSTAIN is structurally unreachable organically (1 declared key in the corpus),
  // ⭐ and 053's CHECK still refuses an ABSTAIN with a missing side, so the fixture cannot be invalid.
  await ledger(a1.id, a2.id, 'ABSTAIN', `zz_k1_${t}`, `zz_k2_${t}`, 'two different declared questions')
  const rawC = await store.admissionFactsFor([a1.id, a2.id])
  const vC = verdictBetween(indexAdmissionFacts(rawC), a1.id, a2.id)
  check('C · ⭐⭐ ABSTAIN IS READ BACK AS **ABSTAIN** — ⛔ never translated into "contradiction"',
    vC.outcome === READ_ADMISSION.abstain, `outcome=${vC.outcome}`)
  check('C1 · ⭐ …and BOTH established keys survive the projection, distinct',
    vC.fact?.incomingQuestionKey === `zz_k1_${t}` && vC.fact?.incumbentQuestionKey === `zz_k2_${t}`,
    `${vC.fact?.incomingQuestionKey} vs ${vC.fact?.incumbentQuestionKey}`)

  // ══ D · ⭐⭐ ADMIT — two ESTABLISHED and EQUAL question identities ═════════════════════════════════
  const e1 = await mem.reconcileFact({ entity: 'user', attribute: `zz_rdadmE${t}`, value: 'e-one', source: 'zz_rdadm' })
  const e2 = await mem.reconcileFact({ entity: 'user', attribute: `zz_rdadmF${t}`, value: 'e-two', source: 'zz_rdadm' })
  MADE.push(e1.id, e2.id)
  await ledger(e1.id, e2.id, 'ADMIT', `zz_same_${t}`, `zz_same_${t}`, 'both answer the same declared question')
  const rawD = await store.admissionFactsFor([e1.id, e2.id])
  const vD = verdictBetween(indexAdmissionFacts(rawD), e1.id, e2.id)
  check('D · ⭐⭐ ADMIT IS READ BACK AS **ADMIT** — ⛔ never translated into "compatible" or "both true"',
    vD.outcome === READ_ADMISSION.admit, `outcome=${vD.outcome}`)
  check('D1 · ⭐ …and the projection asserts nothing about truth, currency or presentation',
    !banned.test(JSON.stringify(projectAdmissionFacts(rawD, [e1.id, e2.id]))), 'clean')

  // ══ E · ⭐⭐⭐ ONE MEMORY, SEVERAL PAIRS — ⛔ NO ROW-LEVEL SINGLE VALUE ════════════════════════════
  // ⭐ THE CONTROL THAT FORBIDS `memory.admission = 'DEFER'`. `a1` now sits in an ABSTAIN with `a2` and
  // a DEFER with `e1`. A row-level field would have to pick one, and either choice would be a lie.
  await ledger(a1.id, e1.id, 'DEFER', null, null, 'neither side established')
  const ids5 = [a1.id, a2.id, e1.id, e2.id]
  const raw5 = await store.admissionFactsFor(ids5)
  const idx5 = indexAdmissionFacts(raw5)
  const proj5 = projectAdmissionFacts(raw5, ids5)
  const vAB = verdictBetween(idx5, a1.id, a2.id)
  const vAE = verdictBetween(idx5, a1.id, e1.id)
  check('E · ⭐⭐⭐ ONE MEMORY PARTICIPATES IN TWO PAIRS WITH DIFFERENT OUTCOMES, AND BOTH SURVIVE '
    + 'INDEPENDENTLY — ⛔ no row-level collapse is even expressible',
  vAB.outcome === READ_ADMISSION.abstain && vAE.outcome === READ_ADMISSION.defer,
  `a1→a2=${vAB.outcome} · a1→e1=${vAE.outcome}`)
  check('E1 · ⭐ every projected entry NAMES BOTH IDS — the record stays pairwise',
    proj5.recorded.every((f) => f.incomingId && f.incumbentId),
    `${proj5.evaluatedPairs} pairs · ${JSON.stringify(proj5.byOutcome)}`)

  // ══ E2 · ⭐⭐ DIRECTION IS PRESERVED — `A→B` is a different question from `B→A` ════════════════════
  // ⭐⭐⭐ STRONGER THAN THE FIRST DRAFT. I originally asserted the reverse direction was ABSENT; the run
  // showed it was a REAL DEFER (the organic write evaluated a2→a1 before I inserted a1→a2 ABSTAIN).
  // ⇒ the same unordered pair carries TWO DIFFERENT RECORDS, which proves direction is preserved far
  // better than an absence could — an index that conflated them could not produce two outcomes.
  const fwd = verdictBetween(idx5, a1.id, a2.id).outcome
  const rev = verdictBetween(idx5, a2.id, a1.id).outcome
  check('E2 · ⭐⭐⭐ THE ACT IS DIRECTIONAL — the SAME unordered pair carries DIFFERENT records in the two '
    + 'directions. ⛔ Two indexed columns do not make the EVENT undirected, and an index that conflated '
    + 'them could not produce two outcomes',
  fwd === READ_ADMISSION.abstain && rev === READ_ADMISSION.defer && fwd !== rev,
  `a1→a2=${fwd} · a2→a1=${rev}`)

  // ══ F · ⭐⭐ A DEAD ROW'S OLD RECORD MUST NOT CLAIM THE PROPOSITION IS CURRENTLY TRUE ══════════════
  await X(`UPDATE "${schema}"."txn_memories" SET invalid_at = now() WHERE id = :i`, { i: e2.id })
  const rawF = await store.admissionFactsFor([e1.id, e2.id])
  const vF = verdictBetween(indexAdmissionFacts(rawF), e1.id, e2.id)
  check('F · ⭐⭐ THE HISTORICAL RECORD SURVIVES ITS SUBJECT — an invalidated row’s ADMIT is still '
    + 'readable as a fact about the ACT (051: history outlives its subject)',
  vF.outcome === READ_ADMISSION.admit, `outcome=${vF.outcome}`)
  check('F1 · ⭐⭐⭐ …and it makes NO CURRENCY CLAIM — ⛔ the projection has no field that could say the '
    + 'old proposition is true now, and ⛔ recall never returns the dead row anyway',
  !banned.test(JSON.stringify(vF)) && !('current' in (vF.fact ?? {})),
  `keys: ${Object.keys(vF.fact ?? {}).join(',')}`)
  const liveF = await Q(`SELECT id::text FROM "${schema}"."txn_memories"
    WHERE id = :i AND invalid_at IS NULL AND expired_at IS NULL`, { i: e2.id })
  check('F2 · ⭐ the dead row is genuinely out of every live read path',
    liveF.length === 0, `${liveF.length} live`)

  // ══ G · ⭐⭐⭐ QUESTION-PIN INTEGRITY — the RECORDED key, ⛔ never the slot's CURRENT question ══════
  // ⭐ The ledger stores the keys AS THEY WERE AT ADMISSION. Repointing a slot afterwards must not
  // retro-edit history — 048's whole reason for existing.
  const beforeG = (await store.admissionFactsFor([e1.id, e2.id]))
    .find((f) => f.incomingId === e1.id && f.incumbentId === e2.id)
  await X(`UPDATE "${schema}"."mst_slots" SET question_id = NULL WHERE canonical_label LIKE 'zz_rdadm%'`)
  const afterG = (await store.admissionFactsFor([e1.id, e2.id]))
    .find((f) => f.incomingId === e1.id && f.incumbentId === e2.id)
  check('G · ⭐⭐⭐ THE PROJECTION READS THE RECORDED ADMISSION KEYS AND IS UNMOVED BY THE SLOT’S CURRENT '
    + 'BINDING — ⛔ it never follows memory → slot → question to reinterpret history',
  beforeG?.incomingQuestionKey === afterG?.incomingQuestionKey
    && afterG?.incomingQuestionKey === `zz_same_${t}`,
  `before=${beforeG?.incomingQuestionKey} after=${afterG?.incomingQuestionKey}`)
  check('G1 · ⭐⭐ A NULL RECORDED KEY STAYS NULL — ⛔ never "different question", ⛔ never "same as the '
    + 'slot", ⛔ never "unknown ⇒ assume". It means NO QUESTION IDENTITY WAS ESTABLISHED',
  vAE.fact?.incomingQuestionKey === null && vAE.fact?.incumbentQuestionKey === null,
  `${vAE.fact?.incomingQuestionKey} / ${vAE.fact?.incumbentQuestionKey}`)

  // ══ H · ⭐⭐⭐ THE MANDATORY SEAM — the projection HAS A PRODUCTION READER ═════════════════════════
  // ⛔ `question_id_at_admission` sat unread for a year. A projection nobody calls would be that defect
  // rebuilt. ⇒ assert `recall()` actually carries it, on the real host wiring.
  const rec = await mem.recall({ query: 'alpha beta', limit: 8 })
  check('H · ⭐⭐⭐ `recall()` CARRIES THE PROJECTION — ⛔ not a field with no reader (the defect '
    + '`question_id_at_admission` embodied for a year)',
  !!rec.admission && Array.isArray(rec.admission.recorded) && typeof rec.admission.evaluatedPairs === 'number',
  `admission=${JSON.stringify(rec.admission?.byOutcome ?? null)} pairs=${rec.admission?.evaluatedPairs}`)
  check('H1 · ⛔⛔ AND IT DOES **NOT** REACH THE MODEL — the passive route maps every hit to `.content`, '
    + 'so the projection rides the DEVELOPER half only. ⭐ Asserted on the route’s real source',
  /recallMemories\s*=\s*hits\.filter\(.*?\)\.map\(\(m\)\s*=>\s*m\.content\)/.test(
    readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')),
  'route still reduces hits to content')
  check('H2 · ⭐⭐ …and `search()` — which DOES reach the model via `recall_memory` — carries NO '
    + 'admission key. ⛔ The narrowing is real, not decorative',
  !('admission' in (await mem.search('alpha beta', { limit: 8 }))),
  Object.keys(await mem.search('alpha beta', { limit: 8 })).join(','))
} finally {
  // ══ ⭐ TEARDOWN — ASSERTED, ⛔ never trusted. Ledger by ACT (it outlives the rows it judged) ═══════
  const ids = [...new Set(MADE.filter(Boolean))]
  await X(`DELETE FROM "${schema}"."log_memory_admissions" WHERE act_id = :a`, { a: ACT })
  if (ids.length) await X(`DELETE FROM "${schema}"."txn_memories" WHERE id IN (:i)`, { i: ids })
  await X(`DELETE FROM "${schema}"."txn_memories" WHERE attribute LIKE 'zz_rdadm%' OR source = 'zz_rdadm'`)
  await X(`DELETE FROM "${schema}"."log_slot_bindings" WHERE slot_id IN
             (SELECT id FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_rdadm%')`)
  await X(`DELETE FROM "${schema}"."log_slot_aliases" WHERE slot_id IN
             (SELECT id FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_rdadm%')`)
  await X(`DELETE FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_rdadm%'`)
  const [left] = await Q(
    `SELECT (SELECT count(*)::int FROM "${schema}"."txn_memories" WHERE attribute LIKE 'zz_rdadm%' OR source = 'zz_rdadm') AS m,
            (SELECT count(*)::int FROM "${schema}"."mst_slots" WHERE canonical_label LIKE 'zz_rdadm%') AS s,
            (SELECT count(*)::int FROM "${schema}"."log_memory_admissions" WHERE act_id = :a) AS led`, { a: ACT })
  check('⭐ TEARDOWN ASSERTED — ⛔ no `zz_rdadm` residue, and this check removed every ledger row it wrote',
    left.m === 0 && left.s === 0 && left.led === 0,
    `memories=${left.m} slots=${left.s} ledger=${left.led}`)
  await seq.close()
  done()
}
