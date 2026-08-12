// THE IDENTITY INTERPRETER SEAM — which interpreter speaks, and what happens when the model does not.
//
//   node --test "unit/**/*.test.mjs"
//
// The cognition is tested in the package (it must pass with no host at all). What is tested HERE is the
// thing only the host can get wrong: the ORDER of the two interpreters, and the floor underneath them.
//
// ⚠️ RFC step 5 deletes `interpretIdentity` (the English patterns). The assertions below are what makes
// that deletion visible instead of silent — remove the floor and "falls back to the patterns" fails by
// name. It must not be deleted until identity-multilingual-check.mjs passes in Thai against a live model.
//
// No server, no database, no model: `fastify` is a stub and the chat gateway is never reached, because
// memory.identityLlm=false is the path that must work without one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  identityInterpreter, identityEnabled, identityLlmEnabled, identityModel,
  makeIdentityAsk, interpretAskAnswer,
} from '../../Backend/app/components/memory-identity-host.js'
import { SETTING_KEYS } from '../../Backend/app/settings/index.js'

// A fastify stub. `config` is the real shape getSetting() reads, so the settings layer is genuinely
// exercised rather than mocked away — which is the layer the dead-switch bug lived in.
const stub = (memory = {}) => ({ config: { memory }, log: { debug() {}, warn() {}, info() {} } })

// ── THE SWITCHES EXIST ───────────────────────────────────────────────────────────────────────────
//
// ⚠️ memory.identityEnabled was READ from 2026-07-30 and never REGISTERED. getSetting() throws on an
// unknown key, the host's try/catch returned the default, and identity capture therefore had NO OFF
// SWITCH — for six weeks, silently. This test is the instrument that would have caught it on day one.
test('every setting the identity host reads is actually registered', () => {
  for (const key of ['memory.identityEnabled', 'memory.identityLlm', 'memory.identityModel']) {
    assert.ok(SETTING_KEYS.includes(key), `${key} is read by the host but not registered — getSetting() will throw`)
  }
})

test('the switches respond to config, which is what "registered" buys', () => {
  assert.equal(identityEnabled(stub().config), true, 'default on')
  assert.equal(identityEnabled(stub({ identityEnabled: false }).config), false, 'and it can actually be turned off')
  assert.equal(identityLlmEnabled(stub().config), true)
  assert.equal(identityLlmEnabled(stub({ identityLlm: false }).config), false)
})

test('the identity model FOLLOWS the extraction model at read time, not through a config chain', () => {
  // A config-default chain cannot see a DB override — that is how the episode distiller once ran gemma
  // while extraction ran qwen. Following happens in the host, on every read.
  assert.equal(identityModel(stub({ extractModel: 'ollama/qwen3.5:9b' }).config), 'ollama/qwen3.5:9b')
  assert.equal(identityModel(stub({ extractModel: 'ollama/qwen3.5:9b', identityModel: 'ollama/gemma4:e4b' }).config), 'ollama/gemma4:e4b')
  assert.ok(identityModel(stub().config).includes('/'), 'and there is always SOME model, never empty')
})

// ── NO FLOOR (step 5) ────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THESE ASSERTIONS ARE THE INVERSE OF WHAT THEY SAID THIS MORNING, and that is the change. The
// English patterns used to catch "Hi, I'm Claude" whenever the model was off or unreachable. They are
// deleted. With no model, identity capture now does NOTHING — deliberately, because a missed name
// costs one turn while a wrong one is injected into every future turn and shown to the user as a fact
// about themselves. Two interpreters with different rules, where the weaker speaks only when the
// stronger is silent, runs the fuzzy guess exactly when you would least want it.
test('with the model off, NOTHING is captured — silence, not a guess', async () => {
  const interpret = identityInterpreter(stub({ identityLlm: false }))
  for (const t of ["Hi, I'm Claude.", 'my name is Ote', 'call me Rex', 'ผมชื่อโอต']) {
    assert.equal(await interpret(t), null, t)
  }
})

// ── THE ORDER ────────────────────────────────────────────────────────────────────────────────────
//
// The model is injected at the host's own seam. ESM exports are read-only live bindings, so `chat()`
// cannot be mocked out from here — and a seam that existed only for tests would not be the code path
// that ships. What these assert is the ORDER and the FALLBACK, which is the part only the host owns.
const counting = (reply) => { const c = { calls: 0 }; c.llm = async () => { c.calls++; return typeof reply === 'function' ? reply() : reply }; return c }

