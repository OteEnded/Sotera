// ⭐⭐⭐ THE SLOT/OBSERVATION BOUNDARY — does a slot BEHAVE like a slot?
//
//   node test/checks/slot-behaviour-census.mjs
//
// Ote, 2026-09-17: *"Before A-D4, let's understand the slot/observation semantic boundary."*
//
// ⛔⛔ EVIDENCE ONLY. Writes nothing, calls no model, changes no behaviour. ⛔ No resolver authority,
// no slot behaviour, no alias, no A-D4 consequence. ⛔ Nothing is "fixed" here.
//
// ── ⭐⭐ WHAT THIS MEASURES, AND HOW IT DIFFERS FROM THE `unknown` INVESTIGATION ─────────────────────
//
// The `unknown` investigation asked a LINGUISTIC question: is the LABEL shaped like a property name?
// This asks a BEHAVIOURAL one, and it takes the question from the slot model's own docstring:
//
//     "A Slot is the LONG-LIVED IDENTITY of a conceptual property"   — mst_slots.model.js
//
// A slot's whole reason to exist is SUPERSESSION: the world changes, the answer is replaced, and the
// slot is what makes the new answer the SAME BELIEF as the old one rather than a second fact. So the
// falsifiable question is simply: ⭐ HAS IT EVER DONE THAT?
//
// ── ⚠️ THE CONFOUND, STATED UP FRONT BECAUSE IT WOULD OTHERWISE INVALIDATE §1 ───────────────────────
//
// ⛔ "Never superseded" does NOT prove "cannot supersede." This corpus is ~5 weeks old, and a timezone
// does not change in 5 weeks. SCARCE IS NOT STRUCTURAL — and reading absence as structure is a trap
// this project has fallen into before.
//
// ⇒ ⭐⭐⭐ THE FINDING THEREFORE RESTS ON THE NUMERATOR, NOT THE DENOMINATOR. §1 (how many never
// superseded) is age-confounded and is reported as context only. §2 (what the supersessions that DID
// happen actually DID) is NOT age-confounded — it is a property of the events that occurred. Every
// load-bearing claim in the write-up comes from §2 and §3.
//
// ── ⚠️ AN INSTRUMENT DEFECT THIS CHECK WAS BORN WITH, recorded per the standing rule ────────────────
//
// My first pass grouped memory rows BY canonical_label. Two distinct slots share the label
// `communication preference`, so their histories merged and the merged slot appeared to hold TWO LIVE
// ROWS — an apparent violation of "one slot holds one answer" that does not exist. ⇒ ⭐ EVERYTHING HERE
// KEYS ON slot.id. A label is not an identity; that is the entire premise of the slot table, and I
// broke it in the instrument built to examine it.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { attributeShapeOf } from '@ote/memory/cognition/memory-normalize.js'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—')

// ⭐ DECLARED EXCLUSIONS — named, never silently dropped. A silently-filtered row is how a denominator lies.
const FIXTURE = /^zz/i
const HARNESS_LABEL = 'build tag for this cycle'   // agent_dev canary: 67 rows / 207 writes, my own restart probe

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  SLOT/OBSERVATION BOUNDARY · does a slot BEHAVE like a slot? — ⛔ evidence only, no writes')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ⚠️ LEFT JOIN, DELIBERATELY. An INNER JOIN here silently drops every slot holding no memory row, and
// the denominator then depends on a join type rather than on a declared decision. The first run of this
// check reported 65 real slots where the exploratory query reported 95 — same corpus, same day, two
// different numbers, because of one keyword. ⇒ every slot is fetched and every exclusion is made BELOW,
// by name, in the open.
const slots = await q(`
  SELECT s.id::text AS id, s.canonical_label AS label, s.entity, s.write_count,
         count(m.id)::int                                              AS rows_total,
         count(m.id) FILTER (WHERE m.invalid_at IS NULL)::int          AS live,
         count(m.id) FILTER (WHERE m.supersedes_id IS NOT NULL)::int   AS supersedings
  FROM ${S}."mst_slots" s LEFT JOIN ${S}."txn_memories" m ON m.slot_id = s.id
  GROUP BY s.id, s.canonical_label, s.entity, s.write_count`)

const fixtures = slots.filter((s) => FIXTURE.test(s.label))
const real = slots.filter((s) => !FIXTURE.test(s.label))
// ⭐ A slot holding NO memory row cannot have superseded, so counting it as "never superseded" would pad
// the denominator with vacuous cases and make the headline number look better than the evidence supports.
// ⛔ Excluded — and excluded in the CONSERVATIVE direction. Most carry a high `write_count` with no rows,
// i.e. harness slots whose memories a teardown removed.
const empty = real.filter((s) => s.rows_total === 0)
const harness = real.filter((s) => s.rows_total > 0 && s.label === HARNESS_LABEL)
const corpus = real.filter((s) => s.rows_total > 0 && s.label !== HARNESS_LABEL)
const everSup = corpus.filter((s) => s.supersedings > 0)

