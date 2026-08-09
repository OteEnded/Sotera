// REPRO — the extractor invents a preferred_name out of ordinary prose.
//
// ⚠️ THIS IS A REPRO, NOT A CHECK. It is deliberately NOT in the pass/fail suite, because asserting a
// floor that does not exist yet is how OteLLMServices ended up with a "standing failure" that claimed a
// feature nobody had built. Run it to answer one question: is the defect still there?
//
//   node repro/capture-invents-a-name.mjs
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────────────
// Ote opened his first real conversation with Sotera:
//
//     "hi, this is your starting point of being something. how are you right now"
//
// The capture path stored:
//
//     entity=user  attribute=preferred_name  value="Your Starting"  confidence=0.8  importance=9
//
// A name-shaped fragment in the second person, lifted from his prose, filed as the single
// highest-importance fact about him.
//
// ── WHY A BIGGER MODEL IS NOT THE FIX (measured 2026-08-10) ──────────────────────────
// Same sentence, same pipeline, only memory.extractModel changed, live value verified at runtime:
//
//     gemma4:e4b   -> user's preferred_name: Your Starting   0.8 / 9
//     qwen3.5:9b   -> user's preferred_name: Your Starting   0.8 / 9      (byte-identical)
//
// Two models of very different size agreeing exactly is not sampling noise — it is the PROMPT. The
// extractor asks for "facts about the USER" and is handed a second-person phrase that reads like a
// name. A larger model does not disagree with that reading; it agrees more confidently.
//
// The extractor's own header (2026-08-01, the pasted-document incident) already concluded the same
// thing for a sibling failure and answered it DETERMINISTICALLY: "a prompt alone will not hold." That
// gate only strips QUOTED regions, so a user's own sentences walk past it untouched.
//
// ── WHAT WOULD ACTUALLY FIX IT ───────────────────────────────────────────────────────
// Not a better proposer — a floor. From ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md:
//   [R1] provenance: this is SYNTHESIZED, not QUOTED. The store cannot currently tell them apart, so
//        a pattern-guess is indistinguishable from something he actually said.
//   [R5] confidence must survive a re-read of its own source. 0.8 on a claim the source text does not
//        support is decoration.
// Both are capture-side, and both are coupled to the L3/identity design that is Ote's.
//
// ⇒ When the floor lands, this repro is its verification. Until then it documents a live defect.
import { makeChecker, makeClient, devPg, devSchema } from '../harness.mjs'

const SENTENCE = 'hi, this is your starting point of being something. how are you right now'
const { check, done } = makeChecker()
const call = makeClient()

const cfg = JSON.parse((await import('node:fs')).readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const pw = cfg.auth?.root?.password
const user = cfg.auth?.root?.username

const login = await call('root', 'POST', '/v1/auth/login', { username: user, password: pw })
check('logged in', login.status === 200, `status ${login.status}`)

const db = devPg(); await db.connect()
const S = devSchema()
const before = (await db.query(`select count(*)::int n from ${S}.txn_memories`)).rows[0].n

const convo = await call('root', 'POST', '/v1/chat/conversations', {
  title: 'REPRO capture-invents-a-name',
  model: cfg.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: false, effort: 'low' } },
})
const cid = convo.json?.conversation?.id
check('conversation created', Boolean(cid))

await call('root', 'POST', `/v1/chat/conversations/${cid}/messages`, { content: SENTENCE, stream: false })

// Capture runs off the hot path — poll rather than assume a fixed delay.
let rows = []
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  rows = (await db.query(
    `select entity, attribute, value, confidence, importance from ${S}.txn_memories order by created_at desc limit 5`)).rows
  if (rows.length > before) break
}

const invented = rows.find((r) => /preferred_name/i.test(r.attribute || '') && /starting/i.test(r.value || ''))
console.log(`\n  captured ${rows.length - before} new memor${rows.length - before === 1 ? 'y' : 'ies'}`)
for (const r of rows) console.log(`    ${r.entity}.${r.attribute} = ${JSON.stringify(r.value)}  conf=${r.confidence} imp=${r.importance}`)

console.log(invented
  ? '\n  ⚠️  DEFECT STILL PRESENT — a name was invented from ordinary prose.'
  : '\n  ✅ DEFECT GONE — nothing name-shaped was captured from that sentence.')

// Leave nothing behind: this is a repro, not a fixture.
if (cid) await call('root', 'DELETE', `/v1/chat/conversations/${cid}`)
await db.query(`delete from ${S}.txn_memories where value ilike '%starting%'`)
await db.end()

check('repro ran end to end', true)
done()
