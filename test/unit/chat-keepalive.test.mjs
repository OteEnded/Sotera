// ⭐⭐ SOTERA'S CHAT MODEL MUST NOT EXPIRE BETWEEN ORDINARY TURNS.
//
// ⚠️ THE DEFECT: the chat path set **no** `keep_alive` at all, so Ollama's own 5-minute default applied.
// `local-monitor.js` had said so in a comment for weeks (*"chat requests do not set keep_alive at all
// (Ollama's own default applies)"*) and the Local console showed `qwen3.6:35b` expiring in 5m — a ~29s
// reload the person pays for between normal messages.
//
// ⛔ NO BACKGROUND PING. Ote: *"Don't implement a periodic background ping just to keep it alive. Ollama's
// keep_alive is already a sliding window: each request should establish/renew the expiry."* ⇒ renewal is a
// side effect of real work, and a model nobody is using is allowed to fall out.
//
// ⭐⭐ THE NON-OBVIOUS HAZARD THIS PINS: **the window is only as long as the SHORTEST request that touched
// the model.** A request with no `keep_alive` does not inherit the last one — it applies Ollama's 5-minute
// default — so an auto-title call landing after a turn would knock a 10-minute expiry back down to 5.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')
// ⛔ Comments stripped — this repo's most repeated defect is a scan matching its own prose.
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')
const OLLAMA = readFileSync(new URL('../../Backend/providers/ollama/index.js', import.meta.url), 'utf8')

test('⭐⭐ the default is 10m, and it is a Sotera-side setting rather than an Ollama global', () => {
  assert.match(code, /function chatKeepAlive\(config\)/, 'the helper exists')
  assert.match(code, /getSetting\(config, 'chat\.keepAlive'\)/, 'overridable per deployment')
  const m = code.match(/function chatKeepAlive\(config\)[\s\S]{0,220}/)
  assert.ok(m, 'the helper body was found — ⛔ a vacuous slice is not a pass')
  assert.equal((m[0].match(/'10m'/g) ?? []).length, 2, "both the value and the catch fall back to '10m'")
})

test('⭐⭐⭐ ONE options object serves the whole turn — first round, tool rounds, forced close', () => {
  // ⛔ The guarantee is structural, not remembered: both `streamChat` sites read the same `options`, so a
  // long tool-using interaction cannot expire halfway through.
  assert.match(code, /const o = \{ stream: true, reasoning: \{ enabled: settings\.reasoning\.enabled \}, keepAlive: chatKeepAlive\(config\) \}/)
  assert.match(code, /const options = buildOptions\(settings, fastify\.config\)/, 'config actually reaches it')
  const streams = [...code.matchAll(/streamChat\(\{[\s\S]{0,400}?\}\)/g)]
  assert.ok(streams.length >= 2, `both streaming call sites found (${streams.length})`)
  for (const [i, s] of streams.entries()) {
    assert.match(s[0], /options,/, `streamChat site ${i + 1} passes the shared options object`)
  }
})

test('⚠️ every in-turn internal call carries it too — the window is the SHORTEST request', () => {
  // rolling summary · auto-title · vision relay. A call omitting keep_alive applies Ollama's 5m default
  // and SHORTENS the window, which is why "they are short and harmless" is wrong.
  const internals = [...code.matchAll(/options: \{ stream: false, reasoning: \{ enabled: false \}[^}]*\}/g)]
  assert.ok(internals.length >= 3, `found the internal call sites (${internals.length})`)
  for (const m of internals) {
    assert.match(m[0], /keepAlive: chatKeepAlive\(fastify\.config\)/,
      `⛔ an in-turn call without keep_alive resets the expiry to 5m: ${m[0].slice(0, 80)}`)
  }
})

test('⭐⭐⭐ BOTH adapter paths apply residency — and a chat turn STREAMS', () => {
  // ⚠️⚠️ THIS IS THE BUG EVERY STRUCTURAL TEST ABOVE MISSED AND THE WIRE CAUGHT. `applyResidency` was
  // called in `chat()` and NOT in `stream()`. The helper existed, the options object carried it, all four
  // call sites passed it — and `/api/ps` still reported **4.9 minutes**, because a chat turn streams and
  // the streaming builder silently dropped the field.
  // ⇒ ⭐ An option is not applied until the BUILDER THAT SHIPS IT applies it, and the only witness is the
  // wire. Same family as "a field is not added until a reader accepts it".
  // ⛔ Index slicing rather than a built regex: escaping `function*` through a template literal is how the
  // first version of this test failed against correct code.
  for (const marker of ['export async function chat(', 'export async function* stream(']) {
    const i = OLLAMA.indexOf(marker)
    assert.ok(i > 0, `${marker} was found — ⛔ a vacuous slice is not a pass`)
    const body = OLLAMA.slice(i, i + 900)
    assert.match(body, /applyResidency\(request, options\)/,
      `⛔ ${marker} must apply keep_alive, or the model expires at Ollama's own default`)
  }
})

test('⛔ the adapter maps it to Ollama\'s TOP-LEVEL keep_alive, not to a sampling option', () => {
  // ⚠️ `keep_alive` is not an `options.*` field in Ollama's API. Nesting it would be silently ignored and
  // the model would keep expiring at 5m while every test here still passed.
  assert.match(OLLAMA, /request\.keep_alive = options\.keepAlive/)
  assert.match(OLLAMA, /options\.keepAlive != null && options\.keepAlive !== ''/,
    'an empty string means "unset", not a zero-length keep-alive')
})

test('⛔ no background ping was introduced', () => {
  // ⭐ The renewal must be a side effect of real work. A timer that touches the model to hold it resident
  // is the thing Ote explicitly refused, and it would also keep a model alive for nobody.
  assert.ok(!/setInterval[\s\S]{0,200}keep_?[Aa]live/.test(code), '⛔ no interval-driven keep-alive')
  assert.ok(!/createJob\([^)]*keep/i.test(code), '⛔ no cron job holding the model open')
})
