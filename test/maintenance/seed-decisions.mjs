// ⭐⭐⭐ SEED THE DECISION MEMORY — with provenance that is a HARD PROPERTY, not a claim.
//
//   node maintenance/seed-decisions.mjs --as agent_dev --dry-run
//   node maintenance/seed-decisions.mjs --as agent_dev
//   node maintenance/seed-decisions.mjs --as agent_dev --verify      (check what is already stored)
//
// ⛔ Ote, 2026-08-24: *"make provenance a hard property of the decision-memory content we seed. For
// every decision/freeze/rejection we put into her memory, preserve a real, checkable source reference…
// Don't let the seed process invent or infer provenance."*
//
// ── ⛔⛔ WHY THAT SENTENCE IS THE WHOLE DESIGN ─────────────────────────────────────────────────────
// Hours before this was written she produced a verification section containing two FABRICATED
// citations: *"the web search confirms…"* when `search_web` was never called, and *"verified at
// 2a739f3c"* when no such conversation exists. ⚠️ The substance of the second was TRUE — the prior
// attempts are 856e533c and 1fbb86f1 — but the reference proving it was invented.
// ⇒ ⭐ so the answer is not to make her incapable of that. It is to make every seeded decision carry a
// reference that a machine can resolve WITHOUT her, so her citation can be checked rather than trusted.
//
// ── ⭐ THE PROVENANCE CONTRACT · three parts, and all three must resolve ───────────────────────────
//   PATH    a file in the `Reference` git repo
//   COMMIT  the commit it is cited at — ⭐ so the citation survives the file being edited later
//   QUOTE   a verbatim string that MUST be present in that file AT that commit
//
// ⛔ THE SEEDER VERIFIES BEFORE IT WRITES, with `git show <commit>:<path>`, and REFUSES any row whose
// quote does not resolve. That is what makes provenance a property of the data rather than a promise
// about it: an unverifiable decision never enters the store at all.
//
// ⚠️ AND WHAT THIS DELIBERATELY DOES NOT DO. It does not seed everything — Ote: *"Start with a small,
// high-value set of decisions and freezes, not the entire history."* These are the ones we have
// repeatedly risked reopening, several of them in this very session.
//
// ⚠️ A KNOWN LIMITATION, STATED RATHER THAN DESIGNED AROUND: memories are per-room (`user_id`), and a
// project decision is not about a person. There is no project-level scope in this store, and inventing
// one is architecture. ⇒ this seeds ONE room so the job can be tested; the real home is whichever room
// the question gets asked in. ⛔ Not a new scope.

import { execFileSync } from 'node:child_process'
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { makeEmbedder } from '../../Backend/app/components/memory-embed-host.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const AS = opt('as', 'agent_dev')
const DRY = argv.includes('--dry-run')
const VERIFY_ONLY = argv.includes('--verify')
const REPO = 'C:/data/AI_LLMv2/Reference'

