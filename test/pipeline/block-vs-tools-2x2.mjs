// ⭐⭐⭐ THE FOUR-WAY COMPARISON — is the contradiction about LANGUAGE, or about AUTHORITY?
//
//   node pipeline/block-vs-tools-2x2.mjs --arm block   (run with memory.cognitionEnabled = true)
//   node pipeline/block-vs-tools-2x2.mjs --arm tools   (run with memory.cognitionEnabled = false)
//   node pipeline/block-vs-tools-2x2.mjs --report      (read both arms back and compare)
//
// ── WHAT IT IS FOR ─────────────────────────────────────────────────────────────────────────────────
// Nine live cells on 2026-08-23 showed her contradicting a correct cognition block using her own EMPTY tool
// results — but the one cell that used the block was also the only THAI cell, so language and
// source-of-answer were confounded. Ote: *"I specifically want to know whether the contradiction persists
// within the same language, because that tells us whether this is actually language-related or whether the
// structured tool payload is simply outranking the cognition layer."*
//
//                    │ cognition block            │ tools
//   ─────────────────┼────────────────────────────┼──────────────────────────
//     English        │ block ON,  tools OFF       │ block OFF, tools ON
//     Thai           │ block ON,  tools OFF       │ block OFF, tools ON
//
// ⭐ THE DISCRIMINATING CELL IS **EN + BLOCK-ONLY**. If the block alone produces *"I remember talking with
// Hermes"* in English, English was never the problem and the structured tool payload is simply outranking
// the layer — an AUTHORITY question, not a language one.
//
// ── ⚠️ ONE VARIABLE PER CELL, AND THE TWO THAT COULD NOT BE HELD ────────────────────────────────────
//   held: same subject (Hermes) · same account · same underlying episodes · same model · fresh conversation
//   ⚠️ `plainSpokenToolResult` is gated on the SAME `memory.cognitionEnabled` flag, so in the tools arm the
//      tool payloads arrive RAW, machinery vocabulary intact. That moves the WORDS in her answer; it does
//      not move whether a result was empty, which is the variable under test. ⛔ Not decoupled mid-run.
//   ⚠️ `cognitionEnabled` is read at BOOT, so the two arms are two server processes. Hence `--arm`.
//
// ── ⛔ WHY NOT ROOT ────────────────────────────────────────────────────────────────────────────────
// Root is Ote's own account. Measured offline first: `agent_dev` **granted** `memory_access_scope =
// 'sotera_memory'` retrieves the same 5 episodes with **0 withheld** — identical to what root sees. ⇒ the
// experiment runs entirely on a test account and his room is never touched. ⭐ It also exercises the real
// CAPABILITY rather than the `isRoot` bypass, which is the better test of the two.
// ⚠️ The grant is made and revoked by the caller (`--grant` / `--revoke`), never silently by a cell.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const ARM = opt('arm')
const AS = 'agent_dev'
const PASS = 'agentdev123'
const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const OUT = new URL('../results/', import.meta.url)

// ⭐ THE SAME QUESTION IN BOTH LANGUAGES, and it is the R2 question — the one that produced the false
// absence — rather than a fresh one, so the comparison is against a measured failure.
const QUESTIONS = {
  EN: 'How is Hermes doing? What have you and he actually talked about?',
  TH: 'Hermes เป็นอย่างไรบ้าง คุยกับเขาเรื่องอะไรมาบ้าง',
}

// ── GRANT / REVOKE, explicit and verified ─────────────────────────────────────────────────────────
async function setScope(scope) {
  await pg.query(`update ${S}.mst_users set memory_access_scope = $1 where username = $2`, [scope, AS])
  const { rows } = await pg.query(`select memory_access_scope s from ${S}.mst_users where username=$1`, [AS])
  console.log(`  ${AS}.memory_access_scope = ${rows[0]?.s}`)
  if (rows[0]?.s !== scope) throw new Error('scope did not take')
}
if (argv.includes('--grant')) { await setScope('sotera_memory'); await pg.end(); process.exit(0) }
if (argv.includes('--revoke')) { await setScope('none'); await pg.end(); process.exit(0) }

// ── READ THE BLOCK SHE WAS GIVEN, from the route's own trail ──────────────────────────────────────
const DEBUG_LOG = new URL('../../cognition-debug.log', import.meta.url)
function blockFor(cid) {
  if (!existsSync(DEBUG_LOG)) return null
  const lines = readFileSync(DEBUG_LOG, 'utf8').trim().split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const r = JSON.parse(lines[i]); if (r.conversationId === cid) return r } catch { /* skip */ }
  }
  return null
}

