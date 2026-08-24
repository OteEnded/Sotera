// ⭐⭐ MEMORY LINT · the four properties, as tested contracts.
//
// ⛔ Ote, 2026-08-24: *"read-only · deterministic · idempotent · strictly scoped per owner."* Each of
// those is asserted here rather than described in a comment, because the lint is going to run unattended
// on a schedule and a maintenance job nobody watches is only as safe as its guard.
//
// ⚠️⚠️ AND THE FIFTH ASSERTION IS THE ONE THAT MATTERS MOST, BECAUSE THE LINT SHIPPED WITH THE BUG IT
// GUARDS AGAINST. Two of its eight rules were gated on `db.<table> ? … : null`, and those two tables are
// real but are NOT sequelize models — so both rules were SKIPPED and reported **0**. The lint said
// `orphan-embedding: 0` while a raw query found **1**.
// ⇒ ⭐ a rule whose input is missing must report **NOT RUN**, never zero. A guard that turns an absent
// prerequisite into a clean result fails in the direction that looks healthy, which is worse than a
// crash. §5 asserts the three-valued result exists and that the summary names any rule that did not run.

import { readFileSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB } from '../../Backend/lib/utility.js'
import { lintMemory, lintSummaryLine, LINT_RULES, LIVE_SQL } from '../../Backend/app/components/memory-lint-host.js'

const { check, done } = makeChecker('memory-lint')
const ok = (c, l, d = '') => check(l, c, d)
const db = await initDB(); setDB(db)
const SRC = readFileSync(new URL('../../Backend/app/components/memory-lint-host.js', import.meta.url), 'utf8')
// ⛔⛔ AND THE STRIPPER IS WRITTEN PROPERLY HERE, BECAUSE THE COPIED ONE LET THE TEST PASS FOR THE WRONG
// REASON. The `(^|[^:])//.*` form used elsewhere consumes the character before `//`, so with the `g` flag
// it skips alternate lines in a run of consecutive comments — and this file's own header contains the
// words UPDATE, DELETE, INSERT and TRUNCATE. Three of the four assertions passed only because the header
// writes them with a COMMA after them and the test looked for a trailing SPACE. ⇒ ⭐ the read-only
// guarantee is the lint's most important property; it may not rest on punctuation.
const NL = String.fromCharCode(10)   // ⓘ written this way so no escape survives a scripted edit
const strip = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/)
  .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, '$1'))
  .join(NL)
const CODE = strip(SRC)
// ⭐ SELF-TEST THE STRIPPER before trusting it — an assertion built on a broken helper is worse than none.
ok(!strip('// UPDATE me').includes('UPDATE')
  && !strip('const a = 1 // DELETE me').includes('DELETE')
  && !strip(['// one', '// TRUNCATE two', '// three'].join(NL)).includes('TRUNCATE')
  && strip('const url = "http://x" // c').includes('http://x'),
  '0 · ⭐ the comment stripper actually strips — including consecutive comment lines')

// ── 1 · ⛔ READ-ONLY, asserted against the source ──────────────────────────────────────────────────
// A linter that repairs is a linter nobody dares schedule. Reporting and fixing are different decisions
// with different blast radii, so the ability to write must not exist in this file at all.
// ⚠️ WORD BOUNDARIES, NOT SUBSTRINGS — the first version fired on the word "TRUNCATED" in a log message
// ("⚠️ TRUNCATED: <rule> 200/900"). A read-only guard that cries wolf on its own prose is a guard someone
// switches off, so it has to be precise about what it forbids.
for (const verb of ['UPDATE', 'DELETE', 'INSERT', 'TRUNCATE', 'DROP', 'ALTER']) {
  ok(!new RegExp(`\b${verb}\b`).test(CODE), `1 · ⛔ the lint contains no SQL "${verb}" — it reports, it never repairs`)
}
for (const call of ['.destroy(', '.update(', '.create(', '.bulkCreate(', '.upsert(']) {
  ok(!CODE.includes(call), `1 · ⛔ …and no model write call "${call}"`)
}
ok((CODE.match(/SELECT/g) ?? []).length >= 6, '1 · …and it is made of SELECTs', `${(CODE.match(/SELECT/g) ?? []).length} SELECT(s)`)

