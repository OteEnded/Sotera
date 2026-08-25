// ⭐⭐⭐ THE INSTRUMENTATION'S OWN TESTS. Each one reproduces a mistake that ACTUALLY HAPPENED in B4 and
// asserts that it now fails loudly instead of returning a confident wrong answer.
//
// Ote: *"A check returning a confident wrong answer because it is reading a nonexistent field is exactly
// the kind of instrumentation problem we don't want contaminating this experiment."*
//
// ⛔ These are not tests of the retrieval capability. They are tests of the RULER, written before the
// ruler is used to compare four payload shapes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { field, saidOf, turnsOf, parseResult, readTrace, windowFor } from '../lib/tool-trace.mjs'

// ══ 1 · ⭐⭐⭐ AN ABSENT FIELD THROWS, AND SAYS WHAT WAS ACTUALLY THERE ═══════════════════════════════
test('⭐⭐⭐ a missing field throws and names the keys that DO exist', () => {
  const t = { handle: 'abc', conversationId: 'cid', said: 'hello', role: 'user' }
  assert.throws(() => field(t, 'text', 'turn'), (e) => {
    // ⭐ The key list is the whole point: the B4 failure cost three rounds precisely because the error
    // said nothing. An exception that names `said` ends the investigation in one line.
    assert.match(e.message, /no field "text"/)
    assert.match(e.message, /handle, conversationId, said, role/)
    return true
  })
})

test('⛔ and it never returns undefined for a verdict-bearing field', () => {
  // The defect shape: `t.text ?? t.content ?? ''` yields '' for a turn with 1867 characters in `said`,
  // and the probe reported "8 turns, 7 chars" with total confidence.
  const turn = { conversationId: 'c', said: 'x'.repeat(1867), role: 'assistant' }
  assert.equal(saidOf(turn).length, 1867)
  assert.throws(() => saidOf({ conversationId: 'c', text: 'wrong field' }), /no field "said"/)
})

// ══ 2 · ⭐⭐ THE WINDOW/TURN CONFUSION, WHICH PRINTED "✖ NO" OVER A ✔ ════════════════════════════════
test('⭐⭐ windowFor matches on TURNS — a window has no conversationId of its own', () => {
  const result = {
    windows: [
      { handle: 'aaaaaaaaaa', opened: true, centredOn: 'x', turns: [{ conversationId: 'other', said: 'no' }] },
      { handle: '24227cbb6a', opened: true, centredOn: 'y', turns: [{ conversationId: 'TARGET', said: 'the answer' }] },
    ],
  }
  const hit = windowFor(result, 'TARGET')
  assert.ok(hit, '⛔ the target IS open — this is the exact case that printed a confident NO')
  assert.equal(hit.window.handle, '24227cbb6a')
  assert.equal(hit.turns.length, 1)
  assert.equal(saidOf(hit.turns[0]), 'the answer')
})

test('⛔ a window carrying a stray conversationId does not fool it', () => {
  // ⚠️ The inverse error: matching on the WINDOW would make a shape change silently start passing.
  const result = { windows: [{ handle: 'x', conversationId: 'TARGET', opened: true, turns: [{ conversationId: 'other', said: 'no' }] }] }
  assert.equal(windowFor(result, 'TARGET'), null, 'the turns are what were actually shown to her')
})

test('⛔ a result with no windows key throws rather than reporting "not found"', () => {
  // ⭐ "The field is gone" and "the target was not opened" are different facts, and only one of them is
  // about her behaviour. A `?? []` here would silently convert the first into the second.
  assert.throws(() => windowFor({ ok: true, conversations: [] }, 'TARGET'), /no field "windows"/)
})

