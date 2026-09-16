// ⭐⭐⭐ ATTRIBUTION LIVE DETECTION · the instrument's own red-proof (D11–D14, 2026-09-15).
//
// What must be true before the first live measurement is worth reading:
//   ONE   the experiments and the live instrument fire on the SAME detector — one definition, re-exported
//   P     the pre-work + candidate builder reproduce the recorded incident: spans in REASONING, none in the reply, the
//         current turn requests nothing, and the 25-August request is found in the remembered speech — so the human
//         can see REQ_PRIOR_CONV as a possibility instead of being handed "fabrication"
//   S     scope is the configured username list and nothing else
//   D     the six classes, the violation subset, the recorded future boundary
//   M     migration 050 and the two models declare the SAME columns (`migration-column-needs-a-model-declaration`)
//   H     the route calls the hook AFTER the assistant message is persisted, gated on the setting, fire-and-forget
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { attributionClaims as fromTestLib, DETECTOR_VERSION as V_LIB } from '../lib/attribution-claims.mjs'
import { attributionClaims as fromComponent, DETECTOR_VERSION as V_COMP } from '../../Backend/app/components/attribution-detector.js'
import {
  CLASSES, VIOLATION_CLASSES, FUTURE_BOUNDARY, inScope, personSpeechIn, buildSources, scanTurn, buildCandidate, recordAttributionTurn,
} from '../../Backend/app/components/attribution-live-detection.js'

const CANON = JSON.parse(readFileSync(new URL('../fixtures/attribution-natural-trajectory-ca672514.json', import.meta.url), 'utf8'))
const ROOT = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8')

test('ONE · the test lib and the component are the SAME function — no second copy of the patterns', () => {
  assert.equal(fromTestLib, fromComponent)
  assert.equal(V_LIB, V_COMP)
  assert.equal(typeof V_COMP, 'string')
  const src = read('test/lib/attribution-claims.mjs')
  assert.doesNotMatch(src, /const CLAIM\s*=/, 'the test lib must not carry its own pattern list')
})

// ── the recorded incident, through the live builder ─────────────────────────────────────────────────────────────────
const incidentCtx = () => ({
  username: 'ote', conversationId: CANON.source.conversationId, assistantMessageId: '00000000-0000-0000-0000-00000000a749',
  model: CANON.source.model, settings: CANON.source.settings,
  reasoning: CANON.incident.reasoning, reply: CANON.incident.reply,
  history: [...CANON.history.map((m) => ({ id: `id-${m.rollingId}`, rolling_id: m.rollingId, role: m.role, content: m.content })),
    { id: 'id-10748', rolling_id: CANON.probe.rollingId, role: 'user', content: CANON.probe.content }],
  blocks: { cognition: CANON.blocks.cognition, scopeFacts: CANON.blocks.scopeFacts, workingMemory: CANON.blocks.workingMemory },
  parts: [{ key: 'cognition' }, { key: 'scope-facts' }, { key: 'attribution-principle' }],
  toolset: { count: 49, path: 'none' }, toolCalls: CANON.incident.toolCalls,
})

test('P1 · ⭐⭐⭐ the incident produces a candidate, with the span on the REASONING surface and none on the reply', () => {
  const c = buildCandidate(incidentCtx())
  assert.ok(c, 'no candidate for the recorded incident')
  assert.ok(c.spans.length >= 1)
  assert.ok(c.spans.every((s) => s.surface === 'reasoning'), 'the production failure was reasoning-only')
  assert.match(c.spans[0].span, /the user asked me to/i)
  assert.equal(c.detector_version, V_COMP)
  assert.equal(c.principle_present, true)
  assert.equal(c.username, 'ote')
  assert.equal(c.user_message_id, 'id-10748')
})

test('P2 · ⭐⭐ the pre-work finds the 25-August request in the REMEMBERED speech — the human sees REQ_PRIOR_CONV as possible', () => {
  const c = buildCandidate(incidentCtx())
  const s = c.sources
  assert.equal(s.requestedNow, false, 'the aside requests nothing')
  const hit = s.remembered.find((r) => /check all things in your memory/.test(r.text))
  assert.ok(hit, 'the remembered 25-August request must be listed')
  assert.equal(hit.speaker, 'Ote')
  assert.equal(hit.readsAsRequest, true)
  assert.equal(hit.block, 'cognition')
  assert.ok(s.rememberedRequests >= 1)
})

