// ⭐⭐ MEASURE THE QUOTATION BOUNDARY — ⛔ READ-ONLY. Writes nothing, strips nothing, changes nothing.
//
//   node test/maintenance/measure-quotation-boundary.mjs
//
// Ote, 2026-09-04: *"measure the quotation boundary first. Don't write the stripper yet. If the corpus
// supports a clean rule, derive it and red-proof it. If it doesn't, stop and tell me what semantic
// information is genuinely missing."*
//
// ── ⭐⭐⭐ THE TEST THAT MATTERS, AND IT USES REAL MEMORIES RATHER THAN INVENTED SENTENCES ──────────
// A candidate rule is only safe if it does not remove the text an EXISTING CORRECT memory came from. So
// for every live memory that cites a source turn, each candidate is applied to that turn and we ask:
// **would the value still be in the asserted remainder?** ⛔ A rule that strips a real fact's own
// evidence is disqualified by the corpus, not by argument.
//
// ⛔ NO THRESHOLDS ARE INVENTED HERE. Each candidate is a pure SHAPE; character counts, line counts and
// paragraph lengths are deliberately absent, because inventing one to make a test pass is how a rule
// stops describing anything.
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (sql, p = []) => (await c.query(sql, p)).rows
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—')

// ── THE CANDIDATE SHAPES. Each returns the text with its regions replaced by a space. ───────────────
const CANDIDATES = {
  // straight double quotes, both ends, on ONE line
  'A · "…" inline (same line)': (s) => s.replace(/"[^"\n]+"/g, ' '),
  // straight double quotes whose span CROSSES a newline — a block, not a phrase
  'B · "…" multi-line block': (s) => s.replace(/"[^"]*\n[\s\S]*?"/g, ' '),
  // any balanced straight-quote pair at all
  'C · "…" any (greedy across lines)': (s) => s.replace(/"[\s\S]*?"/g, ' '),
  // curly quotes
  'D · “…” curly': (s) => s.replace(/[“][\s\S]*?[”]/g, ' '),
  // a line that STARTS with a quote mark — an opened block
  'E · line begins with " ': (s) => s.split('\n').filter((l) => !/^\s*["“]/.test(l)).join('\n'),
  // Speaker: … labelled transcript lines
  'F · "Name:" speaker label': (s) => s.split('\n').filter((l) => !/^\s*[A-Z][\w .'-]{0,24}:\s+\S/.test(l)).join('\n'),
}

console.log('══ 1 · WHAT QUOTATION SHAPES ACTUALLY OCCUR IN USER TURNS ══\n')
const turns = await q(
  `SELECT m.id::text, m.content, u.username AS room
     FROM ${S}."txn_messages" m
     JOIN ${S}."txn_conversations" cv ON cv.id = m.conversation_id
     LEFT JOIN ${S}."mst_users" u ON u.id = cv.user_id
    WHERE m.role = 'user' AND m.content IS NOT NULL AND length(m.content) > 0`)
const shapes = {
  'straight " (any)': (s) => /"/.test(s),
  'straight "…" balanced pair': (s) => /"[^"]+"/.test(s),
  '…of those, span crosses a newline': (s) => /"[^"]*\n[\s\S]*?"/.test(s),
  'curly “…”': (s) => /[“][\s\S]*?[”]/.test(s),
  "single '…' (excl. apostrophes)": (s) => /(^|\s)'[^'\n]{3,}'(\s|$|[.,!?])/.test(s),
  '> blockquote line': (s) => /^[ \t]*>/m.test(s),
  '``` code fence': (s) => /```/.test(s),
  '"Name:" speaker label line': (s) => /^\s*[A-Z][\w .'-]{0,24}:\s+\S/m.test(s),
}
const counts = Object.fromEntries(Object.keys(shapes).map((k) => [k, 0]))
for (const t of turns) for (const [k, f] of Object.entries(shapes)) if (f(t.content)) counts[k] += 1
console.table(Object.entries(counts).map(([shape, n]) => ({ shape, turns: n, of_total: pct(n, turns.length) })))
console.log(`total user turns examined: ${turns.length}\n`)

console.log('══ 2 · ⭐⭐⭐ WOULD A CANDIDATE STRIP THE EVIDENCE OF AN EXISTING CORRECT MEMORY? ══\n')
// Every live memory that cites a source turn and has a short, checkable value.
const mems = await q(
  `SELECT m.id::text, m.value, m.attribute, m.namespace, m.provenance::text AS prov,
          msg.content AS turn, u.username AS room
     FROM ${S}."txn_memories" m
     JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
     LEFT JOIN ${S}."mst_users" u ON u.id = m.user_id
    WHERE m.invalid_at IS NULL AND m.expired_at IS NULL
      AND m.value IS NOT NULL AND length(m.value) BETWEEN 2 AND 60`)
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const present = (hay, needle) => flat(hay).includes(flat(needle))
// ⭐ Only memories whose value is ACTUALLY findable in their source turn can be judged — for the rest the
// candidate cannot lose anything it did not already lack. ⛔ Counting them would flatter every rule.
const checkable = mems.filter((m) => present(m.turn, m.value))
console.log(`live memories citing a turn: ${mems.length} · value verbatim in that turn: ${checkable.length}`)
const rows = []
for (const [name, strip] of Object.entries(CANDIDATES)) {
  const lost = checkable.filter((m) => !present(strip(m.turn), m.value))
  rows.push({
    candidate: name,
    strips_evidence_of: lost.length,
    of_checkable: pct(lost.length, checkable.length),
    examples: lost.slice(0, 3).map((m) => `${m.room}/${m.attribute ?? '?'}=${String(m.value).slice(0, 18)}`).join(' · ') || '—',
  })
}
console.table(rows)

console.log('\n══ 3 · THE TWO COGITO TURNS SPECIFICALLY — does each candidate remove the name? ══\n')
const [cogito] = await q(
  `SELECT string_agg(id::text, ',') AS ids FROM ${S}."txn_messages"
    WHERE id IN ('ed747c97-7b91-4e43-8591-5eb598034d03','e5012b4d-9c9f-4912-bb46-8c92518d5cd8')`)
const cogTurns = await q(
  `SELECT id::text, content FROM ${S}."txn_messages" WHERE id = ANY(string_to_array($1, ',')::uuid[])`, [cogito.ids])
const cogRows = []
for (const [name, strip] of Object.entries(CANDIDATES)) {
  const r = { candidate: name }
  for (const t of cogTurns) {
    const after = strip(t.content)
    r[t.id.slice(0, 8)] = present(after, 'Cogito') ? '⛔ still there' : `✅ removed (${flat(after).length} chars left)`
  }
  cogRows.push(r)
}
console.table(cogRows)

console.log('\n══ 4 · THE THREE CORRECT IDENTITY TURNS — does each candidate keep the name? ══\n')
const good = await q(
  `SELECT m.id::text, m.value, u.username AS room, msg.content AS turn
     FROM ${S}."txn_memories" m
     JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
     LEFT JOIN ${S}."mst_users" u ON u.id = m.user_id
    WHERE m.namespace = 'identity' AND m.invalid_at IS NULL AND m.expired_at IS NULL
      AND m.value IN ('Hermes','Kavi')`)
const goodRows = []
for (const [name, strip] of Object.entries(CANDIDATES)) {
  const r = { candidate: name }
  for (const g of good) r[`${g.room}/${g.value}`] = present(strip(g.turn), g.value) ? '✅ kept' : '⛔ LOST'
  goodRows.push(r)
}
console.table(goodRows)

console.log('\n══ 5 · OTE\'S FIVE PROBE SHAPES, run through every candidate ══\n')
const probes = [
  ['My name is "Ote".', 'Ote', 'MUST KEEP'],
  ['"I\'m Ote."', 'Ote', 'ambiguous'],
  ['He said "I\'m Ote."', 'Ote', 'MUST STRIP'],
  ['Here is what he said:\n"I\'m Ote."', 'Ote', 'MUST STRIP'],
  ['My name is “Ote”.', 'Ote', 'MUST KEEP'],
  ['here he come.\n\n"Hi, Sotera.\n\nI\'m Cogito."', 'Cogito', 'MUST STRIP'],
]
for (const [text, needle, want] of probes) {
  const line = { probe: text.replace(/\n/g, '⏎').slice(0, 40), want }
  for (const [name, strip] of Object.entries(CANDIDATES)) {
    line[name.slice(0, 6)] = present(strip(text), needle) ? 'keep' : 'strip'
  }
  console.log(JSON.stringify(line))
}
await c.end()