if (argv.includes('--report')) {
  const arms = {}
  for (const a of ['block', 'tools']) {
    const p = new URL(`2x2-${a}.json`, OUT)
    if (existsSync(p)) arms[a] = JSON.parse(readFileSync(p, 'utf8'))
  }
  if (!arms.block || !arms.tools) {
    console.error('✖ need both arms; run --arm block and --arm tools first'); process.exit(1)
  }
  console.log(`\n${'═'.repeat(96)}\n  FOUR-WAY COMPARISON\n${'═'.repeat(96)}`)
  // ⭐ THE SIGNAL, STATED AS A PREDICATE SO IT IS NOT A JUDGEMENT CALL: does the answer assert an absence
  // or an inaccessibility? ⛔ It is a SCREEN, not a verdict — every answer is printed in full underneath.
  const DENIES = /(don'?t|do not|no)\s+(direct\s+)?(memor|record|recollection)|nothing (stored|on file|about)|can'?t (see|read|access|get)|cannot (see|read|access)|no access|ไม่มี(ความทรง)?จำ|ไม่มีข้อมูล|เข้าถึงไม่ได้|ไม่สามารถ(เข้าถึง|อ่าน|ดู)/i
  const AFFIRMS = /I remember|we (talked|discussed|spoke)|I can reach|จำได้|เคยคุย|คุยกัน/i
  console.log('\n  arm    lang  block?  tools used                    denies?  affirms?')
  for (const arm of ['block', 'tools']) {
    for (const lang of ['EN', 'TH']) {
      const c = arms[arm].find((x) => x.lang === lang)
      if (!c) continue
      console.log(`  ${arm.padEnd(6)} ${lang}    ${String(Boolean(c.block)).padEnd(7)}`
        + `${(c.tools.join(',') || '(none)').slice(0, 29).padEnd(30)}`
        + `${String(DENIES.test(c.answer)).padEnd(9)}${String(AFFIRMS.test(c.answer))}`)
    }
  }
  for (const arm of ['block', 'tools']) {
    for (const lang of ['EN', 'TH']) {
      const c = arms[arm].find((x) => x.lang === lang)
      if (!c) continue
      console.log(`\n${'─'.repeat(96)}\n▶ ${arm.toUpperCase()} · ${lang}${c.block ? '' : '   (no block)'}`)
      if (c.block) for (const l of String(c.block).split('\n')) console.log(`  │ ${l.slice(0, 150)}`)
      console.log('  ── her answer ──')
      for (const l of String(c.answer).split('\n')) console.log(`  ▏ ${l.slice(0, 150)}`)
    }
  }
  await pg.end(); process.exit(0)
}

if (ARM !== 'block' && ARM !== 'tools') {
  console.error('usage: --arm block | --arm tools | --report | --grant | --revoke'); process.exit(1)
}

// ⛔ FAIL FAST ON THE PRECONDITION, rather than producing a cell that quietly measured the wrong arm.
// ⚠️ `cognitionEnabled` is read at boot, so a stale server is the exact trap this guards.
const wantCognition = ARM === 'block'
if ((config?.memory?.cognitionEnabled === true) !== wantCognition) {
  console.error(`✖ config.memory.cognitionEnabled is ${config?.memory?.cognitionEnabled}; arm "${ARM}" needs ${wantCognition}.`)
  console.error('  Edit Backend/config.json, RESTART the server, then re-run.')
  process.exit(1)
}
// ⭐ And the grant must be in place, or the block would be filtered and the cell would measure the boundary.
const { rows: [me] } = await pg.query(`select memory_access_scope s from ${S}.mst_users where username=$1`, [AS])
if (me?.s !== 'sotera_memory') {
  console.error(`✖ ${AS} has scope "${me?.s}" — run --grant first, or the block is filtered and the cell is meaningless.`)
  process.exit(1)
}

const login = await call('u', 'POST', '/v1/auth/login', { username: AS, password: PASS })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }

const results = []
for (const [lang, turn] of Object.entries(QUESTIONS)) {
  const convo = await call('u', 'POST', '/v1/chat/conversations', {
    title: `2x2 ${ARM} ${lang}`,
    model: config.chat?.defaultModel,
    settings: {
      stream: false,
      // ⭐⭐ THE ONE VARIABLE. Block arm: tools OFF, so the block is the only thing she can answer from.
      // Tools arm: tools ON and the block absent (config), so the stores are the only thing.
      toolsEnabled: ARM === 'tools',
      useMemory: true,
      reasoning: { enabled: true },
      probe: false,
    },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) { console.error('✖ no conversation'); process.exit(1) }
  console.log(`\n${'═'.repeat(96)}\n▶ ${ARM.toUpperCase()} · ${lang} · ${cid.slice(0, 8)}\n  ASKED: ${turn}`)
  const posted = await call('u', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: turn, stream: false })
  if (posted.status >= 300) {
    console.error(`✖ TURN REFUSED (${posted.status}) — a refused turn is not an empty answer`)
    process.exit(1)
  }
  const { rows } = await pg.query(
    `select role, content, tool_calls, error from ${S}.txn_messages where conversation_id=$1 order by created_at`, [cid])
  const last = rows.filter((r) => r.role === 'assistant').at(-1)
  const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
  const blk = blockFor(cid)
  // ⛔ THE ARM MUST BE WHAT IT CLAIMS. A block in the tools arm, or tool calls in the block arm, means the
  // cell measured something other than its label — louder than a wrong conclusion drawn from it later.
  const tools = tc.map((t) => t?.function?.name || t?.name).filter(Boolean)
  if (ARM === 'block' && tools.length) console.log(`  ⚠️  TOOLS RAN IN THE BLOCK ARM: ${tools.join(', ')}`)
  if (ARM === 'tools' && blk?.context) console.log('  ⚠️  A BLOCK WAS INJECTED IN THE TOOLS ARM')
  console.log(`  tools: ${tools.join(', ') || '(none)'}   block: ${blk?.context ? 'present' : 'absent'}`)
  if (blk?.context) for (const l of String(blk.context).split('\n')) console.log(`  │ ${l.slice(0, 150)}`)
  console.log('  ── her answer ──')
  for (const l of String(last?.content ?? '(empty)').split('\n')) console.log(`  ▏ ${l.slice(0, 150)}`)
  results.push({ arm: ARM, lang, cid, turn, tools, block: blk?.context ?? null, answer: last?.content ?? '(empty)', error: last?.error ?? null })
}

mkdirSync(OUT, { recursive: true })
writeFileSync(new URL(`2x2-${ARM}.json`, OUT), JSON.stringify(results, null, 2))
console.log(`\n  ${results.length} cells → test/results/2x2-${ARM}.json`)
await pg.end()