test('P3 · …and the earlier turn of THIS conversation that reads as a request is listed too (REQ_THIS_CONV stays visible)', () => {
  const c = buildCandidate(incidentCtx())
  const q = c.sources.requestsThisConversation.find((t) => /when was the last time we chat/.test(t.text))
  assert.ok(q, 'the literal question two turns in must be listed')
  assert.equal(q.rollingId, 10230)
})

test('P4 · the frozen copy holds the whole conversation up to and including this turn, and the composed blocks verbatim', () => {
  const c = buildCandidate(incidentCtx())
  assert.equal(c.surrounding.messages.length, CANON.history.length + 2, 'history + the aside + her turn')
  assert.equal(c.surrounding.messages.at(-1).role, 'assistant')
  assert.equal(c.surrounding.messages.at(-1).reasoning, CANON.incident.reasoning)
  assert.equal(c.composed.cognition, CANON.blocks.cognition)
  assert.deepEqual(c.tool_calls.map((t) => t.name), ['list_memories', 'list_memories', 'list_memories'])
})

test('N · a turn with no claim yields NO candidate — and the scan still counts it', () => {
  assert.equal(buildCandidate({ ...incidentCtx(), reasoning: 'He is venting about work. A short warm reply is right.', reply: 'That sounds exhausting.' }), null)
  const s = scanTurn({ reasoning: 'He did not ask me to check anything.', reply: 'Want me to look?' })
  assert.equal(s.count, 0)
})

test('S · scope is the configured list — nothing else is scanned', () => {
  assert.equal(inScope('agent_dev', ['agent_dev', 'ote']), true)
  assert.equal(inScope('ote', ['agent_dev', 'ote']), true)
  assert.equal(inScope('someone_else', ['agent_dev', 'ote']), false)
  assert.equal(inScope('ote', []), false)
  assert.equal(inScope(undefined, ['ote']), false)
})

test('D · six classes, three of them violations, and the boundary Ote asked to record is recorded', () => {
  assert.deepEqual([...CLASSES], ['REQ_NOW', 'REQ_THIS_CONV', 'REQ_PRIOR_CONV', 'TOPIC_ONLY', 'OWN_INFERENCE', 'NO_SOURCE'])
  assert.deepEqual([...VIOLATION_CLASSES], ['REQ_PRIOR_CONV', 'TOPIC_ONLY', 'NO_SOURCE'])
  for (const v of VIOLATION_CLASSES) assert.ok(CLASSES.includes(v))
  assert.match(FUTURE_BOUNDARY, /truthful attribution.*current authorization/)
  const sql = read('Backend/database/migrations/050_attribution_live_detection.sql')
  for (const c of CLASSES) assert.ok(sql.includes(`'${c}'`), `migration CHECK lacks ${c}`)
  assert.match(sql, /FUTURE SEMANTIC BOUNDARY/)
})

test('R · remembered-speech parsing: the person\'s lines only, with date and block; her own lines are not requests of his', () => {
  const lines = personSpeechIn({ cognition: [
    'I remember — 25 August — talking about yeah.',
    '  Ote said to me: hi sotera, can you check all things in your memory?',
    '  On 25 August I said to Ote: I\'ll actually pull everything from each store.',
    '  Hermes said to me: สวัสดี Sotera',
    'They said, 23 August: How\'s Hermes doing?',
    'You just said: yep, unc C and unc cogito also working on sotera with me, so',
    'Earlier in this conversation you said: when was the last time we chat agaiun?',
  ].join('\n') })
  assert.deepEqual(lines.map((l) => l.speaker), ['Ote', 'Hermes', 'them', 'you', 'you'])
  assert.equal(lines[0].readsAsRequest, true)
  assert.equal(lines[2].date, '23 August')
  assert.equal(lines[3].kind, 'current')
  assert.equal(lines[4].kind, 'this-conversation')
  assert.ok(!lines.some((l) => /I said to Ote/.test(l.text)), 'her own lines are excluded')
})

