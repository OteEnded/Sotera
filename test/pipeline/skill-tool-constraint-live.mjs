// ⭐⭐⭐ S1 · LIVE VALIDATION — is the shared assembly the one actually running, on both Skill paths?
//
// The unit tests prove `assembleToolDefs` enforces an allowlist and that the route has two call sites.
// Neither proves the RUNNING SERVER does it. This drives real turns and reads what the platform RECORDED
// about each one (`metrics.toolset`), so the evidence is the server's own account of what it assembled —
// not this script's reconstruction of it.
//
// ⭐ THE FIXTURE IS REAL, NOT SYNTHETIC, AND THAT WAS DELIBERATE. `skill.research` is a component Skill
// already installed and already in the trigger catalogue, and it already declares
//   allowedComponents: ['search_memory', 'search_web', 'fetch_url_content']
// ⇒ NOTHING was added to the measured Skill catalogue to run this. `search_memory` is not installed here,
// so resolveSkill drops it and the Skill resolves to TWO capability tools — which is what makes the
// narrowing unmistakable against a ~44-tool baseline.
//
// ⚠️ WHAT THE TRIGGERED CASE DOES AND DOES NOT SHOW. The prompt NAMES the skill, because
// `skill.research`'s description states its mechanism rather than its trigger conditions (the authoring
// rule we earned by measurement, which this Skill predates). So this validates the MECHANISM — that an
// activated Skill's allowlist reaches the provider — and says nothing about whether she would choose it
// unprompted. ⛔ Do not quote a number from here as a routing rate.
//
//   node pipeline/skill-tool-constraint-live.mjs

import { devPg, devSchema } from '../harness.mjs'

const BASE = process.env.SOTERA_BASE || 'http://127.0.0.1:8210'
const SKILL = 'skill.research'
const jar = {}

async function call(method, path, body) {
  const headers = { 'content-type': 'application/json' }
  if (jar.cookie) headers.cookie = jar.cookie
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const set = res.headers.getSetCookie?.() || []
  if (set.length) jar.cookie = set.map((s) => s.split(';')[0]).join('; ')
  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  return { status: res.status, json }
}

