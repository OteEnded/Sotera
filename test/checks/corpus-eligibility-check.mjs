// ⭐⭐⭐ CORPUS ELIGIBILITY (033) — "this happened, and it is not evidence."
//
//   node test/checks/corpus-eligibility-check.mjs
//
// ── ⚠️⚠️ THE GAP, AFTER THREE INCIDENTS ──────────────────────────────────────────────────────────
// Retrieval eligibility was ONE flag — `incognito = false` — set at create and never patched. The corpus
// had two states and no in-between: *"this never happened for any purpose"* and *"this never happened at
// all"*. ⭐ The in-between is what a measurement needs, and the third incident proved deletion is not
// always available: the contaminating conversation was REAL.
//
// ⛔ This check EXCLUDES NOTHING that outlives it. Its fixture is created and released in the same run.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import {
  evidentialSql, EVIDENTIAL_WHERE, isEvidential, validateExclusion,
  IT_HAPPENED_AND_IT_IS_NOT_EVIDENCE,
} from '../../Backend/app/components/corpus-eligibility.js'

const { check, done } = makeChecker('corpus-eligibility')
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows

// ── 1 · THE AXIS EXISTS, IS SETTABLE AFTER THE FACT, AND EXCLUDED NOTHING ────────────────────────
const cols = await q(
  `select column_name, is_nullable, column_default from information_schema.columns
    where table_schema = $1 and table_name = 'txn_conversations'
      and column_name in ('excluded_from_evidence_at','exclusion_reason','incognito')`, [S])
ok(cols.length === 3, '1 · the exclusion columns exist alongside incognito', cols.map((c) => c.column_name).sort().join(' '))
const excl = cols.find((c) => c.column_name === 'excluded_from_evidence_at')
// ⛔ NO DEFAULT. A default would make a claim about every conversation ever held.
ok(excl?.is_nullable === 'YES' && excl?.column_default === null,
  '1 · ⭐ nullable, no default — NULL means "nobody excluded this", ⛔ not "considered and kept"',
  `nullable=${excl?.is_nullable} default=${excl?.column_default ?? 'none'}`)
const [{ n: alreadyExcluded }] = await q(
  `select count(*)::int n from ${S}.txn_conversations where excluded_from_evidence_at is not null`)
ok(alreadyExcluded === 0,
  '1 · ⛔⛔ NOTHING is excluded — the capability shipped, every use of it is a separate deliberate act',
  `${alreadyExcluded} excluded`)

// ⭐⭐ THE TWO AXES MUST STAY SEPARATE. `incognito` is a privacy promise fixed at create; a promise you
// can revoke later is not a promise, which is exactly why it cannot double as the experiment's tool.
ok(!!cols.find((c) => c.column_name === 'incognito'),
  '1 · ⭐⭐ `incognito` still exists — ⛔ the two questions were not merged into one field')

