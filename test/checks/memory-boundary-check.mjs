// ⭐⭐⭐ THE OWNERSHIP BOUNDARY — five refusals, proved on the ACTUAL measured failures.
//
//   node test/checks/memory-boundary-check.mjs
//
// Ote, 2026-08-26: *"implement and test the refusal boundary, using the actual measured failure cases as
// fixtures… The goal isn't to make the current system understand everything. It's to make it know what
// it does not own instead of corrupting the meaning to fit the storage it happens to have."*
//
// ⛔ EVERY FIXTURE BELOW IS A REAL SENTENCE FROM THE LIVE STORE, not an invention: the Rome turn, the
// Cogito relay, the uncle designation. A boundary tested on sentences I wrote to pass it would prove
// nothing about the failures it exists for.
//
// ⛔ Writes go to agent_dev's room and are removed. ⛔ No historical row is read for classification,
// modified, or reconciled. Rome, the lineage rows and the quarantined identity rows are untouched.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import {
  admissibleToSlot, unevaluated, quotedRegions, onlyInsideQuotes,
  REFUSAL, DESTINATION, IT_MUST_KNOW_WHAT_IT_DOES_NOT_OWN,
} from '../../Backend/app/components/memory-ownership-boundary.js'
import { describeRefusal } from '../../Backend/app/components/memory-refusal-record.js'
import { ROLE, EVIDENCE, frameFor, mayAttachName, FRAME_COVERAGE } from '../../Backend/app/components/memory-speaker-frame.js'

const { check, done } = makeChecker('memory-boundary')
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows

// ── 0 · THE REAL SENTENCES, PULLED FROM THE LIVE STORE ───────────────────────────────────────────
// ⚠️ ANCHOR ASSERTED FIRST. A fixture loader that silently finds nothing turns every assertion below
// into a triumphant pass over an empty set — this project has four recorded instances of exactly that.
const src = async (idPrefix) => (await q(
  `select msg.content c from ${S}.txn_memories m
     join ${S}.txn_messages msg on msg.id = m.source_message_id
    where m.id::text like $1`, [`${idPrefix}%`]))[0]?.c ?? null

const ROME = await src('7d383ce3')      // "yeah, i kinda want to build rome in one day so…"
const UNCLE = await src('676e17b9')     // "claude will be kinda your uncle to you…"
const COGITO = await src('49111883')    // 'here he come. "Hi, Sotera. I\'m Cogito. I\'m your uncle."'
ok(!!ROME && !!UNCLE && !!COGITO,
  '0 · ⛔ ANCHOR: all three live source sentences were found — an empty fixture set is not a pass',
  `rome=${!!ROME} uncle=${!!UNCLE} cogito=${!!COGITO}`)

// ── 1 · REFUSAL · INTENTION AS A PROPERTY ────────────────────────────────────────────────────────
// ⭐ THE ROME ROW, EXACTLY AS IT IS STORED.
const romeRow = { entity: 'user', attribute: 'current goal', value: 'build Rome in one day', content: "user's current goal: build Rome in one day" }
const rIntent = admissibleToSlot(romeRow, { target: 'intention', sourceText: ROME })
ok(rIntent?.class === REFUSAL.intention, '1 · ⭐⭐⭐ an INTENTION is refused a fact slot — the Rome row, verbatim', rIntent?.class ?? 'ADMITTED')
ok(rIntent?.belongsTo === 'txn_intentions' && rIntent?.destinationExists === true,
  '1 · ⭐⭐ …and it names a destination that ACTUALLY EXISTS', `${rIntent?.belongsTo} exists=${rIntent?.destinationExists}`)
// ⭐ The honesty requirement: "exists" must not be read as "it went there".
ok(/no routing path/i.test(rIntent?.destinationNote ?? ''),
  '1 · ⭐⭐⭐ …and says extraction cannot REACH it — ⛔ "exists" is not "arrived"', rIntent?.destinationNote ?? '')
ok(rIntent?.retain?.as === 'prose' && rIntent?.retain?.keepEvidence === true,
  '1 · ⭐ …and the material is RETAINED — a refusal is not a deletion')

