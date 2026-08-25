// ⭐⭐⭐ MEMORY LINT — the integrity checker the memory graph never had.
//
// ⛔ Ote, 2026-08-24: *"read-only · deterministic · idempotent · strictly scoped per owner · suitable for
// the existing pg-maintenance shape… We shouldn't have to discover memory-integrity violations
// accidentally while investigating something else."*
//
// ── ⚠️⚠️ WHY THIS EXISTS, AND THE HONEST VERSION OF THE REASON ────────────────────────────────────
//
// Not because a dramatic defect was found. ⛔ The dramatic one was WITHDRAWN: I reported a slot holding
// two live memories — a violation of one-live-belief-per-slot — and it was my query that was wrong, not
// the store. Liveness here is `invalid_at IS NULL AND expired_at IS NULL`; I checked only `expired_at`,
// and the older row had `invalid_at` set, so the supersede had fired correctly all along.
//
// ⭐⭐ THAT IS THE ACTUAL ARGUMENT. An operator hand-writing integrity SQL got the liveness rule wrong on
// a store of 43 rows. So the predicate is written down ONCE, here, with the reason beside it, and nobody
// re-derives it under time pressure. What stands on the evidence:
//   · one real dangling reference (an orphan embedding whose message is gone);
//   · FOUR integrity defects to date, every one found by accident while investigating something else —
//     an untraceable persona-authored row (a suite happened to run), two write lanes recording
//     provenance differently (found investigating that), 73 harness conversations that broke an
//     unrelated fixture, and the orphan embedding (found looking for something else).
//
// ── ⛔ THE FOUR PROPERTIES, AND EACH IS A TESTED CONTRACT (checks/memory-lint-check.mjs) ───────────
//
//   READ-ONLY    ⛔ every statement below is a SELECT. No UPDATE, DELETE, INSERT or TRUNCATE appears in
//                this file, and the check greps for them. A linter that repairs is a linter nobody dares
//                schedule — reporting and fixing are different decisions with different blast radii.
//   DETERMINISTIC  no clock, no sampling, no LLM. Same rows in ⇒ same findings out, ordered by id.
//   IDEMPOTENT   trivially, because it writes nothing — and the check proves two consecutive runs are
//                byte-identical rather than assuming it.
//   PER-OWNER    ⭐⭐ THE ONE THAT IS NOT OBVIOUS AND MATTERS MOST. Sotera is multi-tenant in ONE process.
//                Every finding is attributed to the owner whose room it lives in, and `{ userId }` scopes
//                the whole run to that owner. ⛔ AND CONTENT IS NEVER INCLUDED BY DEFAULT: a finding
//                carries ids, counts and column names — never a belief. An integrity report that prints
//                what someone believes is a disclosure surface wearing a maintenance hat.
//                ⓘ `includeContent: true` exists for a human debugging ONE owner deliberately. The cron
//                pass never sets it, and the shape of a logged line is counts only.

// ⭐ THE ONLY IMPORT THIS FILE HAS, AND IT IS A PURE PREDICATE. `memory-self-state-claim.js` imports
// nothing itself, so the linter stays side-effect free and cheap to load — the property that lets a check
// read this module without booting anything.
// ⛔ The rule is NOT reimplemented here. The write gate and this audit must agree by construction, because
// the whole point of the audit is to find what the gate would refuse today.
import { admissible } from './memory-self-state-claim.js'

/**
 * ⭐ LIVENESS, WRITTEN ONCE. `memory-store-sequelize-host.js` defines `LIVE = { invalid_at: null,
 * expired_at: null }` — BOTH null. A supersede sets `invalid_at`; decay/archive sets `expired_at`.
 * ⛔ Checking only one of them is the mistake that produced a false canon violation on 2026-08-24.
 */
export const LIVE_SQL = 'invalid_at IS NULL AND expired_at IS NULL'

/**
 * ⭐ THE SAME PREDICATE, QUALIFIED FOR A JOINED QUERY. Added 2026-08-25 for `room-scope.js`, where the
 * memory count rides a LEFT JOIN beside `mst_users`.
 * ⚠️ It exists so nobody relies on *"`mst_users` happens to have no `expired_at` today"* — an unqualified
 * predicate that is unambiguous only by accident is a column-addition away from silently changing meaning.
 * ⛔ Derived from `LIVE_SQL`, never retyped: one rule, two renderings, and the second cannot drift.
 * ⛔ AND IT MUST RIDE THE JOIN, NOT THE WHERE, wherever the query also counts rooms — moving it to WHERE
 * turns a LEFT JOIN into an inner one and silently drops every room that holds no live memory.
 */
