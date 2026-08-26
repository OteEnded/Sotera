// ⭐⭐ END-TO-END: does the retrieval trace actually reach the database?
//
//   node pipeline/lineage-live.mjs
//
// ⛔ THE ONLY QUESTION THIS ANSWERS. The unit tests prove the trace works and the check proves it is
// CALLED; neither proves that a real turn produces a real `evidence.derivedFrom` on a real row. This
// project has shipped a tested module that nothing imported, and a check that asserted a fixture the
// fixture itself wrote wrong — so the wiring gets its own live proof.
//
// ⚠️ agent_dev's room only. ⛔ Never root.

import { writeFileSync } from 'node:fs'
import { makeClient, devPg, devSchema, asAgent, BASE } from '../harness.mjs'
import { derivedFromOf } from '../../Backend/app/components/memory-lineage.js'

const call = makeClient()
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const out = { at: new Date().toISOString(), base: BASE }

const jar = await asAgent(call)
const [dev] = await q(`select id from ${S}.mst_users where username='agent_dev'`)

// A watermark, so nothing written before this run can be mistaken for evidence about it. ⚠️ The writer
// is ASYNCHRONOUS — a time window alone once blamed one arm for another arm's row on this very project,
// which is why the row is finally attributed by `source_message_id` and not by its timestamp.
const since = new Date()

const conv = await call(jar, 'POST', '/v1/chat/conversations', {
  title: 'LINEAGE LIVE', settings: { stream: false, toolsEnabled: true, useMemory: true },
})
if (conv.status >= 300) { console.error('✖ could not open a conversation:', conv.status); process.exit(1) }
const cid = conv.json?.conversation?.id ?? conv.json?.id
console.log(`   conversation ${String(cid).slice(0, 8)}`)

// Two turns. The FIRST gives recall something to find and something to write; the SECOND is the one
// measured, because by then the store holds rows the passive recall can actually return.
// ⚠️ TURN 2 ASKS DIRECTLY, AND THE FIRST VERSION OF THIS PROBE DID NOT — IT MEASURED NOTHING.
// It said *"if anything is worth remembering, keep it"*, she kept nothing, and the run reported zero
// rows. That is not a lineage result: it is `retention-salience-unresolved` reproducing itself, and
// reading it as "the wiring is broken" would have been an instrument defect promoted to a finding.
// ⭐ A directed request removes the salience variable, which is not what this probe is measuring.
// ⛔ ALSO MEASURED: a REPEAT fact reconciles in place — an UPDATE, not a `create` — so it never reaches
// the lineage stamp. The content below is deliberately novel so the write path is an INSERT.
const NONCE = String(Date.now()).slice(-6)
const TURNS = [
  'I work out of Bangkok and I keep odd hours — usually up past 2am.',
  `Please remember this about how I work: my build tag for this cycle is CANARY-${NONCE}, and I want `
  + 'you to keep that. It is mine, not yours — it is a fact about me.',
]
for (const [i, text] of TURNS.entries()) {
  const t0 = Date.now()
  const r = await call(jar, 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text })
  console.log(`   turn ${i + 1}: ${r.status} in ${Math.round((Date.now() - t0) / 1000)}s`)
  if (r.status >= 300) { console.error('   ⚠️ a non-2xx turn is a FAILED RUN, never an empty answer'); process.exit(1) }
}

// Let the fire-and-forget writers land. ⛔ Not a fix for a race — the attribution below does not depend
// on this having been long enough; a missing row reports as missing rather than as absent evidence.
await new Promise((r) => setTimeout(r, 6000))

const rows = await q(
  `select left(m.id::text,8) id, m.source, m.author, m.entity, m.attribute, m.modality,
          m.source_message_id::text smid, m.evidence, left(m.content,70) content, m.created_at
     from ${S}.txn_memories m
     join ${S}.txn_messages msg on msg.id = m.source_message_id
     join ${S}.txn_conversations c on c.id = msg.conversation_id
    where c.id = $1 and m.created_at >= $2
    order by m.created_at`, [cid, since])
out.rows = rows.map((r) => ({ ...r, evidence: r.evidence ?? null }))

console.log(`\n══ ROWS WRITTEN IN THIS CONVERSATION: ${rows.length} ═══════════════════`)
let withLineage = 0
for (const r of rows) {
  const l = derivedFromOf(r.evidence)
  if (l) withLineage++
  console.log(`\n   ${r.id}  source=${r.source}  author=${r.author}`)
  console.log(`      content   : ${String(r.content).replace(/\s+/g, ' ')}`)
  console.log(`      OCCASION  : ${r.smid ? r.smid.slice(0, 8) : '⛔ none'}`)
  console.log(`      DERIVATION: ${l ? `${l.basis} ← ${(l.memoryIds ?? []).length} memory id(s) via ${l.via}` : '— none recorded'}`)
  if (l) {
    // ⭐⭐ THE ASSERTION THAT MATTERS: the derivation must not be the occasion under a second name.
    const restates = (l.messageIds ?? []).length === 1 && l.messageIds[0] === r.smid && !(l.memoryIds ?? []).length
    console.log(`      ⇒ occasion ≠ derivation: ${restates ? '⛔ NO — it restates the occasion' : '✅ yes, two different answers'}`)
  }
}

out.summary = { rows: rows.length, withLineage }
console.log(`\n══ ${withLineage} of ${rows.length} rows carry a derivation ═════════════════════`)
if (!rows.length) {
  console.log('   ⚠️ NO ROWS AT ALL — this measures the WRITE path, not the trace. Nothing can be concluded')
  console.log('      about lineage from a turn in which nothing was written. Re-run or check extraction.')
} else if (!withLineage) {
  console.log('   ⛔ NOTHING CARRIES A LINEAGE. Either passive recall returned nothing (so the trace was')
  console.log('      correctly empty — check `recall` hits), or the wiring does not reach the store.')
  console.log('      ⚠️ Both are real answers and they are NOT the same; do not report one as the other.')
} else {
  console.log('   ✅ the trace reaches the database on a real turn.')
}

const file = new URL('../results/lineage-live.json', import.meta.url)
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
console.log(`\n  wrote ${file.pathname.replace(/^\//, '')}`)
await pg.end()
