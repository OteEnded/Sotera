// ⭐⭐⭐ S1 · A SKILL'S `allowed_tools` IS ENFORCED ON THE PATH WE ACTUALLY USE.
//
// ⛔⛔ WHAT THIS FILE EXISTS TO STOP. A Skill declares `allowed_tools`; the platform honoured it when the
// Skill was BOUND to the conversation and silently ignored it when the model TRIGGERED the Skill with
// `use_skill`. Self-triggering is the mode in production, so the field was a decoration on the only path
// that matters. ⚠️ And the design note had the cause wrong — it said the loop "already rebuilds toolDefs
// per round, so it is a filter". It does not: the list was built ONCE before the loop, so there was no
// second assembly for the allowlist to apply in.
//
// ⭐ Ote's requirements for the fix, and each is asserted below rather than assumed:
//   ① one shared assembly function, taking the active Skill into account          → ③ ⑨
//   ② the same path for a BOUND Skill and a DYNAMICALLY ACTIVATED one             → ⑨ (source-level)
//   ③ ⛔ no second/reimplemented filtering chain                                   → ⑨ (source-level)
//   ④ existing behaviour preserved when NO Skill is active                        → ①
//   ⑤ ⭐ "a Skill declaring no tools stays unconstrained"                          → ②
//
// ⓘ WHAT THIS FILE DOES *NOT* CLAIM. It proves the assembly enforces the allowlist and that the route
// calls that assembly on both Skill paths. It does not drive a live turn: none of the three installed
// Skills declares an allowlist, so a live demonstration would mean installing a FOURTH Skill, which
// changes the trigger catalogue whose activation rates were just measured. That is a deliberate omission,
// not an oversight — see the report.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assembleToolDefs, MEMORY_WRITE_TOOLS } from '../../Backend/app/chat/tool-defs.js'
import { toolDefinitions, memoryToolNames } from '../../Backend/app/components/runtime.js'

const ALL = toolDefinitions()
const namesOf = (defs) => (defs || []).map((d) => d.function?.name)
const pick = (...names) => ALL.filter((d) => names.includes(d.function.name))

// A resolved Skill, shaped exactly as the SDK's resolveSkill returns one: `tools` is already
// OpenAI-shaped and already filtered to installed components, and `allowedComponents === null` means
// unconstrained — which is the property test ② turns on.
const skillOf = ({ allowed = null, files = [] }) => ({
  id: 'skill.fixture',
  name: 'Fixture',
  allowedComponents: allowed,
  tools: allowed === null ? toolDefinitions() : pick(...allowed),
  skillFiles: files,
})

const base = { toolsOn: true, interactiveTurn: true, invocableSkills: [], useMemory: true }

// ══ ① NO SKILL · the existing behaviour, pinned so the refactor cannot have moved it ═══════════════
test('no skill: every installed tool is offered, plus the platform\'s own hands', () => {
  const { defs } = assembleToolDefs({ ...base, skill: null })
  const names = namesOf(defs)
  for (const d of ALL) assert.ok(names.includes(d.function.name), `missing installed tool ${d.function.name}`)
  // platform-intrinsic tools, added AFTER any allowlist
  assert.ok(names.includes('list_decisions'))
  assert.ok(names.includes('set_display_name'))
  assert.ok(names.includes('remember_person'))
  // no skill is active and none is triggerable, so neither skill tool is offered
  assert.ok(!names.includes('read_skill_file'))
  assert.ok(!names.includes('use_skill'))
})

test('tools off: no tool definitions at all', () => {
  const { defs, modelCanWriteMemory } = assembleToolDefs({ ...base, toolsOn: false, skill: null })
  assert.equal(defs, undefined)
  assert.equal(modelCanWriteMemory, false)
})

// ══ ② ⭐ HIS EXPLICIT REQUIREMENT · A SKILL THAT RESTRICTS NOTHING CHANGES NOTHING ══════════════════
// This is the safety property of the whole change: all three installed Skills declare no allowlist, so
// if this drifts, every Skill in production silently loses tools.
test('a Skill declaring no tools stays unconstrained — identical to no Skill at all', () => {
  const withSkill = assembleToolDefs({ ...base, skill: skillOf({ allowed: null }) })
  const without = assembleToolDefs({ ...base, skill: null })
  assert.deepEqual(namesOf(withSkill.defs).sort(), namesOf(without.defs).sort())
  assert.equal(withSkill.modelCanWriteMemory, without.modelCanWriteMemory)
})

