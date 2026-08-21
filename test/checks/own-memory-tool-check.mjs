// OWN MEMORY TOOL — a memory tool, not a database tool.
//
//   node checks/own-memory-tool-check.mjs
//
// ⭐ THE BOUNDARY IS THE ABSENCE OF PARAMETERS, and most of these assertions are checking that the
// absence really is absent — that nothing crept in that would let the tool be pointed at a third party,
// iterate people, or reach a conversation.
//
// Read-only. Writes nothing; the real Kavi record must survive untouched.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildOwnMemory, initOwnMemory } from '../../Backend/app/components/own-memory-host.js'
// ⭐ The READER path. See K2: asserting the host alone cannot tell a dropped projection from an
// unregistered service, and both look like "the field is missing".
import { buildToolContext, runTool } from '../../Backend/app/components/runtime.js'
import { readFileSync } from 'node:fs'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)

const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))
const persons = Object.fromEntries((await Q('SELECT id::text, display_name FROM persona_sotera.mst_persons')).map((p) => [p.display_name, p.id]))
const fastify = { db, config, log: null }

// ── T1 · the tool takes NO arguments ─────────────────────────────────────────────────────────────
const toolSrc = readFileSync(new URL('../../../../PortableComponents/Tools/OwnMemory/index.js', import.meta.url), 'utf8')
ok(/properties:\s*\{\s*\}/.test(toolSrc), 'T1 · ⭐ the tool declares NO parameters', 'no subject, no query, no id — the boundary is the absence')
ok(/required:\s*\[\s*\]/.test(toolSrc) && /additionalProperties:\s*false/.test(toolSrc),
  'T1 · …and additionalProperties is false, so nothing can be smuggled in')
for (const forbidden of ['personId', 'person_id', 'subject', 'userId', 'query', 'name', 'limit']) {
  ok(!new RegExp(`properties:[^}]*${forbidden}`, 's').test(toolSrc), `T1 · no \`${forbidden}\` parameter exists`)
}

// ── T2 · what it returns for a person WITH a stored stance ───────────────────────────────────────
const svcKavi = buildOwnMemory(fastify, { userId: users.kavi })
const kavi = await svcKavi.recall()
ok(kavi.withThisPerson.count >= 1, 'T2 · ⭐ Kavi\'s own-memory recall finds her stored stance',
  `${kavi.withThisPerson.count} item(s) — ${kavi.withThisPerson.items.map((i) => i.statement).join('; ')}`)
ok(kavi.withThisPerson.items.every((i) => typeof i.statement === 'string' && i.statement.length > 0),
  'T2 · each item carries the fixed statement, not a raw label')
ok(kavi.provenance?.whatTheseAre && kavi.provenance?.whatTheseAreNot,
  'T2 · ⭐ provenance ships WITH the answer — the failure this exists to fix was her not knowing the source')
ok(/NOT things this person told you/i.test(kavi.provenance.whatTheseAreNot),
  'T2 · …and it says explicitly that these are not things the person told her')

// ── T3 · ⭐ NOTHING that could become a database handle or a leak ─────────────────────────────────
const flat = JSON.stringify(kavi)
for (const forbidden of ['subject_person_id', 'subjectPersonId', 'message_id', 'memory_id', 'conversation_id', 'embedding', 'content', 'deriver_version', 'subject_person']) {
  ok(!flat.includes(forbidden), `T3 · ⭐ the payload contains no ${forbidden}`)
}
ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(flat),
  'T3 · ⭐ no UUID of any kind is returned — an id is a handle, and a handle is the start of a database tool')

// ── T4 · it is bound to the CURRENT person, and cannot be redirected ─────────────────────────────
const svcMina = buildOwnMemory(fastify, { userId: users.mina })
const mina = await svcMina.recall()
ok(mina.withThisPerson.person === 'Mina', 'T4 · built for Mina, it describes Mina', `${mina.withThisPerson.person}`)
ok(mina.withThisPerson.count === 0, 'T4 · ⭐ Mina\'s recall does NOT show Kavi\'s stance', `${mina.withThisPerson.count} items`)
ok(!JSON.stringify(mina).includes('Kavi'), 'T4 · ⭐ …and never names Kavi at all')
ok(svcMina.recall.length === 0, 'T4 · ⭐ `recall()` accepts no argument — the subject cannot be overridden at the call site')
ok(Object.keys(svcMina).sort().join(',') === 'note,recall,retract',
  'T4 · ⭐ the service exposes EXACTLY recall/note/retract — no search, no list, no lookup, no by-id', Object.keys(svcMina).join(', '))

// ── T5 · empty is reported as HER emptiness, not as a claim about anyone ─────────────────────────
ok(mina.aboutMyself.count === 0 && Array.isArray(mina.aboutMyself.items),
  'T5 · the persona-global slice is reported and is empty', 'true of HERSELF, not a negative claim about others')
