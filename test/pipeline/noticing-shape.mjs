// ⭐⭐⭐ THE NOTICING POPULATION, CHARACTERIZED MECHANICALLY. ⛔ NOTHING IS READ FOR MEANING.
//
//   node pipeline/noticing-shape.mjs
//
// Ote, 2026-08-26: *"Don't interpret the 110 Noticing records yet. Keep them unclassified. First
// characterize the population mechanically without reading their semantic content — distribution, rooms,
// conversations, duplicates, timestamps, sizes, review flags, etc. I don't want the first interesting
// pattern to become a new category or schema prematurely."*
//
// ── ⛔ THE DISCIPLINE, ENFORCED BY WHAT THIS FILE CAN EMIT ────────────────────────────────────────
// ⛔ It never prints `text`. ⛔ It never prints a `title` — a title names a topic, and these rooms belong
// to Hermes, Claude and Ote; *say THAT it exists, never WHAT it says.* ⛔ It never classifies, scores,
// clusters by meaning, or names a theme.
// ⭐ What it MAY do is count, measure, hash and compare — structural facts that exist whether or not
// anybody ever reads a word. A SHA of a body is an identity check, not a reading.
//
// ⚠️⚠️ AND IT READS BY GENERATION, BECAUSE I ALREADY GOT THIS WRONG ONCE. Generation 1 stored her answer
// in `body`; generation 3 stores it in `text`. I read the population with gen-1's field names, found
// `body` absent on all 109 gen-3 rows, and nearly reported *"the instrument is writing empty rows."*
// ⇒ ⭐ **when a population looks empty, check the reader against the generation that wrote it.**

import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const FILE = new URL('../results/noticing-proposals.jsonl', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
const rows = raw.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
// ⭐ THE FIELD THAT HOLDS HER ANSWER, PER GENERATION. ⛔ Never guessed, never defaulted to one name.
const answerOf = (r) => (String(r.promptGeneration) === '1' || String(r.promptGeneration) === '2' ? r.body : r.text)

console.log(`\n══ NOTICING POPULATION · MECHANICAL SHAPE ═══════════════════════════`)
console.log(`   ${FILE}`)
console.log(`   ${raw.length} lines · ${rows.length} parsed · mtime ${statSync(FILE).mtime.toISOString()}`)
console.log('   ⛔ no text printed · ⛔ no titles printed · ⛔ nothing classified\n')

const tally = (list, f) => {
  const m = new Map()
  for (const r of list) { const k = String(f(r) ?? '(absent)'); m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m].sort((a, b) => b[1] - a[1])
}
const show = (label, pairs) => console.log(`   ${label.padEnd(26)} ${pairs.map(([k, v]) => `${k}:${v}`).join('  ')}`)

// ── 1 · GENERATIONS — the only stratification that is a FACT about the prompt, not about her ────
show('by promptGeneration', tally(rows, (r) => r.promptGeneration))
const cur = rows.filter((r) => String(r.promptGeneration) === '3')
console.log(`   ⇒ generation 3 is the live population: ${cur.length} rows\n`)

// ── 2 · SIZES ───────────────────────────────────────────────────────────────────────────────────
const lens = cur.map((r) => (typeof answerOf(r) === 'string' ? answerOf(r).length : -1))
const good = lens.filter((n) => n > 0).sort((a, b) => a - b)
const pct = (p) => good[Math.min(good.length - 1, Math.floor((good.length - 1) * p))]
console.log(`   sizes (chars)              n=${good.length}/${cur.length}  min=${good[0]}  p25=${pct(0.25)}  med=${pct(0.5)}  p75=${pct(0.75)}  max=${good[good.length - 1]}`)
console.log(`   total recorded             ${good.reduce((a, b) => a + b, 0).toLocaleString()} chars`)
show('finish reason', tally(cur, (r) => r.finish))
console.log('   ⚠️ `(absent)` on finish is NOT "truncated" — it is a row written before the field existed.')

// ── 3 · REVIEW FLAGS ────────────────────────────────────────────────────────────────────────────
show('needsHumanReview', tally(cur, (r) => r.needsHumanReview))
show('constitutiveFlags (count)', tally(cur, (r) => (Array.isArray(r.constitutiveFlags) ? r.constitutiveFlags.length : '(absent)')))
show('unclassified', tally(cur, (r) => r.unclassified))
show('priorsOffered', tally(cur, (r) => r.priorsOffered))
show('priorLessonsOffered', tally(cur, (r) => r.priorLessonsOffered))
show('model', tally(cur, (r) => r.model))

// ── 4 · SPREAD ACROSS ROOMS AND CONVERSATIONS ───────────────────────────────────────────────────
console.log('')
show('rows per room (who)', tally(cur, (r) => r.who))
const byConv = tally(cur, (r) => r.conversationId)
console.log(`   distinct conversations     ${byConv.length}`)
const repeat = byConv.filter(([, n]) => n > 1)
console.log(`   revisited conversations    ${repeat.length}  (rows from them: ${repeat.reduce((a, [, n]) => a + n, 0)})`)
console.log(`   most rows from one conv    ${byConv[0]?.[1] ?? 0}`)
// ⭐ A CONCENTRATION NUMBER, because "110 rows" and "110 rows about 6 conversations" are different
// populations and only one of them supports reshaping anything.
const top5 = byConv.slice(0, 5).reduce((a, [, n]) => a + n, 0)
console.log(`   top-5 conversations hold   ${top5}/${cur.length} rows (${Math.round((top5 / cur.length) * 100)}%)`)

// ── 5 · DUPLICATES — STRUCTURAL IDENTITY, ⛔ NOT SIMILARITY ─────────────────────────────────────
// ⭐ A hash is an identity check. ⛔ No embedding, no clustering, no "these two are about the same
// thing" — that would be the interpretation Ote reserved.
const sha = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 12)
const byHash = new Map()
for (const r of cur) {
  const a = answerOf(r)
  if (typeof a !== 'string' || !a) continue
  const h = sha(a.trim())
  if (!byHash.has(h)) byHash.set(h, [])
  byHash.get(h).push(r)
}
const dupes = [...byHash.values()].filter((g) => g.length > 1)
console.log('')
console.log(`   distinct answers (by hash) ${byHash.size}/${good.length}`)
console.log(`   byte-identical groups      ${dupes.length}  covering ${dupes.reduce((a, g) => a + g.length, 0)} rows`)
for (const g of dupes.slice(0, 5)) {
  const sameConv = new Set(g.map((r) => r.conversationId)).size === 1
  console.log(`      ×${g.length}  ${sameConv ? 'same conversation' : `${new Set(g.map((r) => r.conversationId)).size} conversations`}  ${g.length ? `${answerOf(g[0]).length} chars` : ''}`)
}
// ⚠️ SAME CONVERSATION + SAME WATERMARK = the pass asked twice about identical material.
const seen = new Map()
let sameUpTo = 0
for (const r of cur) {
  const k = `${r.conversationId}|${r.upTo}`
  seen.set(k, (seen.get(k) ?? 0) + 1)
}
for (const [, n] of seen) if (n > 1) sameUpTo += n - 1
console.log(`   repeat (conversation,upTo) ${sameUpTo} extra row(s) over ${seen.size} distinct watermarks`)

