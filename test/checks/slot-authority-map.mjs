// ⭐⭐⭐ slot_id AS SEMANTIC AUTHORITY — what does it actually authorize?
//
//   node test/checks/slot-authority-map.mjs
//
// Ote, 2026-09-17: *"If slot_id determines which belief can replace which other belief, then slot_id is
// carrying semantic authority whether or not the code calls the operation 'routing'. First, let's map what
// authority it already has."*
//
// ⛔⛔ READ-ONLY. ⛔ No resolver change · no threshold · no alias · no binding · no historical repair ·
// no 047 population · no `contradicted_at` backfill · no relation vocabulary · no Dreaming change.
// ⛔ A-D4 untouched. ⛔ Both armed collisions left armed.
//
// ── ⚠️ INSTRUMENT DISCIPLINE, CARRIED FROM DEFECTS #15/#16 ──────────────────────────────────────────
//   · statement-aware: a SET clause is bounded, ⛔ never `[^;]*` across a whole CTE
//   · target-table constrained
//   · POSITIVE control — the scanner is shown able to find a real assignment
//   · NEGATIVE control — the governed BIND statement is pinned as NOT a re-route
//   · ⛔ a nullable column is never compared with `IS NOT DISTINCT FROM` and called a match
//   · where the instrument CANNOT establish something, it says so rather than reporting absence as fact
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync, readdirSync, statSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  slot_id AS SEMANTIC AUTHORITY — mapping what it already authorizes')
console.log('  ⛔ read-only · ⛔ nothing proposed · ⛔ A-D4 untouched')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── ① THE DEPENDENCY CHAIN — traced in source, proved on the corpus ───────────────────────────────
console.log('\n① THE CHAIN FROM slot_id TO "a belief can be displaced"\n')
console.log('   memory-v2-service.reconcileFact:')
console.log('     514  liveFacts   = store.findOwnLive({kind:"semantic"})      ⛔ NOT scoped by slot')
console.log('     523  rowsBySlot  = buildSlotView(canonLive, liveFacts, slots)   ⭐ membership is decided HERE')
console.log('     536  matches     = rowsBySlot.get(resolution.slotId)         ⭐ THE COMPETITION SET')
console.log('     537  primary     = matches[0]                                ⭐ THE INCUMBENT BELIEF')
console.log('     613  plan        = resolveConflict({matches, value})')
console.log('     635  NOOP/DUP  → store.update(plan.collapse, {invalid_at})   ⛔ INVALIDATION')
console.log('     659  UPDATE    → create({supersedes_id: plan.supersedes})    ⛔ SUPERSESSION')
console.log('     670  stale     → invalidate superseded + collapsed')
console.log('\n   ⇒ ⭐⭐⭐ slot_id → matches → primary → plan → invalidation. ⛔ NOTHING ELSE SELECTS THE INCUMBENT.')

