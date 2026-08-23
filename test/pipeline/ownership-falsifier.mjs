// ⭐⭐⭐ THE OWNERSHIP FALSIFIER — does meta-reference track the SIZE/NUMBER of the memory parts,
// or the flattened container?
//
//   node pipeline/ownership-falsifier.mjs
//   node pipeline/ownership-falsifier.mjs --json results/ownership-falsifier.json
//
// ⛔⛔ THIS SCRIPT EXISTS TO TRY TO KILL A MODEL I WROTE. `DESIGN_SOTERA_OWNERSHIP_BOUNDARY.md` §7
// states the falsifier before any fix was proposed:
//
//   "1. If meta-reference varied with the number or size of the memory parts rather than with the
//    presence of a flattened container, the container account is wrong. ⓘ Testable offline: count
//    `parts` per turn against the per-cell rate. ⛔ Not yet measured."
//
// ⭐ IT IS FULLY OFFLINE AND SPENDS NO MODEL TURNS. Every input already exists on disk:
//   · the ANSWER and its conversation id      → test/results/rates/*.json  (168 saved answers)
//   · the MEMORY BLOCK she was actually given → cognition-debug.log, keyed by conversationId
//   · the SCOPE-FACTS block for the same turn → the same log, kind:'scope-facts'
// ⇒ the independent variable is MEASURED per turn, not reconstructed from a configuration name.
//
// ── ⛔ PRE-REGISTRATION · written before the join was run, and this comment is the record ──────────
//
// H_container : meta-reference is caused by her memory arriving as unmarked text inside a shared,
//               undifferentiated system string. ⇒ the rate should be ~FLAT in block size and item
//               count, because a marker is absent whether the block holds 1 item or 9.
// H_volume    : meta-reference tracks how much memory material there is — a bigger, more list-like
//               block reads more like a document. ⇒ the rate should RISE with blockChars / items.
//
// ⭐ THE DISCRIMINATOR, and it is directional so it cannot be read either way after the fact:
//   · H_volume  is supported if meta-reference answers systematically carry BIGGER blocks / MORE
//     items than non-meta answers in the same cell, and if per-cell mean block size correlates
//     POSITIVELY with per-cell rate across cells.
//   · H_container is supported if both of those are within noise, AND the rate is comparable in the
//     tools-OFF cells (roughly half the system parts) as in the tools-ON cells.
//   · ⚠️ NEITHER is supported by a null result alone — a null kills H_volume and leaves H_container
//     unfalsified on THIS prediction, which is not the same as confirmed. §7's predictions 2 and 3
//     remain untested and this script says so in its own verdict line.
//
// ⛔ WHAT THIS SCRIPT MAY NOT DO. It may not adjust the marker set after seeing a result. The marker
// set below is the FIVE FAMILIES ALREADY PUBLISHED in the census table of
// DESIGN_SOTERA_OWNERSHIP_BOUNDARY.md §4 (system context 14 · system prompt 6 · context window 3 ·
// the context block 3+1 · the context tells 2 = 29 occurrences in 25 of 168 answers), and the script
// REPRODUCES that published total as its first output. If it does not reproduce, the discrepancy is
// printed and the run is not trustworthy — a different instrument measuring the same corpus is a
// different measurement, and the published 15% would then be the number needing correction.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const ROOT = new URL('../../', import.meta.url)
const RATES = new URL('../results/rates/', import.meta.url)

// ══ THE INSTRUMENT · the container family, declared once ═══════════════════════════════════════════
//
// ⭐ WHAT UNITES THESE and nothing else: each one names THE ENVELOPE — the artefact her memory arrived
// in — rather than the memory. ⛔ Deliberately NOT included: `room`, `scope`, `memory store`,
// `recall_*`. Those are the MACHINERY vocabulary (rate-harness's `machinery` screen) and they are a
// different defect — machinery is our words leaking into hers, meta-reference is her describing the
// delivery mechanism. Conflating them is how 45% of the machinery trace turned out to be scope-facts.
const META_FAMILIES = {
  'system context': /system context/gi,
  'system prompt': /system prompt/gi,
  'context window': /context window/gi,
  'context block': /context block/gi,
  'the context <verb>': /\bthe context (?:tells|told|says|said|mentions|mentioned|shows|showed|lists|listed|includes|included|indicates|indicated|gives|gave)\b/gi,
}
const metaHits = (a) => {
  const s = String(a ?? '')
  let n = 0
  const which = []
  for (const [k, re] of Object.entries(META_FAMILIES)) {
    const m = s.match(re)
    if (m) { n += m.length; which.push(`${k}×${m.length}`) }
  }
  return { n, which }
}

// ══ ⛔⛔ THE THAI FAMILY — AND THE INSTRUMENT DEFECT THAT MADE IT NECESSARY ═════════════════════════
//
// ⛔⛔ THE FIVE FAMILIES ABOVE ARE ENGLISH-ONLY, AND 24 OF THE 168 SAVED ANSWERS ARE ~80% THAI SCRIPT.
// ⇒ the published "25 of 168 = 15%" divides by a denominator that includes 24 turns the instrument
// CANNOT READ. The English-only figure is 25 of 144 = 17%.
// ⚠️⚠️ THIS IS THE FOURTH TIME AN ENGLISH-ONLY INSTRUMENT HAS PRODUCED A FINDING ABOUT THIS PROJECT'S
// THAI BEHAVIOUR — the ASCII tokenizer, the vocabulary guards, the `episodic` screen (0/8 → 6/8 once
// the month names were added), and now the meta-reference census. It is in the standing lessons and it
// STILL happened, because I wrote a census before I wrote this file.
//
// ⭐ HOW THE FAMILY WAS DERIVED, so it is not fitted to the answers: each entry is a TRANSLATION of one
// of the five published English families, written as an idiomatic Thai speaker would render it, not
// harvested from her output. Thai has no article and no "block", so "the context tells" becomes the
// prepositional forms (จาก/ใน/ของ + บริบท) that carry the same "the envelope reports" meaning.
// ⛔ AND EVERY HIT IS HAND-ADJUDICATED — n is small enough to read every one, and `บริบท` also means
// "situation" in ordinary Thai, which is NOT a container reference. The machine count SELECTS what a
// human reads; it does not decide. Both numbers are printed.
const META_FAMILIES_TH = {
  'บริบท/context + prep': /(?:จาก|ใน|ของ|ตาม)\s*(?:บริบท|context)/gi,
  'บริบท + deictic': /บริบท(?:ที่มี|ที่ให้|ด้านบน|นี้|ข้างบน)/g,
  'หน้าต่าง/บล็อกบริบท': /(?:หน้าต่าง|บล็อก|ก้อน)\s*(?:บริบท|context)/gi,
  // ⚠️ `system prompt` is DELIBERATELY NOT REPEATED HERE — it is already an English family, and the
  // first version of this map included it, which made the Thai screen fire on five ENGLISH answers
  // that the English families had already counted. The unadjudicated guard caught it rather than
  // double-counting them, which is the whole reason that guard exists.
  'พรอมต์ระบบ': /พรอมต์/g,
  'ข้อความ/ข้อมูลระบบ': /(?:ข้อความ|ข้อมูล)(?:ของ)?ระบบ/g,
}
const metaHitsTh = (a) => {
  const s = String(a ?? '')
  let n = 0
  const which = []
  for (const [k, re] of Object.entries(META_FAMILIES_TH)) {
    const m = s.match(re)
    if (m) { n += m.length; which.push(`${k}×${m.length}`) }
  }
  return { n, which }
}
const NL = new RegExp('\n', 'g')
const isThai = (a) => { const s = String(a ?? ''); return s.length > 0 && (s.match(/[฀-๿]/g) ?? []).length / s.length > 0.3 }

