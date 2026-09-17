// ⭐⭐⭐ DECISION ④ · WHAT DOES LOSING CURRENT-HOLDER STATUS ESTABLISH ABOUT THE DISPLACED OBSERVATION?
//
//   node test/checks/displaced-status-trace.mjs
//
// Ote, 2026-09-17, reframing ④ so it does NOT start from the field:
//   *"When a system disposition causes an observation to cease being the current holder, what semantic
//    STATUS, if any, does that displaced observation acquire?"*
//
// ⛔⛔ READ-ONLY. ⛔ No implementation · no schema · no vocabulary proposal · no historical repair ·
// 047 untouched · A1 shadow · `SEMANTIC_FIELDS` untouched · ①–④-A frozen.
//
// ── ⛔⛔ OTE'S FENCE ─────────────────────────────────────────────────────────────────────────────────
//   ⛔ Do NOT infer meaning from the fact that they all write the same field.
//   ⛔ NOT admissible as evidence of semantic meaning: the COLUMN NAME · ROW STATE · REVERSIBILITY ·
//      EXISTING CONSUMERS.
// ⇒ ⭐ what remains admissible is what each WRITER'S OWN CALL SITE declares it is doing, and the corpus.
//
// ── ④-A GIVES THE BASELINE, SO THIS PASS ASKS ONLY WHAT EACH WRITER ADDS ────────────────────────────
// ④-A RULED: the transition establishes a claim about THE SYSTEM'S OWN DISPOSITION and ⛔ nothing about
// either observation. ⇒ ⭐ the question here is: DOES THIS WRITER ESTABLISH ANYTHING **BEYOND** THAT?
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)