ok(/have not stored anything of this kind yet/i.test(mina.provenance.ifEmpty),
  'T5 · ⭐ empty is framed as "I have not stored this", never as "that does not exist"')

// ── T6 · the host service never reads message or memory CONTENT of the other person ──────────────
const hostSrc = readFileSync(new URL('../../Backend/app/components/own-memory-host.js', import.meta.url), 'utf8')
const sql = hostSrc.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
ok(!/txn_messages/.test(sql), 'T6 · ⭐ it never touches txn_messages — no path to a conversation')
ok(!/txn_message_embeddings|embedding/.test(sql), 'T6 · ⭐ it never touches embeddings')
// It DOES read txn_memories, but only the persona-global identity slice, which is hers by definition.
ok(/user_id IS NULL AND kind = 'identity'/.test(sql),
  'T6 · its only txn_memories read is the PERSONA-GLOBAL identity slice — hers regardless of who is asking')
ok(!/user_id\s*=\s*:userId[\s\S]{0,80}txn_memories/.test(sql),
  'T6 · it never reads another account\'s scoped memories')


// ── T7 · T1/T2 — note and retract, and the auditable floor bypass ────────────────────────────────
// ⚠️ Uses a TRANSIENT label the real records do not hold, and removes it, so the two live records
// (i-verify-before-asserting, i-flag-uncertainty-explicitly) are never touched. Snapshot-verified below.
{
  const before = await Q(`SELECT label::text, origin::text FROM persona_sotera.txn_relational_records
                            ORDER BY label`)
  const svc = buildOwnMemory({ db, config, log: null }, { userId: users.kavi })
  const PROBE = 'i-show-my-working' // not among the live records

  // T1 · an unknown label is refused AND the vocabulary is returned
  const bad = await svc.note({ label: 'we-get-along' })
  ok(bad.ok === false && Array.isArray(bad.allowed) && bad.allowed.length > 0,
    'T7 · ⭐ note_own_practice refuses a label outside the closed vocabulary, and returns the set',
    bad.reason)
  ok(!(await svc.note({ label: 'be nice to kavi about the deploy' })).ok,
    'T7 · ⭐ free text cannot enter — it is not a label, so it is refused')

  // T1 · an instructed note lands IMMEDIATELY, below the frequency floor, and is LABELLED as such
  const noted = await svc.note({ label: PROBE })
  ok(noted.ok && noted.origin === 'instructed', 'T7 · ⭐ an instructed note is recorded immediately', JSON.stringify(noted))
  const [row] = await Q(`SELECT conversation_count, origin::text AS origin FROM persona_sotera.txn_relational_records
                           WHERE subject_person_id = :p AND label = :l::persona_sotera.relational_label`,
    { p: persons.Kavi, l: PROBE })
  ok(row && row.conversation_count === 1 && row.origin === 'instructed',
    'T7 · ⭐ …with support of 1 — BELOW the floor of 3 — and stamped `instructed` so the bypass is AUDITABLE',
    `n=${row?.conversation_count} origin=${row?.origin}`)

  // The recall surface tells her HOW she learned it, so she need not invent a cause
  const after = await svc.recall()
  const probeItem = after.withThisPerson.items.find((i) => i.practiceLabel === PROBE)
  ok(/told you about your practice directly/i.test(probeItem?.howLearned || ''),
    'T7 · ⭐ recall reports HOW it was learned — instructed vs inferred', probeItem?.howLearned)
  const inferred = after.withThisPerson.items.find((i) => i.practiceLabel !== PROBE)
  ok(/inferred it yourself/i.test(inferred?.howLearned || ''),
    'T7 · …and the observed ones still read as inferred', inferred?.howLearned)

  // T2 · retract removes exactly that one, and nothing else
  const ret = await svc.retract({ label: PROBE })
  ok(ret.ok && ret.retracted, 'T7 · ⭐ retract_own_practice removes her own observation', ret.retracted)
  const gone = await Q(`SELECT count(*)::int n FROM persona_sotera.txn_relational_records
                          WHERE subject_person_id = :p AND label = :l::persona_sotera.relational_label`,
    { p: persons.Kavi, l: PROBE })
  ok(gone[0].n === 0, 'T7 · …and it is actually gone')
  const twice = await svc.retract({ label: PROBE })
  ok(twice.ok && twice.retracted === null, 'T7 · retracting nothing is honest, not an error', twice.note)
  ok(!(await svc.retract({ label: 'not-a-label' })).ok, 'T7 · retract also refuses labels outside the vocabulary')

  // ⭐ THE REAL RECORDS ARE UNTOUCHED — the property two of my checks broke earlier today.
  const afterAll = await Q(`SELECT label::text, origin::text FROM persona_sotera.txn_relational_records
                              ORDER BY label`)
  ok(JSON.stringify(afterAll) === JSON.stringify(before),
    'T7 · ⭐ the live records are exactly as found — no deletion, no mutation',
    `${afterAll.length} rows: ${afterAll.map((r) => r.label).join(', ')}`)
}