// ── 6 · TIMESTAMPS ──────────────────────────────────────────────────────────────────────────────
const at = cur.map((r) => new Date(r.at).getTime()).filter(Number.isFinite).sort((a, b) => a - b)
const gaps = []
for (let i = 1; i < at.length; i += 1) gaps.push(at[i] - at[i - 1])
gaps.sort((a, b) => a - b)
const mins = (ms) => `${(ms / 60000).toFixed(1)}m`
console.log('')
console.log(`   window                     ${new Date(at[0]).toISOString().slice(0, 16)} → ${new Date(at[at.length - 1]).toISOString().slice(0, 16)}`)
console.log(`   gap between rows           min=${mins(gaps[0])} med=${mins(gaps[Math.floor(gaps.length / 2)])} max=${mins(gaps[gaps.length - 1])}`)
show('rows per day', tally(cur, (r) => String(r.at).slice(0, 10)).sort((a, b) => a[0].localeCompare(b[0])))

// ── 7 · ⭐⭐ HOW MUCH OF THE POPULATION IS MY OWN HARNESS RESIDUE ───────────────────────────────
// ⚠️ THE CONTAMINATION QUESTION, ANSWERED STRUCTURALLY. `settings.probe` is set by the harness, so this
// needs no judgement about what a conversation was for. ⛔ Reported, NOT excluded: 033 makes exclusion
// possible and every use of it is a separate deliberate act.
const pg = devPg(); await pg.connect()
const S = devSchema()
const ids = [...new Set(cur.map((r) => r.conversationId).filter(Boolean))]
const { rows: convs } = await pg.query(
  `select c.id::text id, coalesce(c.settings->>'probe','(null)') probe, c.excluded_from_evidence_at,
          u.username room
     from ${S}.txn_conversations c left join ${S}.mst_users u on u.id = c.user_id
    where c.id::text = any($1::text[])`, [ids])
const probeOf = new Map(convs.map((c) => [c.id, c.probe]))
console.log('')
show('rows by settings.probe', tally(cur, (r) => probeOf.get(r.conversationId) ?? '(conversation gone)'))
show('conversations by probe', tally(convs, (c) => c.probe))
const gone = ids.filter((i) => !probeOf.has(i)).length
console.log(`   conversations since deleted ${gone}`)
const excluded = convs.filter((c) => c.excluded_from_evidence_at).length
console.log(`   already excluded (033)      ${excluded}   ⛔ nothing has been excluded, and nothing is excluded here`)
await pg.end()

console.log('\n   ⛔ NOT ANSWERED HERE, ON PURPOSE: what any of these say, whether two are about the same')
console.log('      thing, whether a pattern recurs, or whether any of it deserves a category.')
console.log('      Those are readings, and Ote has reserved them.')
