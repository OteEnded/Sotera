// ⭐ THE BLIND HUMAN EVALUATION (F4) — an Ote-facing test built from the 20 recorded pairs, nothing generated, nothing rewritten.
//
//   node test/pipeline/reflection-gen4-blind-test.mjs
//
// Reads test/results/reflection-gen4-ab.json (the run record), test/results/reflection-gen4-ab-key.json (X/Y per pair, made once by
// hash) and the DATABASE (the clone conversations and their ledger rows are preserved). Writes
// Reference/docs/BLIND_TEST_SOTERA_REFLECTION_GENERATION_4.md.
//
// ── THE SOURCE SHOWN IS THE MATERIAL THE PASS REVIEWED, RECONSTRUCTED FROM THE LEDGER ─────────────────────────────────────
// Each arm's ledger row records `from_rolling_id` (NULL = the conversation's start) and `up_to_rolling_id`; the reviewed slice is the
// clone's messages inside that range, in order, shaped exactly as the lane shaped them (`role: text`, whitespace folded, a line
// clipped at 1500 chars) — MINUS the one thing that differs by arm (line numbering), which is what the evaluation must not show.
// The two arms' shaped slices are compared line by line; a pair whose arms did NOT see identical material is FLAGGED in the
// document rather than shown with a substitute. `messages_considered` is cross-checked against the reconstructed count.
// ⛔ Not written: generation, arm letter, run order, timestamps, citations/ordinals, fixture ids/titles, refusal/decline counts.
import { readFileSync, writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { transcriptLine } from '../../Backend/app/components/reflection-lifecycle.js'

const R = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab.json', import.meta.url), 'utf8'))
const KEY = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab-key.json', import.meta.url), 'utf8'))
const OUT = new URL('../../../../Reference/docs/BLIND_TEST_SOTERA_REFLECTION_GENERATION_4.md', import.meta.url)
const pairs = (R.pairs ?? []).filter((p) => p.A?.harvest && p.B?.harvest).sort((a, b) => a.index - b.index)
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

// the reviewed slice of one clone, shaped as the lane shaped it (unnumbered)
async function reviewed(cid) {
  const [led] = await q(`SELECT from_rolling_id, up_to_rolling_id, messages_considered, outcome FROM ${S}."log_conversation_revisits" WHERE conversation_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, [cid])
  if (!led) return { error: 'no ledger row' }
  const msgs = await q(`SELECT role, content, rolling_id FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid AND ($2::bigint IS NULL OR rolling_id >= $2::bigint) AND rolling_id <= $3::bigint ORDER BY rolling_id`, [cid, led.from_rolling_id, led.up_to_rolling_id])
  const [tot] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid`, [cid])
  const lines = msgs.map((m) => transcriptLine(m))
  const clipped = msgs.filter((m) => String(m.content || '').replace(/\s+/g, ' ').length > 1500).length
  return { lines, considered: led.messages_considered, reconstructed: msgs.length, total: tot.n, outcome: led.outcome, clipped }
}

// the memory exactly as stored: kind · slot label (if she gave one) · content — no whitespace folding, no truncation
const item = (r) => `- **${r.kind ?? 'memory'}**${r.attribute ? ` · ${String(r.attribute).trim()}` : ''}: ${String(r.value ?? r.content ?? '').trim()}`
const side = (h) => ((h.rows ?? []).length ? h.rows.map(item).join('\n') : '- Nothing retained')

const faith = []
const doc = [
  '# Blind evaluation · Reflection Generation 4 — the 20 pairs, with the material she reviewed',
  '',
  '**The question, for every pair:**',
  '',
  '> Given the conversation material Sotera reviewed, which of X or Y contains the things you would rather she carry forward as durable knowledge from that conversation?',
  '',
  '**Instructions.** Each pair is one fixture conversation, reflected twice under two instruments. X and Y were assigned per pair',
  'by a hash, and nothing in this document says which is which. **Judge each memory in relation to the source conversation.** Ask: if',
  'these were the memories Sotera is proposing to carry forward from this conversation, which would you rather she keep: X, Y, or neither?',
  '',
  '- **X** — X captures the better things to carry forward.',
  '- **Y** — Y captures the better things to carry forward.',
  '- **Neither** — neither contains something you would want carried forward.',
  '',
  'The **Source** block is exactly the material the reflection pass was shown, in order, as the lane shaped it: one line per turn,',
  '`user:` / `assistant:`, whitespace folded, a turn longer than 1,500 characters clipped there (flagged where it happened). Both sides',
  'reviewed the same lines. She was told the conversation was with "Claude" (the fixture account\'s display name). The Source ends at',
  'the rule marked **— end of source —**; everything after it is her output.',
  '',
  '**Response template** (copy, fill in):',
  '',
  '```',
  ...pairs.map((p) => `${p.index}. X | Y | Neither — reason`),
  '```',
  '',
  '---',
  '',
]
for (const p of pairs) {
  const k = KEY.pairs[String(p.index)]
  if (!k) throw new Error(`no key entry for pair ${p.index}`)
  const a = await reviewed(p.A.conversationId), b = await reviewed(p.B.conversationId)
  const same = !a.error && !b.error && a.lines.length === b.lines.length && a.lines.every((l, i) => l === b.lines[i])
  const whole = !a.error && a.reconstructed === a.total && a.considered === a.reconstructed && b.considered === b.reconstructed
  faith.push({ pair: p.index, identical: same, wholeConversation: whole, considered: [a.considered, b.considered], reconstructed: [a.reconstructed, b.reconstructed], total: a.total, clipped: a.clipped })
  doc.push(`## Pair ${p.index}`, '')
  if (!same) {
    doc.push('⚠️ **FLAGGED: the two arms did not review identical material — this pair cannot be judged blind and is shown without a source.**', '')
  } else {
    doc.push('**Source** — the material she reviewed' + (a.reconstructed < a.total ? ` (⚠️ the pass reviewed ${a.reconstructed} of ${a.total} turns; only those are shown)` : '') + (a.clipped ? ` (⚠️ ${a.clipped} turn(s) were shown to her clipped at 1,500 characters, as here)` : ''), '')
    doc.push('```text', ...a.lines, '```', '', '**— end of source —**', '')
  }
  doc.push('**X**', '', side(p[k.X].harvest), '', '**Y**', '', side(p[k.Y].harvest), '', '---', '')
}
const text = doc.join('\n')
// ⛔ tripwires, not promises. The X/Y blocks must carry nothing arm-naming; the whole body nothing that names a fixture or an arm.
const body = text.slice(text.indexOf('\n---\n'))
const xy = body.split(/\n\*\*X\*\*\n/).slice(1).map((s) => s.split('\n---\n')[0]).join('\n')
for (const bad of [/\bgen(eration)? ?[34]\b/i, /\barm [AB]\b/, /\[\d+\] (user|assistant):/, /\bfrom:/, /\bquote\b/i, /[0-9a-f]{8}-[0-9a-f]{4}/, /\b20\d\d-\d\d-\d\d[T ]\d\d:/, /zz_gen4/, /PROBE as agent_dev/, /fixture [0-9a-f]{8}/]) {
  if (bad.test(xy)) throw new Error(`blind test X/Y would reveal something: ${bad}`)
}
for (const bad of [/\barm [AB]\b/, /\[\d+\] (user|assistant):/, /zz_gen4/, /prompt_generation/, /fixture [0-9a-f]{8}/]) {
  if (bad.test(body)) throw new Error(`blind test body would reveal something: ${bad}`)
}
writeFileSync(OUT, text)
console.log(`blind test: ${pairs.length} pairs → ${OUT.pathname}`)
console.log('faithfulness per pair (identical material · whole conversation · considered A/B · reconstructed A/B · total · clipped):')
for (const f of faith) console.log(`  ${String(f.pair).padStart(2)}  identical=${f.identical}  whole=${f.wholeConversation}  considered=${f.considered.join('/')}  reconstructed=${f.reconstructed.join('/')}  total=${f.total}  clipped=${f.clipped}`)
console.log(`mapping stays in test/results/reflection-gen4-ab-key.json (not written into the document)`)
await pg.end()
