// ⭐⭐⭐ 12b.1 · THE REASONER CONTRACT, INVESTIGATED ON A CONTROLLED FIXTURE.
//
//   node test/pipeline/dreaming-12b1-reasoner-contract.mjs
//
// ── ⛔ WHAT THIS IS AND IS NOT ───────────────────────────────────────────────────────────────────
// Ote, 2026-09-03: *"Do not swap the reasoner model or start broad prompt tuning yet… investigate the
// reasoner contract… I want this investigated with a small controlled fixture, not by tuning against
// the natural corpus."*
//
// ⇒ ⭐ TWO CONDITIONS, ONE VARIABLE, RUN ONCE. ⛔ Not a tuning loop: nothing here is iterated until it
// passes, and no prompt change is shipped from this file. It produces evidence for a ruling.
// ⛔ M2-8 is UNCHANGED — the verification gate is imported, never reimplemented or relaxed.
// ⛔ The fixture is IN MEMORY. No database, no persona, no write, nothing touches the natural corpus.
//
// ── ⭐⭐ WHAT THE 12b PROMPT DUMP ALREADY ESTABLISHED (⛔ no model needed for this part) ─────────
//
//   D1 · THE QUESTION ASKED FOR A DEFINITION OF THE LABEL.
//        Verbatim: *"what does \"user / preference\" appear to be, based ONLY on the excerpts above?"*
//        ⇒ a slot-definition answer was not merely LEGAL under that contract — **it was the question.**
//        The model answered accurately; the question was the wrong one.
//
//   D2 · THE EVIDENCE WAS SELECTED BY LABEL-TERM MATCH.
//        `probeTermsFor('preference')` → `["preference"]`, so the 24 buckets were messages containing
//        the WORD, ⛔ not material about the person. ⓘ In the agent_dev corpus those are overwhelmingly
//        Sotera discussing the memory system — one bucket literally reads *"I only save things that are
//        genuinely worth keeping — a durabl…"*, and the model's answer was *"A durable fact about the
//        user that is stored in memory…"*. ⭐ It was FAITHFULLY SUMMARISING what it was shown.
//
// ⇒ ⚠️ what those two cannot separate is whether the model can COPY A SPAN EXACTLY when the evidence is
// unambiguous. That is the only question this fixture exists to answer.
//
// ── ⭐ THE DESIGN ───────────────────────────────────────────────────────────────────────────────
//   A · CONTROL   the 12b prompt VERBATIM, on clean unambiguous evidence
//   B · SUBJECT   identical in every respect except the QUESTION LINE, which asks about the SUBJECT
//
//   A fails + B passes ⇒ the defect is D1, the question framing
//   A passes           ⇒ D2 dominated: the natural evidence was the problem, not the question
//   both fail          ⇒ the defect is downstream of framing — output format or capability
//
// ⚠️ THE FIXTURE HANDS THE MODEL NO VOCABULARY FROM THE HYPOTHESIS. The sentences are ordinary, the
// claim is not stated in them, and neither prompt names what a good answer looks like.

import { loadConfig } from '../../Backend/lib/utility.js'
import { initDB } from '../../Backend/database/index.js'
import { setDB } from '../../Backend/lib/utility.js'
import { rebuildProviderRegistry } from '../../Backend/app/adapters/registry.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { makeDreamingLlm, buildPrompt, parseProposal } from '../../Backend/app/components/dreaming-reason-host.js'
import { verifyCitations } from '../../Backend/app/components/dreaming-verify.js'
import { validateClaim } from '../../Backend/app/components/dreaming-proposal.js'

const config = loadConfig()
const db = await initDB()
setDB(db)
await rebuildProviderRegistry({ db, config })
await initSettings(db)
const fastify = { db, config }

// ── ⭐ THE FIXTURE — three separate occasions, one unambiguous regularity, no meta-discussion ────
// ⛔ The claim ("she asks for the numbers before the recommendation") is NOT written anywhere in these
// sentences. It has to be inferred, and the spans that support it are copyable verbatim.
const BUCKETS = Object.freeze([
  {
    root: 'g1',
    turns: [{ excerpt: 'Before you tell me which option you like, show me the measured latency for each one.' }],
  },
  {
    root: 'g2',
    turns: [{ excerpt: 'Hold the recommendation for a moment. What did the benchmark actually report?' }],
  },
  {
    root: 'g3',
    turns: [{ excerpt: 'I want the raw error counts first, then your opinion about which build to ship.' }],
  },
])

const SUBJECT_QUESTION = (entity, attribute) =>
  `Question: based ONLY on the excerpts above, what is ${entity}'s ${attribute}?`

/** ⭐ Condition B differs from A in EXACTLY ONE LINE. Asserted below, not assumed. */
function subjectPrompt({ buckets, entity, attribute }) {
  const a = buildPrompt({ buckets, entity, attribute })
  const oldLine = `Question: what does "${entity} / ${attribute}" appear to be, based ONLY on the excerpts above?`
  if (!a.includes(oldLine)) throw new Error('the control prompt changed shape — this A/B is invalid')
  return a.replace(oldLine, SUBJECT_QUESTION(entity, attribute))
}

const ENTITY = 'the person'
const ATTRIBUTE = 'review order'

