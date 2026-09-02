// ⭐⭐⭐ 12b.3 · THE EVIDENCE-SELECTOR DISCRIMINATOR — five classes, candidate rules, ⛔ no implementation.
//
//   node test/pipeline/dreaming-12b3-selector-discriminator.mjs
//
// ── ⛔ WHAT THIS IS ─────────────────────────────────────────────────────────────────────────────
// Ote, 2026-09-03: *"Build a small discriminator fixture BEFORE implementation… First establish whether
// the existing system has enough structured information to enforce it mechanically, and what trade-offs
// that creates."*
//
// ⇒ ⭐ this scores CANDIDATE selection rules against a fixture with DECLARED ground truth. ⛔ It changes
// no production module, ⛔ ships no rule, ⛔ calls no model, ⛔ touches no database, and ⛔ contains no
// threshold, similarity score or classifier. Every rule below is an EXACT predicate.
//
// ── ⭐⭐ THE FIVE CLASSES (Ote's list, verbatim) ────────────────────────────────────────────────
//   1 label-only        the slot's label is mentioned while discussing the memory system
//   2 subject           genuine evidence about the subject
//   3 mixed             one turn carrying BOTH meta-discussion and subject material
//   4 wrong-subject     genuine subject evidence — about a DIFFERENT person
//   5 (roots)           the whole fixture spans several independent roots, so the O-2 floor is live
//
// ⭐ GROUND TRUTH IS DECLARED PER TURN, BEFORE ANY RULE RUNS. ⛔ Not fitted afterwards.

const SUBJECT = 'person-A'
const OTHER = 'person-B'
const SLOT_LABEL = 'review order'
const SLOT_VALUE = 'raw error counts first, then the recommendation'
const SLOT_SOURCE_MESSAGE = 'm-subject-1' // ⓘ `txn_memories.source_message_id` — 60 of 60 on live user rows

/**
 * ⭐ THE FIXTURE. `admit` is the DECLARED ground truth: should a correct selector take this turn as
 * evidence for a claim about `person-A`'s `review order`?
 */
const TURNS = Object.freeze([
  // ── 1 · LABEL-ONLY — mentions the label while talking about the memory system ─────────────────
  { id: 'm-label-1', root: 'r1', room: SUBJECT, role: 'assistant', admit: false, cls: 'label-only',
    text: 'I could store your review order as a durable preference rather than casual chitchat.' },
  { id: 'm-label-2', root: 'r2', room: SUBJECT, role: 'assistant', admit: false, cls: 'label-only',
    text: 'Whatever review order gets recorded, the system should be able to reuse it later.' },

  // ── 2 · SUBJECT — the person actually doing the thing. ⚠️ NOTE: no slot label anywhere. ────────
  { id: 'm-subject-1', root: 'r3', room: SUBJECT, role: 'user', admit: true, cls: 'subject',
    text: 'Give me the raw error counts first, then the recommendation.' },
  { id: 'm-subject-2', root: 'r4', room: SUBJECT, role: 'user', admit: true, cls: 'subject',
    text: 'Hold your opinion until you have shown me the measured latency for each build.' },
  { id: 'm-subject-3', root: 'r5', room: SUBJECT, role: 'user', admit: true, cls: 'subject',
    text: 'Numbers before the verdict, please — what did the benchmark report?' },

  // ── 3 · MIXED — one turn carrying BOTH. ⭐ The hardest class: any rule that is purely exclusionary
  //      will throw away real evidence here, and any rule that is purely inclusive will take the meta.
  { id: 'm-mixed-1', root: 'r6', room: SUBJECT, role: 'user', admit: true, cls: 'mixed',
    text: 'You can remember this if it helps: I always want the error counts before your recommendation.' },

  // ── 4 · WRONG-SUBJECT — genuine subject evidence, about somebody else ─────────────────────────
  { id: 'm-other-1', root: 'r7', room: OTHER, role: 'user', admit: false, cls: 'wrong-subject',
    text: 'Show me the raw error counts first, then tell me which build you would ship.' },
  { id: 'm-other-2', root: 'r8', room: OTHER, role: 'user', admit: false, cls: 'wrong-subject',
    text: 'I want the benchmark numbers before any recommendation, every time.' },
])

