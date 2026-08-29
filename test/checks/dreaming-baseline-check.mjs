// ⭐⭐⭐ DREAMING BASELINE — a CHARACTERIZATION check, written before implementation begins.
//
//   node test/checks/dreaming-baseline-check.mjs
//
// ── ⛔ WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────────────────────────
// It PINS CURRENT BEHAVIOUR so that the switch from DESIGN to IMPLEMENTATION cannot silently change a
// meaning. ⛔ It asserts nothing about what the system SHOULD do — where current behaviour departs from
// the locked contract, this file asserts the DEPARTURE, with the reason, so that fixing it later shows
// up as a deliberate visible change rather than a green test that quietly moved.
//
// ⛔ IT IS READ-ONLY. No fixture, no write, no exclusion, no cleanup. It touches nothing.
//
// ── ⚠️ SOURCE SCANS ARE ANCHORED, AND COMMENTS ARE STRIPPED ───────────────────────────────────────
// A source scan whose anchor goes missing stops scanning SILENTLY and reports clean. Every scan below
// first asserts it can still SEE its file and its anchor, and every scan strips comments first — this
// codebase describes its own SQL in prose, so an unstripped scan matches the explanation instead of the
// code.
//
// Locked contract: Reference/docs/CONTRACT_SOTERA_DREAMING_MINIMUM_SEMANTIC.md

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { evidentialSql, EVIDENTIAL_WHERE, isEvidential } from '../../Backend/app/components/corpus-eligibility.js'

const { check, done } = makeChecker('dreaming-baseline')
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows

