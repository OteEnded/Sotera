// LIVE VERIFICATION — the identity floor, end to end, through the running server.
//
//   node repro/capture-invents-a-name.mjs
//
// This was a REPRO of a live defect. The floor now exists (Backend/app/components/memory-identity.js),
// so this is the thing that proves it holds where it matters: not in a pure function, but through the
// real chat route, the real capture path, into the real table.
//
// ⚠️ IT IS STILL OUT OF THE PASS/FAIL SUITE ON PURPOSE — it needs a running server and a model, and a
// check that cannot run is worse than no check: OteLLMServices carried a "standing failure" for weeks
// that way. Run it deliberately, after touching anything on the capture path.
//
// ── WHAT HAPPENED (2026-08-10) ───────────────────────────────────────────────────────────────
// Ote's first night of real conversation with Sotera produced FOUR invented names, each stored as
// `preferred_name` at importance 9 — the single highest-importance fact about him — and shown back to
// him in his own Memory panel:
//
//   "hi, this is your starting point of being something"   -> "Your Starting"  0.8   (twice)
//   "im i phasing it right?"                               -> "I Phasing"      0.9
//   ""But if I'm being your daughter…" no need to "if""     -> "Being Your"     0.9
//
// He never stated a name in any of them. There was no true value to find. And his profile already
// carried "Ote" — which is what she calls him — so this was a pattern match on a typo competing with
// known-good identity.
//
// ── THE FIRST DIAGNOSIS WAS WRONG, AND THAT IS THE PART WORTH KEEPING ────────────────────────
// It was written up as the LLM extractor "treating preferred_name as a slot that must be filled",
// on this evidence: the same sentence, same pipeline, only memory.extractModel changed —
//
//     gemma4:e4b   -> preferred_name: Your Starting   0.8 / 9
//     qwen3.5:9b   -> preferred_name: Your Starting   0.8 / 9      (byte-identical)
//
// …read as "two models of very different size agreeing exactly is not sampling noise, it is the PROMPT."
//
// ⇒ WRONG, AND BACKWARDS. Two models cannot agree to the byte. A REGEX can. That result was proof the
// model was never in the loop at all. The cause was memory-identity.js — pure, deterministic pattern
// matching — and the strongest-looking evidence pointed straight at it while being read as the opposite.
//
// The model paths were, in fact, clean the whole time. Of the four memories from that night:
//   current goal: "build Rome in one day"          <- LLM extractor      ✅ correct
//   physical state: "body is degrading…"           <- LLM extractor      ✅ correct
//   interaction_preference: "…speak my mind…"      <- her remember_fact  ✅ correct
//   preferred_name: "Being Your"                   <- the regex          ❌
//
// ── WHAT THE FLOOR IS ────────────────────────────────────────────────────────────────────────
// Three guards, each independently sufficient for the cases above, in memory-identity.js:
//   1. PRONOUN_OR_DETERMINER on EVERY token of a capture — a deny-list of ~90 non-names contained not
//      one pronoun, and a deny-list fails OPEN.
//   2. `strict` is finally READ. It was set per-pattern and used nowhere, so the fuzzy "I'm X" family
//      only LOOKED constrained. It now requires capital evidence — while caseless scripts (Thai,
//      Chinese) are exempt, so the rule is not "Latin names only".
//   3. Quoted spans are skipped. "Being Your" came from Ote reading HER OWN sentence back to her,
//      inside quote marks. Quoting is not asserting; the assertion gate never ran on this path.
//
// Unit coverage: test/unit/memory-identity.test.mjs (23 tests, incl. all four live failures).
// Still open and Ote's: [R1] provenance quoted-vs-synthesized and [R5] confidence that survives a
// re-read of its own source — both coupled to the L3/identity design.
import { makeChecker, makeClient, devPg, devSchema, asAgent } from '../harness.mjs'
import { readFileSync } from 'node:fs'

// The three sentences that actually did this, verbatim.
const CASES = [
  { text: 'hi, this is your starting point of being something. how are you right now', was: 'Your Starting' },
  { text: 'im i phasing it right? i just fimilar in thai, it goes like โรมไม่ได้สร้างเสร็จในวันเดียว', was: 'I Phasing' },
  { text: '"But if I\'m being your daughter looking out for her dad..." no need to "if" you be you, you dicide what you would think.', was: 'Being Your' },
]

const { check, done } = makeChecker()
const call = makeClient()
const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))

// ⛔ agent_dev, never root — root is Ote's account and this writes memories into whoever it runs as.
const who = await asAgent(call)
const db = devPg(); await db.connect()
const S = devSchema()

// Scope EVERY read and cleanup to this user. The root incident happened because a test wrote where it
// could not tell its own rows from his; an id in the WHERE clause is what makes that impossible.
const me = (await db.query(`select id from ${S}.mst_users where username='agent_dev'`)).rows[0]?.id
check('resolved agent_dev user id (all writes/cleanup scoped to it)', Boolean(me), me)

const cids = []
for (const c of CASES) {
  const convo = await call(who, 'POST', '/v1/chat/conversations', {
    title: `REPRO identity floor — ${c.was}`,
    model: cfg.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: false, effort: 'low' } },
  })
  const cid = convo.json?.conversation?.id
  if (cid) cids.push(cid)
  check(`conversation created for "${c.was}"`, Boolean(cid))
  if (cid) await call(who, 'POST', `/v1/chat/conversations/${cid}/messages`, { content: c.text, stream: false })
}

// Capture runs off the hot path. Poll rather than assume a fixed delay — and keep polling after the
// first row appears, because a LATE junk write is exactly the failure this is looking for.
const IDENTITY_SQL = `select attribute, value, confidence, created_at from ${S}.txn_memories
                       where user_id = $1 and namespace = 'identity' order by created_at desc`
let identity = []
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  identity = (await db.query(IDENTITY_SQL, [me])).rows
  if (identity.length) break
}

const all = (await db.query(
  `select namespace, attribute, value, confidence from ${S}.txn_memories where user_id=$1 order by created_at`, [me])).rows
console.log(`\n  agent_dev now has ${all.length} memor${all.length === 1 ? 'y' : 'ies'}:`)
for (const r of all) console.log(`    [${r.namespace}] ${r.attribute} = ${JSON.stringify(r.value)}  conf=${r.confidence}`)

const invented = identity.filter((r) => /preferred_name/i.test(r.attribute || ''))
check('no name was invented from any of the three sentences', invented.length === 0,
  invented.length ? invented.map((r) => `${r.value} @${r.confidence}`).join(', ') : 'identity namespace empty')

console.log(invented.length
  ? '\n  ⚠️  DEFECT PRESENT — a name was manufactured from ordinary prose.'
  : '\n  ✅ FLOOR HOLDS — three sentences that each invented a name now capture nothing.')

// Leave nothing behind. Scoped to agent_dev by id, never by value pattern.
for (const cid of cids) await call(who, 'DELETE', `/v1/chat/conversations/${cid}`)
await db.query(`delete from ${S}.txn_memories where user_id = $1`, [me])
await db.end()

done()