// ── Q · ⭐⭐ THE SEARCHED-SET QUANTIFIER ON AN EMPTY OWN-MEMORY READ (2026-08-20) ──────────────────
// Measured that day: two hours after forming a lesson about exactly this confusion, asked *"do you keep
// any notes about how you work with me?"* she called ONLY this read, got two empty arrays, and answered
// **"No."** Flat. In the earlier conversation she had also called `list_memories` — which carries a
// coverage block — and said *"the emptiness might just be scoping, not absence."*
// ⇒ The payload decides what she says. Ote: *"the result should be able to distinguish 'nothing found in
// the population I searched' from 'nothing exists.'"*
{
  const own = buildOwnMemory(fastify, { userId: users.agent_dev })
  const r = await own.recall()
  ok(Boolean(r.coverage), 'Q · ⭐ an own-memory read carries a coverage block')
  ok(r.coverage?.aboutMyself?.matched === r.aboutMyself.count
     && r.coverage?.withThisPerson?.matched === r.withThisPerson.count,
    'Q · …and its counts agree with the payload', `${r.coverage?.aboutMyself?.matched}/${r.coverage?.withThisPerson?.matched}`)
  for (const k of ['aboutMyself', 'withThisPerson']) {
    ok(/IN THE SET THAT WAS SEARCHED/.test(r.coverage[k].whatTheNumberMeans),
      `Q · ⭐⭐ ${k}: the number is scoped to what was searched, so 0-here is not 0-anywhere`)
    ok(Array.isArray(r.coverage[k].didNotSearch) && r.coverage[k].didNotSearch.length > 0,
      `Q · ${k}: the axes NOT searched are named`)
  }
  // ⛔ THE HALF OTE REFUSED. Naming an axis is not counting along it: *"'notes for 1 other person' is
  // still an automatic existence signal across the person axis."*
  // ⛔ THE HALF OTE REFUSED. Naming an axis is not counting along it: *"'notes for 1 other person' is
  // still an automatic existence signal across the person axis."* The only numbers allowed are the
  // matched counts themselves — `matched`, and its restatement inside `whatTheNumberMeans`.
  const noCounts = JSON.stringify(r.coverage)
    .replace(/"matched":\s*\d+/g, '').replace(/"whatTheNumberMeans":"[^"]*"/g, '')
  ok(!/\d/.test(noCounts),
    'Q · ⭐⭐ NO count anywhere outside `matched` — the quantifier counts NOTHING beyond the search',
    noCounts.match(/\d[^,}]*/)?.[0] ?? 'none')
  // ⚠️ AND THE GRAIN MUST BE TRUE. The first version said "this room only" for a PERSON-keyed read,
  // which would have taught her the wrong grain — the one thing a quantifier exists to get right.
  ok(/keyed to the person/.test(r.coverage.withThisPerson.searched.rooms ?? ''),
    'Q · ⭐⭐ the practice read says it is PERSON-keyed, not room-scoped', r.coverage.withThisPerson.searched.rooms)
  ok(/not scoped|the same wherever you are/.test(r.coverage.aboutMyself.searched.rooms ?? ''),
    'Q · ⭐ …and her own identity notes are described as neither room- nor person-scoped', r.coverage.aboutMyself.searched.rooms)
}

