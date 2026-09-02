// ⭐⭐⭐ 12b.2 · SEPARATING D1 (QUESTION FRAMING) FROM D2 (EVIDENCE SELECTION).
//
//   node test/pipeline/dreaming-12b2-d1-d2-separation.mjs
//
// ── ⛔ WHAT THIS IS ─────────────────────────────────────────────────────────────────────────────
// Ote, 2026-09-03: *"The purpose isn't to prove that D1 or D2 is bad. It's to determine whether either
// one independently causes the observed definition-shaped claim."*
//
// ⇒ ⭐ A FULL 2×2, run ONCE. ⛔ Nothing is tuned, nothing is shipped, nothing is persisted, and the
// discriminator is PRE-REGISTERED below — ⛔ not fitted after reading the outputs.
// ⛔ M2-8 is imported unchanged. ⛔ No live-persona write. ⛔ In-memory fixtures only.
//
//                          │ Q-DEF (current, definition-framed) │ Q-SUBJ (subject-framed)
//   ───────────────────────┼───────────────────────────────────┼─────────────────────────
//   E-SUBJ subject-relevant│ ⭐⭐⭐ THE DECISIVE CELL           │ (12b.1 B, re-run here)
//   E-LABEL label-term     │ (the 12b natural shape)           │ is D2 sufficient alone?
//
//   E-SUBJ + Q-DEF → a SUBJECT answer  ⇒ D1 alone does NOT cause it; **D2 is responsible**
//   E-SUBJ + Q-DEF → a DEFINITION answer ⇒ **D1 is independently sufficient**
//
// ── ⭐⭐ REQUIREMENT 4, BUILT IN DELIBERATELY ───────────────────────────────────────────────────
// Ote: *"the subject evidence contains material that could TEMPT the reasoner to answer the definition
// rather than the subject."* ⇒ bucket `g2` of E-SUBJ carries a sentence in which the person DEFINES the
// term, sitting beside the concrete behaviour. ⭐ Without that, E-SUBJ would be a fixture with no
// definitional option at all, and passing it would prove nothing about the question's pull.
//
// ── ⭐⭐⭐ REQUIREMENT 5 — THE DISCRIMINATOR IS MECHANICAL AND DECLARED IN ADVANCE ──────────────
// ⛔ NOT a classifier and ⛔ not a threshold. The fixture is built so the two answer shapes MUST draw on
// disjoint vocabulary:
//   · a SUBJECT answer can name the concrete particulars — `latency`, `benchmark`, `error counts` —
//     which exist ONLY in E-SUBJ and cannot be invented from a definition;
//   · a DEFINITION answer describes the CATEGORY — `sequence`, `stored`, `durable`, `preference`.
// ⇒ the test is a yes/no: **does the value name at least one concrete particular?**
// ⛔ Neither list is ever shown to the model.

import { loadConfig, setDB } from '../../Backend/lib/utility.js'
import { initDB } from '../../Backend/database/index.js'
import { rebuildProviderRegistry } from '../../Backend/app/adapters/registry.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { makeDreamingLlm, buildPrompt, parseProposal } from '../../Backend/app/components/dreaming-reason-host.js'
import { verifyCitations } from '../../Backend/app/components/dreaming-verify.js'

const config = loadConfig()
const db = await initDB()
setDB(db)
await rebuildProviderRegistry({ db, config })
await initSettings(db)
const fastify = { db, config }

const ENTITY = 'the person'
const ATTRIBUTE = 'review order'

// ── E-SUBJ · SUBJECT-RELEVANT. Three occasions of the person actually doing the thing. ──────────
// ⭐ `g2` carries the DEFINITIONAL TEMPTATION — the person defines the term mid-turn.
const E_SUBJ = Object.freeze([
  { root: 'g1', turns: [{ excerpt: 'Before you tell me which option you like, show me the measured latency for each one.' }] },
  { root: 'g2', turns: [{ excerpt: 'Hold the recommendation for a moment. What did the benchmark actually report? Reviewing things in that sequence is simply what I mean by a review order.' }] },
  { root: 'g3', turns: [{ excerpt: 'I want the raw error counts first, then your opinion about which build to ship.' }] },
])

// ── E-LABEL · LABEL-TERM MATCH. Three turns that merely MENTION the attribute, the way the natural
// corpus did — meta-discussion of the concept, ⛔ no concrete behaviour by anyone. ─────────────────
const E_LABEL = Object.freeze([
  { root: 'g1', turns: [{ excerpt: 'A review order is basically the sequence you go through when checking work.' }] },
  { root: 'g2', turns: [{ excerpt: 'We should store the review order as a durable preference rather than casual chitchat.' }] },
  { root: 'g3', turns: [{ excerpt: 'Whatever review order gets recorded, it ought to be something the system can reuse later.' }] },
])

// ⭐⭐ PRE-REGISTERED, BEFORE THE RUN. ⛔ Never shown to the model.
const CONCRETE_PARTICULARS = Object.freeze(['latency', 'benchmark', 'error count', 'error counts', 'raw error'])
const CATEGORY_WORDS = Object.freeze(['sequence', 'stored', 'store', 'durable', 'preference', 'recorded', 'reuse', 'chitchat', 'basically', 'is a '])

const hits = (value, list) => list.filter((t) => String(value ?? '').toLowerCase().includes(t))

const Q_DEF = (e, a) => `Question: what does "${e} / ${a}" appear to be, based ONLY on the excerpts above?`
const Q_SUBJ = (e, a) => `Question: based ONLY on the excerpts above, what is ${e}'s ${a}?`

