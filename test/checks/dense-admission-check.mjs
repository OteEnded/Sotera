// ⭐⭐⭐ DENSE ADMISSION — a REVERSIBLE evidence exclusion must be re-evaluated at READ time.
//
//   node test/checks/dense-admission-check.mjs
//
// ── ⚠️⚠️ THE DEFECT THIS EXISTS FOR, MEASURED 2026-09-02 ─────────────────────────────────────────
// `conversation-search` has two arms. The LEXICAL arm's scope carries `evidentialSql('c')`. The DENSE
// arm's `VECTOR_SCOPE` did not — by design, so 018's denormalised columns could filter AT the index
// scan rather than above it. Those columns carry `role`, `conversation_id` and `room_user_id`, and
// ⛔ **not `excluded_from_evidence_at`**.
//
// ⭐ 018 DENORMALISED EXACTLY THE RIGHT COLUMNS. All three are irreversible once written. What was
// missing is the read-time stage for the one predicate that could never be denormalised, because it is
// the only one that can CHANGE after the row is written.
//
// ⇒ measured: 8 embedding rows from `56425175` — embedded ~21 h BEFORE the conversation was excluded —
// were the only non-evidential rows in a 1,917-row index, and the dense arm could return them.
//
// ── ⭐⭐ THE RULE BEING ENFORCED (O-iii.a, ruled 2026-09-02) ─────────────────────────────────────
//   index/corpus may RANK  →  a CURRENT view decides ADMISSION  →  audit provides AUTHORITY
//   ⛔ A denormalised or materialized scope column may only carry an IRREVERSIBLE fact.
//   ⛔ No freshness window, no re-derivation interval. The fix is a STAGE, not a schedule.
//
// ── ⛔ WHAT THIS TOUCHES ─────────────────────────────────────────────────────────────────────────
//   ✅ read-only, except ONE deliberate UPDATE inside a transaction that is ALWAYS rolled back
//   ⛔ `56425175` stays excluded, at its original timestamp — it is the REGRESSION FIXTURE
//   ⛔ its 8 embedding rows are NOT deleted. Exclusion is REVERSIBLE; deleting the index rows would
//      make a release un-restorable, turning a reversible boundary into an irreversible one

import { makeChecker } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { rebuildProviderRegistry } from '../../Backend/app/adapters/registry.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildConversationSearch } from '../../Backend/app/components/conversation-search.js'
import { makeEmbedder } from '../../Backend/app/components/memory-embed-host.js'

const { check, done } = makeChecker('dense-admission')
const config = loadConfig()
const db = await initDB()
setDB(db)
await rebuildProviderRegistry({ db, config })
await initSettings(db)
const fastify = { db, config }
const seq = db.txn_messages.sequelize
const S = db.txn_conversations.getTableName().schema
const Q = (sql, replacements) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT })

const EXCLUDED = '56425175-df60-403d-9e5f-76e2729df225'
const srcText = readFileSync(
  new URL('../../Backend/app/components/conversation-search.js', import.meta.url), 'utf8')
const codeOnly = (t) => String(t ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[^\n]*?\/\/.*$/gm, (l) => l.slice(0, l.indexOf('//')))
const code = codeOnly(srcText)