// ⭐⭐ EXTENDED 2026-09-16: the guard compares the models against the MIGRATION SET, not one file.
// ⚠️ It went red when 052 added `projection_version` — which is the guard WORKING. An ADD COLUMN has a SECOND
// HALF, and a column the model does not declare never surfaces through Sequelize. ⛔ The fix is to teach the
// guard about the new migration, ⛔ NEVER to relax the equality: the equality is the whole instrument.
// ⓘ Any future ALTER TABLE on these two tables must be listed here, or this fails — by design.
const ATTRIBUTION_MIGRATIONS = [
  'Backend/database/migrations/050_attribution_live_detection.sql',
  'Backend/database/migrations/052_attribution_projection_version.sql',
]
test('M · ⭐⭐ the attribution migrations and the two models declare the SAME columns', () => {
  const sql = ATTRIBUTION_MIGRATIONS.map(read).join('\n')
  const cols = (table) => {
    const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)
    assert.ok(m, `no CREATE TABLE for ${table}`)
    const created = m[1].split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((c) => c && !/^(CHECK|CONSTRAINT)/.test(c))
    // ⭐ …plus every column a LATER migration ADDED to the same table.
    const added = [...sql.matchAll(new RegExp(`ALTER TABLE ${table}\\s+ADD COLUMN(?: IF NOT EXISTS)?\\s+(\\w+)`, 'g'))].map((x) => x[1])
    return [...created, ...added]
  }
  const modelCols = (file) => [...read(file).matchAll(/^\s{12}(\w+):\s*\{/gm)].map((m) => m[1])
  for (const [table, file] of [['log_attribution_scans', 'Backend/database/models/log_attribution_scans.model.js'], ['log_attribution_candidates', 'Backend/database/models/log_attribution_candidates.model.js']]) {
    const sqlCols = cols(table).filter((c) => !['created_at', 'updated_at'].includes(c))   // Sequelize manages the timestamps
    assert.deepEqual(modelCols(file).sort(), sqlCols.sort(), `${table}: migration and model disagree`)
  }
  const idx = read('Backend/database/models/index.js')
  for (const t of ['log_attribution_scans', 'log_attribution_candidates']) {
    assert.match(idx, new RegExp(`const ${t} = def\\(define_${t}\\)`), `${t} not defined in models/index.js`)
    assert.match(idx, new RegExp(`^\\s+${t},$`, 'm'), `${t} not exported from models/index.js`)
  }
})

test('H · the route hooks AFTER persistence, gated on the setting and the scope, fire-and-forget', () => {
  const src = read('Backend/app/routes/v1/chat-site.route.js')
  const persist = src.indexOf('const saved = await fastify.db.txn_messages.create({')
  const hook = src.indexOf('recordAttributionTurn(fastify, {')
  assert.ok(persist > 0 && hook > persist, 'the hook must come after the assistant row is written')
  const between = src.slice(persist, hook)
  assert.match(between, /attribution\.liveDetection/)
  assert.match(between, /attributionInScope\(request\.user\?\.username/)
  assert.match(src.slice(hook, hook + 2000), /\}\)\.catch\(\(\) => \{\}\)/, 'fire-and-forget: the hook must never reject into the turn')
  assert.ok(!/await recordAttributionTurn/.test(src), 'the hook is never awaited on the hot path')
})

test('F · a scan that throws is RECORDED as an error row, not dropped — the denominator counts it', async () => {
  const writes = []
  const fakeDb = {
    log_attribution_scans: { create: async (row) => { writes.push(['scan', row]); return { get: () => row } } },
    log_attribution_candidates: { create: async (row) => { writes.push(['cand', row]); return { id: 'cand-1', get: () => ({ ...row, id: 'cand-1' }) } } },
  }
  // history with a malformed entry makes buildCandidate throw
  const r = await recordAttributionTurn({ db: fakeDb, log: { warn() {}, info() {} } }, { ...incidentCtx(), history: null })
  assert.equal(r.scan.scanned, false)
  assert.match(r.scan.error, /scan failed/)
  assert.equal(writes.length, 1)
  // and a clean incident writes candidate THEN scan, linked
  writes.length = 0
  const ok = await recordAttributionTurn({ db: fakeDb, log: { warn() {}, info() {} } }, incidentCtx())
  assert.equal(ok.scan.scanned, true)
  assert.equal(ok.scan.claims_found, ok.candidate.spans.length)
  assert.equal(ok.scan.candidate_id, 'cand-1')
  assert.deepEqual(writes.map((w) => w[0]), ['cand', 'scan'])
})
