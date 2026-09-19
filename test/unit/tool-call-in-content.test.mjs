// ⭐ THE TEXT-FORM TOOL CALL DETECTOR — it must FIND the measured case, REFUSE to invent, and
// ⛔ never carry a parameter value.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  detectToolCallInContent, mightContainTextToolCall, describeTextToolCall,
  A_TEXT_TOOL_CALL_IS_OBSERVED_NEVER_RUN,
} from '../../Backend/app/components/tool-call-in-content.js'

// ⭐ THE REAL PAYLOAD, transcribed from message 5f424d2d-586b-44e2-876b-7d56c67c8503.
// ⛔ Not a paraphrase: a detector tested only against a tidy fixture is tested against its own author.
const REAL = 'ได้เลยพ่อ รอสักครู่นะ 💻✨\n'
  + '<function=fetch_url_content>\n<parameter=url>\n'
  + 'https://en.touhouwiki.net/wiki/Lyrics:%E7%B4%85%E6%B6%99\n'
  + '</parameter>\n<parameter=maxChars>\n15000\n</parameter>\n</function>'

test('⭐ it finds the MEASURED case — the exact turn that broke', () => {
  const d = detectToolCallInContent(REAL)
  assert.equal(d.found, true)
  assert.equal(d.count, 1)
  assert.equal(d.calls[0].name, 'fetch_url_content')
  assert.deepEqual(d.calls[0].paramKeys, ['maxChars', 'url'])   // sorted, so it is comparable across turns
})

test('⛔⛔ IT CARRIES NO PARAMETER VALUE — the whole payload is absent from the result', () => {
  const d = detectToolCallInContent(REAL)
  const serialized = JSON.stringify(d)
  // the URL, the number, and the Thai prose must all be unrecoverable from the detector's output
  assert.ok(!serialized.includes('touhouwiki'), 'a URL value leaked into the detector result')
  assert.ok(!serialized.includes('15000'), 'a parameter value leaked into the detector result')
  assert.ok(!serialized.includes('รอสักครู่'), 'conversation prose leaked into the detector result')
  // ⭐ and positively: the only strings present are names and key names
  assert.deepEqual(Object.keys(d).sort(), ['bytes', 'calls', 'count', 'found'])
})

test('⭐ an ordinary answer is not a detection — and the cheap pre-test agrees', () => {
  const plain = 'Sure — here is the romaji, and a note about the translation.'
  assert.equal(mightContainTextToolCall(plain), false)
  assert.equal(detectToolCallInContent(plain).found, false)
})

test('⛔ it does NOT fire on prose that merely talks about functions', () => {
  const talking = 'I would call the function fetch_url_content with a url parameter, but the site blocks it.'
  assert.equal(detectToolCallInContent(talking).found, false)
})

test('⭐ multiple blocks in one turn are each reported', () => {
  const two = '<function=search_web>\n<parameter=query>\nx\n</parameter>\n</function>\n'
    + '<function=fetch_url_content>\n<parameter=url>\ny\n</parameter>\n</function>'
  const d = detectToolCallInContent(two)
  assert.equal(d.count, 2)
  assert.deepEqual(d.calls.map((c) => c.name), ['search_web', 'fetch_url_content'])
})

test('⭐ a block with no parameters is still a call, reported as having none', () => {
  const d = detectToolCallInContent('<function=get_current_time>\n</function>')
  assert.equal(d.found, true)
  assert.deepEqual(d.calls[0].paramKeys, [])
  assert.equal(describeTextToolCall(d), 'get_current_time(no parameters)')
})

test('⚠️ THE SHARED-REGEX TRAP: a second call must not resume mid-string', () => {
  // module-level `g` regexes keep `lastIndex`; without an explicit reset the 2nd call misses the 1st block
  assert.equal(detectToolCallInContent(REAL).count, 1)
  assert.equal(detectToolCallInContent(REAL).count, 1, 'the second invocation lost the block — lastIndex leaked')
  assert.equal(detectToolCallInContent(REAL).count, 1)
})

test('⛔ malformed / unterminated markup is NOT a detection — under-report, never invent', () => {
  assert.equal(detectToolCallInContent('<function=fetch_url_content>\n<parameter=url>\nx').found, false)
  assert.equal(detectToolCallInContent('<function=>\n</function>').found, false)
  assert.equal(detectToolCallInContent('</function>').found, false)
})

test('⛔ non-strings and empties are safe', () => {
  for (const v of [null, undefined, 0, {}, [], '']) {
    assert.equal(mightContainTextToolCall(v), false)
    assert.equal(detectToolCallInContent(v).found, false)
  }
})

test('⛔⛔ THE MODULE HAS NO EXECUTION PATH — asserted on the source, not on the behaviour', () => {
  const src = readFileSync(new URL('../../Backend/app/components/tool-call-in-content.js', import.meta.url), 'utf8')
  const code = src.split('\n').filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') })
  assert.equal(code.filter((l) => /^import /.test(l)).length, 0, 'the detector imported something — it must stay pure')
  for (const forbidden of ['runTool', 'authorizeToolCall', 'fetch(', 'require(']) {
    assert.ok(!code.some((l) => l.includes(forbidden)), `the detector references ${forbidden}`)
  }
  // ⭐ a positive control, so the scan above cannot pass because it found nothing to read
  assert.ok(code.some((l) => l.includes('FUNCTION_BLOCK')), 'the source scan read nothing — it is vacuous')
})

test('⭐ the intent is declared, so a check asserts the RULE and not the regex', () => {
  assert.match(A_TEXT_TOOL_CALL_IS_OBSERVED_NEVER_RUN, /never executed/)
  assert.match(A_TEXT_TOOL_CALL_IS_OBSERVED_NEVER_RUN, /never parameter values/)
  assert.match(A_TEXT_TOOL_CALL_IS_OBSERVED_NEVER_RUN, /FLOOR/)
})
