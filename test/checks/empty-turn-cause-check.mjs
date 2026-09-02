// ⭐⭐⭐ AN EMPTY TURN SAYS WHY — 043's classification and cause. ⛔ READ-ONLY + DB red-proofs. No model.
//
//   node test/checks/empty-turn-cause-check.mjs
//
// Ote's ruling, 2026-09-02:
//   · ONE high-level `empty_assistant_turn` classification, with a SEPARATE cause
//   · causes distinguish at minimum `client_disconnect` and `generation_empty`
//   · a client disconnect is NOT automatically an error — `error = NULL` unless an independent failure
//   · `generation_empty` IS a real generation failure even with no provider error
//   · explicit `provider_request_failed` keeps its existing class — ⛔ never collapsed into generation_empty
//   · class D (reasoning + a pure tool call) stays legitimate and must not be touched
//   · ⛔ "preserve the exact existing behavior for successful generations and explicit provider failures"
//   · ⛔ "don't rewrite the historical rows"
//
// ⭐ THE DECISION LOGIC IS RE-DERIVED FROM THE SOURCE, NOT RETYPED. The seam is inside a 4000-line route
// handler and cannot be imported, so the check reads the file and asserts the SHAPE of the branch — then
// proves the DATABASE half against real inserts. ⚠️ A source scan whose anchor goes missing stops scanning
// silently, so the anchor is asserted first.

import { readFileSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('empty-turn-cause')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const MARK = 'zz_emptyturn_'
let convo = null

try {
  const agent = await one(`select id::text from ${S}.mst_users where username='agent_dev'`)
  check('0 · agent_dev resolves — ⛔ never root', Boolean(agent?.id))

  // ── A · THE VOCABULARY AND THE PAIRING, IN THE DATABASE ───────────────────────────────────────
  const ck = await one(
    `select pg_get_constraintdef(oid) as def from pg_constraint where conname='txn_messages_empty_turn_ck'`)
  check('A1 · ⭐ the paired CHECK exists', Boolean(ck?.def))
  for (const cause of ['client_disconnect', 'generation_empty', 'provider_request_failed']) {
    check(`A2 · ⭐ the vocabulary carries ${cause}`, String(ck?.def ?? '').includes(cause))
  }

  const c = await one(
    `insert into ${S}.txn_conversations (id, user_id, title, incognito, settings, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, false, '{}'::jsonb, now(), now()) returning id::text as id`,
    [agent.id, `${MARK}fixture`])
  convo = c.id
  const insert = async (fields) => {
    const keys = ['role', 'content', 'reasoning', 'tool_calls', 'error', 'empty_turn', 'empty_turn_cause']
    const vals = keys.map((k) => (fields[k] === undefined ? null : fields[k]))
    const r = await q(
      `insert into ${S}.txn_messages
         (id, conversation_id, role, content, reasoning, tool_calls, error, empty_turn, empty_turn_cause,
          created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, now(), now())
       returning id::text as id`, [convo, ...vals])
    return r[0]
  }
  const refused = async (fields) => {
    try { await insert(fields); return false } catch { return true }
  }

  // ⭐⭐ THE PAIRING RED-PROOFS — "classified" may never be half-true.
  check('A3 · ⛔ a classification with NO cause is REFUSED — that would be the old ambiguity, renamed',
    await refused({ role: 'assistant', content: '', empty_turn: 'empty_assistant_turn' }))
  check('A4 · ⛔ a cause with NO classification is REFUSED — it would be unfindable',
    await refused({ role: 'assistant', content: '', empty_turn_cause: 'generation_empty' }))
  check('A5 · ⛔ an unrecognised cause is REFUSED — a closed vocabulary, enforced below the code',
    await refused({ role: 'assistant', content: '', empty_turn: 'empty_assistant_turn', empty_turn_cause: 'zz_invented' }))
  check('A6 · ⛔ and an unrecognised CLASSIFICATION is refused too',
    await refused({ role: 'assistant', content: '', empty_turn: 'zz_invented', empty_turn_cause: 'generation_empty' }))

  // ── B · ⭐⭐ THE TWO NEW CAUSES ARE STORABLE IN THE SHAPE OTE RULED ───────────────────────────
  // B1 · client_disconnect carries NO error.
  const dis = await insert({
    role: 'assistant', content: '', empty_turn: 'empty_assistant_turn', empty_turn_cause: 'client_disconnect',
  })
  const disRow = await one(`select error, empty_turn, empty_turn_cause from ${S}.txn_messages where id=$1`, [dis.id])
  check('B1 · ⭐⭐⭐ client_disconnect is storable with error = NULL — a disconnect is not a fault',
    disRow?.error === null && disRow?.empty_turn_cause === 'client_disconnect')

  // B2 · generation_empty carries a NAMED error object.
  const gen = await insert({
    role: 'assistant', content: '', empty_turn: 'empty_assistant_turn', empty_turn_cause: 'generation_empty',
    error: JSON.stringify({ code: 'generation_empty', message: 'the model produced no output and the provider reported no error' }),
  })
  const genRow = await one(`select error, empty_turn_cause from ${S}.txn_messages where id=$1`, [gen.id])
  check('B2 · ⭐⭐ generation_empty carries a NAMED error — a real failure even with no provider error',
    genRow?.error?.code === 'generation_empty' && /no output/.test(String(genRow?.error?.message)))
  // ⭐ AND IT IS AN OBJECT, WHICH THE OLD STRING WAS NOT. The message list reads
  // `m.error.message || m.error.code || 'error'`, so a bare string rendered as a flat "error" and the
  // text was lost. This asserts the reason survives the round trip a reader actually performs.
  check('B2 · ⭐⭐ and the UI projection recovers the reason — ⛔ not a generic "error"',
    (genRow.error.message || genRow.error.code || 'error') !== 'error')

  // B3 · provider_request_failed keeps its own class and its own error, verbatim.
  const prov = await insert({
    role: 'assistant', content: '', empty_turn: 'empty_assistant_turn', empty_turn_cause: 'provider_request_failed',
    error: JSON.stringify({ code: 'provider_request_failed', message: 'fetch failed' }),
  })
  const provRow = await one(`select error, empty_turn_cause from ${S}.txn_messages where id=$1`, [prov.id])
  check('B3 · ⛔ provider_request_failed keeps its OWN class — never collapsed into generation_empty',
    provRow?.error?.code === 'provider_request_failed' && provRow?.empty_turn_cause === 'provider_request_failed')

  // ── C · ⛔ WHAT MUST NOT CHANGE ───────────────────────────────────────────────────────────────
  // C1 · a NORMAL generation is unclassified.
  const ok = await insert({ role: 'assistant', content: `${MARK}a perfectly ordinary reply` })
  const okRow = await one(`select content, error, empty_turn, empty_turn_cause from ${S}.txn_messages where id=$1`, [ok.id])
  check('C1 · ⛔ a successful generation is UNCLASSIFIED and carries no error',
    okRow?.empty_turn === null && okRow?.empty_turn_cause === null && okRow?.error === null)

  // C2 · ⭐ CLASS D — reasoning + a pure tool call. Content is empty BY DESIGN and it is NOT a defect.
  const toolRound = await insert({
    role: 'assistant', content: '', reasoning: `${MARK}deciding which tool to reach for`,
    tool_calls: JSON.stringify([{ name: 'recall_memory', args: {} }]),
  })
  const trRow = await one(
    `select content, reasoning, tool_calls, error, empty_turn, empty_turn_cause
       from ${S}.txn_messages where id=$1`, [toolRound.id])
  check('C2 · ⭐⭐⭐ CLASS D IS UNTOUCHED — a pure tool-call round has no content BY DESIGN, so it is not classified',
    trRow?.empty_turn === null && trRow?.empty_turn_cause === null && trRow?.error === null
      && Array.isArray(trRow?.tool_calls) && trRow.tool_calls.length === 1)

  // ── D · THE SEAM'S DECISION LOGIC, RE-DERIVED FROM SOURCE ────────────────────────────────────
  const src = readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')
  check('D0 · the anchor is present — ⛔ a scan that lost its anchor proves nothing',
    src.includes('const emptyTurnCause = !producedNothing ? null'))
  const branch = src.slice(src.indexOf('const emptyTurn = producedNothing'), src.indexOf('const turnError = genError'))
  check('D1 · ⭐⭐ clientGone is checked FIRST — a disconnect outranks any inference about the model',
    branch.indexOf('clientGone') < branch.indexOf('genError'))
  check('D2 · ⭐ a named provider failure is preferred over generation_empty',
    branch.indexOf('genError') < branch.indexOf("'generation_empty'"))
  check('D3 · ⛔ the old conflated string is GONE from the codebase',
    !src.includes('the client disconnected before the first token, or generation ended empty'))
  const errBlock = src.slice(src.indexOf('const turnError = genError'), src.indexOf('const turnError = genError') + 1400)
  check('D4 · ⭐⭐⭐ client_disconnect contributes NO error — only generation_empty adds one',
    /emptyTurnCause === 'generation_empty'/.test(errBlock) && !/emptyTurnCause === 'client_disconnect'/.test(errBlock))
  check('D5 · ⛔ genError and the round-budget arms are UNCHANGED and still evaluated first',
    /const turnError = genError\s*\|\|\s*\(roundsTruncated/.test(errBlock))
  // ⚠️ THE MODEL MUST DECLARE THE COLUMNS OR `create()` DROPS THEM WITHOUT A WORD — the defect that cost
  // seven memories when `subject_person_id` was written by a caller the model did not know about.
  const model = readFileSync(new URL('../../Backend/database/models/txn_messages.model.js', import.meta.url), 'utf8')
  check('D6 · ⭐⭐ the Sequelize model DECLARES both columns — a migration alone does not make one writable',
    /empty_turn\s*:\s*\{/.test(model) && /empty_turn_cause\s*:\s*\{/.test(model))
  check('D7 · ⭐ and the insert actually passes them', /empty_turn: emptyTurn/.test(src) && /empty_turn_cause: emptyTurnCause/.test(src))

  // ── E · ⛔ HISTORY IS NOT REWRITTEN ──────────────────────────────────────────────────────────
  const legacy = await one(`
    select count(*)::int as n,
           count(*) filter (where empty_turn is not null)::int as classified
      from ${S}.txn_messages
     where role='assistant' and coalesce(length(content),0)=0 and conversation_id <> $1`, [convo])
  check('E1 · ⛔⛔ NOT ONE historical empty row was classified — the fix is for future observations',
    legacy?.classified === 0, `${legacy?.n} legacy empty row(s), ${legacy?.classified} classified`)
  const stillAmbiguous = await one(
    `select count(*)::int as n from ${S}.txn_messages
      where error::text like '%no output was produced%'`)
  check('E2 · ⭐ and the 13 old ambiguous rows keep their original text, untouched',
    Number(stillAmbiguous?.n) >= 13, `${stillAmbiguous?.n} rows`)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  const wipe = (sql, args = []) => pg.query(sql, args).catch(() => {})
  if (convo) {
    await wipe(`delete from ${S}.txn_messages where conversation_id=$1`, [convo])
    await wipe(`delete from ${S}.txn_conversations where id=$1`, [convo])
  }
  await pg.end()
  done()
}