// ══ 3 · ⭐⭐ A CLIPPED RESULT IS A REPORTED STATE, NEVER AN EMPTY ONE ════════════════════════════════
test('⭐⭐ the 4000-char clip is reported as `clipped`, not swallowed into empty', () => {
  const whole = JSON.stringify({ ok: true, selector: { used: ['about'], about: 'x' }, coverage: { matchedConversations: 292 }, windows: [] })
  assert.equal(parseResult(whole).state, 'whole')

  const clipped = whole.slice(0, 60) + '…'
  const p = parseResult(clipped)
  assert.equal(p.state, 'clipped', '⛔ unparsed and empty are different facts')
  assert.equal(p.value, null)
})

test('⭐ and the head fields are recovered from a clipped result, because they survive the clip', () => {
  // ⓘ `selector` and `coverage` sit near the front of the payload; `windows` do not. That asymmetry is
  // why the axis can be read from the stored record and the window contents cannot.
  const whole = JSON.stringify({
    ok: true, via: 'conversation-retrieval',
    selector: { used: ['about'], about: 'transparency-layer' },
    coverage: { matchedConversations: 292, openedConversations: 5 },
    windows: [{ handle: 'x', turns: [{ conversationId: 'TARGET', said: 'the answer' }] }],
  })
  const p = parseResult(whole.slice(0, 200) + '…')
  assert.equal(p.state, 'clipped')
  assert.deepEqual(p.selector, { used: ['about'], about: 'transparency-layer' })
  assert.equal(p.coverage.matchedConversations, 292)
})

// ══ 4 · ⭐ THE AXIS COMES FROM THE TOOL'S OWN REPLY ════════════════════════════════════════════════
test('⭐ the axis is read from the echoed selector, not from a provider-shaped arguments field', () => {
  // ⚠️ The B4 harness printed `args: {}` for all twelve calls while the audit table held every key.
  const msgs = [{
    tool_calls: [{
      function: { name: 'retrieve_conversations' },   // ⛔ no `arguments` here — that is the real shape
      result: JSON.stringify({ ok: true, selector: { used: ['about'], about: 'transparency-layer' }, coverage: { matchedConversations: 292 } }),
    }],
  }]
  const audit = [{ tool: 'retrieve_conversations', arg_keys: ['about', 'limit'], ok: true, duration_ms: 13833 }]
  const [c] = readTrace(msgs, audit)
  assert.equal(c.name, 'retrieve_conversations')
  assert.deepEqual(c.axis, { used: ['about'], about: 'transparency-layer' })
  assert.deepEqual(c.argKeys, ['about', 'limit'], 'the audit table is the second witness')
  assert.equal(c.agrees, true)
  assert.equal(c.ms, 13833)
})

test('⛔ the two witnesses must AGREE on the tool name, or every arg_keys is on the wrong call', () => {
  const msgs = [{ tool_calls: [{ name: 'retrieve_conversations', result: '{}' }] }]
  const [c] = readTrace(msgs, [{ tool: 'list_memories', arg_keys: [], ok: true, duration_ms: 5 }])
  assert.equal(c.agrees, false, '⭐ a silent misalignment would attribute one call’s axis to another')
})

test('⛔ a tool_call with no name throws — it can never be counted as "some other tool"', () => {
  assert.throws(() => readTrace([{ tool_calls: [{ result: '{}' }] }]), /tool_call with no name/)
})

// ══ 5 · ⛔ THE AUDIT TABLE HAS NO CONTENT, AND THE READER MUST NOT PRETEND OTHERWISE ═══════════════
test('⛔ reading the audit table for arguments or results throws', () => {
  // The real `log_tool_calls` columns: id, rolling_id, tool, origin, user_id, username, is_root,
  // conversation_id, ok, is_read_only, duration_ms, arg_keys, arg_bytes, error, created_at.
  const auditRow = { tool: 'retrieve_conversations', ok: true, is_read_only: true, duration_ms: 13833, arg_keys: ['about'], arg_bytes: 42 }
  assert.throws(() => field(auditRow, 'arguments', 'audit row'), /no field "arguments"/)
  assert.throws(() => field(auditRow, 'result', 'audit row'), /no field "result"/)
})
