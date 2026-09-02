// ⭐⭐⭐ M2-12c · THE FULL PERSISTENCE PATH, AGAINST AN ISOLATED PERSONA.
//
//   node test/pipeline/dreaming-12c-isolated-persona.mjs
//
// ── ⛔ THE BOUNDARY OTE SET, 2026-09-03 ─────────────────────────────────────────────────────────
//   *"The critical red-proof is not merely 'the test persona has different data.' Prove: **a commitment
//    written to the isolated persona is unreachable from live Sotera recall.** Please test the actual
//    `visibleWhere`/recall boundary, not just a test-side filter."*
//
// ⇒ ⭐⭐ the isolation assertion below calls the REAL memory service built for the LIVE persona and asks
// it to find the row. ⛔ It does not filter results itself, does not query with its own WHERE, and does
// not inspect the row's persona column and declare victory. **The live reader is asked, and the live
// reader must come back empty.**
//
// ⭐ `DEFAULT_PERSONA` is `null`, so `visibleWhere` emits `persona IS NULL` — and a row written under
// `zz_m2_isolated` cannot satisfy that. The isolation is STRUCTURAL, ⛔ not a convention.
//
// ── ⚠️ THE CLAIM IS CONSTRUCTED, AND THAT IS STATED RATHER THAN HIDDEN ─────────────────────────
// ⛔ This run does NOT call the model. The 12b run established that the live model's cites do not
// verify (0 of 8 spans found), so a model-produced claim could never reach the persistence stage — and
// the point of 12c is the PERSISTENCE and ISOLATION path, not the reasoner.
// ⇒ the claim here is assembled from spans copied VERBATIM out of two real buckets, so verification is
// exercised honestly against real evidence. ⭐ It is labelled `constructed` everywhere it appears.
// ⛔ It must never be read as "the model produced a verified claim."

import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { rebuildProviderRegistry } from '../../Backend/app/adapters/registry.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2, DEFAULT_PERSONA } from '../../Backend/app/components/memory-v2-host.js'
import { admitEvidence } from '../../Backend/app/components/dreaming-evidence.js'
import { evidentialSql } from '../../Backend/app/components/corpus-eligibility.js'
import { validateClaim, mayPublish } from '../../Backend/app/components/dreaming-proposal.js'
import { verifyCitations, DREAMING_PROVENANCE } from '../../Backend/app/components/dreaming-verify.js'
import { checkKind } from '../../Backend/app/components/memory-kind-precondition.js'

const ISOLATED = 'zz_m2_isolated'
const config = loadConfig()
const db = await initDB()
setDB(db)
await rebuildProviderRegistry({ db, config })
await initSettings(db)
const fastify = { db, config }

const pg = devPg(); await pg.connect()
const S = `"${devSchema()}"`
const q = async (sql, p) => (await pg.query(sql, p)).rows
const one = async (sql, p) => (await q(sql, p))[0] ?? null

let pass = 0; let fail = 0
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (cond) pass++; else fail++
}

