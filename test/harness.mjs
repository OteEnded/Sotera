// Shared test harness for Sotera. Build on these instead of re-deriving boilerplate.
//
//   pgConfig()   -> connection details READ FROM Backend/config.json
//   devSchema()  -> her project schema
//   devPg()      -> a pg Client pointed at whatever config names
//   makeChecker()-> pass/fail logging + a real exit code
//   makeClient() -> cookie-jar/bearer HTTP against BASE
//   BASE         -> her origin
//
// ⚠️ NEVER HARDCODE THE CONNECTION OR THE SCHEMA IN A TEST. This file exists on day one because of
// what it cost not to have it: 56 OteLLMServices scripts each kept their own copy of the database
// name, and when the database moved they all still CONNECTED — to a database that existed but was no
// longer live. They passed against months-old data. A check that reads the wrong database and goes
// green is worse than one that never runs. Fixing it took two codemod passes, and the first pass
// missed ~40 more because it searched for `schema.` with the dot and the name also appears bare.
import { readFileSync } from 'node:fs'
import pg from 'pg'

export const BASE = process.env.SOTERA_BASE || 'http://127.0.0.1:8210'

// ⛔ NEVER TEST AS ROOT. Root is OTE'S ACCOUNT — his chats, his memories, his data.
// This rule already existed on OteLLMServices and I failed to carry it to Sotera: a night of testing
// ran as root, and the residue showed up in HIS Options → Memory panel, mixed in with his own rows so
// he could not tell which were his. He had to ask "wtf are those, is that you?" — which is the exact
// question a test account exists to make unnecessary.
//
// Use agent_dev for everything. Root ONLY for surfaces that are genuinely root-only (config, the
// root-vs-admin boundary itself), and say so at the call site when you do.
export const TEST_USER = { username: 'agent_dev', password: 'agentdev123' }

/** Log in as the test account. Returns the jar name to pass to `call`. */
export async function asAgent(call) {
  const r = await call('agent', 'POST', '/v1/auth/login', TEST_USER)
  if (r.status !== 200) throw new Error(`agent_dev login failed (${r.status}) — create it: POST /v1/admin/users {username:"agent_dev",password:"agentdev123",roles:["admin"]}`)
  return 'agent'
}

export function pgConfig() {
  const cfgPath = new URL('../Backend/config.json', import.meta.url)
  const c = JSON.parse(readFileSync(cfgPath, 'utf8')).database?.connection
  // Throw rather than return a half-filled object: an undefined schema would resolve through
  // search_path to `public` and quietly write to the wrong place.
  if (!c?.database || !c?.username) throw new Error('harness: database.connection missing database/username in Backend/config.json')
  if (!c?.schemas?.project) throw new Error('harness: database.connection.schemas.project is not set in Backend/config.json')
  return { host: c.host, port: c.port, user: c.username, password: c.password, database: c.database, schema: c.schemas.project }
}

/** Her project schema. Use this instead of writing a schema name into SQL. */
export function devSchema() { return pgConfig().schema }

export function devPg() {
  const { schema, ...conn } = pgConfig()
  return new pg.Client(conn)
}

/** Where she reaches local models. Read from config so a moved runtime does not need a code change. */
export function ollamaHost() {
  const cfgPath = new URL('../Backend/config.json', import.meta.url)
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  return cfg.providers?.ollama?.host || 'http://127.0.0.1:11434'
}