// ── 2 · REFUSAL · RELATIONSHIP AS A PROPERTY ─────────────────────────────────────────────────────
const uncleRow = { entity: 'user', attribute: 'soteras_family_lineage', value: 'Claude (Uncle)', content: 'Claude will be her uncle' }
const rRel = admissibleToSlot(uncleRow, { target: 'relationship', sourceText: UNCLE })
ok(rRel?.class === REFUSAL.relationship, '2 · ⭐⭐⭐ a RELATIONSHIP is refused a fact slot — the family-lineage shape', rRel?.class ?? 'ADMITTED')
// ⭐⭐ THE HONESTY THAT MATTERS MOST HERE: no store exists, and the refusal says so rather than naming a
// plausible-sounding table. ⛔ `txn_relational_records` is NOT this and must never be named as if it were.
ok(rRel?.belongsTo === null && rRel?.destinationExists === false,
  '2 · ⭐⭐⭐ …and it does NOT pretend a destination exists — belongsTo is null, exists is false',
  `belongsTo=${rRel?.belongsTo} exists=${rRel?.destinationExists}`)
ok(/do NOT invent an attribute/i.test(rRel?.retain?.note ?? ''),
  '2 · ⛔ …and it forbids inventing an attribute name for the link', rRel?.retain?.note ?? '')
ok(DESTINATION.relationshipStore.exists === false && DESTINATION.relationshipStore.name === null,
  '2 · ⛔⛔ the relationship destination is declared ABSENT in the vocabulary itself — OteRM is not being built')

// ── 3 · REFUSAL · DESIGNATION WITHOUT AN ESTABLISHED SUBJECT ─────────────────────────────────────
const nameRow = { entity: 'user', attribute: 'preferred_name', value: 'Cogito', content: "user's preferred_name: Cogito" }
const rDesig = admissibleToSlot(nameRow, { subjectEstablished: false })
ok(rDesig?.class === REFUSAL.designation, '3 · ⭐⭐ a NAME is refused when the naming subject is not established', rDesig?.class ?? 'ADMITTED')
// ⛔ AND `null` IS NOT `false`. "Nobody asked" and "we checked and do not know" are different facts, and
// collapsing them would refuse every write that predates the question.
ok(admissibleToSlot(nameRow, { subjectEstablished: null }) === null,
  '3 · ⛔ …but an UNASKED subject does not refuse — null ≠ false, or every legacy writer breaks')
ok(admissibleToSlot(nameRow, { subjectEstablished: true }) === null,
  '3 · ⭐ …and an established subject is admitted, so ordinary naming still works')

// ── 4 · REFUSAL · RELAYED SPEECH ─────────────────────────────────────────────────────────────────
// ⭐⭐⭐ THE COGITO CASE, ON THE REAL MESSAGE. Structural and deterministic — no model, no axis needed.
const rRelay = admissibleToSlot({ ...nameRow }, { sourceText: COGITO })
ok(rRelay?.class === REFUSAL.relayedSpeech,
  '4 · ⭐⭐⭐ a name found ONLY inside quoted speech is refused — the Cogito relay, on the real message',
  rRelay?.class ?? 'ADMITTED')
ok(/speaker of a quotation is not the author/i.test(rRelay?.why ?? ''),
  '4 · ⭐ …and it says WHY in words a human can act on', String(rRelay?.why ?? '').slice(0, 70))
// ⛔ THE OVER-TRIGGERING CONTROL, and it is the one that matters most: a person naming themselves in
// their own prose must still be captured. My first detector counted apostrophes as quotes and
// MANUFACTURED relays out of "i'm Kavi — i do a lot of…".
const ownProse = "hi. first time talking to you. i'm Kavi — i do a lot of late-night debugging."
ok(admissibleToSlot({ entity: 'user', attribute: 'preferred_name', value: 'Kavi', content: 'x' }, { sourceText: ownProse }) === null,
  '4 · ⭐⭐ …and a self-naming in ORDINARY PROSE is still admitted — ⛔ apostrophes are not quotation marks')
