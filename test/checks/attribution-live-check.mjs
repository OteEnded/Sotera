// ⭐⭐ ATTRIBUTION LIVE DETECTION — THE MEASUREMENT REPORT (D14) and THE REVIEW SURFACE (D13).
//
//   node test/checks/attribution-live-check.mjs              denominator + unreviewed candidates, for reading in the terminal
//   node test/checks/attribution-live-check.mjs --all        …and every reviewed candidate too
//   node test/checks/attribution-live-check.mjs --id <uuid>  one candidate in full (spans · sources · surrounding turns)
//
// ⛔ THIS CHECK NEVER PRINTS A BARE "0 VIOLATIONS". Every number sits beside its denominator: turns observed / scanned /
// scan errors / candidate claims / human-confirmed violations / human-confirmed non-violations / unreviewed. Detector
// silence is reported as silence.
// ⛔ It classifies nothing. It shows a person what the detector matched and where a request COULD have come from
// (`sources`), and points at test/maintenance/attribution-confirm.mjs for the judgement.
//
// ⭐⭐ AND IT ASSERTS THE INSTRUMENT'S OWN INVARIANTS (§0), so it is a CHECK and not only a report. It lives in `checks/`,
// which the suite globs — and a file there that can only ever pass is the `a-passing-test-can-test-nothing` shape. The
// invariants below are the ones that would make a future reading a lie: a claim counted with no evidence behind it, a
// judgement with no human on it, evidence pruned from a row nobody reviewed, or the D11 scope silently widening.
import { readFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { CLASSES, VIOLATION_CLASSES, FUTURE_BOUNDARY, DETECTOR_VERSION } from '../../Backend/app/components/attribution-live-detection.js'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(`--${f}`)
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : argv[i + 1] }
const S = devSchema()
const pg = devPg()
await pg.connect()
const q = async (sql, params = []) => (await pg.query(sql, params)).rows

const one = arg('id')
if (one) {
  const [c] = await q(`SELECT * FROM "${S}".log_attribution_candidates WHERE id = $1`, [one])
  if (!c) { console.log(`no candidate ${one}`); await pg.end(); process.exit(1) }
  console.log(`\n══ CANDIDATE ${c.id} · ${c.username} · conversation ${c.conversation_id} · detector v${c.detector_version} · ${c.created_at.toISOString()}`)
  console.log(`classification: ${c.classification ?? 'UNREVIEWED'}${c.confirmed_by ? ` by ${c.confirmed_by} at ${c.confirmed_at.toISOString()}` : ''}${c.notes ? `\nnotes: ${c.notes}` : ''}`)
  console.log(`principle in prompt: ${c.principle_present} · model ${c.model} · effort ${c.settings?.reasoning?.effort ?? '?'} · tools ${c.toolset?.count ?? '?'} · called: ${(c.tool_calls ?? []).map((t) => t.name).join(', ') || '—'}`)
  console.log(`\n── SPANS (${c.spans.length}) ──`)
  for (const s of c.spans) console.log(`  [${s.surface}] …${s.context}…`)
  console.log(`\n── SOURCES — where a request COULD have come from (mechanical; you decide) ──`)
  console.log(`  current turn reads as a request: ${c.sources.requestedNow}`)
  console.log(`  earlier turns of THIS conversation that read as requests: ${c.sources.requestsThisConversation.length}`)
  for (const t of c.sources.requestsThisConversation) console.log(`     · #${t.rollingId ?? '?'} "${t.text.slice(0, 140)}"`)
  console.log(`  remembered speech of the person in her context: ${c.sources.remembered.length} lines, ${c.sources.rememberedRequests} read as requests`)
  for (const r of c.sources.remembered.filter((x) => x.readsAsRequest)) console.log(`     · ${r.date ?? 'undated'} · ${r.speaker} (${r.block}): "${r.text.slice(0, 140)}"`)
  if (c.surrounding) {
    console.log(`\n── SURROUNDING (last 8 of ${c.surrounding.messages.length}) ──`)
    for (const m of c.surrounding.messages.slice(-8)) {
      console.log(`  ${m.role === 'user' ? 'USER' : 'HER '} #${m.rollingId ?? '·'}: ${String(m.content ?? '').replace(/\s+/g, ' ').slice(0, 220)}`)
      if (m.role === 'assistant' && m.reasoning) console.log(`       [reasoning] ${String(m.reasoning).replace(/\s+/g, ' ').slice(0, 300)}`)
    }
  } else console.log(`\n── SURROUNDING: pruned ${c.evidence_pruned_at?.toISOString() ?? ''} (D12 lifecycle) ──`)
  console.log(`\nclasses: ${CLASSES.join(' · ')}   (violations once confirmed: ${VIOLATION_CLASSES.join(', ')})`)
  console.log(`⚠️ ${FUTURE_BOUNDARY}`)
  console.log(`\nto classify:  node test/maintenance/attribution-confirm.mjs ${c.id} <CLASS> --by <you> [--notes "..."]`)
  await pg.end(); process.exit(0)
}

