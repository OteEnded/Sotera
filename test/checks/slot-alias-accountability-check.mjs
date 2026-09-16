// ⭐⭐⭐ A3 · THE ALIAS IS A GOVERNED SEMANTIC OPERATION — writer · occasion · lineage, and a refused write teaches nothing.
//
//   node test/checks/slot-alias-accountability-check.mjs
//
// RED-PROOF, written BEFORE the code and verified FAILING against unmodified source. Ote's rulings, 2026-09-16:
//   A3   *"A learned alias is memory-semantic state … the resolver is the actor asserting the alias, not the
//         extractor or writer of the triggering memory."*
//   A3   *"Only an adjudicated `same` verdict may teach/promote an alias. A cheap-arm hit may bind, but it may not teach."*
//   A-D7 *"A refused write teaches nothing and changes no semantic ordering."*  ⇒ `touch()` moves with the alias write.
//
// ── ⭐⭐ WHY `touch()` IS IN A CHECK ABOUT ALIASES AT ALL ──────────────────────────────────────────────
// `last_write` is not bookkeeping on this path: `slotStore.list()` orders by it, the resolver's comparison is a
// STRICT `>`, so the most recently touched slot WINS EVERY TIE. ⇒ touching on a refused write moves that slot to the
// front of every future resolution for a belief that was never written. A-D7 is grounded in exactly that.
//
// ── ⛔ FENCES ─────────────────────────────────────────────────────────────────────────────────────────
// Everything is `zzq3aardvark` in agent_dev and removed at the end; ⛔ nothing touches Ote's rows, the Mira or shelter
// fixtures, the armed `location` collision, or the 8 existing aliases. §9 asserts its OWN BLAST RADIUS — this arc has
// already had one fence violation, and "the cleanup ran" is not the same claim as "nothing else moved".
import { randomUUID } from 'node:crypto'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { createSlotStore } from '../../Backend/app/components/memory-slot-store-host.js'
import { createMemoryV2Service } from '@ote/memory/cognition/memory-v2-service.js'
import { WRITER, ACT_KIND, REACH_KIND } from '../../Backend/app/components/memory-writer-contracts.js'
import { attributeSimilarity } from '@ote/memory/cognition/memory-extract.js'

const { check, done } = makeChecker()
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const [agent] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
const AGENT = agent.id
// ⚠️⚠️ THE FIXTURE NAME IS PART OF THE FENCE — see the PRE-FLIGHT guard below. A `zz_` PREFIX IS NOT A FENCE
// against containment: a prefix makes a name LONGER, and containment matches when the SHORTER token set is
// contained in the longer one. ⇒ `zz_a3 work schedule` is a PERFECT (1.0000) hit on the real slot `work schedule`.
// The first version of this check used exactly that, bound to the SHELTER EVIDENCE SLOT, taught it an alias,
// refreshed its last_write and SUPERSEDED the reflection row. Caught by §9's blast radius, restored, and the
// lesson is encoded here: the fixture's tokens must collide with NOTHING.
const MARK = 'zzq3aardvark'
const FIXTURE_SLOT = `${MARK} bandicoot`   // the slot
const FIXTURE_HIT = MARK                   // ⊂ the slot's label ⇒ a 1.0000 cheap-arm hit, by construction
const FIXTURE_REFUSED = `${MARK} cassowary`
const MADE = { memories: [], slots: [] }

// Population BEFORE anything — §9 compares against these, so the blast radius is measured, not asserted.
const before = await one(`SELECT (SELECT count(*) FROM ${S}."mst_slots") AS slots,
                                 (SELECT count(*) FROM ${S}."mst_slots" s, jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a) AS aliases,
                                 (SELECT count(*) FROM ${S}."txn_memories") AS memories`)

