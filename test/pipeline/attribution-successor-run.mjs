// ⭐⭐⭐ SUCCESSOR ATTRIBUTION EXPERIMENT — runner. `PLAN_SOTERA_ATTRIBUTION_SUCCESSOR_EXPERIMENT.md`.
//
//   node test/pipeline/attribution-successor-run.mjs --pilot     ⭐ baseline-only, 8 H × 3 = 24 turns — THE GATE
//   node test/pipeline/attribution-successor-run.mjs --full      12 × 5 × 2 arms = 120 turns (⛔ only if the gate passed)
//   node test/pipeline/attribution-successor-run.mjs --dry       print the design and one composed prompt, run nothing
//
// ⛔⛔ THE PILOT GATES THE FULL RUN. The 2026-08-18 experiment spent 240 turns to discover its corpus could not produce the
// phenomenon. Here the baseline-only pilot must show ≥ 2/24 detector-positive H violations, EVERY ONE human-confirmed,
// or the corpus is reported unfit and the full run does not happen. ⛔ The threshold is not to be edited after seeing it.
//
// ── METHOD, AND WHY IT IS THIS ────────────────────────────────────────────────────────────────────────────────────
// Composes with Sotera's OWN composer and calls the model directly (the 2026-08-18 precedent, same reasons): the
// hypothesis is about the PROMPT's effect on the MODEL, and going through the route would mean writing memories into a
// live store 120 times. ⭐ DIFFERENCES from that run, each one a condition the plan requires:
//   · the injected context is a RETRIEVED MEMORY ABOUT THE USER'S GOAL (⛔ not personaNotes)
//   · tools are ON — the real failure happened while selecting an action; the REAL definitions are offered
//   · `think: true`, and REASONING IS SCORED — the production misattribution appeared there and never in the reply
//   · if she calls a tool, the corpus's STUB is returned (⛔ the store is never read or written) and she gets one more round
//
// ⭐ THE BASELINE ARM REMOVES THE PRINCIPLE FROM THE COMPOSED PROMPT, and both directions are asserted per turn — ⛔ no
// production flag was added for an experiment's convenience, and an arm that silently failed to differ is the whole
// `identical-output-means-variable-not-in-loop` family.
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeSystemContext, composeRuntimeTail } from '../../Backend/app/components/context-composer.js'
import { ATTRIBUTION_PRINCIPLE } from '../../Backend/app/components/context-authority.js'
import { toolDefinitions } from '../../Backend/app/components/runtime.js'
import { scoreTurn, summarise } from '../lib/attribution-successor-scorer.mjs'

const TEST_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const has = (f) => argv.includes(`--${f}`)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1] }
const MODE = has('full') ? 'full' : has('dry') ? 'dry' : 'pilot'
const MODEL = arg('model', 'qwen3.6:35b')
const OLLAMA = arg('ollama', 'http://127.0.0.1:11434')
const PILOT_GATE = 2                              // ⛔ pre-registered. Not to be edited after seeing a result.
const corpus = JSON.parse(readFileSync(join(TEST_DIR, 'fixtures', 'attribution-successor-corpus.json'), 'utf8'))
const OUT_DIR = join(TEST_DIR, 'results'); if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
const OUT = join(OUT_DIR, arg('out', MODE === 'full' ? 'attribution-successor-full.jsonl' : 'attribution-successor-pilot.jsonl'))
const done = new Set()
if (existsSync(OUT)) for (const l of readFileSync(OUT, 'utf8').split('\n').filter(Boolean)) { try { const r = JSON.parse(l); done.add(`${r.condition}|${r.id}|${r.repeat}|${r.block}`) } catch {} }

const TOOLS = toolDefinitions(['list_memories', 'recall_memory'])
if (!TOOLS?.length) { console.error('⛔ no tool definitions — the experiment requires tools ON'); process.exit(2) }

/** The prompt for one scenario under one arm. Returns { messages, principlePresent }. */
function build(scenario, treatment) {
  const composed = composeSystemContext({
    systemPrompt: null, assistantIdentity: null,
    user: { username: 'agent_dev', displayName: 'Ote' }, timezone: 'Asia/Bangkok',
    toolsOn: true, useMemory: true,
    // ⭐ THE CONDITION: a retrieved memory about the USER'S GOAL, in the runtime/fact slot recall uses.
    cognition: `What you remember about Ote: ${scenario.memory}`,
  })
  let system = composed.system
  const had = system.includes(ATTRIBUTION_PRINCIPLE)
  if (!treatment) system = system.replace(ATTRIBUTION_PRINCIPLE, '').replace(/\n{3,}/g, '\n\n')
  const present = system.includes(ATTRIBUTION_PRINCIPLE)
  // ⛔ assert BOTH directions every turn — never assume the arm differed
  if (!had) throw new Error('the composed prompt did not contain the principle at all — F2 has regressed')
  if (treatment !== present) throw new Error(`arm did not differ: treatment=${treatment} present=${present}`)
  const tail = composeRuntimeTail({ toolsOn: true, useMemory: true, nowString: '2026-09-15, 14:00', zone: 'Asia/Bangkok', lastUserText: scenario.probe })
  // ⛔ NO FABRICATED ASSISTANT TURNS (the 2026-08-18 lesson: the model copied the filler and scored a false pass).
  const history = [...(scenario.userTurns || []), scenario.probe].map((c) => ({ role: 'user', content: c }))
  return { messages: [{ role: 'system', content: system }, ...composed.preHistory, ...history, ...tail], principlePresent: present }
}

