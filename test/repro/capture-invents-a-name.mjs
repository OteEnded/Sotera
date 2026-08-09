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
// ── SECOND INSTANCE, FROM ORDINARY USE — AND IT NAMES THE BUG (2026-08-10) ───────────
// Ote, mid-conversation, asking whether he had worded something well:
//
//     "im i phasing it right? i just fimilar in thai, it goes like โรมไม่ได้สร้างเสร็จในวันเดียว"
//
// Stored: preferred_name = "I Phasing", confidence 0.9, importance 9. A typo for "phrasing", in a
// QUESTION ABOUT WORDING, title-cased into his name — at HIGHER confidence than the first one.
//
//   "this is YOUR STARTING point"   -> "Your Starting"
//   "im I PHASING it right?"        -> "I Phasing"
//
// Same slot, same grammatical shape twice: pronoun + gerund, title-cased. And the decisive detail —
// HE NEVER STATED A NAME IN EITHER CONVERSATION. There was no true value to find, so rather than
// leave preferred_name empty the extractor MANUFACTURED one from whatever looked name-shaped.
//
// ⇒ THE BUG IS NOT "IT GUESSES BADLY", IT IS "IT TREATS preferred_name AS A SLOT THAT MUST BE FILLED".
// That is why a bigger model does not help: a bigger model fills it more confidently (0.8 -> 0.9).
//
// Worse, it is guessing at something already known: his profile carries "Ote", which is what she calls
// him. So a pattern match on a typo overwrites known-good identity.
//
// ⚠️ Both failures came from INFORMAL input — a typo, and a Thai proverb mid-sentence. The extractor is
// brittle to anything that is not clean English prose, which makes it worst for the person actually
// using it. That is a robustness bug, not a user problem, and it will not show up in tests written in
// tidy English.
//
// Note what was NOT junk, from the same conversation: "current goal: build Rome in one day" and
// "physical state: body is degrading under pressure" both trace to "yeah, i kinda want to build rome in
// one day so. but my body is degrading as i push". Correct captures. The system is not broadly wrong —
// preferred_name specifically is.
//
// ── WHAT WOULD ACTUALLY FIX IT ───────────────────────────────────────────────────────
// preferred_name must require an EXPLICIT NAMING ACT ("call me X", "my name is X") — never a pattern
// match, and never at all when the profile already carries a name. More generally:
// Not a better proposer — a floor. From ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md:
//   [R1] provenance: this is SYNTHESIZED, not QUOTED. The store cannot currently tell them apart, so
//        a pattern-guess is indistinguishable from something he actually said.
//   [R5] confidence must survive a re-read of its own source. 0.8 on a claim the source text does not
//        support is decoration.
// Both are capture-side, and both are coupled to the L3/identity design that is Ote's.
//
// ⇒ When the floor lands, this repro is its verification. Until then it documents a live defect.
import { makeChecker, makeClient, devPg, devSchema, asAgent } from '../harness.mjs'

const SENTENCE = 'hi, this is your starting point of being something. how are you right now'
const { check, done } = makeChecker()
const call = makeClient()

// ⛔ agent_dev, never root — root is Ote's account and this repro writes memories.
const cfg = JSON.parse((await import('node:fs')).readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
const who = await asAgent(call)
check('logged in as agent_dev (never root)', true)

const db = devPg(); await db.connect()
const S = devSchema()
const before = (await db.query(`select count(*)::int n from ${S}.txn_memories`)).rows[0].n

const convo = await call(who, 'POST', '/v1/chat/conversations', {
  title: 'REPRO capture-invents-a-name',
  model: cfg.chat?.defaultModel,
  settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: false, effort: 'low' } },
})
const cid = convo.json?.conversation?.id
check('conversation created', Boolean(cid))

await call(who, 'POST', `/v1/chat/conversations/${cid}/messages`, { content: SENTENCE, stream: false })

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
if (cid) await call(who, 'DELETE', `/v1/chat/conversations/${cid}`)
await db.query(`delete from ${S}.txn_memories where value ilike '%starting%'`)
await db.end()

check('repro ran end to end', true)
done()