// ── ⭐ CANDIDATE RULES — every one an EXACT predicate. ⛔ No threshold, no embedding, no model. ──
const RULES = Object.freeze([
  { id: 'R-label  (CURRENT)', why: 'the turn contains the slot label',
    fn: (t) => t.text.toLowerCase().includes(SLOT_LABEL) },
  { id: 'R-room', why: 'the turn\'s room resolves to the subject person',
    fn: (t) => t.room === SUBJECT },
  { id: 'R-value', why: 'the turn contains the slot\'s recorded value',
    fn: (t) => SLOT_VALUE.split(/,\s*/).some((frag) => t.text.toLowerCase().includes(frag.toLowerCase())) },
  { id: 'R-source', why: 'the turn IS the slot\'s recorded source_message_id',
    fn: (t) => t.id === SLOT_SOURCE_MESSAGE },
  { id: 'R-room ∧ R-label', why: 'current rule, confined to the subject\'s room',
    fn: (t) => t.room === SUBJECT && t.text.toLowerCase().includes(SLOT_LABEL) },
  { id: 'R-room ∧ spoken-by-subject', why: 'in the subject\'s room AND said BY them',
    fn: (t) => t.room === SUBJECT && t.role === 'user' },
  { id: 'R-room ∧ (R-value ∨ R-source)', why: 'in the room, and bearing the recorded value or being its source',
    fn: (t) => t.room === SUBJECT
      && (SLOT_VALUE.split(/,\s*/).some((f) => t.text.toLowerCase().includes(f.toLowerCase())) || t.id === SLOT_SOURCE_MESSAGE) },
])

const pad = (s, n) => String(s).padEnd(n)
try {
  console.log('\n══ 12b.3 · EVIDENCE-SELECTOR DISCRIMINATOR ═══════════════════════════════════')
  console.log('   ⛔ in-memory · no model · no database · no production change · no threshold')
  console.log(`   subject = ${SUBJECT} · slot = "${SLOT_LABEL}" · 8 turns across 8 independent roots\n`)

  const truth = TURNS.filter((t) => t.admit)
  console.log(`   ground truth: ${truth.length} turns SHOULD be admitted `
    + `(${[...new Set(truth.map((t) => t.cls))].join(' + ')})`)
  console.log(`                 ${TURNS.length - truth.length} SHOULD NOT `
    + `(${[...new Set(TURNS.filter((t) => !t.admit).map((t) => t.cls))].join(' + ')})\n`)

  console.log(`  ${pad('rule', 30)} ${pad('admits', 7)} ${pad('missed', 7)} ${pad('wrong', 6)} roots  classes admitted`)
  console.log(`  ${'─'.repeat(30)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(6)} ─────  ────────────────`)
  const scored = []
  for (const r of RULES) {
    const taken = TURNS.filter(r.fn)
    const missed = TURNS.filter((t) => t.admit && !r.fn(t))
    const wrong = taken.filter((t) => !t.admit)
    const roots = new Set(taken.map((t) => t.root)).size
    scored.push({ r, taken, missed, wrong, roots })
    console.log(`  ${pad(r.id, 30)} ${pad(taken.length, 7)} ${pad(missed.length, 7)} ${pad(wrong.length, 6)} ${pad(roots, 6)} `
      + `${[...new Set(taken.map((t) => t.cls))].join(', ') || '(none)'}`)
  }

  console.log('\n══ WHAT EACH RULE COSTS ═════════════════════════════════════════════════════\n')
  for (const s of scored) {
    const floorOk = s.roots >= 2
    console.log(`  ▸ ${s.r.id}  —  ${s.r.why}`)
    console.log(`    ${s.wrong.length === 0 ? '✅ no wrong-class evidence' : `⛔ admits ${s.wrong.length}: ${[...new Set(s.wrong.map((t) => t.cls))].join(', ')}`}`)
    console.log(`    ${s.missed.length === 0 ? '✅ misses nothing real' : `⚠️ misses ${s.missed.length} real: ${[...new Set(s.missed.map((t) => t.cls))].join(', ')}`}`)
    console.log(`    ${floorOk ? `✅ ${s.roots} roots — clears the O-2 floor` : `⛔ ${s.roots} root(s) — CANNOT reach a claim at all`}\n`)
  }

  console.log('══ THE TRADE-OFF, STATED ════════════════════════════════════════════════════\n')
  console.log('  ⭐ The fixture is built so no rule here is free, and the MIXED class is why:')
  console.log('    a turn carrying BOTH meta-discussion and real subject material is real evidence,')
  console.log('    so any rule that excludes meta-discussion outright throws it away.')
  console.log('  ⛔ Nothing above is proposed for implementation. This measures what the existing')
  console.log('    structured information can and cannot enforce — the ruling is Ote\'s.\n')
} catch (e) {
  console.error(`\n⛔ ${e?.stack ?? e}\n`)
  process.exitCode = 1
}