// ── §0 · THE INSTRUMENT'S OWN INVARIANTS — ⛔ a failure here means a READING would be a lie ────────────────────────
const failures = []
const invariant = async (what, sql, params = []) => {
  const rows = await q(sql, params)
  if (rows.length) { failures.push(`${what} — ${rows.length} row(s): ${rows.slice(0, 3).map((r) => r.id ?? JSON.stringify(r)).join(', ')}`) }
  console.log(`${rows.length ? '✖' : '✓'} ${what}`)
}
const scopeCfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))?.attribution?.liveDetectionUsernames ?? []
console.log('══ INSTRUMENT INVARIANTS ══')
await invariant('every counted claim has a candidate row behind it',
  `SELECT s.id FROM "${S}".log_attribution_scans s LEFT JOIN "${S}".log_attribution_candidates c ON c.id = s.candidate_id
     WHERE s.claims_found > 0 AND c.id IS NULL`)
await invariant('every candidate is counted by a scan row',
  `SELECT c.id FROM "${S}".log_attribution_candidates c LEFT JOIN "${S}".log_attribution_scans s ON s.candidate_id = c.id WHERE s.id IS NULL`)
await invariant('D13 · no judgement without a named human and a time',
  `SELECT id FROM "${S}".log_attribution_candidates
     WHERE (classification IS NOT NULL) <> (confirmed_by IS NOT NULL) OR (classification IS NOT NULL) <> (confirmed_at IS NOT NULL)`)
await invariant('D13 · no classification outside the six',
  `SELECT id FROM "${S}".log_attribution_candidates WHERE classification IS NOT NULL AND NOT (classification = ANY($1))`, [[...CLASSES]])
await invariant('D12 · evidence is never pruned from a candidate nobody reviewed',
  `SELECT id FROM "${S}".log_attribution_candidates WHERE evidence_pruned_at IS NOT NULL AND classification IS NULL`)
await invariant('D12 · a row marked pruned really has no frozen copies left',
  `SELECT id FROM "${S}".log_attribution_candidates WHERE evidence_pruned_at IS NOT NULL AND (surrounding IS NOT NULL OR composed IS NOT NULL)`)
await invariant('D12 · an unreviewed candidate still has its evidence',
  `SELECT id FROM "${S}".log_attribution_candidates WHERE classification IS NULL AND (surrounding IS NULL OR composed IS NULL)`)
await invariant(`D11 · nothing was scanned outside the configured scope (${scopeCfg.join(', ') || 'EMPTY'})`,
  `SELECT id FROM "${S}".log_attribution_scans WHERE NOT (username = ANY($1))`, [scopeCfg])
await invariant('every row carries a detector version',
  `SELECT id FROM "${S}".log_attribution_scans WHERE detector_version IS NULL OR detector_version = ''`)
const versions = (await q(`SELECT DISTINCT detector_version AS v FROM "${S}".log_attribution_scans`)).map((r) => r.v)
if (versions.length && !versions.includes(DETECTOR_VERSION)) console.log(`⚠ the running detector is v${DETECTOR_VERSION}; rows on disk: ${versions.join(', ')} — readings must not be pooled across versions`)

// ── D14 · THE DENOMINATOR ─────────────────────────────────────────────────────────────────────────────────────────
const [d] = await q(`
  SELECT count(*)::int AS observed,
         count(*) FILTER (WHERE scanned)::int AS scanned,
         count(*) FILTER (WHERE NOT scanned)::int AS errors,
         count(*) FILTER (WHERE claims_found > 0)::int AS candidate_turns,
         coalesce(sum(claims_found), 0)::int AS claims,
         min(created_at) AS first, max(created_at) AS last
    FROM "${S}".log_attribution_scans`)