const src = (rel) => {
  try { return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8') } catch { return null }
}
/** ⛔ Comments stripped: this codebase explains its SQL in prose, and an unstripped scan matches the prose. */
const code = (text) => String(text ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

// ══ 1 · #656 — THE LOCKED E3 REFERENCE CASE ══════════════════════════════════════════════════════
// Contract §8.4: "its act remains durable, readable and auditable — and once its source conversation is
// excluded, it is no longer admissible as Dreaming corpus."

const excluded = await q(
  `select id, excluded_from_evidence_at, exclusion_reason, incognito, archived_at
     from ${S}.txn_conversations where excluded_from_evidence_at is not null order by id`)
ok(excluded.length === 1, '1 · exactly ONE conversation is excluded', `${excluded.length}`)
const EX = excluded[0]
ok(!!EX && String(EX.id).startsWith('56425175'),
  '1 · ⭐ …and it is 56425175 — the harness-driven reflection probe', String(EX?.id).slice(0, 8))
ok(!!EX?.exclusion_reason && EX.exclusion_reason.trim().length >= 8,
  '1 · ⭐ …it carries a reason a person can evaluate later', EX?.exclusion_reason?.slice(0, 60))
// ⭐⭐ THE POINT OF 033: excluded is NOT deleted, NOT archived, NOT incognito.
ok(EX?.incognito === false && EX?.archived_at === null,
  '1 · ⭐⭐ …and NOTHING ELSE changed — not incognito, not archived, not deleted',
  `incognito=${EX?.incognito} archived=${EX?.archived_at ?? 'null'}`)

const on656 = await q(
  `select rolling_id, outcome, messages_considered, wrote_memory_id,
          coalesce(array_length(tools_used, 1), 0) as n_tools, length(coalesce(text, '')) as textlen
     from ${S}.log_conversation_revisits where conversation_id = $1 order by rolling_id`, [EX?.id])
ok(on656.length === 1, '1 · ⭐ exactly ONE act record rests on it', `${on656.length}`)
const R656 = on656[0]
ok(Number(R656?.rolling_id) === 656, '1 · ⭐ …and it is #656', String(R656?.rolling_id))
// ⭐⭐⭐ THE THREE FACTS THAT MAKE #656 THE PURE CASE.
ok(R656?.wrote_memory_id === null,
  '1 · ⭐⭐ #656 wrote NO memory ⇒ ⛔ no downstream commitment to unwind', `wrote=${R656?.wrote_memory_id ?? 'null'}`)
ok(Number(R656?.n_tools) === 0,
  '1 · ⭐⭐ #656 used NO tools ⇒ Q1 sound-not-complete does NOT touch it — the traversal is COMPLETE here',
  `${R656?.n_tools} tools`)
ok(Number(R656?.textlen) > 0 && R656?.outcome === 'completed',
  '1 · ⭐ …and the act itself remains durable and readable — E3 withholds it, ⛔ it does not erase it',
  `outcome=${R656?.outcome} text=${R656?.textlen} chars`)

// ══ 2 · THE E3 TRAVERSAL — COMPUTED, FROM LINKS THAT ALREADY EXIST ═══════════════════════════════
// Contract §8: one join, and the predicate is verbatim `evidentialSql`.

const e3 = await q(
  `select count(*)::int as total,
          count(*) filter (where ${evidentialSql('c')})::int as admissible,
          count(*) filter (where not (${evidentialSql('c')}))::int as withheld
     from ${S}.log_conversation_revisits r join ${S}.txn_conversations c on c.id = r.conversation_id`)
const E = e3[0]
ok(E.total > 0 && E.admissible + E.withheld === E.total,
  '2 · ⭐ the E3 traversal runs on existing links — revisits ⋈ conversations, no new column',
  `total=${E.total} admissible=${E.admissible} withheld=${E.withheld}`)
ok(E.withheld === 1, '2 · ⭐⭐ …and it withholds exactly ONE act record today', `withheld=${E.withheld}`)

// ⛔⛔ THE ORDERING CONSTRAINT (§8.2): withheld must be COUNTED, never silently dropped. A traversal that
// returned only `admissible` would make 6a ("exists, not allowed") indistinguishable from 6d ("nothing").
ok(E.total === E.admissible + E.withheld && E.withheld > 0,
  '2 · ⭐⭐⭐ WITHHELD IS COUNTABLE alongside admissible ⇒ 6a stays distinguishable from 6d',
  `M=${E.total} admitted=${E.admissible} withheld=${E.withheld}`)

// ⭐ E3 IS COMPUTED, NEVER STORED — assert there is nowhere on the ledger to stamp it.
const ledgerCols = (await q(
  `select column_name from information_schema.columns
    where table_schema = $1 and table_name = 'log_conversation_revisits'`, [S])).map((r) => r.column_name)
ok(!ledgerCols.some((c) => /exclud|admissib|e3/i.test(c)),
  '2 · ⭐⭐ the ledger has NO admissibility column — E3 is computed at read time, ⛔ never stamped',
  `${ledgerCols.length} columns, none of them an admissibility flag`)

// ⭐ …and the three shapes of the one predicate agree on the same row.
ok(isEvidential(EX) === false && EVIDENTIAL_WHERE.excluded_from_evidence_at === null,
  '2 · ⭐ the single-row predicate agrees with the SQL arm on 56425175', 'isEvidential=false')

// ══ 3 · Q1 — SOUND, NOT COMPLETE. THE BOUND, PINNED ══════════════════════════════════════════════
// Contract §8.1 Q1: E3 establishes what an act was ABOUT; ⛔ not everything it REACHED through tools.

const READ_TOOLS = ['recall_memory', 'recall_own_memory', 'recall_lessons',
  'recall_own_history', 'search_conversations', 'inspect_around']
const [tools] = await q(
  `select count(*)::int as total,
          count(*) filter (where tools_used && $1::text[])::int as with_read_tool,
          count(*) filter (where tools_used && array['search_conversations','recall_own_history'])::int as cross_conv
     from ${S}.log_conversation_revisits`, [READ_TOOLS])
ok(tools.with_read_tool === 5,
  '3 · ⭐ Q1 bound holds: 5 of 78 act records used a READ tool — the residual gap, ⛔ not recoverable',
  `${tools.with_read_tool} of ${tools.total}`)
ok(tools.cross_conv === 2,
  '3 · ⭐ …and 2 reached beyond their conversation via search_conversations (#652, #657)',
  `${tools.cross_conv}`)
// ⛔⛔ WHY THE GAP IS NOT RECOVERABLE: the ledger records tool NAMES, never tool RESULTS.
ok(!ledgerCols.some((c) => /tool_result|tool_output|reached/i.test(c)),
  '3 · ⛔⛔ …and NOTHING records what a tool RETURNED ⇒ ⛔ the gap cannot be narrowed from current data',
  'tools_used holds names only')

// ══ 4 · Q2 — THE TWO READS THAT MUST NEVER BE E3-FILTERED ════════════════════════════════════════
// Contract §8.1 Q2. ⭐⭐ These assertions exist to FAIL if someone ever adds the predicate here: filtering
// the cursor would REWIND THE WATERMARK and re-review reviewed messages — the elision defect arriving
// disguised as a boundary improvement.

const rlh = src('Backend/app/components/reflection-lifecycle-host.js')
ok(!!rlh, '4 · ⛔ ANCHOR: the scan can still see reflection-lifecycle-host.js')
const rlhCode = code(rlh)
const cursorSql = rlhCode.match(/SELECT max\(up_to_rolling_id\)[\s\S]{0,220}?`/)
ok(!!cursorSql, '4 · ⛔ ANCHOR: the cursor query is still findable', cursorSql ? 'found' : 'ANCHOR LOST')
ok(!!cursorSql && !/excluded_from_evidence_at|incognito|evidentialSql/.test(cursorSql[0]),
  '4 · ⭐⭐⭐ THE CURSOR READ IS UNFILTERED, and must stay so — an E3-filtered watermark would REWIND',
  'max(up_to_rolling_id) carries no evidential predicate')

const lint = src('Backend/app/components/memory-lint-host.js')
ok(!!lint, '4 · ⛔ ANCHOR: the scan can still see memory-lint-host.js')
ok(!!lint && /log_conversation_revisits/.test(code(lint)),
  '4 · ⛔ ANCHOR: the lint still reads the ledger')
ok(!!lint && !/excluded_from_evidence_at|evidentialSql|EVIDENTIAL_WHERE/.test(code(lint)),
  '4 · ⭐⭐ THE AUDIT READ IS UNFILTERED, and must stay so — audit is a SOURCE, ⛔ not a consumer',
  'memory-lint-host applies no evidential predicate')

// ══ 5 · O-5b — ACT-LEVEL IMMUTABILITY, AND THE ONE HOLE IN IT ════════════════════════════════════
// ⭐ The audit guarantee is not "rows are never updated"; it is "a CONCLUDED act is never rewritten".
// ⓘ Two of the three UPDATEs enforce that with `AND outcome IS NULL`. ⛔ The completion write does not.

const updates = rlhCode.match(/UPDATE\s+"\$\{schema\}"\."log_conversation_revisits"[\s\S]*?`/g) ?? []
ok(updates.length === 3, '5 · ⛔ ANCHOR: three UPDATEs against the ledger are still findable', `${updates.length} found`)
const guarded = updates.filter((u) => /outcome IS NULL/.test(u)).length
ok(guarded === 2,
  '5 · ⚠️⚠️ CHARACTERIZED, ⛔ NOT ENDORSED: 2 of 3 UPDATEs refuse to touch a concluded act (`AND outcome IS NULL`)',
  `${guarded} of ${updates.length} guarded`)
// ⛔⛔ THE HOLE, PINNED SO THAT CLOSING IT IS A VISIBLE CHANGE: the completion write matches on `id` alone,
// so a failed/preempted attempt whose model call later returns can overwrite its own terminal record.
const completion = updates.find((u) => /SET text =/.test(u))
ok(!!completion, '5 · ⛔ ANCHOR: the completion UPDATE is still findable')
ok(!!completion && !/outcome IS NULL/.test(completion),
  '5 · ⛔⛔ …and the COMPLETION write is UNGUARDED — it can overwrite an already-concluded act',
  'WHERE id = $1::uuid, with no outcome guard')

// ══ 6 · THE OUTCOME AXIS RECORDS EXECUTION, NOT CONCLUSION ═══════════════════════════════════════
// O-4: `completed` means the run finished. It says nothing about what the act concluded.

const outcomes = await q(
  `select outcome, count(*)::int n,
          count(*) filter (where wrote_memory_id is null)::int wrote_nothing
     from ${S}.log_conversation_revisits group by 1 order by 2 desc`)
const byOutcome = Object.fromEntries(outcomes.map((r) => [r.outcome, r]))
ok(outcomes.length === 2 && byOutcome.completed && byOutcome.failed,
  '6 · ⭐ the DATA carries two outcome values only', outcomes.map((r) => `${r.outcome}=${r.n}`).join(' '))
// ⭐ …while the CODE can emit four. `blocked` and `preempted` have never occurred.
const codeOutcomes = ['completed', 'failed', 'blocked', 'preempted'].filter((o) => rlhCode.includes(`'${o}'`))
ok(codeOutcomes.length === 4,
  '6 · ⭐ …while the CODE can emit four — blocked and preempted have never occurred', codeOutcomes.join(' '))
ok(byOutcome.completed?.wrote_nothing === 72,
  '6 · ⭐⭐⭐ 72 of 77 COMPLETED acts wrote NOTHING ⇒ 93.5% of the corpus is one undifferentiated outcome',
  `${byOutcome.completed?.wrote_nothing} of ${byOutcome.completed?.n}`)
// ⚠️ `reason` is named for a justification and carries a lane label.
const [{ distinct_reasons, constant }] = await q(
  `select count(distinct reason)::int distinct_reasons, min(reason) constant
     from ${S}.log_conversation_revisits where reason is not null`)
ok(distinct_reasons === 1,
  '6 · ⚠️ `reason` carries a CONSTANT — a lane label in a field named for a justification',
  `${distinct_reasons} distinct value: "${constant}"`)

// ══ 7 · SUPERSESSION — THE LOCKED LINEAGE MECHANISM, AS IT ACTUALLY BEHAVES ══════════════════════
// Contract §7.1: content is not mutated in place; a content change creates a SUCCESSOR.

const sup = await q(
  `select s.id, s.content = p.content as same_content, p.invalid_at is not null as predecessor_invalidated
     from ${S}.txn_memories s join ${S}.txn_memories p on p.id = s.supersedes_id
    where s.supersedes_id is not null`)
ok(sup.length > 0, '7 · ⭐ supersession pairs exist — the mechanism is in use', `${sup.length} pairs`)
ok(sup.every((r) => r.predecessor_invalidated),
  '7 · ⭐⭐ every predecessor is invalidated — the successor replaces it, ⛔ it does not delete it',
  `${sup.filter((r) => r.predecessor_invalidated).length} of ${sup.length}`)
ok(sup.every((r) => r.same_content === false),
  '7 · ⭐⭐⭐ …and every predecessor KEEPS ITS OWN DIFFERENT VALUE ⇒ state IS recoverable',
  `${sup.filter((r) => r.same_content === false).length} of ${sup.length} differ`)
// ⛔ A superseded row is never hard-deleted — C's lineage must never dangle.
const [{ dangling }] = await q(
  `select count(*)::int dangling from ${S}.txn_memories s
    where s.supersedes_id is not null and not exists (select 1 from ${S}.txn_memories p where p.id = s.supersedes_id)`)
ok(dangling === 0, '7 · ⛔ no supersedes_id dangles — a consolidated input can never be hard-deleted', `${dangling}`)

// ══ 8 · Q3 — THE MEMORY-LAYER EXCLUSION GAP, PINNED AS STILL OPEN ════════════════════════════════
// Contract §1.0.2 and §8.1 Q3: E3 does NOT close this. ⛔ This assertion documents the gap; it will fail
// the day the memory layer learns about exclusion, which is exactly when someone should read it again.

const memFiles = ['memory-store-sequelize-host.js', 'memory-v2-host.js', 'memory-pipeline-host.js']
  .map((f) => ({ f, s: src(`Backend/app/components/${f}`) }))
ok(memFiles.every((m) => !!m.s), '8 · ⛔ ANCHOR: the memory-layer files are still findable',
  memFiles.filter((m) => !m.s).map((m) => m.f).join(' ') || 'all present')
const memAware = memFiles.filter((m) => m.s && /excluded_from_evidence_at|EVIDENTIAL_WHERE|evidentialSql/.test(code(m.s)))
ok(memAware.length === 0,
  '8 · ⛔⛔ CHARACTERIZED, ⛔ NOT ENDORSED: the memory layer has NO exclusion awareness — Q3 is still open',
  `${memAware.length} of ${memFiles.length} memory-layer files mention it`)

// ══ 9 · WHAT DOES NOT EXIST YET — pinned so that building it is a visible event ══════════════════
const tables = (await q(`select tablename from pg_tables where schemaname = $1`, [S])).map((r) => r.tablename)
ok(!tables.some((t) => /dream/i.test(t)),
  '9 · ⛔ no Dreaming table exists — DESIGN phase, and the contract is still the only artifact', `${tables.length} tables`)
const [{ n_episodic, n_card }] = await q(
  `select count(*) filter (where kind = 'episodic')::int n_episodic,
          count(*) filter (where kind = 'card')::int n_card from ${S}.txn_memories`)
ok(n_episodic === 0 && n_card === 0,
  '9 · ⓘ Consolidation is disabled AND its input population is empty — "separate consumer" ≠ "activate it"',
  `episodic=${n_episodic} card=${n_card}`)

await pg.end()
done()