/** ⭐ Q-SUBJ differs from Q-DEF in exactly one line — asserted, ⛔ not assumed. */
function promptFor(buckets, question) {
  const base = buildPrompt({ buckets, entity: ENTITY, attribute: ATTRIBUTE })
  const line = Q_DEF(ENTITY, ATTRIBUTE)
  if (!base.includes(line)) throw new Error('the control prompt changed shape — this 2×2 is invalid')
  return question === 'Q-DEF' ? base : base.replace(line, Q_SUBJ(ENTITY, ATTRIBUTE))
}

async function cell(evidenceName, buckets, question, llm) {
  const raw = await llm(promptFor(buckets, question))
  const parsed = parseProposal(raw)
  const out = { evidenceName, question }
  if (!parsed.ok) return { ...out, value: null, why: parsed.why, verified: null }
  const value = String(parsed.parsed.value ?? '').trim()
  const cites = Array.isArray(parsed.parsed.cites) ? parsed.parsed.cites : []
  // ⛔ M2-8 UNCHANGED — imported, never reimplemented, never relaxed.
  const v = verifyCitations({ cites, buckets })
  return {
    ...out,
    value,
    verified: v.verifiedRoots,
    grounded: v.ok,
    concrete: hits(value, CONCRETE_PARTICULARS),
    category: hits(value, CATEGORY_WORDS),
  }
}

try {
  console.log('\n══ 12b.2 · D1 / D2 SEPARATION — 2×2, RUN ONCE ════════════════════════════════')
  console.log('   ⛔ in-memory fixtures · no database write · no live persona · M2-8 unchanged')
  console.log('   ⭐ discriminator PRE-REGISTERED: does the value name a CONCRETE PARTICULAR?')
  console.log(`     particulars (E-SUBJ only): ${CONCRETE_PARTICULARS.join(', ')}`)
  console.log(`     category words:            ${CATEGORY_WORDS.join(', ')}\n`)

  const llm = makeDreamingLlm(fastify)
  const results = []
  for (const [name, buckets] of [['E-SUBJ', E_SUBJ], ['E-LABEL', E_LABEL]]) {
    for (const q of ['Q-DEF', 'Q-SUBJ']) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await cell(name, buckets, q, llm))
    }
  }

  console.log('══ THE 2×2 ══════════════════════════════════════════════════════════════════\n')
  for (const r of results) {
    const shape = r.value === null ? 'no answer'
      : (r.concrete.length ? '⭐ SUBJECT-shaped' : '⚠️ DEFINITION-shaped')
    console.log(`  ▸ ${r.evidenceName} × ${r.question}   →   ${shape}`)
    console.log(`    value      ${JSON.stringify(r.value)}`)
    console.log(`    grounded   ${r.grounded ? `✅ ${r.verified} verified root(s)` : `⏸ ${r.verified ?? 0} verified`}`)
    console.log(`    particulars ${r.concrete?.length ? r.concrete.join(', ') : '(none)'}`)
    console.log(`    category    ${r.category?.length ? r.category.join(', ') : '(none)'}\n`)
  }

  // ── ⭐ THE READING, FROM THE DECISIVE CELL ────────────────────────────────────────────────────
  const decisive = results.find((r) => r.evidenceName === 'E-SUBJ' && r.question === 'Q-DEF')
  const subjControl = results.find((r) => r.evidenceName === 'E-SUBJ' && r.question === 'Q-SUBJ')
  const labelDef = results.find((r) => r.evidenceName === 'E-LABEL' && r.question === 'Q-DEF')
  const labelSubj = results.find((r) => r.evidenceName === 'E-LABEL' && r.question === 'Q-SUBJ')

  console.log('══ SEPARATION ═══════════════════════════════════════════════════════════════\n')
  console.log(`  ⭐ DECISIVE CELL — subject-relevant evidence, definition-framed question:`)
  if (decisive?.concrete?.length) {
    console.log('     → SUBJECT-shaped. ⇒ ⭐⭐⭐ D1 ALONE DOES NOT CAUSE THE DEFINITION SHAPE.')
    console.log('       The question framing survives good evidence. ⇒ **D2 (evidence selection) is')
    console.log('       responsible for the 12b result**, and the question is a lesser factor.')
  } else if (decisive?.value) {
    console.log('     → DEFINITION-shaped. ⇒ ⭐⭐⭐ D1 IS INDEPENDENTLY SUFFICIENT.')
    console.log('       Even with subject-relevant evidence in front of it, the definition-framed')
    console.log('       question pulls the answer to the label. ⇒ **the question must change.**')
  } else {
    console.log('     → no answer. ⛔ Inconclusive; ⛔ do not read a separation from this.')
  }
  console.log(`\n  ⓘ E-SUBJ × Q-SUBJ (control)  ${subjControl?.concrete?.length ? 'SUBJECT-shaped' : 'DEFINITION-shaped'}`)
  console.log(`  ⓘ E-LABEL × Q-DEF            ${labelDef?.concrete?.length ? 'SUBJECT-shaped' : 'DEFINITION-shaped'}`)
  console.log(`  ⓘ E-LABEL × Q-SUBJ           ${labelSubj?.concrete?.length ? 'SUBJECT-shaped' : 'DEFINITION-shaped'}`)
  console.log('\n  ⚠️ E-LABEL contains NO concrete particulars by construction, so neither question can')
  console.log('     produce a subject answer from it. ⭐ That row shows whether D2 CAPS the outcome')
  console.log('     regardless of framing — ⛔ it is not evidence about the question.\n')
  console.log('  ⛔ NOTHING TUNED, SHIPPED OR PERSISTED. M2-8 unchanged; M2 disabled.\n')
} catch (e) {
  console.error(`\n⛔ ${e?.stack ?? e}\n`)
  process.exitCode = 1
} finally {
  await db.sequelize?.close?.().catch(() => {})
}
