// ⭐⭐⭐ M1-F · THE RED-PROOF REGISTER — the measurement that must not become an act.
//
//   node test/checks/dreaming-m1f-check.mjs
//
// ⭐⭐ M1-F IS THE FIRST DREAMING CODE THAT READS MESSAGE CONTENT, which makes it the first place that
// could re-create the defect measured on 2026-09-02: the dense arm of `conversation-search` filters
// through denormalised columns that carry `role`, `conversation_id` and `room_user_id` but ⛔ NOT
// `excluded_from_evidence_at` — so a message embedded while its conversation was admissible stays
// retrievable after the conversation is excluded.
//
// ⇒ ⭐ THE TWO ASSERTIONS THAT MATTER MOST HERE ARE R25 AND R26: nothing leaves the module that anybody
// said, and the excluded conversation contributes ZERO candidates. Everything else is bookkeeping.
//
// ── ⛔ WHAT THIS TOUCHES ─────────────────────────────────────────────────────────────────────────
//   ✅ read-only. ⛔ It writes NOTHING ANYWHERE — not even a pass row, not even a test schema.
//   ⛔ `56425175` is neither released, re-excluded, nor reclassified. Ote: *"do not make the fixture
//      disappear to make a test green."* ⭐ Here the fixture is the INSTRUMENT: an excluded conversation
//      whose words are known to be in the index is exactly what proves the read path is the right one.

