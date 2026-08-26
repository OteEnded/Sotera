// ⭐⭐⭐ PHASE 5 · EXTRACTION → SYNTHESIS DRIFT — where the meaning is lost, and what could have caught it.
//
//   node pipeline/drift-chain.mjs
//
// ⛔ MEASUREMENT ONLY. The Rome memories are NOT modified. Ote: *"I want the architecture and failure
// mechanism understood first."*
//
// ── ⭐⭐ THE WORKED EXAMPLE, ALREADY ESTABLISHED ────────────────────────────────────────────────────
//   source     2026-08-09 20:16:35  Ote: *"i kinda want to build rome in one day"*   ← a PROVERB
//   extraction 2026-08-09 20:17:06  `7d383ce3` "user's current goal: build Rome in one day"  ← +31s
//   synthesis  2026-08-25           `02b095e5`/`676e17b9` "our shared project and life's mission"
//   reasoning  2026-08-26           she states it as fact and cannot find the origin
// ⇒ a figure of speech became a goal in 31 seconds and hardened into a mission in sixteen days.
//
// ── ⭐ THE QUESTION THIS FILE ANSWERS ───────────────────────────────────────────────────────────────
// ⛔ NOT "is the Rome memory wrong" — that is settled. It is: **at which stage was the information that
// would have prevented this still present, and is it recorded anywhere?** A drift that was
// undetectable is an architecture problem; one that was detectable and unchecked is a wiring problem,
// and they need different fixes.

import { writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const out = { at: new Date().toISOString() }

// ══ STAGE 1 · WHAT THE SOURCE ACTUALLY SAID ════════════════════════════════════════════════════════
const chain = await q(
  `select left(m.id::text,8) mid, m.author, m.kind, m.confidence, m.importance, m.tier,
          m.source, m.source_message_id::text smid, m.provenance, m.evidence,
          m.last_verified_at, m.contradicted_by, m.created_at, left(m.content,150) content
     from ${S}.txn_memories m where m.content ~* '\\mrome\\M' order by m.created_at asc`)
out.chain = chain
console.log('\n══ THE ROME CHAIN · every stored link, with its provenance fields ═══')
for (const c of chain) {
  console.log(`\n   ${c.created_at.toISOString()}  ${c.mid}  author=${c.author} kind=${c.kind}`)
  console.log(`      content    : ${String(c.content).replace(/\s+/g, ' ').slice(0, 110)}`)
  console.log(`      confidence : ${c.confidence ?? 'NULL'}      importance: ${c.importance ?? 'NULL'}   tier: ${c.tier ?? 'NULL'}`)
  console.log(`      source     : ${c.source ?? 'NULL'}`)
  console.log(`      source_msg : ${c.smid ? `${c.smid.slice(0, 8)} ⭐ walkable` : '⛔ NULL — unwalkable'}`)
  console.log(`      provenance : ${c.provenance ? JSON.stringify(c.provenance).slice(0, 90) : 'NULL'}`)
  console.log(`      evidence   : ${c.evidence ? JSON.stringify(c.evidence).slice(0, 90) : 'NULL'}`)
  console.log(`      verified   : ${c.last_verified_at ?? 'NEVER'}   contradicted_by: ${c.contradicted_by ?? 'none'}`)
}

// ⭐⭐ CAN EACH LINK BE WALKED BACK TO WHAT WAS ACTUALLY SAID? That is the difference between a claim
// with evidence and a claim with a story about evidence.
console.log('\n══ CAN EACH LINK BE WALKED BACK TO ITS SOURCE TEXT? ════════════════')
for (const c of chain) {
  if (!c.smid) { console.log(`   ${c.mid}  ⛔ no source_message_id — the trail ends here`); continue }
  const [src] = await q(
    `select m.role, left(m.content,150) content, u.username room
       from ${S}.txn_messages m
       join ${S}.txn_conversations cv on cv.id = m.conversation_id
       left join ${S}.mst_users u on u.id = cv.user_id
      where m.id = $1`, [c.smid])
  console.log(`   ${c.mid}  → ${src ? `${src.role}@${src.room}: "${String(src.content).replace(/\s+/g, ' ').slice(0, 90)}"` : '⛔ source row GONE'}`)
}

// ══ STAGE 2 · ARE THE PROVENANCE COLUMNS USED AT ALL, STORE-WIDE? ═══════════════════════════════════
// ⭐ The columns exist. The question this project keeps having to ask is whether anything WRITES them —
// a capability that exists and is never populated is indistinguishable from one that is absent.
const [cov] = await q(
  `select count(*)::int total,
          count(*) filter (where source_message_id is not null)::int walkable,
          count(*) filter (where confidence is not null)::int has_confidence,
          count(distinct confidence)::int distinct_confidence,
          count(*) filter (where provenance is not null)::int has_provenance,
          count(*) filter (where evidence is not null)::int has_evidence,
          count(*) filter (where last_verified_at is not null)::int ever_verified,
          count(*) filter (where contradicted_by is not null)::int contradicted,
          count(*) filter (where tier is not null)::int has_tier
     from ${S}.txn_memories`)
out.coverage = cov
console.log('\n══ PROVENANCE COVERAGE ACROSS THE WHOLE STORE ══════════════════════')
const pct = (n) => `${n}/${cov.total} (${Math.round((n / cov.total) * 100)}%)`
console.log(`   walkable to a source message : ${pct(cov.walkable)}`)
console.log(`   carries a confidence         : ${pct(cov.has_confidence)}   distinct values: ${cov.distinct_confidence}`)
console.log(`   carries provenance           : ${pct(cov.has_provenance)}`)
console.log(`   carries evidence             : ${pct(cov.has_evidence)}`)
console.log(`   ever re-verified             : ${pct(cov.ever_verified)}`)
console.log(`   marked contradicted          : ${pct(cov.contradicted)}`)
console.log(`   carries a tier               : ${pct(cov.has_tier)}`)

// ⭐ WHAT VALUES CONFIDENCE ACTUALLY TAKES. One distinct value means the column is a constant wearing a
// measurement's clothes — it cannot separate a quoted fact from an inferred one.
const conf = await q(
  `select confidence, count(*)::int n from ${S}.txn_memories group by confidence order by n desc limit 8`)
out.confidenceValues = conf
console.log(`   confidence values in use     : ${conf.map((c) => `${c.confidence ?? 'NULL'}×${c.n}`).join('  ')}`)

// ══ STAGE 3 · CAN A READER TELL DIRECT EVIDENCE FROM AN INTERPRETATION? ═════════════════════════════
// ⭐ `source` is the closest thing the schema has to "how did this get here".
const src = await q(
  `select source, count(*)::int n, count(*) filter (where source_message_id is not null)::int walkable
     from ${S}.txn_memories group by source order by n desc`)
out.sources = src
console.log('\n══ HOW ROWS GOT HERE (`source`) — the only "kind of knowing" recorded ═══')
for (const s of src) console.log(`   ${String(s.source ?? 'NULL').padEnd(34)} ${String(s.n).padStart(3)}   walkable: ${s.walkable}`)
console.log('   ⚠️ `source` says WHICH MECHANISM wrote it — model-tool, extraction, a document.')
console.log('   ⛔ It does NOT say whether the underlying statement was ASSERTED or FIGURATIVE.')

// ══ STAGE 4 · WHAT RETRIEVAL HANDS HER ══════════════════════════════════════════════════════════════
// ⭐ The axes exist and are already used by conversation retrieval; the question is whether a MEMORY
// read carries the same qualifiers, or arrives as a bare sentence.
const axesFile = new URL('../../Backend/app/components/memory-cognition-axes.js', import.meta.url)
let axes = null
try { axes = (await import(axesFile)).default ?? await import(axesFile) } catch { /* optional */ }
out.axesAvailable = !!axes
console.log('\n══ THE COGNITION AXES (what KIND of knowing) ═══════════════════════')
if (axes) {
  for (const k of ['SOURCE', 'BASIS', 'AVAILABILITY', 'RETENTION']) {
    if (axes[k]) console.log(`   ${k.padEnd(13)} ${Object.values(axes[k]).join(' · ')}`)
  }
  console.log('   ⭐ `retrieve_conversations` stamps every TURN with these.')
  console.log('   ⚠️ Whether a MEMORY read carries a basis is the open question — see the report.')
}

const file = new URL('../results/drift-chain.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
await pg.end()