export const liveSqlFor = (alias) => LIVE_SQL.replace(/\b(invalid_at|expired_at)\b/g, `${alias}.$1`)

/**
 * The rules, declared as data so the report can name what it looked for even when it finds nothing —
 * ⭐ "0 of 7 rules fired" is a result; a silent pass is not.
 *
 * `severity`:
 *   defect  — an invariant is broken. Someone must decide what to do.
 *   suspect — legal but usually wrong. Needs a rule before it can be called either way.
 *   info    — a count worth watching, never a problem on its own.
 */
export const LINT_RULES = Object.freeze([
  { id: 'duplicate-live-slot', severity: 'defect',
    what: 'more than one LIVE memory in a single slot — one-live-belief-per-slot is the canon' },
  { id: 'dangling-slot', severity: 'defect',
    what: 'a memory whose slot_id names a slot that no longer exists' },
  { id: 'dangling-supersedes', severity: 'defect',
    what: 'a memory whose supersedes_id names a memory that no longer exists — the history it claims to replace is gone' },
  { id: 'dangling-subject-person', severity: 'defect',
    what: 'a memory whose subject_person_id names a person that no longer exists — R4 territory: a belief about nobody' },
  { id: 'dangling-source-message', severity: 'suspect',
    what: 'a memory whose source_message_id names a message that no longer exists. ⚠️ SUSPECT, not defect: a deleted conversation legitimately leaves this behind, and the memory itself may still be valid' },
  { id: 'orphan-embedding', severity: 'defect',
    what: 'an embedding whose message is gone — a retrieval candidate with no text behind it. ⚠️ Broader than sweepOrphanEmbeddings, which requires the conversation to be gone TOO (AND, not OR), so these survive its pass' },
  { id: 'untraceable-persona-authorship', severity: 'defect',
    what: "a memory attributed to HER with no traceable occasion — no reflection link, no source string, and no resolvable source_message_id. Authorship must be earned by an occasion, never assigned" },
  { id: 'dead-slot', severity: 'suspect',
    what: 'a slot with no LIVE memory. ⚠️ SUSPECT: a slot is a NAME, and a name may legitimately outlive the belief it held. It needs a retention rule before it can be called a defect' },
  // ⭐⭐⭐ THE OTHER END OF THE F4 GATE. `memory-self-state-claim.js` refuses these at the WRITE door as of
  // 2026-08-25; nothing had ever looked at the rows written before it existed. A gate is not an audit —
  // it protects the future and says nothing about the past, and the past is where the measured row lives.
  // ⛔ SUSPECT, NOT DEFECT, AND DELIBERATELY: retiring a row is Ote's act, not the linter's. The gate's own
  // text says so — *"an existing row is not hidden by this; the rows already written are Ote's to retire."*
  { id: 'live-self-state-claim', severity: 'suspect',
    what: "a LIVE semantic row asserting what her own memory contains or can reach — the shape the F4 write gate now refuses. ⚠️ SUSPECT: it names rows for a human to judge, and retiring one is a decision with an owner. ⓘ This is the ONE rule that reads content in order to decide; it still reports ids and a pattern name only, never the belief" },
])

const qualified = (model) => {
  const { tableName, schema } = model.getTableName()
  return schema ? `"${schema}"."${tableName}"` : `"${tableName}"`
}

/**
 * Run the lint. ⛔ READ-ONLY.
 *
 * @param {object} db  the sequelize model bag (fastify.db)
 * @param {{ userId?: string|null, includeContent?: boolean, limitPerRule?: number }} opts
 *   userId          restrict the entire run to one owner's room. null = every owner, still ATTRIBUTED per owner.
 *   includeContent  ⚠️ include a clipped excerpt on each finding. Default FALSE. Never set by the cron pass.
 *   limitPerRule    cap the rows returned per rule (the COUNT is always exact and unaffected) — so a
 *                   pathological store cannot produce an unbounded report. ⭐ And the cap is REPORTED when
 *                   it bites, because a silently truncated integrity report is worse than none.
 * @returns {Promise<object>} { ok, scope, rules, owners[], totals, truncated[] }
 */