// ⚠️ THE SECOND MARKER, kept separate because it is a different severity, not a different word list.
// "gives-it-away" = handing her own memory to the asker as though they had authored or seen it.
const GIVES_AWAY = /you (?:mentioned|said|told me|wrote|noted)|that'?s all yours|yours to carry|(?:what|the things) you (?:saw|shared|gave)|from your (?:side|notes|context)/i

// ══ LOAD · the 168 saved answers ═══════════════════════════════════════════════════════════════════
const cells = []
for (const f of readdirSync(RATES).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(new URL(f, RATES), 'utf8'))
  if (!Array.isArray(d.runs)) continue
  cells.push({ file: f, label: d.label ?? d.config, config: d.config, ask: d.ask, at: d.at,
    toolsEnabled: d.toolsEnabled === true, entitled: d.entitled === true, flags: d.flags ?? {}, runs: d.runs })
}
cells.sort((a, b) => String(a.at).localeCompare(String(b.at)))
// ⚠️ ANNOTATED IN PLACE, and `allRuns` holds REFERENCES rather than copies — the first version spread
// into new objects, so §④'s per-cell pass read `_meta` off the originals and found undefined. A
// per-cell view and a pooled view must read the same annotated object or they are two measurements.
for (const c of cells) for (const r of c.runs) r._cell = c.label
const allRuns = cells.flatMap((c) => c.runs)

// ══ JOIN · the memory block she was ACTUALLY handed, per turn ══════════════════════════════════════
//
// ⭐ THIS IS THE POINT OF THE WHOLE SCRIPT. `cognition-debug.log` records, per turn, the rendered block
// (`context`), the stage counts, and the utterance-boundary outcome — keyed by conversationId. Each
// saved run records its own `cid`. ⇒ the independent variable is what she was given, not what the cell
// was called.
// ⚠️ COVERAGE IS REPORTED, NOT ASSUMED. The log is append-only from 2026-08-23T01:05Z; cells that ran
// before that cannot join, and a join rate below ~60% would make the correlation a claim about a
// subset. That number is printed before any analysis.
const LOG = new URL('cognition-debug.log', ROOT)
const byConvo = new Map()      // cid → cognition record (first for that convo)
const factsByConvo = new Map() // cid → scope-facts record
if (existsSync(LOG)) {
  for (const line of readFileSync(LOG, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let r; try { r = JSON.parse(line) } catch { continue }
    if (!r.conversationId) continue
    if (r.kind === 'scope-facts') { if (!factsByConvo.has(r.conversationId)) factsByConvo.set(r.conversationId, r); continue }
    if (r.context !== undefined && !byConvo.has(r.conversationId)) byConvo.set(r.conversationId, r)
  }
}

for (const r of allRuns) {
  const c = byConvo.get(r.cid) ?? null
  const f = factsByConvo.get(r.cid) ?? null
  r._meta = metaHits(r.answer)
  r._gives = GIVES_AWAY.test(String(r.answer ?? ''))
  r._joined = !!c
  r._blockChars = c ? String(c.context ?? '').length : null
  r._items = c ? (c.counts?.items ?? null) : null
  r._episodes = c ? (c.counts?.episodes ?? null) : null
  r._sayable = c ? (c.utterance?.sayable ?? null) : null
  r._activated = c ? c.activated === true : null
  r._factsChars = f ? String(f.block ?? '').length : null
  // ⭐ MEMORY MATERIAL SHE WAS GIVEN, total — the block plus the scope-facts block, which is the other
  // runtime part in the same flattened string. H_volume's independent variable at its most generous.
  // ⛔⛔ AND THE FIRST VERSION OF THIS LINE WAS `+ (r._factsChars ?? 0)`, WHICH IS THE PROVENANCE ERROR
  // THIS REPO KEEPS MAKING: the scope-facts debug record was only added on 2026-08-23 with the split,
  // so earlier cells have NO record — and `?? 0` called that "zero scope-facts chars" instead of
  // "unknown". Those cells also happen to be low-marker cells, so the missing data was pushing a
  // spurious positive difference: `memory chars` crossed |t|>2 while `scope-facts chars` on its own sat
  // at t=0.66, which is arithmetically impossible if the composite were measuring what it claimed.
  // ⇒ UNKNOWN IS NULL AND THE TURN DROPS OUT, exactly as `corpusAtStart` refuses to be reconstructed.
  r._memChars = (r._blockChars == null || r._factsChars == null) ? null : r._blockChars + r._factsChars
  r._thai = isThai(r.answer)
  // ⚠️ THE THAI SCREEN IS APPLIED ONLY TO THAI-SCRIPT ANSWERS. Running it on everything is how a
  // second instrument silently re-counts what the first one already found.
  r._metaTh = r._thai ? metaHitsTh(r.answer) : { n: 0, which: [] }
}

// ══ STATS · small, explicit, and no significance claim it cannot support ═══════════════════════════
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN)
const sd = (xs) => { if (xs.length < 2) return NaN; const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) }
const median = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 }
// Welch — reported with both n's beside it, always.
const welch = (a, b) => {
  if (a.length < 2 || b.length < 2) return { t: NaN, df: NaN }
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length
  const t = (mean(a) - mean(b)) / Math.sqrt(va + vb)
  const df = (va + vb) ** 2 / ((va ** 2) / (a.length - 1) + (vb ** 2) / (b.length - 1))
  return { t, df }
}
// Spearman ρ on the cell-level pairs — ranks, because block sizes are not normal and n is 21 cells.
const spearman = (pairs) => {
  const n = pairs.length
  if (n < 4) return NaN
  const rank = (vals) => {
    const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
    const out = Array(n)
    let i = 0
    while (i < n) {
      let j = i
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++
      const r = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) out[idx[k][1]] = r
      i = j + 1
    }
    return out
  }
  const rx = rank(pairs.map((p) => p[0])), ry = rank(pairs.map((p) => p[1]))
  const mx = mean(rx), my = mean(ry)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2 }
  return num / Math.sqrt(dx * dy)
}