// ══ ③ ⭐⭐ THE DEFECT ITSELF · AN ALLOWLIST NARROWS, AND THE NARROWING IS REAL ═══════════════════════
test('a Skill\'s allowlist removes every capability tool it did not name', () => {
  const { defs } = assembleToolDefs({ ...base, skill: skillOf({ allowed: ['calculate', 'get_current_time'] }) })
  const names = namesOf(defs)
  assert.ok(names.includes('calculate'))
  assert.ok(names.includes('get_current_time'))
  // the tools that made the defect visible: search, memory, and the interactive card
  assert.ok(!names.includes('search_web'), 'search_web survived an allowlist that never named it')
  assert.ok(!names.includes('recall_memory'))
  assert.ok(!names.includes('write_todos'))
  assert.ok(!names.includes('ask_user'))
})

// ══ ④ INFRA IS NOT A CAPABILITY · it lands AFTER the allowlist, on purpose ═════════════════════════
test('an EMPTY allowlist still gets the platform\'s own tools and the Skill\'s own reader', () => {
  const { defs } = assembleToolDefs({
    ...base,
    skill: skillOf({ allowed: [], files: [{ path: 'references/guide.md', size: 120 }] }),
  })
  const names = namesOf(defs)
  assert.deepEqual(namesOf(defs).filter((n) => ALL.some((d) => d.function.name === n)), [],
    'a capability tool survived an empty allowlist')
  assert.ok(names.includes('read_skill_file'), 'a Skill must always be able to read its own files')
  assert.ok(names.includes('list_decisions'))
  const reader = defs.find((d) => d.function.name === 'read_skill_file')
  assert.match(reader.function.description, /"Fixture" skill/, 'the reader should name the active Skill')
})

// ══ ⑤ THE ONE-SHOT CONSTRAINT NARROWS AND NEVER WIDENS ═════════════════════════════════════════════
test('a caller\'s allowedTools intersects with the Skill — it cannot add back what the Skill removed', () => {
  const { defs } = assembleToolDefs({
    ...base,
    skill: skillOf({ allowed: ['calculate', 'search_web'] }),
    oneShotAllowedTools: ['search_web', 'fetch_url_content'],
  })
  const names = namesOf(defs)
  assert.ok(names.includes('search_web'), 'named by both — must survive')
  assert.ok(!names.includes('fetch_url_content'), 'the caller widened past the Skill\'s allowlist')
  assert.ok(!names.includes('calculate'), 'the caller\'s narrowing must apply too')
})

// ══ ⑥ THE HEADLESS GATE SURVIVES THE MOVE ══════════════════════════════════════════════════════════
test('headless turn: interactive tools are ABSENT, not merely refused', () => {
  const { defs } = assembleToolDefs({ ...base, interactiveTurn: false, skill: null })
  const names = namesOf(defs)
  assert.ok(!names.includes('ask_user'))
  assert.ok(!names.includes('request_room_access'))
  assert.ok(!names.includes('set_display_name'))
  assert.ok(!names.includes('remember_person'))
  assert.ok(names.includes('list_decisions'), 'a read-only lookup needs no human')
})

// ══ ⑦ THE MEMORY MASTER SWITCH, AND THE ONE-WRITER CONSEQUENCE OF S1 ═══════════════════════════════
test('useMemory off strips every memory tool and nobody is the writer', () => {
  const { defs, modelCanWriteMemory } = assembleToolDefs({ ...base, useMemory: false, skill: null })
  const mem = memoryToolNames()
  for (const n of namesOf(defs)) assert.ok(!mem.has(n), `memory tool ${n} leaked with useMemory off`)
  assert.equal(modelCanWriteMemory, false)
})

test('⭐ a Skill that removes the write tools makes the MODEL stop being this turn\'s writer', () => {
  const open = assembleToolDefs({ ...base, skill: null })
  assert.equal(open.modelCanWriteMemory, true, 'baseline: the model can write when nothing restricts it')
  const narrowed = assembleToolDefs({ ...base, skill: skillOf({ allowed: ['recall_memory'] }) })
  assert.equal(narrowed.modelCanWriteMemory, false)
  for (const n of namesOf(narrowed.defs)) assert.ok(!MEMORY_WRITE_TOOLS.has(n))
})

// ══ ⑧ ONE NAME, ONE DEFINITION · the duplicate that only becomes reachable once S1 exists ══════════
test('read_skill_file appears exactly once when an activated Skill ships files', () => {
  // The shape S1 creates: a Skill is in force AND skills are still triggerable, so step ④ and step ⑥
  // both want to offer a reader. Before S1 these were mutually exclusive.
  const { defs } = assembleToolDefs({
    ...base,
    skill: skillOf({ allowed: ['calculate'], files: [{ path: 'a.md', size: 10 }] }),
    invocableSkills: [{ id: 'skill.other' }],
  })
  const readers = namesOf(defs).filter((n) => n === 'read_skill_file')
  assert.equal(readers.length, 1, 'a duplicate function name is a wire-protocol violation')
  const names = namesOf(defs)
  assert.equal(new Set(names).size, names.length, 'every tool name must be unique')
  const reader = defs.find((d) => d.function.name === 'read_skill_file')
  assert.match(reader.function.description, /"Fixture" skill/, 'the Skill-specific description should win')
})

