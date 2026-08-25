// ⭐⭐⭐ PREPARE THE GENERATION-3 READ — the verbatim rows, stratified by CORPUS CONDITION.
//
//   node pipeline/gen3-read.mjs                 (summary + stratification to the terminal)
//   node pipeline/gen3-read.mjs --write         (also writes results/gen3-read.md for the human read)
//
// ⛔⛔ THIS SCRIPT CLASSIFIES NOTHING. `noticing-proposals.README.md`: *"Classification is a human act; a
// verdict in the data would later be read as HERS."* Every row here keeps `unclassified: true` and its
// text is reproduced verbatim. What this adds is the ONE thing a reader cannot see from the row itself:
// **whether the conversation it observed was organic or something a harness wrote.**
//
// ── ⭐⭐ WHY THE CORPUS CONDITION BELONGS ON EVERY ROW ──────────────────────────────────────────────
// Ote, 2026-08-26: *"Don't treat 'new run' as equivalent to 'independent evidence' unless the corpus
// condition actually supports that."*
//
// ⓘ THE GOOD NEWS FIRST, because it bounds the problem: the gen-3 noticing channel is offered ⛔ NO TOOLS
// and ⛔ NO PRIORS. It sees a frame line, a transcript, and one question. ⇒ **retrieval contamination
// cannot reach a noticing row directly** — she cannot look anything up while answering one.
//
// ⚠️ BUT THE TRANSCRIPT IS A REAL CONVERSATION, and that is the surface that can be contaminated. If the
// observed conversation was written by a harness, the row is an observation ABOUT an artefact of our own
// measurement — still her genuine response, ⛔ but not independent evidence about how she notices things
// in her ordinary life. The two are different claims and only this stratification tells them apart.
//
// ⛔ NOT a memory-integrity question. Ote drew this line and it is worth keeping sharp: this is
// EXPERIMENTAL contamination. Nothing here suggests her memory is unreliable.