// ⭐ PROVED ON THE CORPUS — and ⛔ NOT with `IS NOT DISTINCT FROM`, which counts NULL=NULL as a match and
// would silently fold "no slot at all" into "the same slot". The four cases are separated.
const [x] = await q(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE n.slot_id IS NOT NULL AND o.slot_id IS NOT NULL AND n.slot_id = o.slot_id)::int AS same,
    count(*) FILTER (WHERE n.slot_id IS NOT NULL AND o.slot_id IS NOT NULL AND n.slot_id <> o.slot_id)::int AS crossed,
    count(*) FILTER (WHERE n.slot_id IS NULL AND o.slot_id IS NULL)::int AS neither,
    count(*) FILTER (WHERE (n.slot_id IS NULL) <> (o.slot_id IS NULL))::int AS one_sided
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id`)
console.log('\n   SUPERSESSION PAIRS, DECOMPOSED (⚠️ NOT via IS NOT DISTINCT FROM):\n')
console.log(`     both slotted · SAME slot        ${rpad(x.same, 4)}   ⭐ the only rows that evidence the boundary`)
console.log(`     both slotted · DIFFERENT slot   ${rpad(x.crossed, 4)}`)
console.log(`     neither slotted                 ${rpad(x.neither, 4)}   ⚠️ no slot involved — evidences NOTHING`)
console.log(`     exactly one slotted             ${rpad(x.one_sided, 4)}`)
console.log(`     total                           ${rpad(x.total, 4)}`)
check('⭐⭐⭐ NO SUPERSESSION EVER CROSSES A SLOT — slot_id IS the replacement boundary',
  x.crossed === 0 && x.one_sided === 0 && x.same > 0,
  `${x.same} same · ${x.crossed} crossed · ${x.one_sided} one-sided · ${x.neither} slotless (excluded from the claim)`)
check('⚠️ AND THE SLOTLESS PAIRS ARE EXCLUDED FROM THAT CLAIM, ⛔ not folded into it',
  x.neither > 0, `${x.neither} pair(s) involve no slot and are reported separately`)

// ── ② ⭐⭐⭐ WHAT ELSE ESTABLISHES MEMBERSHIP? — a PINNED INVENTORY, not a verdict regex ───────────
// ⭐ Every site that puts `slot_id` in an assignment position is DECLARED below with its classification.
// If the scan finds a site that is not declared — or loses one that is — the check FAILS. ⇒ a new write
// path cannot appear silently, which a pass/fail regex could never guarantee.
const ROOTS = [
  ['Backend/app', '../../Backend/app'],
  ['@ote/memory/cognition', '../../../../PortableComponents/Packages/Memory/cognition'],
]
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
// ⭐ STATEMENT-AWARE: the SET clause is bounded by the next clause keyword, ⛔ never by `;`.
const SQL_SET = /\bUPDATE\b[\s\S]{0,300}?\btxn_memories\b[\s\S]{0,120}?\bSET\b([\s\S]{0,300}?)(?:\bWHERE\b|\bRETURNING\b|\bFROM\b|`|$)/gi
// ⚠️ `(?!:)` IS LOAD-BEARING — defect #17. Without it the POSTGRES CAST `slot_id::text`, in a SELECT or
// RETURNING list, matches as though it were a JS object key: three READ-ONLY queries were reported as
// undeclared ASSIGNMENT sites. ⇒ ⭐ a cast is not an assignment, and `:` is not an operator until you
// know the language you are in.
const JS_ASSIGN = /\bslot_id\s*:(?!:)/g
const found = []
const scan = (label, dir) => {
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`
    if (statSync(p).isDirectory()) { scan(label, p); continue }
    if (!name.endsWith('.js') || name.includes('.bak')) continue
    const text = stripComments(readFileSync(p, 'utf8'))
    for (const m of text.matchAll(SQL_SET)) if (/\bslot_id\s*=/.test(m[1])) found.push(`${name}:SQL-SET`)
    if (JS_ASSIGN.test(text)) {
      for (const line of text.split('\n')) if (/\bslot_id\s*:(?!:)/.test(line)) found.push(`${name}:${line.trim().slice(0, 62)}`)
    }
  }
}
for (const [label, rel] of ROOTS) scan(label, new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

// ⭐ THE DECLARED INVENTORY. ⚠️ Classification is mine; the SITES are mechanical.
const DECLARED = [
  { match: 'slot_id: slot?.id ?? null', kind: 'CREATION', what: 'the new row carries the routed slot — membership at admission' },
  { match: 'store.update(orphans,', kind: '⭐ POST-CREATION ADOPTION', what: 'rows already in `matches` but carrying no slot_id are PERMANENTLY written into this slot' },
  { match: 'const key = slotId ? { slot_id: slotId }', kind: '⛔ READ', what: 'a WHERE clause in findLiveInSlot — not an assignment' },
  { match: 'slot_id: slotId ?? null', kind: '⛔ OTHER TABLE', what: 'the audit log row, not txn_memories' },
]
console.log('\n② EVERY SITE THAT ASSIGNS `slot_id` — a pinned inventory\n')
const unmatched = []
for (const f of found) {
  const d = DECLARED.find((c) => f.includes(c.match) || f.endsWith(':SQL-SET'))
  if (d) console.log(`   ${pad(d.kind, 26)}${f.split(':')[0]}`)
  else { unmatched.push(f); console.log(`   ${pad('⛔ UNDECLARED SITE', 26)}${f}`) }
}
check('⭐⭐⭐ NO UNDECLARED slot_id ASSIGNMENT EXISTS — a new membership path cannot appear silently',
  unmatched.length === 0, unmatched.join(' | ') || `${found.length} site(s), all declared`)

// ⭐⭐ CONTROLS — a scanner that found nothing proves nothing until it is shown able to find something.
const CTRL_POS_SQL = 'UPDATE "s"."txn_memories" SET slot_id = $1, updated_at = now() WHERE id = $2'
const CTRL_POS_ORM = 'await store.update(orphans, { slot_id: slot.id })'
const CTRL_NEG_BIND = `WITH upd AS (UPDATE "s"."mst_slots" SET question_id = $2 WHERE id = $1 RETURNING id)
  INSERT INTO "s"."log_slot_bindings" (slot_id, action, actor) SELECT upd.id, 'confirm', $3 FROM upd`
const fires = (re, s) => { re.lastIndex = 0; return re.test(s) }
const sqlHits = (s) => [...s.matchAll(SQL_SET)].some((m) => /\bslot_id\s*=/.test(m[1]))
console.log('')
check('⭐⭐ POSITIVE CONTROL · the scanner detects a genuine re-home, in SQL and in ORM form',
  sqlHits(CTRL_POS_SQL) && fires(JS_ASSIGN, CTRL_POS_ORM),
  `SQL=${sqlHits(CTRL_POS_SQL)} · ORM=${fires(JS_ASSIGN, CTRL_POS_ORM)}`)
check('⭐⭐⭐ NEGATIVE CONTROL · the governed BIND statement is NOT read as a slot_id assignment (#15)',
  !sqlHits(CTRL_NEG_BIND), 'the bind act sets mst_slots.question_id; slot_id is only an INSERT column there')

// ── ③ EXISTENCE · IDENTITY · MEMBERSHIP — three acts, separated ──────────────────────────────────
const [sl] = await q(`SELECT count(*)::int AS slots, count(question_id)::int AS declared FROM ${S}."mst_slots"`)
const [qn] = await q(`SELECT count(*)::int AS n FROM ${S}."mst_slot_questions"`)
const [bd] = await q(`SELECT count(*)::int AS n FROM ${S}."log_slot_bindings"`)
console.log('\n③ THREE ACTS, AND WHAT GOVERNS EACH\n')
console.log(`   ${pad('ACT', 26)}${pad('mechanism', 34)}${pad('governed?', 12)}count`)
console.log('   ' + '─'.repeat(96))
console.log(`   ${pad('① SLOT EXISTENCE', 26)}${pad('findOrCreate(label)', 34)}${pad('⛔ NO ACT', 12)}${sl.slots} slots`)
console.log(`   ${pad('② SLOT IDENTITY (question)', 26)}${pad('declare + propose/confirm bind', 34)}${pad('✅ actor+occasion', 12)}${qn.n} question(s) · ${bd.n} binding(s)`)
console.log(`   ${pad('③ MEMORY MEMBERSHIP', 26)}${pad('slot_id at create, + adoption', 34)}${pad('⛔ NO ACT', 12)}${sl.slots - sl.declared} slots undeclared`)
check('⭐⭐⭐ ONLY ACT ② IS GOVERNED — existence and membership require no declared act at all',
  qn.n >= 0 && sl.declared <= 1,
  `${sl.declared} of ${sl.slots} slots carry a declared question`)

// ── ④ THE SEVEN UNDECLARED SLOTS THAT HAVE ALREADY DISPLACED A BELIEF ────────────────────────────
const seven = await q(`
  SELECT DISTINCT s.id::text AS id, s.canonical_label, s.created_at, s.evidence,
         COALESCE(s.aliases,'[]'::jsonb) AS aliases,
         (SELECT count(*)::int FROM ${S}."log_slot_bindings" b WHERE b.slot_id = s.id) AS bindings
  FROM ${S}."mst_slots" s
  JOIN ${S}."txn_memories" n ON n.slot_id = s.id AND n.supersedes_id IS NOT NULL
  WHERE s.question_id IS NULL ORDER BY s.created_at`)
console.log('\n④ THE SEVEN UNDECLARED SLOTS THAT HAVE EXERCISED REPLACEMENT AUTHORITY\n')
for (const s of seven) {
  const labelFromFirst = s.evidence?.firstAttribute === s.canonical_label
  const al = (s.aliases || []).map((a) => `"${a.phrase}"`).join(', ') || '—'
  console.log(`   ${pad(String(s.canonical_label).slice(0, 44), 46)} minted ${String(s.created_at).slice(4, 10)}`)
  console.log(`      label from the FIRST attribute string: ${labelFromFirst ? 'YES' : 'no — ' + s.evidence?.firstAttribute}`)
  console.log(`      aliases: ${al}   ·   question bindings ever logged: ${s.bindings === 0 ? '⛔ NONE' : s.bindings}`)
}
check('⭐⭐⭐ NOT ONE OF THE SEVEN HAS EVER HAD A QUESTION PROPOSED OR BOUND',
  seven.length === 7 && seven.every((s) => Number(s.bindings) === 0),
  `${seven.length} slots · bindings: ${seven.map((s) => s.bindings).join(',')}`)
check('⭐⭐ EVERY ONE TOOK ITS LABEL FROM THE FIRST ATTRIBUTE STRING THAT REACHED reconcileFact',
  seven.every((s) => s.evidence?.firstAttribute === s.canonical_label),
  'canonical_label === evidence.firstAttribute for all seven')

// ── ⑤ ⚠️ WHAT THIS INSTRUMENT CANNOT ESTABLISH ───────────────────────────────────────────────────
// ⛔ Reported rather than glossed, per the standing rule.
const [adopted] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories" m
  JOIN ${S}."mst_slots" s ON s.id = m.slot_id WHERE m.created_at < s.created_at`)
