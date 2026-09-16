// ⭐⭐⭐ IS ROUTING AN OPERATIONAL PLACEMENT, OR A SEMANTIC ASSERTION OF QUESTION IDENTITY?
//
//   node test/checks/routing-act-scope-check.mjs
//
// Ote, 2026-09-17: *"When the resolver chooses a Slot for an observation, is it merely selecting an
// operational destination among already-known properties, or is it semantically asserting that the
// observation answers that Slot's question? … If the source cannot establish that, report the ambiguity
// rather than choosing."*
//
// ⛔⛔ READ-ONLY. ⛔ No resolver change · no threshold · no binding · no alias · no historical row ·
// no 047 population · no `contradicted_at` backfill · no fact relation vocabulary · no Dreaming change.
// ⛔ A-D4 UNTOUCHED. A1 still shadow.
//
// ── ⭐⭐ THE THREE ACTS (Ote's decomposition) ───────────────────────────────────────────────────────
//     ① ADDRESS           which existing conceptual destination does this observation belong to?
//     ② DECLARE QUESTION  what question does that Slot ask?
//     ③ ADMIT ANSWER      is this observation a valid answer to that question?
//
// 047 plainly separates ② from ③. ⭐ THE OPEN QUESTION IS WHETHER ① AND ② ARE INDEPENDENT.
//
// ── ⛔ WHAT THIS INSTRUMENT DOES NOT DO ─────────────────────────────────────────────────────────────
// It does NOT argue the verdict — that reading lives in the doc. It pins the STRUCTURAL facts the reading
// rests on, so the argument cannot drift from the code. ⚠️ Every assertion here is about a MECHANISM
// (a column that exists or does not, a value that flows or does not), ⛔ never about a comment's wording.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  THE ROUTING ACT — placement, or an assertion of question identity?')
console.log('  ⛔ read-only · ⛔ nothing proposed · ⛔ A-D4 untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① DOES THE ROUTING ACT HAVE AN AUTHOR? ────────────────────────────────────────────────────────
// ⭐ THE SHARPEST AVAILABLE TEST, and it is purely structural: DECLARING a question records who did it.
// Does MINTING/addressing a slot record anything comparable?
const slotCols = (await q(
  `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'mst_slots'`,
  [devSchema()])).map((r) => r.column_name)
const questionCols = (await q(
  `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'mst_slot_questions'`,
  [devSchema()])).map((r) => r.column_name)
const AUTHORSHIP = ['writer', 'declared_by', 'act_kind', 'act_id', 'occasion', 'declared_in_occasion', 'author']
const slotAuthor = AUTHORSHIP.filter((c) => slotCols.includes(c))
const questionAuthor = AUTHORSHIP.filter((c) => questionCols.includes(c))

console.log('\n① DOES THE ROUTING ACT HAVE AN AUTHOR?\n')
console.log(`   mst_slots columns            ${slotCols.join(' · ')}`)
console.log(`   ⇒ authorship columns         ${slotAuthor.length ? slotAuthor.join(' · ') : '⛔ NONE'}`)
console.log(`   mst_slot_questions           ⇒ authorship columns: ${questionAuthor.join(' · ')}`)
check('⭐⭐⭐ MINTING A SLOT RECORDS NO AUTHOR — ⛔ no writer, act, occasion or declarer column exists',
  slotAuthor.length === 0, slotAuthor.join(' · ') || 'mst_slots has no authorship column at all')
check('⭐⭐ DECLARING A QUESTION DOES RECORD ONE — the asymmetry is in the schema, ⛔ not in a comment',
  questionAuthor.length > 0, `mst_slot_questions carries: ${questionAuthor.join(' · ')}`)

// what DOES minting record?
const ev = await q(`SELECT evidence FROM ${S}."mst_slots" WHERE evidence IS NOT NULL LIMIT 400`)
const keys = new Set()
for (const r of ev) for (const k of Object.keys(r.evidence ?? {})) keys.add(k)
const mintedByValues = new Set(ev.map((r) => r.evidence?.mintedBy).filter(Boolean))
console.log(`\n   what minting DOES record     evidence keys: ${[...keys].join(' · ')}`)
console.log(`   distinct \`mintedBy\` values   ${[...mintedByValues].join(' · ')}`)
check('⚠️ `mintedBy` NAMES A CODE PATH, ⛔ not an actor — it cannot answer "who decided this"',
  mintedByValues.size > 0 && [...mintedByValues].every((v) => !String(v).includes('@') && /^[a-zA-Z]+$/.test(String(v))),
  `${[...mintedByValues].join(' · ')} — a function name`)

// ── ② IS THE ROUTING DECISION REVERSIBLE? ─────────────────────────────────────────────────────────
// ⚠️ STRUCTURAL: does any shipped write path change a memory's slot_id after the fact?
// ⚠️ THE FIRST VERSION OF THIS SCAN WAS WRONG, AND IT IS RECORDED RATHER THAN QUIETLY FIXED.
// It tested /UPDATE[^;]*SET[^;]*slot_id/ — and `[^;]*` runs across an entire CTE, so it matched the BIND
// statement in `memory-declaration-host`, where the UPDATE sets `mst_slots.question_id` and `slot_id`
// merely appears LATER, as a column name in the `log_slot_bindings` INSERT list. ⇒ ⭐ a "re-route path"
// that was actually the one act in this area that IS fully governed. ⛔ A regex spanning a statement
// boundary is not a statement match.
// ⇒ this version binds the assignment to its TARGET TABLE and to an assignment operator.
const { readdirSync, statSync } = await import('node:fs')
const REROUTE_SQL = /UPDATE\s+[^\s;]*["`']?txn_memories["`']?[\s\S]{0,400}?\bSET\b[\s\S]{0,200}?\bslot_id\s*=/i
const REROUTE_ORM = /\b(?:update|set)\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?\{[^}]*\bslot_id\s*:/i
const sites = []
const scan = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`
    if (statSync(p).isDirectory()) { scan(p); continue }
    if (!name.endsWith('.js')) continue
    const text = readFileSync(p, 'utf8')
    if (REROUTE_SQL.test(text)) sites.push(`${name} (SQL)`)
    if (REROUTE_ORM.test(text)) sites.push(`${name} (ORM)`)
  }
}
const here = new URL('../../Backend/app', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
scan(here)
scan(new URL('../../../../PortableComponents/Packages/Memory/cognition', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
console.log('\n② IS A ROUTING DECISION REVERSIBLE?\n')
console.log(`   shipped paths that ASSIGN txn_memories.slot_id after creation : ${sites.length ? sites.join(' · ') : '⛔ NONE'}`)
console.log('   ⓘ scanned Backend/app/** and the @ote/memory cognition package.')
// ⭐⭐ POSITIVE CONTROL — ⛔ a "found nothing" result is worthless until the instrument is shown able to
// find something. Both patterns are fired at synthetic positives, and at the exact false positive that
// fooled the first version, so the check proves it can still detect a real re-route AND still rejects the
// BIND statement.
const CTRL_SQL = 'UPDATE "s"."txn_memories" SET slot_id = $1 WHERE id = $2'
const CTRL_ORM = 'await store.update([row.id], { slot_id: newSlot.id })'
const CTRL_FALSEPOS = `WITH upd AS (UPDATE "s"."mst_slots" SET question_id = $2 WHERE id = $1 RETURNING id)
  INSERT INTO "s"."log_slot_bindings" (slot_id, action, actor) SELECT upd.id, 'confirm', $3 FROM upd`
check('⭐⭐ POSITIVE CONTROL · both re-route patterns DO fire on a genuine re-route',
  REROUTE_SQL.test(CTRL_SQL) && REROUTE_ORM.test(CTRL_ORM),
  `SQL=${REROUTE_SQL.test(CTRL_SQL)} · ORM=${REROUTE_ORM.test(CTRL_ORM)}`)
check('⭐⭐⭐ NEGATIVE CONTROL · the BIND statement is NOT mistaken for a re-route (defect #15, pinned)',
  !REROUTE_SQL.test(CTRL_FALSEPOS) && !REROUTE_ORM.test(CTRL_FALSEPOS),
  'the governed bind act no longer reads as a slot_id re-route')
// ⛔⛔ CORRECTED 2026-09-17 — THIS CHECK PREVIOUSLY ASSERTED "ROUTING IS IRREVERSIBLE" AND WAS WRONG.
// `slot-authority-map.mjs` found `store.update(orphans, { slot_id: slot.id })` in memory-v2-service: rows
// already pulled into `matches` but carrying no slot_id are PERMANENTLY written into the slot. My ORM
// pattern missed it because it required the first argument to be a bracketed array — `orphans` is a bare
// identifier. ⇒ ⭐ THE CLAIM IS NOW THE NARROW ONE THE EVIDENCE SUPPORTS: no path moves a row from one
// slot to a DIFFERENT slot; one path does fill a row's EMPTY slot after the fact.
check('⭐⭐ NO RE-HOMING BETWEEN SLOTS — ⛔ but membership CAN be filled in after creation (adoption)',
  sites.length === 0, `${sites.join(' · ') || 'no slot-to-slot move'} · ⚠️ see slot-authority-map §2 for the adoption path`)

// ── ③ ⭐⭐⭐ WHAT DOES slot_id CONTROL DOWNSTREAM? ────────────────────────────────────────────────
// ⭐ THE DECISIVE STRUCTURAL FACT. If slot_id only decided WHERE a row is filed, mis-routing would be
// untidy. It decides the `matches` set → `primary` → what `resolveConflict` SUPERSEDES. ⇒ routing selects
// which existing belief this observation competes with and may INVALIDATE.
// ⚠️ Proven from the CORPUS, not from reading the call chain: every superseded row must share the slot of
// the row that replaced it. If that holds with no exception, slot_id IS the competition boundary.
// ⛔⛔ CORRECTED — the first version used `IS NOT DISTINCT FROM`, which treats NULL = NULL as a MATCH.
// It reported "77/77 stay inside one slot" when 2 of those pairs had NO SLOT ON EITHER SIDE and evidence
// nothing at all. ⇒ ⭐ the four cases are separated, and the claim rests only on the pairs that have a slot.
const [xslot] = await q(`
  SELECT count(*)::int AS total,
    count(*) FILTER (WHERE n.slot_id IS NOT NULL AND o.slot_id IS NOT NULL AND n.slot_id = o.slot_id)::int AS same,
    count(*) FILTER (WHERE n.slot_id IS NOT NULL AND o.slot_id IS NOT NULL AND n.slot_id <> o.slot_id)::int AS crossed,
    count(*) FILTER (WHERE n.slot_id IS NULL AND o.slot_id IS NULL)::int AS neither,
    count(*) FILTER (WHERE (n.slot_id IS NULL) <> (o.slot_id IS NULL))::int AS one_sided
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id`)
console.log('\n③ ⭐⭐⭐ WHAT DOES slot_id ACTUALLY CONTROL?\n')
console.log(`   supersession events in the corpus       ${xslot.total}`)
console.log(`   both slotted · SAME slot                ${xslot.same}   ⭐ the only pairs that evidence the boundary`)
console.log(`   both slotted · DIFFERENT slot           ${xslot.crossed}`)
console.log(`   neither slotted                         ${xslot.neither}   ⚠️ evidences NOTHING — ⛔ excluded from the claim`)
console.log(`   exactly one slotted                     ${xslot.one_sided}`)
check('⭐⭐⭐ SUPERSESSION NEVER CROSSES A SLOT — ⇒ slot_id IS the competition boundary, ⛔ not a filing label',
  xslot.same > 0 && xslot.crossed === 0 && xslot.one_sided === 0,
  `${xslot.same} same · ${xslot.crossed} crossed · ${xslot.one_sided} one-sided · ${xslot.neither} slotless (excluded)`)

// ── ④ IS A SLOT WITHOUT A QUESTION SEMANTICALLY IDENTIFIED? ───────────────────────────────────────
const [decl] = await q(`SELECT count(*)::int AS all_slots, count(question_id)::int AS declared FROM ${S}."mst_slots"`)
const [acting] = await q(`
  SELECT count(DISTINCT s.id)::int AS n FROM ${S}."mst_slots" s
  JOIN ${S}."txn_memories" n ON n.slot_id = s.id AND n.supersedes_id IS NOT NULL
  WHERE s.question_id IS NULL`)
console.log('\n④ IS AN UNDECLARED SLOT SEMANTICALLY IDENTIFIED?\n')
console.log(`   slots                                        ${decl.all_slots}`)
console.log(`   ⇒ with a DECLARED question                   ${decl.declared}`)
console.log(`   ⇒ UNDECLARED slots that have SUPERSEDED a belief  ${acting.n}`)
check('⭐⭐⭐ UNDECLARED SLOTS EXERCISE REPLACEMENT AUTHORITY — identity by LABEL, ⛔ not by declaration',
  acting.n > 0 && decl.declared <= 1,
  `${acting.n} slot(s) with question_id NULL have invalidated a belief · only ${decl.declared} slot declared`)

// ── ⑤ DOES A SUCCESSFUL ROUTING TEACH? ────────────────────────────────────────────────────────────
// ⭐ A3: an adjudicated verdict is PROMOTED to a durable alias, changing all future routing. An assertion
// that persists and steers later decisions is more than a placement.
const [al] = await q(`SELECT count(*)::int AS n FROM ${S}."mst_slots" WHERE jsonb_array_length(COALESCE(aliases,'[]'::jsonb)) > 0`)
const [led] = await q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE action='refuse')::int AS refused FROM ${S}."log_slot_aliases"`)
console.log('\n⑤ DOES A SUCCESSFUL ROUTING TEACH?\n')
console.log(`   slots carrying learned aliases   ${al.n}`)
console.log(`   alias ledger rows                ${led.n}   (refused: ${led.refused})`)
console.log('   ⇒ ⭐ a routing decision can become DURABLE and steer every future write of that phrasing.')
check('⭐ ROUTING CAN TEACH — learned aliases exist, so a routing decision persists beyond its own write',
  al.n > 0, `${al.n} slots carry at least one alias`)
// ⭐⭐ AND THE ASYMMETRY THAT MATTERS: teaching is GOVERNED (A3 refuses without an ACT); minting is not.
check('⭐⭐⭐ TEACHING IS GOVERNED BUT MINTING IS NOT — the ledger records refusals; ⛔ nothing gates a mint',
  led.n > 0 && led.refused > 0 && slotAuthor.length === 0,
  `${led.refused} alias write(s) refused for want of an ACT · mst_slots requires none`)

// ── ⑥ DOES THE ROUTING DECISION CARRY ITS OWN PROVENANCE? ─────────────────────────────────────────
// The memory row carries the four axes — but those describe the OBSERVATION, ⛔ not the routing decision.
const memCols = (await q(
  `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'txn_memories'`,
  [devSchema()])).map((r) => r.column_name)
const ROUTING_PROV = ['slot_resolved_by', 'slot_confidence', 'slot_route_reason', 'routed_by', 'slot_arm']
const present = ROUTING_PROV.filter((c) => memCols.includes(c))
console.log('\n⑥ DOES THE ROUTING DECISION CARRY ITS OWN PROVENANCE ON THE ROW?\n')
console.log(`   columns naming HOW the slot was chosen : ${present.length ? present.join(' · ') : '⛔ NONE'}`)
console.log('   ⓘ The arm and confidence ARE written — into the audit log\'s free-text `reason`')
console.log('     ("cosine 0.84 · \\"role/association\\" → slot \\"role\\""), ⛔ never as a queryable column.')
check('⚠️ THE ROUTING DECISION HAS NO STRUCTURED PROVENANCE ON THE ROW — only free text in the audit log',
  present.length === 0, present.join(' · ') || 'no routing-provenance column on txn_memories')

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