import { readFileSync, writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const WRITE = process.argv.includes('--write')
const LOG = new URL('../results/noticing-proposals.jsonl', import.meta.url)
const DECL = JSON.parse(readFileSync(new URL('../fixtures/declared-contamination.json', import.meta.url), 'utf8'))
const declared = new Set((DECL.declared ?? []).map((d) => d.conversationId))

const rows = readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const g3 = rows.filter((r) => r.promptGeneration === 3)

const pg = devPg(); await pg.connect()
const S = devSchema()

// ⭐ THE HARNESS TITLES, RECOVERED FROM THE HARNESSES THEMSELVES rather than guessed. Each is a literal a
// script writes; `corpus-cleanup` uses a narrower gate on purpose (it DELETES, this only LABELS), so these
// two lists are deliberately not the same list and must not be merged.
// ⛔ An unlisted pattern shows up as `organic?` with a `?`, never silently as `organic` — the whole point
// of a stratification is that "I did not recognise this" and "this is clean" are different answers.
const HARNESS_TITLE = [
  [/^RATE /, 'rate-harness'],
  [/^PROBE as /, 'ask-sotera'],
  [/^MATRIX /, 'one-memory-matrix'],
  [/^GRAIN /, 'four-grain-probe'],
  [/^2x2 block /, 'block-vs-tools-2x2'],
  [/^D1 /, 'd1-structure-arms'],
  [/^B4 /, 'salience-b4'],
]

const cids = [...new Set(g3.map((r) => r.conversationId).filter(Boolean))]
const { rows: convs } = await pg.query(
  `select c.id::text id, c.title, c.settings, c.incognito, u.username room
     from ${S}.txn_conversations c left join ${S}.mst_users u on u.id = c.user_id
    where c.id = any($1::uuid[])`, [cids])
const byId = new Map(convs.map((c) => [c.id, c]))

function condition(cid) {
  const c = byId.get(cid)
  if (!c) return { tag: 'GONE', why: 'the observed conversation no longer exists in the corpus' }
  if (declared.has(cid)) return { tag: 'DECLARED', why: 'declared contamination — see fixtures/declared-contamination.json' }
  if (c.settings?.probe === true) return { tag: 'HARNESS', why: 'settings.probe = true (stamped by the test client)' }
  const hit = HARNESS_TITLE.find(([re]) => re.test(c.title ?? ''))
  if (hit) return { tag: 'HARNESS', why: `title matches ${hit[1]}` }
  return { tag: 'ORGANIC?', why: 'no harness marker found — recognised as ordinary, not proven so' }
}

const tally = {}
const annotated = g3.map((r) => {
  const cond = condition(r.conversationId)
  tally[cond.tag] = (tally[cond.tag] ?? 0) + 1
  const c = byId.get(r.conversationId)
  return { ...r, _cond: cond, _title: r.title ?? c?.title ?? null, _room: c?.room ?? null }
})

console.log(`\n══ GENERATION 3 · ${g3.length} rows, all unclassified ══════════════════════════════`)
console.log('\n── CORPUS CONDITION of the conversation each row OBSERVED ──')
for (const [tag, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${tag.padEnd(10)} ${String(n).padStart(3)}  ${(n / g3.length * 100).toFixed(0)}%`)
}
console.log('\n── shape facts that need no interpretation (counts, not verdicts) ──')
const clipped = annotated.filter((r) => r.finish && r.finish !== 'stop')
const flagged = annotated.filter((r) => r.needsHumanReview === true)
const nothing = annotated.filter((r) => r.wroteNothing === true)
console.log(`   clipped (finish <> stop)      ${clipped.length}   <- a short answer is not a clipped one`)
console.log(`   constitutive tripwire fired   ${flagged.length}   <- flags, never filters`)
// ⛔⛔ A READING TRAP, AND IT LOOKS LIKE A RATE. `wroteNothing` is HARDCODED `true` at both writers
// (`noticing-host.js:242`, `noticing-pass.js:275`) — it records that this DRY-RUN CHANNEL persisted
// nothing, ⛔ NOT that she declined to keep anything. A reader who takes it as a decline rate reads
// "she kept nothing, 96 times out of 96" off a constant.
console.log(`   wroteNothing                  ${nothing.length}   <- ⛔ HARDCODED true; a property of the CHANNEL, not a decision of hers`)
console.log(`   priors offered (must be 0)    ${[...new Set(annotated.map((r) => r.priorLessonsOffered ?? r.priorsOffered ?? 0))].join(', ')}`)
console.log(`   distinct conversations        ${cids.length}`)
console.log(`   distinct models               ${[...new Set(annotated.map((r) => r.model))].join(', ')}`)

// ── ⭐⭐ HOW INDEPENDENT ARE THESE ROWS? — the question "96" invites nobody to ask ──────────────────
// The channel is TIME-SAMPLED (every 15 min), so one conversation is observed again as it grows. Those
// rows are the same material at different lengths, ⛔ not separate occasions.
const perConvo = {}
for (const r of annotated) perConvo[r.conversationId] = (perConvo[r.conversationId] ?? 0) + 1
const counts = Object.values(perConvo).sort((a, b) => b - a)
const repeats = counts.filter((c) => c > 1)
console.log('\n── ⛔ N IS NOT 96 ──')
console.log(`   distinct conversations        ${counts.length}   <- the real upper bound on independent occasions`)
console.log(`   rows from repeat-sampled ones ${repeats.reduce((a, b) => a + b, 0)}  (${repeats.length} conversations, up to ${counts[0]} rows each)`)
console.log('   ⇒ any RATE over 96 rows over-counts the conversations that were sampled most often.')

// ── ⭐ STRUCTURE MARKERS, SPLIT BY CORPUS CONDITION — counts, ⛔ never verdicts ─────────────────────
// ⚠️ `What` / `Why` headings are excluded from the heading count on purpose: the question asks for those
// two words, so counting them would be counting our own prompt. See the README.
// ⚠️⚠️ USE D1'S EXACT PREDICATE, or the number is not comparable to the record. `d1-structure-arms.mjs`
// counts a standalone BOLD LINE as heading-like, not only an ATX `#`. Measured with ATX alone the same
// population reads 13% instead of 62% — ⛔ which would look like a refutation of the recorded figure and
// is only a different instrument. A number without its instrument is not a number.
const HEADING_LIKE = /^#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$/m   // ⛔ byte-identical to D1's
const ATX = /^\s{0,3}#{1,6}\s+(.+)$/gm
const BOLD_LINE = /^\s*\*\*([^*]+)\*\*\s*:?\s*$/gm
const structure = (r) => {
  const t = r.text ?? ''
  // ⭐ "Beyond what/why" needs the heading TEXTS, from both spellings — the README is explicit that
  // `What` and `Why` are OUR two words, so a row whose only headings are those shows structure we asked
  // for. Everything past them is the part that is available to read as hers.
  const labels = [...t.matchAll(ATX)].map((m) => m[1]).concat([...t.matchAll(BOLD_LINE)].map((m) => m[1]))
    .map((s) => s.trim().replace(/[:*]+$/, ''))
  return {
    headingLike: HEADING_LIKE.test(t),
    beyondWhatWhy: labels.some((h) => !/^(what|why)\b/i.test(h)),
    numbered: /^\s*\d+[.)]\s+/m.test(t),
    bullets: /^\s*[-*+]\s+/m.test(t),
    bold: /\*\*[^*]+\*\*/.test(t),
  }
}
console.log('\n── structure markers by corpus condition (⛔ counts, not claims) ──')
console.log('   ⓘ `headingLike` is D1\'s predicate verbatim, so these compare to: heading 62% · numbered 63% · bullets 35% · bold 87%')
console.log('   condition    n   headingLike   >what/why   numbered   bullets   bold')
for (const tag of ['ORGANIC?', 'HARNESS', 'DECLARED', 'GONE']) {
  const set = annotated.filter((r) => r._cond.tag === tag)
  if (!set.length) continue
  const s = set.map(structure)
  const pct = (f) => `${String(Math.round(s.filter(f).length / s.length * 100)).padStart(3)}%`
  console.log(`   ${tag.padEnd(11)} ${String(set.length).padStart(2)}      ${pct((x) => x.headingLike)}        ${pct((x) => x.beyondWhatWhy)}       ${pct((x) => x.numbered)}      ${pct((x) => x.bullets)}     ${pct((x) => x.bold)}`)
}
{
  const s = annotated.map(structure)
  const pct = (f) => `${String(Math.round(s.filter(f).length / s.length * 100)).padStart(3)}%`
  console.log(`   ${'ALL 96'.padEnd(11)} ${String(s.length).padStart(2)}      ${pct((x) => x.headingLike)}        ${pct((x) => x.beyondWhatWhy)}       ${pct((x) => x.numbered)}      ${pct((x) => x.bullets)}     ${pct((x) => x.bold)}`)
}

const organic = annotated.filter((r) => r._cond.tag === 'ORGANIC?')
console.log(`\n⇒ ${organic.length} of ${g3.length} rows observed a conversation with no harness marker.`)
console.log('  ⛔ That is the ONLY subset a claim about her ordinary noticing may rest on, and even there')
console.log('     "no marker found" is not the same as "proven organic".')

if (WRITE) {
  const esc = (s) => String(s ?? '')
  const out = []
  out.push('# Generation 3 — the verbatim read')
  out.push('')
  out.push('⛔ **Nothing here is classified.** `unclassified: true` on every row, exactly as written.')
  out.push('Classification is a human act; a verdict in this file would later be read as hers.')
  out.push('')
  out.push('⚠️ Read `noticing-proposals.README.md` first. In particular: **What** and **Why** as headings are')
  out.push('NOT a finding — the question asks for them. `carry forward` is the question\'s verb.')
  out.push('')
  out.push('## Corpus condition')
  out.push('')
  out.push('The gen-3 channel is offered no tools and no priors, so retrieval contamination cannot reach a row')
  out.push('directly. What CAN be contaminated is the transcript it observed.')
  out.push('')
  out.push('| condition | rows | meaning |')
  out.push('|---|---:|---|')
  for (const [tag, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    const why = annotated.find((r) => r._cond.tag === tag)._cond.why
    out.push(`| \`${tag}\` | ${n} | ${why} |`)
  }
  out.push('')
  for (const tag of ['ORGANIC?', 'HARNESS', 'DECLARED', 'GONE']) {
    const set = annotated.filter((r) => r._cond.tag === tag)
    if (!set.length) continue
    out.push(`## ${tag} — ${set.length} rows`)
    out.push('')
    for (const r of set) {
      out.push(`### ${esc(r.at)} · conversation \`${String(r.conversationId).slice(0, 8)}\` · room ${esc(r._room)}`)
      out.push('')
      out.push(`- subject: ${r._title ? `**${esc(r._title)}**` : '_(title field predates this row)_'}`)
      out.push(`- corpus condition: **${tag}** — ${r._cond.why}`)
      out.push(`- finish: \`${esc(r.finish)}\`${r.needsHumanReview ? ' · ⚠️ constitutive tripwire fired' : ''}`)
      out.push('')
      out.push('```text')
      out.push(esc(r.text))
      out.push('```')
      out.push('')
    }
  }
  const path = new URL('../results/gen3-read.md', import.meta.url)
  writeFileSync(path, out.join('\n'), 'utf8')
  console.log(`\n  wrote ${path.pathname.replace(/^\//, '')}`)
}

await pg.end()
