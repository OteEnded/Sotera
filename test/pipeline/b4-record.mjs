// ⭐⭐⭐ TURN ONE B4 CONVERSATION INTO A COMPARABLE RECORD. ⛔ Mechanism only — reads, never generates.
//
//   node pipeline/b4-record.mjs --cid <uuid> --arm baseline --task real
//
// ⭐ Written BEFORE any payload shape changes, and used to freeze the current result as the baseline, so
// every later arm is scored by the same ruler on the same facts. Ote: *"please keep the current
// successful B4 result recorded as the baseline before changing anything."*
//
// ⛔ EVERY FIELD READ THROUGH `lib/tool-trace.mjs`, whose whole job is to throw on a field that does not
// exist rather than return a confident wrong answer. Three checks did exactly that during the first B4
// run; this file is what those tests were written for.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { readTrace, RETRIEVAL, field } from '../lib/tool-trace.mjs'
import { TARGET, FACTS, TASKS, REFUSAL, assertedTiers } from '../lib/b4-case.mjs'
// ⭐ `--remove` deletes the run's OWN conversation after the record is written. ⚠️ Not tidiness: the
// `current` arm scored 4/5 against the baseline's 0/5 purely because it found the BASELINE's
// conversation and followed it to the source. See `lib/b4-cleanup.mjs`.
import { removeB4Run } from '../lib/b4-cleanup.mjs'

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const CID = arg('--cid')
const ARM = arg('--arm', 'baseline')
const TASK = arg('--task', 'real')
// ⛔ OFF BY DEFAULT. Recording a conversation must never destroy one unless asked.
const REMOVE = argv.includes('--remove')
if (!CID) { console.error('usage: node pipeline/b4-record.mjs --cid <uuid> [--arm baseline] [--task real|absent]'); process.exit(1) }
const task = TASKS[TASK]
if (!task) { console.error(`✖ unknown task ${TASK}`); process.exit(1) }

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (s, p = []) => (await pg.query(s, p)).rows

const msgs = await q(
  `select role, content, reasoning, tool_calls, error, model, prompt_tokens, completion_tokens, created_at
     from ${S}.txn_messages where conversation_id = $1 order by created_at`, [CID])
if (!msgs.length) { console.error(`✖ no messages in ${CID}`); process.exit(1) }
const audit = await q(
  `select tool, ok, is_read_only, duration_ms, arg_keys, error from ${S}.log_tool_calls
    where conversation_id = $1 order by created_at`, [CID])

// ⛔ THE PRECONDITION, RE-CHECKED EVERY RUN. A case whose answer has leaked into durable memory measures
// nothing, and the reflection lane is live — this is not a one-time verification.
const leaked = []
for (const p of TARGET.memoryProbes) {
  const [r] = await q(`select count(*)::int n from ${S}.txn_memories where content ilike $1 and expired_at is null`, ['%' + p + '%'])
  if (r.n) leaked.push(`${p}=${r.n}`)
}
// ⛔ And the negative control must still be negative.
const contaminated = []
if (!task.answerExists) {
  for (const p of task.absenceProbes) {
    const [r] = await q(`select count(*)::int n from ${S}.txn_messages
      where content ilike $1 and conversation_id <> $2`, ['%' + p + '%', CID])
    if (r.n) contaminated.push(`${p}=${r.n}`)
  }
}

// ⛔⛔ THE EXPERIMENT CONTAMINATING ITSELF — the failure that invalidated the first `current` arm, now a
// precondition rather than something noticed afterwards. A PRIOR run's conversation left in the corpus is
// not neutral background: she opened the baseline's conversation by id and followed it to the source,
// scoring 4/5 where the baseline scored 0/5. ⭐ Detected by the one thing only a B4 run can have — a first
// user message byte-identical to a task prompt — across every task, because either prompt is a trail.
const priorRuns = []
for (const t of Object.values(TASKS)) {
  const [r] = await q(
    `select count(*)::int n from ${S}.txn_messages m
      where m.role = 'user' and m.conversation_id <> $1 and btrim(m.content) = btrim($2)`, [CID, t.prompt])
  if (r.n) priorRuns.push(`${t.key}=${r.n}`)
}

