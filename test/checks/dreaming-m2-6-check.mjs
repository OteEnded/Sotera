// ⭐⭐⭐ M2-6 · THE EVIDENCE-SELECTION CONTRACT — RP1…RP14, exactly as ratified.
//
//   node test/checks/dreaming-m2-6-check.mjs
//
// ⛔ Read-only against production · ⛔ no model · ⛔ no write · ⛔ M2 disabled · ⛔ live persona untouched.
//
// ── ⭐⭐ THE CONTRACT (Ote, 2026-09-03) ─────────────────────────────────────────────────────────
//   C0 the selector produces CANDIDATES, ⛔ not evidence
//   C1 formation context = the hard containment boundary, DERIVED FROM THE SLOT, ⛔ not a semantic claim
//   C2 primary + secondary both admitted, both COUNT; the speaker travels with the warrant
//   C3 key = label ∪ value — a RECALL improvement, ⛔ not an aboutness guarantee
//
// ⭐ RP11 is the one that matters: it uses a CONSTRUCTED subject ≠ room-owner fixture, because the corpus
// has never produced that case, and it is what stops a structural convenience hardening into a semantic
// rule. ⭐ RP14 keeps the residual visible on purpose.

import { readFileSync, existsSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import {
  selectCandidates, provenanceOf, probesFor, probeMatching,
  CANDIDATE_PROVENANCE, REFUSAL, CANDIDATES_ARE_NOT_EVIDENCE,
} from '../../Backend/app/components/dreaming-candidate-selection.js'
import { resolveFormationContext } from '../../Backend/app/components/dreaming-candidate-host.js'
import { verifyCitations } from '../../Backend/app/components/dreaming-verify.js'

const { check, done } = makeChecker('dreaming-m2-6')
const pg = devPg(); await pg.connect()
const query = async (sql, p) => pg.query(sql, p)
const S = `"${devSchema()}"`

const ROOM_A = 'room-A'
const PERSON_A = 'person-A'
const PERSON_B = 'person-B'
const SLOT = Object.freeze({ attribute: 'review order', value: 'raw error counts before the recommendation' })

const row = (o) => ({ message_id: o.id, conversation_id: o.root, content: o.text, role: o.role, room: o.room })

try {
  // ══ RP13 · C0 — THE RETURN IS NAMED `candidates` ══════════════════════════════════════════════
  const base = selectCandidates({
    rows: [row({ id: 'm1', root: 'r1', text: 'give me the raw error counts before the recommendation', role: 'user', room: ROOM_A })],
    slot: SLOT, formationContext: ROOM_A, subjectPersonId: PERSON_A, roomOwnerPersonId: PERSON_A,
  })
  check('RP13 · ⭐⭐⭐ C0 — the return is named `candidates`, ⛔ never `evidence`',
    Array.isArray(base.candidates) && base.evidence === undefined)
  check('RP13 · ⭐ …and the module SAYS it does not guarantee aboutness',
    /does not guarantee that a candidate bears on the claim/i.test(CANDIDATES_ARE_NOT_EVIDENCE))

  // ══ RP1 + RP12 · C1 — THE CONTAINMENT BOUNDARY ════════════════════════════════════════════════
  const sameWordsElsewhere = selectCandidates({
    rows: [
      row({ id: 'm1', root: 'r1', text: 'raw error counts before the recommendation', role: 'user', room: ROOM_A }),
      // ⭐ IDENTICAL WORDS, DIFFERENT ROOM — the wrong-subject case.
      row({ id: 'm2', root: 'r2', text: 'raw error counts before the recommendation', role: 'user', room: 'room-B' }),
    ],
    slot: SLOT, formationContext: ROOM_A, subjectPersonId: PERSON_A, roomOwnerPersonId: PERSON_A,
  })
  check('RP1 · ⭐⭐ a candidate outside the formation context is REFUSED',
    sameWordsElsewhere.candidates.length === 1 && sameWordsElsewhere.candidates[0].messageId === 'm1')
  check('RP12 · ⭐⭐⭐ …and it is refused BY THE BOUNDARY, ⛔ not by an aboutness judgement',
    sameWordsElsewhere.refused.some((r) => r.messageId === 'm2' && r.refusal === REFUSAL.outOfContext),
    JSON.stringify(sameWordsElsewhere.refused))

  // ⛔ RP2 · FAIL CLOSED — a caller that supplies no boundary gets NOTHING, ⛔ not everything.
  const unbounded = selectCandidates({
    rows: [row({ id: 'm1', root: 'r1', text: 'raw error counts before the recommendation', role: 'user', room: ROOM_A })],
    slot: SLOT, formationContext: null,
  })
  check('RP2 · ⛔⛔ with NO formation context the selector refuses outright — ⛔ never an unbounded set',
    unbounded.ok === false && unbounded.candidates.length === 0, unbounded.why)
  // ⭐ …and the boundary is DERIVABLE FROM THE SLOT, so it is not caller discipline.
  const resolved = await resolveFormationContext({ query, schema: devSchema(), attribute: 'preferred_name' })
  check('RP2 · ⭐⭐ the boundary RESOLVES FROM THE SLOT itself — ⛔ not supplied by a caller',
    Boolean(resolved?.formationContext), JSON.stringify(resolved ? Object.keys(resolved) : null))
  check('RP2 · ⭐ …and it returns formation context and subject as SEPARATE fields',
    resolved !== null && 'formationContext' in resolved && 'subjectPersonId' in resolved
      && 'roomOwnerPersonId' in resolved)

  // ══ RP3 + RP4 + RP5 + RP7 · C2 — PROVENANCE ═══════════════════════════════════════════════════
  const mixed = selectCandidates({
    rows: [
      row({ id: 'm1', root: 'r1', text: 'raw error counts before the recommendation, please', role: 'user', room: ROOM_A }),
      row({ id: 'm2', root: 'r2', text: 'you always want the raw error counts before the recommendation', role: 'assistant', room: ROOM_A }),
    ],
    slot: SLOT, formationContext: ROOM_A, subjectPersonId: PERSON_A, roomOwnerPersonId: PERSON_A,
  })
  check('RP3 · ⭐⭐ EVERY candidate carries a provenance class — ⛔ none unclassified',
    mixed.candidates.length === 2 && mixed.candidates.every((c) => Object.values(CANDIDATE_PROVENANCE).includes(c.provenance)))
  check('RP5 · ⭐ the subject\'s own turn is `primary`',
    mixed.candidates.find((c) => c.messageId === 'm1')?.provenance === CANDIDATE_PROVENANCE.primary)
  check('RP4 · ⭐⭐⭐ SOTERA\'S OWN OBSERVATION IS ADMITTED and classed `secondary` — ⛔ not thrown away',
    mixed.candidates.find((c) => c.messageId === 'm2')?.provenance === CANDIDATE_PROVENANCE.secondary)
  check('RP7 · ⭐⭐ BOTH classes COUNT toward the root total — ⛔ a secondary source is not discounted',
    mixed.roots === 2 && mixed.primary === 1 && mixed.secondary === 1,
    `roots=${mixed.roots} primary=${mixed.primary} secondary=${mixed.secondary}`)

  // ⛔ RP6 · THE SPEAKER TRAVELS. A secondary cite cannot be rendered as the subject's own words,
  // because the reader is TOLD who spoke — ⛔ not because a model was careful in prose.
  const sec = mixed.candidates.find((c) => c.provenance === CANDIDATE_PROVENANCE.secondary)
  check('RP6 · ⭐⭐⭐ a secondary candidate carries its SPEAKER, so it cannot be passed off as the subject\'s words',
    sec?.speaker === 'sotera')
  check('RP6 · ⭐ …and a primary one names the subject as speaker',
    mixed.candidates.find((c) => c.provenance === CANDIDATE_PROVENANCE.primary)?.speaker === 'subject')
  // ⭐ And it survives into the warrant path: the cite carries the speaker alongside the root.
  const v = verifyCitations({
    cites: mixed.candidates.map((c) => ({ root: c.root, span: c.excerpt.slice(0, 30) })),
    buckets: mixed.candidates.map((c) => ({ root: c.root, turns: [{ excerpt: c.excerpt }] })),
  })
  check('RP6 · ⭐⭐ …and both classes verify through M2-8 UNCHANGED', v.ok && v.verifiedRoots === 2, v.why)

  // ══ RP8 + RP9 · C3 — UNION, PROVEN IN BOTH DIRECTIONS ═════════════════════════════════════════
  const labelOnlyRow = row({ id: 'm3', root: 'r3', text: 'we should record the review order somewhere', role: 'user', room: ROOM_A })
  const valueOnlyRow = row({ id: 'm4', root: 'r4', text: 'show me raw error counts before the recommendation', role: 'user', room: ROOM_A })
  const union = selectCandidates({
    rows: [labelOnlyRow, valueOnlyRow], slot: SLOT, formationContext: ROOM_A,
    subjectPersonId: PERSON_A, roomOwnerPersonId: PERSON_A,
  })
  check('RP8 · ⭐⭐⭐ the VALUE probe admits a root the LABEL probe cannot see — the `genre focus` case (0 → 2)',
    union.candidates.some((c) => c.messageId === 'm4' && c.admittedBy === 'value'))
  check('RP9 · ⭐⭐ and the LABEL probe still admits a root the VALUE probe misses — UNION, ⛔ not replacement',
    union.candidates.some((c) => c.messageId === 'm3' && c.admittedBy === 'label'))
  check('RP9 · ⭐ every candidate records WHICH probe admitted it — ⛔ "why was this selected?" keeps a one-word answer',
    union.candidates.every((c) => c.admittedBy === 'label' || c.admittedBy === 'value'))
  // ⛔ A probe is CONJUNCTIVE within itself — a merged token bag would admit incoherent rows.
  check('RP9 · ⛔ a probe matches only when ALL its terms are present',
    probeMatching('review something else entirely', probesFor(SLOT)) === null)

  // ══ RP10 · ⛔ NO THRESHOLD, NO CLASSIFIER, NO EMBEDDING ═══════════════════════════════════════
  const selSrc = readFileSync(new URL('../../Backend/app/components/dreaming-candidate-selection.js', import.meta.url), 'utf8')
  const selCode = selSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[^\n]*?\/\/.*$/gm, (l) => l.slice(0, l.indexOf('//')))
  check('RP10 · ⭐ the source was found — ⛔ else the absences below are vacuous', selSrc.length > 1000)
  for (const banned of ['embedding', 'halfvec', 'cosine', 'similar', 'threshold', 'classify', 'score', '<=>']) {
    check(`RP10 · ⛔⛔ no \`${banned}\` anywhere in the selector`, !selCode.toLowerCase().includes(banned))
  }

  // ══ RP11 · ⭐⭐⭐ SUBJECT ≠ ROOM OWNER — THE CONSTRUCTED FIXTURE THE CORPUS CANNOT SUPPLY ══════
  // ⚠️ Measured: subject IS the room owner in 45 of 45 live cases, so this case has NEVER occurred.
  // ⭐ It is what proves formation context and subject identity did not quietly become one field.
  const divergent = selectCandidates({
    rows: [
      // the ROOM's account holder speaking — ⛔ but they are NOT the subject
      row({ id: 'm5', root: 'r5', text: 'raw error counts before the recommendation is how they work', role: 'user', room: ROOM_A }),
      // Sotera's own observation — ⭐ still unambiguously secondary, whoever owns the room
      row({ id: 'm6', root: 'r6', text: 'they ask for raw error counts before the recommendation', role: 'assistant', room: ROOM_A }),
    ],
    slot: SLOT, formationContext: ROOM_A,
    subjectPersonId: PERSON_A,        // ⭐ the claim is about person A…
    roomOwnerPersonId: PERSON_B,      // ⭐ …in person B's room. SEPARATE AXES.
  })
  check('RP11 · ⭐⭐⭐ a THIRD PARTY speaking in a room that is not the subject\'s is REFUSED, '
    + '⛔ not silently classed `primary`',
    divergent.refused.some((r) => r.messageId === 'm5' && r.refusal === REFUSAL.unclassifiable),
    JSON.stringify(divergent.refused))
  check('RP11 · ⭐⭐ …while SOTERA\'S observation is still admitted as `secondary` — her authorship does '
    + 'not depend on whose room it is',
    divergent.candidates.length === 1 && divergent.candidates[0].provenance === CANDIDATE_PROVENANCE.secondary)
  // ⭐ The refusal must NAME the divergence, so a reader learns WHY rather than that something failed.
  const m5why = divergent.refused.find((r) => r.messageId === 'm5')?.why ?? ''
  check('RP11 · ⭐⭐⭐ ⇒ formation context did NOT become the subject boundary: the divergent case is '
    + 'answered by REFUSING, and the refusal NAMES the divergence',
    /is not the subject/.test(m5why) && /neither primary nor secondary/.test(m5why), m5why)
  // ⛔ AND THE HOST MUST NOT DEFAULT ONE AXIS TO THE OTHER.
  const hostSrc = readFileSync(new URL('../../Backend/app/components/dreaming-candidate-host.js', import.meta.url), 'utf8')
  check('RP11 · ⛔⛔ the resolver never defaults `subjectPersonId` to the room owner',
    !/subjectPersonId[^\n]*\?\?[^\n]*roomOwner/i.test(hostSrc)
    && !/subject_person_id[^\n]*\?\?[^\n]*person_id/i.test(hostSrc))
  // ⭐ …proven behaviourally too: a live slot with no subject keeps NULL rather than borrowing one.
  const noSubject = await query(
    `SELECT t.attribute FROM ${S}.txn_memories t JOIN ${S}.txn_messages m ON m.id = t.source_message_id
      WHERE t.subject_person_id IS NULL AND t.entity = 'user' LIMIT 1`)
  if (noSubject.rows.length) {
    const r2 = await resolveFormationContext({ query, schema: devSchema(), attribute: noSubject.rows[0].attribute })
    check('RP11 · ⭐⭐ a live slot with NO subject resolves with `subjectPersonId` NULL — ⛔ never borrowed '
      + 'from the room', r2 !== null && r2.subjectPersonId === null && Boolean(r2.formationContext),
      `subject=${r2?.subjectPersonId} context=${r2?.formationContext?.slice(0, 8)}`)
  } else {
    check('RP11 · ⓘ no subject-less live slot available to exercise the behavioural half', true,
      'every live entity=user slot carries a subject')
  }

  // ══ RP14 · ⚠️ THE RESIDUAL, PINNED GREEN ON PURPOSE ═══════════════════════════════════════════
  // ⭐ A definition-shaped claim, grounded in meta-discussion, STILL passes M2-8. That is not a bug in
  // M2-8 — it verifies GROUNDING, ⛔ not aboutness — and M2-6 does not close it. ⛔ Asserted so it can
  // never be mistaken for fixed by a later reader seeing a green suite.
  const metaBuckets = [
    { root: 'r7', turns: [{ excerpt: 'I could store your review order as a durable preference.' }] },
    { root: 'r8', turns: [{ excerpt: 'Whatever review order gets recorded, the system can reuse it.' }] },
  ]
  const metaVerified = verifyCitations({
    cites: [{ root: 'r7', span: 'a durable preference' }, { root: 'r8', span: 'the system can reuse it' }],
    buckets: metaBuckets,
  })
  check('RP14 · ⚠️⚠️ A DEFINITION-SHAPED CLAIM STILL PASSES M2-8 — the KNOWN residual, ⛔ not fixed here',
    metaVerified.ok === true && metaVerified.verifiedRoots === 2,
    'M2-8 verifies grounding, ⛔ never aboutness — closing this is a different lever')
  // ⛔ And M2-6 must not have quietly become an aboutness detector to make that look better.
  check('RP14 · ⛔⛔ M2-6 did NOT become an aboutness detector — the meta turns are admitted as candidates',
    selectCandidates({
      rows: [
        row({ id: 'm7', root: 'r7', text: 'I could store your review order as a durable preference.', role: 'assistant', room: ROOM_A }),
        row({ id: 'm8', root: 'r8', text: 'Whatever review order gets recorded, the system can reuse it.', role: 'assistant', room: ROOM_A }),
      ],
      slot: SLOT, formationContext: ROOM_A, subjectPersonId: PERSON_A, roomOwnerPersonId: PERSON_A,
    }).candidates.length === 2)

  // ⛔ AND THE STANDING BOUNDARIES.
  // ⚠️ THIS ASSERTION WAS WRONG ON ITS FIRST RUN, and in a way this project has now paid for twice.
  // It read `persona IS NOT NULL` and expected 0 — but the store legitimately holds TWO persona values
  // (`null` × 88 and `sotera` × 37), so it accused 37 perfectly correct rows. ⛔ I asserted THE ANSWER
  // ("no non-null persona exists") when the invariant is a STATE ("no 12c isolation fixture is resident").
  // ⭐ Named rather than quietly corrected — same shape as the empty-turn E2 transposition.
  const { rows: live } = await query(
    `SELECT count(*) FILTER (WHERE persona LIKE 'zz_%')::int AS residue,
            count(DISTINCT coalesce(persona,'(null)'))::int AS distinct_personas
       FROM ${S}.txn_memories`)
  check('⛔ no 12c isolation fixture is resident — ⛔ NOT "no non-null persona exists"',
    live[0].residue === 0, `${live[0].residue} zz_ row(s), ${live[0].distinct_personas} persona value(s) in the store`)
  const { rows: warr } = await query(`SELECT count(*)::int AS n FROM ${S}.log_memory_warrants`)
  check('⛔ M2 has written no warrant', warr[0].n === 0, `${warr[0].n} warrant(s)`)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  await pg.end()
  done()
}