// ── 2 · ⭐ LIVENESS IS WRITTEN ONCE, and it is the RIGHT predicate ─────────────────────────────────
// ⛔ The mistake that started this: an operator hand-wrote integrity SQL checking only `expired_at`,
// found a slot with "two live memories", and reported a canon violation that did not exist. The store's
// own definition is `LIVE = { invalid_at: null, expired_at: null }` — BOTH.
ok(/invalid_at IS NULL/.test(LIVE_SQL) && /expired_at IS NULL/.test(LIVE_SQL),
  '2 · ⭐⭐ liveness requires BOTH invalid_at AND expired_at to be null', LIVE_SQL)
const storeSrc = readFileSync(new URL('../../Backend/app/components/memory-store-sequelize-host.js', import.meta.url), 'utf8')
ok(/const LIVE = \{ invalid_at: null, expired_at: null \}/.test(storeSrc),
  '2 · ⛔ …and it still matches the STORE\'s own definition — if the store changes, this check fails first')
// the predicate must not be spelled a second time in the lint with only one column
ok(!/expired_at IS NULL(?![\s\S]{0,40}invalid_at)/.test(CODE.replace(LIVE_SQL, '')),
  '2 · ⛔ no rule re-derives a one-column liveness test of its own')

// ── 3 · ⭐ DETERMINISTIC + IDEMPOTENT · two consecutive runs are byte-identical ─────────────────────
// ⚠️ Idempotence is trivial for a read-only tool — which is exactly why it is worth PROVING rather than
// assuming: the assertion is what will fail on the day somebody adds a repair step.
const a = await lintMemory(db)
const b = await lintMemory(db)
ok(JSON.stringify(a) === JSON.stringify(b), '3 · ⭐ two consecutive runs are byte-identical')
ok(!/Date\.now\(|new Date\(|Math\.random\(|LIMIT 1\b/.test(CODE),
  '3 · ⛔ no clock, no randomness, no implicit sampling in the rules')
ok(a.ok === true, '3 · the run completed', lintSummaryLine(a))

// ── 4 · ⭐⭐ PER-OWNER · scoping is real, and content is not fetched by default ─────────────────────
const pg = devPg(); await pg.connect()
const S = devSchema()
const { rows: users } = await pg.query(
  `select id::text id, username from ${S}.mst_users where username in ('agent_dev','hermes') order by username`)
ok(users.length >= 1, '4 · a test owner to scope to', users.map((u) => u.username).join(', '))
if (users.length) {
  const one = users[0]
  const scoped = await lintMemory(db, { userId: one.id })
  ok(scoped.scope.userId === one.id && scoped.scope.allOwners === false,
    '4 · the report STATES its own scope — a report that cannot say what it looked at cannot be compared', JSON.stringify(scoped.scope))
  // ⛔ THE ACTUAL ISOLATION ASSERTION: every finding in a scoped run belongs to that owner.
  const foreign = scoped.owners.filter((o) => o.ownerId && o.ownerId !== one.id)
  ok(foreign.length === 0,
    `4 · ⛔⛔ a scoped run reports NO other owner's rows — Sotera is multi-tenant in one process`,
    foreign.length ? `LEAKED: ${foreign.map((o) => o.username ?? o.ownerId).join(', ')}` : `only ${one.username}`)
  // and it must be a SUBSET of the unscoped run, never something new
  const scopedIds = new Set(scoped.owners.flatMap((o) => o.findings.map((f) => `${f.rule}:${f.id}`)))
  const allIds = new Set(a.owners.flatMap((o) => o.findings.map((f) => `${f.rule}:${f.id}`)))
  ok([...scopedIds].every((k) => allIds.has(k)),
    '4 · …and its findings are a SUBSET of the unscoped run')
  // ⛔ CONTENT: not merely unprinted — NOT FETCHED. `left(m.content, …)` must be absent from the SQL
  // when includeContent is false, so a belief never leaves the database.
  const noContent = scoped.owners.flatMap((o) => o.findings).filter((f) => 'excerpt' in f)
  ok(noContent.length === 0,
    '4 · ⛔⛔ no finding carries CONTENT by default — an integrity report is not a disclosure surface',
    noContent.length ? `${noContent.length} finding(s) carried an excerpt` : 'ids and counts only')
  ok(/includeContent \? ', left\(m\.content/.test(CODE),
    '4 · ⭐ …and content is gated in the SQL itself, so it is NOT FETCHED rather than merely not printed')
}
await pg.end()

// ── 5 · ⛔⛔ NOT-RUN IS NOT ZERO · the bug this file shipped with ───────────────────────────────────
ok('notRun' in a, '5 · ⭐ the report distinguishes "did not run" from "found nothing"', JSON.stringify(a.notRun))
const nulls = Object.entries(a.totals).filter(([, n]) => n === null).map(([k]) => k)
ok(nulls.every((k) => k in a.notRun),
  '5 · ⛔ every null total has a recorded REASON — a rule cannot be silently absent', nulls.join(', ') || 'no nulls')
ok(Object.keys(a.notRun).length === 0,
  '5 · ⭐⭐ …and RIGHT NOW every rule actually ran', Object.keys(a.notRun).join(', ') || `all ${LINT_RULES.length} rules executed`)
ok(!/db\.txn_message_embeddings \?|db\.log_reflections \?/.test(CODE),
  '5 · ⛔ raw tables are not gated on model presence — they are real tables that are not sequelize models')
const line = lintSummaryLine({ ...a, notRun: { 'orphan-embedding': 'test' }, totals: { ...a.totals, 'orphan-embedding': null } })
ok(/DID NOT RUN/.test(line), '5 · ⭐ and the one-line log form SHOUTS when a rule did not run', line.slice(0, 90))

// ── 6 · ⭐ EVERY RULE IS DECLARED, AND ZERO IS REPORTED ────────────────────────────────────────────
// "0 of 8 rules fired" is a result; a silent pass is not.
ok(LINT_RULES.length >= 8, '6 · the rule set is declared as data', `${LINT_RULES.length} rules`)
ok(LINT_RULES.every((r) => r.id && r.severity && r.what), '6 · every rule names itself and what it looks for')
ok(LINT_RULES.every((r) => r.id in a.totals), '6 · ⭐ every rule appears in the report whether or not it fired')
ok(LINT_RULES.every((r) => ['defect', 'suspect', 'info'].includes(r.severity)),
  '6 · ⛔ severity is one of defect|suspect|info — a "suspect" must not be reported as a defect')
// ⭐ dead-slot is deliberately SUSPECT, not defect: a slot is a NAME and may outlive its belief.
ok(LINT_RULES.find((r) => r.id === 'dead-slot')?.severity === 'suspect',
  '6 · ⭐ dead-slot is a SUSPECT — it needs a retention rule before it can be called a defect')

// ── 7 · ⓘ THE CURRENT STATE, recorded not asserted ────────────────────────────────────────────────
// ⚠️ Deliberately not "must be zero". A defect count is a FINDING for a human, and a check that fails
// the suite on it would make the daily run hostage to whatever the store happens to contain.
ok(true, '7 · ⓘ current store state', lintSummaryLine(a))
for (const o of a.owners) ok(true, `7 · ⓘ ${o.username ?? o.ownerId ?? '(unattributed)'}`, JSON.stringify(o.counts))

done()