// ---- pass/fail reporting ----------------------------------------------------------
export function makeChecker() {
  let fails = 0
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) fails++
  }
  const done = () => {
    console.log(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`)
    // A green log line and a zero exit are not the same thing to a runner. Set a real exit code, and
    // drain briefly first: on Windows/Node, exiting while keep-alive sockets tear down can trip a
    // libuv assertion AFTER the summary prints, turning a pass into a reported failure.
    process.exitCode = fails === 0 ? 0 : 1
    setTimeout(() => process.exit(process.exitCode), 150)
  }
  return { check, done, get fails() { return fails } }
}

// ---- HTTP client ------------------------------------------------------------------
// ── ⛔⛔ EVERY CONVERSATION A CHECK CREATES IS MARKED `settings.probe = true` ──────────────────────────
// The noticing pass samples live conversations, and a check's fixture is not an experience. A fixture in
// that population is contamination, and Ote ruled on the shape of the fix: *"If a fixture conversation can
// enter the population, that's contamination and should be treated as such rather than **silently filtered
// after the fact**."*
//
// ⚠️ TODAY IT IS ONLY THE `messages >= 4` THIN GATE KEEPING THEM OUT — by accident. The eligibility query
// was reproduced against the live database and one fixture sat at 2 messages, one message away from
// entering the sample of what Sotera spontaneously wants to remember. An accident is not a boundary.
//
// ⭐ MARKED HERE, IN ONE PLACE, RATHER THAN IN EVERY CHECK. Seven times now an explicit per-caller field
// has been silently dropped by someone adding a new call site — a flag a caller can forget to set is not a
// guarantee. The pass counts and logs what it skips, so the exclusion is visible rather than silent.
//
// ⛔ THIS IS NOT A TOPIC FILTER, and it must never become one. A conversation of hers that happens to be
// ABOUT memory stays in the population — deciding which of her conversations count as real life would be a
// worse imposition than the prompt ever was. Stratify at review time; exclude only non-conversations.
// ⓘ `pipeline/ask-sotera.mjs` opts out explicitly: it drives conversations, and a conversation is a
// conversation whatever my reason for having it.
function markProbeConversation(method, pathname, body) {
  if (method !== 'POST' || pathname !== '/v1/chat/conversations' || !body || typeof body !== 'object') return body
  const settings = { ...(body.settings ?? {}) }
  if (settings.probe === undefined) settings.probe = true
  return { ...body, settings }
}

export function makeClient(base = BASE) {
  const jars = {}
  return async function call(as, method, pathname, body, { key, raw } = {}) {
    body = markProbeConversation(method, pathname, body)
    const headers = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (key) headers.authorization = `Bearer ${key}`
    else if (jars[as]) headers.cookie = jars[as]
    // ⚠️⚠️ THE HARNESS'S OWN TIMEOUT IS A CONFOUNDER, AND IT COST A RUN. Undici's default headers
    // timeout is 300 s. On 2026-08-25 a turn in which Sotera reached another intelligence exceeded that:
    // the counterpart had answered in 17 s, the exchange row completed cleanly, and the HARNESS aborted —
    // ⛔ killing the turn so no assistant message was ever persisted. The experiment recorded a failure
    // that belonged to the instrument.
    // ⭐ Ote: *"the infrastructure timeout is now a confounder, not an interesting measurement."*
    // ⇒ generous by default, overridable per call. ⛔ NEVER infinite: a hang must still end as a failure
    // rather than as a test that never returns.
    const res = await fetch(`${base}${pathname}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Number(process.env.SOTERA_TEST_TIMEOUT_MS) || 1_800_000),
    })
    const setCookie = res.headers.getSetCookie?.() ?? []
    if (setCookie.length && !key) jars[as] = setCookie.map((c) => c.split(';')[0]).join('; ')
    const resHeaders = Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]))
    if (raw) {
      const bytes = Buffer.from(await res.arrayBuffer())
      const text = bytes.toString('utf8')
      let json = null
      try { json = JSON.parse(text) } catch { /* binary or non-JSON */ }
      return { status: res.status, headers: resHeaders, bytes, json, text }
    }
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* SSE / empty */ }
    return { status: res.status, headers: resHeaders, json, text }
  }
}

// ---- SSE ---------------------------------------------------------------------------
/**
 * Read a whole SSE response into {events:[{event,data}], byType}.
 *
 * ⚠️ Reads to completion on purpose. A `curl … | head -c N` style early close SIGPIPEs the stream and
 * truncates the answer mid-sentence — which looked exactly like a bug in the server the first time it
 * happened. When output looks cut off, suspect the harness before the system.
 */
export async function readSSE(base, pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { status: res.status, events: [], byType: {}, text: await res.text() }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const events = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      const evLine = block.split('\n').find((l) => l.startsWith('event: '))
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
      if (!evLine) continue
      let data = null
      try { data = JSON.parse((dataLine || '').replace(/^data: /, '')) } catch { /* keep null */ }
      events.push({ event: evLine.slice(7).trim(), data })
    }
  }
  const byType = events.reduce((m, e) => ((m[e.event] = (m[e.event] || 0) + 1), m), {})
  return { status: res.status, events, byType }
}