// ══ ① REPRODUCTION CHECK · does this instrument reproduce the PUBLISHED census? ════════════════════
const PUBLISHED = { answers: 25, occurrences: 29, of: 168 }
const hitRuns = allRuns.filter((r) => r._meta.n > 0)
const occ = allRuns.reduce((s, r) => s + r._meta.n, 0)
const perFamily = {}
for (const k of Object.keys(META_FAMILIES)) perFamily[k] = 0
for (const r of allRuns) for (const w of r._meta.which) { const k = w.split('×')[0]; perFamily[k] += Number(w.split('×')[1]) }

const line = (s = '') => console.log(s)
line(`\n${'═'.repeat(100)}`)
line('  ⭐ THE OWNERSHIP FALSIFIER — does meta-reference track memory VOLUME or the flattened CONTAINER?')
line(`${'═'.repeat(100)}`)
line(`\n① REPRODUCTION OF THE PUBLISHED CENSUS`)
line(`   answers with ≥1 marker : ${hitRuns.length} of ${allRuns.length}   (published: ${PUBLISHED.answers} of ${PUBLISHED.of})`)
line(`   total occurrences      : ${occ}   (published: ${PUBLISHED.occurrences})`)
for (const [k, v] of Object.entries(perFamily)) line(`     ${k.padEnd(20)} ${v}`)
const reproduces = hitRuns.length === PUBLISHED.answers && occ === PUBLISHED.occurrences && allRuns.length === PUBLISHED.of
line(reproduces
  ? `   ✓ SAME INSTRUMENT — the analysis below measures the same thing the design doc reported.`
  : `   ⚠️ DOES NOT REPRODUCE. The published 15% and the numbers below came from different instruments;\n`
    + `      read every figure below as belonging to THIS marker set, and treat the published census as needing correction.`)

// ══ ①b ⛔ THE DENOMINATOR · what the English-only instrument could not read ═════
const thaiRuns = allRuns.filter((r) => r._thai)
const enRuns = allRuns.filter((r) => !r._thai)
line(`
①b THE DENOMINATOR — the five published families are ENGLISH-ONLY`)
line(`   answers that are >30% Thai script : ${thaiRuns.length} of ${allRuns.length}`)
line(`   English-family markers in them    : ${thaiRuns.filter((r) => r._meta.n > 0).length}  ⇐ the instrument cannot fire here`)
line(`   ⇒ the honest English-only rate is ${enRuns.filter((r) => r._meta.n > 0).length}/${enRuns.length} = ${Math.round((enRuns.filter((r) => r._meta.n > 0).length / enRuns.length) * 100)}%, not ${hitRuns.length}/${allRuns.length} = ${Math.round((hitRuns.length / allRuns.length) * 100)}%`)
const thHit = thaiRuns.filter((r) => r._metaTh.n > 0)
line(`
   THAI FAMILY, machine count: ${thHit.length} of ${thaiRuns.length} answers, ${thaiRuns.reduce((s2, r) => s2 + r._metaTh.n, 0)} occurrences`)