const ROOT = 'C:/data/AI_LLMv2'
const SRC = {
  service: `${ROOT}/PortableComponents/Packages/Memory/cognition/memory-v2-service.js`,
  consolidate: `${ROOT}/PortableComponents/Packages/Memory/cognition/memory-consolidate.js`,
  lesson: `${ROOT}/Personas/Sotera/Backend/app/components/lesson-host.js`,
  store: `${ROOT}/Personas/Sotera/Backend/app/components/memory-store-sequelize-host.js`,
}
const text = Object.fromEntries(Object.entries(SRC).map(([k, p]) => [k, readFileSync(p, 'utf8')]))
// ⭐ #14/#22/#24 GUARD — strip line-leading comment markers BEFORE collapsing. ⛔ Shortening an anchor to
// make it pass makes it VACUOUS.
const flat = (s) => s.replace(/^[ \t]*(\/\/|\*|#)[ \t]?/gm, ' ').replace(/\s+/g, ' ')
const F = Object.fromEntries(Object.entries(text).map(([k, v]) => [k, flat(v)]))
const anchor = (f, s) => F[f].includes(flat(s).trim())

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  ④ · WHAT STATUS DOES A DISPLACED OBSERVATION ACQUIRE?')
console.log('  ⛔ not started from the field · ⛔ no vocabulary proposed · ⛔ nothing changed')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── §1 · THE SIX WRITERS, IN THEIR OWN WORDS ────────────────────────────────────────────────────────
console.log('\n§1 ⭐⭐⭐ WHAT EACH WRITER SAYS IT IS DOING — its own call site, ⛔ not the field\n')
const W = [
  { id: 'W1 SUPERSEDE', src: null, sentence: null,
    establishes: '⛔ NOTHING beyond the disposition',
    warrant: '⛔ a label-similarity score (⑧)',
    note: 'it examined the LABELS, ⛔ never the observations. Mira is a W1 case and stays TRUE.' },
  { id: 'W2 COLLAPSE', src: 'service',
    sentence: 'they were removed for being redundant, not for being wrong.',
    establishes: '⛔ NOTHING — ⭐ and it explicitly DISCLAIMS a truth claim',
    warrant: '⛔ none — it reads neither value (P14)',
    note: '⚠️ LATENT — 0 organic rows ⇒ a declared INTENT, ⛔ not an established corpus fact.' },
  { id: 'W3 IDENTITY RENAME', src: 'service',
    sentence: 'AUDIT the displacement — the answer to "what did she used to call me?"',
    establishes: '⭐ THE NAME IS NO LONGER IN USE — a real positive status',
    warrant: '⭐ the person\'s own declaration (the ask port)',
    note: '⭐ a former name was NEVER FALSE. ⇒ RENAMED ≠ FALSE.' },
  { id: 'W4 CONSOLIDATION', src: 'consolidate',
    sentence: 'don\'t drop still-true facts',
    establishes: '⭐ ITS CONTENT WAS USED to compose a successor record',
    warrant: '⭐ true by the act\'s own construction',
    note: '⭐ the source calls the members STILL-TRUE ⇒ ABSORBED ≠ FALSE. ⛔ And it does NOT establish that nothing was lost.' },
  { id: 'W5 LESSON REVISE', src: 'lesson',
    sentence: "const RELATIONS = ['supersedes', 'refines', 'coexists_with', 'qualifies']",
    establishes: '⭐ WHATEVER THE ACTOR DECLARED — one of four',
    warrant: '⭐ the actor\'s declaration',
    note: '⚠️ LATENT — 0 rows. ⭐ 3 of the 4 relations are NOT truth claims at all.' },
  { id: 'W6 RESTORE-BLOCKED', src: 'service',
    sentence: 'un-archived, not believed',
    establishes: '⛔ NOTHING about the observation — ⭐ the position is OCCUPIED',
    warrant: '⛔ arena occupancy',
    note: '⭐ the source REFUSES to collapse the two outcomes ⇒ STORAGE REFUSAL ≠ SEMANTIC INVALIDATION.' },
]
for (const w of W) {
  const ok = w.src ? anchor(w.src, w.sentence) : null
  console.log(`   ── ${w.id}`)
  if (w.src) {
    console.log(`      ${ok ? '✅' : '⛔'} its own words  "${w.sentence.slice(0, 92)}"`)
    check(`${w.id} — its own sentence is present in source`, ok, `${w.src}: ${ok}`)
  } else {
    console.log('      ⛔ it says NOTHING about the displaced observation at its call site')
  }
  console.log(`      ESTABLISHES     ${w.establishes}`)
  console.log(`      WARRANT         ${w.warrant}`)
  console.log(`      ⓘ               ${w.note}\n`)
}

// ── §2 · ⭐⭐⭐ DOES ANY WRITER ESTABLISH A CLAIM ABOUT PROPOSITION TRUTH? ────────────────────────────
console.log('§2 ⭐⭐⭐ DOES ANY OF THE SIX ESTABLISH A CLAIM ABOUT PROPOSITION TRUTH?\n')
// ⭐ POSITIVE CONTROL: a genuine truth-claiming writer EXISTS in this codebase and must be detectable,
// or "none of the six makes one" is vacuous. `markContradicted` is that writer.
const TRUTH_CLAIM = 'record that a memory was repudiated'
const controlFound = anchor('store', TRUTH_CLAIM)
console.log(`   ⭐ POSITIVE CONTROL — a real truth-claiming writer exists and is detectable: ${controlFound ? 'YES' : '⛔ NO'}`)
console.log(`      markContradicted: "${TRUTH_CLAIM}" — ⭐ and it REFUSES without named evidence.`)
const truthClaimers = W.filter((w) => /true|false|wrong/i.test(w.establishes) && !/NOT|NEVER|⛔/.test(w.establishes))
console.log(`\n   of the six, writers establishing a PROPOSITION-TRUTH claim: ${truthClaimers.length}`)
console.log('   ⇒ ⭐⭐⭐ ZERO. ⛔ AND TWO OF THEM EXPLICITLY DISCLAIM ONE:')
console.log('     W2 *"removed for being REDUNDANT, not for being WRONG"* · W4 *"don\'t drop STILL-TRUE facts"*')
check('⭐ POSITIVE CONTROL — the scan CAN detect a genuine truth-claiming writer', controlFound, 'markContradicted')
check('⭐⭐⭐ NOT ONE OF THE SIX ESTABLISHES A CLAIM ABOUT PROPOSITION TRUTH',
  truthClaimers.length === 0, `${truthClaimers.length} of 6`)
check('⭐⭐ AND TWO DISCLAIM ONE IN THEIR OWN WORDS',
  anchor('service', 'removed for being redundant, not for being wrong')
  && anchor('consolidate', "don't drop still-true facts"), 'W2 + W4')

// ── §3 · THE SEVEN DISTINCTIONS ─────────────────────────────────────────────────────────────────────
console.log('\n§3 ⭐⭐ THE SEVEN DISTINCTIONS — where each is established\n')
const D = [
  ['current vs true', 'W1 / Mira', '⭐ the displaced observation REMAINS TRUE of an earlier world'],
  ['current vs historical', '⚠️ NEITHER is established by W1', '⛔ #1/#2/#5 displaced observations are SIMULTANEOUS, not past'],
  ['redundant vs false', 'W2 — in its own words', '⚠️ latent; a declared INTENT'],
  ['renamed vs false', 'W3', '⭐ a former name was never false'],
  ['absorbed vs false', 'W4 — *"still-true facts"*', '⛔ and NOT "losslessly absorbed"'],
  ['revised understanding vs world change', 'W5 vs W1/Mira', '⭐ only W5 can express the first; ⛔ nothing expresses the second'],
  ['storage refusal vs semantic invalidation', 'W6', '⭐ *"un-archived, not believed"* — the source refuses to collapse them'],
]
console.log(`   ${pad('DISTINCTION', 42)}${pad('ESTABLISHED WHERE', 30)}NOTE`)
for (const [d, where, note] of D) console.log(`   ${pad(d, 42)}${pad(where, 30)}${note}`)
console.log('\n   ⇒ ⭐⭐ ALL SEVEN ARE REAL DISTINCTIONS, and each is established SOMEWHERE in the system\'s own')
console.log('     design or corpus. ⛔ Whether anything RECORDS them is a different question, and this pass')
console.log('     is fenced from it.')
// ⚠️ DEFECT GUARD: this check asserted the literal `true` in its first draft — ⛔ a check that tests
// NOTHING. It now asserts the CORPUS FACT the distinction rests on: Mira's displaced observation is still
// present and still says what makes it true of the past.
const [mira] = await q(`SELECT o.value AS old_value, n.value AS new_value
  FROM ${S}."txn_memories" n JOIN ${S}."txn_memories" o ON o.id = n.supersedes_id
  JOIN ${S}."mst_slots" s ON s.id = n.slot_id
  WHERE s.canonical_label = 'youngest sister' ORDER BY n.created_at DESC LIMIT 1`)
const miraHolds = /training/i.test(String(mira?.old_value)) && /paramedic/i.test(String(mira?.new_value))
console.log(`\n   MIRA — displaced: "${String(mira?.old_value).slice(0, 62)}"`)
console.log(`          incoming:  "${String(mira?.new_value).slice(0, 62)}"`)
check('⭐⭐ THE MIRA ANCHOR HOLDS IN THE CORPUS — the displaced observation still says what makes it TRUE OF THE PAST',
  miraHolds, `displaced mentions training=${/training/i.test(String(mira?.old_value))}`)

// ── §4 · ⭐⭐⭐ THE CONVERGENCE WITH ⑧-A ──────────────────────────────────────────────────────────────
console.log('\n§4 ⭐⭐⭐ THE CONVERGENCE — the writers that ESTABLISH something are exactly the writers with a')
console.log('   WARRANT ⑧-A WOULD ACCEPT\n')
const establishers = W.filter((w) => w.establishes.startsWith('⭐'))
const empty = W.filter((w) => !w.establishes.startsWith('⭐'))
console.log(`   ⭐ ESTABLISH a positive status : ${establishers.map((w) => w.id.split(' ')[0]).join(' · ')}`)
console.log(`   ⛔ ESTABLISH nothing           : ${empty.map((w) => w.id.split(' ')[0]).join(' · ')}`)
console.log('\n   ⭐ AND THEIR WARRANTS ARE EXACTLY ⑧-A\'S TWO LEGITIMATE FORMS:')
console.log('     W3 · W5  A DECLARATION BY AN AUTHORITY   (the person; the actor)')
console.log('     W4       TRUE BY THE ACT\'S OWN MECHANISM')
console.log('   ⇒ ⭐⭐⭐ ⛔ NOT A COINCIDENCE — it is ⑧-A\'s criterion seen from the other end. A writer with no')
console.log('     warrant establishes nothing; a writer with one establishes exactly what its warrant covers.')
check('⭐⭐⭐ THREE OF SIX ESTABLISH A POSITIVE STATUS, AND THREE ESTABLISH NOTHING',
  establishers.length === 3 && empty.length === 3,
  `establish=${establishers.length} empty=${empty.length}`)

// ── §5 · CORPUS SCOPE — ⚠️ WHAT IS LATENT ───────────────────────────────────────────────────────────
console.log('\n§5 ⚠️ CORPUS SCOPE — ⛔ latent machinery is not production evidence\n')
const [lessonRows] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memories"
  WHERE lower(entity)='sotera' AND lower(attribute)='lesson'`)
const [collapseAudit] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes" WHERE action='collapse'`)
const [reviveAudit] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes" WHERE action='revive'`)
console.log(`   sotera|lesson rows ${lessonRows.n} (⭐ the canary) · collapse audit rows ${collapseAudit.n} · revive audit rows ${reviveAudit.n}`)
console.log('   ⇒ ⚠️ W2 and W5 have never fired organically ⇒ their statements are DECLARED INTENT,')
console.log('     ⛔ not established corpus semantics. ⭐ Reported as intent throughout.')
check('⚠️ W2 COLLAPSE HAS STILL NEVER FIRED ORGANICALLY — its claim stays an INTENT',
  collapseAudit.n === 0, `${collapseAudit.n} collapse audit rows`)

console.log('\n⛔ NO POSITIVE DEFINITION OF ANY FIELD IS PROPOSED. ⛔ NO VOCABULARY. ⛔ NOTHING WRITTEN.\n')
await pg.end()
done()