const span = (await q(`SELECT min(created_at) AS a, max(created_at) AS b FROM ${S}."txn_memories"`))[0]
const days = Math.round((new Date(span.b) - new Date(span.a)) / 86400000)

// ── ① DENOMINATOR — ⚠️ AGE-CONFOUNDED, CONTEXT ONLY ────────────────────────────────────────────────
console.log('\n① HOW OFTEN DOES A SLOT HOLD A SECOND ANSWER?   ⚠️ age-confounded — context, not a finding\n')
console.log('   ⭐ THE EXCLUSION LADDER, stated in full — a denominator nobody can reconstruct is a denominator\n   nobody can check:\n')
console.log(`   slots in mst_slots                   ${rpad(slots.length, 5)}`)
console.log(`   ⛔ less \`zz\` test fixtures            ${rpad(-fixtures.length, 5)}`)
console.log(`   ⛔ less slots holding NO memory row   ${rpad(-empty.length, 5)}   cannot have superseded — excluded CONSERVATIVELY`)
console.log(`   ⛔ less the harness canary            ${rpad(-harness.length, 5)}   "${HARNESS_LABEL}" — ${harness[0]?.rows_total ?? 0} rows / ${harness[0]?.write_count ?? 0} writes, my own restart probe`)
console.log(`   ${'─'.repeat(38)}`)
console.log(`   ⇒ SLOTS IN THE CENSUS                ${rpad(corpus.length, 5)}`)
console.log('')
console.log(`   slots that EVER superseded           ${rpad(everSup.length, 5)}   ${pct(everSup.length, corpus.length)}`)
console.log(`   slots that NEVER did                 ${rpad(corpus.length - everSup.length, 5)}   ${pct(corpus.length - everSup.length, corpus.length)}`)
console.log(`\n   ⚠️ corpus spans ${days} days. A timezone does not change in ${days} days. ⛔ THIS NUMBER PROVES`)
console.log('   NOTHING ON ITS OWN — absence of change is not incapacity to change. The finding is in §2/§3.')

// ── ② ⭐⭐⭐ NUMERATOR — WHAT DID THE SUPERSESSIONS THAT HAPPENED ACTUALLY DO? ──────────────────────
// ⛔ NOT CLASSIFIED BY THIS INSTRUMENT. Deciding "the world changed" vs "the same answer, reworded" is
// a semantic judgement, and inventing a classifier for it is exactly the "inventing semantics" that is
// ruled out. ⇒ every history is PRINTED IN FULL and a human reads it. The reading lives in the doc.
console.log('\n② ⭐⭐⭐ EVERY SUPERSESSION IN THE CORPUS, IN FULL — ⛔ unclassified by the instrument\n')
for (const s of everSup.sort((a, b) => b.rows_total - a.rows_total)) {
  const hist = await q(`SELECT value, writer, created_at, invalid_at FROM ${S}."txn_memories"
                        WHERE slot_id = $1 ORDER BY created_at ASC`, [s.id])
  const readable = attributeShapeOf(s.label).analysed
  console.log(`   ── ${s.label}   [${readable ? 'READABLE' : 'UNREADABLE'} label · slot ${s.id.slice(0, 8)} · ${s.rows_total} rows, ${s.live} live]`)
  for (const h of hist) {
    console.log(`      ${h.invalid_at ? 'dead' : 'LIVE'} ${pad(h.writer ?? '?', 11)}${String(h.created_at).slice(4, 10)} :: ${String(h.value).replace(/\s+/g, ' ').slice(0, 94)}`)
  }
  console.log('')
}

// ── ③ ⭐⭐ WHAT ACTUALLY TRIGGERS A SUPERSESSION — read from the shipped source, not assumed ─────────
console.log('③ ⭐⭐ WHAT DECIDES A SUPERSESSION (shipped behaviour, quoted from source)\n')
console.log('   memory-extract.js   reconcilePlan:  norm(existing.value) === norm(newValue) ? noop : update')
console.log('   memory-extract.js   norm:           trim · lowercase · [_-] to space · collapse whitespace')
console.log('   memory-conflict.js  action=update  =>  write + supersedes = the current belief')
console.log('\n   ⇒ ⭐⭐⭐ SUPERSESSION FIRES ON STRING INEQUALITY, ⛔ NOT ON THE ANSWER HAVING CHANGED.')
console.log('     A value rewritten from a sentence into a bare term is a SUPERSESSION by this test even')
console.log('     though the answer is identical. ⇒ §1 is an UPPER BOUND on real belief revision, never a')
console.log('     count of it. ⛔ Anyone citing §1 as "beliefs revised" is citing the wrong number.')

