// R4 · THREE ROLES A NAME CAN PLAY, AND THE BLOCK USED TO RENDER ALL THREE THE SAME WAY.
//
// ⭐⭐⭐ THE MEASURED FAILURE. Asked ABOUT Hermes in root's room (R4, 2026-08-21) she addressed the user AS
// Hermes: *"your name preference (Hermes)… now that I'm in the right room with access to your memories."*
//
// ⛔ AND THE FIRST DIAGNOSIS WAS WRONG, WHICH IS WHY THIS FILE EXISTS. The obvious reading — "a memory about
// Hermes leaked into root's room" — is **refuted on the data**: all five Hermes memories live in Hermes' own
// rooms and the semantic arm is built with `{ userId }`, so in root's room it cannot return them at all.
//
// ⇒ READING THE REAL BLOCK ROOT RECEIVES SHOWED THE ACTUAL MECHANISM, AND IT IS OURS:
//     I said: ตรงไปตรงมาเลย Hermes: สิ่งที่ผมให้…        ← said TO Hermes
//     Ote said: …what can you tell me about Hermes?      ← said BY Ote
//     I remember saying, 23 August, … your name preference (Hermes)  ← said TO the current account
// **Every quotation was rendered with no addressee, and the current interlocutor was never named at all.**
// A dangling "you" resolves, for any reader, to whoever they are talking to now.
//
// ⭐ Ote: *"We need to separate conversation participant, memory subject, and current interlocutor much more
// explicitly."* ⇒ three roles, three renderings, and ⛔ none of them inferred:
//     INTERLOCUTOR  the session's own account, resolved by id
//     PARTICIPANT   `ep.who`, the person whose conversation the episode was
//     SUBJECT       `txn_memories.subject_person_id`, the row's own answer

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import {
  AVAILABILITY, BASIS, RETENTION, SOURCE,
} from '../../Backend/app/components/memory-cognition-axes.js'
import { OWNER } from '../../Backend/app/components/memory-ownership.js'
import { TIME_BOUND } from '../../Backend/app/components/memory-cognition-timeframe.js'

const { renderFor } = buildMemoryCognition(null, {})
const cues = { persons: ['Hermes'], topics: [], recency: null, technical: false, unsegmented: [], scripts: ['latin'], raw: 'How is Hermes doing?' }

const episode = (id, over = {}) => ({
  id, kind: 'episode', who: 'Hermes', withThem: true,
  source: SOURCE.ownUtterance, basis: BASIS.attestedBySource,
  availability: AVAILABILITY.recalled, retention: RETENTION.notRetained,
  confidence: 0.9, when: '2026-08-18T10:00:00Z',
  exchanges: [{ who: 'me', said: 'What I gave you was a clean space.', when: '2026-08-18T10:00:00Z' }],
  ...over,
})

// ── ⭐⭐⭐ ROLE 1 · THE INTERLOCUTOR, NAMED BEFORE ANYBODY IS QUOTED ────────────────────────────────
test('⭐⭐⭐ the block names who she is speaking with, first', () => {
  const out = renderFor([episode('ep:1')], { cues, speakingWith: 'Ote' })
  const lines = out.text.split('\n')
  assert.equal(lines[0], "I'm talking with Ote right now.")
  assert.ok(lines[0].indexOf('Ote') < out.text.indexOf('Hermes'),
    'the person asking must be named before any other name appears')
})

