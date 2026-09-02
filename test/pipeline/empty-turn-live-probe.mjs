// LIVE PROBE for 043's `client_disconnect` cause - AND ITS MEASURED RESULT, which is a NEGATIVE.
//
//   node pipeline/empty-turn-live-probe.mjs
//
// == WHAT THIS PROBE ESTABLISHED, 2026-09-02 22:07 ==============================================
// It aborts its own streaming POST 250ms in - exactly what a closed tab does to the socket. Result:
//
//     aborted after 257ms   ->   assistant row: chars=4402, empty_turn=(null), cause=(null), error=(null)
//
// The server KEPT GENERATING and persisted the whole 4,402-character answer. That is correct and matches
// the route's stated intent - *"Persisting partials is deliberate - Stop must keep what streamed"* - and
// it means A MID-STREAM DISCONNECT DOES NOT PRODUCE AN EMPTY TURN AT ALL. `producedNothing` was false, so
// nothing was classified, which is exactly right.
//
// => SO THE `client_disconnect` CAUSE IS REACHABLE ONLY WHEN THE DISCONNECT PRECEDES ANY OUTPUT. The
// historical class-A rows arose that way: this file's route comment records disconnects "4s and 11s into a
// ~60s cold model load". Reproducing that on demand needs a first-token stall, which would mean
// manipulating the model server - and ollama is Ote's to run, never mine to kill.
//
// => `client_disconnect` and `generation_empty` are therefore proved by `empty-turn-cause-check`: the
// database pairing red-proofs plus source-level assertions on the branch order. THIS probe's contribution
// is the negative above - a real fact about when the cause can and cannot fire.
//
// DO NOT read a passing exit code from this file as proof of the cause; it will report NOT-EXPECTED
// whenever the model answers fast enough to beat the abort, which is the ordinary case.
//
// NOTE: raw fetch throughout, deliberately. `makeClient` in harness.mjs hardcodes its own
// AbortSignal.timeout and ignores a caller-supplied one, so a harness call CANNOT abort early - and
// widening the shared harness for a one-off probe would be the wrong trade.
import { devPg, devSchema, BASE } from '../harness.mjs'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

let cid = null
let cookie = ''
const post = async (path, body, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    ...opts,
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
  let json = null
  try { json = await res.json() } catch { json = null }
  return { status: res.status, json }
}

try {
  const login = await post('/v1/auth/login', { username: 'agent_dev', password: 'agentdev123' })
  if (login.status !== 200) throw new Error(`agent_dev login failed (${login.status})`)

  // `probe: false` deliberately - this drives the REAL production path, and a fixture flag would send
  // the turn down a different route than the one being validated.
  const convo = await post('/v1/chat/conversations', {
    title: 'zz_emptyturn live probe',
    settings: { stream: true, toolsEnabled: false, useMemory: false, reasoning: { enabled: false }, probe: false },
  })
  cid = convo.json?.conversation?.id
  if (!cid) throw new Error(`no conversation (status ${convo.status})`)
  console.log(`
 LIVE PROBE - client_disconnect - conversation ${cid}
`)

  // THE ABORT. A streaming POST cancelled well before any token could arrive - the same thing a closed
  // tab does to the socket.
  const ac = new AbortController()
  const started = Date.now()
  const timer = setTimeout(() => ac.abort(), 250)
  let aborted = false
  try {
    await fetch(`${BASE}/v1/chat/conversations/${cid}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ content: 'zz_emptyturn please begin a long answer', stream: true }),
      signal: ac.signal,
    })
  } catch (e) {
    aborted = /abort/i.test(String(e?.message ?? e))
  }
  clearTimeout(timer)
  console.log(`  aborted after ${Date.now() - started}ms  (fetch threw abort: ${aborted})`)

  // The route persists the assistant row after the loop ends; give it a moment to finalise.
  let row = null
  for (let i = 0; i < 40; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 500) })
    // eslint-disable-next-line no-await-in-loop
    const rows = await q(
      `select role, coalesce(length(content),0) as chars, empty_turn, empty_turn_cause,
              coalesce(error::text,'(null)') as error
         from ${S}.txn_messages where conversation_id = $1 and role = 'assistant'
        order by rolling_id desc limit 1`, [cid])
    if (rows.length) { row = rows[0]; break }
  }

  if (!row) {
    console.log('  ⚠️ no assistant row appeared within 20s — INCONCLUSIVE, ⛔ not a pass\n')
    process.exitCode = 1
  } else {
    console.log(`  assistant row: chars=${row.chars} empty_turn=${row.empty_turn ?? '(null)'} `
      + `cause=${row.empty_turn_cause ?? '(null)'} error=${row.error}`)
    const ok = row.chars === 0
      && row.empty_turn === 'empty_assistant_turn'
      && row.empty_turn_cause === 'client_disconnect'
      && row.error === '(null)'
    console.log(ok
      ? '\n  ✅ PASS · classified `empty_assistant_turn` / `client_disconnect` with error = NULL\n'
      : '\n  ⛔ NOT the expected shape — see the row above\n')
    if (!ok) process.exitCode = 1
  }
} catch (e) {
  console.error(`\n⛔ ${e?.message ?? e}\n`)
  process.exitCode = 1
} finally {
  if (cid) {
    await pg.query(`delete from ${S}.txn_messages where conversation_id = $1`, [cid]).catch(() => {})
    await pg.query(`delete from ${S}.txn_conversations where id = $1`, [cid]).catch(() => {})
    console.log(`  (fixture ${String(cid).slice(0, 8)} removed — ${BASE})`)
  }
  await pg.end()
}