ok(quotedRegions(ownProse).length === 0, '4 · ⛔ …proved at the detector: no quoted region in that sentence', `${quotedRegions(ownProse).length}`)
ok(quotedRegions(COGITO).length > 0, '4 · ⭐ …and the real relay does have one', `${quotedRegions(COGITO).length}`)
// ⭐ A name quoted AND said outside the quote is the speaker's own — refusing it would be over-reach.
ok(onlyInsideQuotes('Ote', 'call me Ote. I said "call me Ote" earlier too.') === false,
  '4 · ⭐ …and a name said BOTH inside and outside a quotation is still the speaker\'s')

// ── 5 · REFUSAL · FIGURATIVE AS A LITERAL PROPERTY ───────────────────────────────────────────────
const rFig = admissibleToSlot({ ...romeRow, modality: 'figurative' }, { sourceText: ROME })
ok(rFig?.class === REFUSAL.figurative, '5 · ⭐⭐ a FIGURATIVE statement is refused a literal property', rFig?.class ?? 'ADMITTED')
ok(rFig?.retain?.as === 'prose', '5 · ⭐⭐⭐ …and it is RETAINED, not discarded — Ote\'s explicit requirement')
ok(admissibleToSlot({ ...romeRow, modality: 'asserted' }, { sourceText: ROME }) === null,
  '5 · ⭐ …and an ASSERTED statement still reaches the slot — the boundary is not a blanket')
// ⛔ AND PROSE IS ALWAYS ADMISSIBLE. The figurative material has somewhere to go, always.
ok(admissibleToSlot({ content: 'Ote calls me his Rome.', modality: 'figurative' }, {}) === null,
  '5 · ⭐⭐ …and the same modality AS PROSE is admitted — what is refused is the SHAPE, never the material')

// ── 6 · SILENCE IS NOT APPROVAL ──────────────────────────────────────────────────────────────────
// ⭐ Three of the five need an axis no producer sets in production. The boundary must not let "not
// refused" read as "examined and fine" — that ambiguity is the one this project has paid for three times.
const un = unevaluated({})
ok(un.length === 3, '6 · ⭐⭐ the boundary REPORTS what it could not evaluate — ⛔ silence is not approval', un.join(' · '))
ok(unevaluated({ target: 'property', sourceText: 'x', subjectEstablished: true }).length === 0,
  '6 · ⭐ …and reports nothing missing when everything was declared')

// ── 7 · THE FOUR-WAY IDENTITY FRAME, EXPLICIT RATHER THAN GUESSED ────────────────────────────────
// Ote: *"Don't try to solve all four inside captureIdentity by another heuristic. Make the missing
// speaker/subject information explicit… and show me what evidence is available to establish each one."*
ok(Object.keys(ROLE).length === 4, '7 · ⭐ four roles are named apart', Object.values(ROLE).join(' · '))
ok(FRAME_COVERAGE.absent.length === 2 && FRAME_COVERAGE.absent.includes(ROLE.speakerIdentity) && FRAME_COVERAGE.absent.includes(ROLE.namingSubject),
  '7 · ⭐⭐⭐ exactly TWO are ABSENT from the schema — speakerIdentity and namingSubject',
  FRAME_COVERAGE.absent.join(' · '))
ok(EVIDENCE[ROLE.roomOwner].establishable === 'recorded' && EVIDENCE[ROLE.messageAuthor].establishable === 'derivable',
  '7 · ⭐ …and the two that ARE available say how they are obtained',
  `${EVIDENCE[ROLE.roomOwner].from} | ${EVIDENCE[ROLE.messageAuthor].from}`)
// ⛔ THE GUESS THAT MUST NOT HAPPEN: an established room owner must not become the naming subject.
const frame = frameFor({ roomOwnerId: 'a-real-room-owner', messageAuthorId: 'a-real-room-owner', role: 'user' })
ok(frame[ROLE.roomOwner].status === 'established' && frame[ROLE.namingSubject].status === 'unknown',
  '7 · ⭐⭐⭐ a known room owner does NOT become the naming subject — that derivation IS the bug')