async function runCondition(name, prompt, llm) {
  const raw = await llm(prompt)
  const parsed = parseProposal(raw)
  const out = { name, raw: String(raw).trim().slice(0, 300) }
  if (!parsed.ok) return { ...out, stage: 'proposal', ok: false, why: parsed.why, declined: parsed.declined === true }
  const claim = {
    entity: ENTITY, attribute: ATTRIBUTE,
    value: String(parsed.parsed.value ?? '').trim(),
    kind: String(parsed.parsed.kind ?? '').trim(),
    cites: Array.isArray(parsed.parsed.cites) ? parsed.parsed.cites : [],
  }
  const valid = validateClaim(claim)
  if (!valid.ok) return { ...out, stage: 'grammar', ok: false, why: valid.why, claim }
  // ⛔ M2-8 IMPORTED, NOT REIMPLEMENTED. The gate is identical to the one 12b ran against.
  const v = verifyCitations({ cites: claim.cites, buckets: BUCKETS })
  return { ...out, stage: v.ok ? 'verified' : 'verification', ok: v.ok, why: v.why, claim, verification: v }
}

try {
  console.log('\n══ 12b.1 · REASONER CONTRACT — CONTROLLED FIXTURE ════════════════════════════')
  console.log(`   3 buckets · 1 turn each · the claim is NOT stated in any of them`)
  console.log('   ⛔ in-memory fixture · no database · no write · no natural corpus\n')

  const llm = makeDreamingLlm(fastify)
  const A = buildPrompt({ buckets: BUCKETS, entity: ENTITY, attribute: ATTRIBUTE })
  const B = subjectPrompt({ buckets: BUCKETS, entity: ENTITY, attribute: ATTRIBUTE })

  // ⭐⭐ ONE VARIABLE, PROVEN RATHER THAN CLAIMED. ⓘ A byte-identical A/B would prove the variable is
  // not in the loop at all — this project has already paid for that mistake once.
  const diffChars = Math.abs(A.length - B.length)
  console.log(`   A and B differ ONLY in the question line (Δ ${diffChars} chars, evidence identical)`)
  console.log(`   A: ${A.split('\n').find((l) => l.startsWith('Question:'))}`)
  console.log(`   B: ${B.split('\n').find((l) => l.startsWith('Question:'))}\n`)
  if (A === B) throw new Error('A and B are byte-identical — the variable is not in the loop')

  const results = []
  for (const [name, prompt] of [['A · control (definition-framed)', A], ['B · subject-framed', B]]) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await runCondition(name, prompt, llm))
  }

  console.log('══ RESULT ═══════════════════════════════════════════════════════════════════\n')
  for (const r of results) {
    console.log(`  ▸ ${r.name}`)
    console.log(`    stage    ${r.stage}  ${r.ok ? '✅ VERIFIED' : '⏸ refused'}`)
    if (r.claim?.value) console.log(`    value    ${JSON.stringify(r.claim.value)}`)
    if (r.verification) {
      console.log(`    verified ${r.verification.verifiedRoots} root(s) · `
        + `${r.verification.discarded.length} discarded`)
      for (const c of r.claim?.cites ?? []) {
        const inBucket = BUCKETS.find((b) => b.root === c.root)
        const found = inBucket?.turns.some((t) => t.excerpt.toLowerCase().includes(String(c.span).toLowerCase().trim()))
        console.log(`      ${found ? '✓' : '✗'} [${c.root}] ${JSON.stringify(String(c.span).slice(0, 70))}`)
      }
    }
    console.log(`    why      ${r.why}\n`)
  }

  // ── ⭐ THE DIAGNOSIS, DERIVED FROM THE TWO OUTCOMES ────────────────────────────────────────────
  const [a, b] = results
  console.log('══ DIAGNOSIS ════════════════════════════════════════════════════════════════\n')
  if (!a.ok && b.ok) {
    console.log('  ⭐⭐⭐ THE DEFECT IS D1 — THE QUESTION FRAMING.')
    console.log('     Same evidence, same format, same model. Only the question changed, and the')
    console.log('     subject-framed one produced a claim whose spans VERIFY.')
  } else if (a.ok && b.ok) {
    console.log('  ⭐⭐ BOTH CONDITIONS VERIFY ON CLEAN EVIDENCE ⇒ the dominant defect in 12b was D2,')
    console.log('     the EVIDENCE SELECTION: label-term matching supplied material about the WORD.')
  } else if (a.ok && !b.ok) {
    console.log('  ⚠️ THE CONTROL VERIFIED AND THE VARIANT DID NOT — an unexpected direction.')
    console.log('     ⛔ Do not conclude a framing rule from this; report it and re-examine.')
  } else {
    console.log('  ⚠️⚠️ NEITHER CONDITION VERIFIED ON UNAMBIGUOUS EVIDENCE.')
    console.log('     ⇒ the defect is DOWNSTREAM of question framing. The next variables to isolate,')
    console.log('       ⛔ one at a time: the exact-copy instruction · the JSON output format ·')
    console.log('       the model itself. ⛔ None of them is changed here.')
  }
  console.log('\n  ⛔ NOTHING WAS TUNED, SHIPPED OR PERSISTED. M2-8 unchanged; M2 still disabled.\n')
} catch (e) {
  console.error(`\n⛔ ${e?.stack ?? e}\n`)
  process.exitCode = 1
} finally {
  await db.sequelize?.close?.().catch(() => {})
}
