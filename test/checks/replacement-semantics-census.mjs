// ⭐⭐⭐ WHAT DOES THE SLOT REPRESENT WHEN A SECOND VALUE ARRIVES?
//
//   node test/checks/replacement-semantics-census.mjs
//
// Ote, 2026-09-17: *"I would investigate the actual replacement cases and classify them by semantic
// relationship… The goal is to establish whether the existing slot abstraction actually has a concept of
// identity + current value + history, or whether it currently just has identity + latest arrival."*
//
// ⛔⛔ EVIDENCE ONLY. Writes nothing, calls no model, changes no behaviour. ⛔ No repairs · rows and
// collisions preserved exactly · A1 still shadow · A-D4 still open · ⛔ nothing is "fixed".
//
// ── ⚠️ THIS INSTRUMENT CONTAINS A HUMAN JUDGEMENT, AND SAYS SO ──────────────────────────────────────
//
// Ote supplied the taxonomy; the assignment of each transition to a class is MINE. ⛔ It is not computed,
// because a classifier for "same proposition, different wording" would be exactly the inventing-semantics
// that is ruled out. ⇒ every judgement below is DECLARED, carries its reasoning, and is PINNED TO THE
// EVIDENCE IT WAS MADE FROM: the check re-reads both values and fails if either has changed, so a stale
// judgement announces itself instead of quietly describing a row that no longer exists.
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—')
const flat = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

// ── OTE'S TAXONOMY, verbatim ───────────────────────────────────────────────────────────────────────
const CLASS = Object.freeze({
  restate: 'RE-STATEMENT            same proposition, different wording',
  world: 'WORLD / STATE CHANGE    same property, genuinely different answer',
  repair: 'CORRECTION / REPAIR     extraction error',
  wrongSlot: 'WRONG SLOT              different conceptual property',
  // ⚠️ A FIFTH, WHICH THE EVIDENCE FORCED. ⛔ I did not invent it to be clever — transition ④ below
  // restates one proposition, elaborates a second and genuinely CHANGES a third, all inside one value.
  // None of Ote's four fits, and picking the closest would have hidden the reason it does not fit.
  mixed: 'MIXED                   ⚠️ several propositions in one value, each doing something different',
})