test('the model reads the turn, in the language it was written in', async () => {
  const c = counting('{"act":"assert","name":"โอต","evidence":"ผมชื่อโอต","confidence":0.95}')
  const o = await identityInterpreter(stub({ identityLlm: true }), { llm: c.llm })('ผมชื่อโอต')
  assert.equal(c.calls, 1, 'exactly one aux call, on a turn that carries a naming cue')
  assert.equal(o.value, 'โอต', 'Thai — the case the patterns never reached')
  assert.equal(o.context.via, 'llm')
})

test('an unreachable model is silence, never an exception and never a guess', async () => {
  const dead = async () => { throw new Error('ollama is not running') }
  const interpret = identityInterpreter(stub({ identityLlm: true }), { llm: dead })
  assert.equal(await interpret("Hi, I'm Claude."), null, 'English is not a special case any more')
  assert.equal(await interpret('ผมชื่อโอต'), null)
})

test('the switch beats the injection — memory.identityLlm=false means no model, whoever supplies one', async () => {
  const c = counting('{"act":"assert","name":"โอต","evidence":"ผมชื่อโอต","confidence":0.95}')
  assert.equal(await identityInterpreter(stub({ identityLlm: false }), { llm: c.llm })('ผมชื่อโอต'), null)
  assert.equal(c.calls, 0, 'an injected model must not be a way around a setting that says off')
})

// ── THE ASK (step 5) ─────────────────────────────────────────────────────────────────────────────
//
// The resolver's contract with no ask port is DEFER — keep the name she has. So every guard here must
// choose "return null" (do not ask) over "ask badly", and none of them may become "assume".
test('there is no ask when there is nobody to ask, or nowhere to show it', () => {
  const f = stub()
  assert.equal(makeIdentityAsk(f, { user: { id: 'u' }, conversationId: null, interactive: true }), null, 'no conversation')
  assert.equal(makeIdentityAsk(f, { user: { id: 'u' }, conversationId: 'c', interactive: false }), null, 'headless side-call')
  assert.equal(makeIdentityAsk(f, { user: null, conversationId: 'c', interactive: true }), null, 'no human')
  assert.equal(makeIdentityAsk(f, {}), null, 'nothing at all')
  assert.equal(typeof makeIdentityAsk(f, { user: { id: 'u' }, conversationId: 'c', interactive: true }), 'function')
})

test('an answer becomes a write ONLY when it unambiguously names something else', () => {
  const answered = (response) => ({ status: 'answered', response })
  // the two shapes a click produces, and the shape free text produces
  assert.deepEqual(interpretAskAnswer(answered({ answers: [{ selected: ['Otto'], custom: null }] }), 'Ote'), { adopt: true, value: 'Otto' })
  assert.deepEqual(interpretAskAnswer(answered({ answers: [{ selected: [], custom: 'โอต' }] }), 'Ote'), { adopt: true, value: 'โอต' })
  assert.deepEqual(interpretAskAnswer(answered({ freeText: 'call me Z' }), 'Ote'), { adopt: true, value: 'call me Z' })
  // choosing what she already holds is a real answer, and it means LEAVE IT ALONE
  assert.deepEqual(interpretAskAnswer(answered({ answers: [{ selected: ['Ote'] }] }), 'Ote'), { adopt: false })
  assert.deepEqual(interpretAskAnswer(answered({ answers: [{ selected: ['  ote  '] }] }), 'Ote'), { adopt: false }, 'and case/padding do not make it a different name')
})

test('NOT ANSWERING IS NOT PERMISSION — every non-answer resolves to no', () => {
  for (const out of [
    null, undefined, {},
    { status: 'skipped', response: { answers: [{ selected: ['Otto'] }] } },
    { status: 'timeout' },
    { status: 'cancelled' },
    { error: 'ask_user needs a conversation' },
    { status: 'answered', response: null },
    { status: 'answered', response: { answers: [{ selected: [], custom: '   ' }] } },
  ]) {
    assert.deepEqual(interpretAskAnswer(out, 'Ote'), { adopt: false }, JSON.stringify(out))
  }
})

test('a turn with no naming cue costs no model call at all', async () => {
  const c = counting('{"act":"assert","name":"โอต","evidence":"โอต","confidence":0.9}')
  assert.equal(await identityInterpreter(stub({ identityLlm: true }), { llm: c.llm })('can you fix the parser bug please'), null)
  assert.equal(c.calls, 0, 'the cue lexicon is a budget: most turns never reach a model')
  // …and the ASK path can spend one anyway, because the answer to a question carries no cue.
  const forced = identityInterpreter(stub({ identityLlm: true }), { llm: c.llm, requireCue: false })
  assert.equal((await forced('โอต'))?.value, 'โอต')
  assert.equal(c.calls, 1)
})