const aliasesOf = async (slotId) => {
  const r = await one(`SELECT COALESCE(aliases,'[]'::jsonb) AS a FROM ${S}."mst_slots" WHERE id = $1::uuid`, [slotId])
  return r?.a ?? []
}
// ⚠️⚠️ `last_write` IS READ AS TEXT WITH MILLISECONDS, ⛔ never as a Date. The first version of this check
// compared two Date objects via String(), which prints only to the second — so a `touch()` that happened
// 40ms later compared EQUAL and A-D7-② PASSED VACUOUSLY against source that had not been changed yet.
const slotOf = async (attr) => one(
  `SELECT id::text AS id, canonical_label, write_count,
          to_char(last_write AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') AS last_write
   FROM ${S}."mst_slots" WHERE user_id = $1::uuid AND canonical_label = $2`, [AGENT, attr])

const declared = (act) => buildMemoryV2(fastify, {
  userId: AGENT, writer: WRITER.chatTool, act, reach: { kind: REACH_KIND.none },
})

try {
  // ── 0 · ⭐⭐⭐ PRE-FLIGHT · THE FIXTURE MUST COLLIDE WITH NOTHING ─────────────────────────────────────
  // ⚠️ Added after this check's OWN first run contaminated the shelter evidence slot. A test that writes into
  // the store it is investigating must prove, BEFORE it writes, that its names cannot be absorbed by a real
  // concept. ⛔ Naming convention is not sufficient — this is the mechanical check.
  const allSlots = await q(`SELECT id::text AS id, canonical_label, COALESCE(aliases,'[]'::jsonb) AS aliases FROM ${S}."mst_slots"`)
  const collisions = []
  for (const name of [FIXTURE_SLOT, FIXTURE_HIT, FIXTURE_REFUSED]) {
    for (const sl of allSlots) {
      const phrases = [sl.canonical_label, ...(sl.aliases || []).map((a) => a?.phrase).filter(Boolean)]
      for (const ph of phrases) {
        const score = attributeSimilarity(ph, name)
        if (score >= 0.7) collisions.push(`"${name}" ~ "${ph}" (${score.toFixed(4)}) on slot ${String(sl.id).slice(0, 8)}`)
      }
    }
  }
  check('⛔⛔ PRE-FLIGHT · no fixture name collides with ANY existing slot label or alias',
    collisions.length === 0, collisions.length ? collisions.join(' · ') : 'clean against all ' + allSlots.length + ' slots')
  if (collisions.length) throw new Error('fixture would contaminate real slots — refusing to write')

  // ── 1 · FIXTURE — one slot, created by a real declared write ────────────────────────────────────────
  const act1 = { kind: ACT_KIND.turn, id: randomUUID() }
  const r1 = await declared(act1).reconcileFact({ entity: 'user', attribute: FIXTURE_SLOT, value: 'up past 2am' })
  if (r1?.id) MADE.memories.push(r1.id)
  const slot = await slotOf(FIXTURE_SLOT)
  if (slot?.id) MADE.slots.push(slot.id)
  check('fixture · the slot exists', !!slot?.id, `slot ${String(slot?.id).slice(0, 8)} · "${slot?.canonical_label}"`)
  check('fixture · it starts with NO aliases', (await aliasesOf(slot.id)).length === 0)

  // ── 2 · ⚠️ ANTI-VACUITY — the cheap arm must ACTUALLY hit, or §3 proves nothing ────────────────────
  // FIXTURE_HIT ⊂ FIXTURE_SLOT ⇒ containment 1.0000 by construction. If this write did NOT land in the same
  // slot, §3's "no alias was learned" would pass for the wrong reason.
  const act2 = { kind: ACT_KIND.turn, id: randomUUID() }
  const r2 = await declared(act2).reconcileFact({ entity: 'user', attribute: FIXTURE_HIT, value: 'Saturdays' })
  if (r2?.id) MADE.memories.push(r2.id)
  const row2 = r2?.id ? await one(`SELECT slot_id::text AS slot FROM ${S}."txn_memories" WHERE id = $1::uuid`, [r2.id]) : null
  check('⚠️ ANTI-VACUITY · the cheap arm DID bind — the second write landed in the SAME slot',
    row2?.slot === slot.id, `row slot ${String(row2?.slot).slice(0, 8)} vs fixture slot ${String(slot.id).slice(0, 8)}`)

  // ── 3 · ⭐⭐⭐ A CHEAP-ARM HIT MAY BIND, BUT MAY NOT TEACH ──────────────────────────────────────────
  // ⭐ Asserted after RE-READING THE DATABASE, ⛔ never from a return value: the claim is about durable state.
  const after2 = await aliasesOf(slot.id)
  check('A3-① · ⭐⭐⭐ a cheap-arm (lexical) hit BOUND but taught NOTHING',
    after2.length === 0, `${after2.length} alias(es) learned: ${JSON.stringify(after2.map((a) => a?.phrase))}`)

  // ── 4 · ⭐⭐⭐ A-D7 · A REFUSED WRITE TEACHES NOTHING AND CHANGES NO SEMANTIC ORDERING ──────────────
  const slotBefore = await slotOf(FIXTURE_SLOT)
  const bare = buildMemoryV2(fastify, { userId: AGENT }) // ⛔ no writer ⇒ the store refuses the row
  let refusal = null
  try { refusal = await bare.reconcileFact({ entity: 'user', attribute: FIXTURE_REFUSED, value: 'Sundays' }) } catch (e) { refusal = e }
  check('A-D7 · the write WAS refused (the precondition for the two assertions below)',
    refusal?.code === 'NO_WRITER' || /NO_WRITER|no declared writer/i.test(String(refusal?.message ?? '')),
    String(refusal?.code ?? refusal?.message ?? '').slice(0, 80))

  const slotAfter = await slotOf(FIXTURE_SLOT)
  const aliasesAfterRefusal = await aliasesOf(slot.id)
  check('A-D7-① · ⭐⭐⭐ a REFUSED write taught NOTHING',
    aliasesAfterRefusal.length === 0, `${aliasesAfterRefusal.length} alias(es): ${JSON.stringify(aliasesAfterRefusal.map((a) => a?.phrase))}`)
  check('A-D7-② · ⭐⭐⭐ a REFUSED write changed NO semantic ordering — last_write is untouched (ms precision)',
    slotBefore?.last_write === slotAfter?.last_write,
    `before ${slotBefore?.last_write} · after ${slotAfter?.last_write}`)
  check('A-D7-③ · …and did not bump write_count either',
    String(slotBefore?.write_count) === String(slotAfter?.write_count),
    `before ${slotBefore?.write_count} · after ${slotAfter?.write_count}`)

  // ── 5 · THE LEDGER EXISTS AND IS APPEND-ONLY (A-D3 · β) ────────────────────────────────────────────
  const ledger = await one(`SELECT to_regclass('${devSchema()}.log_slot_aliases') AS t`)
  check('A-D3 · the append-only alias ledger exists (migration 051)', !!ledger?.t, String(ledger?.t))

  // ── 6 · THE LEDGER ANSWERS "WHAT DID THIS RUN DO" — including REFUSALS ────────────────────────────
  // ⭐ Recording the refusals is what makes the teach-ban MEASURABLE without turning anything on: "how often did
  // the cheap arm want to teach?" is answerable from the ledger alone.
  if (ledger?.t) {
    const rows = await q(`SELECT action, phrase, writer, act_kind, act_id, memory_id::text AS memory_id, relation, declared
                          FROM ${S}."log_slot_aliases" WHERE slot_id = $1::uuid ORDER BY rolling_id`, [slot.id])
    check('A3-② · the ledger recorded this run', rows.length > 0, `${rows.length} ledger row(s): ${JSON.stringify(rows.map((r) => `${r.action}:${r.phrase}`))}`)
    const refused = rows.filter((r) => r.action === 'refuse')
    check('A3-③ · ⭐ the cheap arm\'s refused teaching is RECORDED, not silent',
      refused.length >= 1, `${refused.length} refusal(s) — this is the measurement the teach-ban needs`)
    check('A3-④ · every ledger row names the RESOLVER as writer, ⛔ not the extractor/chat-tool',
      rows.length > 0 && rows.every((r) => r.writer === 'resolver'), JSON.stringify([...new Set(rows.map((r) => r.writer))]))
    check('A3-⑤ · every ledger row carries an OCCASION — ⛔ no occasion-less resolver alias',
      rows.length > 0 && rows.every((r) => r.act_kind && r.act_id), JSON.stringify(rows.map((r) => `${r.act_kind}:${String(r.act_id).slice(0, 8)}`)))
    // ⚠️ REWORDED AFTER IT PASSED VACUOUSLY. `.every()` over the promotions is TRUE when there are none, so as
    // written it asserted nothing at this point in the run. The real claim here is the NEGATIVE one — nothing has
    // been promoted yet, because only cheap-arm hits have happened. The POSITIVE claim is §7 (A3-⑧..⑪).
    check('A3-⑥ · ⛔ NOTHING has been promoted yet — every ledger row so far is a refusal',
      rows.filter((r) => r.action === 'promote').length === 0,
      JSON.stringify(rows.map((r) => r.action)))
    check('A3-⑦ · ⛔ the REFUSED write left NO ledger row either — it is not a resolver act at all',
      !rows.some((r) => r.phrase === FIXTURE_REFUSED), JSON.stringify(rows.map((r) => r.phrase)))
  } else {
    check('A3-② · the ledger recorded this run', false, 'ledger table absent')
  }

  // ── 7 · ⭐⭐⭐ THE POSITIVE CONTROL — an ADJUDICATED verdict STILL TEACHES ────────────────────────────
  // ⚠️ WITHOUT THIS THE WHOLE CHECK IS SATISFIED BY "nothing ever teaches", which is not the ruling — the ruling
  // is that only an ADJUDICATED verdict may. A3-⑥ above runs `.every()` over the promotions and passes VACUOUSLY
  // when there are none, so the teaching path must be exercised for real.
  // ⭐ It crosses PERSISTENCE: the alias and the ledger row are re-read from the database, ⛔ not taken from a
  // return value. `grayZoneMode` stays 'off' — the verdict is injected through the resolver seam the chain
  // already has, so ⛔ no setting is touched and ⛔ no classifier is given authority.
  const act3 = { kind: ACT_KIND.turn, id: randomUUID() }
  const adjudicatingResolver = {
    async resolve() {
      return {
        slotId: slot.id,
        confidence: 0.93,
        // ⭐ `evidence.learn` is what a resolver that actually RULED emits. This is the ONLY thing that may teach.
        evidence: { candidates: 1, lexical: 0, semantic: 0, bestCosine: 0.78, learn: { slotId: slot.id, phrase: `${MARK} dingo`, by: 'gray-zone', confidence: 0.93 } },
      }
    },
    async indexVectorFor() { return null },
  }
  const svc = createMemoryV2Service({
    store: createSequelizeMemoryStore({ db, persona: undefined, userId: AGENT, config, writer: WRITER.chatTool, act: act3, reach: { kind: REACH_KIND.none } }),
    slotStore: createSlotStore({ db, userId: AGENT, act: act3 }),
    embed: null, userId: AGENT, slotResolver: adjudicatingResolver,
  })
  const r3 = await svc.reconcileFact({ entity: 'user', attribute: `${MARK} dingo`, value: 'emu' })
  if (r3?.id) MADE.memories.push(r3.id)

  const taught = (await aliasesOf(slot.id)).find((a) => a?.phrase === `${MARK} dingo`)
  check('A3-⑧ · ⭐⭐⭐ POSITIVE CONTROL · an ADJUDICATED verdict DID teach — read back from the DB',
    !!taught, taught ? JSON.stringify({ by: taught.by, relation: taught.relation, declared: taught.declared, writer: taught.writer }) : 'no alias learned')
  check('A3-⑨ · the taught alias carries writer=resolver · relation=same · declared=false · an act',
    taught?.writer === 'resolver' && taught?.relation === 'same' && taught?.declared === false && !!taught?.act?.id,
    JSON.stringify({ writer: taught?.writer, relation: taught?.relation, declared: taught?.declared, act: taught?.act }))
  const promoted = await q(`SELECT phrase, writer, act_kind, act_id, memory_id::text AS memory_id, relation, declared, by
                            FROM ${S}."log_slot_aliases" WHERE slot_id = $1::uuid AND action = 'promote'`, [slot.id])
  check('A3-⑩ · ⭐⭐ the LEDGER recorded the promotion with its CAUSE — the rollback handle',
    promoted.length === 1 && promoted[0].memory_id === r3.id && promoted[0].relation === 'same' && promoted[0].writer === 'resolver',
    JSON.stringify(promoted.map((x) => ({ phrase: x.phrase, mem: String(x.memory_id).slice(0, 8), rel: x.relation, by: x.by }))))
  check('A3-⑪ · ⭐ "which equivalences did THIS occasion teach?" is answerable from the ledger alone',
    (await q(`SELECT phrase FROM ${S}."log_slot_aliases" WHERE act_id = $1 AND action = 'promote'`, [act3.id])).length === 1,
    `act ${act3.id.slice(0, 8)}`)

} finally {
  // ── 9 · ⭐⭐ BLAST RADIUS, ASSERTED — ⛔ "the cleanup ran" is not "nothing else moved" ───────────────
  if (MADE.memories.length) {
    await q(`DELETE FROM ${S}."log_memory_changes" WHERE memory_id = ANY($1::uuid[])`, [MADE.memories]).catch(() => {})
    await q(`DELETE FROM ${S}."txn_memories" WHERE id = ANY($1::uuid[])`, [MADE.memories]).catch(() => {})
  }
  await q(`DELETE FROM ${S}."txn_memories" WHERE user_id = $1::uuid AND attribute LIKE '${MARK}%'`, [AGENT]).catch(() => {})
  await q(`DELETE FROM ${S}."log_slot_aliases" WHERE slot_id IN (SELECT id FROM ${S}."mst_slots" WHERE canonical_label LIKE '${MARK}%')`).catch(() => {})
  await q(`DELETE FROM ${S}."log_slot_bindings" WHERE slot_id IN (SELECT id FROM ${S}."mst_slots" WHERE canonical_label LIKE '${MARK}%')`).catch(() => {})
  await q(`DELETE FROM ${S}."mst_slots" WHERE user_id = $1::uuid AND canonical_label LIKE '${MARK}%'`, [AGENT]).catch(() => {})

  const after = await one(`SELECT (SELECT count(*) FROM ${S}."mst_slots") AS slots,
                                  (SELECT count(*) FROM ${S}."mst_slots" s, jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a) AS aliases,
                                  (SELECT count(*) FROM ${S}."txn_memories") AS memories`)
  check('⛔ BLAST RADIUS · slot population returned to its exact prior count',
    String(after.slots) === String(before.slots), `${before.slots} → ${after.slots}`)
  check('⛔ BLAST RADIUS · alias population returned to its exact prior count',
    String(after.aliases) === String(before.aliases), `${before.aliases} → ${after.aliases}`)
  check('⛔ BLAST RADIUS · memory population returned to its exact prior count',
    String(after.memories) === String(before.memories), `${before.memories} → ${after.memories}`)
  const leftovers = await q(`SELECT canonical_label FROM ${S}."mst_slots" WHERE canonical_label LIKE '${MARK}%'`)
  check('⛔ BLAST RADIUS · no fixture slot left behind', leftovers.length === 0, JSON.stringify(leftovers.map((r) => r.canonical_label)))

  await pg.end()
  done()
}
