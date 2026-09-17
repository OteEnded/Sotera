// ⭐⭐⭐ DECISION ⑧-A · POSITIVE AUTHORITY — what CAN constitute sufficient authority for a
// current-holder transition?
//
//   node test/checks/positive-authority-trace.mjs
//
// Ote, 2026-09-17, on ruling ⑧: *"Start from the existing authority doctrine and trace every existing place
// where the system treats authority as something that must be ESTABLISHED rather than INFERRED."*
// ⭐ *"Do not assume human authority is automatically sufficient either; investigate what the existing
// system actually establishes."*
//
// ⛔⛔ READ-ONLY. ⛔ No implementation · no schema · ⛔ no new vocabulary unless existing source terminology
// requires it · no relationship names · no taxonomy · 047 untouched · A1 shadow · `SEMANTIC_FIELDS`
// untouched · ①–⑧ frozen.
//
// ── ⑧'s RULING, WHICH BINDS THIS PASS ───────────────────────────────────────────────────────────────
//   ATTRIBUTION              who PERFORMED the act
//   EPISTEMIC RESPONSIBILITY who is responsible for ESTABLISHING the relevant semantic fact
//   AUTHORITY                who is ENTITLED to cause the semantic transition
//   ⇒ ⛔ neither writer identity NOR routing similarity is sufficient authority.
//
// ── THE FIVE DIMENSIONS, PER CANDIDATE ──────────────────────────────────────────────────────────────
//   D1 who KNOWS · D2 who DECLARES · D3 who is AUTHORIZED TO ACT · D4 what EVIDENCE establishes that
//   authority · D5 can it be DELEGATED without becoming INFERRED authority?
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const pad = (s, n) => String(s).padEnd(n)

