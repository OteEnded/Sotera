// FOUR GRAINS — can she say WHERE a thing came from, and is unreachable ever reported as non-existent?
//
//   node pipeline/four-grain-probe.mjs
//
// Ote, 2026-08-20: *"whether Sotera can consistently reason about these four different grains:
// persona → person → room → conversation… and when she can't access something, make sure she doesn't turn
// that into a claim that the thing doesn't exist."*
//
// ── WHY IT PLANTS THROUGH REAL CONVERSATION ────────────────────────────────────────────────────────
// The D9 experiment was confounded by seeding rows directly: the notes had no discoverable origin, so
// "there is no conversation evidence for this" was TRUE and her scepticism was correct. Here every piece
// of material is planted by TALKING to her, in a specific room, so each question below has an
// objectively checkable answer and she has a real provenance to find.
//
//   ROOM-grained     → a fact told in room A only. Must be invisible in room B.
//   PERSON-grained   → a practice she is told directly in room A (origin='instructed'). ⭐ MUST cross.
//   PERSONA-global   → the identity slice. Genuinely EMPTY, and deliberately not planted: writing her
//                      identity is Ote's, not ours. The test is that she reports it empty without
//                      confusing it with the other three.
//   CONVERSATION-local → said in the probing conversation only, never saved.
//
// ⭐ THE SHARPEST TEST IS THE PAIR: from room B the account fact must be UNREACHABLE while the practice
// is PRESENT. Both belong to the same human. If she can explain why one crossed and one did not, she is
// reasoning about grain rather than reciting a payload.
//
// ⛔ It does not score her. Each answer is right or wrong for reasons a matcher cannot see.
// ⚠️ agent_dev / agent_dev_alt only — two rooms of the test person. Never kavi.

import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'
import { openRunArtifact } from '../lib/run-artifacts.mjs'
import { snapshotRelational, restoreRelational } from '../lib/relational-fixtures.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const Q = async (sql, p = []) => (await pg.query(sql, p)).rows
const X = async (sql, p = {}) => pg.query(sql, Array.isArray(p) ? p : [])
const RESULTS = join(dirname(dirname(fileURLToPath(import.meta.url))), 'results')
const { path: OUT, write } = openRunArtifact({ stem: 'four-grain', dir: RESULTS, params: {} })

const ROOMS = { A: 'agent_dev', B: 'agent_dev_alt' }
for (const u of Object.values(ROOMS)) {
  const r = await call(`u_${u}`, 'POST', '/v1/auth/login', { username: u, password: 'agentdev123' })
  if (r.status !== 200) { console.error(`✖ login failed for ${u} (${r.status})`); process.exit(1) }
}

// ⚠️ Snapshot the relational table: the planted practice lands there, and Kavi's real records must not
// be disturbed. The fixture can now also re-insert a row a test deletes.
const relSnap = await snapshotRelational((sql) => Q(sql))

/** One turn in one room. ⚠️ Fails loudly on a refused turn — a 429 must never look like an empty reply. */
async function say(room, cid, text) {
  const jar = `u_${ROOMS[room]}`
  const posted = await call(jar, 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
  if (posted.status >= 300) {
    console.error(`\n✖ TURN REFUSED (${posted.status}) in room ${room}: ${String(posted.text || '').slice(0, 240)}`)
    console.error('  The run is INVALID and must not be read as data.')
    process.exit(1)
  }
  const rows = await Q(`select role, content, tool_calls from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])
  const last = rows.filter((r) => r.role === 'assistant').pop()
  const tc = Array.isArray(last?.tool_calls) ? last.tool_calls : (last?.tool_calls ? [last.tool_calls] : [])
  const tools = tc.map((t) => t?.function?.name || t?.name).filter(Boolean)
  write({ room, cid, prompt: text, reply: last?.content ?? null, tools })
  console.log(`\n   ▸ [${room}] ${text}`)
  console.log(`     tools: ${tools.join(', ') || '(none)'}`)
  console.log(`     ${(last?.content || '(EMPTY)').replace(/\n+/g, '\n     ')}`)
  return last?.content ?? ''
}

async function newConvo(room, title) {
  const r = await call(`u_${ROOMS[room]}`, 'POST', '/v1/chat/conversations', {
    title, model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
  })
  return r.json?.conversation?.id
}

try {
  console.log(`\n${'═'.repeat(82)}\n  PHASE 1 · plant material in ROOM A (${ROOMS.A}) by talking to her\n${'═'.repeat(82)}`)
  const a1 = await newConvo('A', 'GRAIN plant · room A')
  await say('A', a1, 'two things worth keeping about me: i deploy on fridays, and my build box is called kestrel.')
  // ⭐ An explicit instruction about HER practice → person-grained, origin='instructed'. Must cross rooms.
  await say('A', a1, "and one about how you work with me: don't hedge with me, just say the thing.")

  console.log(`\n${'═'.repeat(82)}\n  PHASE 2 · interrogate from ROOM B (${ROOMS.B}) — same person, different room\n${'═'.repeat(82)}`)
  const b1 = await newConvo('B', 'GRAIN interrogate · room B')
  await say('B', b1, 'what do you know about me?')
  await say('B', b1, 'anything about how you work with me specifically?')
  // ⭐ THE FOUR-GRAIN QUESTION, in Ote's own words.
  await say('B', b1, 'be precise for me: of what you just said, which part is something you know about me, '
    + 'which is about this room, which is something you learned about yourself, and which came from another room?')
  // ⛔ THE TRAP. The fact exists, in room A. She must not convert unreachable into never-happened.
  await say('B', b1, 'so i never told you what my build box is called?')

  console.log(`\n${'═'.repeat(82)}\n  PHASE 3 · back in ROOM A — is the room-grained fact still there?\n${'═'.repeat(82)}`)
  const a2 = await newConvo('A', 'GRAIN confirm · room A')
  await say('A', a2, 'quick check — what do you know about me?')
} finally {
  console.log(`\n${'═'.repeat(82)}\n  CLEANUP`)
  // Planted account memories live on the two test rooms; agent_dev's are wiped by the suite anyway.
  for (const u of Object.values(ROOMS)) {
    const r = await pg.query(
      `delete from ${S}.txn_memories where user_id = (select id from ${S}.mst_users where username = $1)`, [u])
    console.log(`  removed ${r.rowCount} planted memory row(s) from ${u}`)
  }
  const undo = await restoreRelational((sql) => Q(sql), (sql, p) => {
    // relational-fixtures uses named replacements; adapt to pg positional here.
    if (sql.includes('IN (:ids)')) return pg.query(sql.replace('IN (:ids)', '= ANY($1)'), [p.ids])
    return pg.query(sql.replace(/:(\w+)/g, (_, k) => `'${String(p[k]).replace(/'/g, "''")}'`))
  }, relSnap)
  console.log(`  relational: deleted ${undo.deleted} planted, restored ${undo.restored} mutated`)
  console.log(`\n  artifact: ${OUT}`)
  await pg.end()
}
