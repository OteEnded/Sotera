// ⭐⭐ PHASE 5 · THE CONFIDENCE AUDIT — does the number carry information, or is it a constant per writer?
//
//   node pipeline/confidence-audit.mjs
//
// ⛔ READ-ONLY. Nothing is written and no row is modified. This exists to answer Ote's decision C:
// *"I'd prefer evidence-kind/modality to carry the semantics, rather than trying to make one numeric
// confidence value do everything."* — which is a hypothesis with a measurable consequence:
//
//   ⭐ IF confidence is a FUNCTION of the writing mechanism, it holds no information the mechanism does
//     not already hold, and changing the scale would be renaming a constant.
//   ⛔ IF it varies WITHIN a mechanism at fixed kind/provenance, something is genuinely judging, and
//     changing the scale would destroy a real signal.
//
// The two are told apart by one number per writer: how many distinct confidences it has ever produced.

import { writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const out = { at: new Date().toISOString() }

// ⚠️ A WRITER IS NOT A COLUMN. `source` mixes a mechanism tag with a conversation id, so the MECHANISM
// has to be recovered from the prefix — the id part identifies an occasion, not a producer.
const WRITER = `case
    when m.source like 'conversation:%' then 'extraction'
    when m.source like 'doc:%'          then 'document-ingest'
    when m.source like 'episode:%'      then 'episode-distiller'
    when m.source like 'lesson:%'       then 'lesson'
    when m.source like 'decline:%'      then 'decline-record'
    when m.source = 'model-tool'        then 'model-tool'
    when m.source = 'consolidation'     then 'consolidation'
    when m.source is null               then '(none recorded)'
    else m.source end`

// ══ 1 · CONFIDENCE PER WRITER ═══════════════════════════════════════════════════════════════════════
const byWriter = await q(
  `select ${WRITER} writer, count(*)::int n,
          count(distinct m.confidence)::int distinct_conf,
          array_agg(distinct m.confidence order by m.confidence) vals,
          count(*) filter (where m.confidence is null)::int null_conf,
          array_agg(distinct coalesce(m.provenance::text,'(null)')) provs
     from ${S}.txn_memories m group by 1 order by n desc`)
out.byWriter = byWriter
console.log('\n══ CONFIDENCE, PER WRITING MECHANISM ═══════════════════════════════')
console.log('   writer               n   distinct  values                     provenance')
for (const w of byWriter) {
  const vals = (w.vals || []).map((v) => (v == null ? 'null' : v)).join(',')
  const flag = w.distinct_conf <= 1 ? '  ⛔ CONSTANT' : '  ⭐ varies'
  console.log(`   ${String(w.writer).padEnd(18)} ${String(w.n).padStart(3)}   ${String(w.distinct_conf).padStart(4)}     ${vals.padEnd(24)} ${(w.provs || []).join(',').padEnd(24)}${flag}`)
}

const varying = byWriter.filter((w) => w.distinct_conf > 1)
console.log(`\n   ⇒ ${varying.length} of ${byWriter.length} mechanisms ever produced more than ONE confidence value.`)

// ══ 2 · INSIDE THE VARYING WRITERS, WHAT MOVES THE NUMBER? ══════════════════════════════════════════
// If the spread inside a writer is fully explained by `kind` or `provenance`, it is still a lookup table
// with extra steps — the number is derived, not judged.
console.log('\n══ INSIDE EACH VARYING WRITER — is the spread explained by kind/provenance? ═══')
for (const w of varying) {
  const rows = await q(
    `select coalesce(m.kind,'(null)') kind, coalesce(m.provenance::text,'(null)') prov,
            m.confidence, count(*)::int n
       from ${S}.txn_memories m where ${WRITER} = $1
      group by 1,2,3 order by n desc`, [w.writer])
  console.log(`\n   ── ${w.writer} (${w.n} rows)`)
  for (const r of rows) console.log(`      kind=${String(r.kind).padEnd(10)} prov=${String(r.prov).padEnd(12)} conf=${String(r.confidence ?? 'null').padEnd(5)} ×${r.n}`)
  const cells = new Map()
  for (const r of rows) {
    const k = `${r.kind}|${r.prov}`
    if (!cells.has(k)) cells.set(k, new Set())
    cells.get(k).add(r.confidence)
  }
  const judged = [...cells.entries()].filter(([, s]) => s.size > 1)
  console.log(`      ⇒ cells where (kind, provenance) is FIXED and confidence still varies: ${judged.length}`
    + (judged.length ? `  ⭐ ${judged.map(([k, s]) => `${k}→{${[...s].join(',')}}`).join(' ')}` : '  ⛔ none — the number is a lookup'))
  w.judgedCells = judged.length
}
out.judgedCells = Object.fromEntries(varying.map((w) => [w.writer, w.judgedCells]))

// ══ 3 · WHAT `last_verified_at` ACTUALLY MEANS TODAY ════════════════════════════════════════════════
// ⚠️ The column documents "checked AGAINST ITS OWN SOURCE TEXT". `provenanceFields` stamps it for every
// class except `synthesized` — including `elicited` and `observed`, which `classifyCapture` returns "by
// construction" with NO text checked at all. So the claim the column makes can be broader than the act.
const ver = await q(
  `select coalesce(m.provenance::text,'(null)') prov, count(*)::int n,
          count(*) filter (where m.last_verified_at is not null)::int verified,
          count(*) filter (where m.source_message_id is not null)::int walkable
     from ${S}.txn_memories m group by 1 order by n desc`)
out.verifiedByProvenance = ver
console.log('\n══ `last_verified_at` BY PROVENANCE CLASS ══════════════════════════')
for (const v of ver) console.log(`   ${String(v.prov).padEnd(14)} n=${String(v.n).padStart(3)}  stamped verified: ${String(v.verified).padStart(3)}  walkable to a message: ${v.walkable}`)

// ══ 4 · WHERE PROVENANCE IS MISSING, AND WHETHER THAT IS AGE OR A LIVE GAP ══════════════════════════
// ⭐ THE DISTINCTION THAT MATTERS: a NULL from before migration 003 is the honest record of a period when
// we did not ask. A NULL written AFTER it is a live writer that does not say.
const [{ cutoff }] = await q(
  `select min(created_at) cutoff from ${S}.txn_memories where provenance is not null`)
const gaps = await q(
  `select ${WRITER} writer, count(*)::int n,
          count(*) filter (where m.provenance is null)::int no_prov,
          count(*) filter (where m.provenance is null and m.created_at > $1)::int no_prov_after_003,
          max(m.created_at) filter (where m.provenance is null) newest_null
     from ${S}.txn_memories m group by 1 having count(*) filter (where m.provenance is null) > 0 order by 3 desc`,
  [cutoff])
out.provenanceGaps = { cutoff, gaps }
console.log(`\n══ PROVENANCE GAPS  (first provenanced row: ${cutoff?.toISOString?.() ?? cutoff}) ═══`)
for (const g of gaps) {
  const live = g.no_prov_after_003 > 0
  console.log(`   ${String(g.writer).padEnd(18)} ${String(g.no_prov).padStart(3)}/${String(g.n).padStart(3)} without provenance   after-003: ${String(g.no_prov_after_003).padStart(3)}  ${live ? '⛔ A LIVE WRITER THAT DOES NOT SAY' : 'ⓘ predates the column'}`)
}

// ══ 5 · WHAT `evidence` HOLDS TODAY — it is already two different payloads ══════════════════════════
const ev = await q(
  `select (select string_agg(k,',' order by k) from jsonb_object_keys(m.evidence) k) shape,
          count(*)::int n, ${WRITER} writer
     from ${S}.txn_memories m where m.evidence is not null group by 1,3 order by n desc`)
out.evidenceShapes = ev
console.log('\n══ WHAT `evidence` HOLDS TODAY ═════════════════════════════════════')
for (const e of ev) console.log(`   ${String(e.writer).padEnd(18)} ×${String(e.n).padStart(3)}   keys: ${e.shape}`)

const file = new URL('../results/confidence-audit.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
await pg.end()