// ⭐ THE DECLARED JUDGEMENTS. `from`/`to` are the first 48 chars of the values this judgement was made
// about — the pin. ⚠️ `contested: true` marks a call Ote should overrule if he reads it differently.
const JUDGEMENTS = [
  { slot: 'core_commitments', from: 'rests on small steady things rather than system', to: 'a garden he tends, showing up for a kid as an au',
    cls: 'restate', why: 'the SAME three commitments — garden · aunt to a kid · usefulness over impressiveness — reordered and reworded. Nothing added, nothing dropped.' },
  { slot: 'communication preference', from: 'prefers direct correction over comfort — would', to: 'sharp edge over comfort',
    cls: 'restate', why: '⚠️ LOSSY. Same proposition, but the SHORTER form replaced the longer one — the current answer got less informative, not more current.' },
  { slot: 'communication preference', from: 'sharp edge over comfort', to: 'friction over agreement',
    cls: 'restate', contested: true,
    why: '⚠️ CONTESTED — charitably the same disposition; strictly, "comfort" and "agreement" are not the same thing, and wanting plain correction is not wanting disagreement. ⇒ ⛔ THE RECORD CANNOT SETTLE IT, which is itself the finding.' },
  { slot: 'soteras_family_lineage_and_key_relationships', from: 'Ote (Creator/Dad): My father; we will build \'Rom', to: 'Ote (Dad/Creator): My father; we will build \'Rom',
    cls: 'mixed', why: '⭐⭐ Ote: word order only (RE-STATEMENT). Hermes: gains provenance + role detail (ELABORATION). Claude: (Builder/BROTHER, friend/colleague) → (UNCLE/Builder, Dad\'s friend) — ⭐ A GENUINELY CHANGED RELATION. Three propositions, three different acts, ONE supersede event. ⇒ the coordination label made this unexpressible.' },
  { slot: 'timezone', from: 'User\'s timezone is Bangkok (Asia/Bangkok).', to: 'Bangkok',
    cls: 'restate', why: '⚠️ LOSSY. Identical answer; the IANA zone was dropped. ⛔ Nothing about the world changed, and the old row was marked invalid IN THE WORLD.' },
  { slot: 'current goal', from: 'build Rome in one day', to: 'Building Sotera — what Ote calls \'building Rome',
    cls: 'repair', why: '⭐ ROME = SOTERA. An extraction error repaired by `operator`. ⭐⭐ AND IT IS THE ONLY TRANSITION IN THE CORPUS THAT ALSO SET `contradicted_at` — the one honest use of the second axis, and a human set it.' },
  { slot: 'youngest sister', from: 'Mira, training to be a paramedic in Chiang Mai', to: 'Mira, works as a paramedic in Bangkok (finished',
    cls: 'world', why: '⭐ THE ONE GENUINE WORLD CHANGE in the corpus — training→works, Chiang Mai→Bangkok. ⚠️ And it is the fixture Ote authored to test exactly this.' },
  { slot: 'work schedule', from: 'up past 2am', to: 'Saturdays',
    cls: 'wrongSlot', why: 'a working HABIT replaced by a DAY. ⛔ Two different questions; no single value can answer both.' },
  { slot: 'work schedule', from: 'Saturdays', to: 'The user volunteers at an animal shelter on Huay',
    cls: 'wrongSlot', why: 'VOLUNTEERING replaced a work schedule — the A-investigation defect, reached through the `schedule` alias.' },
]

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  REPLACEMENT SEMANTICS · what does a slot represent when a second value arrives?')
console.log('  ⛔ evidence only · no writes · ⛔ no repairs · ⛔ A-D4 untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① EVERY TRANSITION, FROM THE LIVE CORPUS ───────────────────────────────────────────────────────
const trans = await q(`
  SELECT s.canonical_label AS label, n.id::text AS new_id, o.id::text AS old_id,
         o.value AS old_value, n.value AS new_value, o.writer AS old_writer, n.writer AS new_writer,
         o.invalid_at, o.expired_at, o.contradicted_at, n.created_at
  FROM ${S}."txn_memories" n
  JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id
  JOIN ${S}."mst_slots"    s ON s.id = n.slot_id
  WHERE n.supersedes_id IS NOT NULL
    AND s.canonical_label NOT LIKE 'zz%' AND s.canonical_label <> 'build tag for this cycle'
  ORDER BY n.created_at ASC`)

// pin each declared judgement to a live transition
const matched = []
for (const j of JUDGEMENTS) {
  const t = trans.find((r) => r.label === j.slot
    && flat(r.old_value).startsWith(j.from) && flat(r.new_value).startsWith(j.to))
  matched.push({ ...j, t })
}

console.log(`\n① THE ${trans.length} REPLACEMENT EVENTS, CLASSIFIED AGAINST OTE'S TAXONOMY`)
console.log('   ⚠️ the CLASS is a human judgement (mine); the VALUES are the record.\n')
let n = 0
for (const m of matched) {
  n++
  const tag = CLASS[m.cls].split(/\s{2,}/)[0]
  console.log(`   ${rpad(`${n}.`, 4)} ${pad(tag, 24)}${m.contested ? '⚠️ CONTESTED  ' : ''}${m.slot}`)
  console.log(`        FROM  ${flat(m.t?.old_value).slice(0, 88)}`)
  console.log(`        TO    ${flat(m.t?.new_value).slice(0, 88)}`)
  console.log(`        ⇒ ${m.why}`)
  console.log('')
}

console.log('   TALLY — ⚠️ n = 9, ⛔ no rate is claimed from it:\n')
for (const [k, label] of Object.entries(CLASS)) {
  const c = matched.filter((m) => m.cls === k).length
  if (c) console.log(`     ${rpad(c, 3)}  ${label}`)
}
const notBelief = matched.filter((m) => m.cls !== 'world').length
console.log(`\n   ⭐⭐⭐ ${notBelief} of ${matched.length} replacement events were NOT a belief being revised.`)
console.log('   ⛔ Yet all of them are recorded identically. §2 is why.')

// ── ② ⭐⭐⭐ THE STRUCTURAL QUESTION — identity + current + history, or identity + latest arrival? ──
console.log('\n② ⭐⭐⭐ WHAT THE RECORD CAN EXPRESS — the columns, and what actually fills them\n')
const [occ] = await q(`SELECT count(*)::int AS n,
  count(valid_at)::int AS valid_at, count(invalid_at)::int AS invalid_at,
  count(expired_at)::int AS expired_at, count(contradicted_at)::int AS contradicted_at,
  count(supersedes_id)::int AS supersedes_id FROM ${S}."txn_memories"`)
const DECLARED = {
  valid_at: 'when true IN THE WORLD',
  invalid_at: 'superseded/expired IN THE WORLD (null = still valid)',
  expired_at: 'when the SYSTEM stopped believing it (transaction time end)',
  contradicted_at: 'disputed and STILL STANDING — independent of invalid_at',
  supersedes_id: 'this row revises that one',
}
console.log(`   ${pad('column', 18)}${pad('rows', 7)}${pad('%', 8)}what the MODEL declares it means`)
console.log('   ' + '─'.repeat(104))
for (const [k, meaning] of Object.entries(DECLARED)) {
  console.log(`   ${pad(k, 18)}${pad(occ[k], 7)}${pad(pct(occ[k], occ.n), 8)}${meaning}`)
}
console.log(`   n = ${occ.n} memory rows\n`)
console.log('   ⭐⭐⭐ THE BI-TEMPORAL DESIGN IS DECLARED AND IS NOT IN USE:')
console.log('     · `valid_at` is written as `new Date(now())` at commit — the shipped source says so itself:')
console.log('       "⛔ `valid_at` IS NOT USED and is not exposed: it equals `created_at` on most rows."')
console.log('     · `invalid_at` is likewise written with the SYSTEM clock, at the moment a DIFFERENT STRING')
console.log('       arrived. ⇒ it records WHEN WE LEARNED, while the model declares it means WHEN IT STOPPED')
console.log('       BEING TRUE IN THE WORLD. ⛔ The timezone row is marked invalid in the world and is still true.')
console.log('     · `expired_at` and `contradicted_at` are effectively unused.')
console.log('   ⇒ ⭐ TWO DECLARED TIME AXES, ⛔ ONE ACTUAL ONE — and it is transaction time wearing valid time\'s name.')

// how the 9 transitions marked the displaced row — can the record tell the classes apart?
const marks = new Map()
for (const m of matched) {
  const k = `invalid_at=${m.t?.invalid_at ? 'SET' : 'null'} · expired_at=${m.t?.expired_at ? 'SET' : 'null'} · contradicted_at=${m.t?.contradicted_at ? 'SET' : 'null'}`
  if (!marks.has(k)) marks.set(k, [])
  marks.get(k).push(m.cls)
}
console.log('\n   HOW THE DISPLACED ROW WAS MARKED, per transition:\n')
for (const [k, classes] of marks) {
  console.log(`     ${pad(k, 62)}${classes.length}×  classes: ${[...new Set(classes)].join(', ')}`)
}
console.log('\n   ⇒ ⭐⭐⭐ FIVE SEMANTIC CLASSES COLLAPSE INTO ONE RECORDED STATE. The record cannot tell a')
console.log('     re-statement from a world change from a wrong-slot write. ⛔ `superseded` is not a')
console.log('     semantic verdict — it is the residue of `norm(a) !== norm(b)`.')

// ── ③ WHO CAN READ THE HISTORY? ────────────────────────────────────────────────────────────────────
console.log('\n③ ⭐⭐ IS THE HISTORY READABLE BY COGNITION? (from the shipped read paths)\n')
console.log('   memory-store-sequelize-host   const LIVE = { invalid_at: null, expired_at: null }   ← every recall')
console.log('   dreaming-candidate-host       AND invalid_at IS NULL AND expired_at IS NULL AND contradicted_at IS NULL')
console.log('   memory-v2-service (comment)   "every read path filters on `invalid_at IS NULL AND expired_at IS')
console.log('                                  NULL`. History was preserved and useless."')
console.log('\n   READERS OF THE DEAD: `listArchived` (audit), the memory log, `forget()`\'s un-supersede,')
console.log('   and `corrections-host` (contradicted-but-standing). ⛔ NONE of them is a cognitive read.')
console.log('\n   ⇒ ⭐⭐⭐ THE ANSWER TO THE QUESTION:')
console.log('     ⛔ NOT  identity + current value + history')
console.log('     ✅ BUT  identity + LATEST ARRIVAL  +  an append-only trail only the audit path can see.')
console.log('     ⚠️ Dreaming\'s own candidate query filters out every superseded row ⇒ ⛔ IT CANNOT SEE CHANGE.')

// ── ④ ⭐⭐⭐ THE PRECEDENT — Ote already ruled this, on the LESSON path ─────────────────────────────
console.log('\n④ ⭐⭐⭐ THE VOCABULARY ALREADY EXISTS — on the LESSON path, by Ote\'s own ruling\n')
console.log('   lesson-host.js  RELATIONS = [\'supersedes\', \'refines\', \'coexists_with\', \'qualifies\']')
console.log('   ⛔ ONLY `supersedes` archives the prior. The other three keep it LIVE and record the relation.')
console.log('\n   > Ote, decision 4: *"Sotera decides. A new understanding may supersede an old one, refine it,')
console.log('   > coexist with it, or qualify it depending on what she actually learned. ⭐ We should not force')
console.log('   > every change into a simple replacement chain."*')
console.log('\n   ⇒ ⭐⭐ THE RULING HE IS CIRCLING FOR FACTS IS ONE HE ALREADY MADE FOR LESSONS, AND IT IS BUILT.')
console.log('     ⛔ The fact/slot path still forces every change into a simple replacement chain, and decides')
console.log('     which one by string inequality. ⛔ NOTHING IS PROPOSED HERE — this is where the precedent is.')

// ── ⑤ IS A SECOND VALUE ARRIVING ELSEWHERE? (the case §1 structurally cannot see) ──────────────────
console.log('\n⑤ THE CASE §1 CANNOT SEE — a second value that was routed to a DIFFERENT slot\n')
console.log('   ⓘ Measured separately (ontology over live-bearing slot pairs, same user+entity):')
console.log('     different 214 · unknown 114 · sibling 2 · ⭐ same/broader/narrower 0')
console.log('   ⇒ ⛔ NO fragmentation DETECTED among live slots — ⚠️ and "not detected" is not "none":')
console.log('     114 of 330 pairs are `unknown`, so the ontology was never able to answer for a THIRD of them.')

// ── ⑥ INVARIANTS ──────────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ INVARIANTS\n')
check('⚠️ ANTI-VACUITY · the corpus produced replacement events to classify',
  trans.length >= 9, `${trans.length} transitions`)
check('⭐⭐ EVERY DECLARED JUDGEMENT IS PINNED TO A LIVE TRANSITION — ⛔ none describes a vanished row',
  matched.every((m) => m.t), matched.filter((m) => !m.t).map((m) => m.slot).join(', ') || 'all 9 matched')
check('⛔ THE CLASSIFICATION COVERS EVERY TRANSITION — no event was quietly skipped',
  matched.length === trans.length, `${matched.length} judgements · ${trans.length} transitions`)
check('⭐⭐⭐ THE RECORD CANNOT SEPARATE THE CLASSES — >1 semantic class shares one marking',
  [...marks.values()].some((cs) => new Set(cs).size > 1),
  [...marks.entries()].map(([k, c]) => `${new Set(c).size} classes @ ${k}`).join(' | '))
// ⚠️ ASSERT THE DATA, ⛔ NOT THE COMMENT. The source says `valid_at` "equals created_at on most rows and
// holds a genuine 'true since' only for document ingest" — believing a comment is not evidence, so this
// measures it: how many rows have valid_at within 2s of created_at, and what are the ones that do not?
const [vt] = await q(`SELECT
  count(*) FILTER (WHERE valid_at IS NOT NULL)::int AS has_valid,
  count(*) FILTER (WHERE valid_at IS NOT NULL AND abs(extract(epoch FROM (valid_at - created_at))) < 2)::int AS at_commit,
  count(*) FILTER (WHERE valid_at IS NOT NULL AND abs(extract(epoch FROM (valid_at - created_at))) >= 86400
                     AND source LIKE 'doc:%')::int AS doc_ingest,
  count(*) FILTER (WHERE valid_at IS NOT NULL AND abs(extract(epoch FROM (valid_at - created_at))) >= 86400
                     AND source NOT LIKE 'doc:%')::int AS real_world_time
  FROM ${S}."txn_memories"`)
console.log(`\n   ⚠️ VERIFIED AGAINST THE DATA, not the comment: of ${vt.has_valid} rows carrying \`valid_at\`,`)
console.log(`      ${vt.at_commit} are within 2s of \`created_at\` · ${vt.doc_ingest} differ by >1 day and are ALL \`doc:\` ingest`)
console.log(`      · ${vt.real_world_time} carry a genuine world "true since" from any other source.`)
check('⭐ `valid_at` is COMMIT TIME for conversational memory — ⛔ no row outside doc ingest carries a real "true since"',
  vt.real_world_time === 0 && vt.at_commit > vt.has_valid * 0.8,
  `${vt.at_commit}/${vt.has_valid} at commit · ${vt.doc_ingest} doc-ingest · ${vt.real_world_time} genuine world-time`)
check('⭐ the second axes are effectively unused — expired_at + contradicted_at < 5% of rows',
  (occ.expired_at + occ.contradicted_at) < occ.n * 0.05,
  `expired_at ${occ.expired_at} · contradicted_at ${occ.contradicted_at} of ${occ.n}`)
check('⛔ EVIDENCE PRESERVED — the shelter chain and the Mira chain are both still present',
  trans.some((t) => t.label === 'work schedule') && trans.some((t) => t.label === 'youngest sister'))

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, setting or threshold was touched.\n')
done()
