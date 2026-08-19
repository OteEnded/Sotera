// CONTROLLED ATTRIBUTION EXPERIMENT — runner.
//
//   node pipeline/attribution-run.mjs            # full run, resumable
//   node pipeline/attribution-run.mjs --repeats 1  # smoke
//
// Design per PLAN_LAYER_ATTRIBUTION_EXPERIMENT (corpus frozen v1.0.0, scoring frozen).
//
// ⚠️ METHOD CHOICE, STATED BECAUSE IT MATTERS: this composes the prompt with Sotera's OWN Composer and
// calls the model directly, rather than driving the HTTP route. Reasons:
//   1. The hypothesis is about the PROMPT's effect on the MODEL. That is exactly what this isolates.
//   2. The corpus needs specific L3 notes present. Going through the route would mean WRITING notes
//      into her live store and deleting them again, 240 times — contaminating the store this arc is
//      about, on an account she also uses.
//   3. The route's rendering of these parts is already covered by unit tests, so nothing is assumed.
// The cost is that this does not exercise the route wiring; that is what the unit tests are for, and
// the report says so rather than implying end-to-end coverage.
//
// Resumable: every result is appended to results.jsonl as it lands, and a rerun skips completed cells.
// A 90-minute run that loses everything to one hiccup is a run nobody repeats.

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { composeSystemContext, composeRuntimeTail } from '../../Backend/app/components/context-composer.js'
import { scoreScenario, validateCorpus, containsCanary } from '../lib/attribution-scanner.mjs'

const TEST_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(TEST_DIR, 'results')

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? dflt : process.argv[i + 1]
}
// ⚠️ Declared AFTER `arg` — `const` is in the temporal dead zone until its initialiser runs, so calling
// arg() above this point throws ReferenceError rather than using a default. Caught on first run.
const OUT = join(OUT_DIR, arg('out', 'attribution-results.jsonl'))
const REPEATS = Number(arg('repeats', 5))
const MODEL = arg('model', 'qwen3.6:35b')
const OLLAMA = arg('ollama', 'http://127.0.0.1:11434')
// Defaults reproduce the v1 run exactly; the flags exist so v2 can run WITHOUT editing v1's frozen
// corpus, results or scoring. A different --out means v1's results file is never opened for writing.
const CORPUS_FILE = arg('corpus', 'attribution-corpus.json')
const CONDITION_FILTER = arg('conditions', 'BASELINE,TREATMENT').split(',').map((s) => s.trim())

const corpus = JSON.parse(readFileSync(join(TEST_DIR, 'fixtures', CORPUS_FILE), 'utf8'))

// ── PRECONDITIONS FAIL FAST ───────────────────────────────────────────────────────────────────────
// An instrument that starts a long run before checking it can score is not an instrument.
// validateCorpus encodes v1's category balance, so it only applies to v1. v2 carries its own shape and
// is checked for the property that actually invalidates scoring: a canary appearing in a user turn.
const problems = corpus.version.startsWith('1') ? validateCorpus(corpus) : v2Checks(corpus)
if (problems.length) {
  console.error('✖ corpus does not validate — refusing to run:')
  for (const p of problems) console.error(`   ${p}`)
  process.exit(1)
}
function v2Checks(c) {
  const out = []
  const ids = new Set()
  for (const s of c.scenarios) {
    if (ids.has(s.id)) out.push(`duplicate id ${s.id}`)
    ids.add(s.id)
    const turns = [...(s.userTurns || []), s.probe || '']
    for (const n of s.notes || []) {
      if (!n.canary) { out.push(`${s.id}: note without a canary`); continue }
      for (const t of turns) if (containsCanary(t, n.canary)) out.push(`${s.id}: canary "${n.canary}" appears in a user turn — scoring would be invalid`)
      if (/\b(my note|i noted|i decided|remember i|my own)\b/i.test(n.text)) out.push(`${s.id}: note leaks its own ownership`)
    }
  }
  return out
}
try {
  const tags = await (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(8000) })).json()
  if (!tags.models.some((m) => m.name === MODEL)) { console.error(`✖ ${MODEL} not present on ${OLLAMA}`); process.exit(1) }
} catch (e) { console.error(`✖ ollama unreachable at ${OLLAMA}: ${e.message}`); process.exit(1) }

