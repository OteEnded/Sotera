// ⭐⭐⭐ ASSERT THE CORPUS STATE A B4 RUN IS ABOUT TO START FROM. ⛔ Exits non-zero rather than warning.
//
//   node pipeline/b4-corpus-state.mjs            verify, and sweep orphan embeddings
//   node pipeline/b4-corpus-state.mjs --expect 298
//
// Ote's requirement for the variance probe: *"each run must start from the same relevant corpus state …
// verify no orphan embeddings or other artifacts remain."*
//
// ── ⚠️⚠️ WHY THIS IS A GATE AND NOT A REPORT ────────────────────────────────────────────────────────
// The `current` arm was void because a PRIOR run's conversation was still present and she opened it by id
// and followed it to the source. A variance probe measuring three different corpora measures nothing, and
// the difference would look exactly like variance — which is the thing being measured. ⛔ So this refuses
// to let the next run start rather than recording a caveat next to it.
//
// ⭐ AND THE SWEEP IS RUN EVERY TIME, because the delete RACES THE SERVER: embeddings, noticing and
// reflection keep working after a conversation is answered, so rows arrive for one that is already gone.
// An orphaned embedding still carries `conversation_id`, `role` and the VECTOR — it stays a retrieval
// candidate. That is the contamination coming back through the back door, and it is idempotent to remove.

import { devPg, devSchema } from '../harness.mjs'
import { sweepOrphanEmbeddings } from '../lib/corpus.mjs'
import { TASKS, TARGET } from '../lib/b4-case.mjs'

const argv = process.argv.slice(2)
const i = argv.indexOf('--expect')
const EXPECT = i >= 0 ? Number(argv[i + 1]) : null

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (s, p = []) => (await pg.query(s, p)).rows

const problems = []

// ⛔ 1 · NO PRIOR TASK-RUN MAY EXIST. The witness is the prompt itself; nothing else can have it.
for (const t of Object.values(TASKS)) {
  const [r] = await q(
    `select count(*)::int n from ${S}.txn_messages where role = 'user' and btrim(content) = btrim($1)`, [t.prompt])
  if (r.n) problems.push(`${r.n} prior "${t.key}" run(s) still in the corpus`)
}

// ⛔ 2 · THE ANSWER MUST STILL BE UNREACHABLE FROM DURABLE MEMORY. The reflection lane is live; this is
// not a one-time verification, and a leak between replicates would look like variance too.
for (const p of TARGET.memoryProbes) {
  const [r] = await q(`select count(*)::int n from ${S}.txn_memories where content ilike $1 and expired_at is null`, ['%' + p + '%'])
  if (r.n) problems.push(`durable memory now holds "${p}" (${r.n})`)
}

// ⛔ 3 · THE TARGET MUST STILL BE THERE AND WHOLE. A cleanup that reached too far would make every later
// arm fail for a reason that has nothing to do with the payload shape.
const [tgt] = await q(`select count(*)::int n from ${S}.txn_messages where conversation_id = $1`, [TARGET.conversationId])
if (tgt.n !== 8) problems.push(`target conversation has ${tgt.n} messages, expected 8`)

// ⭐ 4 · SWEEP, then assert the sweep found nothing left to do on a second pass.
const swept = await sweepOrphanEmbeddings(q, S)
const again = await sweepOrphanEmbeddings(q, S)
if (again.length) problems.push(`${again.length} orphan embedding(s) survived a second sweep`)

const [tot] = await q(`select count(*)::int n from ${S}.txn_conversations`)
const [emb] = await q(`select count(*)::int n from ${S}.txn_message_embeddings`)
if (EXPECT != null && tot.n !== EXPECT) problems.push(`corpus is ${tot.n} conversations, expected ${EXPECT}`)

console.log(`  corpus: ${tot.n} conversations · ${emb.n} embeddings · swept ${swept.length} orphan(s) · target ${tgt.n}/8 msgs`)
if (problems.length) {
  console.log(`  ⛔ NOT SAFE TO RUN:\n${problems.map((p) => `     · ${p}`).join('\n')}`)
  await pg.end()
  process.exit(1)
}
console.log('  ✔ clean — same corpus state as the baseline')
await pg.end()
