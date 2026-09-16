// ⭐⭐⭐ A2 · R4 — THE NORMALIZED CANDIDATE **ARRIVES**, proven at the downstream boundary by a DELEGATING SPY.
//
//   node test/checks/normalization-candidate-arrival-check.mjs
//
// RED-PROOF, written BEFORE the code and verified FAILING against unmodified source.
//
// ── ⛔⛔ WHY THIS IS NOT A GREP, AND OTE ASKED FOR IT SPECIFICALLY ────────────────────────────────────
// *"Don't rely on source inspection or grep. Use the delegating spy at the downstream boundary to prove that
//  the actual normalized candidate arrives with the new structural information intact … We've already been
//  bitten twice by explicit allowlists silently dropping newly introduced fields."*
//
// The two: `installComponents` dropped the resolver's passport fields (2026-08-12), and `commitToMemory`
// dropped `claimKind` (2026-09-03) — supplied at the caller, absent at the store, and a GREP would have found
// the field in both files and concluded it was wired. ⇒ the only proof that counts is an observation entering
// the pipeline at one end and the RESOLVER, at the other end, being asked about it.
//
//     observation → normalizeObservation → commitToMemory (THE ALLOWLIST) → reconcileFact → resolver.resolve
//                                                                                              ▲
//                                                                                    the spy reads HERE
//
// ── ⭐ WHAT IS REAL HERE, STATED SO THE PROOF CANNOT BE OVERSOLD ─────────────────────────────────────
// REAL, unmodified production code: `createObservationPipeline` (which calls the REAL `normalizeObservation`
// as its default) · `commitToMemory` (the real allowlist) · `reconcileFact` · `createCosineSlotResolver`
// (the real resolver, underneath the spy) · the real Sequelize store and slot store.
// SUBSTITUTED: nothing. The resolver is WRAPPED — every call is delegated to the real one and its real answer
// is returned, so behaviour is identical and the spy only observes.
//
// ── ⛔ FENCES ─────────────────────────────────────────────────────────────────────────────────────────
// `zzq4` fixtures in agent_dev, pre-flight collision scan (A3's lesson: a `zz_` prefix is NOT a fence against
// containment), blast radius asserted, and the evidence corpus untouched.
import { randomUUID } from 'node:crypto'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { createSlotStore } from '../../Backend/app/components/memory-slot-store-host.js'
import { WRITER, ACT_KIND, REACH_KIND } from '../../Backend/app/components/memory-writer-contracts.js'
import { commitToMemory } from '../../Backend/app/components/memory-pipeline-host.js'
import { createMemoryV2Service } from '@ote/memory/cognition/memory-v2-service.js'
import { createObservationPipeline } from '@ote/memory/cognition/memory-pipeline.js'
import { createCosineSlotResolver, rowsBySlotIndex } from '@ote/memory/cognition/memory-slot-resolver.js'
import { normalizeObservation } from '@ote/memory/cognition/memory-normalize.js'
import { attributeSimilarity } from '@ote/memory/cognition/memory-extract.js'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null
const [agent] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
const AGENT = agent.id

const MARK = 'zzq4emu'
const FIXTURE = `${MARK} plumage colour`   // head "colour", qualifiers ["zzq4emu","plumage"]
const MADE = { memories: [] }

const before = await one(`SELECT (SELECT count(*) FROM ${S}."mst_slots") AS slots,
                                 (SELECT count(*) FROM ${S}."mst_slots" s, jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a) AS aliases,
                                 (SELECT count(*) FROM ${S}."txn_memories") AS memories`)

