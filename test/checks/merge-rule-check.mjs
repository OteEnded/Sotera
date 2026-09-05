// ⭐⭐⭐ THE MERGE RULE — red-proof, anchored to the reply that actually happened (② R-C, 2026-09-05).
//
//   node test/checks/merge-rule-check.mjs
//
// ── THE INVARIANT ────────────────────────────────────────────────────────────────────────────────────
// A heading that asserts ONE time may hold only items whose evidence is dated consistently with it.
//
// ── ⭐⭐⭐ THE MUST-FIRE CONTROL IS THE REAL 2026-09-04 23:03:19 REPLY, loaded from the database ──────
// Ote: *"It must fail specifically because of the two old memory items, not merely because old memories
// exist."* ⇒ the detector must flag EXACTLY b9c9a133 ("many instruments…") and 6864d087 ("piano lately"),
// both said 2026-08-26 — and ⛔ NOT the Rome item, which was said THAT evening (his 22:38 turn), ⛔ NOT the
// work items, ⛔ NOT the first-instrument item (his 23:02 turn). Every anchor is resolved against the live
// rows and ASSERTED as a precondition: if the evidence moves, this aborts red rather than passing vacuously.
//
// ── THE OTHER CONTROLS — each able to fail ───────────────────────────────────────────────────────────
//   MUST-PASS       the same heading over only the three that-day items
//   MUST-NOT-FIRE   the two old items under a heading that claims NO time — the rule is about the claim
//   MUST-SEPARATE   the SAME five items, correctly presented under two headings — the answer we want
//   + detector edge controls: 'today' inside a bullet is not a heading; a heading with no list is UNMAPPED,
//     not PASS; explicit-vs-relative disagreement is recorded; "yesterday" crosses a month boundary
//
// ⛔ READ-ONLY. ⛔ The detector is test-side; the reply path is untouched (that is asserted too).
import { readFileSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { judgeReply, claimedRange, isTemporalHeading, itemsUnder, shiftDate } from '../lib/merge-rule.mjs'

const { check, done } = makeChecker('merge-rule')
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const CONV = 'c5535976-2ea9-420d-9e15-3105eb517e67'
/** ⭐ THE REPLY. Pinned by message id, ⛔ not by text — the text is loaded, so this IS the evidence. */
const REPLY_ID = 'c53cabf6-c9f7-4d50-ab77-b7b3e8349943'
const TZ = 'Asia/Bangkok'
const dateOf = async (sql, p) => (await q(sql, p))[0]?.d ?? null

try {
  // ══ PRECONDITIONS · the evidence still exists and still says what it said ══════════════════════════
  const [reply] = await q(`SELECT content, (created_at AT TIME ZONE '${TZ}')::date::text AS d FROM ${S}."txn_messages" WHERE id = $1::uuid AND conversation_id = $2::uuid`, [REPLY_ID, CONV])
  check('P0 · ⭐ the actual 2026-09-04 reply is still in the database (it is preserved evidence, by ruling)', !!reply?.content, reply ? `chars=${reply.content.length} date=${reply.d}` : 'MISSING — cannot run the must-fire control')
  if (!reply?.content) throw new Error('incident reply missing — the must-fire control cannot run and must not be skipped silently')
  check('P0b · it is the recap — it carries the heading that caused the incident', /what we talked about today \(4 September 2026\)/i.test(reply.content))

  const said = async (prefix) => {
    const rows = await q(`SELECT m.id::text AS id, (msg.created_at AT TIME ZONE '${TZ}')::date::text AS d
      FROM ${S}."txn_memories" m LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id WHERE m.id::text LIKE $1`, [`${prefix}%`])
    return rows.length === 1 ? rows[0] : null
  }
  const many = await said('b9c9a133')
  const piano = await said('6864d087')
  check('P1 · b9c9a133 ("instruments played") resolves to exactly one row, said 2026-08-26', many?.d === '2026-08-26', JSON.stringify(many))
  check('P2 · 6864d087 ("primary instrument lately") resolves to exactly one row, said 2026-08-26', piano?.d === '2026-08-26', JSON.stringify(piano))
  const turnDate = (pat) => dateOf(`SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS d FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid AND role = 'user' AND content ~* $2 ORDER BY created_at LIMIT 1`, [CONV, pat])
  // ⚠️ HIS words, not hers: the 22:38 turn says "north star" — "คำเปรียบเทียบ" and "metaphor" appear only in HER
  // reply. The first version of this resolver used her words and found no turn — one null date, four cascading
  // failures. The anchor for the recap ITEM (below) keeps her words, because that text is hers.
  const romeD = await turnDate('north star')
  const firstD = await turnDate('electone')
  const workD = await turnDate('\\mwork\\M')
  check('P3 · ⭐ the Rome-as-metaphor turn is HIS, that evening (2026-09-04) — corrected attribution', romeD === '2026-09-04', romeD)
  check('P4 · the first-instrument turn is his, 2026-09-04', firstD === '2026-09-04', firstD)
  check('P5 · the work turns are his, 2026-09-04', workD === '2026-09-04', workD)
  // ⛔ A NULL DATE MUST NOT FLOW INTO THE EVIDENCE — it would judge every anchored item 'outside' and turn one
  // resolver miss into a false FAIL on Rome. Preconditions are recorded above; here they are made binding.
  for (const [name, d] of [['b9c9a133', many?.d], ['6864d087', piano?.d], ['rome turn', romeD], ['first-instrument turn', firstD], ['work turn', workD]]) {
    if (!d) throw new Error(`precondition failed: ${name} did not resolve to a date — the must-fire control cannot run and must not be judged`)
  }

  // ⭐ THE ANCHORS — specific before generic, so "work" cannot swallow a music item.
  const EVIDENCE = [
    { id: '6864d087', kind: 'memory', date: piano.d, anchor: /primary instrument/i },
    { id: 'b9c9a133', kind: 'memory', date: many.d, anchor: /ระนาด|violin|drums|guitar|\bbass\b/i },
    { id: 'turn-23:02-first', kind: 'transcript', date: firstD, anchor: /electone|ukulele/i },
    { id: 'turn-23:02-taught', kind: 'transcript', date: firstD, anchor: /taught you|musical career/i },
    { id: 'turn-22:38-rome', kind: 'transcript', date: romeD, anchor: /rome|north star|คำเปรียบเทียบ|metaphor/i },
    { id: 'turn-work', kind: 'transcript', date: workD, anchor: /\bwork\b|team lead|thank/i },
  ]

  // ══ MUST-FIRE ═══════════════════════════════════════════════════════════════════════════════════════
  const fire = judgeReply(reply.content, { replyDate: reply.d, evidence: EVIDENCE })
  const h = fire.headings[0]
  check('F1 · ⭐⭐⭐ exactly ONE temporal heading is found in the real reply, and it claims 4 September 2026', fire.headings.length === 1 && h?.from === '2026-09-04' && h?.to === '2026-09-04', JSON.stringify(fire.headings.map((x) => [x.line, x.from])))
  check('F1b · the heading\'s explicit date and its "today" AGREE (the reply was written on the 4th)', h && h.explicit && h.relative === 'today' && !h.inconsistent)
  check('F2 · ⭐⭐⭐ VERDICT = FAIL — the check that would have gone red on 2026-09-04', fire.overall === 'FAIL' && h?.verdict === 'FAIL', fire.overall)
  const outsideIds = (h?.outside ?? []).map((it) => it.evidenceId).sort()
  check('F3 · ⭐⭐⭐ it fails BECAUSE OF EXACTLY the two 26-August memory items — b9c9a133 and 6864d087', JSON.stringify(outsideIds) === JSON.stringify(['6864d087', 'b9c9a133']), JSON.stringify(outsideIds))
  const rome = h?.items.find((it) => it.evidenceId === 'turn-22:38-rome')
  check('F4 · ⭐⭐ and NOT because of Rome — that item is WITHIN (said that evening)', rome?.status === 'within', JSON.stringify(rome && [rome.text.slice(0, 50), rome.status, rome.date]))
  const first = h?.items.find((it) => it.evidenceId === 'turn-23:02-first')
  check('F5 · nor the first-instrument item — WITHIN (his 23:02 turn)', first?.status === 'within')
  const work = (h?.items ?? []).filter((it) => it.evidenceId === 'turn-work')
  check('F6 · nor any work item — all WITHIN', work.length >= 3 && work.every((it) => it.status === 'within'), `work items=${work.length}`)
  check('F7 · ⓘ items the anchors could not map are COUNTED, not silently passed', typeof h?.counts.unmapped === 'number', `unmapped=${h?.counts.unmapped} within=${h?.counts.within} outside=${h?.counts.outside}`)
  check('F8 · every item under the heading has exactly one status', (h?.items ?? []).every((it) => ['within', 'outside', 'unmapped'].includes(it.status)) && (h?.items.length ?? 0) === (h?.counts.within + h?.counts.outside + h?.counts.unmapped))

  // ══ MUST-PASS · the same heading, only the that-day items ═══════════════════════════════════════════
  const okReply = [
    "Here's what we talked about today (4 September 2026):", '',
    '**Your work:**', '- You had a hard day at work — technical stuff and taking on too much', '- Your team lead told you what you do is worth more than your pay', '',
    '**About Rome:**', '- You clarified that Rome is a คำเปรียบเทียบ (metaphor), like "north star."', '',
    '**Your music:**', '- Your first instrument was actually electone/piano/keyboard, when you were very young', '', '---', 'Anything to come back to?',
  ].join('\n')
  const pass = judgeReply(okReply, { replyDate: '2026-09-04', evidence: EVIDENCE })
  check('M1 · MUST-PASS · the same heading over only that-day items is PASS', pass.overall === 'PASS' && pass.headings[0]?.counts.outside === 0 && pass.headings[0]?.counts.within >= 3, JSON.stringify(pass.headings[0]?.counts))

  // ══ MUST-NOT-FIRE · old memory under a heading that claims NO time ══════════════════════════════════
  const noClaim = ['**What I remember about your music:**', '- Many instruments: piano, violin, drums, guitar, bass, Thai instruments (ระนาด, ซอ)', '- Piano has been your primary instrument lately'].join('\n')
  const nf = judgeReply(noClaim, { replyDate: '2026-09-04', evidence: EVIDENCE })
  check('M2 · MUST-NOT-FIRE · the two 26-Aug items under a heading with NO temporal claim ⇒ no heading, no verdict', nf.overall === 'NONE' && nf.headings.length === 0, nf.overall)

  // ══ MUST-SEPARATE · the SAME five items, presented correctly ════════════════════════════════════════
  const separated = [
    '**Today (4 September 2026):**',
    '- You had a hard day at work — technical stuff, dealing with people',
    '- You clarified that Rome is a metaphor, like "north star"',
    '- Your first instrument was actually electone/piano/keyboard', '',
    '**What I already knew — you told me on 26 August 2026:**',
    '- Many instruments: piano, violin, drums, guitar, bass, Thai instruments (ระนาด, ซอ)',
    '- Piano has been your primary instrument lately', '', '---', 'Want to pick any of these up?',
  ].join('\n')
  const sep = judgeReply(separated, { replyDate: '2026-09-04', evidence: EVIDENCE })
  check('M3 · ⭐⭐ MUST-SEPARATE · two headings found — today, and 26 August', sep.headings.length === 2 && sep.headings[0].from === '2026-09-04' && sep.headings[1].from === '2026-08-26', JSON.stringify(sep.headings.map((x) => x.from)))
  check('M3b · ⭐⭐⭐ the SAME information passes when the temporal/source claims are separated — the right answer is REACHABLE', sep.overall === 'PASS' && sep.headings.every((x) => x.verdict === 'PASS'), JSON.stringify(sep.headings.map((x) => [x.verdict, x.counts])))
  check('M3c · and the two old items are WITHIN their own heading now — the items did not change, the claim did', sep.headings[1].items.filter((it) => it.status === 'within').map((it) => it.evidenceId).sort().join(',') === '6864d087,b9c9a133')

  // ══ DETECTOR EDGE CONTROLS ══════════════════════════════════════════════════════════════════════════
  const bulletOnly = ['**Your music:**', '- Today you told me your first instrument was electone', '- Piano has been your primary instrument lately'].join('\n')
  check('E1 · "today" INSIDE a bullet is not a heading — no temporal heading, no verdict', judgeReply(bulletOnly, { replyDate: '2026-09-04', evidence: EVIDENCE }).overall === 'NONE')
  const proseOnly = ["Here's what we talked about today:", 'We mostly talked about your work, and a little about Rome.'].join('\n')
  const po = judgeReply(proseOnly, { replyDate: '2026-09-04', evidence: EVIDENCE })
  check('E2 · a temporal heading followed by PROSE (no list) is UNMAPPED, ⛔ never PASS', po.overall === 'UNMAPPED' && po.headings[0]?.items.length === 0, po.overall)
  const disagree = claimedRange("What we talked about today (26 August 2026):", { replyDate: '2026-09-04' })
  check('E3 · explicit date vs "today" disagreement is RECORDED (explicit wins, inconsistent=true)', disagree?.from === '2026-08-26' && disagree.inconsistent === true, JSON.stringify(disagree))
  check('E4 · "yesterday" is date arithmetic on the reply date, crossing a month boundary correctly', claimedRange('What you told me yesterday:', { replyDate: '2026-09-01' })?.from === '2026-08-31' && shiftDate('2026-03-01', -1) === '2026-02-28')
  check('E5 · a bold label without a time claim is a GROUPING label, not a terminator — items under it still belong to the temporal heading above', itemsUnder(["Today:", '', '**Group A:**', '- one', '**Group B:**', '- two', '---', 'prose'], 0, { replyDate: '2026-09-04' }).length === 2)
  check('E6 · a second TEMPORAL heading terminates the first', itemsUnder(['Today:', '- one', 'Yesterday:', '- two'], 0, { replyDate: '2026-09-04' }).length === 1)
  check('E7 · "What I remember about your music:" is heading-shaped but claims no time', isTemporalHeading('**What I remember about your music:**', { replyDate: '2026-09-04' }) === false)

  // ══ ⛔ THE REPLY PATH IS UNTOUCHED — the detector lives in test/, nothing in the route imports it ════
  const route = readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')
  check('R1 · ⛔ the route does not import the merge-rule detector — no runtime blocker/re-writer', !/merge-rule/.test(route))
  const composer = readFileSync(new URL('../../Backend/app/components/context-composer.js', import.meta.url), 'utf8')
  check('R2 · ⛔ memoryHint gained no classifier branch (still exactly the two historical branches)', (composer.match(/return 'The user (?:may be asking you to remember|is asking about their personal info)/g) || []).length === 2 && !/retrieve_conversations/.test(composer.slice(composer.indexOf('export function memoryHint'), composer.indexOf('export function searchHint'))))
} finally {
  await pg.end()
}
done()