// ══ THE SEED SET · 12 decisions, weighted to frozen and rejected ═══════════════════════════════════
//
// `status` is the answer to *"is it still active?"* and is the most useful field in the row:
//   shipped   — in production now
//   frozen    — deliberately not being worked on; reopening needs a decision
//   rejected  — tried or proposed and turned down; ⛔ proposing it again is the failure mode
//   deferred  — agreed in principle, not now
//   open      — known and unresolved
const DECISIONS = [
  { key: 'd1-episode-window-centre', status: 'shipped', when: '2026-08-23',
    decision: 'The episode window centres on the best-matching message, not on the most recent one (D1). Shipped after an offline before/after and an answer-level measurement.',
    path: 'docs/MEASUREMENT_SOTERA_OWNERSHIP_FALSIFIER.md', quote: 'D1/D2 changed *which episodes* arrive' },
  { key: 'd2-episode-tophit-weight', status: 'shipped', when: '2026-08-23',
    decision: 'D2 episodeTopHit ships at weight 2. Two is the measured SATURATION point over a pre-registered set {0,1,2,4} — w=4 is identical and w=1 is worse — not a tuned number.',
    path: 'docs/MEASUREMENT_SOTERA_OWNERSHIP_FALSIFIER.md', quote: 'shipped, measured at the saturation point, guarded' },
  { key: 'd4-cue-centre', status: 'frozen', when: '2026-08-23',
    decision: 'D4 episodeCentreCueMatch was measured and NOT shipped. It stays off; its guard keeps the `?? ep.centre` fallback.',
    path: 'docs/MEASUREMENT_SOTERA_OWNERSHIP_FALSIFIER.md', quote: 'D3 · D4 · P5 · L4 · identifier projection' },
  { key: 'w1-present-not-recollection', status: 'shipped', when: '2026-08-24',
    decision: 'W1: the present is not a recollection. Working-set material from the current conversation is rendered in present grammar with no date, because in 481 of 482 turns the block quoted the live question back as `They said, <date>:`.',
    path: 'docs/MEASUREMENT_SOTERA_OWNERSHIP_FALSIFIER.md', quote: 'PART III · W1 shipped, validated, and the foundation phase closed' },
  { key: 'o1-flattened-container', status: 'frozen', when: '2026-08-24',
    decision: 'O1 — adding structural separators to the flattened system string — is FROZEN. W1 addressed one of two mechanisms behind the container-language rate; the flattened container is the other and is not being worked on.',
    path: 'docs/MEASUREMENT_SOTERA_OWNERSHIP_FALSIFIER.md', quote: 'O1 the wrong first move' },
  { key: 'l4-working-memory-freeze', status: 'frozen', when: '2026-08-23',
    decision: 'L4 working memory is frozen as a deprecation candidate: do not extend it, do not wire cognition into it, do not re-enable it harder. The freeze was later opened ONLY far enough to add observability (B0) and measure.',
    path: 'docs/DESIGN_SOTERA_WORKING_STATE.md', quote: 'DO NOT BUILD ON THIS' },
  { key: 'working-memory-redesign', status: 'frozen', when: '2026-08-24',
    decision: 'No Working Memory 2.0. Measurement showed working memory and todo COMPETE and todo wins for enumerable work — so the open question is a decision about two rails, not an architecture.',
    path: 'docs/DESIGN_SOTERA_WORKING_STATE.md', quote: 'todo wins' },
  { key: 'todo-rail-deferred', status: 'deferred', when: '2026-08-24',
    decision: 'The Todo rail is deferred, on the grounds that it risks duplicating what working memory should own. Measurement later showed she picks todo for enumerable work.',
    path: 'docs/DESIGN_SOTERA_SKILL_CONTRACT.md', quote: 'todo is skipped' },
  { key: 'okf-export', status: 'deferred', when: '2026-08-24',
    decision: 'An OKF export of her memory is NOT worth building yet: the durable store is 43 rows, and the doc-framework Skill already gives a better legibility surface than a text export.',
    path: 'docs/RESEARCH_OKF_LLMWIKI_UNDERSTORY.md', quote: 'not yet** — 43 rows' },
  { key: 'relations-first-class', status: 'deferred', when: '2026-08-24',
    decision: 'Relations as first-class stored objects are deferred. It would touch Memory V3 and is the "build infrastructure, investigate it, build another layer" shape that was explicitly ruled out.',
    path: 'docs/RESEARCH_OKF_LLMWIKI_UNDERSTORY.md', quote: 'defer** (§9.6)' },
  { key: 'defect-a-topic-phrasing', status: 'open', when: '2026-08-24',
    decision: 'Defect A — topic recall is phrasing-dependent while person recall is not — is a real measured defect, documented and NOT being worked on. Fixing it needs the most invasive change proposed in the arc: the discovery query.',
    path: 'docs/ANALYSIS_SOTERA_C3_REASSESSMENT.md', quote: 'Defect A needs the most invasive change' },
  { key: 'memory-lint-scheduled', status: 'shipped', when: '2026-08-24',
    decision: 'A memory-integrity lint ships as a scheduled read-only job: deterministic, idempotent, per-owner, counts-only in the log. Its case rests on four integrity defects found by accident, not on a dramatic finding.',
    path: 'docs/RESEARCH_OKF_LLMWIKI_UNDERSTORY.md', quote: 'Memory lint as a scheduled job?' },
]