const [h] = await q(`
  SELECT count(*)::int AS candidates,
         count(*) FILTER (WHERE classification IS NULL)::int AS unreviewed,
         count(*) FILTER (WHERE classification = ANY($1))::int AS confirmed_violations,
         count(*) FILTER (WHERE classification IS NOT NULL AND NOT (classification = ANY($1)))::int AS confirmed_non_violations,
         min(created_at) FILTER (WHERE classification IS NULL) AS oldest_unreviewed
    FROM "${S}".log_attribution_candidates`, [[...VIOLATION_CLASSES]])
const perUser = await q(`
  SELECT username, detector_version AS v, count(*)::int AS observed, count(*) FILTER (WHERE scanned)::int AS scanned,
         count(*) FILTER (WHERE NOT scanned)::int AS errors, count(*) FILTER (WHERE claims_found > 0)::int AS candidate_turns
    FROM "${S}".log_attribution_scans GROUP BY 1, 2 ORDER BY 1, 2`)
const byClass = await q(`SELECT classification, count(*)::int AS n FROM "${S}".log_attribution_candidates WHERE classification IS NOT NULL GROUP BY 1 ORDER BY 1`)

console.log(`\n══ ATTRIBUTION LIVE DETECTION · measurement · ${new Date().toISOString()} ══`)
console.log(`scope: attribution.liveDetectionUsernames (config) · detector versions seen: ${[...new Set(perUser.map((r) => r.v))].join(', ') || 'none'}`)
console.log(`window: ${d.first ? `${d.first.toISOString()} → ${d.last.toISOString()}` : 'no turns observed yet'}\n`)
console.log('DENOMINATOR (D14)')
console.log(`  turns observed ................ ${d.observed}`)
console.log(`  turns scanned ................. ${d.scanned}`)
console.log(`  scan errors ................... ${d.errors}`)
console.log(`  turns with candidate claims ... ${d.candidate_turns}   (${d.claims} spans)`)
console.log(`  human-confirmed violations .... ${h.confirmed_violations}   of ${d.scanned} scanned turns`)
console.log(`  human-confirmed non-violations  ${h.confirmed_non_violations}`)
console.log(`  unreviewed candidates ......... ${h.unreviewed}${h.oldest_unreviewed ? `   (oldest ${h.oldest_unreviewed.toISOString()})` : ''}`)
if (byClass.length) console.log(`  by class: ${byClass.map((r) => `${r.classification}=${r.n}`).join(' · ')}`)
console.log('\nper account · version')
for (const r of perUser) console.log(`  ${r.username.padEnd(12)} v${r.v}  observed ${String(r.observed).padStart(4)} · scanned ${String(r.scanned).padStart(4)} · errors ${r.errors} · candidate turns ${r.candidate_turns}`)
if (!perUser.length) console.log('  —')
console.log(`\n⛔ reading rule: ${h.confirmed_violations} confirmed of ${d.scanned} scanned (${d.errors} errors, ${h.unreviewed} awaiting a human). Detector silence is silence, not innocence.`)

// ── D13 · THE REVIEW QUEUE ────────────────────────────────────────────────────────────────────────────────────────
const rows = await q(`SELECT id, username, conversation_id, created_at, classification, confirmed_by, spans, sources, principle_present
                        FROM "${S}".log_attribution_candidates ${has('all') ? '' : 'WHERE classification IS NULL'} ORDER BY created_at`)
console.log(`\n══ ${has('all') ? 'ALL' : 'UNREVIEWED'} CANDIDATES (${rows.length}) ══`)
for (const c of rows) {
  console.log(`\n· ${c.id} · ${c.username} · ${c.created_at.toISOString()} · ${c.classification ?? 'UNREVIEWED'}${c.confirmed_by ? ` (${c.confirmed_by})` : ''} · principle ${c.principle_present ? 'present' : '⛔ ABSENT'}`)
  for (const s of c.spans) console.log(`    [${s.surface}] …${s.context}…`)
  console.log(`    sources: now=${c.sources.requestedNow} · this-conversation=${c.sources.requestsThisConversation.length} · remembered requests=${c.sources.rememberedRequests}/${c.sources.remembered.length}`)
  console.log(`    → node test/checks/attribution-live-check.mjs --id ${c.id}`)
}
if (!rows.length) console.log('  none')
await pg.end()
if (failures.length) { console.error(`\n⛔ ${failures.length} INSTRUMENT INVARIANT(S) FAILED — a reading taken now would be a lie:\n  ${failures.join('\n  ')}`); process.exit(1) }
console.log('\nALL — instrument invariants hold; the numbers above mean what they say')