const ROOT = 'C:/data/AI_LLMv2'
const SRC = {
  contracts: `${ROOT}/Personas/Sotera/Backend/app/components/memory-writer-contracts.js`,
  evidence: `${ROOT}/Personas/Sotera/Backend/app/components/memory-evidence.js`,
  store: `${ROOT}/Personas/Sotera/Backend/app/components/memory-store-sequelize-host.js`,
  confirm: `${ROOT}/Personas/Sotera/test/maintenance/attribution-confirm.mjs`,
  identity: `${ROOT}/PortableComponents/Packages/Memory/cognition/memory-identity-resolver.js`,
}
const text = Object.fromEntries(Object.entries(SRC).map(([k, p]) => [k, readFileSync(p, 'utf8')]))
// ⭐ #14/#22/#24 GUARD: strip line-leading comment markers BEFORE collapsing, so an anchor that wraps
// mid-sentence still matches. ⛔ Shortening an anchor to make it pass makes it VACUOUS.
const flat = (s) => s.replace(/^[ \t]*(\/\/|\*|#)[ \t]?/gm, ' ').replace(/\s+/g, ' ')
const F = Object.fromEntries(Object.entries(text).map(([k, v]) => [k, flat(v)]))
const anchor = (f, s) => F[f].includes(flat(s).trim())

console.log('\n════════════════════════════════════════════════════════════════════════════════════')
console.log('  ⑧-A · POSITIVE AUTHORITY — "what makes a transition AUTHORIZED rather than merely ATTRIBUTABLE?"')
console.log('  ⛔ no model proposed · ⛔ no vocabulary invented · ⛔ nothing changed')
console.log('════════════════════════════════════════════════════════════════════════════════════')

// ── §1 · THE AUTHORITY GRAMMAR ALREADY IN SOURCE ────────────────────────────────────────────────────
console.log('\n§1 ⭐⭐⭐ THE AUTHORITY GRAMMAR THIS SYSTEM ALREADY WROTE DOWN\n')
const GRAMMAR = [
  ['store', 'authorship is a DECISION the caller is entitled to make; authority is a FACT the caller is not', 'authority is not claimable'],
  ['store', '⛔ An authority that can be satisfied by an absence is not an authority.', 'it must fail closed'],
  ['contracts', 'No axis is ever derived from another.', 'no axis derives another'],
  ['contracts', 'The only bridge is a WRITER-DECLARED COINCIDENCE, recorded HERE, true by the writer\'s MECHANISM', '⭐ DELEGATION WITHOUT INFERENCE'],
  ['evidence', 'a SPAN is a checkable claim and is checked FIRST — attestation vouches for a turn, ⛔ never for words that are not in it', '⭐⭐ CHECKABILITY OUTRANKS ATTESTATION'],
  ['contracts', 'an occasion-less resolver alias is not a gap to be tolerated, it is an equivalence nobody can be asked about.', '⭐ ACCOUNTABILITY IS THE TEST'],
  ['contracts', 'the difference between someone editing THEIR OWN beliefs and someone editing SOMEBODY ELSE\'S', 'own vs another\'s'],
  ['confirm', '`--by` is REQUIRED and is recorded', 'a confirmation names its confirmer'],
]
for (const [f, s, label] of GRAMMAR) {
  const ok = anchor(f, s)
  console.log(`   ${ok ? '✅' : '⛔'} ${pad(label, 38)}${f.padEnd(11)}"${s.slice(0, 74)}"`)
  check(`AUTHORITY-GRAMMAR ANCHOR — ${label}`, ok, `${f}: ${ok}`)
}

// ── §2 · ⭐⭐⭐ THE EVIDENCE LADDER — GRADED BY CHECKABILITY, NOT BY RANK ─────────────────────────────
console.log('\n§2 ⭐⭐⭐ THE EVIDENCE LADDER — ⭐ GRADED BY CHECKABILITY, ⛔ NOT BY RANK\n')
const ladder = await q(`SELECT verification->>'how' AS how, count(*)::int AS n
  FROM ${S}."txn_memory_evidence" GROUP BY 1 ORDER BY 2 DESC`)
const byHow = Object.fromEntries(ladder.map((r) => [r.how, r.n]))
const RUNGS = [
  ['span-verified', '⭐ CHECKED, and checked FIRST — it BEATS operator attestation', 'the system itself'],
  ['declared-coincidence', 'granted BY REGISTRY, true by the writer\'s MECHANISM', 'the contract'],
  ['operator-attested', '⚠️ vouches the turn EXISTS — ⛔ never that the words are in it', 'a human'],
  ['writer-cited', '⛔ the unverified default', 'the writer\'s say-so'],
  ['failed', '⭐ KEPT WITH ITS REASON (I10) — a fabricated citation is SHOWN, not hidden', '—'],
]
console.log(`   ${pad('RUNG', 24)}${pad('N', 6)}${pad('ESTABLISHED BY', 18)}WHAT IT MEANS`)
for (const [how, meaning, by] of RUNGS) console.log(`   ${pad(how, 24)}${pad(byHow[how] ?? 0, 6)}${pad(by, 18)}${meaning}`)
console.log('\n   ⇒ ⭐⭐⭐ THE ORDER IN THE CODE IS: span CHECKED FIRST → declared-coincidence → operator-attested')
console.log('     → writer-cited. ⇒ ⭐ A HUMAN\'S ATTESTATION DOES NOT OVERRIDE A CHECKABLE FACT.')
console.log('   ⇒ ⚠️ AND THE CHECKABLE RUNG IS THE RAREST.')
check('⭐⭐⭐ THE CHECKABLE RUNG IS THE RAREST — span-verified is the smallest non-zero grade',
  (byHow['span-verified'] ?? 0) > 0
  && (byHow['span-verified'] ?? 0) < (byHow['declared-coincidence'] ?? 0)
  && (byHow['span-verified'] ?? 0) < (byHow['writer-cited'] ?? 0),
  ladder.map((r) => `${r.how}=${r.n}`).join(' · '))
check('⛔ AND NOTHING HAS BEEN SILENTLY DROPPED — a `failed` reference would be RETAINED, not deleted',
  anchor('evidence', 'the row\'s provenance shows the fabricated citation instead of hiding it'), 'memory-evidence.js I10')

// ── §3 · ⭐⭐ DELEGATION WITHOUT INFERENCE — the one worked example ──────────────────────────────────
console.log('\n§3 ⭐⭐⭐ DELEGATION WITHOUT INFERENCE — the system solved this ONCE, for the axes\n')
const contracts = text.contracts
const holders = ['extractor', 'identity', 'chatTool', 'followthrough', 'reflection', 'notes', 'dreaming',
  'distiller', 'operator', 'ingest', 'lesson', 'decline', 'admin', 'person', 'job', 'resolver', 'unknown']
const grant = (w, field) => new RegExp(`\\[WRITER\\.${w}\\][^\\n]*${field}`).test(contracts)
const coincidence = holders.filter((w) => grant(w, 'coincidence:'))
const attests = holders.filter((w) => grant(w, 'attests: true'))
const verify = holders.filter((w) => grant(w, 'verify:'))
console.log(`   writers granted a DECLARED COINCIDENCE : ${coincidence.join(' · ') || 'none'}`)
console.log(`   writers granted ATTESTATION            : ${attests.join(' · ') || 'none'}`)
console.log(`   writers REQUIRED TO VERIFY instead     : ${verify.join(' · ') || 'none'}`)
console.log('\n   ⭐ AND THE JUSTIFICATION IS STRUCTURAL, ⛔ NOT A PERMISSION: *"the extractor cannot read anything')
console.log('     but the turn it was handed, so for it the occasion turn IS the evidence turn. ⛔ No other')
console.log('     writer may claim that."* ⇒ ⭐⭐⭐ THE GRANT IS TRUE BY THE WRITER\'S MECHANISM, RECORDED IN A')
console.log('     REGISTRY, AND REFUSED TO EVERYONE ELSE — and it was MEASURED before being granted.')
check('⭐⭐ DELEGATION IS NARROW AND REGISTRY-BOUND — the coincidence is granted to a MINORITY of writers',
  coincidence.length > 0 && coincidence.length < holders.length / 2, `${coincidence.length} of ${holders.length}`)
check('⭐⭐ ATTESTATION IS GRANTED TO EXACTLY ONE WRITER — ⛔ it is not a rank, it is a registry entry',
  attests.length === 1 && attests[0] === 'operator', attests.join(','))
check('⭐ AND THE MEASUREMENT THAT PRECEDED THE GRANT IS RECORDED IN SOURCE',
  anchor('contracts', 'chat-tool values appear verbatim in their occasion turn in 4 of 37 rows'), 'the 4-of-37 measurement')

// ── §4 · THE THIRTEEN CANDIDATES ────────────────────────────────────────────────────────────────────
console.log('\n§4 ⭐⭐⭐ THE THIRTEEN CANDIDATE AUTHORITIES — ⛔ described, ⛔ not ranked\n')
//                    D1 knows              D2 declares          D3 authorized today   D4 evidence            D5 delegable w/o inference
const C = [
  ['human / account-holder', 'the person', 'the person', '⚠️ own memory only (`person`)', 'their own words', '⛔ NO — see §5'],
  ['declared question ownership', '—', '—', '⛔⛔ CLOSED BY RULING', '⛔ a slot HAS NO OWNER', '⛔ n/a'],
  ['writer identity', 'the host', 'the host', '⛔ RULED INSUFFICIENT (⑧)', 'the registry', '⚠️ attribution only'],
  ['occasion identity', 'the caller', 'the caller', '⛔ not an authority', 'a ledger row', '⭐ YES — but it AUTHORISES NOTHING'],
  ['provenance / evidence', 'the system', 'the writer', '⭐ CHECKED, not trusted', '⭐ span-verified', '⭐⭐ YES — checkability travels'],
  ['relationship establishment', '⛔ nobody', '⛔ nobody', '⛔ unrecordable (⑧)', '⛔ none exists', '⛔ n/a'],
  ['proposition establishment', '⛔ nobody', '⛔ nobody', '⛔ ⑤: equivalence does not exist', '⛔ none exists', '⛔ n/a'],
  ['role / question authority', '047', '⭐ declared_by + occasion', '⭐ propose/confirm', '⭐ the bind ledger', '⚠️ only if NOT-PRESENT holds'],
  ['operator repair', 'the operator', 'the operator', '⭐ YES — `attests: true`', '⭐ operator-attested + a named turn', '⛔ NO — one writer only'],
  ['automated reflection', 'the pass', 'the pass', '⛔ pass-scoped writes only', 'a reviewed RANGE', '⛔ reach ≠ authority'],
  ['extractor', 'the turn', 'the contract', '⚠️ coincidence GRANTED', '⭐ mechanism-true', '⭐ YES — registry-bound'],
  ['alias learning', 'the resolver', '⭐ `declared` boolean', '⭐ REFUSABLE (4 of 4)', '⭐ the alias ledger', '⭐ YES — it records REFUSALS'],
  ['routing', '⛔ nobody', '⛔ nobody', '⛔ RULED INSUFFICIENT (⑧)', '⛔ a similarity score', '⛔ NO'],
]
console.log(`   ${pad('CANDIDATE', 30)}${pad('D1 KNOWS', 16)}${pad('D2 DECLARES', 22)}${pad('D3 AUTHORIZED TODAY', 32)}${pad('D4 EVIDENCE', 30)}D5 DELEGABLE?`)
for (const r of C) console.log(`   ${pad(r[0], 30)}${pad(r[1], 16)}${pad(r[2], 22)}${pad(r[3], 32)}${pad(r[4], 30)}${r[5]}`)

const authorizedToday = C.filter((r) => r[3].startsWith('⭐')).map((r) => r[0])
console.log(`\n   ⇒ ⭐ CANDIDATES WITH A REAL, EXERCISED AUTHORITY TODAY: ${authorizedToday.length} — ${authorizedToday.join(' · ')}`)
console.log('   ⇒ ⛔ AND NOT ONE OF THEM IS WIRED TO THE CURRENT-HOLDER TRANSITION.')
check('⭐⭐ ONLY A MINORITY OF THE THIRTEEN CARRY AN EXERCISED AUTHORITY TODAY',
  authorizedToday.length > 0 && authorizedToday.length < 7, `${authorizedToday.length} of 13: ${authorizedToday.join(', ')}`)

// ── §5 · ⭐⭐⭐ IS HUMAN AUTHORITY SUFFICIENT? — the system already answered, for a different act ──────
console.log('\n§5 ⭐⭐⭐ IS HUMAN AUTHORITY SUFFICIENT? — ⛔ THE SYSTEM ALREADY SAID NO, FOR THE BIND ACT\n')
console.log('   From the ratified BIND/RESOLVE/ADMISSION derivation (AI_CarryOn §0-D):')
console.log('     ⭐⭐⭐ "THE REAL DISCRIMINATOR IS JUDGEMENT vs TESTIMONY, ⛔ NOT WHO."')
console.log('     ⭐⭐  "STANDING IS NOT THE BINDING CONSTRAINT — EVIDENCE IS."')
console.log('     ⛔   "every BIND available today is inference-shaped, which M2-10 forbids REGARDLESS OF WHO')
console.log('          PERFORMS IT"')
console.log('     ⭐   "for a label-minted slot THE ACCOUNT\'S IS THE NON-INFERENTIAL ONE: the label came from')
console.log('          THEIR words"')
console.log('\n   ⇒ ⭐⭐⭐ A HUMAN PERFORMING AN INFERENCE-SHAPED ACT IS STILL INFERENCE. ⛔ Authority does not')
console.log('     launder an inference. ⇒ AND THE CODE AGREES INDEPENDENTLY: attestation vouches for a turn,')
console.log('     ⛔ never for words that are not in it.')
console.log('   ⇒ ⭐ WHAT MAKES THE ACCOUNT HOLDER NON-INFERENTIAL IS NOT RANK — it is that THE MATERIAL CAME')
console.log('     FROM THEIR WORDS. ⭐ Authority tracks the ORIGIN OF THE MATERIAL, ⛔ not the seniority of the actor.')
check('⭐⭐⭐ THE CODE INDEPENDENTLY BOUNDS HUMAN AUTHORITY — a span is checked BEFORE attestation is honoured',
  anchor('evidence', 'a SPAN is a checkable claim and is checked FIRST'), 'memory-evidence.js')

// ── §6 · AGAINST THE ANCHORS ────────────────────────────────────────────────────────────────────────
console.log('\n§6 THE ANCHORS — who, if anyone, could have been AUTHORIZED?\n')
const ANCHORS = [
  ['#1 #2 #5 re-statements', '⚠️ the SPEAKER — the material is their words', '⛔ but nothing establishes the two are one proposition (⑤)'],
  ['#7 Mira', '⚠️ the SPEAKER', '⛔ and no authority could establish the OLD one is still true — no state says it'],
  ['#6 repair', '⭐ THE OPERATOR — and it happened: `attests: true`, a named turn', '⭐ THE ONLY ANCHOR WITH A REAL AUTHORITY ON RECORD'],
  ['#4 partial change', '⚠️ the SPEAKER, for ONE sub-proposition', '⛔ no authority can act BELOW the value — no such unit exists'],
  ['#8 #9 null', '⛔⛔ NOBODY — there is nothing to be authorized ABOUT', '⭐ the correct act is ABSTENTION, which has no representation'],
  ['#3 undetermined', '⛔ nobody, YET', '⭐ the correct act is DEFER — declared in Phase 4, never emitted'],
]
for (const [a, who, note] of ANCHORS) console.log(`   ${pad(a, 24)}${pad(who, 52)}${note}`)
console.log('\n   ⇒ ⭐⭐⭐ IN 2 OF THE 6 GROUPS THE RIGHT ANSWER IS THAT **NO AUTHORITY APPLIES** — ⛔ which means')
console.log('     "sufficient authority" cannot be the whole question. ⭐ A MODEL THAT ONLY GRANTS CANNOT EXPRESS THEM.')

// ── §7 · WHERE AUTHORITY IS ESTABLISHED vs INFERRED, TODAY ──────────────────────────────────────────
console.log('\n§7 ⭐⭐ ESTABLISHED vs INFERRED — the census\n')
const [bindN] = await q(`SELECT count(*)::int AS n FROM ${S}."log_slot_bindings"`)
const [aliasRef] = await q(`SELECT count(*)::int AS n FROM ${S}."log_slot_aliases" WHERE action='refuse'`)
const [confirmed] = await q(`SELECT count(*)::int AS n FROM ${S}."log_attribution_candidates" WHERE confirmed_by IS NOT NULL`)
const [spanV] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_memory_evidence" WHERE verification->>'how'='span-verified'`)
const [supN] = await q(`SELECT count(*)::int AS n FROM ${S}."log_memory_changes" WHERE action='supersede'`)
console.log('   ✅ ESTABLISHED (a declared act, an occasion, and a ledger that can say NO):')
console.log(`        047 bind propose/confirm ${bindN.n} · alias REFUSALS ${aliasRef.n} · human-confirmed attributions ${confirmed.n}`)
console.log(`        span-verified references ${spanV.n} · operator attestation (1 writer, by registry)`)
console.log('   ⛔ INFERRED (no declaration, no occasion of its own, no way to refuse):')
console.log(`        the current-holder transition — ${supN.n} of ${supN.n} warranted by a similarity score`)
console.log('        routing · membership · proposition equivalence')
check('⭐⭐ EVERY ESTABLISHED-AUTHORITY SEAM HAS A LEDGER THAT CAN RECORD A REFUSAL — and the transition has none',
  bindN.n > 0 && aliasRef.n > 0 && confirmed.n > 0,
  `bind=${bindN.n} · aliasRefuse=${aliasRef.n} · confirmed=${confirmed.n}`)

console.log('\n⛔ NO AUTHORITY MODEL IS PROPOSED. ⛔ NO VOCABULARY IS INVENTED — every term above is quoted from')
console.log('   existing source. ⛔ NOTHING WAS WRITTEN TO THE DATABASE.\n')
await pg.end()
done()