// ══ ⛔ VERIFY · git is the arbiter, not this file ═══════════════════════════════════════════════════
const HEAD = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const SHORT = HEAD.slice(0, 9)
const fileAt = (commit, path) => {
  try { return execFileSync('git', ['-C', REPO, 'show', `${commit}:${path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) }
  catch { return null }
}

// ⭐⭐ A DECISION IS CITED AT THE COMMIT WHERE IT WAS MADE, not at HEAD — and this became a rule because
// the seeder caught me breaking it. I first cited W1 at the Phase-B docs commit, where the same file
// still said *"Neither is applied"*: I was citing a decision to a commit at which it had not been taken.
// ⇒ `commit` is per-decision and optional; HEAD is only the default for decisions made at HEAD.
const cache = new Map()
const verified = []
const refused = []
for (const d of DECISIONS) {
  const at = d.commit || HEAD
  const key = `${at}:${d.path}`
  if (!cache.has(key)) cache.set(key, fileAt(at, d.path))
  const body = cache.get(key)
  const short = at.slice(0, 9)
  if (body == null) { refused.push({ ...d, why: `file not found at ${short}` }); continue }
  if (!body.includes(d.quote)) { refused.push({ ...d, why: `quote NOT PRESENT in ${d.path} at ${short}` }); continue }
  verified.push({ ...d, commit: at, source: `doc:${d.path}@${short}` })
}

const W = 100
console.log(`\n${'═'.repeat(W)}`)
console.log(`  SEED DECISION MEMORY — provenance verified against git before anything is written`)
console.log(`${'═'.repeat(W)}`)
console.log(`  repo ${REPO} @ ${SHORT}   ·   ${DECISIONS.length} declared`)
console.log(`\n  ${'key'.padEnd(30)} ${'status'.padEnd(9)} provenance`)
for (const d of verified) console.log(`  ✓ ${d.key.padEnd(28)} ${d.status.padEnd(9)} ${d.source}`)
for (const d of refused) console.log(`  ⛔ ${d.key.padEnd(28)} ${d.status.padEnd(9)} REFUSED — ${d.why}`)
console.log(`\n  ⇒ ${verified.length} verified, ${refused.length} refused`)
// ⛔ A REFUSAL IS FATAL, NOT A WARNING. Writing 10 of 12 and shrugging is how a store acquires rows
// nobody can check — which is the exact defect this file exists to prevent.
if (refused.length) {
  console.error(`\n  ⛔⛔ REFUSING THE WHOLE BATCH. Fix the quote or the path; provenance is not optional.\n`)
  process.exit(1)
}

const pg = devPg(); await pg.connect()
const S = devSchema()
const { rows: [user] } = await pg.query(`select id::text id from ${S}.mst_users where username = $1`, [AS])
if (!user) { console.error(`✖ no such user: ${AS}`); await pg.end(); process.exit(1) }

// ══ VERIFY-ONLY · re-check what is ALREADY stored, independently of her ════════════════════════════
if (VERIFY_ONLY) {
  const { rows } = await pg.query(
    `select id::text id, attribute, value, source, evidence, created_at from ${S}.txn_memories
      where user_id = $1 and entity = 'project-decision' and invalid_at is null and expired_at is null order by attribute`, [user.id])
  console.log(`  ── stored decisions for ${AS}: ${rows.length} ──`)
  let bad = 0
  for (const r of rows) {
    const ev = r.evidence || {}
    const body = ev.path ? fileAt(ev.commit || HEAD, ev.path) : null
    const holds = Boolean(body && ev.quote && body.includes(ev.quote))
    if (!holds) bad++
    console.log(`  ${holds ? '✓' : '⛔'} ${String(r.attribute).padEnd(30)} ${r.source}`)
    if (!holds) console.log(`      quote does not resolve: ${JSON.stringify(String(ev.quote ?? '').slice(0, 60))}`)
  }
  console.log(`\n  ⇒ ${rows.length - bad} of ${rows.length} still resolve against the repo${bad ? '  ⛔ ' + bad + ' BROKEN' : ''}\n`)
  await pg.end()
  process.exit(bad ? 1 : 0)
}

if (DRY) { console.log('  (dry run — nothing written)\n'); await pg.end(); process.exit(0) }

// ══ WRITE · idempotent by (user, entity, attribute) ════════════════════════════════════════════════
let inserted = 0, updated = 0
for (const d of verified) {
  // ⭐ THE ROW CARRIES ITS OWN PROOF. `evidence` holds path + commit + quote, which is exactly what the
  // verifier needs and exactly what she cannot fabricate her way around: a citation she invents will not
  // match any row, and a row whose quote stops resolving is caught by --verify.
  // ⭐⭐ provenance IS LEFT NULL, AND THE SCHEMA IS WHY — twice over, which is the point.
  //
  // First `provenance = 'document'` was refused: `memory_provenance` admits only
  // quoted | elicited | synthesized | observed. ⇒ the vocabulary stopped me inventing a category.
  // Then `'quoted'` was refused by `txn_memories_quoted_needs_source`:
  //   CHECK (provenance IS DISTINCT FROM 'quoted' OR source_message_id IS NOT NULL)
  // ⇒ ⭐ in THIS store, "quoted" means quoted from a MESSAGE, and a message id is mandatory proof of it.
  // These decisions are quoted from a DOCUMENT, and the vocabulary has no term for that — which is
  // precisely why document-sourced decisions had no home here before.
  //
  // ⛔ So the column stays NULL rather than wearing a label that would be false, and the checkable
  // reference lives where it can actually be resolved: `source` = doc:<path>@<commit>, plus `evidence`
  // carrying path + commit + verbatim quote. ⓘ Adding an enum value would be a migration and an
  // ontology change; it is recorded as a gap, not fixed here.
  // ⚠️ ENTITY IS `project-decision`, NOT `decision`, AND THE RENAME IS DELIBERATE. This store already
  // has a different thing called a decision: `memory-decision-record.js` records her DECISION TO DECLINE
  // remembering something, and `partitionMemoryRead` filters those out of every memory read under the
  // rule *"a decision is not a memory"*. ⛔ Two senses of one word in one store is a trap that would
  // eventually be resolved wrongly by whoever read the shorter name first.
  const evidence = { kind: 'project-decision', status: d.status, decidedOn: d.when, path: d.path, commit: d.commit, quote: d.quote, repo: 'Reference' }
  const { rows: existing } = await pg.query(
    `select id::text id from ${S}.txn_memories
      where user_id = $1 and entity = 'project-decision' and attribute = $2 and invalid_at is null and expired_at is null`,
    [user.id, d.key])
  if (existing.length) {
    await pg.query(
      `update ${S}.txn_memories set content = $1, value = $2, source = $3, provenance = null,
         evidence = $4, updated_at = now() where id = $5`,
      [d.decision, d.status, d.source, JSON.stringify(evidence), existing[0].id])
    updated++
  } else {
    await pg.query(
      `insert into ${S}.txn_memories
         (id, persona, user_id, namespace, kind, content, entity, attribute, value,
          importance, confidence, source, provenance, evidence, author, valid_at, created_at, updated_at)
       values (gen_random_uuid(), 'sotera', $1, 'default', 'semantic', $2, 'project-decision', $3, $4,
          9, 1.0, $5, null, $6, 'account', $7::date, now(), now())`,
      [user.id, d.decision, d.key, d.status, d.source, JSON.stringify(evidence), d.when])
    inserted++
  }
}
// ══ ⛔⛔ AND THE EMBEDDING, BECAUSE A ROW IN THE TABLE IS NOT A MEMORY ══════════════════════════════
//
// The first version of this file stopped at the INSERT, and the seeding looked like a success: 12 rows,
// 12 verifiable references. Then the job ran and she answered *"no prior decision found"* about a
// decision sitting in her own store — because raw SQL bypasses the write path, so every row had
// `embedding IS NULL`, and `recall_memory` (the tool she actually reaches for) could not see any of them.
// ⇒ ⭐ INSERTING INTO A MEMORY TABLE IS NOT THE SAME AS REMEMBERING.
//
// ⚠️ And the first fix I tried was the wrong one: I edited the Skill to tell her to enumerate rather than
// search. That is coaching around a defect. The defect is the missing vector.
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const embed = makeEmbedder({ config, db }, { userId: user.id })
let embedded = 0
let embedFailed = 0
{
  const { rows: toEmbed } = await pg.query(
    `select id::text id, content from ${S}.txn_memories
      where user_id = $1 and entity = 'project-decision' and embedding is null
        and invalid_at is null and expired_at is null`, [user.id])
  for (const r of toEmbed) {
    try {
      const { vector, model } = await embed(r.content)
      if (!vector) { embedFailed++; continue }
      await pg.query(`update ${S}.txn_memories set embedding = $1, embedding_model = $2 where id = $3`,
        [JSON.stringify(vector), model, r.id])
      embedded++
    } catch (e) { embedFailed++; console.log(`  ⚠️ embed failed for ${r.id.slice(0, 8)}: ${e.message}`) }
  }
}
console.log(`\n  ⭐ ${inserted} inserted, ${updated} updated in ${AS}'s room`)
console.log(`  ⭐ ${embedded} embedded${embedFailed ? `  ⛔ ${embedFailed} FAILED — those rows stay invisible to recall_memory` : ''}`)
// ⚠️ author = 'account', NOT 'persona'. She did not conclude these — they were decided and handed to
// her. Stamping them as hers would be the laundering the Skill contract's §3 rule forbids.
console.log(`  ⓘ author='account' — these were DECIDED and handed to her, not concluded by her`)
console.log(`  ⓘ re-check any time with:  node maintenance/seed-decisions.mjs --as ${AS} --verify\n`)
await pg.end()