// ── ⭐⭐⭐ K · WHAT SHE HERSELF DECIDED TO KEEP MUST BE VISIBLE TO HER OWN-MEMORY READ ─────────────
//
// ⚠️⚠️ THE HOLE THIS CLOSES WAS MEASURED, 2026-08-21. `aboutMyself` matches `user_id IS NULL AND
// kind = 'identity'`. A memory she writes in a REFLECTION goes down the ordinary `remember` lane, so it
// lands with `author='persona'`, a ROOM (`user_id` set) and `kind='semantic'` — matching NEITHER condition.
// Proven end to end: a persona-authored row was found by `recall_memory` and `list_memories` and NOT by
// this tool. ⇒ she could form her own memory and her own self-memory mechanism could not retrieve it,
// which also means she could not check *"do I already have this?"* from inside the occasion that writes.
// Ote: *"recall_own_memory should be able to see Sotera-authored memories."*
{
  const room = users.agent_dev
  const other = users.agent_dev_alt
  const MARK = 'zz_test kept-by-me — a memory Sotera decided to keep herself.'
  const mk = (uid, content) => Q(
    `INSERT INTO persona_sotera.txn_memories (id, user_id, persona, kind, content, author, importance, confidence, created_at, updated_at)
     VALUES (gen_random_uuid(), :uid, 'sotera', 'semantic', :content, 'persona', 5, 0.9, now(), now())
     RETURNING id::text AS id`, { uid, content })
  const [mine] = await mk(room, MARK)
  // ⭐ A DECOY IN ANOTHER ROOM, and it is what makes the next assertion mean anything. Persona-authored
  // memories live in rooms; a read that returned them all would be an ACCESS change wearing a bug fix's
  // clothes. Without this row, "scoped to this room" is untested and would pass on an empty database.
  const [elsewhere] = await mk(other, 'zz_test kept-by-me DECOY — another room, must never appear here.')
  try {
    const svc = buildOwnMemory(fastify, { userId: room })
    const r = await svc.recall()
    ok(r.keptByMe?.count >= 1,
      'K · ⭐⭐⭐ a memory SHE authored is visible to her own-memory read', `${r.keptByMe?.count} item(s)`)
    ok((r.keptByMe?.items ?? []).some((i) => i.statement === MARK),
      'K · …and it is the row she wrote, verbatim')
    ok(!(r.keptByMe?.items ?? []).some((i) => String(i.statement).includes('DECOY')),
      'K · ⛔⛔ …and the other room\'s persona memory does NOT appear — this fix adds no access')
    // ⭐ ITS OWN SLICE, NEVER MERGED. "What is true of me everywhere" and "what I chose to keep here" are
    // different facts; collapsing them would make her own authorship unreadable, which is the thing
    // migration 015 exists to record.
    ok(!(r.aboutMyself?.items ?? []).some((i) => i.statement === MARK),
      'K · ⭐⭐ …and it did NOT leak into `aboutMyself` — persona-global and kept-here stay separate')
    ok(r.coverage?.keptByMe?.matched === r.keptByMe.count,
      'K · ⭐ the coverage line agrees with the payload, so "kept nothing" and "could not see" stay different sentences',
      `${r.coverage?.keptByMe?.matched}/${r.keptByMe.count}`)
    // ⛔ AND THE OTHER ROOM'S READ SEES ITS OWN, which proves the scoping is per-room rather than a
    // hardcoded room. A filter that only ever matched `agent_dev` would pass every assertion above.
    const rOther = await buildOwnMemory(fastify, { userId: other }).recall()
    ok((rOther.keptByMe?.items ?? []).some((i) => String(i.statement).includes('DECOY')),
      'K · ⭐ the other room sees ITS own kept memory — the scoping is per-room, not a hardcoded room')

    // ── ⭐⭐⭐ K2 · THROUGH THE READER, NOT THE HOST — AND THIS GAP NEARLY COST A FALSE BUG REPORT ────
    //
    // ⚠️⚠️ Every assertion above calls `buildOwnMemory(...).recall()` directly. That is the HOST. She never
    // touches the host — she calls a TOOL, and a tool that projects an explicit field list drops silently
    // whatever it was not told about. That is this codebase's most-repeated defect (8+ recorded instances:
    // a marker 0-for-76, a nullable column no reader could see), and the recorded rule is exactly this:
    // ⭐ **a field is not added until a READER accepts it.**
    // ⓘ On 2026-08-21 a probe reported `keptByMe: undefined` through `runTool` and I nearly filed it as a
    // dropped field. The real cause was that the probe never called `initOwnMemory()`, so the tool fell
    // back to the component default — which is its own lesson: a check that only exercises the host cannot
    // tell a projection bug from an unregistered service.
    // ⇒ assert the whole path, with the service registered the way the route registers it.
    initOwnMemory()
    const rctx = buildToolContext(fastify, {
      user: { id: room, username: 'agent_dev', displayName: 'Claude', isRoot: false, capabilities: [] },
    }, { origin: 'own-memory-check' })
    const viaTool = await runTool('recall_own_memory', {}, rctx)
    ok(viaTool?.keptByMe?.count >= 1,
      'K2 · ⭐⭐⭐ the slice survives to the READER — `recall_own_memory` itself returns it, not just the host',
      viaTool?.keptByMe === undefined ? '⛔ undefined at the tool boundary' : `${viaTool.keptByMe.count} item(s)`)
    ok((viaTool?.keptByMe?.items ?? []).some((i) => i.statement === MARK),
      'K2 · …and it is her row, intact through the projection')
  } finally {
    for (const id of [mine?.id, elsewhere?.id]) {
      if (id) await Q('DELETE FROM persona_sotera.txn_memories WHERE id = :id', { id })
    }
  }
}

done()
