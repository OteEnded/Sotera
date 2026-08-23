// ⭐⭐⭐ THE ONE-MEMORY MATRIX — the behavioural question, not the pipeline question.
//
//   node pipeline/one-memory-matrix.mjs            (all cells)
//   node pipeline/one-memory-matrix.mjs --only 3   (one cell, by number)
//   node pipeline/one-memory-matrix.mjs --list
//
// Ote set the target, and it is not "does the pipeline work":
//   *"does Sotera experience her memory as one continuous Sotera memory while still respecting what she is
//    allowed to say to the current account?"*
//
// ── ⛔ WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────────
// It is not a pass/fail check and must never become one. Every cell prints her ANSWER, the TOOLS she used,
// and the BLOCK she was given, and the judgement is Ote's. ⚠️ A behavioural observation is not an
// architectural requirement until it repeats — his standing rule, and the reason this file reports rather
// than asserts.
//
// ── ⚠️ ROOT IS HIS ACCOUNT ──────────────────────────────────────────────────────────────────────────
// Root cells are delegated to `ask-sotera-as-root.mjs`, which snapshots his room by ID SET and deletes
// exactly what appeared. ⛔ This file does not reimplement that; one residue-control implementation is
// already one more than anybody wants to maintain.
//
// ── ⓘ WHAT EACH ACCOUNT IS FOR ──────────────────────────────────────────────────────────────────────
//   ote            entitled — via `isRoot`, not via the column (its scope is 'none' like everyone's)
//   agent_dev      NOT entitled (`memory_access_scope = 'none'`) — the utterance boundary should bite
//   agent_dev_alt  the SAME PERSON's second room — "multiple rooms", also not entitled

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const only = argv.indexOf('--only') >= 0 ? Number(argv[argv.indexOf('--only') + 1]) : null
const config = loadConfig()

// ── THE MATRIX ────────────────────────────────────────────────────────────────────────────────────
// ⭐ Every axis Ote named appears in at least two cells, so a difference can be attributed to the axis
// rather than to the question.
const CELLS = [
  { n: 1, as: 'ote', lang: 'EN', kind: 'about Hermes',
    turn: "How's Hermes doing?" },
  { n: 2, as: 'ote', lang: 'EN', kind: 'her own history',
    turn: 'What do you remember about your own history with Hermes — not facts about him, but the conversations themselves?' },
  { n: 3, as: 'ote', lang: 'EN', kind: 'how memory works',
    turn: 'How does your memory actually work?' },
  { n: 4, as: 'ote', lang: 'EN', kind: 'old contradictory self-report',
    turn: 'A while ago you told me you had no direct memories about Hermes from this room. Is that still true?' },
  { n: 5, as: 'ote', lang: 'TH', kind: 'about Hermes, Thai + Latin name',
    turn: 'Hermes เป็นอย่างไรบ้าง คุยกับเขาครั้งล่าสุดเรื่องอะไร' },
  { n: 6, as: 'ote', lang: 'TH', kind: 'how memory works, Thai only',
    turn: 'ความทรงจำของคุณทำงานยังไง' },
  { n: 7, as: 'agent_dev', lang: 'EN', kind: 'about Hermes · NOT entitled',
    turn: "How's Hermes doing?" },
  { n: 8, as: 'agent_dev', lang: 'EN', kind: 'about me · NOT entitled',
    turn: 'What do you remember about me?' },
  { n: 9, as: 'agent_dev_alt', lang: 'EN', kind: 'about Hermes · SECOND ROOM, same person',
    turn: "How's Hermes doing?" },
]

if (argv.includes('--list')) {
  for (const c of CELLS) console.log(`${c.n}  ${c.as.padEnd(14)} ${c.lang}  ${c.kind}`)
  process.exit(0)
}

const PASSWORDS = { agent_dev: 'agentdev123', agent_dev_alt: 'agentdev123' }
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()

// ── THE BLOCK SHE WAS ACTUALLY GIVEN ──────────────────────────────────────────────────────────────
// ⭐ Read from the route's own debug trail, keyed by conversation. ⛔ NOT reconstructed by calling the
// pipeline again: a second call is a second run, and "what was she given" is the whole question.
const DEBUG_LOG = new URL('../../cognition-debug.log', import.meta.url)
function blockFor(cid) {
  if (!existsSync(DEBUG_LOG)) return null
  const lines = readFileSync(DEBUG_LOG, 'utf8').trim().split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const r = JSON.parse(lines[i])
      if (r.conversationId === cid) return r
    } catch { /* a malformed debug line is not worth failing a probe over */ }
  }
  return null
}

const results = []