let failures = 0
const ok = (label, detail = '') => console.log(`ok   ${label}${detail ? ` — ${detail}` : ''}`)
const fail = (label, detail = '') => { failures++; console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
const check = (cond, label, detail = '') => (cond ? ok(label, detail) : fail(label, detail))

// ── drive one turn and hand back what the platform recorded about it ────────────────────────────────
async function turn(title, content, extra = {}) {
  const made = await call('POST', '/v1/chat/conversations', {
    title,
    // ⭐ `probe: true` — the harness convention that keeps a test conversation OUT of the noticing pass's
    // eligibility query. ⛔ Without it these turns become real life for the distiller, which is a
    // population this project measures. The first run of this script omitted it and its six
    // conversations had to be deleted by hand.
    settings: { toolsEnabled: true, useMemory: true, stream: false, probe: true },
  })
  if (made.status >= 300) throw new Error(`could not open a conversation (${made.status})`)
  const cid = made.json.conversation.id
  const sent = await call('POST', `/v1/chat/conversations/${cid}/messages`, { content, stream: false, ...extra })
  if (sent.status >= 300) throw new Error(`turn failed (${sent.status}: ${JSON.stringify(sent.json).slice(0, 200)})`)
  // Read the PERSISTED row rather than trusting the send response: `metrics` is what a reload shows.
  // ⚠️ There is no `GET .../messages` — the conversation endpoint carries them. Reading the wrong path
  // returned 404, and the first run of this script reported "NO toolset RECORDED" for three turns that
  // had each recorded one perfectly well. ⇒ a bad status is a HARD STOP here, never a missing field.
  const full = await call('GET', `/v1/chat/conversations/${cid}`)
  if (full.status >= 300) throw new Error(`could not read the conversation back (${full.status})`)
  const assistant = (full.json?.messages || []).filter((m) => m.role === 'assistant').pop()
  if (!assistant) throw new Error('the turn produced no assistant message')
  return {
    cid,
    skill: sent.json?.skill?.id ?? assistant.skill?.id ?? null,
    metrics: assistant.metrics || {},
    answer: assistant.content || '',
  }
}

const login = await call('POST', '/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
if (login.status !== 200) { console.error(`✖ login failed (${login.status})`); process.exit(1) }
ok('agent_dev logged in')

// ══ ① NO SKILL · the baseline, and the proof the trace is not vacuous ══════════════════════════════
const none = await turn('S1 live · baseline, no skill', 'In one sentence: what is 17 times 23?')
const base = none.metrics.toolset
check(!!base, '① a plain turn RECORDS what it could reach', base ? JSON.stringify(base) : 'NO toolset RECORDED')
if (base) {
  check(base.path === 'none', '① …and it says no Skill was in force', `path=${base.path}`)
  check(base.skill === null, '① …with no Skill id', `skill=${base.skill}`)
  check(base.constrained === false, '① …and unconstrained')
  check(base.count > 30, '① …reaching the whole installed toolset', `count=${base.count}`)
}

// ══ ② BOUND · the path that already worked — it must still work after the hoist ════════════════════
const bound = await turn('S1 live · bound skill', 'Give me one sentence on the history of the abacus.', { skillOnce: SKILL })
const b = bound.metrics.toolset
check(bound.skill === SKILL, '② the turn ran as the BOUND Skill', `skill=${bound.skill}`)
check(!!b, '② the bound turn recorded its reach', b ? JSON.stringify(b) : 'NO toolset RECORDED')
if (b && base) {
  check(b.path === 'bound', '② …by the bound path', `path=${b.path}`)
  check(b.constrained === true, '② ⭐ …and the Skill\'s allowlist was seen as a restriction')
  check(b.count < base.count, '② ⭐⭐ …and the toolset REALLY narrowed', `${base.count} → ${b.count}`)
}

// ══ ③ ⭐⭐⭐ TRIGGERED · THE DEFECT. Before S1 this recorded the UNCONSTRAINED toolset ════════════════
const trig = await turn('S1 live · self-triggered skill',
  `Activate the ${SKILL} skill with use_skill, then answer in one sentence: what is the origin of the word "abacus"?`)
const t = trig.metrics.toolset
check(trig.skill === SKILL, '③ she activated the Skill herself', `skill=${trig.skill}`)
if (trig.skill !== SKILL) {
  fail('③ the model did not call use_skill this run', 'the reassembly could not be observed — rerun')
  console.log(`     ⓘ answer began: ${JSON.stringify(trig.answer.slice(0, 120))}`)
} else if (!t) {
  fail('③ the activated Skill produced NO toolset record', 'a silent skip here would hide the whole defect')
} else if (base) {
  check(t.path === 'triggered', '③ ⭐⭐⭐ …and the TRIGGERED assembly ran', `path=${t.path}`)
  check(t.constrained === true, '③ ⭐⭐ …the activated Skill\'s allowlist was applied', `constrained=${t.constrained}`)
  check(t.count < base.count, '③ ⭐⭐⭐ …and it narrowed the toolset — the defect S1 closes',
    `${base.count} unconstrained → ${t.count} after activation`)
  // ⚠️ CORRECTED AFTER THE FIRST RUN, and my first version of this line was WRONG rather than merely
  // failing. I asserted triggered === bound. Measured: bound=5, triggered=7. The difference is DESIGNED —
  // on the triggered path `invocableSkills` is still populated, so step ⑥ adds `use_skill` +
  // `read_skill_file`, which a bound turn never offers. ⇒ the invariant is equality PLUS exactly those two.
  if (b) check(t.count === b.count + 2, '③ ⭐ …to the bound toolset plus exactly the two trigger tools',
    `bound=${b.count} + use_skill,read_skill_file ⇒ ${b.count + 2}; triggered=${t.count}`)
}

// ══ ④ ONE-WRITER · a Skill that removes the write tools MOVES the writer, it does not lose it ══════
// `skill.research` allows only search/fetch, so `remember`/`remember_fact` are unreachable on both
// constrained turns. ⓘ There is no non-root HTTP reader for the tool log, so this reads Postgres the way
// the checks do — read-only, and scoped to the two conversations this script created.
// ⚠️ The column is `tool`, not `tool_name` (see app/audit/tool-log.js).
const db = devPg()
await db.connect()
try {
  const { rows } = await db.query(
    `SELECT tool FROM "${devSchema()}".log_tool_calls WHERE conversation_id = ANY($1::uuid[])`,
    [[bound.cid, trig.cid]])
  const called = rows.map((r) => r.tool)
  check(!called.includes('remember') && !called.includes('remember_fact'),
    '④ no memory WRITE tool was reachable under the allowlist',
    called.length ? `called: ${[...new Set(called)].join(',')}` : 'no tool calls logged')
  const ALLOWED = new Set(['search_web', 'fetch_url_content', 'list_decisions', 'set_display_name',
    'remember_person', 'use_skill', 'read_skill_file'])
  const stray = [...new Set(called.filter((n) => !ALLOWED.has(n)))]
  check(stray.length === 0, '④ ⭐ …and nothing OUTSIDE the assembled toolset was called',
    stray.length ? stray.join(',') : 'clean')
} finally { await db.end() }

console.log(`\n${failures ? `✖ ${failures} CHECK(S) FAILED` : '✅ ALL LIVE CHECKS PASSED'}`)
process.exit(failures ? 1 : 0)
