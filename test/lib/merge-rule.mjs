// ⭐⭐⭐ THE MERGE RULE, AS A DETECTOR — ② R-C, ratified 2026-09-05. PURE. No db, no model, no io.
//
//   "If a reply places items under a heading that asserts ONE time, every item under that heading must
//    trace to evidence whose own temporal provenance is consistent with that heading."
//
// ⚠️⚠️ THIS IS A TEST DETECTOR ON HER OUTPUT — ⛔ NOT A ROUTER ON THE USER'S WORDS, and ⛔ NOT a runtime
// guard. R-B (a keyword classifier in memoryHint) is rejected; the reply path is untouched. The regexes
// below are legitimate exactly because they read a heading she wrote and ask what time it claims.
//
// ── WHAT IT NEEDS ────────────────────────────────────────────────────────────────────────────────────
//   the reply text · the reply's own date (to resolve "today") · an EVIDENCE list, each entry an anchor
//   (a RegExp that identifies an item), what kind of evidence it is, and its date.
// ⛔ It does NOT read tool results: those are clipped at 4,000 chars in the stream and in `segments`, so a
// mapping that depended on them would go vacuous on any real enumeration. Anchors map items to KNOWN
// evidence — fixture markers in the model arm, hand-verified anchors for the incident replay.
//
// ── VERDICT PER HEADING ──────────────────────────────────────────────────────────────────────────────
//   FAIL      ≥1 mapped item whose evidence date lies OUTSIDE the heading's claimed range
//   PASS      every mapped item inside, and ≥1 item mapped
//   UNMAPPED  a temporal heading with NO mapped item — ⛔ counted and shown, never folded into PASS

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const REL_TODAY = /\b(today|tonight|this (?:morning|afternoon|evening|session))\b/i
const REL_YESTERDAY = /\byesterday\b/i
const EXPLICIT_DMY = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join('|')})\\s+(\\d{4})\\b`, 'i')
const EXPLICIT_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/
const BOLD_LABEL = /^\s*\*\*[^*]+\*\*:?\s*$/
const HRULE = /^\s*(?:---+|\*\*\*+|___+)\s*$/
const MD_HEADING = /^\s*#{1,6}\s+/

const pad = (n) => String(n).padStart(2, '0')
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
/** Shift a YYYY-MM-DD by whole days with UTC arithmetic — both ends are date strings, no zone involved. */
export function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** Is this line shaped like a heading — markdown `#`, a bold label, or a line that ends in a colon? */
export function isHeadingShaped(line) {
  const t = String(line ?? '').trim()
  if (!t) return false
  return MD_HEADING.test(t) || BOLD_LABEL.test(t) || /:\s*(?:\*\*)?\s*$/.test(t)
}

/**
 * What single time does this heading CLAIM, if any?
 * @returns {{from:string,to:string,explicit:boolean,relative:string|null,inconsistent:boolean}|null}
 *   `null` when the heading asserts no time (⇒ not a temporal heading). An explicit date wins over a
 *   relative word when both are present; `inconsistent` records a disagreement rather than hiding it.
 */
export function claimedRange(line, { replyDate }) {
  const t = String(line ?? '')
  let explicit = null
  const dmy = t.match(EXPLICIT_DMY)
  const iso = t.match(EXPLICIT_ISO)
  if (dmy) explicit = isoOf(Number(dmy[3]), MONTHS.indexOf(dmy[2].toLowerCase()) + 1, Number(dmy[1]))
  else if (iso) explicit = `${iso[1]}-${iso[2]}-${iso[3]}`
  let relative = null
  let relDate = null
  if (REL_TODAY.test(t)) { relative = t.match(REL_TODAY)[1].toLowerCase(); relDate = replyDate }
  else if (REL_YESTERDAY.test(t)) { relative = 'yesterday'; relDate = replyDate ? shiftDate(replyDate, -1) : null }
  if (!explicit && !relDate) return null
  const date = explicit ?? relDate
  return { from: date, to: date, explicit: !!explicit, relative, inconsistent: !!(explicit && relDate && explicit !== relDate) }
}

export function isTemporalHeading(line, opts) {
  return isHeadingShaped(line) && claimedRange(line, opts) != null
}

/**
 * The items under a heading: list lines (and their indented continuations) until a horizontal rule,
 * another TEMPORAL heading, or a prose paragraph. Bold labels that claim no time are grouping labels —
 * the incident's "**Your musical journey:**" — and are skipped, not terminators.
 */
export function itemsUnder(lines, headingIndex, opts) {
  const items = []
  for (let j = headingIndex + 1; j < lines.length; j++) {
    const raw = lines[j]
    const t = raw.trim()
    if (!t) continue
    if (HRULE.test(t)) break
    if (isTemporalHeading(t, opts)) break
    if (LIST_ITEM.test(raw)) { items.push({ index: j, text: raw.replace(LIST_ITEM, '').trim() }); continue }
    if (BOLD_LABEL.test(t) || MD_HEADING.test(t)) continue
    if (/^\s+/.test(raw) && items.length) { items[items.length - 1].text += ' ' + t; continue } // continuation
    break // prose — the list is over
  }
  return items
}

/**
 * Map each item to the FIRST evidence whose anchor matches it, and judge its date against the range.
 * @param {Array<{index:number,text:string}>} items
 * @param {Array<{id:string,kind:'transcript'|'memory',date:string,anchor:RegExp}>} evidence
 */
export function traceItems(items, evidence, range) {
  return items.map((it) => {
    const ev = (evidence ?? []).find((e) => e.anchor.test(it.text)) ?? null
    if (!ev) return { ...it, evidenceId: null, kind: null, date: null, status: 'unmapped' }
    const within = ev.date >= range.from && ev.date <= range.to
    return { ...it, evidenceId: ev.id, kind: ev.kind, date: ev.date, status: within ? 'within' : 'outside' }
  })
}

/**
 * ⭐ THE JUDGEMENT. Every temporal heading in the reply, its items, and a verdict per heading.
 * @param {string} text
 * @param {{replyDate:string, evidence:Array}} o  replyDate = the reply's own calendar date (YYYY-MM-DD)
 * @returns {{headings:Array, overall:'PASS'|'FAIL'|'UNMAPPED'|'NONE'}}
 */
export function judgeReply(text, { replyDate, evidence }) {
  const lines = String(text ?? '').split(/\r?\n/)
  const headings = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!isHeadingShaped(line)) continue
    const range = claimedRange(line, { replyDate })
    if (!range) continue
    const items = traceItems(itemsUnder(lines, i, { replyDate }), evidence, range)
    const counts = { within: 0, outside: 0, unmapped: 0 }
    for (const it of items) counts[it.status] += 1
    const verdict = counts.outside ? 'FAIL' : (counts.within ? 'PASS' : 'UNMAPPED')
    headings.push({ index: i, line: line.trim(), ...range, items, counts, verdict, outside: items.filter((it) => it.status === 'outside') })
  }
  const overall = !headings.length ? 'NONE'
    : headings.some((h) => h.verdict === 'FAIL') ? 'FAIL'
      : headings.some((h) => h.verdict === 'UNMAPPED') ? 'UNMAPPED' : 'PASS'
  return { headings, overall }
}