// ── 2 · EVERY RETRIEVAL PATH SPELLS THE CLAUSE THE SAME WAY ─────────────────────────────────────
// ⭐ A predicate each caller re-types is not a boundary, it is a habit — and the eighth site is the one
// that gets forgotten. ⚠️ ANCHOR FIRST: a scan whose pattern stops matching reports a triumphant pass
// over nothing, which this project has four recorded instances of.
const READERS = [
  ['conversation-retrieval.js', 'evidentialSql'],
  ['conversation-search.js', 'evidentialSql'],
  ['relational-writer.js', 'evidentialSql'],
  ['reflection-lifecycle-host.js', 'evidentialSql'],
  ['memory-distill-host.js', 'EVIDENTIAL_WHERE'],
  ['noticing-pass.js', 'EVIDENTIAL_WHERE'],
  ['disclosure-host.js', 'isEvidential'],
]
for (const [file, needle] of READERS) {
  const src = readFileSync(new URL(`../../Backend/app/components/${file}`, import.meta.url), 'utf8')
  const body = src.replace(/^\s*\/\/[^\n]*$/gm, '')  // ⛔ a mention in a comment is not a call site
  ok(/incognito|conversation/i.test(src), `2 · ⛔ ANCHOR: the scan can still see ${file}`)
  ok(body.includes(needle), `2 · ⭐ ${file} narrows through the shared predicate (${needle})`)
}
// ⛔ AND NO READER MAY SPELL IT ITSELF AGAIN. This is the assertion that keeps the eighth site honest.
for (const [file] of READERS) {
  const src = readFileSync(new URL(`../../Backend/app/components/${file}`, import.meta.url), 'utf8')
  const body = src.replace(/^\s*\/\/[^\n]*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  ok(!/incognito\s*=\s*false|incognito:\s*false/.test(body),
    `2 · ⭐⭐ …and ${file} no longer writes a bare incognito clause of its own`)
}

// ── 3 · THE ROUND TRIP, ON A REAL CONVERSATION ──────────────────────────────────────────────────
// ⛔ agent_dev's room. Created here, released here.
const [dev] = await q(`select id from ${S}.mst_users where username = 'agent_dev'`)
ok(!!dev, '3 · the agent_dev fixture account exists')
let cid = null
if (dev) {
  const [row] = await q(
    `insert into ${S}.txn_conversations (id, user_id, title, incognito, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, false, now(), now()) returning id`,
    [dev.id, '[corpus-eligibility fixture]'])
  cid = row.id

  const evidential = async () => (await q(
    `select count(*)::int n from ${S}.txn_conversations c where c.id = $1 and ${evidentialSql('c')}`, [cid]))[0].n
  ok(await evidential() === 1, '3 · ⭐ a new conversation IS evidence by default')

  await pg.query(
    `update ${S}.txn_conversations set excluded_from_evidence_at = now(), exclusion_reason = $2 where id = $1`,
    [cid, 'fixture for corpus-eligibility-check'])
  ok(await evidential() === 0, '3 · ⭐⭐⭐ …and it stops being evidence AFTER THE FACT — the state that did not exist')

  // ⭐⭐ AND IT IS NOT DELETED, WHICH IS THE WHOLE POINT. The row, its title and its messages remain: the
  // alternative was destroying the record of what a run actually did.
  const [still] = await q(
    `select title, incognito, archived_at, excluded_from_evidence_at, exclusion_reason
       from ${S}.txn_conversations where id = $1`, [cid])
  ok(!!still && still.title === '[corpus-eligibility fixture]' && still.incognito === false && still.archived_at === null,
    '3 · ⭐⭐ …and NOTHING ELSE changed — not deleted, not archived, not made incognito')
  ok(!!still.exclusion_reason, '3 · ⭐ …and it carries a reason a person can evaluate later', still.exclusion_reason)

  // ⭐ The ORM fragment and the SQL fragment must agree, or one arm of retrieval drifts from the other.
  const viaOrm = await q(
    `select count(*)::int n from ${S}.txn_conversations
      where id = $1 and incognito = false and excluded_from_evidence_at is null`, [cid])
  ok(viaOrm[0].n === 0, '3 · ⭐ the ORM predicate and the SQL predicate agree on the same row')
  ok(isEvidential(still) === false && isEvidential({ incognito: false, excluded_from_evidence_at: null }) === true,
    '3 · ⭐ …and so does the single-row predicate the disclosure door uses')

  await pg.query(`delete from ${S}.txn_conversations where id = $1`, [cid])
}

// ── 4 · AN EXCLUSION MUST CARRY A REASON ────────────────────────────────────────────────────────
// ⛔ An exclusion nobody can justify later is indistinguishable from curating the data to make a number
// come out, which is the one thing this capability must never become.
ok(validateExclusion({ reason: 'harness run 2026-08-26, arm B' }).ok === true, '4 · ⭐ a real reason is accepted')
ok(validateExclusion({}).ok === false, '4 · ⛔ …and a missing reason is REFUSED')
ok(validateExclusion({ reason: '   ' }).ok === false, '4 · ⛔ …and so is a blank one')
ok(validateExclusion({ reason: 'test' }).ok === false, '4 · ⛔ …and so is one too short to evaluate')

// ── 5 · THE DELETING CONTRACT SURVIVES ──────────────────────────────────────────────────────────
// ⭐ `test/lib/corpus.mjs` demands TWO independent witnesses before deleting anything, and the title gate
// is what stopped a cleanup eating somebody's real conversation. ⛔ Exclusion must not become a reason to
// weaken it — the new state exists so that deletion is needed LESS, never so that it is needed loosely.
const corpusLib = readFileSync(new URL('../lib/corpus.mjs', import.meta.url), 'utf8')
ok(/witness|probe|title/i.test(corpusLib), '5 · ⛔ ANCHOR: the two-witness deleting contract is still there')
ok(IT_HAPPENED_AND_IT_IS_NOT_EVIDENCE.includes('still happened'),
  '5 · ⭐ the stated intent says an excluded conversation still happened')

await pg.end()
done()