test('⛔ no interlocutor known ⇒ NO anchor sentence — a guessed one is worse than a missing one', () => {
  const out = renderFor([episode('ep:1')], { cues })
  assert.ok(!/I'm talking with/.test(out.text))
  assert.match(out.text.split('\n')[0], /^Right now I/, 'the present tense still leads')
})

test('⛔⛔ THE ANCHOR IS NOT A FINDING — it must not answer "did this run find anything?"', () => {
  // ⚠️⚠️ THIS BUG WAS WRITTEN AND THEN CAUGHT BY THE LIVE CHECK. Pushing the anchor into `lines` made
  // `lines.length` truthy, so the empty-result branch stopped firing and the absence sentence silently
  // disappeared — a run that found nothing would have rendered as a run that found one thing.
  const empty = renderFor([], { cues, speakingWith: 'Ote' })
  assert.match(empty.text, /I'm talking with Ote right now\./)
  assert.match(empty.text, /I went looking for what I have about Hermes and came up with nothing\./,
    'the absence must survive the anchor')
})

// ── ⭐⭐ ROLE 2 · THE PARTICIPANT — WHO SHE WAS SPEAKING TO, PER QUOTATION ─────────────────────────
test('⭐⭐⭐ every quoted line carries its addressee, so no "you" is dangling', () => {
  const out = renderFor([
    episode('ep:1', { who: 'Hermes' }),
    episode('ep:2', {
      who: 'Ote', withThem: false, when: '2026-08-21T09:00:00Z',
      exchanges: [
        { who: 'Ote', said: 'What can you tell me about Hermes?', when: '2026-08-21T09:00:00Z' },
        { who: 'me', said: 'Let me look.', when: '2026-08-21T09:01:00Z' },
      ],
    }),
  ], { cues, speakingWith: 'Ote' })
  // ⭐ The same sentence shape, two different addressees — which is exactly what was missing.
  assert.match(out.text, /I said to Hermes: What I gave you was a clean space\./)
  assert.match(out.text, /I said to Ote: Let me look\./)
  // ⭐ And his line is marked as directed AT her, not merely floating in the block.
  assert.match(out.text, /Ote said to me: What can you tell me about Hermes\?/)
  assert.ok(!/^\s*I said: /m.test(out.text), 'no bare, unaddressed quotation survives when a participant is known')
})

test('⛔ an unresolved participant produces NO addressee rather than a guessed one', () => {
  const out = renderFor([episode('ep:1', { who: 'someone' })], { cues, speakingWith: 'Ote' })
  assert.match(out.text, /I said: What I gave you was a clean space\./,
    "'someone' is not a name and must not be rendered as one")
  assert.ok(!/I said to someone/.test(out.text))
})

test('⭐ §3B and R4 compose in one prefix — dated AND addressed', () => {
  const out = renderFor([episode('ep:9', {
    who: 'Ote', withThem: false, when: '2026-08-21T09:00:00Z',
    exchanges: [{
      who: 'me', said: "From this room, I don't have any direct memories about Hermes.",
      when: '2026-08-21T09:00:00Z', timeBound: TIME_BOUND.knowledge,
    }],
  })], { cues, speakingWith: 'Ote' })
  assert.match(out.text, /On 21 August I said to Ote: From this room, I don't have any direct memories about Hermes\./)
})

// ── ⭐⭐ ROLE 3 · THE SUBJECT — WHAT A STORED MEMORY IS **ABOUT** ──────────────────────────────────
const stored = (over = {}) => ({
  id: 'mem:1', said: "user's preferred_name: Hermes", who: null, when: '2026-08-19T10:00:00Z',
  source: SOURCE.storedMemory, owner: OWNER.account, basis: BASIS.told,
  availability: AVAILABILITY.recalled, retention: RETENTION.given, confidence: 0.7,
  provenanceAccountId: null, subjectPerson: null, ...over,
})

test('⭐⭐⭐ a memory about SOMEBODY ELSE says so — this is the "user\'s" ambiguity closed', () => {
  const out = renderFor([stored({ subjectPerson: 'Hermes' })], { cues, speakingWith: 'Ote' })
  // ⚠️ Rendered bare, "user's preferred_name: Hermes" attaches its "user" to whoever reads it. That is R4.
  assert.match(out.text, /I have this on file about Hermes: user's preferred_name: Hermes/)
})

test('⭐⭐ …and the ORDINARY case stays silent, because hedging on it is its own dishonesty', () => {
  // ⚠️ MY FIRST VERSION ANNOUNCED "it does not say who this is about" whenever `subject_person_id` was NULL —
  // which is most rows, because the column is recent. ⇒ it would have hedged on facts that genuinely are
  // about the person she is talking to.
  // ⭐ The load-bearing fact: the semantic arm is built with `{ userId }`, so a row it returns was recorded
  // in THIS person's room — which is who the extraction meant by "user's".
  const out = renderFor([stored({ subjectPerson: null })], { cues, speakingWith: 'Ote' })
  assert.match(out.text, /I have this on file: user's preferred_name: Hermes/)
  assert.ok(!/does not say who/.test(out.text))
  // ⭐ And a subject that IS the interlocutor is likewise not announced — "about you" adds nothing.
  const mine = renderFor([stored({ subjectPerson: 'Ote' })], { cues, speakingWith: 'Ote' })
  assert.match(mine.text, /I have this on file: /)
})

test('⛔⛔ …but a row from ANOTHER account is never silently defaulted to the interlocutor', () => {
  // ⭐ THE GUARD ON THE ASSUMPTION, not trust in it. If the semantic arm is ever widened past this account,
  // the silence above would become a false claim about whoever is reading. So it is conditioned on
  // provenance rather than assumed.
  const out = renderFor([stored({ provenanceAccountId: 'someone-elses-account', subjectPerson: null })],
    { cues, speakingWith: 'Ote' })
  assert.match(out.text, /about someone I cannot name from this/)
})

test('⭐ the subject clause does not displace the basis or retention phrasing', () => {
  const kept = renderFor([stored({ subjectPerson: 'Hermes', retention: RETENTION.retained })], { cues, speakingWith: 'Ote' })
  assert.match(kept.text, /I decided to keep this about Hermes: /)
  const inferred = renderFor([stored({ subjectPerson: 'Hermes', basis: BASIS.inferred })], { cues, speakingWith: 'Ote' })
  assert.match(inferred.text, /I worked this out about Hermes rather than being told it: /)
  const synth = renderFor([stored({ subjectPerson: 'Hermes', basis: BASIS.synthesized })], { cues, speakingWith: 'Ote' })
  assert.match(synth.text, /Several things point this way about Hermes, though nothing says it outright: /)
})

// ── ⛔ AND NONE OF THE THREE IS INFERRED ──────────────────────────────────────────────────────────
const HOST_RAW = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
const HOST = HOST_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')

test('⛔⛔ the interlocutor is resolved BY ID, never from a name found in retrieved material', () => {
  // ⚠️ BOUNDED BY TWO **CODE** MARKERS, and the first attempt got this wrong: the end marker was a comment
  // banner, which the comment-stripping above removes, so `indexOf` returned -1, the slice ran to the end of
  // the file, and the assertion failed against the whole host. ⛔ A source-scan boundary that only exists in
  // a comment cannot bound a scan of code.
  const start = HOST.indexOf('async function interlocutor()')
  const end = HOST.indexOf('async function activateWorkingSet')
  assert.ok(start > 0 && end > start, 'both boundaries must be real code — otherwise this scan is vacuous')
  const fn = HOST.slice(start, end)
  assert.ok(/where: \{ id: userId \}/.test(fn),
    'identity must be established from the session, not inferred from a value')
  // ⚠️ This project's most-repeated defect is identity inferred from the SHAPE of a value. ⛔ Nothing in the
  // resolver may read a cue, an item, a memory or a message.
  assert.ok(!/cues|items|kept|content|said|subjectPerson/.test(fn),
    'the resolver must not look at retrieved material at all')
})

test('⛔ the memory subject comes from the ROW, never from the cue or the room', () => {
  assert.ok(/subject_person_id/.test(HOST), 'the row\'s own subject must actually be read')
  assert.ok(/subjectPerson: subjectOf\.get\(String\(m\.id\)\) \?\? null/.test(HOST),
    'and it must be null when the row has none — never defaulted')
  // ⭐ `cueSubject` is OUR cue and is deliberately named so no future reader mistakes it for aboutness.
  assert.ok(/cueSubject:/.test(HOST) && !/^\s*subject:/m.test(HOST),
    'the ambiguous `subject` field is gone; the cue is named `cueSubject`')
})