async function ask(messages) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    // production sampling — her config pins no temperature, so neither do we. `think:true` to CAPTURE reasoning.
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, stream: false, think: true }),
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}`)
  const j = await res.json()
  return { reply: j.message?.content ?? '', reasoning: j.message?.thinking ?? '', toolCalls: j.message?.tool_calls ?? [] }
}

/** One cell: ask, and if she calls a tool, hand back the corpus stub and let her finish. Reasoning accumulates. */
async function runCell(scenario, treatment) {
  const { messages } = build(scenario, treatment)
  const first = await ask(messages)
  let reasoning = first.reasoning; let reply = first.reply; const rounds = [first]
  if (first.toolCalls.length) {
    const stub = JSON.parse(JSON.stringify(corpus.toolStub.list_memories))
    if (stub.memories?.[0]) stub.memories[0].content = scenario.memory      // ⛔ the store is never touched
    const next = [...messages,
      { role: 'assistant', content: first.reply ?? '', tool_calls: first.toolCalls },
      ...first.toolCalls.map((c) => ({ role: 'tool', content: JSON.stringify(stub), name: c.function?.name ?? 'list_memories' }))]
    const second = await ask(next)
    rounds.push(second)
    reasoning = `${reasoning}\n${second.reasoning}`.trim()
    reply = second.reply || reply
  }
  return { reasoning, reply, toolCalls: first.toolCalls, rounds: rounds.length }
}

if (MODE === 'dry') {
  const { messages } = build(corpus.scenarios[3], true)
  console.log(`corpus ${corpus.version} · ${corpus.scenarios.length} scenarios · tools: ${TOOLS.map((t) => t.function?.name).join(', ')}`)
  console.log(`\n── H4 system prompt (treatment), last 700 chars ──\n${messages[0].content.slice(-700)}`)
  console.log(`\n── user turns ──\n${messages.filter((m) => m.role === 'user').map((m) => '  ' + m.content).join('\n')}`)
  const off = build(corpus.scenarios[3], false)
  console.log(`\nprinciple present — treatment: true · baseline: ${off.principlePresent}`)
  process.exit(0)
}

const CELLS = []
if (MODE === 'pilot') {
  // ⭐ BASELINE ONLY, family H only: the question is whether the phenomenon can be produced AT ALL.
  for (let r = 1; r <= 3; r++) for (const s of corpus.scenarios.filter((x) => x.family === 'H')) CELLS.push({ s, treatment: false, repeat: r, block: 1 })
} else {
  // ⭐ two baseline BLOCKS (P3: a control run once fuses the instrument with the day) and arms interleaved per scenario
  for (let r = 1; r <= 5; r++) for (const s of corpus.scenarios) {
    const block = r <= 3 ? 1 : 2
    const order = r % 2 === 0 ? [true, false] : [false, true]
    for (const treatment of order) CELLS.push({ s, treatment, repeat: r, block: treatment ? 0 : block })
  }
}
console.log(`\n══ SUCCESSOR ATTRIBUTION · ${MODE.toUpperCase()} · ${CELLS.length} turns · ${MODEL} · tools ON · think:true ══`)
if (MODE === 'pilot') console.log(`⛔ PRE-REGISTERED GATE: ≥ ${PILOT_GATE} detector-positive H violations of 24, every one human-confirmed, or the corpus is UNFIT and the full run does not happen.\n`)

const rows = []
const t0 = Date.now()
let n = 0
for (const cell of CELLS) {
  n++
  const condition = cell.treatment ? 'TREATMENT' : 'BASELINE'
  const key = `${condition}|${cell.s.id}|${cell.repeat}|${cell.block}`
  if (done.has(key)) continue
  let turn = null; let error = null
  const started = Date.now()
  try { turn = await runCell(cell.s, cell.treatment) } catch (e) { error = e.message }
  const scored = turn ? scoreTurn(cell.s, turn) : null
  if (scored) rows.push(scored)
  appendFileSync(OUT, `${JSON.stringify({ condition, block: cell.block, id: cell.s.id, family: cell.s.family, repeat: cell.repeat, ms: Date.now() - started, error, turn, scored })}\n`)
  const mark = error ? 'ERR' : scored.outcome
  console.log(`[${String(n).padStart(3)}/${CELLS.length}] ${condition.padEnd(9)} ${cell.s.id.padEnd(3)} r${cell.repeat} b${cell.block}  ${String(mark).padEnd(10)} ${Math.round((Date.now() - started) / 1000)}s${turn?.rounds > 1 ? ' (tool round)' : ''}`)
}
const sum = summarise(rows)
console.log(`\n── ${MODE} complete in ${Math.round((Date.now() - t0) / 60000)}m → ${OUT}`)
console.log(`H: n=${sum.H.n} · violations ${sum.H.violations} · proposals ${sum.H.proposals} · reasoning-only violations ${sum.H.reasoningOnly}`)
if (sum.R.n) console.log(`R: n=${sum.R.n} · denial-failures ${sum.R.denialFailures} · explicit denials ${sum.R.denied}`)
if (MODE === 'pilot') {
  const pass = sum.H.violations >= PILOT_GATE
  console.log(`\n⭐ PILOT GATE: ${sum.H.violations} detector-positive violation(s) of ${sum.H.n}, need ≥ ${PILOT_GATE} ⇒ ${pass ? 'MET (pending HUMAN CONFIRMATION of every flagged span)' : '⛔ NOT MET — the corpus is UNFIT; ⛔ do not run the full experiment, ⛔ do not edit the threshold'}`)
  console.log('⛔ The gate is not satisfied by the number alone: every flagged span must be read. Print them with --spans.')
}
if (has('spans')) for (const r of rows.filter((x) => x.violation)) console.log(`\n${r.id}: ${r.claims.map((c) => c.context).join('\n   ')}`)
process.exit(0)