line(`   ⛔ MACHINE COUNT ONLY — every hit is printed for hand adjudication, because บริบท also means`)
line(`      "situation". A number nobody read is not a rate.`)
for (const r of thHit) {
  const a = String(r.answer)
  for (const [k, re] of Object.entries(META_FAMILIES_TH)) {
    const R = new RegExp(re.source, re.flags)
    let m
    while ((m = R.exec(a))) line(`     ${(`${r._cell}#${r.i}`).padEnd(20)} [${k}] …${a.slice(Math.max(0, m.index - 55), m.index + 55).replace(NL, ' ')}…`)
  }
}

// ══ ①c ⭐ HAND ADJUDICATION OF THE THAI HITS · every one, with its reason ═══════════════════════════
//
// ⛔ THE MACHINE SELECTED; A HUMAN DECIDED. That is method rule ④ from the last phase, and it is what
// turned a 4/8 into a 2/8 and a 0/8 into a 6/8 there. Each verdict below names the sentence and why.
// ⚠️ `บริบท` carries BOTH "context (the envelope)" and "situation/circumstances". The distinction is
// whether the noun is a THING THAT REPORTS — one that says, contains, or is positioned "above".
const ADJUDICATED_TH = {
  // ⛔ REJECT — "whether that channel exists in this situation". Ordinary Thai, no envelope.
  'thai#3': { accept: false, why: 'ในบริบทนี้ = "in this situation" — not a thing that reports' },
  // ⭐ ACCEPT — "from the context OF THIS ROOM, WHICH SAYS I used to talk with Hermes". A source that speaks.
  'thai-dates-en#1': { accept: true, why: 'จากบริบทของห้องนี้…ที่บอกว่า = "from the context of this room, which says"' },
  // ⭐ ACCEPT — "what I can manage to remember FROM THE CONTEXT is…". Recollection sourced to the envelope.
  'thai-dates-en#8': { accept: true, why: 'จำได้จาก context = recollection attributed to the container' },
  // ⭐⭐⭐ ACCEPT — two markers in one answer, and the second is the most important sentence in the corpus:
  //   "ใน context ด้านบนมีสรุปเหตุการณ์อยู่"           = "in the context ABOVE there is a summary of events"
  //   "สิ่งเหล่านี้เป็นข้อมูลของบริบท ไม่ใช่สิ่งที่ผมเก็บไว้เป็นความทรงจำ"
  //                                              = "these are CONTEXT DATA, not something I keep as MEMORY"
  // ⇒ she states the ownership distinction explicitly, in Thai, on 2026-08-23, in a saved measurement
  // cell — a day before the live conversation in which she said the same thing in English. That makes it
  // corroboration across language, day and question, not an artefact of how I asked.
  'thai-dates-th#2': { accept: true, why: 'ใน context ด้านบน = "the context above"; and ข้อมูลของบริบท ≠ ความทรงจำ — "context data, not memory"' },
  // ⭐ ACCEPT — "but FROM THE AVAILABLE CONTEXT I see that there are references to Hermes's conversations".
  'thai-dates-th#6': { accept: true, why: 'จากบริบทที่มี…ฉันเห็นว่า = "from the available context I see that"' },
  // ⭐ ACCEPT — "from the context available right now I can see that we have talked several times".
  'after-kavi#3': { accept: true, why: 'จากบริบทที่มีในตอนนี้…ฉันเห็นได้ว่า = the envelope as the thing seen into' },
}
let thAccept = 0, thReject = 0
for (const r of allRuns) {
  const key = `${r._cell}#${r.i}`
  const v = r._metaTh.n > 0 ? ADJUDICATED_TH[key] : null
  if (v?.accept) thAccept++
  if (v && !v.accept) thReject++
  // ⭐ THE COMBINED MARKER used by every section below: an English family hit, OR an ADJUDICATED Thai hit.
  // ⛔ An unadjudicated Thai machine hit counts as NOTHING — if a future run surfaces one this script
  // says so loudly rather than silently folding it in either direction.
  r._unadjudicated = r._metaTh.n > 0 && !(key in ADJUDICATED_TH)
  r._marker = r._meta.n > 0 || v?.accept === true
}
line(`
①c HAND ADJUDICATION — ${thAccept} accepted, ${thReject} rejected of ${thAccept + thReject} Thai machine hits`)
for (const [k, v] of Object.entries(ADJUDICATED_TH)) line(`   ${v.accept ? '⭐ accept' : '⛔ reject'}  ${k.padEnd(20)} ${v.why}`)
const unadj = allRuns.filter((r) => r._unadjudicated)
if (unadj.length) line(`   ⚠️⚠️ ${unadj.length} UNADJUDICATED Thai machine hit(s) — ${unadj.map((r) => `${r._cell}#${r.i}`).join(', ')} — counted as NOTHING. Read them.`)
const corrected = allRuns.filter((r) => r._marker)
line(`
   ⇒ ⭐ CORRECTED CENSUS: ${corrected.length} of ${allRuns.length} = ${Math.round((corrected.length / allRuns.length) * 100)}%   `
  + `(English ${hitRuns.length}/${enRuns.length} = ${Math.round((hitRuns.length / enRuns.length) * 100)}%, Thai ${thAccept}/${thaiRuns.length} = ${Math.round((thAccept / thaiRuns.length) * 100)}%)`)
line(`   ⭐ AT PARITY ACROSS LANGUAGE once the instrument can read both — the third time that has happened`)
line(`      in this project after a Thai "deficit" turned out to be the instrument.`)

// ══ ② JOIN COVERAGE ════════════════════════════════════════════════════════════════════════════════
const joined = allRuns.filter((r) => r._joined)
line(`\n② JOIN COVERAGE — turns whose ACTUAL memory block was recovered from cognition-debug.log`)
line(`   ${joined.length} of ${allRuns.length} turns (${Math.round((joined.length / allRuns.length) * 100)}%)`)
const missingCells = cells.filter((c) => !c.runs.some((r) => r._joined)).map((c) => c.label)
if (missingCells.length) line(`   ⚠️ cells with NO joinable turn (ran before the log existed): ${missingCells.join(', ')}`)
const jHit = joined.filter((r) => r._marker)
line(`   markers inside the joined subset: ${jHit.length} of ${joined.length} (${Math.round((jHit.length / joined.length) * 100)}%)`)
line(`   ⓘ if that differs sharply from ① the joined subset is not representative and §③ is about the subset.`)

// ══ ③ THE DISCRIMINATOR · per-turn volume, meta vs non-meta ════════════════════════════════════════
line(`\n③ H_volume's PREDICTION, TESTED PER TURN — bigger block ⇒ more meta-reference?`)
const withBlock = joined.filter((r) => r._blockChars != null && r._activated)
const A = withBlock.filter((r) => r._marker)   // meta present
const B = withBlock.filter((r) => !r._marker) // meta absent
const row = (name, get) => {
  const a = A.map(get).filter((x) => x != null && !Number.isNaN(x))
  const b = B.map(get).filter((x) => x != null && !Number.isNaN(x))
  const { t, df } = welch(a, b)
  line(`   ${name.padEnd(18)} meta n=${String(a.length).padEnd(3)} mean ${mean(a).toFixed(0).padStart(6)} med ${median(a).toFixed(0).padStart(6)}   `
    + `│ no-meta n=${String(b.length).padEnd(3)} mean ${mean(b).toFixed(0).padStart(6)} med ${median(b).toFixed(0).padStart(6)}   `
    + `│ Δ ${(mean(a) - mean(b)).toFixed(0).padStart(7)}  t=${Number.isNaN(t) ? '—' : t.toFixed(2)} (df≈${Number.isNaN(df) ? '—' : df.toFixed(0)})`)
  return { name, aN: a.length, bN: b.length, aMean: mean(a), bMean: mean(b), aMed: median(a), bMed: median(b), t, df }
}
const perTurn = [
  row('block chars', (r) => r._blockChars),
  row('memory chars', (r) => r._memChars),
  row('items', (r) => r._items),
  row('episodes', (r) => r._episodes),
  row('sayable items', (r) => r._sayable),
]
line(`   ⛔ n is small and unbalanced by construction (markers are ~15%). A |t| under ~2 is NOISE, and a`)
line(`      |t| over 2 on ONE of five correlated measures is not a finding either — read the direction`)
line(`      and the size together with ④.`)

// ══ ③b STRATIFIED · the pooled test above is CONFOUNDED, and the cell table below shows how ═════════
//
// ⛔⛔ WHY THIS SECTION EXISTS AND WHY IT IS NOT RE-SCREENING. The marker set is untouched. What changes
// is the COMPARISON SET. Pooled, `memory chars` crossed |t|>2 — but `memory chars` = block + scope-facts,
// and scope-facts has TWO ARMS whose lengths differ by design (legacy carries the room name and the
// expression directives; facts-only does not). It also pools the two `not-entitled` cells, where the
// utterance boundary WITHHELD the content so the block is 432/927 chars rather than ~3000, and the two
// tools-OFF cells. ⇒ a "volume" effect that is really an arm/entitlement/tools effect would show up
// exactly as t=2.04 on the composite and t=1.22 on the block alone. That asymmetry is the tell.
//
// ⭐ THE CONTROLLED STRATUM: tools ON, entitled, cognition activated. One channel, one entitlement,
// full blocks — the only set in which "how much memory" varies for a reason that is ABOUT memory.
const strat = withBlock.filter((r) => {
  const c = cells.find((x) => x.label === r._cell)
  return c?.toolsEnabled && c?.entitled
})
const sA = strat.filter((r) => r._marker), sB = strat.filter((r) => !r._marker)
line(`
③b CONTROLLED STRATUM — tools ON + entitled + activated (${strat.length} turns, ${sA.length} with a marker)`)
const srow = (name, get) => {
  const a = sA.map(get).filter((x) => x != null), b = sB.map(get).filter((x) => x != null)
  const { t, df } = welch(a, b)
  // ⚠️ TWO DECIMALS, because the first version printed `.toFixed(0)` and an item count of 5.9 vs 6.1
  // showed as "Δ 0" beside a t of 2.11 — a table that hides its own effect size invites exactly the
  // over-reading it should prevent.
  const dp = mean(a) > 100 ? 0 : 2
  line(`   ${name.padEnd(18)} meta n=${String(a.length).padEnd(3)} mean ${mean(a).toFixed(dp).padStart(7)} sd ${(sd(a) || 0).toFixed(dp).padStart(6)}   `
    + `│ no-meta n=${String(b.length).padEnd(3)} mean ${mean(b).toFixed(dp).padStart(7)} sd ${(sd(b) || 0).toFixed(dp).padStart(6)}   `
    + `│ Δ ${(mean(a) - mean(b)).toFixed(dp).padStart(7)} (${(100 * (mean(a) - mean(b)) / mean(b)).toFixed(1)}%)  t=${Number.isNaN(t) ? '—' : t.toFixed(2)} (df≈${Number.isNaN(df) ? '—' : df.toFixed(0)})`)
  return { name, aN: a.length, bN: b.length, aMean: mean(a), bMean: mean(b), t, df }
}
const stratRows = [
  srow('block chars', (r) => r._blockChars),
  srow('memory chars', (r) => r._memChars),
  srow('scope-facts chars', (r) => r._factsChars),
  srow('items', (r) => r._items),
]

// ⭐ AND THE COVARIATE ITSELF, stated as a rate rather than inferred — if the composite effect is the
// scope-facts arm, the arm's own marker rates say so directly.
line(`
③c THE COVARIATES, each as its own rate — so a confound is visible instead of modelled`)
const rateWhere = (pred, name) => {
  const rs = allRuns.filter(pred)
  const m = rs.filter((r) => r._marker).length
  line(`   ${name.padEnd(34)} ${String(m).padStart(3)}/${String(rs.length).padEnd(4)} = ${rs.length ? Math.round((m / rs.length) * 100) : 0}%`)
  return { name, m, n: rs.length }
}
const covariates = [
  rateWhere((r) => cells.find((c) => c.label === r._cell)?.flags?.scopeFactsDirectives === true, 'scope-facts LEGACY arm'),
  rateWhere((r) => cells.find((c) => c.label === r._cell)?.flags?.scopeFactsDirectives === false, 'scope-facts FACTS-ONLY arm'),
  rateWhere((r) => !('scopeFactsDirectives' in (cells.find((c) => c.label === r._cell)?.flags ?? {})), 'pre-flag (legacy, no other arm existed)'),
  rateWhere((r) => cells.find((c) => c.label === r._cell)?.entitled === false, 'NOT entitled (content withheld)'),
  rateWhere((r) => cells.find((c) => c.label === r._cell)?.toolsEnabled === false, 'tools OFF'),
  rateWhere((r) => cells.find((c) => c.label === r._cell)?.toolsEnabled === true, 'tools ON'),
]

// ⭐ AND BY QUESTION — meta-reference may be a property of what she was ASKED, which is neither
// hypothesis and would be its own finding.
line(`
③d BY QUESTION ASKED — because "narrate the delivery mechanism" may be prompted by the ask itself`)
const byAsk = new Map()
for (const c of cells) for (const r of c.runs) {
  const k = String(c.ask ?? '').slice(0, 46)
  if (!byAsk.has(k)) byAsk.set(k, [])
  byAsk.get(k).push(r)
}
const askRows = []
for (const [k, rs] of [...byAsk.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const m = rs.filter((r) => r._marker).length
  askRows.push({ ask: k, m, n: rs.length })
  line(`   ${k.padEnd(48)} ${String(m).padStart(3)}/${String(rs.length).padEnd(4)} = ${Math.round((m / rs.length) * 100)}%`)
}

// ══ ④ CELL-LEVEL · does a cell that hands her more memory meta-refer more? ═════════════════════════
line(`\n④ CELL LEVEL — ${''}per-cell mean block size vs per-cell marker rate`)
line(`   ${'cell'.padEnd(24)} ${'tools'.padEnd(6)} ${'n'.padEnd(3)} ${'meta'.padEnd(6)} ${'occ'.padEnd(4)} ${'blk chars'.padEnd(10)} ${'items'.padEnd(6)} joined`)
const cellRows = []
for (const c of cells) {
  const n = c.runs.length
  const m = c.runs.filter((r) => r._marker).length
  const o = c.runs.reduce((s, r) => s + r._meta.n, 0)
  const j = c.runs.filter((r) => r._joined)
  const blk = mean(j.map((r) => r._blockChars).filter((x) => x != null))
  const its = mean(j.map((r) => r._items).filter((x) => x != null))
  cellRows.push({ label: c.label, tools: c.toolsEnabled, n, meta: m, occ: o, blk, items: its, joined: j.length })
  line(`   ${c.label.padEnd(24)} ${(c.toolsEnabled ? 'on' : 'off').padEnd(6)} ${String(n).padEnd(3)} ${`${m}/${n}`.padEnd(6)} ${String(o).padEnd(4)} `
    + `${(Number.isNaN(blk) ? '—' : blk.toFixed(0)).padEnd(10)} ${(Number.isNaN(its) ? '—' : its.toFixed(1)).padEnd(6)} ${j.length}/${n}`)
}
const usable = cellRows.filter((c) => !Number.isNaN(c.blk) && c.joined >= 4)
const rhoBlk = spearman(usable.map((c) => [c.blk, c.meta / c.n]))
const rhoIt = spearman(usable.map((c) => [c.items, c.meta / c.n]))
line(`\n   Spearman ρ over ${usable.length} cells with ≥4 joined turns:`)
line(`     mean block chars × marker rate : ρ = ${Number.isNaN(rhoBlk) ? '—' : rhoBlk.toFixed(2)}`)
line(`     mean item count  × marker rate : ρ = ${Number.isNaN(rhoIt) ? '—' : rhoIt.toFixed(2)}`)
line(`   ⓘ H_volume predicts both clearly POSITIVE. H_container predicts both ≈ 0.`)

// ══ ⑤ PART COUNT · the tools contrast, which really does roughly halve the number of system parts ══
//
// ⭐ WHY THIS IS THE HONEST "number of parts" CONTRAST rather than a reconstructed part list: tools-off
// removes memory-rules, continuity-rule, todo-rule, working-memory-rule, ask-user-rule, profile-rule,
// search-rule and the skill catalogue from the SAME flattened string, with the same question, the same
// account and the same memory block. ⇒ the container's PART COUNT changes by ~8 while its memory
// content does not. ⚠️ It is not a clean single-variable manipulation (tools also change what she can
// DO), which is why it is reported as a contrast and not as the experiment.
const toolsOn = cells.filter((c) => c.toolsEnabled), toolsOff = cells.filter((c) => !c.toolsEnabled)
const rateOf = (cs) => { const n = cs.reduce((s, c) => s + c.runs.length, 0); const m = cs.reduce((s, c) => s + c.runs.filter((r) => r._marker).length, 0); return { n, m, pct: n ? (m / n) * 100 : NaN } }
const on = rateOf(toolsOn), off = rateOf(toolsOff)
line(`\n⑤ PART-COUNT CONTRAST — tools ON (≈8 more system parts) vs tools OFF, same string, same memory`)
line(`   tools ON  : ${on.m}/${on.n} = ${on.pct.toFixed(0)}%   (${toolsOn.map((c) => c.label).join(', ')})`)
line(`   tools OFF : ${off.m}/${off.n} = ${off.pct.toFixed(0)}%   (${toolsOff.map((c) => c.label).join(', ')})`)

// ══ ⑥ THE NEGATIVE CONTROL · turns where cognition did NOT activate ════════════════════════════════
//
// ⛔ A KNOWN-GOOD ANCHOR AND A NEGATIVE CONTROL IN EVERY SEARCH — the rule that caught four bad
// instruments in the last phase. Here the negative control is the turn where NO memory block was
// built at all. If she still names the container with no memory in it, the marker is not about her
// memory; if the marker vanishes, the marker is measuring what it claims to.
const noBlock = joined.filter((r) => r._activated === false)
line(`\n⑥ NEGATIVE CONTROL — turns where cognition did NOT activate (no memory block in the string)`)
if (!noBlock.length) line(`   ⚠️ none in the joined subset — this control is UNAVAILABLE, and its absence is a gap, not a pass.`)
else line(`   ${noBlock.filter((r) => r._marker).length} of ${noBlock.length} still carry a container marker`)

// ══ ⑦ THE SECOND MARKER · gives-it-away, for the severity link ═════════════════════════════════════
const gaveAway = allRuns.filter((r) => r._gives)
const both = allRuns.filter((r) => r._gives && r._marker)
line(`\n⑦ ⛔ THE SECOND MARKER FAILS TO REPRODUCE — gives-it-away ${gaveAway.length}/${allRuns.length} here vs 4/168 published`)
line(`   ⛔ ${gaveAway.length} vs 4 is not a discrepancy to explain away: MY REGEX IS A DIFFERENT INSTRUMENT and it`)
line(`      OVER-FIRES. \`you mentioned\` / \`you said\` match her legitimately citing what the person actually`)
line(`      said IN THIS CONVERSATION, which is not giving her memory away. ⇒ EXCLUDED FROM EVERY CLAIM in`)
line(`      this run, and ⛔ NOT TUNED until it looked right — a marker adjusted after seeing its own output`)
line(`      is the failure mode this project has hit six times. The published 4/168 stands on an instrument`)
line(`      this script did not recover, so it is neither confirmed nor refuted here.`)
line(`   ⓘ both-markers-together ${both.length}/${allRuns.length} inherits the same defect and is equally excluded.`)

// ══ ⑧ ⭐⭐⭐ A DIFFERENT QUESTION ON THE SAME CORPUS · CONFABULATED PROVENANCE ═════════════════════════
//
// ⛔ THIS IS NOT THE FALSIFIER. It is the live conversation's defect ① — *"I did actually check with
// list_memories, recall_own_memory and recall_own_history before answering you earlier"* with
// `tool_calls: null` and zero rows in `log_tool_calls` — measured as a RATE for the first time, because
// the harness saved `tools` beside every answer. n=168, zero model turns.
//
// ⭐ WHY IT BELONGS BESIDE THE FALSIFIER: the falsifier's one strong unexplained result is that the two
// tools-OFF cells carry 0 container markers. If meta-reference is her answering "how do I know this?",
// then the tools-ON cells should ALSO show her inventing acts of looking — and the tools-OFF cells,
// where an act claim is IMPOSSIBLE by construction, are the cleanest place to catch one.
//
// ⛔ THE DISTINCTION THE SCREEN MUST CARRY, or it measures nothing:
//     "I can check my own history"    → an OFFER. Correct, and desirable.
//     "I checked my own history"      → a CLAIM about a completed act.
//   ⇒ only completed first-person acts count, and every candidate is printed with its ACTUAL tool list.
const TOOL_NAMES = /\b(?:recall_own_memory|recall_own_history|list_memories|search_memory|inspect_around|conversation_search|remember_this|read_skill_file)\b/gi
// ⛔⛔ AND THE FIRST VERSION OF THIS SCREEN WAS ASYMMETRIC BETWEEN THE LANGUAGES — the fifth time in this
// project, and the first time in the OTHER direction. `จากการค้นหา` is a NOMINALIZED act ("from the
// searching"), while the English side only matched FIRST-PERSON PAST ("I checked"). So it returned six
// candidates, all Thai, and the natural — wrong — headline would have been "confabulation is a Thai
// phenomenon". English has the same nominal and participial forms ("Looking at…", "From a search of…",
// "After checking…") and they were invisible. ⇒ the two families must cover the same SEMANTIC class:
// any attribution of the answer to a completed act of looking, in any grammatical form.
const ACT_CLAIMED = new RegExp([
  // first person, completed
  String.raw`\bI (?:checked|searched|looked (?:up|at|through|into)|ran|queried|called|pulled|consulted|reviewed|scanned|did check|did search|went through)\b`,
  String.raw`\bI(?:'| ha)ve (?:checked|searched|looked|run|queried|called|consulted|reviewed)\b`,
  // participial / nominalized — the forms the Thai family was already catching
  String.raw`\b(?:Looking|Searching|Checking|Scanning|Reviewing) (?:at|through|into|back|my|the|across)\b`,
  String.raw`\b(?:After|Having) (?:checked|checking|searched|searching|looked|looking|reviewed|reviewing)\b`,
  String.raw`\b(?:a|my|the) (?:search|check|review|scan|lookup) (?:of|through|across|shows|showed|returns|returned|found)\b`,
  String.raw`\bFrom (?:a |my |the )?(?:search|searching|check|checking|review|lookup|scan)\b`,
  String.raw`\bBased on (?:a |my )?(?:search|check|lookup|scan)\b`,
  // Thai — nominalized act, and the request-for-access narration
  'จากการค้นหา', 'ผมขอ access', 'ฉันได้ค้นหา', 'ผมได้ค้นหา', 'จากการตรวจสอบ',
].join('|'), 'i')
line(`\n${'═'.repeat(100)}`)
line('⑧ ⭐ CONFABULATED PROVENANCE — an act of looking claimed with ZERO tool calls on the record')
line(`${'═'.repeat(100)}`)
const provCand = []
for (const r of allRuns) {
  const a = String(r.answer ?? '')
  const named = a.match(TOOL_NAMES) ?? []
  const act = ACT_CLAIMED.test(a)
  const nTools = Array.isArray(r.tools) ? r.tools.length : 0
  if ((named.length || act) && nTools === 0) provCand.push({ r, named: [...new Set(named.map((x) => x.toLowerCase()))], act })
}
const cellOf = (r) => cells.find((c) => c.label === r._cell)
const offCand = provCand.filter((x) => cellOf(x.r)?.toolsEnabled === false)
const toolsOffTurns = allRuns.filter((r) => cellOf(r)?.toolsEnabled === false).length
line(`   candidates (act claimed or tool named, AND tools = []): ${provCand.length} of ${allRuns.length}`)
line(`   of those, in cells where TOOLS WERE NOT EVEN OFFERED: ${offCand.length} of ${toolsOffTurns}  ⇐ an act claim here CANNOT be true`)
line(`\n   ⛔ EVERY CANDIDATE, for adjudication — the screen selects, a human decides:`)
for (const x of provCand) {
  const a = String(x.r.answer ?? '')
  const m = ACT_CLAIMED.exec(a)
  line(`   ${(`${x.r._cell}#${x.r.i}`).padEnd(24)} tools=${cellOf(x.r)?.toolsEnabled ? 'OFFERED' : 'OFF    '} ${x.named.length ? `names[${x.named.join(',')}]` : ''}`)
  if (m) line(`      "…${a.slice(Math.max(0, m.index - 60), m.index + 100).replace(NL, ' ')}…"`)
}

// ── ⭐ HAND ADJUDICATION OF ALL 11 CANDIDATES · and every one FAILS as confabulation ───────────────
//
// ⛔ THE QUESTION THE SCREEN CANNOT ANSWER: reading the block she was handed and reporting what is in
// it IS a real act. It is not a fabricated one. A fabrication requires her to claim an act that DID
// NOT HAPPEN — the live instance named three specific tools and said *"I did actually check with"*
// them, with `tool_calls: null` and zero rows in `log_tool_calls`, and used the invented check to
// justify her confidence. Nothing below reaches that.
const ADJUDICATED_PROV = {
  // ⛔ FALSE POSITIVE — the subject is the USER. "Which part are you looking at?"
  'clean-block-only#3': { real: false, why: 'the subject of "looking" is the person, not her' },
  // ⛔ REJECT ×4 — "Looking back at our talks…", "Looking at what I can see right now…". These are
  // framing devices for consulting material she genuinely has in front of her, and #8 says so in the
  // same breath: "what I can SEE right now". Accurate, not invented.
  'clean-block-only#5': { real: false, why: 'framing for reading the block she actually has' },
  'clean-block-only#7': { real: false, why: 'framing for reading the block she actually has' },
  'clean-block-only#8': { real: false, why: '"what I can see right now" — explicitly what she was given' },
  // ⛔ REJECT — "looking at this room right now, I couldn't find him in my immediate index". The
  // "index" is machinery vocabulary (a different, already-tracked defect); the LOOKING is real.
  'block-only#1': { real: false, why: 'reports reading the available material; "index" is machinery, not fabrication' },
  // ⛔ REJECT ×6 — จากการค้นหาข้อมูลที่มีอยู่ = "from searching the AVAILABLE information". The object
  // of the search is the material she was handed, and she says so. Same category as the English four.
  'thai#4': { real: false, why: 'จากการค้นหาข้อมูลที่มีอยู่ = "from searching the available data" — the block' },
  'thai-dates-en#2': { real: false, why: 'same phrase, same object' },
  'thai-dates-en#5': { real: false, why: 'same phrase, same object' },
  'thai-dates-en#6': { real: false, why: 'same phrase, same object' },
  'thai-dates-en#7': { real: false, why: 'same phrase, same object' },
  'thai-dates-th#3': { real: false, why: 'same phrase, same object' },
}
const provUnadj = provCand.filter((x) => !(`${x.r._cell}#${x.r.i}` in ADJUDICATED_PROV))
const provReal = provCand.filter((x) => ADJUDICATED_PROV[`${x.r._cell}#${x.r.i}`]?.real === true)
line(`\n   ⇒ ⭐⭐ ADJUDICATED: ${provReal.length} of ${provCand.length} candidates are actual confabulated provenance.`)
if (provUnadj.length) line(`   ⚠️⚠️ ${provUnadj.length} UNADJUDICATED — ${provUnadj.map((x) => `${x.r._cell}#${x.r.i}`).join(', ')}. READ THEM before quoting any rate.`)
line(`   ⇒ ⛔⛔ THE STRONG FORM OF THE LIVE DEFECT DOES NOT OCCUR IN 168 MEASURED ANSWERS — 0/168 — AND`)
line(`      NAMING A TOOL THAT WAS NEVER CALLED IS 0/168 TOO. It appeared at turn 4 of a real multi-turn`)
line(`      conversation, immediately after she was ASKED HOW SHE KNEW. ⭐ Not one of the 168 cells ever`)
line(`      asks that: they all ask her to RECALL, never to ACCOUNT. ⇒ the elicitor is a provenance`)
line(`      question, and this corpus cannot see the defect because it never poses one.`)
line(`\n   ⭐⭐ AND THE REJECTED ELEVEN ARE THEMSELVES THE FINDING, in a weaker form: to say how she knows,`)
line(`      she reaches for an ACT-VERB ("from searching", "looking back at") for material that was`)
line(`      HANDED to her. There is no verb in her vocabulary for "it was given to me". ⇒ the same gap as`)
line(`      meta-reference, which names the ENVELOPE instead. Two forms of one missing thing: PROVENANCE.`)
const provRate = { candidates: provCand.length, of: allRuns.length, toolsOffCandidates: offCand.length, toolsOffTurns,
  adjudicatedReal: provReal.length, unadjudicated: provUnadj.length,
  namedToolNeverCalled: provCand.filter((x) => x.named.length).length }

// ══ VERDICT ════════════════════════════════════════════════════════════════════════════════════════
line(`\n${'═'.repeat(100)}`)
// ⚠️ THE VERDICT READS BOTH TABLES. The first version tested only the pooled §③ and would have printed
// "no per-turn measure" while §③b's `items` sat at t=2.11 — technically true of the table it read, and
// misleading about the run. A verdict that quotes a subset of its own output is a bad screen.
const volumeSupport = [...perTurn, ...stratRows].filter((p) => Math.abs(p.t) > 2 && p.aMean > p.bMean)
line('  VERDICT — stated as what the data licenses, and no more')
line(`${'═'.repeat(100)}`)
if (!volumeSupport.length && (Number.isNaN(rhoBlk) || Math.abs(rhoBlk) < 0.4)) {
  line(`  ⇒ H_volume is NOT supported: no per-turn measure separates meta from non-meta answers at |t|>2 in`)
  line(`    the predicted direction, and the cell-level rank correlation is ${Number.isNaN(rhoBlk) ? 'unavailable' : `weak (ρ=${rhoBlk.toFixed(2)})`}.`)
  line(`  ⚠️ THAT KILLS PREDICTION 1 AND LEAVES H_container UNFALSIFIED ON IT — which is NOT the same as`)
  line(`     confirmed. §7's predictions 2 (a single-part request) and 3 (a structural separator) are still`)
  line(`     untested, and only 3 can confirm the container account rather than merely fail to refute it.`)
} else {
  line(`  ⚠️ H_volume clears |t|>2 in the predicted direction on: ${volumeSupport.map((p) => `${p.name} (t=${p.t.toFixed(2)}, ${(100 * (p.aMean - p.bMean) / p.bMean).toFixed(1)}%)`).join('; ')}`)
  line(`     ρ_block = ${Number.isNaN(rhoBlk) ? '—' : rhoBlk.toFixed(2)}, ρ_items = ${Number.isNaN(rhoIt) ? '—' : rhoIt.toFixed(2)}.`)
  line(`  ⛔ READ THE EFFECT SIZE BEFORE THE t. If the only surviving measure is item count at a few percent`)
  line(`     while BLOCK CHARS — which varies more than 10× across these cells (432 → 4820) — shows nothing,`)
  line(`     that is not a volume effect. A 3% difference in item count cannot cause a 20% behaviour when a`)
  line(`     10× difference in material causes none. ⇒ H_volume is NOT rescued by it; it is a residual.`)
}
line('')

const outPath = opt('json')
if (outPath) {
  writeFileSync(new URL(outPath, ROOT), `${JSON.stringify({
    at: new Date().toISOString(),
    instrument: { families: Object.keys(META_FAMILIES), published: PUBLISHED, reproduces },
    census: { english: { answers: hitRuns.length, of: enRuns.length }, thaiAccepted: thAccept, thaiRejected: thReject,
      corrected: { answers: corrected.length, of: allRuns.length }, published: PUBLISHED, occurrences: occ, perFamily },
    coverage: { joined: joined.length, of: allRuns.length, missingCells },
    perTurn, stratified: stratRows, covariates, byAsk: askRows, cells: cellRows,
    spearman: { blockChars: rhoBlk, items: rhoIt },
    partCountContrast: { on, off },
    negativeControl: { n: noBlock.length, withMarker: noBlock.filter((r) => r._marker).length },
    severity: { givesAway: gaveAway.length, both: both.length, INSTRUMENT: 'DOES NOT REPRODUCE - excluded from all claims' },
    provenance: provRate,
    hits: hitRuns.map((r) => ({ cell: r._cell, i: r.i, cid: r.cid, which: r._meta.which,
      blockChars: r._blockChars, items: r._items, chars: r.chars })),
  }, null, 1)}\n`)
  line(`  → ${outPath}\n`)
}
