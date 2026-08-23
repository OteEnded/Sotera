// ⭐⭐⭐ REMOVE THE HARNESS'S OWN CONVERSATIONS FROM THE CORPUS IT MEASURES — BY EXACT ID SET.
//
//   node pipeline/corpus-cleanup.mjs                 (DRY RUN — prints the plan, touches nothing)
//   node pipeline/corpus-cleanup.mjs --apply
//   node pipeline/corpus-cleanup.mjs --apply --also <conversationId>     (an orphan, repeatable)
//
// ── ⚠️⚠️ WHY THIS EXISTS: THE MEASUREMENT ATE ITS SUBJECT ──────────────────────────────────────────
// `rate-harness.mjs` opens a fresh conversation per run — independence is what makes a rate mean anything —
// and it never removed them. By 2026-08-23 the room it measures held **73 `RATE %` conversations against 38
// organic ones**, all asking about the same person, and a MECHANISM CHECK FAILED:
//
//   memory-cognition-check §2b — "at least one retrieved episode is one she was IN with him" → 0 of 20
//
// Her real conversations *with* Hermes were outranked by two dozen conversations *about* him that the
// harness wrote that morning. ⭐ Verified by stashing the day's code and re-running: the failure was the
// CORPUS, not the change.
//
// ⛔⛔ Ote: *"Do not modify retrieval, ranking, relevance, cognition, or prompting to make the contaminated
// fixture pass."* ⇒ this script is the only sanctioned response, and it is deliberately dumb: it deletes
// rows by id and changes no behaviour anywhere.
//
// ── ⭐ THE PATTERN IS `ask-sotera-as-root.mjs`, AND SO IS ITS LESSON ───────────────────────────────
// That probe snapshots root's room **by ID SET, never by count** — because its first run reported "residue
// left in his room, messages 96→98" and it was a FALSE ALARM: Ote was chatting in his own room while the
// probe ran. ⇒ ⛔ **a count cannot tell whose rows moved it.** Everything below is id sets: what was
// targeted, what actually disappeared, and the assertion that those two are the same set.
//
// ── 🔑 WHAT IS PRESERVED, BECAUSE DELETION MUST NOT DESTROY THE EXPERIMENT ─────────────────────────
//   · every ANSWER is already saved in `results/rates/*.json` — the measurement data is not in the DB
//   · the manifest records every id removed, per table, plus the FULL transcript of any conversation whose
//     text is not already in a saved cell (an orphan from a run whose json was deleted)
//   · ⚠️ the contaminated baselines STAY in `results/rates/` and stay in the docs. Ote: *"I want that
//     contamination recorded as part of the experimental history rather than silently disappearing."*

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { DEPENDENTS, safetyViolations, undeclaredReferences, deleteConversations, verifyRemoval, sweepOrphanEmbeddings } from '../lib/corpus.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const also = argv.reduce((acc, a, i) => (a === '--also' && argv[i + 1] ? [...acc, argv[i + 1]] : acc), [])
const config = loadConfig()
const RATES = new URL('../results/rates/', import.meta.url)
const OUT = new URL('../results/', import.meta.url)

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const idsOf = async (sql, p) => new Set((await q(sql, p)).map((r) => r.id))
const die = (m) => { console.error(`✖ ${m}`); process.exitCode = 1 }

// ── 1 · THE TARGET SET, FROM THE SAVED CELLS ───────────────────────────────────────────────────────
// ⭐ The id set comes from the MEASUREMENT FILES, not from a title pattern — the files are the record of
// what this harness created, and a title pattern is a guess about what somebody named something.
const fromCells = new Map()
if (existsSync(RATES)) {
  for (const f of readdirSync(RATES).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(new URL(f, RATES), 'utf8'))
    for (const r of d.runs ?? []) if (r.cid) fromCells.set(r.cid, d.label ?? d.config)
  }
}
for (const id of also) if (!fromCells.has(id)) fromCells.set(id, '(--also, not in any saved cell)')
const target = [...fromCells.keys()]
if (!target.length) { die('no conversation ids found in results/rates — nothing to do'); await pg.end(); process.exit() }

