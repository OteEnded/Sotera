// ⭐⭐⭐ DECISION ⑧ · AUTHORITY UNDER UNRESOLVED SEMANTICS
//
//   node test/checks/current-holder-authority-census.mjs
//
// Ote, 2026-09-17, once ① was ruled: *"Investigate what semantic authority a component must possess before
// it may cause an incumbent to cease being the current holder when the relationship between incoming and
// incumbent is either (a) established, (b) absent, or (c) not established from available evidence."*
//
// ⛔⛔ READ-ONLY, ⛔ AND NOT A DESIGN. ⛔ No relationship names · no taxonomy · no schema · no vocabulary ·
// no `invalid_at` reinterpretation · no historical repair · no canary activation · 047 untouched ·
// A1 shadow · A-D4 open · `SEMANTIC_FIELDS` untouched · ①–⑦ frozen.
// ⛔ AND IT IS NOT YET "what should `resolveConflict` do?"
//
// ── ⛔⛔ OTE'S EVIDENCE FENCE — none of these may be used AS EVIDENCE OF SEMANTIC AUTHORITY ──────────
//     `invalid_at` · `supersedes_id` · `slot_id` · row state · reversibility · recency · resolver behaviour
// ⚠️ They ARE used below to LOCATE cases and to establish ABSENCES. Locating a case is not evidence about
// it, and "no check exists here" is not an authority claim. ⭐ Every such use is named in §7 so Ote can
// strike any of them.
//
// ── THE FIVE CONDITIONS, HELD APART (Ote's separation) ──────────────────────────────────────────────
//   K1  knowing that two observations ARE RELATED
//   K2  knowing WHAT the relationship is
//   K3  knowing that NO relationship exists
//   K4  being UNABLE to establish the relationship
//   K5  having AUTHORITY to change current-holder state despite any of K1–K4
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)

const ROOT = 'C:/data/AI_LLMv2'
const SRC = {
  store: `${ROOT}/Personas/Sotera/Backend/app/components/memory-store-sequelize-host.js`,
  pipeline: `${ROOT}/Personas/Sotera/Backend/app/components/memory-pipeline-host.js`,
  identity: `${ROOT}/PortableComponents/Packages/Memory/cognition/memory-identity-resolver.js`,
  conflict: `${ROOT}/PortableComponents/Packages/Memory/cognition/memory-conflict.js`,
  dreaming: `${ROOT}/Personas/Sotera/Backend/app/components/dreaming-resolver.js`,
}
const text = Object.fromEntries(Object.entries(SRC).map(([k, p]) => [k, readFileSync(p, 'utf8')]))