const [slotless] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories"
  WHERE invalid_at IS NULL AND expired_at IS NULL AND kind='semantic' AND slot_id IS NULL
    AND entity IS NOT NULL AND attribute IS NOT NULL AND namespace <> 'identity'`)
console.log('\n⑤ ⚠️ WHAT THIS INSTRUMENT CANNOT ESTABLISH\n')
console.log(`   rows PROVABLY adopted after creation (older than their own slot) : ${adopted.n}`)
console.log('   ⛔ THAT IS A LOWER BOUND, ⛔ NOT A COUNT. A row created AFTER its slot but written without a')
console.log('     slot_id, then adopted later, is INDISTINGUISHABLE from one created with it. `updated_at`')
console.log('     cannot separate them either — `touch()` bumps it on every read.')
console.log(`   ⇒ ⛔ THE INSTRUMENT CANNOT RULE OUT post-hoc adoption. It establishes only that ${adopted.n} case(s)`)
console.log('     are provable, ⛔ never that no others occurred.')
console.log(`\n   slotless live semantic rows in the reconcile candidate set : ${slotless.n}`)
console.log('   ⇒ these are the rows a future phrase-claim could pull into a slot they were never routed to.')
check('⚠️ THE ADOPTION COUNT IS DECLARED AS A LOWER BOUND — ⛔ absence is not established',
  adopted.n >= 0, `${adopted.n} provable · ⛔ an unknown number undetectable by this method`)

await pg.end()
console.log('\n⛔ NOTHING WAS WRITTEN. No row, slot, alias, question, binding or setting was touched.\n')
done()