// ── ④ IS THE BOUNDARY VISIBLE IN THE LABEL? — the cross-tab against the `unknown` axis ─────────────
console.log('\n④ IS THIS BOUNDARY THE SAME AS THE NAMING BOUNDARY?\n')
const cell = (readable, sup) => corpus.filter((s) => attributeShapeOf(s.label).analysed === readable && (s.supersedings > 0) === sup).length
console.log(`   ${pad('', 24)}superseded     never`)
console.log(`   ${pad('READABLE label', 24)}${rpad(cell(true, true), 6)}${rpad(cell(true, false), 11)}`)
console.log(`   ${pad('UNREADABLE label', 24)}${rpad(cell(false, true), 6)}${rpad(cell(false, false), 11)}`)
console.log('\n   ⚠️ n is far too small to claim a RATE DIFFERENCE between the rows, and none is claimed.')
console.log(`   ⭐ The load-bearing cell is the top-right: ${cell(true, false)} slots whose label IS a well-formed`)
console.log('   property name have also never held a second answer. ⇒ ⛔ WHATEVER SEPARATES A PROPERTY FROM')
console.log('   AN OBSERVATION, IT IS NOT VISIBLE IN THE LABEL — so better naming cannot be the fix for it.')

// ── ⑤ VALUE FORM — ⛔ reported as FORM, not merit ──────────────────────────────────────────────────
// A property's value is an ANSWER ("Bangkok"). A proposition's value is a STATEMENT. Word count and
// sentence count are crude instruments, and they are crude in a way that is stated rather than hidden.
const live = await q(`SELECT s.canonical_label AS label, m.value FROM ${S}."mst_slots" s
  JOIN ${S}."txn_memories" m ON m.slot_id = s.id
  WHERE m.invalid_at IS NULL AND s.canonical_label NOT LIKE 'zz%' AND s.canonical_label <> $1`, [HARNESS_LABEL])
const words = (v) => String(v ?? '').trim().split(/\s+/).filter(Boolean).length
const sentences = (v) => (String(v ?? '').match(/[.;!?](\s|$)/g) ?? []).length
const BUCKETS = [
  ['1-3 words · answer-shaped', (w) => w <= 3],
  ['4-8 words', (w) => w > 3 && w <= 8],
  ['9-20 words', (w) => w > 8 && w <= 20],
  ['21+ words · statement-shaped', (w) => w > 20],
]
console.log('\n⑤ VALUE FORM of live rows — ⛔ a description of FORM, ⛔ not a judgement of merit\n')
let bucketed = 0
for (const [name, test] of BUCKETS) {
  const n = live.filter((r) => test(words(r.value))).length
  bucketed += n
  console.log(`   ${pad(name, 32)}${rpad(n, 4)}   ${pct(n, live.length)}`)
}
const withSentence = live.filter((r) => sentences(r.value) >= 1).length
console.log(`\n   live rows carrying a sentence terminator   ${rpad(withSentence, 4)}   ${pct(withSentence, live.length)}`)
console.log(`   n = ${live.length} live rows on real slots`)

// ── ⑥ INVARIANTS ──────────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ INVARIANTS\n')
check('⚠️ ANTI-VACUITY · the census found real slots AND at least one supersession to read',
  corpus.length > 20 && everSup.length > 0, `${corpus.length} real slots · ${everSup.length} ever superseded`)
check('⭐ ONE SLOT HOLDS ONE ANSWER — no slot carries more than one LIVE row',
  corpus.every((s) => s.live <= 1), `max live per slot = ${Math.max(...corpus.map((s) => s.live))}`)
check('⛔ THE EXCLUSION LADDER IS COMPLETE — every slot is either censused or excluded BY NAME',
  fixtures.length + empty.length + harness.length + corpus.length === slots.length,
  `${fixtures.length} + ${empty.length} + ${harness.length} + ${corpus.length} = ${slots.length}`)
check('⭐ keyed on slot.id, ⛔ not on canonical_label — a label is shared by more than one slot',
  new Set(corpus.map((s) => s.label)).size < corpus.length,
  `${corpus.length} slots carry ${new Set(corpus.map((s) => s.label)).size} distinct labels`)
check('⚠️ the value-form buckets are exhaustive — ⛔ no live row fell outside them',
  bucketed === live.length, `bucket total ${bucketed} = ${live.length} live rows`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, setting or threshold was touched.\n')
done()