// ══ ⑧b THE TRACE · what gets recorded about a turn's reach, and it must not flatter itself ══════════
test('the trace distinguishes no Skill, an unconstrained Skill, and a constrained one', () => {
  const none = assembleToolDefs({ ...base, skill: null, path: 'none' }).trace
  assert.equal(none.path, 'none')
  assert.equal(none.skill, null)
  assert.equal(none.constrained, false)
  assert.ok(none.count > 30, 'the unconstrained count should be the whole installed toolset')

  // ⭐ the distinction S1 turns on: a Skill that declares NO allowlist is not "unconstrained by accident"
  const open = assembleToolDefs({ ...base, skill: skillOf({ allowed: null }), path: 'bound' }).trace
  assert.equal(open.path, 'bound')
  assert.equal(open.skill, 'skill.fixture')
  assert.equal(open.constrained, false, 'allowedComponents null is the spec default, not a restriction')
  assert.equal(open.count, none.count)

  const shut = assembleToolDefs({ ...base, skill: skillOf({ allowed: ['calculate'] }), path: 'triggered' }).trace
  assert.equal(shut.path, 'triggered')
  assert.equal(shut.constrained, true)
  assert.ok(shut.count < none.count, 'a constrained turn must record a smaller reach')
})

test('tools off records no trace at all rather than a zero', () => {
  // ⛔ A rule whose input is missing must report NOT RUN, never zero — a `count: 0` here would read as
  // "she could reach nothing" when the truth is "tools were never on".
  assert.equal(assembleToolDefs({ ...base, toolsOn: false, skill: null }).trace, null)
})

// ══ ⑨ ⭐⭐⭐ THE WIRING · ONE ASSEMBLY, TWO CALLERS, NO SECOND CHAIN ═════════════════════════════════
//
// ⛔ The behavioural tests above would all pass with the route still ignoring the activated Skill — the
// enforcement lives in a function nobody called. So these assert the route's SHAPE.
// ⚠️ Every anchor is asserted FOUND before it is used: a source scan whose anchor quietly disappears
// stops scanning and reports success, which this repo has already been bitten by.
const ROUTE = readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')

test('the route calls the shared assembly exactly twice — bound, and on activation', () => {
  const calls = ROUTE.match(/assembleToolDefs\(\{/g) || []
  assert.equal(calls.length, 2, `expected 2 assembly call sites, found ${calls.length}`)
})

test('the second call site is inside the use_skill handler, after the Skill resolves', () => {
  const anchor = ROUTE.indexOf('dynamicSkill = resolveSkill(')
  assert.ok(anchor > 0, 'ANCHOR MISSING: the use_skill handler no longer resolves a dynamic skill')
  const after = ROUTE.slice(anchor, anchor + 2000)
  assert.match(after, /assembleToolDefs\(\{/, 'the activated Skill never reaches the assembly')
  assert.match(after, /skill: dynamicSkill/, 'the assembly is called without the Skill that was just activated')
  assert.match(after, /toolDefs = reassembled\.defs/, 'the reassembled toolset is never adopted')
  assert.match(after, /modelCanWriteMemory = reassembled\.modelCanWriteMemory/,
    'one-writer must follow the reassembly, or a Skill removing the write tools leaves nobody writing')
})

test('⛔ the old inline chain has not grown back in the route', () => {
  // The failure family this guards: a tool appended at a call site instead of in the module vanishes the
  // moment a Skill activates, because only one of the two paths would know about it.
  assert.ok(!/toolDefs = \[\.\.\.\(toolDefs \|\| \[\]\)/.test(ROUTE),
    'a tool definition is being appended in the route — it belongs in app/chat/tool-defs.js')
  assert.ok(!/toolDefs = toolDefs\.filter/.test(ROUTE),
    'a tool filter is being applied in the route — it belongs in app/chat/tool-defs.js')
})

test('MEMORY_WRITE_TOOLS still has exactly one definition', () => {
  assert.ok(!/^const MEMORY_WRITE_TOOLS/m.test(ROUTE), 'the set was re-declared in the route')
  assert.match(ROUTE, /import \{ assembleToolDefs, MEMORY_WRITE_TOOLS \}/, 'the route must import the one definition')
  assert.ok(MEMORY_WRITE_TOOLS.has('remember') && MEMORY_WRITE_TOOLS.has('remember_fact'))
})