export async function lintMemory(db, { userId = null, includeContent = false, limitPerRule = 200 } = {}) {
  if (!db?.txn_memories || !db?.mst_slots || !db?.txn_messages) {
    return { ok: false, skipped: true, reason: 'models unavailable' }
  }
  const seq = db.txn_memories.sequelize
  const MEM = qualified(db.txn_memories)
  const SLOT = qualified(db.mst_slots)
  const MSG = qualified(db.txn_messages)
  const CONV = qualified(db.txn_conversations)
  const PERSON = qualified(db.mst_persons)
  const USER = qualified(db.mst_users)
  // ⛔⛔ AND THIS IS WHERE THE FIRST VERSION OF THIS FILE WAS WRONG, IN THE WORST DIRECTION.
  //
  // `txn_message_embeddings` and `log_reflections` are REAL TABLES that are NOT sequelize models —
  // they are reached by raw SQL elsewhere in the codebase. The first version gated their two rules on
  // `db.<name> ? … : null`, so both were SKIPPED and reported **0**. The lint said `orphan-embedding: 0`
  // while a raw query found **1**.
  //
  // ⭐⭐ THE LESSON IS NOT "look up the table properly". It is that **a rule whose input is missing must
  // report NOT RUN, never zero.** A guard that turns an absent prerequisite into a clean result is the
  // allowlist family again — it drops what it was not told about, and it does so in the direction that
  // looks healthy. That is worse than a crash. So existence is CHECKED, and the answer is three-valued:
  // a count, or `null` meaning not run, with the reason recorded.
  const { schema } = db.txn_memories.getTableName()
  const rawTable = (name) => (schema ? `"${schema}"."${name}"` : `"${name}"`)
  // ⚠️ `pg_tables`, NOT `information_schema.tables` — and this is a real trap. information_schema's
  // columns are DOMAIN types (`sql_identifier`), which sequelize returns as POSITIONAL ARRAYS rather
  // than named objects, so `r.table_name` is `undefined` for every row and the set comes back empty.
  // ⇒ the existence check would have reported every table missing, which (thanks to the three-valued
  // result above) at least fails loudly instead of reporting a clean store.
  const present = new Set((await seq.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = :schema`,
    { type: seq.QueryTypes.SELECT, replacements: { schema } })).map((r) => r.tablename))
  const EMB = present.has('txn_message_embeddings') ? rawTable('txn_message_embeddings') : null
  const REFL = present.has('log_reflections') ? rawTable('log_reflections') : null
  const notRun = {}
  if (!EMB) notRun['orphan-embedding'] = 'table txn_message_embeddings not found'
  if (!REFL) notRun['untraceable-persona-authorship'] = 'table log_reflections not found'

  const Q = (sql, replacements = {}) => seq.query(sql, { type: seq.QueryTypes.SELECT, replacements })
  // ⭐ ONE owner filter, spelled once, so no rule can accidentally run unscoped.
  const own = (col) => (userId ? `AND ${col} = :userId` : '')
  const rep = { userId, cap: limitPerRule }
  // ⚠️ The excerpt is clipped in SQL rather than in JS so the content never leaves the database when
  // `includeContent` is false — not merely unprinted, NOT FETCHED.
  const excerpt = includeContent ? ', left(m.content, 120) AS excerpt' : ''

  const findings = []
  const truncated = []
  const add = (ruleId, rows) => {
    if (rows.length > limitPerRule) truncated.push({ rule: ruleId, shown: limitPerRule, total: rows.length })
    for (const r of rows.slice(0, limitPerRule)) findings.push({ rule: ruleId, ...r })
  }

  // ── 1 · duplicate-live-slot ─────────────────────────────────────────────────────────────────────
  add('duplicate-live-slot', await Q(
    `SELECT m.slot_id::text AS id, m.user_id::text AS owner_id, count(*)::int AS n
       FROM ${MEM} m
      WHERE m.slot_id IS NOT NULL AND ${liveSqlFor('m')} ${own('m.user_id')}
      GROUP BY 1, 2 HAVING count(*) > 1
      ORDER BY 1`, rep))

  // ── 2 · dangling references ─────────────────────────────────────────────────────────────────────
  const dangling = [
    ['dangling-slot', 'm.slot_id', SLOT],
    ['dangling-supersedes', 'm.supersedes_id', MEM],
    ['dangling-subject-person', 'm.subject_person_id', PERSON],
    ['dangling-source-message', 'm.source_message_id', MSG],
  ]
  for (const [ruleId, col, target] of dangling) {
    add(ruleId, await Q(
      `SELECT m.id::text AS id, m.user_id::text AS owner_id, ${col}::text AS points_at${excerpt}
         FROM ${MEM} m
        WHERE ${col} IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ${target} t WHERE t.id = ${col}) ${own('m.user_id')}
        ORDER BY m.id`, rep))
  }

  // ── 3 · orphan-embedding ────────────────────────────────────────────────────────────────────────
  // ⚠️ Attributed through the CONVERSATION, because an embedding has no user_id of its own. An orphan
  // whose conversation is ALSO gone has no owner to attribute it to — it is reported with owner null and
  // is therefore invisible to a scoped run. ⭐ Stated rather than hidden: a scoped run cannot see
  // fully-orphaned rows, so the unscoped pass is the one that catches them.
  if (EMB) {
    add('orphan-embedding', await Q(
      `SELECT e.message_id::text AS id, c.user_id::text AS owner_id, e.conversation_id::text AS points_at
         FROM ${EMB} e
         LEFT JOIN ${CONV} c ON c.id = e.conversation_id
        WHERE NOT EXISTS (SELECT 1 FROM ${MSG} m WHERE m.id = e.message_id)
          ${userId ? 'AND c.user_id = :userId' : ''}
        ORDER BY 1`, rep))
  }

  // ── 4 · untraceable-persona-authorship ──────────────────────────────────────────────────────────
  // ⭐ The three traceability routes, matching checks/memory-author-check.mjs §N exactly — a reflection
  // that recorded the write, a `source` string naming where it came from, or a source_message_id that
  // RESOLVES. ⛔ The last is a JOIN, not a NOT NULL: a dangling id is an occasion that no longer exists.
  if (REFL) {
    add('untraceable-persona-authorship', await Q(
      `SELECT m.id::text AS id, m.user_id::text AS owner_id, m.created_at${excerpt}
         FROM ${MEM} m
        WHERE m.author = 'persona'
          AND m.content NOT LIKE 'zz_test%'
          AND NOT EXISTS (SELECT 1 FROM ${REFL} r WHERE r.wrote_memory_id = m.id)
          AND coalesce(m.source, '') = ''
          AND NOT EXISTS (SELECT 1 FROM ${MSG} x WHERE x.id = m.source_message_id)
          ${own('m.user_id')}
        ORDER BY m.id`, rep))
  }

  // ── 5 · dead-slot ───────────────────────────────────────────────────────────────────────────────
  add('dead-slot', await Q(
    `SELECT s.id::text AS id, s.user_id::text AS owner_id, s.entity, s.write_count
       FROM ${SLOT} s
      WHERE NOT EXISTS (
        SELECT 1 FROM ${MEM} m
         WHERE m.slot_id = s.id AND ${liveSqlFor('m')}) ${own('s.user_id')}
      ORDER BY s.id`, rep))

  // ── 6 · live-self-state-claim ───────────────────────────────────────────────────────────────────
  //
  // ⚠️⚠️ THE ONE RULE THAT MUST READ CONTENT, AND THE GUARANTEE IS NARROWED IN WRITING RATHER THAN BROKEN.
  // Everywhere else content is gated in the SQL so a belief never leaves the database. Here the predicate
  // IS a text predicate, so the row's content is fetched, matched, and dropped on the floor: it is bound to
  // a local, never reaches a finding, and `excerpt` still rides `includeContent` like every other rule.
  // ⛔ THE ALTERNATIVE WAS WORSE. Translating seven JS regexes into Postgres `~*` would put the predicate in
  // two dialects that agree until the day they quietly do not — and this project has paid for a duplicated
  // predicate more than once. ⇒ ONE implementation, in the file that owns it, called from here.
  //
  // ⭐ `admissible()` is asked the whole question — kind, attribute and content together — rather than
  // `isSelfStateClaim()` alone, so the exemptions (identity, episodic, lesson, practice, declined) are the
  // gate's, not a second opinion. An episode recording *"I looked and found nothing"* is a true dated
  // record and must never appear here.
  {
    const candidates = await Q(
      `SELECT m.id::text AS id, m.user_id::text AS owner_id, m.kind, m.attribute, m.content,
              m.created_at${excerpt}
         FROM ${MEM} m
        WHERE ${liveSqlFor('m')} ${own('m.user_id')}
        ORDER BY m.id`, rep)
    const hits = []
    for (const row of candidates) {
      const verdict = admissible(row)
      if (verdict.ok) continue
      // ⛔ `content` is destructured OUT here. A finding carries the id, the owner, the date and WHICH
      // pattern fired — never the sentence, which is the thing the report exists to avoid publishing.
      const { content, ...safe } = row
      hits.push({ ...safe, pattern: verdict.why })
    }
    add('live-self-state-claim', hits)
  }

  // ── SHAPE THE REPORT · per owner, counts first ──────────────────────────────────────────────────
  const names = new Map()
  if (USER) {
    const ids = [...new Set(findings.map((f) => f.owner_id).filter(Boolean))]
    if (ids.length) {
      // ⚠️ `IN (:ids)`, not `= ANY(:ids)` — sequelize expands a replacement array into a comma list,
      // which is a value list rather than an array literal, and ANY() needs the latter.
      for (const r of await Q(`SELECT id::text AS id, username FROM ${USER} WHERE id IN (:ids)`, { ids })) {
        names.set(r.id, r.username)
      }
    }
  }
  const bySeverity = Object.fromEntries(LINT_RULES.map((r) => [r.id, r.severity]))
  const owners = new Map()
  for (const f of findings) {
    const key = f.owner_id ?? '(unattributed)'
    if (!owners.has(key)) owners.set(key, { ownerId: f.owner_id ?? null, username: names.get(f.owner_id) ?? null, counts: {}, findings: [] })
    const o = owners.get(key)
    o.counts[f.rule] = (o.counts[f.rule] || 0) + 1
    o.findings.push(f)
  }
  const totals = {}
  for (const f of findings) totals[f.rule] = (totals[f.rule] || 0) + 1
  const defects = findings.filter((f) => bySeverity[f.rule] === 'defect').length
  const suspects = findings.filter((f) => bySeverity[f.rule] === 'suspect').length

  return {
    ok: true,
    // ⭐ THE SCOPE IS PART OF THE RESULT. A report that does not say what it looked at cannot be compared
    // to the one before it — the same reason every measurement cell in this project records its arm.
    scope: { userId: userId ?? null, allOwners: !userId, includeContent, limitPerRule },
    rules: LINT_RULES,
    // ⭐ ZERO IS A RESULT: every rule appears, whether or not it fired.
    // ⛔ AND `null` IS A DIFFERENT RESULT FROM 0 — it means the rule could not run. Never conflate them.
    totals: Object.fromEntries(LINT_RULES.map((r) => [r.id, r.id in notRun ? null : (totals[r.id] ?? 0)])),
    notRun,
    summary: { defects, suspects, owners: owners.size },
    owners: [...owners.values()].sort((a, b) => String(a.username ?? '').localeCompare(String(b.username ?? ''))),
    truncated,
  }
}

/** A one-line log form for the cron pass. ⛔ COUNTS ONLY — never a belief, never an owner's content. */
export function lintSummaryLine(report) {
  if (!report?.ok) return `skipped (${report?.reason ?? 'unknown'})`
  const fired = Object.entries(report.totals).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`)
  // ⛔ A RULE THAT DID NOT RUN IS NAMED IN THE SUMMARY. Reporting "all rules clean" while two of them
  // never executed is the exact failure this file was built with and then corrected.
  const skipped = Object.keys(report.notRun ?? {})
  return `${report.summary.defects} defect(s), ${report.summary.suspects} suspect(s) across `
    + `${report.summary.owners} owner(s)${fired.length ? ` · ${fired.join(' ')}` : ' · no rule fired'}`
    + `${skipped.length ? ` ⛔ ${skipped.length} RULE(S) DID NOT RUN: ${skipped.join(', ')}` : ''}`
    + `${report.truncated.length ? ` ⚠️ TRUNCATED: ${report.truncated.map((t) => `${t.rule} ${t.shown}/${t.total}`).join(', ')}` : ''}`
}