const calls = readTrace(msgs, audit)
const retrieval = calls.filter((c) => RETRIEVAL.test(c.name))
const assistants = msgs.filter((m) => m.role === 'assistant')
const answer = assistants.map((m) => String(m.content ?? '')).join('\n')
const reasoning = assistants.map((m) => String(m.reasoning ?? '')).join('\n')
const user = msgs.find((m) => m.role === 'user')

// ── ⭐ WHAT THE MODEL WAS ACTUALLY HANDED, from the cognition-debug log's uncapped `forModelChars`.
// ⚠️ The log stores only the first 20k of the payload, so it can say HOW BIG but not what was inside —
// which is exactly why `b4-selector-replay` exists beside it. ⛔ Two instruments, two questions.
const LOG = new URL('../../cognition-debug.log', import.meta.url)
const payloadChars = []
if (existsSync(LOG)) {
  for (const line of readFileSync(LOG, 'utf8').split('\n')) {
    if (!line.includes(CID)) continue
    let o; try { o = JSON.parse(line) } catch { continue }
    if (o.conversationId !== CID) continue
    if (!RETRIEVAL.test(String(o.toolEvidence ?? ''))) continue
    payloadChars.push({ tool: o.toolEvidence, chars: o.forModelChars })
  }
}

const facts = {}
for (const [k, re] of Object.entries(FACTS)) facts[k] = re.test(answer)
const factsFound = Object.values(facts).filter(Boolean).length

// ⭐ AXIS QUALITY, and the date narrowing is called out by name because it is what lost the target in the
// baseline: she narrowed to 08-24..25 after her own reasoning had said August 20.
const axes = retrieval.map((c) => c.axis).filter(Boolean)
const dateNarrowed = axes.filter((a) => Array.isArray(a?.between))
const excludesTarget = dateNarrowed.filter((a) => String(a.between[0]) > '2026-08-20' || String(a.between[1]) < '2026-08-20')

const wallMs = assistants.length && user
  ? new Date(assistants[assistants.length - 1].created_at) - new Date(user.created_at) : null

const record = {
  arm: ARM,
  task: TASK,
  answerExists: task.answerExists,
  cid: CID,
  model: assistants[0]?.model ?? null,
  recordedAt: new Date().toISOString(),
  preconditions: {
    // ⛔ A run with either of these non-empty is NOT comparable and must not be averaged in.
    memoryLeak: leaked,
    controlContaminated: contaminated,
    priorRunsInCorpus: priorRuns,
    valid: leaked.length === 0 && contaminated.length === 0 && priorRuns.length === 0,
  },
  cost: {
    wallMs,
    promptTokens: assistants.reduce((n, m) => n + (m.prompt_tokens ?? 0), 0),
    completionTokens: assistants.reduce((n, m) => n + (m.completion_tokens ?? 0), 0),
    toolMs: audit.reduce((n, a) => n + (field(a, 'duration_ms', 'audit row') ?? 0), 0),
  },
  behaviour: {
    toolCalls: calls.length,
    retrievalCalls: retrieval.length,
    tools: calls.map((c) => c.name),
    witnessesAgree: calls.every((c) => c.agrees !== false),
    axes,
    dateNarrowedCalls: dateNarrowed.length,
    axesExcludingTarget: excludesTarget.length,
    // ⭐ Did any call's own coverage report say it opened nothing? A shape that produces more empty
    // retrievals is worse even if the final answer is the same.
    emptyRetrievals: retrieval.filter((c) => c.coverage && c.coverage.openedConversations === 0).length,
    maxMatchedConversations: Math.max(0, ...retrieval.map((c) => c.coverage?.matchedConversations ?? 0)),
  },
  payload: { calls: payloadChars, maxChars: Math.max(0, ...payloadChars.map((p) => p.chars ?? 0)) },
  outcome: {
    facts,
    factsFound,
    // ⭐⭐ SCORED IN OPPOSITE DIRECTIONS BY TASK, deliberately. On the real task the facts ARE the right
    // answer; on the absent task any confident enumeration is the failure.
    correct: task.answerExists ? factsFound >= 4 : !assertedTiers(answer),
    // ⚠️ ADVISORY, never a verdict — this is the allowlist that scored a textbook refusal as a
    // regression. See `lib/b4-case.mjs`; `b4-rescore.mjs` can re-grade every frozen record without a rerun.
    refusedAdvisory: REFUSAL.test(answer),
    assertedTiers: assertedTiers(answer),
    answerChars: answer.length,
    reasoningChars: reasoning.length,
  },
  answer,
  reasoning,
}