const attach = mayAttachName(frame)
ok(attach.ok === false && Array.isArray(attach.needs) && attach.needs.length > 0,
  '7 · ⭐⭐ …and the refusal NAMES WHAT IT WOULD NEED — a specification, not a complaint', `${attach.needs.length} candidate(s)`)
// ⛔ AND IT IS NOT WIRED INTO CAPTURE. Wiring it would stop identity capture everywhere, since the
// subject is unknown on every turn today — a behaviour change Ote has not approved.
const idHost = readFileSync(new URL('../../Backend/app/components/memory-identity-host.js', import.meta.url), 'utf8')
ok(!/mayAttachName/.test(idHost),
  '7 · ⛔ the frame is NOT wired into captureIdentity — it would refuse every turn, and that is not approved')

// ── 8 · THE REFUSAL IS RECORDED, AND THE RECORD IS HONEST ────────────────────────────────────────
const t = await q(
  `select column_name from information_schema.columns
    where table_schema = $1 and table_name = 'log_memory_refusals'
      and column_name in ('destination_exists','proposed_content','why','belongs_to','retain_as')`, [S])
ok(t.length === 5, '8 · ⭐ migration 032 carries why · where · exists · material · retention', t.map((r) => r.column_name).sort().join(' '))
const [{ n: fk }] = await q(
  `select count(*)::int n from information_schema.table_constraints
    where table_schema = $1 and table_name = 'log_memory_refusals' and constraint_type = 'FOREIGN KEY'`, [S])
ok(fk === 0, '8 · ⛔ no foreign keys — the evidence outlives the room it came from', `${fk}`)
// ⭐ The sentence a human reads must carry the destination's REAL status.
// ⚠️ MY FIRST VERSION OF THIS ASSERTION MATCHED A PHRASE I HAPPENED TO WRITE (`"does not exist yet"`)
// and went red against a sentence that is perfectly honest: *"nothing owns this kind of material yet"*.
// ⛔ The code was right and the test was checking my prose. ⭐ It now tests the PROPERTY — the sentence
// must never imply the material ARRIVED somewhere — which is what actually matters.
const relSentence = describeRefusal(rRel) ?? ''
ok(/nothing owns|does not exist/i.test(relSentence) && !/belongs in \w/.test(relSentence),
  '8 · ⭐⭐ describeRefusal never implies a missing destination received the material',
  relSentence.slice(-70))
ok(/txn_intentions/.test(describeRefusal(rIntent) ?? '') && /no routing path/i.test(describeRefusal(rIntent) ?? ''),
  '8 · ⭐ …and an existing-but-unreachable destination says both halves')

// ── 9 · THE STORE ENFORCES IT, AND THE INPUTS NEVER REACH THE TABLE ──────────────────────────────
const storeSrc = readFileSync(new URL('../../Backend/app/components/memory-store-sequelize-host.js', import.meta.url), 'utf8')
const storeCode = storeSrc.replace(/^\s*\/\/[^\n]*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
ok(/txn_memories\.create|admissibleToSlot/.test(storeCode), '9 · ⛔ ANCHOR: the scan can still see the store\'s write path')
ok(/admissibleToSlot\(/.test(storeCode), '9 · ⭐⭐ the store CALLS the boundary — a predicate nobody calls is not a boundary')
ok(/recordRefusal\(/.test(storeCode), '9 · ⭐ …and records every refusal')
// ⚠️ THE TRANSPORT FIELDS MUST BE STRIPPED. They are how a producer DECLARES what it knows; none is a
// column. Letting them through would be silently dropped by the ORM — the `subject_person_id` failure,
// which cost seven memories their subject with no error at all.
ok(/semanticTarget: _st|semanticTarget:\s*_/.test(storeCode),
  '9 · ⭐⭐ …and the boundary\'s inputs are stripped before the INSERT — they are transport, not columns')

ok(IT_MUST_KNOW_WHAT_IT_DOES_NOT_OWN.includes('ACCUMULATE'),
  '⭐ the stated intent names the one test that generates all five refusals')

await pg.end()
done()