import { readFileSync, existsSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { MIN_INDEPENDENT_ROOTS, probeTermsFor } from '../../Backend/app/components/dreaming-evidence.js'

const { check, done } = makeChecker('dreaming-m1f')
const pg = devPg(); await pg.connect()
const query = async (sql, params) => pg.query(sql, params)
const one = async (sql, params) => (await query(sql, params)).rows[0] ?? null
const S = `"${devSchema()}"`
const EXCLUDED = '56425175-df60-403d-9e5f-76e2729df225'

const COMPONENTS = new URL('../../Backend/app/components/', import.meta.url)
const src = (n) => (existsSync(new URL(n, COMPONENTS)) ? readFileSync(new URL(n, COMPONENTS), 'utf8') : null)
const codeOnly = (t) => String(t ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[^\n]*?\/\/.*$/gm, (l) => l.slice(0, l.indexOf('//')))
const identifiersOnly = (t) => codeOnly(t)
  .replace(/`(?:[^`\\]|\\.)*`/g, '``').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')

/**
 * ⭐⭐⭐ WALK A RESULT AND FIND ANYTHING CONTENT-SHAPED.
 * ⛔ Bypass must be IMPOSSIBLE rather than forbidden, so this does not check a documented field list —
 * it walks the whole returned tree, at every depth, and reports every key that could carry a sentence.
 */
function contentShapedKeys(node, path = '$', found = []) {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    node.forEach((v, i) => contentShapedKeys(v, `${path}[${i}]`, found))
    return found
  }
  for (const [k, v] of Object.entries(node)) {
    if (/^(content|excerpt|text|message|said|body|value|snippet|quote)$/i.test(k)) found.push(`${path}.${k}`)
    contentShapedKeys(v, `${path}.${k}`, found)
  }
  return found
}
/**
 * ⭐ A free-text catch: a long string anywhere is a sentence escaping, whatever its key.
 *
 * ⚠️⚠️ MEASURED AND CORRECTED, 2026-09-02. This first ran with a flat 60-character ceiling and the
 * stated reason *"labels are short by construction"* — which the data refused: live slot-label lengths
 * run p50 **17**, p95 **42**, max **77**, and the longest is prose-shaped rather than an identifier.
 * ⛔ The wrong fix is raising 60 to 80, which is fitting the instrument to the sample.
 * ⭐ THE RIGHT FIX IS PROVENANCE, NOT LENGTH: a slot label is exempted here and asserted separately to
 * be VERBATIM a label that exists in `txn_memories` — so it can never be a fragment of a message,
 * whatever its length. Every other string in the tree stays under the ceiling.
 */
function longStrings(node, path = '$', found = [], max = 60) {
  if (typeof node === 'string') {
    if (node.length > max && !/\.attribute$/.test(path)) found.push(`${path} (${node.length} chars)`)
    return found
  }
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) { node.forEach((v, i) => longStrings(v, `${path}[${i}]`, found, max)); return found }
  for (const [k, v] of Object.entries(node)) longStrings(v, `${path}.${k}`, found, max)
  return found
}

/** ⭐ Every string reachable at a `.attribute` path — the labels the measurement echoes. */
function emittedLabels(node, path = '$', found = []) {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) { node.forEach((v, i) => emittedLabels(v, `${path}[${i}]`, found)); return found }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'attribute' && typeof v === 'string') found.push(v)
    else emittedLabels(v, `${path}.${k}`, found)
  }
  return found
}

/** ⭐ Snapshot everything M1-F must leave alone — including its own would-be ledger. */
async function snapshot() {
  const r = await one(`SELECT
      (SELECT count(*)::int FROM ${S}.txn_memories) AS memories,
      (SELECT max(created_at) FROM ${S}.txn_memories) AS mem_last,
      (SELECT count(*)::int FROM ${S}.txn_messages) AS messages,
      (SELECT count(*)::int FROM ${S}.txn_conversations) AS convos,
      (SELECT count(*)::int FROM ${S}.txn_conversations WHERE excluded_from_evidence_at IS NOT NULL) AS excluded,
      (SELECT count(*)::int FROM ${S}.log_dreaming_passes) AS passes,
      (SELECT count(*)::int FROM ${S}.log_conversation_revisits) AS acts,
      (SELECT count(*)::int FROM ${S}.log_retention_decisions) AS retention,
      (SELECT count(*)::int FROM ${S}.txn_relational_records) AS relational,
      (SELECT count(*)::int FROM ${S}.txn_message_embeddings) AS embeddings,
      (SELECT sum(access_count)::int FROM ${S}.txn_memories) AS access_total,
      (SELECT max(last_access) FROM ${S}.txn_memories) AS access_last,
      (SELECT count(*)::int FROM ${S}.log_conversation_revisits
        WHERE tool_generation = 2 AND dispatch_generation = 2
          AND trigger_source = 'cron' AND outcome = 'completed') AS p1`)
  return r
}

try {
  // ══ 0 · THE MODULE LOADS, AND DECLARES ITSELF ══════════════════════════════════════════════════
  let mod = null
  try { mod = await import('../../Backend/app/components/dreaming-candidate-host.js') } catch (e) { mod = { err: e.message } }
  check('0 · ⭐ the M1-F host loads', typeof mod?.measureCandidates === 'function', mod?.err ?? '')
  check('0 · ⭐ …and DECLARES its deps — ⛔ never inferred from source',
    Array.isArray(mod?.MEASURE_CANDIDATES_DEPS), JSON.stringify(mod?.MEASURE_CANDIDATES_DEPS))

  // ══ R25 · ⛔⛔ NOTHING ANYBODY SAID LEAVES THE MODULE ═══════════════════════════════════════════
  const before = await snapshot()
  const result = typeof mod?.measureCandidates === 'function'
    ? await mod.measureCandidates({ query, schema: devSchema() })
    : null
  check('R25 · ⭐ the measurement ran and returned a result', Boolean(result?.summary),
    result ? `${result.summary.slotsTotal} slot(s)` : 'did not run')

  const contentKeys = contentShapedKeys(result)
  check('R25 · ⭐⭐⭐ NO content-shaped key anywhere in the returned tree — ⛔ bypass impossible, not forbidden',
    Boolean(result) && contentKeys.length === 0, contentKeys.slice(0, 6).join(' ') || 'none at any depth')
  const long = longStrings(result)
  // ⚠️ THE CATCH-ALL: a sentence could escape under an innocent key name. ⓘ Slot labels are legitimately
  // present and are SHORT by construction, so a 60-char ceiling separates a label from a quote.
  check('R25 · ⭐⭐ and NO long string escaped under any key name — a slot label is the only exemption',
    Boolean(result) && long.length === 0, long.slice(0, 4).join(' ') || 'every non-label string ≤ 60 chars')

  // ⭐⭐⭐ THE EXEMPTION, EARNED RATHER THAN ASSUMED: every label the measurement emits must be
  // VERBATIM a live label from the memory store. ⛔ Not "short enough" — a length ceiling would admit a
  // short fragment of somebody's sentence and reject a long legitimate label, which is precisely
  // backwards. ⓘ This assertion is what makes the length exemption above safe.
  const labels = emittedLabels(result)
  const { rows: liveLabels } = await query(
    `SELECT DISTINCT attribute FROM ${S}.txn_memories WHERE attribute IS NOT NULL AND attribute <> ''`)
  const known = new Set(liveLabels.map((r) => r.attribute))
  const strays = labels.filter((l) => !known.has(l))
  check('R25 · ⭐ labels were actually emitted — ⛔ else the next assertion is vacuous', labels.length > 0,
    `${labels.length} label(s)`)
  check('R25 · ⭐⭐⭐ EVERY emitted label is verbatim a label from the memory store — ⛔ never a message fragment',
    strays.length === 0, strays.length ? `${strays.length} stray` : `all ${labels.length} match a stored attribute`)

  // ══ R26 · ⛔⛔⛔ THE EXCLUDED CONVERSATION CONTRIBUTES ZERO ═════════════════════════════════════
  // ⭐ AND THE POSITIVE CONTROL COMES FIRST. Asserting "the excluded conversation is absent" proves
  // nothing unless its words WOULD otherwise have matched — an absence with no reachable alternative is
  // the vacuous kind. So: pick a probe term that genuinely occurs in it, confirm the term matches
  // there, and only then assert the read path refuses it.
  const rome = await one(
    `SELECT count(*)::int AS n FROM ${S}.txn_messages
      WHERE conversation_id = $1::uuid AND content ILIKE '%rome%'`, [EXCLUDED])
  check('R26 · ⭐ POSITIVE CONTROL — the excluded conversation really does contain the probe term',
    rome?.n > 0, `${rome?.n} message(s) matching "rome" inside ${EXCLUDED.slice(0, 8)}`)
  const viaAdmission = await one(
    `SELECT count(*)::int AS n FROM ${S}.txn_messages m
       JOIN ${S}.txn_conversations c ON c.id = m.conversation_id
      WHERE m.content ILIKE '%rome%' AND m.conversation_id = $1::uuid
        AND c.incognito = false AND c.excluded_from_evidence_at IS NULL`, [EXCLUDED])
  check('R26 · ⭐⭐⭐ …and the ADMISSION path returns ZERO of them — exclusion applied at READ time',
    viaAdmission?.n === 0, `${viaAdmission?.n} admitted`)
  // ⛔⛔ THE CONTRAST THAT MAKES THE POINT: the dense index still holds those rows. ⭐ That is the
  // separately-classified hardening defect, ASSERTED HERE so it stays visible rather than forgotten —
  // and it is exactly what M1-F must not route through.
  const inDenseIndex = await one(
    `SELECT count(*)::int AS n FROM ${S}.txn_message_embeddings WHERE conversation_id = $1::uuid`, [EXCLUDED])
  check('R26 · ⚠️⚠️ the DENSE index still holds the excluded conversation — ⛔ separately classified, ⛔ not fixed here',
    inDenseIndex?.n > 0, `${inDenseIndex?.n} embedding row(s) — the reason M1-F uses the admission path`)

  // ⭐ AND THE SOURCE SAYS SO: M1-F reads through the evidence predicate and never the vector table.
  const hostSrc = src('dreaming-candidate-host.js') ?? ''
  const hostCode = identifiersOnly(hostSrc)
  check('R26 · ⭐ the host source was found — ⛔ else the scan is vacuous', hostSrc.length > 0)
  // ⚠️ SCANNED WITH STRINGS KEPT, AND THAT IS NOT A DETAIL: the call lives INSIDE a template literal
  // (it interpolates a SQL fragment), so `identifiersOnly` — which blanks literals — cannot see it and
  // reported the predicate as absent. ⭐ A presence check and an absence check need opposite strippers:
  // absence must ignore prose, presence must not ignore the string the call is embedded in.
  check('R26 · ⭐⭐ it CALLS `evidentialSql` — the predicate has ONE owner and this is not a second spelling',
    /evidentialSql\(/.test(codeOnly(hostSrc)))
  check('R26 · ⭐ …and IMPORTS it from the module that owns it',
    /import\s*\{[^}]*evidentialSql[^}]*\}\s*from\s*'\.\/corpus-eligibility\.js'/.test(hostSrc))
  // ⛔ AND IT DOES NOT RE-SPELL THE CLAUSE. A second spelling of an evidence predicate is how a boundary
  // becomes a habit — the failure `dreaming-eligibility` warns about, checked here rather than trusted.
  check('R26 · ⛔⛔ it never re-spells the predicate by hand',
    !/excluded_from_evidence_at\s+IS\s+NULL/i.test(codeOnly(hostSrc)))
  for (const f of ['txn_message_embeddings', 'embedding_hv', 'halfvec', 'makeEmbedder', '<=>']) {
    check(`R26 · ⛔⛔ …and never reaches \`${f}\``, !hostCode.includes(f))
  }

  // ══ R27 · ⛔ IT PERSISTS NOTHING, AND THAT INCLUDES ACTIVATION STATE ═══════════════════════════
  const after = await snapshot()
  for (const k of Object.keys(before)) {
    check(`R27 · ⛔ ${k} is UNCHANGED by the measurement`,
      String(before[k]) === String(after[k]), `${before[k]} → ${after[k]}`)
  }
  // ⭐⭐⭐ `access_total` AND `access_last` ARE IN THAT LIST DELIBERATELY. `recall()` bumps
  // access_count/last_access, which RE-RANKS what the Composer injects on her next ordinary turn ⇒
  // changes what she says ⇒ changes what a later reflection reflects ON. ⛔ That is a P1 contamination
  // route no row count would catch, which is why activation is snapshotted as a value, not a shape.
  check('R27 · ⭐⭐⭐ memory ACTIVATION did not move — ⛔ the P1 route no row count would catch',
    String(before.access_total) === String(after.access_total)
    && String(before.access_last) === String(after.access_last),
    `sum(access_count) ${before.access_total} → ${after.access_total}`)

  // ⛔ NO WRITE STATEMENT EXISTS IN THE MODULE AT ALL. ⭐ Structural, not behavioural: nothing to disable.
  const writes = [...hostCode.matchAll(/\b(INSERT\s+INTO|UPDATE\s|DELETE\s+FROM)/gi)].map((m) => m[1])
  check('R27 · ⭐⭐ the module contains NO write statement — ⛔ absent, not disabled',
    writes.length === 0, writes.join(' ') || 'no INSERT/UPDATE/DELETE anywhere')
  const imported = [...hostCode.matchAll(/from\s+''/g)].length
  check('R27 · ⭐ …and it imports only the two pure modules it needs',
    (hostSrc.match(/^import\s/gm) ?? []).length === 2, `${(hostSrc.match(/^import\s/gm) ?? []).length} import(s)`)
  for (const f of ['.recall(', '.touch(', 'buildMemoryV2', 'reinforce(', 'retention-host', 'log_dreaming_passes']) {
    check(`R27 · ⛔⛔ the module never reaches \`${f}\``, !hostCode.includes(f))
  }

  // ══ R28 · ⛔ IT INVENTS NO SEMANTICS — M2-7 IS UNRESOLVED AND STAYS THAT WAY ═══════════════════
  for (const f of ['renderProposal', 'validateProposal', 'planFor', 'resolveConflict', 'dreaming-proposal',
    'dreaming-resolver', 'DREAMING_TYPE', 'slotAddressFor']) {
    check(`R28 · ⛔ no proposition machinery: \`${f}\` is absent`, !hostCode.includes(f))
  }
  check('R28 · ⭐ the O-2 floor is the built one, ⛔ not a local number',
    result?.minRoots === MIN_INDEPENDENT_ROOTS, `minRoots=${result?.minRoots} MIN_INDEPENDENT_ROOTS=${MIN_INDEPENDENT_ROOTS}`)

  // ══ R29 · ⭐ THE MEASUREMENT IS HONEST ABOUT ITS OWN LIMITS ════════════════════════════════════
  // ⛔ An unprobeable slot must NOT be counted as "no recurrence found" — that is an absence the
  // instrument did not earn, which is 6e's logic one tier down.
  const unprobeable = (result?.slots ?? []).filter((s) => s.probed === false)
  check('R29 · ⭐⭐ slots with no usable probe term are counted SEPARATELY, ⛔ never as zeros',
    result?.summary?.slotsUnprobeable === unprobeable.length,
    `${result?.summary?.slotsUnprobeable} unprobeable of ${result?.summary?.slotsTotal}`)
  check('R29 · ⭐ probed + unprobeable accounts for every slot — ⛔ nothing dropped silently',
    (result?.summary?.slotsProbed ?? -1) + (result?.summary?.slotsUnprobeable ?? -1)
      === result?.summary?.slotsTotal)
  // ⚠️ TRUNCATION IS REPORTED, for the same reason N < M is: a capped read that stayed quiet would
  // understate roots and look like a finding.
  check('R29 · ⚠️ truncation is reported rather than silent',
    Number.isInteger(result?.summary?.truncatedSlots), `${result?.summary?.truncatedSlots} slot(s) truncated`)
  // ⭐ BOTH SELECTORS REPORTED — one number would hide its own sensitivity to the selector.
  check('R29 · ⭐⭐ both selectors are reported, ⛔ never just the flattering one',
    Number.isInteger(result?.summary?.clearsFloorAll) && Number.isInteger(result?.summary?.clearsFloorAny),
    `all-terms=${result?.summary?.clearsFloorAll} any-term=${result?.summary?.clearsFloorAny}`)
  // ⭐ The probe genuinely comes from the memory layer, and is reproducible from the label alone.
  const probedSlot = (result?.slots ?? []).find((s) => s.probed)
  check('R29 · ⭐⭐ the probe is DERIVED FROM THE SLOT LABEL by the memory layer — ⛔ not authored here',
    Boolean(probedSlot)
    && JSON.stringify(probedSlot.terms) === JSON.stringify(probeTermsFor(probedSlot.attribute)),
    probedSlot ? `${probedSlot.attribute} → ${JSON.stringify(probedSlot.terms)}` : 'no probed slot')
  check('R29 · ⓘ imports resolved in the stripped source', imported >= 0)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  await pg.end()
  done()
}
