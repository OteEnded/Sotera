// ⭐ NATURAL-TRAJECTORY REPRODUCTION · EXTRACT the canonical positive-control trajectory from the record.
//
// Ote, 2026-09-15: *"make the production incident itself the canonical positive-control trajectory."* This script builds
// that trajectory from what was actually recorded — ⛔ nothing here is authored:
//   · the turns            → `txn_messages` of conversation ca672514, verbatim, in rolling order
//   · her prompt blocks    → `cognition-debug.log`, the recollection / scope-facts / working-memory blocks the composer
//                            emitted for the FAILING turn (the log records exactly what went into the prompt)
//   · the tool results     → the same log's `forModel` payloads for her three list_memories calls — the DB copy in
//                            `tool_calls.result` is truncated at 4000 chars and unusable
//   · the incident         → her recorded reasoning, reply and tool calls on the failing turn
//
//   node test/pipeline/attribution-natural-extract.mjs        → test/fixtures/attribution-natural-trajectory-ca672514.json
//
// ⚠️ The fixture contains Ote's own conversation and the memory rows she listed, exactly as she saw them. That is the
// point of a positive control built from the record — and why it is its own file, so it can be excluded later by name.
import pg from 'pg'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const CONVERSATION = 'ca672514-0764-419e-8b87-3e3e1e4357bc'
const FAILING_TURN = 10749
const cfg = JSON.parse(readFileSync(join(ROOT, 'Backend', 'config.json'), 'utf8')).database.connection
const c = new pg.Client({ host: cfg.host, port: cfg.port, user: cfg.username, password: cfg.password, database: cfg.database })
await c.connect()
const { rows: msgs } = await c.query(
  `SELECT rolling_id, role, content, reasoning, tool_calls, model, metrics, created_at
     FROM persona_sotera.txn_messages WHERE conversation_id = $1 ORDER BY rolling_id`, [CONVERSATION])
const { rows: [convo] } = await c.query(
  `SELECT c.title, c.settings, u.username, u.display_name FROM persona_sotera.txn_conversations c
     JOIN persona_sotera.mst_users u ON u.id = c.user_id WHERE c.id = $1`, [CONVERSATION])
await c.end()

const failing = msgs.find((m) => m.rolling_id === FAILING_TURN)
if (!failing) throw new Error(`failing turn ${FAILING_TURN} not found`)
const before = msgs.filter((m) => m.rolling_id < FAILING_TURN)
const probe = before.at(-1)
if (probe.role !== 'user') throw new Error('the turn before the failure must be the user aside')
const history = before.slice(0, -1).map((m) => ({ rollingId: m.rolling_id, role: m.role, content: m.content }))
// ⛔ the history must be plain — no tool calls in her earlier turns (true of the record; asserted, not assumed)
for (const m of before) if (m.tool_calls && m.tool_calls.length) throw new Error(`turn ${m.rolling_id} carried tool calls — the history is not plain`)

// the log: every entry for this conversation; the failing turn's blocks are the ones stamped at the probe's time
const log = readFileSync(join(ROOT, 'cognition-debug.log'), 'utf8').split('\n').filter((l) => l.includes(CONVERSATION)).map((l) => JSON.parse(l))
const probeAt = new Date(probe.created_at).getTime()
const near = (e) => Math.abs(new Date(e.at).getTime() - probeAt) < 60_000
const recollection = log.find((e) => near(e) && e.asked === probe.content && e.context)
const scopeFacts = log.find((e) => near(e) && e.kind === 'scope-facts')
const workingMemory = log.find((e) => near(e) && e.kind === 'working-memory')
if (!recollection || !scopeFacts || !workingMemory) throw new Error('the failing turn\'s prompt blocks were not all found in the log')
const toolEvidence = log.filter((e) => e.toolEvidence === 'list_memories' && Math.abs(new Date(e.at).getTime() - new Date(failing.created_at).getTime()) < 120_000)
if (toolEvidence.length !== 3) throw new Error(`expected 3 list_memories results in the log, found ${toolEvidence.length}`)
// the DB keeps the ARGS intact (only the results are truncated) — pair each log payload with its kind by count
const calls = failing.tool_calls.map((t) => ({ name: t.name, args: t.args }))
const byKind = {}
for (const call of calls) {
  const payload = toolEvidence.find((e) => !Object.values(byKind).includes(e.forModel) && JSON.parse(e.forModel).count === expectedCount(call.args.kind))
  if (!payload) throw new Error(`no log payload for kind ${call.args.kind}`)
  byKind[call.args.kind] = payload.forModel
}
function expectedCount(kind) { return { semantic: 34, episodic: 0, identity: 2 }[kind] }

const out = {
  version: '1.0.0', frozen: '2026-09-15',
  source: {
    conversationId: CONVERSATION, title: convo.title, user: { username: convo.username, displayName: convo.display_name },
    model: failing.model, settings: convo.settings, failingTurn: FAILING_TURN,
    promptTokens: failing.metrics?.promptTokens ?? null, toolsetCount: failing.metrics?.toolset?.count ?? null,
    contextItems: failing.metrics?.context?.items ?? null,
    note: 'Everything in this file is copied from the record: txn_messages, txn_conversations and cognition-debug.log. Nothing is authored.',
  },
  history,
  probe: { rollingId: probe.rolling_id, content: probe.content },
  blocks: { cognition: recollection.context, scopeFacts: scopeFacts.block, workingMemory: workingMemory.block },
  toolResults: { list_memories: byKind },
  incident: { rollingId: FAILING_TURN, reasoning: failing.reasoning, reply: failing.content, toolCalls: calls, createdAt: failing.created_at },
}
const dest = join(ROOT, 'test', 'fixtures', 'attribution-natural-trajectory-ca672514.json')
writeFileSync(dest, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${dest}\n  history ${history.length} turns (${history.filter((m) => m.role === 'assistant').length} hers) · probe "${probe.content}"\n  cognition ${out.blocks.cognition.length} chars · scope-facts ${out.blocks.scopeFacts.length} · working-memory ${out.blocks.workingMemory.length}\n  tool results: ${Object.entries(byKind).map(([k, v]) => `${k}=${v.length}ch`).join(' ')}\n  production: ${out.source.promptTokens} prompt tokens · ${out.source.toolsetCount} tools · effort ${convo.settings?.reasoning?.effort}`)
