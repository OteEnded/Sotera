// ⭐⭐⭐ SEEK-ADVICE BOUNDARIES — the rules that must hold before any counterpart is reached.
//
// Not tests of convenience. Each one pins a boundary that was argued for, measured, or paid for during
// the design, and would rot invisibly if it broke:
//   ① the generic layer never names a transport
//   ② a destination that cannot do a mode REFUSES rather than substituting the other one
//   ③ a delegation without a brief is impossible
//   ④ provenance records only what the interface exposed — no inflation, enforced by the DB
//   ⑤ the Feature never enumerates the counterpart's sessions
//   ⑥ an id she was not authorized to attend is not attendable
//   ⑦ the self-presentation carries the five stable slots, every time
//   ⑧ the route stays thin, and nothing here writes to txn_conversations
//
// ⚠️ ① ALREADY EARNED ITS KEEP: on first run it caught `remote_run_id` in the generic schema. "run" is
// Hermes's word — a human-relay destination has no run at all — so the column became `remote_work_id`.
// A test that only passed would have taught us nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const SERVICE = read('../../Backend/app/advice/service.js')
const STORE = read('../../Backend/app/advice/store.js')
const HERMES = read('../../Backend/app/advice/hermes.js')
const INDEX = read('../../Backend/app/advice/index.js')
const ROUTE = read('../../Backend/app/routes/v1/chat-site.route.js')
const MIGRATION = read('../../Backend/database/migrations/022_advice_exchanges.sql')

// ⭐ CODE ONLY. A comment explaining why the route must not know an endpoint is documentation, not a
// dependency on it. My first version of ⑧ fired on its own explanatory comment — a scan that reads prose
// proves nothing, which is the same lesson as "a source-scan whose anchor goes vacuous stops scanning".
const NEWLINE = String.fromCharCode(10)
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(NEWLINE)
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join(NEWLINE)

// ══ ① ⭐⭐⭐ THE GENERIC LAYER NEVER NAMES A TRANSPORT ═══════════════════════════════════════════════
// Ote: "Nothing in the generic architecture should become Hermes-specific because of what we discovered
// here." This is the test of that sentence.
const HERMES_SHAPED = [
  '/api/sessions', '/v1/runs', '/chat', 'waiting_for_approval', 'stopping',
  'X-Hermes', 'run_id', 'hermes-agent', '8642',
]

test('① the service, store and index never name a Hermes endpoint or state word in CODE', () => {
  for (const [name, src] of [['service.js', SERVICE], ['store.js', STORE], ['index.js', INDEX]]) {
    const code = strip(src)
    for (const needle of HERMES_SHAPED) {
      assert.ok(!code.includes(needle), `${name} names "${needle}" in code — that belongs in the binding`)
    }
  }
})

test('① the schema carries no transport vocabulary either', () => {
  // ⭐ The catch that justified this file. `remote_work_id` is the counterpart's handle for a piece of
  // work; naming it after Hermes's "run" would have made the generic store Hermes-shaped.
  assert.ok(!MIGRATION.includes('remote_run_id text'), 'the schema must not name a run')
  assert.match(MIGRATION, /remote_work_id/, 'the neutral handle should be there instead')
})

test('① the service mentions Hermes on exactly TWO lines — the import and the binding choice', () => {
  // ⚠️ A COUNT WAS THE WRONG ASSERTION. My first version expected 3 occurrences and found 4: the import
  // line carries both the symbol and the path, and the choice line carries both the transport string and
  // the constructor. Counting substrings measured my arithmetic; counting LINES measures the boundary.
  const lines = strip(SERVICE).split(NEWLINE).filter((l) => /[Hh]ermes/.test(l)).map((l) => l.trim())
  assert.equal(lines.length, 2, `service.js mentions Hermes on ${lines.length} lines:${NEWLINE}${lines.join(NEWLINE)}`)
  assert.match(lines[0], /^import \{ createHermesBinding \} from '\.\/hermes\.js'$/, 'line 1 should be the import')
  assert.match(lines[1], /transport === 'hermes-session'/, 'line 2 should be the explicit transport match')
})

// ══ ② EXPLICIT REFUSAL, NEVER SILENT SUBSTITUTION ══════════════════════════════════════════════════
test('② a mode the destination cannot do is refused, and the refusal says which', () => {
  assert.match(SERVICE, /if \(!caps\[mode\]\)/, 'capabilities must be checked before acting')
  assert.match(SERVICE, /cannot \$\{mode\}/, 'the refusal should name the mode')
  assert.ok(!/mode = 'converse'\s*\/\/ fallback/.test(SERVICE), 'a mode must never be silently downgraded')
})

test('② the binding declares capabilities per mode rather than one flag', () => {
  assert.match(HERMES, /contextOnConverse: true/)
  assert.match(HERMES, /contextOnDelegate: false/)
  assert.match(HERMES, /reportsModel: \{ converse: true, delegate: false \}/)
})

test('② the binding hands back a NEUTRAL handle, so its vocabulary stops at the boundary', () => {
  assert.match(HERMES, /outcome: 'pending', handle:/, 'delegate() should return `handle`, not a run id')
  assert.match(strip(SERVICE), /remoteWorkId: r\.handle/, 'the service should consume the neutral name')
})