try {
  // ── 0 · PRE-FLIGHT (A3's lesson) ───────────────────────────────────────────────────────────────────
  const allSlots = await q(`SELECT id::text AS id, canonical_label, COALESCE(aliases,'[]'::jsonb) AS aliases FROM ${S}."mst_slots"`)
  const collisions = []
  for (const sl of allSlots) {
    for (const ph of [sl.canonical_label, ...(sl.aliases || []).map((a) => a?.phrase).filter(Boolean)]) {
      const score = attributeSimilarity(ph, FIXTURE)
      if (score >= 0.7) collisions.push(`"${ph}" (${score.toFixed(4)})`)
    }
  }
  check('⛔⛔ PRE-FLIGHT · the fixture collides with no existing slot label or alias',
    collisions.length === 0, collisions.join(' · ') || `clean against all ${allSlots.length} slots`)
  if (collisions.length) throw new Error('fixture would contaminate real slots — refusing to write')

  // ── 1 · THE PRODUCTION SEAM, ASSEMBLED FROM PRODUCTION PARTS, WITH ONE DELEGATING SPY ──────────────
  const act = { kind: ACT_KIND.turn, id: randomUUID() }
  const real = createCosineSlotResolver({ embed: null, loadIndex: rowsBySlotIndex })
  const seen = []
  const spy = {
    // ⭐ DELEGATES. The real resolver's real answer is returned unchanged, so this proves ARRIVAL without
    // altering a single decision. ⛔ A stub that returned a canned Resolution would prove nothing about
    // production behaviour and would hide any downstream breakage.
    async resolve(observation, context) {
      seen.push(observation)
      return real.resolve(observation, context)
    },
    indexVectorFor: (...a) => real.indexVectorFor(...a),
  }
  const mem = createMemoryV2Service({
    store: createSequelizeMemoryStore({ db, userId: AGENT, config, writer: WRITER.chatTool, act, reach: { kind: REACH_KIND.none } }),
    slotStore: createSlotStore({ db, userId: AGENT, act }),
    embed: null, userId: AGENT, slotResolver: spy,
  })
  // ⭐ THE REAL PIPELINE. `createObservationPipeline` calls the REAL `normalizeObservation` by default — it is
  // NOT passed here, precisely so the check cannot accidentally test its own copy of the stage.
  const pipeline = createObservationPipeline({ commit: (obs) => commitToMemory(mem, obs) })

  const res = await pipeline.ingest({ owner: 'user', attribute: FIXTURE, value: 'slate grey', type: 'fact' })
  if (res?.result?.id) MADE.memories.push(res.result.id)
  check('the observation actually traversed the pipeline and committed', res?.ok === true, JSON.stringify({ ok: res?.ok, stage: res?.stage, error: res?.error }))

  // ── 2 · ⚠️ ANTI-VACUITY — the spy must have been called at all ─────────────────────────────────────
  check('⚠️ ANTI-VACUITY · the resolver WAS asked (the spy fired)', seen.length >= 1, `${seen.length} call(s)`)
  const arrived = seen[0] ?? {}

  // ── 3 · ⭐⭐⭐ R4 — THE STRUCTURAL INFORMATION ARRIVED AT THE RESOLVER ──────────────────────────────
  check('R4-① · ⭐⭐⭐ the resolver received `attributeShape` — it survived the pipeline allowlist',
    !!arrived.attributeShape, `resolver saw keys: ${JSON.stringify(Object.keys(arrived))}`)
  check('R4-② · ⭐⭐ …with the HEAD intact',
    arrived.attributeShape?.head === 'colour', JSON.stringify(arrived.attributeShape ?? null))
  check('R4-③ · ⭐⭐ …and the QUALIFIERS intact, in order',
    JSON.stringify(arrived.attributeShape?.qualifiers) === JSON.stringify([MARK, 'plumage']),
    JSON.stringify(arrived.attributeShape?.qualifiers ?? null))
  check('R4-④ · the shape declares itself ANALYSED',
    arrived.attributeShape?.analysed === true, String(arrived.attributeShape?.analysed))
  check('R4-⑤ · the string candidate still arrives too (⛔ nothing was replaced)',
    typeof arrived.attributeCandidate === 'string' && arrived.attributeCandidate.length > 0, String(arrived.attributeCandidate))
  check('R4-⑥ · ⛔ and the RAW attribute is unchanged — Normalization tidies, it does not rename',
    arrived.attribute === FIXTURE, String(arrived.attribute))

  // ── 4 · ⭐ SEMANTIC INERTNESS — A2 ADDS INFORMATION, ⛔ NOT AUTHORITY ──────────────────────────────
  // The resolver was HANDED the shape and must have IGNORED it: the resolution must be byte-identical to what
  // the same observation produces with no shape at all. ⛔ Without this, A2 could silently become A1.
  const withShape = await real.resolve(arrived, { slots: [], rowsBySlot: new Map() })
  const { attributeShape, attributeCandidate, ...stripped } = arrived
  const withoutShape = await real.resolve(stripped, { slots: [], rowsBySlot: new Map() })
  check('A2-INERT · ⭐⭐ the resolver\'s answer is IDENTICAL with and without the shape',
    JSON.stringify(withShape) === JSON.stringify(withoutShape), JSON.stringify(withShape))

  // ── 5 · ⭐⭐ THE STRUCTURAL PROHIBITION — Normalization must not become an implicit classifier ──────
  // ⛔ Crude on purpose: the regression would be one import line, and the counts elsewhere would still look fine.
  // Precedent: `memory-ownership.js`, whose test asserts the source file never mentions a room.
  const SRC = readFileSync(new URL('../../../../PortableComponents/Packages/Memory/cognition/memory-normalize.js', import.meta.url), 'utf8')
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') // ⛔ comments stripped — they DISCUSS slots
  for (const forbidden of ['mst_slots', 'slotStore', 'slot-store', 'memory-slot-resolver', 'canonicalLabel', 'aliases']) {
    check(`A2-PROHIBITION · Normalization's CODE never names \`${forbidden}\``,
      !CODE.includes(forbidden), CODE.includes(forbidden) ? 'FOUND — Normalization is reading the slot vocabulary' : 'absent')
  }
  check('A2-PROHIBITION · …and imports nothing from the resolver or the store',
    !/^\s*import[\s\S]*?from\s+['"].*(slot|store|extract)/m.test(CODE), 'no slot/store/extract import')

  // ── 6 · ⭐⭐⭐ THE EXPLICIT-UNKNOWN FALLBACK — ⛔ must NOT guess ────────────────────────────────────
  // ⭐ Tested on the REAL stage directly (this is a unit property of Normalization, not of the seam).
  const cases = [
    { attr: 'ตารางงาน', why: 'Thai — the head-final assumption does not hold', expect: 'script' },
    { attr: 'volunteer_schedule_and_location', why: 'a CONJUNCTION of two concepts — there is no single head', expect: 'function-word' },
    { attr: 'day of the week', why: 'a post-modifier — English head-final fails here', expect: 'function-word' },
  ]
  for (const c of cases) {
    const n = normalizeObservation({ type: 'fact', attribute: c.attr, value: 'x' })
    check(`A2-UNKNOWN · "${c.attr}" ⇒ explicit unknown (${c.why})`,
      n.attributeShape?.analysed === false && n.attributeShape?.head === null && Array.isArray(n.attributeShape?.qualifiers) && n.attributeShape.qualifiers.length === 0,
      JSON.stringify(n.attributeShape ?? null))
    check(`A2-UNKNOWN · …and it SAYS WHY — ⛔ an unexplained unknown is indistinguishable from a bug`,
      typeof n.attributeShape?.why === 'string' && n.attributeShape.why.length > 0, String(n.attributeShape?.why))
  }
  // ⭐ AND THE FALLBACK PRESERVES TODAY'S BEHAVIOUR: the attribute and value are untouched by a failed analysis.
  const thai = normalizeObservation({ type: 'fact', attribute: 'ตารางงาน', value: '  "วันเสาร์"  ' })
  check('A2-UNKNOWN · ⭐⭐ an unanalysable phrase still gets ORDINARY canonicalization — ⛔ the stage does not bail out',
    thai.attribute === 'ตารางงาน' && thai.value === 'วันเสาร์', JSON.stringify({ attribute: thai.attribute, value: thai.value }))

  // ── 7 · the positive shapes, on the stage directly ────────────────────────────────────────────────
  const shapes = [
    ['work schedule', 'schedule', ['work']],
    ['schedule', 'schedule', []],
    ['shelter shift day', 'day', ['shelter', 'shift']],
    ['favorite programming language', 'language', ['favorite', 'programming']],
    ['the schedule', 'schedule', []], // ⭐ a determiner is not a qualifier
  ]
  for (const [attr, head, quals] of shapes) {
    const n = normalizeObservation({ type: 'fact', attribute: attr, value: 'x' })
    check(`A2-SHAPE · "${attr}" ⇒ head "${head}" + ${JSON.stringify(quals)}`,
      n.attributeShape?.head === head && JSON.stringify(n.attributeShape?.qualifiers) === JSON.stringify(quals),
      JSON.stringify(n.attributeShape ?? null))
  }
  // ⭐⭐ THE HYPERNYM SIGNATURE IS NOW VISIBLE — ⛔ and still UNUSED. This is what A1 will read; A2 only exposes it.
  const generic = normalizeObservation({ type: 'fact', attribute: 'schedule', value: 'x' }).attributeShape
  const specific = normalizeObservation({ type: 'fact', attribute: 'work schedule', value: 'x' }).attributeShape
  check('A2-SIGNATURE · ⭐⭐ same head + strictly fewer qualifiers ⇒ the BROADER phrase is now DETECTABLE (⛔ not yet acted on)',
    generic?.head === specific?.head && generic?.qualifiers?.length < specific?.qualifiers?.length
      && (generic?.qualifiers ?? []).every((t) => (specific?.qualifiers ?? []).includes(t)),
    JSON.stringify({ generic, specific }))
} finally {
  if (MADE.memories.length) {
    await q(`DELETE FROM ${S}."log_memory_changes" WHERE memory_id = ANY($1::uuid[])`, [MADE.memories]).catch(() => {})
    await q(`DELETE FROM ${S}."txn_memories" WHERE id = ANY($1::uuid[])`, [MADE.memories]).catch(() => {})
  }
  await q(`DELETE FROM ${S}."txn_memories" WHERE user_id = $1::uuid AND attribute LIKE '${MARK}%'`, [AGENT]).catch(() => {})
  await q(`DELETE FROM ${S}."log_slot_aliases" WHERE canonical_label LIKE '${MARK}%'`).catch(() => {})
  await q(`DELETE FROM ${S}."mst_slots" WHERE user_id = $1::uuid AND canonical_label LIKE '${MARK}%'`, [AGENT]).catch(() => {})

  const after = await one(`SELECT (SELECT count(*) FROM ${S}."mst_slots") AS slots,
                                  (SELECT count(*) FROM ${S}."mst_slots" s, jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a) AS aliases,
                                  (SELECT count(*) FROM ${S}."txn_memories") AS memories`)
  check('⛔ BLAST RADIUS · slots returned to their exact prior count', String(after.slots) === String(before.slots), `${before.slots} → ${after.slots}`)
  check('⛔ BLAST RADIUS · aliases returned to their exact prior count', String(after.aliases) === String(before.aliases), `${before.aliases} → ${after.aliases}`)
  check('⛔ BLAST RADIUS · memories returned to their exact prior count', String(after.memories) === String(before.memories), `${before.memories} → ${after.memories}`)
  await pg.end()
  done()
}