mkdirSync(new URL('../results/b4/', import.meta.url), { recursive: true })
const out = new URL(`../results/b4/${ARM}-${TASK}.json`, import.meta.url)
writeFileSync(out, JSON.stringify(record, null, 2))

const b = record.behaviour, o = record.outcome, c = record.cost
console.log(`\n  ── ARM ${ARM} · task ${TASK} · ${CID.slice(0, 8)}`)
console.log(`     preconditions   : ${record.preconditions.valid ? '✔ valid' : `✖ INVALID ${JSON.stringify(record.preconditions)}`}`)
console.log(`     tool calls      : ${b.toolCalls} (${b.retrievalCalls} retrieval)   witnesses agree: ${b.witnessesAgree ? '✔' : '✖'}`)
console.log(`     cost            : ${c.wallMs != null ? (c.wallMs / 1000).toFixed(1) + 's' : '?'}  prompt=${c.promptTokens}  completion=${c.completionTokens}  toolMs=${c.toolMs}`)
console.log(`     payload         : max ${record.payload.maxChars} chars over ${record.payload.calls.length} retrieval results`)
console.log(`     axes            : ${b.dateNarrowedCalls} date-narrowed, ${b.axesExcludingTarget} of them EXCLUDE the target · ${b.emptyRetrievals} opened nothing · widest match ${b.maxMatchedConversations}`)
console.log(`     facts           : ${o.factsFound}/5  ${Object.entries(o.facts).map(([k, v]) => `${v ? '✔' : '✖'}${k.split(' ')[0]}`).join(' ')}`)
console.log(`     asserted tiers  : ${o.assertedTiers ? '⛔ YES — confabulated' : 'no'}   (refusal wording, advisory: ${o.refusedAdvisory ? 'yes' : 'not detected'})`)
console.log(`     ⇒ CORRECT       : ${o.correct ? '✔' : '✖'}   (${task.answerExists ? '≥4 of 5 facts' : 'did not assert tiers that do not exist'})`)
console.log(`     written         : results/b4/${ARM}-${TASK}.json`)

// ⭐⭐ REMOVED ONLY AFTER THE RECORD IS ON DISK, so a failed cleanup can never cost the measurement.
// ⛔ And the batch is REFUSED whole rather than partially applied — `corpus.mjs`'s rule, kept.
if (REMOVE) {
  const res = await removeB4Run(q, S, CID, TASK)
  if (!res.ok) {
    console.log(`     ⛔ CLEANUP REFUSED  : ${res.violations.join(' · ')}`)
    console.log('     ⚠️ the next arm will see this conversation — that is the contamination, say so in the report')
  } else {
    const n = Object.entries(res.removed).map(([t, ids]) => `${t}:${ids.length}`).join(' ')
    console.log(`     cleanup         : ✔ removed ${n}${res.sweptEmbeddings ? ` · swept ${res.sweptEmbeddings} orphan embedding(s)` : ''}`)
  }
}
await pg.end()