// ══ ③ THE BRIEF IS REQUIRED, IN TWO PLACES ═════════════════════════════════════════════════════════
test('③ a delegation without a brief is refused by the service AND by the database', () => {
  assert.match(SERVICE, /mode === 'delegate' && !brief/, 'the service should refuse it legibly')
  assert.match(MIGRATION, /txn_advice_exchanges_brief_on_delegate/, 'the schema should refuse it too')
  assert.match(MIGRATION, /a delegation with no brief was ACCEPTED/, 'the migration must PROVE the constraint')
})

// ══ ④ ⭐⭐ PROVENANCE: RECORD ONLY WHAT THE INTERFACE EXPOSED ═══════════════════════════════════════
test('④ the delegate path records no model, and the schema forbids claiming one', () => {
  assert.match(HERMES, /model: null/, 'observe() must not invent a model')
  assert.match(MIGRATION, /txn_advice_exchanges_model_honesty/)
  assert.match(MIGRATION, /the provenance guard does not hold/, 'the migration must PROVE the guard refuses')
  assert.ok(!/modelReported:\s*dest\./.test(strip(SERVICE)), 'never take a model from configuration')
})

test('④ modelSource is a separate field, so "unavailable" is a fact and not a missing value', () => {
  assert.match(STORE, /modelSource: r\.model_source/)
  assert.match(STORE, /modelReported: r\.model_reported \?\? null/)
  assert.match(MIGRATION, /model_source\s+text NOT NULL DEFAULT 'unavailable'/)
})

// ══ ⑤ + ⑥ DISCOVERY IS OURS, AUTHORIZATION IS OTE'S ════════════════════════════════════════════════
test('⑤ the binding offers no way to list the counterpart\'s sessions', () => {
  const code = strip(HERMES)
  assert.ok(!/'\/api\/sessions'\)/.test(code), 'a bare session listing must not exist')
  assert.ok(!/listSessions|enumerate/.test(code), 'no enumeration helper')
  assert.match(code, /resolveSession/, 'resolving ONE authorized id is the only session read')
})

test('⑥ a session id she was not granted is refused', () => {
  assert.match(SERVICE, /not one you are authorized to attend/)
  assert.match(SERVICE, /allowed\.includes\(useSession\)/)
})

test('⑥ authorized() reads OUR record and never talks to the counterpart', () => {
  const fn = SERVICE.slice(SERVICE.indexOf('authorized()'), SERVICE.indexOf('async reach'))
  assert.ok(fn.length > 50, 'authorized() should exist')
  assert.ok(!/binding|fetch|await/.test(fn), 'authorized() must not reach the destination at all')
})

// ══ ⑦ THE SELF-PRESENTATION ════════════════════════════════════════════════════════════════════════
test('⑦ five stable slots, sent every time, with purpose left to the message', () => {
  assert.match(SERVICE, /E1 · identity/)
  assert.match(SERVICE, /E2 · relationship to Ote/)
  assert.match(SERVICE, /destination\.relationship/)   // E3
  assert.match(SERVICE, /destination\.authorityNote/)  // E5
  assert.match(SERVICE, /destination\.authNote/)       // E6
  const composer = SERVICE.slice(SERVICE.indexOf('function composePresentation'), SERVICE.indexOf('const MAX_DEPTH'))
  // ⭐ E4 (purpose) rides in the message: it keeps the preamble byte-stable, and it is how a person does it.
  assert.ok(!/E4/.test(composer), 'E4 must not be composed into the preamble')
})

test('⑦ the loop guard is a constant and a column, never a prompt line', () => {
  assert.match(SERVICE, /MAX_DEPTH/)
  assert.match(MIGRATION, /depth\s+integer NOT NULL DEFAULT 0/)
})

// ══ ⑧ THE ROUTE STAYS THIN ═════════════════════════════════════════════════════════════════════════
const routeSlice = () => ROUTE.slice(
  ROUTE.indexOf("tc.name === 'seek_advice'"), ROUTE.indexOf("tc.name === 'list_decisions'"))

test('⑧ the route calls the service and names no transport in code', () => {
  const slice = routeSlice()
  assert.ok(slice.length > 200, 'the seek_advice handler should exist')
  assert.match(slice, /createAdviceService/)
  const code = strip(slice)
  for (const needle of ['/v1/runs', '/api/sessions', '8642']) {
    assert.ok(!code.includes(needle), `the route names "${needle}" in code — that belongs in the binding`)
  }
})

test('⑧ a pending delegation is reported as a success with no answer', () => {
  assert.match(routeSlice(), /this is not an answer yet/, 'she must not read a pending handle as a failure')
})

test('⑧ an outbound failure is a reported outcome, never a thrown turn', () => {
  assert.match(routeSlice(), /catch \(e\)/)
  assert.match(routeSlice(), /ok: false, reason:/)
})

test('⑧ ⛔ nothing in the Feature writes to txn_conversations', () => {
  for (const [name, src] of [['service.js', SERVICE], ['store.js', STORE], ['hermes.js', HERMES]]) {
    assert.ok(!strip(src).includes('txn_conversations'), `${name} touches a measurement population`)
  }
})

test('⑧ the tool is offered only when a destination is configured', () => {
  const DEFS = read('../../Backend/app/chat/tool-defs.js')
  assert.match(DEFS, /if \(toolsOn && adviceDestinations\.length\)/, 'no destinations ⇒ no tool')
})
