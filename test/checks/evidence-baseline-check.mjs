// ⭐⭐⭐ THE EVIDENCE BASELINE — the guardrail Ote required before any A/B implementation begins.
//
//   node test/checks/evidence-baseline-check.mjs
//
// Ote, 2026-09-16: *"Before changing anything, I want the implementation to preserve the current evidence state …
// We are changing the machinery that observes and classifies the evidence, NOT repairing the evidence before the
// machinery gets a chance to prove itself."*
//
// ── ⭐⭐ WHY THIS IS NOT A COUNT-EQUALITY CHECK, AND THE DISTINCTION IS THE WHOLE POINT ────────────────
// The obvious instrument asserts `slots === 112 && aliases === 8`. ⛔ That is the WRONG guarantee twice over:
//   • it FAILS for the right store — any ordinary `zz_` check run mints slots, so a green suite would turn this red
//     and the guardrail would be disabled within a day, which is how a fence stops existing;
//   • it PASSES for a wrong store — delete an evidence alias, add an unrelated one, and the count is unmoved.
// ⇒ the guarantee we actually need is DESTRUCTION-DETECTING, not freeze-detecting:
//
//       ⭐ NAMED EVIDENCE MUST STILL BE THERE, IN THE STATE IT WAS IN. The store may GROW.
//
// So every assertion below names a specific row, alias or candidate and asserts its state. The population counts are
// REPORTED (and a DROP is flagged), never asserted as equality.
//
// ── ⛔ WHAT THIS CHECK MAY NEVER DO ───────────────────────────────────────────────────────────────────
// ⛔ It writes NOTHING. No fixture, no cleanup, no `zz_` row — it is a read-only witness, because an instrument that
//    mutates the thing it is watching cannot be re-run after a failure to see what changed.
// ⛔ It never touches Ote's rows; everything it reads is `agent_dev` evidence plus two global ledgers.
//
// ⚠️ ANTI-VACUITY: a check that silently found nothing would pass. Every section therefore asserts its own subject
// EXISTS before concluding anything from it (`a-passing-test-can-test-nothing`).
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { attributeSimilarity } from '@ote/memory/cognition/memory-extract.js'
import { existsSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null
const short = (id) => String(id ?? '').slice(0, 8)

// ── 1 · THE MIRA FIXTURE — the KNOWN-GOOD worked example (direct tool write, clean supersession) ───────
// ⭐ Kept separate from the shelter set on purpose: it is the control that shows the same store, the same axes and
// the same invariants producing the RIGHT outcome when the write came from her, through a tool, with the domain
// word intact. If this ever goes, the failure set loses its comparison.
const MIRA = [
  { id: '318282ac', live: false, note: 'superseded — "training … in Chiang Mai"' },
  { id: '1fd59a3b', live: true, note: 'current — "works as a paramedic in Bangkok"' },
  { id: 'c6b415bc', live: true, note: 'the reflection row that consolidated the chain' },
]
for (const row of MIRA) {
  const r = await one(`SELECT id::text AS id, invalid_at, slot_id::text AS slot, writer FROM ${S}."txn_memories" WHERE id::text LIKE $1`, [`${row.id}%`])
  check(`mira ${row.id} exists`, !!r, row.note)
  if (r) check(`mira ${row.id} is ${row.live ? 'LIVE' : 'dead'}`, (r.invalid_at === null) === row.live, `writer ${r.writer} · slot ${short(r.slot)}`)
}
// ⭐ The supersession chain itself, not merely the two rows: the thing being preserved is the LINEAGE.
const chain = await one(`SELECT supersedes_id::text AS sup FROM ${S}."txn_memories" WHERE id::text LIKE '1fd59a3b%'`)
check('mira chain intact — the live row still supersedes the dead one', chain?.sup?.startsWith('318282ac') === true, `supersedes_id = ${short(chain?.sup)}`)

// ── 2 · THE SHELTER SET — the FAILURE evidence. ⛔ Not repaired, and the contradiction survives as LINEAGE ──
const SHELTER = [
  { id: '365e774e', live: false, slot: 'f792b628', what: 'the DESTROYED belief — work schedule = "up past 2am", no live replacement' },
  { id: 'baf35aa0', live: false, slot: 'f792b628', what: 'the stale row, written 2.8s AFTER its own correction' },
  { id: '33926415', live: true, slot: 'f792b628', what: 'reflection\'s repair — correct value, WRONG slot' },
  { id: '994dd66a', live: true, slot: 'c23931db', what: 'the correction, in its own slot' },
  { id: 'a6d481f3', live: true, slot: '662284e1', what: 'current activity' },
  { id: 'a3633e60', live: true, slot: '4d75f90d', what: 'living environment' },
  { id: '8fc8e793', live: true, slot: '5aad056d', what: "brother's activity day" },
  { id: '60edebfc', live: true, slot: '43741201', what: 'reflection · free-text entity "the user\'s home"' },
  { id: '8a142ce8', live: true, slot: 'b6b38c69', what: 'reflection · free-text entity "the user\'s brother"' },
]
for (const row of SHELTER) {
  const r = await one(`SELECT id::text AS id, invalid_at, slot_id::text AS slot FROM ${S}."txn_memories" WHERE id::text LIKE $1`, [`${row.id}%`])
  check(`shelter ${row.id} exists`, !!r, row.what)
  if (r) {
    check(`shelter ${row.id} still ${row.live ? 'LIVE' : 'dead'}`, (r.invalid_at === null) === row.live)
    check(`shelter ${row.id} still in slot ${row.slot}`, String(r.slot).startsWith(row.slot), `slot ${short(r.slot)}`)
  }
}
// ⭐⭐ The specific damage, asserted as damage: the work-schedule belief has NO live replacement. ⛔ If a future
// "cleanup" quietly re-creates one, this is what notices.
const wsLive = await q(`SELECT id::text AS id FROM ${S}."txn_memories"
  WHERE user_id = (SELECT user_id FROM ${S}."txn_memories" WHERE id::text LIKE '994dd66a%')
    AND attribute = 'work schedule' AND invalid_at IS NULL`)
check('the destroyed work-schedule belief was NOT repaired', wsLive.length === 0, `${wsLive.length} live rows — expected 0`)

// ── 3 · THE ALIASES — including the two REAL hypernym merges. ⛔ Evidence, not defects to be tidied ─────
const ALIASES = [
  { phrase: 'preference', label: 'communication preference', why: 'hypernym merge #1 — 2026-08-24, three weeks before the shelter case' },
  { phrase: 'schedule', label: 'work schedule', why: 'hypernym merge #2 — the shelter case' },
  { phrase: 'volunteer_schedule_and_location', label: 'work schedule', why: 'the cascade: admitted by the ALIAS, not by the concept' },
]
for (const a of ALIASES) {
  const r = await one(`SELECT s.id::text AS id FROM ${S}."mst_slots" s, jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) x
                       WHERE x->>'phrase' = $1 AND s.canonical_label = $2`, [a.phrase, a.label])
  check(`alias "${a.phrase}" → "${a.label}" still present`, !!r, a.why)
}

// ── 4 · ⚠️ THE ARMED `location` COLLISION — COMPUTED, never assumed ───────────────────────────────────
// ⭐ This is the one assertion that must be DERIVED rather than looked up: the hazard is not "a row exists", it is
// "the resolver would still tie". So it is recomputed from the shipped function and the live candidate ORDER.
const locSlot = await one(`SELECT id::text AS id, last_write FROM ${S}."mst_slots" WHERE canonical_label = 'location'
  AND user_id = (SELECT user_id FROM ${S}."txn_memories" WHERE id::text LIKE '994dd66a%')`)
const wsSlot = await one(`SELECT id::text AS id, last_write FROM ${S}."mst_slots" WHERE id::text LIKE 'f792b628%'`)
check('both slots in the collision still exist', !!locSlot && !!wsSlot, `location ${short(locSlot?.id)} · work-schedule ${short(wsSlot?.id)}`)
if (locSlot && wsSlot) {
  const viaLabel = attributeSimilarity('location', 'location')
  const viaAlias = attributeSimilarity('volunteer_schedule_and_location', 'location')
  check('the collision is still a TIE at the ceiling', viaLabel === 1 && viaAlias === 1, `label ${viaLabel.toFixed(4)} · alias ${viaAlias.toFixed(4)}`)
  // the tie-break is `last_write DESC` + a STRICT `>` ⇒ whichever slot the store lists FIRST wins
  const order = await q(`SELECT id::text AS id FROM ${S}."mst_slots"
    WHERE user_id = (SELECT user_id FROM ${S}."txn_memories" WHERE id::text LIKE '994dd66a%')
    ORDER BY last_write DESC NULLS LAST`)
  const iWs = order.findIndex((r) => r.id.startsWith('f792b628'))
  const iLoc = order.findIndex((r) => r.id === locSlot.id)
  check('the collision is still ARMED — work-schedule sorts AHEAD of location', iWs >= 0 && iLoc >= 0 && iWs < iLoc,
    `work-schedule at #${iWs + 1}, location at #${iLoc + 1} by last_write DESC`)
}

// ── 5 · ATTRIBUTION EVIDENCE — ⛔ frozen. Not reclassified, not pruned, not confirmed by anyone but Ote ──
const attr = await one(`SELECT (SELECT count(*) FROM ${S}."log_attribution_scans") AS scans,
                               (SELECT count(*) FROM ${S}."log_attribution_candidates") AS candidates,
                               (SELECT count(*) FROM ${S}."log_attribution_candidates" WHERE confirmed_by IS NOT NULL) AS confirmed,
                               (SELECT count(*) FROM ${S}."log_attribution_candidates" WHERE evidence_pruned_at IS NOT NULL) AS pruned`)
check('attribution scans not deleted', Number(attr.scans) >= 22, `${attr.scans} scans (baseline 22 — the D14 denominator)`)
check('attribution candidates not deleted', Number(attr.candidates) >= 5, `${attr.candidates} candidates (baseline 5)`)
check('no candidate confirmed by anyone but Ote', Number(attr.confirmed) === 1, `${attr.confirmed} confirmed — 769f6a65 REQ_NOW by ote`)
check('no frozen evidence pruned', Number(attr.pruned) === 0, `${attr.pruned} pruned`)
// ⭐ The four that are HIS to classify must still be UNCLASSIFIED — D13 makes him the confirmer.
const unreviewed = await q(`SELECT id::text AS id FROM ${S}."log_attribution_candidates" WHERE classification IS NULL ORDER BY created_at`)
check('the 4 unreviewed candidates are still unreviewed', unreviewed.length === 4,
  `${unreviewed.length} awaiting Ote: ${unreviewed.map((r) => short(r.id)).join(' ')}`)

// ── 6 · THE `.bak` FILES — somebody's safety net; ⛔ deleting them to tidy a `git status` is the refused convenience ──
const BAK = [
  'C:/data/AI_LLMv2/PortableComponents/Packages/Memory/cognition/memory-pipeline.js.pre-m2-16.bak',
  'C:/data/AI_LLMv2/PortableComponents/Packages/Memory/cognition/memory-v2-service.js.pre-lane-fix.bak',
]
for (const f of BAK) check(`backup preserved: ${f.split('/').pop()}`, existsSync(f))

// ── 7 · POPULATION — ⭐ REPORTED, and a DROP is a failure. ⛔ Growth is not. ───────────────────────────
const pop = await one(`SELECT (SELECT count(*) FROM ${S}."mst_slots") AS slots,
                              (SELECT count(*) FROM ${S}."mst_slots" s, jsonb_array_elements(COALESCE(s.aliases,'[]'::jsonb)) a) AS aliases`)
console.log(`\nPOPULATION (reported, not frozen): ${pop.slots} slots · ${pop.aliases} aliases   [baseline 2026-09-16: 112 · 8]`)
check('slot population has not SHRUNK below the baseline', Number(pop.slots) >= 112, `${pop.slots} (baseline 112) — growth is expected; a drop means deletion`)
check('alias population has not SHRUNK below the baseline', Number(pop.aliases) >= 8, `${pop.aliases} (baseline 8)`)

await pg.end()
done()
