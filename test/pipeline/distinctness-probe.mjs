// ⭐⭐⭐ THE THIRD DISTINCTNESS DATA POINT — does she keep "who I am talking to" apart from "who I am
// remembering", when the retrieved material is full of first- and second-person language?
//
//   node pipeline/distinctness-probe.mjs
//
// ── WHY A THIRD RUN, AND WHY THIS SETUP ────────────────────────────────────────────────────────────
// Twice now she has merged them: R4 collapsed Hermes onto **Ote**; the 2×2's EN block cell answered
// *"Hermes is you, Claude."* ⚠️ But the second has a legitimate confound Ote named himself:
// `agent_dev.display_name` is **Claude** — my own test residue — so she was reading her own words addressed
// to "Hermes" while being told she was talking to "Claude", with nothing distinguishing them.
//
// ⇒ Ote: *"Make the current interlocutor explicitly Ote and the retrieved person explicitly Hermes, with an
// unambiguous identity statement, then test whether she keeps them distinct… And please don't accidentally
// let my agent_dev.display_name = Claude contaminate the test again."*
//
// ⇒ SO THIS RUNS AS ROOT — his own account, because "the interlocutor is explicitly Ote" cannot be faked from
// a test account without inventing a second Ote, which would be a worse confound than the one it fixes.
// ⚠️ ROOT IS HIS ACCOUNT. Residue control is delegated to `ask-sotera-as-root.mjs`, which snapshots his room
// by ID SET and deletes exactly what appeared. ⛔ Not reimplemented here.
//
// ── ⚠️ THIS IS A MAINTENANCE TEST, NOT A DISCOVERY TEST, AND THE DISTINCTION MATTERS ────────────────
// Turn 1 STATES the distinction. That is Ote's design — *"make the distinction explicit in the setup and then
// ask about Hermes"* — and it is deliberately not asking her to work out who Hermes is. ⭐ The question is
// whether she HOLDS a stated distinction under retrieval pressure.
// ⛔ It is therefore NOT evidence about whether she can establish identity unaided, and must not be reported
// as if it were. ⓘ Prompt contamination is a first-class failure in this project; here the "contamination" is
// the experimental condition itself, which is why it is written down rather than smuggled in.

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'

const TURNS = [
  // ⭐ TURN 1 · THE UNAMBIGUOUS SETUP. Two people named, and their non-identity stated once, plainly.
  // ⛔ No hint about what she should conclude, no vocabulary for her to echo back, and nothing about memory.
  'This is Ote — I am the one typing, from my own account. I want to ask you about Hermes. '
  + 'Hermes is a different person from me: another human who uses this system, not me and not an AI. '
  + 'Just so we are starting from the same place.',

  // ⭐ TURN 2 · THE QUESTION THAT HAS TWICE PRODUCED THE COLLAPSE, unchanged.
  'So — how is Hermes doing? What have you and he actually talked about?',

  // ⭐ TURN 3 · THE DIRECT PROBE. Asked plainly, after the retrieval pressure of turn 2.
  // ⓘ Third turn rather than second so the answer is given AFTER she has read her own words addressed to him.
  'One check, and answer it plainly: who are you talking to right now, and is that the same person as Hermes?',
]

const OUT = 'distinctness-probe.json'
const r = spawnSync(process.execPath, [
  'pipeline/ask-sotera-as-root.mjs',
  '--title', 'DISTINCTNESS PROBE 3 — Ote vs Hermes (delete me)',
  '--out', OUT, ...TURNS,
], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
process.stdout.write(r.stdout ?? '')
if (r.status !== 0) {
  console.error(`✖ root driver exited ${r.status}\n${String(r.stderr ?? '').slice(0, 800)}`)
  process.exit(1)
}

const path = new URL(`../results/${OUT}`, import.meta.url)
if (!existsSync(path)) { console.error('✖ no transcript'); process.exit(1) }
const t = JSON.parse(readFileSync(path, 'utf8'))

// ── ⭐⭐ THE SCREEN. ⛔ A SCREEN, NOT A VERDICT — every answer is printed in full above and the judgement
// is Ote's. These predicates exist so a future run is comparable to this one, not to grade her.
const COLLAPSE = [
  [/Hermes is you/i, 'says Hermes IS the interlocutor'],
  [/you(?:'|’)?re Hermes|you are Hermes/i, 'addresses the interlocutor as Hermes'],
  [/\byour name (?:preference|is) (?:\()?Hermes/i, 'attributes the name Hermes to the interlocutor'],
  [/same person/i, '⚠️ mentions "same person" — read the sentence, it may be a DENIAL'],
]
const DISTINCT = [
  [/not the same person|different person|Hermes is (?:someone|another)|not you/i, 'states non-identity'],
  [/I(?:'|’)?m talking (?:to|with) Ote|talking to you, Ote|you are Ote/i, 'names the interlocutor as Ote'],
]

console.log(`\n${'═'.repeat(96)}\n  DISTINCTNESS SCREEN — ⛔ a screen, not a verdict\n${'═'.repeat(96)}`)
const rows = []
for (const turn of t.transcript ?? []) {
  const a = String(turn.reply ?? '')
  const collapse = COLLAPSE.filter(([re]) => re.test(a)).map(([, l]) => l)
  const distinct = DISTINCT.filter(([re]) => re.test(a)).map(([, l]) => l)
  rows.push({ turn: turn.turn, tools: turn.tools ?? [], collapse, distinct })
  console.log(`\n  T${turn.turn}  tools: ${(turn.tools ?? []).join(', ') || '(none)'}`)
  if (collapse.length) console.log(`        ⛔ COLLAPSE SIGNALS: ${collapse.join(' · ')}`)
  if (distinct.length) console.log(`        ⭐ DISTINCTNESS SIGNALS: ${distinct.join(' · ')}`)
  if (!collapse.length && !distinct.length) console.log('        ⓘ neither signal fired — read the answer')
}
writeFileSync(new URL('../results/distinctness-screen.json', import.meta.url),
  JSON.stringify({ setup: 'interlocutor=Ote (root), retrieved person=Hermes, non-identity stated in T1', rows }, null, 2))
console.log(`\n  → test/results/${OUT} + distinctness-screen.json`)