mkdirSync(OUT_DIR, { recursive: true })
const done = new Set()
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { const r = JSON.parse(line); done.add(`${r.condition}|${r.id}|${r.repeat}`) } catch { /* partial last line */ }
  }
  console.log(`resuming — ${done.size} cells already recorded`)
}

/** Build the exact message array Sotera would send, for one scenario under one condition. */
function buildMessages(scenario, layerAuthority) {
  const composed = composeSystemContext({
    // Current live L1 — the minimal-identity change is NOT applied, so these numbers describe today's
    // baseline. If L1 changes, the corpus note bumps to 1.0.1 and prior results do not carry over.
    systemPrompt: null,
    assistantIdentity: null,
    user: { username: 'agent_dev', displayName: 'Ote' },
    timezone: 'Asia/Bangkok',
    toolsOn: false,          // tools off: the corpus tests prose behaviour, not tool routing
    useMemory: true,
    personaNotes: (scenario.notes || []).map((n) => n.text),
    layerAuthority,
  })
  // ⚠️ NO FABRICATED ASSISTANT TURNS. The first version inserted a content-free "Understood." between
  // prior user turns to keep roles alternating. The model COPIED IT: scenario A1 (two prior turns)
  // answered the probe with the single word "Understood." — and scored PASS, because a degenerate reply
  // contains no misattribution. The instrument was manufacturing false passes out of its own filler.
  // Consecutive user messages inject nothing, which is the only safe amount to inject.
  const history = [...(scenario.userTurns || []).map((t) => ({ role: 'user', content: t })),
    { role: 'user', content: scenario.probe }]
  const tail = composeRuntimeTail({
    toolsOn: false, useMemory: true, nowString: '2026-08-18, 12:00', zone: 'Asia/Bangkok',
    lastUserText: scenario.probe,
  })
  return [{ role: 'system', content: composed.system }, ...composed.preHistory, ...history, ...tail]
}

async function ask(messages) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Production sampling: her config sets no temperature, so neither do we. A number obtained at
    // temp 0 would not describe what a user gets.
    body: JSON.stringify({ model: MODEL, messages, stream: false, think: false }),
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}`)
  const j = await res.json()
  return j.message?.content ?? ''
}

const CONDITIONS = [['BASELINE', false], ['TREATMENT', true]].filter(([n]) => CONDITION_FILTER.includes(n))
const total = corpus.scenarios.length * REPEATS * CONDITIONS.length
let n = 0
const t0 = Date.now()

console.log(`\ncorpus ${corpus.version} · ${corpus.scenarios.length} scenarios × ${REPEATS} repeats × 2 conditions = ${total} turns`)
console.log(`model ${MODEL} · production sampling · think:false\n`)

for (const [condition, layerAuthority] of CONDITIONS) {
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    for (const scenario of corpus.scenarios) {
      n++
      const key = `${condition}|${scenario.id}|${repeat}`
      if (done.has(key)) continue
      let reply = null; let error = null
      const started = Date.now()
      try { reply = await ask(buildMessages(scenario, layerAuthority)) } catch (e) { error = e.message }
      const scored = (reply === null || scenario.adjudicateOnly) ? null : scoreScenario(scenario, reply, { attributionPhrases: corpus.attributionPhrases })
      appendFileSync(OUT, `${JSON.stringify({
        condition, id: scenario.id, category: scenario.category, repeat,
        ms: Date.now() - started, error, reply, scored,
      })}\n`)
      const mark = error ? 'ERR ' : !scored ? 'adj ' : scored.pass ? 'pass' : 'FAIL'
      const pct = ((n / total) * 100).toFixed(0)
      const eta = Math.round(((Date.now() - t0) / n) * (total - n) / 60000)
      console.log(`[${String(n).padStart(3)}/${total} ${pct}%] ${condition.padEnd(9)} ${scenario.id.padEnd(3)} r${repeat}  ${mark}  ${Date.now() - started}ms  eta ${eta}m`)
    }
  }
}
console.log(`\ndone in ${Math.round((Date.now() - t0) / 60000)}m → ${OUT}`)
console.log('score with:  node pipeline/attribution-report.mjs')