// ── 2 · ⛔ SAFETY GATES · every one must pass, and the script refuses rather than skipping a row ────
const rows = await q(
  `select c.id::text id, c.title, c.created_at, u.username, u.id::text uid
     from ${S}.txn_conversations c join ${S}.mst_users u on u.id = c.user_id
    where c.id = any($1)`, [target])
const byId = new Map(rows.map((r) => [r.id, r]))
const missing = target.filter((id) => !byId.has(id))
const rootUserId = config?.auth?.root?.userConnected ?? null
const rootName = config?.auth?.root?.username ?? 'ote'

const violations = safetyViolations(rows, { rootUserId, rootName })
if (violations.length) {
  console.error(`\n⛔ REFUSING — ${violations.length} safety violation(s):`)
  for (const v of violations) console.error(`   · ${v}`)
  await pg.end(); process.exit(1)
}

// ── 3 · THE DEPENDENTS, ENUMERATED FROM THE SCHEMA RATHER THAN REMEMBERED ──────────────────────────
// ⓘ `DEPENDENTS`, the children-first order and the schema assertion live in `../lib/corpus.mjs`, with the
// reasons. `log_*` rows go too, and their ids are written to the manifest — the audit fact survives as
// "these ids were removed", which is what an audit needs.
const undeclared = await undeclaredReferences(q, S)
if (undeclared.length) {
  console.error('\n⛔ REFUSING — the schema references conversations from a table the cleanup does not know:')
  for (const u of undeclared) console.error(`   · ${u}`)
  console.error('   Add it to DEPENDENTS in test/lib/corpus.mjs (children first) rather than orphaning it.')
  await pg.end(); process.exit(1)
}

const counts = {}
for (const [t, c] of DEPENDENTS) {
  counts[t] = (await q(`select count(*)::int n from ${S}.${t} where ${c} = any($1)`, [target]))[0].n
}
// ⭐ Anything the harness may have caused that is NOT keyed by conversation_id, checked and reported.
const memRows = await q(
  `select id::text id, entity, attribute from ${S}.txn_memories where source = any($1)`,
  [target.map((id) => `conversation:${id}`)])

// ── 4 · SNAPSHOT · the whole conversation id set, so "what disappeared" is provable ────────────────
const beforeAll = await idsOf(`select id::text id from ${S}.txn_conversations`)
// ⭐ Full text for anything whose answers are NOT already in a saved cell. Deletion must not be the only
// copy of anything — and one orphan exists precisely because a cell file was deleted after a smoke run.
const orphanIds = target.filter((id) => fromCells.get(id)?.startsWith('(--also'))
const orphanText = orphanIds.length
  ? await q(`select conversation_id::text cid, role, content, created_at from ${S}.txn_messages
              where conversation_id = any($1) order by created_at`, [orphanIds])
  : []

console.log(`\n${'═'.repeat(100)}`)
console.log(`  CORPUS CLEANUP — ${APPLY ? '⚠️  APPLYING' : 'DRY RUN (pass --apply)'}`)
console.log(`${'═'.repeat(100)}`)
console.log(`  target conversations : ${target.length}  (${rows.length} present, ${missing.length} already gone)`)
console.log(`  owner               : ${[...new Set(rows.map((r) => r.username))].join(', ')}`)
console.log(`  from cells          : ${[...new Set([...fromCells.values()])].join(', ')}`)
for (const [t] of DEPENDENTS) if (counts[t]) console.log(`  ${t.padEnd(26)}: ${counts[t]} row(s)`)
console.log(`  memories sourced here: ${memRows.length}${memRows.length ? ' ⚠️ NOT deleted — see the manifest note' : ''}`)
const organic = await q(
  `select count(*)::int n from ${S}.txn_conversations c join ${S}.mst_users u on u.id = c.user_id
    where u.username = 'agent_dev' and c.title not like 'RATE %'`)
console.log(`  agent_dev keeps      : ${organic[0].n} conversation(s) that are not harness runs`)