try {
  // ══ 1 · THE FIXTURE IS INTACT — ⛔ it was not made to disappear ════════════════════════════════
  const [fx] = await Q(
    `select excluded_from_evidence_at::text as at, incognito, archived_at, user_id::text as room
       from ${S}.txn_conversations where id = :id`, { id: EXCLUDED })
  check('1 · ⛔⛔ 56425175 is STILL EXCLUDED at its original timestamp — the regression fixture stands',
    String(fx?.at ?? '').startsWith('2026-08-26'), `excluded_from_evidence_at=${fx?.at}`)
  check('1 · ⭐ …and nothing else about it changed — not incognito, not archived',
    fx?.incognito === false && fx?.archived_at === null)

  // ⭐⭐ POSITIVE CONTROL FIRST. Every assertion below is an ABSENCE, and an absence proves nothing
  // unless the material COULD have been returned. ⛔ Without this, deleting the rows would make the
  // whole check pass — which is exactly the shortcut Ote forbade.
  const [emb] = await Q(
    `select count(*)::int as n, count(*) filter (where embedding_hv is not null)::int as with_vec
       from ${S}.txn_message_embeddings where conversation_id = :id`, { id: EXCLUDED })
  check('1 · ⭐⭐⭐ POSITIVE CONTROL — its 8 embedding rows are STILL IN THE INDEX, ⛔ not deleted',
    emb?.n === 8 && emb?.with_vec === 8, `${emb?.n} row(s), ${emb?.with_vec} with a vector`)
  check('1 · ⭐ …which is REQUIRED: exclusion is reversible, so deleting them would make a release '
    + 'un-restorable — an irreversible fix to a reversible boundary', emb?.n > 0)

  // ══ 2 · ⭐⭐⭐ THE ADMISSION PREDICATE IS EVALUATED AT READ TIME — PROVEN BY REVERSING IT ═══════
  // ⛔⛔ THE STRONGEST AVAILABLE PROOF OF O-iii.a's CORE CLAIM, and it is done inside a transaction
  // that is ALWAYS rolled back: release the exclusion, re-run the SAME query, and watch the same rows
  // become admissible with NO re-derivation, NO reindex and NO wait. ⭐ That is what "current view
  // decides admission" means operationally — and it is why no freshness window is needed.
  const admitted = async () => {
    const [r] = await Q(
      `select count(*)::int as n
         from ${S}.txn_message_embeddings me
         join ${S}.txn_messages m on m.id = me.message_id
         join ${S}.txn_conversations c on c.id = m.conversation_id
        where me.conversation_id = :id
          and c.incognito = false and c.excluded_from_evidence_at is null`, { id: EXCLUDED })
    return r.n
  }
  const before = await admitted()
  check('2 · ⭐⭐ with the exclusion IN FORCE, the admission predicate returns ZERO of them',
    before === 0, `${before} admitted`)

  const t = await seq.transaction()
  let duringRelease = null
  try {
    await seq.query(
      `update ${S}.txn_conversations set excluded_from_evidence_at = null where id = :id`,
      { replacements: { id: EXCLUDED }, transaction: t, type: seq.QueryTypes.UPDATE })
    const [r] = await seq.query(
      `select count(*)::int as n
         from ${S}.txn_message_embeddings me
         join ${S}.txn_messages m on m.id = me.message_id
         join ${S}.txn_conversations c on c.id = m.conversation_id
        where me.conversation_id = :id
          and c.incognito = false and c.excluded_from_evidence_at is null`,
      { replacements: { id: EXCLUDED }, transaction: t, type: seq.QueryTypes.SELECT })
    duringRelease = r.n
  } finally {
    // ⛔ ALWAYS. The fixture must survive this check exactly as it entered it.
    await t.rollback()
  }
  check('2 · ⭐⭐⭐ RELEASING the exclusion makes them admissible IMMEDIATELY — no re-derivation, no wait',
    duringRelease === 8, `${duringRelease} admitted while released`)
  const after = await Q(
    `select excluded_from_evidence_at::text as at from ${S}.txn_conversations where id = :id`,
    { id: EXCLUDED })
  check('2 · ⛔⛔ …and the rollback restored the fixture EXACTLY', after[0]?.at === fx?.at,
    `${fx?.at} → ${after[0]?.at}`)

  // ══ 3 · ⭐⭐ THE DENSE ARM ITSELF — END TO END, THROUGH THE REAL COMPONENT ═════════════════════
  // ⛔ Not a reimplementation of the query: the arm that had the defect is the arm that must be proven.
  const [{ id: room }] = await Q(
    `select u.id from ${S}.mst_users u where u.id = :room`, { room: fx.room })
  const search = buildConversationSearch(fastify, {
    userId: room, currentConversationId: null, embed: makeEmbedder(fastify, { userId: room }),
  })
  // ⭐ A query aimed squarely at the excluded conversation's own subject, with the cosine floor dropped
  // to 0 so the dense arm returns its nearest neighbours whatever they score. ⛔ If the fix were absent
  // this is the shape that surfaces the 8 rows.
  const hits = []
  for (const q of ['Rome project definition and context', 'building Rome in a day']) {
    // eslint-disable-next-line no-await-in-loop
    const r = await search.search(q, { limit: 8, minLength: 20, denseMinSim: 0 })
    hits.push({ q, mode: r.mode, count: r.count, evidence: r.evidence ?? [] })
  }
  check('3 · ⭐ the DENSE arm actually ran — ⛔ else this proves nothing about it',
    hits.every((h) => /hybrid/.test(String(h.mode))), hits.map((h) => `${h.mode}(${h.count})`).join(' '))
  const leaked = hits.flatMap((h) => h.evidence.filter(
    (e) => String(e?.conversation?.id ?? e?.conversationId ?? '') === EXCLUDED))
  check('3 · ⭐⭐⭐ NOT ONE result came from the excluded conversation — the dense arm now admits currently',
    leaked.length === 0, leaked.length ? `${leaked.length} leaked` : 'zero, across both queries')

  // ══ 4 · THE SHAPE OF THE FIX — ⛔ a stage, never a schedule, never a copied column ═════════════
  check('4 · ⭐⭐ the DENSE query applies the evidence predicate',
    /async function dense[\s\S]{0,900}?evidentialSql\(/.test(code))
  check('4 · ⭐ the LEXICAL arm still applies it too — ⛔ no regression',
    /async function lexical[\s\S]{0,600}?\$\{SCOPE\}/.test(code) && /SCOPE = `[\s\S]{0,300}?evidentialSql\(/.test(code))
  check('4 · ⛔⛔ the predicate is NOT re-spelled by hand anywhere in the file',
    !/excluded_from_evidence_at\s+IS\s+NULL/i.test(code))
  // ⛔⛔ THE REVERSIBLE-FACT RULE: no exclusion column may be denormalised beside the vector, because a
  // copy of a reversible fact is wrong the moment the original changes and nothing goes back to fix it.
  const [{ n: denorm }] = await Q(
    `select count(*)::int as n from information_schema.columns
      where table_schema = :s and table_name = 'txn_message_embeddings'
        and (column_name ~* 'exclud' or column_name ~* 'evidential' or column_name ~* 'admissib')`,
    { s: S })
  check('4 · ⭐⭐⭐ NO exclusion column was denormalised onto the index — a reversible fact may not be copied',
    denorm === 0, `${denorm} such column(s)`)
  // ⛔ AND NO SCHEDULE. A freshness window would be the arbitrary number O-iii.a exists to refuse.
  for (const f of ['staleSeconds', 'freshnessWindow', 'reindexInterval', 'maxStaleness', 'lastRebuiltAt']) {
    check(`4 · ⛔ no freshness machinery: \`${f}\` is absent`, !code.includes(f))
  }

  // ══ 5 · ⛔ WHAT MUST NOT HAVE MOVED ═══════════════════════════════════════════════════════════
  const [{ n: total }] = await Q(`select count(*)::int as n from ${S}.txn_message_embeddings`)
  check('5 · ⭐ the index was not pruned to make this pass', total >= 1917, `${total} embedding row(s)`)
  const [{ n: nonEvidential }] = await Q(
    `select count(*)::int as n from ${S}.txn_message_embeddings me
       join ${S}.txn_conversations c on c.id = me.conversation_id
      where c.incognito or c.excluded_from_evidence_at is not null`)
  check('5 · ⚠️ the index STILL CONTAINS non-evidential rows, and that is CORRECT — they are filtered '
    + 'at read time, ⛔ not deleted', nonEvidential === 8, `${nonEvidential} row(s)`)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  await seq.close().catch(() => {})
  done()
}