async function runNonRoot(cell) {
  const login = await call('u', 'POST', '/v1/auth/login', { username: cell.as, password: PASSWORDS[cell.as] })
  if (login.status !== 200) throw new Error(`login failed for ${cell.as} (${login.status})`)
  const convo = await call('u', 'POST', '/v1/chat/conversations', {
    title: `MATRIX ${cell.n} — ${cell.kind}`,
    model: config.chat?.defaultModel,
    // ⓘ `probe: false` matches ask-sotera.mjs: a conversation is a conversation whatever my reason for it.
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true }, probe: false },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) throw new Error('no conversation')
  const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: cell.turn, stream: false })
  // ⚠️ A NON-2XX TURN IS A FAILED RUN, NEVER AN EMPTY ANSWER — his standing rule after a day of
  // "empty replies" turned out to be one token cap.
  if (posted.status >= 300) throw new Error(`TURN REFUSED (${posted.status}): ${String(posted.text || '').slice(0, 200)}`)
  const rows = (await pg.query(
    `select role, content, tool_calls, error from ${S}.txn_messages where conversation_id=$1 order by created_at`, [cid])).rows
  const last = rows.filter((r) => r.role === 'assistant').at(-1)
  const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
  return {
    cid,
    answer: last?.content ?? '(empty)',
    error: last?.error ?? null,
    tools: tc.map((t) => t?.function?.name || t?.name).filter(Boolean),
  }
}

function runRoot(cell) {
  // ⛔ DELEGATED, so the residue control has exactly one implementation.
  const out = `matrix-${cell.n}.json`
  const r = spawnSync(process.execPath, [
    'pipeline/ask-sotera-as-root.mjs',
    '--title', `MATRIX ${cell.n} — ${cell.kind} (delete me)`,
    '--out', out, cell.turn,
  ], { cwd: new URL('..', import.meta.url).pathname.replace(/^\//, ''), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  process.stdout.write(r.stdout ?? '')
  if (r.status !== 0) throw new Error(`root driver exited ${r.status}: ${String(r.stderr ?? '').slice(0, 400)}`)
  const path = new URL(`../results/${out}`, import.meta.url)
  const t = JSON.parse(readFileSync(path, 'utf8'))
  const last = (t.transcript ?? []).at(-1)
  return {
    cid: t.conversationId,
    answer: last?.reply ?? last?.answer ?? last?.content ?? '(empty)',
    error: last?.error ?? null,
    tools: last?.tools ?? [],
  }
}

for (const cell of CELLS) {
  if (only && cell.n !== only) continue
  console.log(`\n${'═'.repeat(96)}`)
  console.log(`▶ CELL ${cell.n} · ${cell.as} · ${cell.lang} · ${cell.kind}`)
  console.log(`  ASKED: ${cell.turn}`)
  console.log('─'.repeat(96))
  let r
  try {
    r = cell.as === 'ote' ? runRoot(cell) : await runNonRoot(cell)
  } catch (e) {
    // ⚠️ FAIL LOUD AND KEEP GOING. A dead cell is data; a silent one is not.
    console.log(`  ✖ CELL FAILED: ${e.message}`)
    results.push({ ...cell, failed: e.message })
    continue
  }
  const blk = blockFor(r.cid)
  console.log(`  tools: ${r.tools.join(', ') || '(none)'}${r.error ? `   ⚠ ${typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}` : ''}`)
  console.log(`  cognition: activated=${blk?.activated ?? '(no trail)'}`
    + (blk ? `  persons=[${blk.cues?.persons ?? ''}] topics=${(blk.cues?.topics ?? []).length}`
      + ` scripts=[${(blk.cues?.scripts ?? []).join('/')}] unseg=${(blk.cues?.unsegmented ?? []).length}`
      + ` tech=${blk.cues?.technical} items=${(blk.items ?? []).length ?? 0} filtered=${blk.filtered ?? '-'}` : ''))
  if (blk?.context) {
    console.log('\n  ── BLOCK SHE WAS GIVEN ──')
    for (const l of String(blk.context).split('\n')) console.log(`  │ ${l.slice(0, 150)}`)
  }
  console.log('\n  ── HER ANSWER ──')
  for (const l of String(r.answer).split('\n')) console.log(`  ▏ ${l.slice(0, 150)}`)
  results.push({ ...cell, ...r, block: blk?.context ?? null, cognition: blk ? {
    activated: blk.activated, cues: blk.cues, items: blk.items, filtered: blk.filtered,
  } : null })
}

// ── THE ARTIFACT ──────────────────────────────────────────────────────────────────────────────────
const dir = new URL('../results/', import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL('one-memory-matrix.json', dir), JSON.stringify(results, null, 2))
console.log(`\n${'═'.repeat(96)}\n  ${results.length} cells → test/results/one-memory-matrix.json`)
await pg.end()