// ⚠️ RESIDUE THIS SCRIPT CANNOT REVERSE, STATED RATHER THAN GLOSSED. Tier C relational records hold a
// closed-vocabulary label and a COUNT and — by design — no source ids, so a row the harness caused cannot
// be told from one a real conversation caused, and a counter it bumped cannot be decremented safely.
const rel = await q(
  `select label, conversation_count, updated_at from ${S}.txn_relational_records order by updated_at desc limit 5`)
console.log(`\n  ⚠️ IRREVERSIBLE RESIDUE (reported, never guessed at): tier C relational records carry no`)
console.log(`     source ids, so harness-caused rows cannot be identified. Most recent:`)
for (const r of rel) console.log(`       · ${r.label} — count ${r.conversation_count}, updated ${r.updated_at.toISOString()}`)

if (!APPLY) {
  console.log(`\n  ⓘ nothing was changed. Re-run with --apply.`)
  await pg.end(); process.exit(0)
}

// ── 5 · DELETE, children first, IN ONE TRANSACTION ─────────────────────────────────────────────────
// ⛔ One transaction because a half-cleaned corpus is worse than a contaminated one: it would be a fixture
// nobody could describe. ⓘ The first run of this script died on a missing column here and, because of this,
// left the corpus exactly as it found it.
let removed = {}
try {
  removed = await deleteConversations(q, S, target)
} catch (e) {
  console.error(`
⛔ ROLLED BACK — nothing was deleted: ${e?.message ?? e}`)
  await pg.end(); process.exit(1)
}

// ── 6 · ⭐⭐ VERIFY BY ID SET, IN BOTH DIRECTIONS ──────────────────────────────────────────────────
// ⭐ And the rows the server wrote for a conversation it had already been told to forget — see the sweep's
// header: an orphaned embedding keeps its vector and stays a retrieval candidate.
const swept = await sweepOrphanEmbeddings(q, S)
const afterAll = await idsOf(`select id::text id from ${S}.txn_conversations`)
const { disappeared, unintended, survived } = verifyRemoval(beforeAll, afterAll, target)

mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const manifestPath = new URL(`corpus-cleanup-${stamp}.json`, OUT)
writeFileSync(manifestPath, JSON.stringify({
  at: new Date().toISOString(),
  why: 'the rate harness became 73 of 111 conversations in the room it measures, and memory-cognition-check '
    + '§2b failed (0 of 20 retrieved episodes were ones she was IN with him). Verified by stash that the '
    + 'failure was the corpus, not the code. Ote: clean by exact ID set; do not touch retrieval to make it pass.',
  scope: 'conversations created by test/pipeline/rate-harness.mjs, owned by agent_dev, titled "RATE …"',
  preserved: 'every answer remains in test/results/rates/*.json; the contaminated baselines are kept and '
    + 'stay in the docs as experimental history',
  targetedIds: target,
  labelByConversation: Object.fromEntries(fromCells),
  removedByTable: removed,
  orphanEmbeddingsSwept: swept,
  alreadyAbsent: missing,
  orphanTranscripts: orphanText,
  notDeleted: {
    memoriesSourcedFromThese: memRows,
    note: 'kept if non-empty: a memory is hers once written, and removing one is a different decision from '
      + 'removing a measurement artefact.',
    irreversibleResidue: 'tier C relational records carry a label and a count and no source ids, so rows or '
      + 'counter increments caused by harness turns cannot be identified or reversed. Reported, not guessed.',
  },
  verification: { disappeared, unintended, survived },
}, null, 2))

console.log(`\n${'─'.repeat(100)}`)
for (const [t, ids] of Object.entries(removed)) console.log(`  removed ${String(ids.length).padStart(4)} from ${t}`)
console.log(`\n  ${unintended.length === 0 ? '✓' : '⛔'} nothing outside the target set disappeared`
  + `${unintended.length ? `: ${unintended.join(', ')}` : ''}`)
console.log(`  ${survived.length === 0 ? '✓' : '⛔'} nothing in the target set survived`
  + `${survived.length ? `: ${survived.join(', ')}` : ''}`)
console.log(`  conversations ${beforeAll.size} → ${afterAll.size}  (−${beforeAll.size - afterAll.size})`)
console.log(`  manifest → test/results/corpus-cleanup-${stamp}.json`)
if (unintended.length || survived.length) process.exitCode = 1
await pg.end()
