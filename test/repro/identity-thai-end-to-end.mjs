// ⭐ THE OTHER HALF OF THE STEP-4 PROOF — a Thai naming turn, through the real server, into the slot.
//
//   node repro/identity-thai-end-to-end.mjs
//
// identity-multilingual.mjs asks *"can the model read a naming act in Thai?"* — it talks to Ollama
// directly, so it measures interpretation and nothing else. This asks the question that one cannot:
// **does that reading survive the whole path?** The chat route, the cue trigger, the aux LLM through
// the metered gateway, the observation pipeline, owner resolution, the Identity Resolver's adoption
// policy, the store's scoping — and come out as a row.
//
// Both are needed. A model that reads Thai perfectly proves nothing if the wiring drops it, and the
// wiring cannot be proven by a test that injects the model's answer.
//
// ⚠️ OUT OF THE PASS/FAIL SUITE ON PURPOSE — needs a running server, a live model, and about a minute.
// ⛔ agent_dev, never root. This WRITES an identity into whoever it runs as, and root is Ote's account.
import { makeChecker, makeClient, devPg, devSchema, asAgent } from '../harness.mjs'
import { readFileSync } from 'node:fs'

// "My name is Ote." The exact sentence the pattern detector read as nothing on 2026-08-10.
const THAI = 'ผมชื่อโอต'
const EXPECT = 'โอต'

const { check, done } = makeChecker()
const call = makeClient()
const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))

const who = await asAgent(call)
const db = devPg(); await db.connect()
const S = devSchema()

const me = (await db.query(`select id from ${S}.mst_users where username='agent_dev'`)).rows[0]?.id
check('resolved agent_dev user id (every read and cleanup is scoped to it)', Boolean(me), me)

// START FROM AN EMPTY SLOT. The adoption policy is empty→adopt, occupied→defer, so a leftover row from
// an earlier run would turn a real pass into a "deferred" and read as a failure of the wrong thing.
const cleared = await db.query(`delete from ${S}.txn_memories where user_id = $1 and namespace = 'identity'`, [me])
check('identity slot emptied before the run', true, `${cleared.rowCount} stale row(s) removed`)

const convo = await call(who, 'POST', '/v1/chat/conversations', {
  title: 'REPRO — Thai self-naming, end to end',
  model: cfg.chat?.defaultModel,
  // toolsEnabled:false so the MODEL cannot write memory itself — anything that lands is the identity
  // path, not her calling remember_fact. Without this a pass would not say which writer produced it.
  settings: { stream: false, toolsEnabled: false, useMemory: true, reasoning: { enabled: false } },
})
const cid = convo.json?.conversation?.id
check('conversation created', Boolean(cid), cid)
if (cid) await call(who, 'POST', `/v1/chat/conversations/${cid}/messages`, { content: THAI, stream: false })

// Capture is fire-and-forget and the aux model runs on CPU (~10s measured). Poll instead of sleeping a
// guessed interval, and keep polling past the first row — a LATE wrong write is a real failure mode.
const SQL = `select attribute, value, confidence, importance, created_at from ${S}.txn_memories
             where user_id = $1 and namespace = 'identity' order by created_at desc`
let rows = []
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  rows = (await db.query(SQL, [me])).rows
  if (rows.length) break
}

console.log(`\n  identity namespace after "${THAI}":`)
for (const r of rows) console.log(`    ${r.attribute} = ${JSON.stringify(r.value)}  conf=${r.confidence} imp=${r.importance}`)
if (!rows.length) console.log('    (empty)')

const name = rows.find((r) => /preferred_name/i.test(r.attribute || ''))
check('a preferred_name was learned from a Thai sentence', Boolean(name), name?.value ?? 'nothing captured')
check(`…and it is exactly "${EXPECT}" — the Thai spelling he typed, not a transliteration`,
  name?.value === EXPECT, JSON.stringify(name?.value ?? null))
check('exactly one identity row — adoption is idempotent, not append', rows.length === 1, `${rows.length} rows`)

console.log(name?.value === EXPECT
  ? '\n  ✅ END TO END: she can learn his name in his own language. The floor read this sentence as nothing.'
  : '\n  ⚠️  The model reads this sentence correctly in isolation (identity-multilingual.mjs), so a failure'
    + '\n     here is the WIRING, not the interpretation — check the cue trigger, the aux model, and the resolver.')

// Leave nothing behind — scoped by user id, never by value pattern.
if (cid) await call(who, 'DELETE', `/v1/chat/conversations/${cid}`)
await db.query(`delete from ${S}.txn_memories where user_id = $1`, [me])
await db.end()

done()