// ⭐ #14/#22 DEFECT GUARD: strip line-leading comment markers BEFORE collapsing whitespace, so an anchor
// that wraps mid-sentence still matches. ⛔ Shortening an anchor to make it pass would make it VACUOUS.
const flat = (s) => s.replace(/^[ \t]*(\/\/|\*|#)[ \t]?/gm, ' ').replace(/\s+/g, ' ')
const F = Object.fromEntries(Object.entries(text).map(([k, v]) => [k, flat(v)]))
const anchor = (file, sentence) => F[file].includes(flat(sentence).trim())

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  DECISION ⑧ · what must be ESTABLISHED, and BY WHOM, before a current-holder transition')
console.log('  ⛔ not "what should resolveConflict do?" · ⛔ no names · ⛔ no schema · ⛔ nothing changed')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── §1 · THE SYSTEM ALREADY HAS AN AUTHORITY DOCTRINE ───────────────────────────────────────────────
console.log('\n§1 ⭐⭐⭐ THE SYSTEM ALREADY HAS AN AUTHORITY DOCTRINE — and it was written for a DIFFERENT act\n')
const DOCTRINE = [
  ['store', 'That is the difference between this and `author`: authorship is a DECISION the caller is entitled to make; authority is a FACT the caller is not.'],
  ['store', '⛔ An authority that can be satisfied by an absence is not an authority.'],
  ['store', 'AND THE AUTHORITY IS DERIVED HERE, ⛔ NEVER ACCEPTED AS A CLAIM'],
  ['store', 'a memory act must name its writer'],
  ['store', '⛔ A CONTRADICTION THAT CANNOT NAME ITS OPPONENT IS A FEELING.'],
]
for (const [f, s] of DOCTRINE) {
  const ok = anchor(f, s)
  console.log(`   ${ok ? '✅' : '⛔'} ${f.padEnd(9)} "${s.slice(0, 96)}"`)
  check(`DOCTRINE ANCHOR PRESENT — ${s.slice(0, 64)}`, ok, `${f}: ${ok}`)
}
console.log('\n   ⇒ ⭐⭐⭐ AUTHORITY IS ALREADY DEFINED IN THIS SYSTEM AS: **DERIVED, NEVER CLAIMED; FAILING CLOSED.**')
console.log('     ⛔ And it has never been applied to the current-holder transition.')

// ── §2 · WHAT EACH SEMANTIC ACT MUST SATISFY ────────────────────────────────────────────────────────
console.log('\n§2 ⭐⭐⭐ THE PRECONDITION LADDER — what the system DEMANDS before each semantic act\n')
const [aliasN] = await q(`SELECT count(*)::int AS n FROM ${S}."log_slot_aliases"`)
const [aliasRefuse] = await q(`SELECT count(*)::int AS n FROM ${S}."log_slot_aliases" WHERE action='refuse'`)
const [bindN] = await q(`SELECT count(*)::int AS n FROM ${S}."log_slot_bindings"`)
const [bindActs] = await q(`SELECT count(DISTINCT action)::int AS n FROM ${S}."log_slot_bindings"`)
const [refusalN] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_refusals"`)
const LADDER = [
  ['047 BIND  question ↔ slot', 'declared actor', 'declared_intent', 'propose/confirm', 'YES', `log_slot_bindings ${bindN.n} rows, ${bindActs.n} act kinds`],
  ['A3 ALIAS  phrase → slot', 'writer + act', '`declared` boolean', '⛔ no', 'YES', `log_slot_aliases ${aliasN.n} rows, ${aliasRefuse.n} REFUSE`],
  ['035 SCOPE persona_global', 'writer + author', '⛔ n/a', '⛔ no', 'YES', `log_memory_refusals ${refusalN.n} rows`],
  ['030 CONTRADICT a belief', 'writer', '⛔ n/a', '⛔ no', 'YES — needs NAMED EVIDENCE', 'refuses without a message/memory id'],
  ['⭐ CURRENT-HOLDER TRANSITION', 'writer ONLY', '⛔ NONE', '⛔ no', '⛔⛔ NO REFUSAL PATH', '⚠️ see §3'],
]
console.log(`   ${pad('ACT', 30)}${pad('WHO', 17)}${pad('DECLARED INTENT', 19)}${pad('OCCASION', 17)}${pad('CAN REFUSE?', 28)}LEDGER`)
for (const r of LADDER) console.log(`   ${pad(r[0], 30)}${pad(r[1], 17)}${pad(r[2], 19)}${pad(r[3], 17)}${pad(r[4], 28)}${r[5]}`)
console.log('\n   ⇒ ⭐⭐⭐ THE CURRENT-HOLDER TRANSITION IS THE LEAST-GOVERNED SEMANTIC ACT IN THE SYSTEM —')
console.log('     and ① just ruled it is the one whose semantics are MULTIPLE OR ABSENT.')
check('⭐⭐ THE ALIAS SEAM CAN REFUSE, AND HAS — every alias-ledger row is a REFUSAL',
  aliasN.n > 0 && aliasRefuse.n === aliasN.n, `${aliasRefuse.n} of ${aliasN.n} refuse`)
check('⭐⭐ THE 047 BIND SEAM IS OCCASION-SEPARATED — propose and confirm are distinct recorded acts',
  bindActs.n === 2, `${bindActs.n} distinct actions over ${bindN.n} rows`)
check('⭐ CONTRADICTION REFUSES WITHOUT NAMED EVIDENCE — the one justification requirement in the system',
  anchor('store', 'a contradiction must name its evidence'), 'memory-store-sequelize-host.js')

// ── §3 · WHAT IS RECORDED AS THE TRANSITION'S WARRANT ───────────────────────────────────────────────
console.log('\n§3 ⭐⭐⭐ WHAT IS ACTUALLY RECORDED AS THE WARRANT FOR A TRANSITION\n')
const [supN] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes" WHERE action='supersede'`)
const [supNoReason] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes" WHERE action='supersede' AND reason IS NULL`)
const [supNotMeasure] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes"
  WHERE action='supersede' AND reason IS NOT NULL AND reason !~ '^(lexical|cosine|identity)'`)
const actors = await q(`SELECT actor, count(*)::int AS n FROM ${S}."log_memory_changes" WHERE action='supersede' GROUP BY 1 ORDER BY 2 DESC`)
console.log(`   supersede audit rows           ${supN.n}`)
console.log(`   with NO reason                 ${supNoReason.n}`)
console.log(`   ⭐ whose reason is NOT a similarity/identity MEASUREMENT   ${supNotMeasure.n}`)
console.log(`   actors                         ${actors.map((a) => `${a.actor}=${a.n}`).join(' · ')}`)
console.log('\n   ⇒ ⭐⭐⭐ THE ONLY THING EVER RECORDED AS A WARRANT IS A STRING-SIMILARITY SCORE BETWEEN TWO')
console.log('     LABELS — and it measures the ROUTING match, ⛔ not any relation between the two observations.')
console.log('     ⚠️ ③ RULED that routing may not establish the observation→question relation.')
console.log('     ⇒ ⭐ THE ONLY WARRANT ON RECORD IS ONE THE RULINGS HAVE ALREADY DISQUALIFIED.')
check('⭐⭐⭐ NOT ONE TRANSITION RECORDS A WARRANT THAT IS NOT A MEASUREMENT',
  supNotMeasure.n === 0 && supNoReason.n === 0, `${supNotMeasure.n} non-measure · ${supNoReason.n} absent · of ${supN.n}`)
check('⭐ AND THE ACTOR IS `system` ON THE OVERWHELMING MAJORITY',
  (actors.find((a) => a.actor === 'system')?.n ?? 0) / supN.n > 0.9,
  actors.map((a) => `${a.actor}=${a.n}`).join(' · '))

// ── §3b · ⭐⭐⭐ THE WARRANT DOES NOT DISCRIMINATE ────────────────────────────────────────────────────
console.log('\n§3b ⭐⭐⭐ THE WARRANT IS UNCORRELATED WITH WHETHER A RELATIONSHIP EXISTS\n')
const strength = async (phrase) => {
  const [r] = await q(`SELECT reason FROM ${S}."log_memory_changes" WHERE action='supersede'
    AND reason LIKE $1 ORDER BY created_at DESC LIMIT 1`, [`%${phrase}%`])
  const m = /([0-9]\.[0-9]{3})/.exec(r?.reason ?? '')
  return { reason: r?.reason ?? null, v: m ? Number(m[1]) : null }
}
const mira = await strength('"youngest sister" → slot "youngest sister"')
const null8 = await strength('"schedule" → slot "work schedule"')
const null9 = await strength('"volunteer_schedule_and_location" → slot "work schedule"')
console.log(`   #7 Mira   — a GENUINE world-state succession   ${mira.v}   ${String(mira.reason).slice(0, 64)}`)
console.log(`   #8        — ⛔ NO RELATIONSHIP EXISTS          ${null8.v}   ${String(null8.reason).slice(0, 64)}`)
console.log(`   #9        — ⛔ NO RELATIONSHIP EXISTS          ${null9.v}   ${String(null9.reason).slice(0, 64)}`)
console.log('\n   ⇒ ⭐⭐⭐ THE TWO CASES WHERE NO RELATIONSHIP EXISTS CARRY THE **MAXIMUM** WARRANT — identical')
console.log('     to the one case where a relationship genuinely did. ⛔ THE WARRANT IS NOT WEAK. IT IS BLIND.')
check('⭐⭐⭐ THE NULL CASES CARRY A WARRANT EQUAL TO THE GENUINE CASE — the warrant cannot discriminate',
  mira.v === 1 && null8.v === 1 && null9.v === 1, `mira=${mira.v} · #8=${null8.v} · #9=${null9.v}`)

// ── §4 · CAN THE SYSTEM EXPRESS K1–K4 AT ALL? ───────────────────────────────────────────────────────
console.log('\n§4 ⭐ CAN ANY SEAM EXPRESS K1–K4?\n')
const cols = async (t) => (await q(`SELECT column_name FROM information_schema.columns
  WHERE table_schema=$1 AND table_name=$2`, [devSchema(), t])).map((r) => r.column_name)
const mcCols = await cols('log_memory_changes')
const alCols = await cols('log_slot_aliases')
const hasRelationMC = mcCols.some((c) => /relation|declared/.test(c))
const hasRelationAL = alCols.some((c) => /relation/.test(c)) && alCols.some((c) => /declared/.test(c))
console.log(`   log_memory_changes  — carries a relation/declared column?  ${hasRelationMC ? 'YES' : '⛔ NO'}`)
console.log(`   log_slot_aliases    — carries a relation/declared column?  ${hasRelationAL ? '⭐ YES' : '⛔ NO'}`)
const alRows = await q(`SELECT relation, declared, "by", action FROM ${S}."log_slot_aliases"`)
console.log(`   ⇒ alias ledger rows: ${alRows.map((r) => `relation=${r.relation}/declared=${r.declared}/by=${r.by}/${r.action}`).join(' · ')}`)
console.log('\n   ⇒ ⭐⭐ THE ALIAS SEAM ALREADY SEPARATES "a relation was CLAIMED" FROM "it was DECLARED", and')
console.log('     REFUSES when it was not. ⛔ THE TRANSITION SEAM HAS NEITHER COLUMN AND NEITHER OUTCOME.')
check('⭐⭐ THE TRANSITION LEDGER CANNOT EXPRESS A RELATION CLAIM AT ALL — no relation/declared column',
  !hasRelationMC, mcCols.join(','))
check('⭐ AND THE ALIAS LEDGER CAN — the capability exists in this system, one seam over',
  hasRelationAL, alCols.filter((c) => /relation|declared|by/.test(c)).join(','))

// ── §5 · ⭐⭐⭐ THE EXISTENCE PROOF — one family already answers ⑧ ────────────────────────────────────
console.log('\n§5 ⭐⭐⭐ THE EXISTENCE PROOF — the Identity Resolver ALREADY implements an answer to ⑧\n')
const PROOF = [
  ['pipeline', '`ask` is the Identity Resolver\'s OPTIONAL port for the one case it must not decide alone: a name that would REPLACE a name she already has.'],
  ['pipeline', 'the resolver\'s documented behaviour without it is to DEFER, never to assume.'],
  ['identity', 'ASKING IS NOT ADOPTING. A broken ask must land where "no answer" lands, never where "yes" does.'],
  ['identity', 'Trust the human over both the observation and the store — they are the only authority on their own name.'],
]
for (const [f, s] of PROOF) {
  const ok = anchor(f, s)
  console.log(`   ${ok ? '✅' : '⛔'} ${f.padEnd(9)} "${s.slice(0, 104)}"`)
  check(`EXISTENCE-PROOF ANCHOR — ${s.slice(0, 60)}`, ok, `${f}: ${ok}`)
}
const outcomes = ['adopted', 'deferred', 'declined'].filter((o) => new RegExp(`action: '${o}'`).test(text.identity))
console.log(`\n   its distinct outcomes: ${outcomes.join(' · ')}`)
console.log('   ⇒ ⭐⭐⭐ `deferred` ("could not establish authority") and `declined` ("the authority said no")')
console.log('     ARE ALREADY DISTINCT — ⭐ which is exactly the K3/K4 separation ① preserved by ruling.')
console.log('   ⇒ ⭐ AND ABSTENTION IS THE DEFAULT: no ask port ⇒ DEFER, and the incumbent is unchanged.')
check('⭐⭐⭐ `deferred` AND `declined` ARE DISTINCT OUTCOMES IN A SHIPPED COMPONENT',
  outcomes.includes('deferred') && outcomes.includes('declined'), outcomes.join(','))

// ── §6 · THE RESERVED VOCABULARY THAT NEVER FIRES ───────────────────────────────────────────────────
console.log('\n§6 ⭐⭐ THE ANSWER-SPACE WAS DECLARED IN PHASE 4 AND NEVER EMITTED\n')
const emittedIn = (name) => Object.entries(text)
  .filter(([k]) => k !== 'conflict')
  .filter(([, v]) => new RegExp(`CONFLICT\\.${name}\\b`).test(v)).map(([k]) => k)
for (const name of ['DEFER', 'ASK', 'CONTRADICTION', 'VERSION', 'APPEND', 'IGNORE']) {
  const at = emittedIn(name)
  console.log(`   CONFLICT.${pad(name, 15)} ${at.length ? `⭐ EMITTED in ${at.join(', ')}` : '⛔ never emitted'}`)
}
console.log('\n   ⇒ ⭐ `DEFER` — *"decline to decide now"* — and `ASK/CONFIRM` — *"needs a human yes"* — were')
console.log('     NAMED IN THE VOCABULARY AND HAVE NEVER FIRED. ⛔ The answer-space for ⑧ is already declared.')
// ⭐ POSITIVE CONTROL: this scan MUST be able to see an emission, or "never emitted" is vacuous.
check('⭐ POSITIVE CONTROL — the emission scan CAN detect an emission (CONFLICT.IGNORE, dreaming-resolver)',
  emittedIn('IGNORE').includes('dreaming'), emittedIn('IGNORE').join(',') || 'none')
check('⭐⭐ AND NEITHER DEFER NOR ASK IS EMITTED ANYWHERE IN THE SCANNED SOURCES',
  emittedIn('DEFER').length === 0 && emittedIn('ASK').length === 0,
  `defer=[${emittedIn('DEFER')}] ask=[${emittedIn('ASK')}]`)

// ── §7 · ⛔ WHERE I LEANED ON OTE'S FENCE ────────────────────────────────────────────────────────────
console.log('\n§7 ⛔ WHERE THIS PASS TOUCHED THE FENCED ARTIFACTS — ⭐ named so Ote can strike any of them\n')
console.log('   1. `supersedes_id` / `invalid_at` were used ONLY to LOCATE the nine cases and to count')
console.log('      audit rows. ⛔ No claim of authority is drawn FROM them. Locating a case ≠ evidence about it.')
console.log('   2. Resolver behaviour is cited ONLY to establish an ABSENCE (no refusal path, no relation')
console.log('      column, no declared intent). ⛔ Never as evidence that any component HAS authority.')
console.log('   3. ⚠️ THE ONE JUDGEMENT CALL: §5 cites the IDENTITY RESOLVER, which is a resolver. It is cited')
console.log('      as an explicit DESIGNED REFUSAL to act on its own authority — ⛔ the opposite of using')
console.log('      behaviour to infer authority. ⭐ If Ote reads that as inside the fence, §5 falls and the')
console.log('      rest of the pass stands.')

console.log('')
await pg.end()
done()