let writtenId = null
try {
  console.log('\n══ M2-12c · ISOLATED-PERSONA END-TO-END ══════════════════════════════════════')
  console.log(`   live persona = ${JSON.stringify(DEFAULT_PERSONA)}   isolated persona = '${ISOLATED}'\n`)

  const room = await one(`SELECT id::text FROM ${S}.mst_users WHERE username = 'agent_dev'`)
  ok('0 · the isolated run uses agent_dev — ⛔ never root', Boolean(room?.id), room?.id?.slice(0, 8))

  // ══ ① CANDIDATE → ② EVIDENCE ═════════════════════════════════════════════════════════════════
  const TERMS = ['memory', 'remember']
  const rows = await q(
    `SELECT m.id::text AS message_id, m.conversation_id::text AS conversation_id, m.created_at,
            m.content, c.user_id::text AS room
       FROM ${S}.txn_messages m JOIN ${S}.txn_conversations c ON c.id = m.conversation_id
      WHERE ${evidentialSql('c')} AND c.user_id = $1::uuid AND m.role IN ('user','assistant')
        AND (${TERMS.map((_, i) => `m.content ILIKE $${i + 2}`).join(' AND ')})
      ORDER BY m.created_at LIMIT 40`,
    [room.id, ...TERMS.map((t) => `%${t}%`)])
  const admitted = admitEvidence({ rows, room: room.id })
  ok('1 · ⭐ evidence admitted, grouped by root', admitted.ok, admitted.why)
  const buckets = admitted.buckets.slice(0, 3).map((b, i) => ({ root: `g${i + 1}`, turns: b.turns }))
  ok('2 · ⭐⭐ at least 2 INDEPENDENT roots — the O-2 floor, before anything is claimed',
    buckets.length >= 2, `${buckets.length} root(s)`)

  // ══ ③ CLAIM — constructed, with spans copied VERBATIM from two real buckets ═══════════════════
  const spanOf = (b) => b.turns[0].excerpt.slice(0, 40).trim()
  const claim = {
    entity: 'agent_dev',
    attribute: 'zz_m2_isolated_probe',
    value: 'a constructed claim for the 12c isolation test',
    kind: 'probe',
    cites: buckets.slice(0, 2).map((b) => ({ root: b.root, span: spanOf(b) })),
  }
  const valid = validateClaim(claim)
  ok('3 · ⭐ the claim is an ORDINARY slot claim and validates', valid.ok, valid.why)
  ok('3 · ⭐ …and may be published room-scoped, ⛔ never persona_global',
    mayPublish(claim, { destination: 'room' }).ok === true
    && mayPublish(claim, { destination: 'persona_global' }).ok === false)

  // ══ ④ WARRANT VERIFICATION — the system checks the spans and RECOUNTS ════════════════════════
  const verification = verifyCitations({ cites: claim.cites, buckets })
  ok('4 · ⭐⭐⭐ every cited span VERIFIED against its own root, and the roots were RECOUNTED',
    verification.ok, verification.why)
  ok('4 · ⭐ ≥2 verified independent roots', verification.verifiedRoots >= 2,
    `${verification.verifiedRoots} verified, ${verification.discarded.length} discarded`)

  // ══ ⑤ KIND PRECONDITION — the slot is undeclared, so it DEFERS ═══════════════════════════════
  const slotKind = null // ⓘ 047 landed empty and unbackfilled: no slot has a declared question yet.
  const kindVerdict = checkKind({ slotKind, claimKind: claim.kind })
  ok('5 · ⭐⭐ the kind precondition DEFERS on an undeclared slot — ⛔ it does not guess',
    kindVerdict.outcome === 'DEFER', kindVerdict.why)
  console.log('       ⓘ 12c proceeds PAST the defer deliberately: the point of this run is the '
    + 'persistence and isolation path.\n         ⛔ In the live persona a DEFER would stop here.\n')

  // ══ ⑥ PERSISTENCE — through the REAL write lane, into the ISOLATED persona ════════════════════
  const isoMem = buildMemoryV2(fastify, {
    userId: room.id, persona: ISOLATED, author: 'persona', scope: 'room',
  })
  const before = await one(`SELECT count(*)::int AS n FROM ${S}.txn_memories WHERE persona = $1`, [ISOLATED])
  isoMem.reconcileFactAsync({
    entity: claim.entity, attribute: claim.attribute, value: claim.value,
    provenance: DREAMING_PROVENANCE,
  })
  // ⚠️ THE WRITE LANE IS A SERIAL QUEUE — `queued` is not `written`, which is a parked defect elsewhere
  // in this codebase. ⇒ poll for the row rather than assuming the call persisted it.
  let row = null
  for (let i = 0; i < 40 && !row; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 250) })
    // eslint-disable-next-line no-await-in-loop
    row = await one(
      `SELECT id::text, persona, user_id::text AS room, entity, attribute, value, provenance, author
         FROM ${S}.txn_memories WHERE persona = $1 AND attribute = $2 ORDER BY created_at DESC LIMIT 1`,
      [ISOLATED, claim.attribute])
  }
  ok('6 · ⭐⭐ the commitment PERSISTED through the real write lane', Boolean(row?.id),
    row ? `${row.id.slice(0, 8)} persona=${row.persona}` : 'no row appeared within 10s')
  writtenId = row?.id ?? null
  ok('6 · ⭐ …under the ISOLATED persona, ⛔ not the live one', row?.persona === ISOLATED)
  ok('6 · ⭐ …and it did not land in the live persona',
    (await one(`SELECT count(*)::int AS n FROM ${S}.txn_memories WHERE persona IS NULL AND attribute = $1`,
      [claim.attribute]))?.n === 0)

  // ══ ⑦ THE WARRANT — evidence lineage, preserved for inspection ════════════════════════════════
  if (writtenId) {
    await pg.query(
      `INSERT INTO ${S}.log_memory_warrants
         (memory_id, value_at_warrant, selected, verified, discarded, verified_roots)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::text[])`,
      [writtenId, claim.value, claim.cites.length, verification.verifiedRoots,
        verification.discarded.length, verification.verified.map((v) => v.root)])
    const w = await one(
      `SELECT memory_id::text, value_at_warrant, selected, verified, discarded, verified_roots
         FROM ${S}.log_memory_warrants WHERE memory_id = $1::uuid`, [writtenId])
    ok('7 · ⭐⭐ the WARRANT is stored, keyed to the commitment', w?.memory_id === writtenId)
    ok('7 · ⭐ selected/verified/discarded are all recorded, and the arithmetic closes',
      w.selected === w.verified + w.discarded,
      `selected=${w.selected} verified=${w.verified} discarded=${w.discarded} roots=${JSON.stringify(w.verified_roots)}`)
    ok('7 · ⭐⭐ `value_at_warrant` matches the value it vouches for — a later supersession makes the '
      + 'mismatch VISIBLE', w.value_at_warrant === claim.value)
  }

  // ══ ⑧ ⭐⭐⭐ THE CRITICAL RED-PROOF — LIVE RECALL CANNOT SEE IT ══════════════════════════════
  // ⛔ NOT a test-side filter. This builds the memory service exactly as the chat turn does — live
  // persona, same room — and asks IT to find the row.
  const liveMem = buildMemoryV2(fastify, { userId: room.id, persona: DEFAULT_PERSONA })
  const probes = [claim.value, claim.attribute, 'constructed claim isolation test', 'zz_m2_isolated_probe']
  let leaked = 0
  for (const p of probes) {
    // eslint-disable-next-line no-await-in-loop
    const found = await liveMem.search(p, { limit: 20 })
    const hit = (found?.matches ?? []).filter(
      (m) => m?.id === writtenId || String(m?.attribute ?? '') === claim.attribute)
    if (hit.length) leaked += hit.length
  }
  ok('8 · ⭐⭐⭐ LIVE recall CANNOT reach the isolated commitment — the real visibleWhere, asked directly',
    leaked === 0, `${leaked} leak(s) across ${probes.length} probes`)

  // ⭐ AND THE POSITIVE CONTROL: the ISOLATED reader CAN. ⛔ Without this, "zero" would also be the
  // answer if search were simply broken, and the isolation proof would be vacuous.
  const isoFound = await isoMem.search(claim.value, { limit: 20 })
  const isoHit = (isoFound?.matches ?? []).filter((m) => m?.id === writtenId)
  ok('8 · ⭐⭐ POSITIVE CONTROL — the ISOLATED reader DOES find it, so "zero" above means isolation, '
    + '⛔ not a broken search', isoHit.length > 0, `${isoHit.length} hit(s) in the isolated persona`)

  // ⛔ AND P1 IS UNTOUCHED.
  const p1 = await one(`SELECT count(*)::int AS n FROM ${S}.log_conversation_revisits
     WHERE tool_generation=2 AND dispatch_generation=2 AND trigger_source='cron' AND outcome='completed'`)
  console.log(`\n  ⓘ P1 window: ${p1.n} — this run wrote nothing it can see`)
} catch (e) {
  console.error(`\n⛔ ${e?.stack ?? e}\n`)
  fail++
} finally {
  console.log(`\n  ${fail === 0 ? '✅ ALL 12c ASSERTIONS PASSED' : `⛔ ${fail} ASSERTION(S) FAILED`}  (${pass} ok)`)
  console.log(`\n  ⓘ The isolated persona '${ISOLATED}' is LEFT IN PLACE deliberately — it is the`)
  console.log('    evidence of this run, and its warrant lineage is what Ote asked to be able to inspect.')
  console.log(`    Remove with:  DELETE FROM txn_memories WHERE persona = '${ISOLATED}';\n`)
  await pg.end()
  await db.sequelize?.close?.().catch(() => {})
  process.exitCode = fail === 0 ? 0 : 1
}
