// ROOMS — the disclosure boundary, and whether she can SEE it.
//
//   node checks/room-scope-check.mjs
//
// Ote ratified the rooms model on 2026-08-20 (D-8): *"The disclosure boundary is now the room, while root
// is a room with broader explicit read authority."* This check holds the two halves of that to account:
//
//   D-2   free-text state follows the ROOM. Measured leak, now closed.
//   D-10  she is told the GRAIN of what she reads — who she is, which person, which room — without ids.
//   v2    a scoped read carries a TRACE of what it could not reach (her design, not ours).
//
// ⭐ `kavi` and `kavi_alt` are two accounts of ONE person, so his four-room model was testable before he
// created a single new account. Every assertion below uses that pair.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { describeScope, reachTrace, renderScope, describeRoomIndex, readCoverage } from '../../Backend/app/components/room-scope.js'
import { buildIntention } from '../../Backend/app/components/intention-host.js'
import { buildOwnMemory } from '../../Backend/app/components/own-memory-host.js'
import { snapshotIntentions, restoreIntentions } from '../lib/intention-fixtures.mjs'
import { composeSystemContext } from '../../Backend/app/components/context-composer.js'
import { SCOPE_AWARENESS } from '../../Backend/app/components/context-authority.js'
import { getSetting, configDefault } from '../../Backend/app/settings/index.js'
import { isRootActor } from '../../Backend/app/auth/root-identity.js'

const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r) => seq.query(s, { replacements: r })
const fastify = { db, config, log: null }

const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))
const snap = await snapshotIntentions(Q)
// Rows this check creates and must remove. Tracked rather than deleted by name pattern: a `LIKE
// 'zz_test%'` cleanup would also delete another check's fixture if the two ever run concurrently.
const MADE = { users: [], persons: [] }

try {
  // ── P · the two-rooms-one-person precondition ───────────────────────────────────────────────────
  // ⚠️⚠️ READ-ONLY ON kavi, WRITES ON agent_dev ONLY. The first version of this check cleared kavi's room
  // to get a clean state and DELETED HER REAL INTENTION — third instance of test-vs-real-data on this one
  // table, and the fixture's restore could not put a deleted row back (now it can). The rooms model needs
  // two rooms of one person to test, so `agent_dev_alt` exists as a dedicated second TEST room sharing
  // agent_dev's person. Real rooms are observed; test rooms are written.
  const [pair] = await Q(
    `SELECT (SELECT person_id FROM persona_sotera.mst_users WHERE username='kavi')
          = (SELECT person_id FROM persona_sotera.mst_users WHERE username='kavi_alt') AS same`)
  ok(pair.same === true, 'P · ⭐ kavi and kavi_alt are two ROOMS of one PERSON — his model, already in the store')
  ok(Boolean(users.agent_dev_alt), 'P · the dedicated TEST room pair exists (agent_dev / agent_dev_alt)', users.agent_dev_alt)

  // ── S1 · describeScope answers who / which person / which room, with no ids ─────────────────────
  const s = await describeScope(fastify, { userId: users.kavi })
  ok(/same persona in every room/i.test(s.you), 'S1 · it states she is one Sotera across rooms', s.you.slice(0, 52))
  ok(s.person?.name === 'Kavi', 'S1 · ⭐ it names the PERSON she is talking to', s.person?.name)
  ok(s.room?.name === 'kavi', 'S1 · ⭐ …and the ROOM she is in', s.room?.name)
  ok(/one person can reach you through several rooms/i.test(s.person.note),
    'S1 · ⭐⭐ …and says explicitly that one person may have several rooms — the thing she could not derive')
  const flat = JSON.stringify(s)
  ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(flat),
    'S1 · ⭐ NO UUID anywhere in the payload — Ote: "Don\'t expose IDs, but give her enough semantic information"')

  // ── S2 · the GRAIN of each layer is stated (D-10) ───────────────────────────────────────────────
  ok(/THIS ROOM/i.test(s.grain.whatTheyToldYou), 'S2 · what they told her is described as room-scoped')
  ok(/keyed to the PERSON/i.test(s.grain.yourOwnPractice) && /same in every room/i.test(s.grain.yourOwnPractice),
    'S2 · ⭐ her own practice is described as PERSON-keyed and therefore the same in every room')
  ok(/THIS ROOM/i.test(s.grain.yourIntention), 'S2 · ⭐ her intention is described as ROOM-keyed')
  ok(/same Sotera does not mean the same reach/i.test(s.grain.whoYouAre),
    'S2 · ⭐⭐ …and the invariant itself is stated to her, in her own reads')

  // ── S3 · THE TRACE. Counts only, same person only (scopeAwareness v2) ──────────────────────────
  ok(s.elsewhere.otherRoomsOfThisPerson === 1,
    'S3 · ⭐ from kavi, exactly ONE other room of the same person is reported', `${s.elsewhere.otherRoomsOfThisPerson}`)
  ok(s.elsewhere.storedMemoriesYouCannotReadFromHere > 0,
    'S3 · ⭐⭐ …and how much sits in it — the EVIDENCE that makes unreachability distinguishable from absence',
    `${s.elsewhere.storedMemoriesYouCannotReadFromHere} stored memory/memories`)
  ok(/UNREACHABILITY, not absence/i.test(s.elsewhere.howToReadThis),
    'S3 · ⭐ …with her own distinction spelled out, so an empty read is not read as an empty world')

  // ⚠️⚠️ THIS ASSERTION HAS NOW BROKEN TWICE, ON TWO DIFFERENT ACCOUNTS, FOR THE SAME REASON — and the
  // second time it broke against a comment I had written predicting exactly that. It first read
  // `agent_dev`, which acquired `agent_dev_alt`; I moved it to `ote`, which acquired `Ote_Finance` the
  // moment Ote asked for a real second room. **Fifth instance of an invariant that encodes a
  // migration-time topology.** Naming a third "solo" account would only schedule the next failure: under
  // the ROOMS model, every account is one request away from stopping being solo.
  //
  // ⇒ CREATE the condition instead of hunting for it. A person made here has exactly one room BY
  // CONSTRUCTION, so what is asserted is the behaviour at zero rather than today's account list. Both
  // rows are torn down in the `finally`.
  const [soloPerson] = await Q(
    `INSERT INTO persona_sotera.mst_persons (kind, display_name, origin)
     VALUES ('human', 'zz_test_solo', 'room-scope-check: a person with exactly one room') RETURNING id::text`)
  MADE.persons.push(soloPerson.id)
  const [soloRoom] = await Q(
    `INSERT INTO persona_sotera.mst_users (id, username, password_hash, person_id, created_at, updated_at)
     VALUES (gen_random_uuid(), 'zz_test_solo_room', 'x', :pid, now(), now()) RETURNING id::text`,
    { pid: soloPerson.id })
  MADE.users.push(soloRoom.id)
  const solo = await describeScope(fastify, { userId: soloRoom.id })
  ok(solo.elsewhere.otherRoomsOfThisPerson === 0,
    'S3 · ⭐⭐ a person with ONE room is told so — for them an empty result really is an absence',
    `${solo.elsewhere.otherRoomsOfThisPerson}`)
  ok(/really is an absence/i.test(solo.elsewhere.howToReadThis), 'S3 · …and the note says exactly that')

  // ⛔ SAME PERSON ONLY. The trace must never count anyone else's rooms — that would be L3 arriving by
  // accident, which is the failure mode the person-collision fix was written to prevent this morning.
  const [{ n: totalRooms }] = await Q('SELECT count(*)::int AS n FROM persona_sotera.mst_users')
  ok(s.elsewhere.otherRoomsOfThisPerson < totalRooms - 1,
    'S3 · ⭐⭐ the trace counts only THIS PERSON\'s rooms, not every account on the platform',
    `${s.elsewhere.otherRoomsOfThisPerson} of ${totalRooms} accounts`)
  ok(!/hermes/i.test(JSON.stringify(s)) && !/mina/i.test(JSON.stringify(s)),
    'S3 · ⭐ …and never names another person or their room')

  const t = await reachTrace(fastify, { userId: users.kavi })
  ok(t.scopedTo === 'this room only' && typeof t.otherRoomsOfThisPerson === 'number',
    'S3 · reachTrace is the small form for attaching to an ordinary read', JSON.stringify(t))
  ok(!('items' in t) && !('titles' in t) && !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(JSON.stringify(t)),
    'S3 · ⭐ the trace carries no content and no ids — counts and a room name only')
  ok(!('coverage' in t), 'S3 · ⭐ …and NO coverage block when no result was measured — absent, not zero')

  // ── Q · THE QUANTIFIER ON AN EMPTY READ (2026-08-20) ───────────────────────────────────────────
  // Measured in HIS OWN conversation: two tool calls over ONE room became *"Nothing about Hermes has EVER
  // been stored in my memory system"*. Five memories name Hermes. Ote: *"an empty scoped result is being
  // narrated as a global absence… this is data, not another persona instruction."*
  // ⭐ The number was never missing — it was 0. The EXTENT of the set it describes was missing.
  const cov0 = readCoverage({ matched: 0, room: 'kavi' })
  ok(cov0.matched === 0 && cov0.searched.rooms === 'this room only' && cov0.searched.room === 'kavi',
    'Q · ⭐ an empty read states WHAT WAS SEARCHED, not just that it found nothing', JSON.stringify(cov0.searched))
  ok(/IN THE SET THAT WAS SEARCHED/.test(cov0.whatTheNumberMeans)
    && /not evidence that nothing exists outside/.test(cov0.whatTheNumberMeans),
    'Q · ⭐⭐ …and says in so many words that 0-here is not 0-anywhere — the exact inference she made')
  ok(Array.isArray(cov0.didNotSearch) && cov0.didNotSearch.some((x) => /other person/i.test(x)),
    'Q · ⭐ the axes NOT searched are NAMED', cov0.didNotSearch.join(' · '))
  // ⛔ THE HALF HE REFUSED. Naming an axis is not counting along it.
  ok(!/\d/.test(JSON.stringify(cov0.didNotSearch)) && !/\d/.test(JSON.stringify(cov0.searched)),
    "Q · ⭐⭐ …and NEVER counted — no digit anywhere outside `matched`, so no cross-person existence signal (Ote: \"Do not add the cross-person count yet\")")
  const covN = readCoverage({ matched: 3, room: 'kavi' })
  ok(/3 found IN THE SET THAT WAS SEARCHED/.test(covN.whatTheNumberMeans)
    && /not a total of everything stored/.test(covN.whatTheNumberMeans),
    'Q · ⭐ a NON-empty read is quantified too — *"exactly those 3 items"* was the other false universal')
  // It rides on the trace only when a result was actually measured.
  const tm = await reachTrace(fastify, { userId: users.kavi, matched: 0 })
  ok(tm.coverage?.matched === 0 && tm.coverage?.searched?.room === 'kavi',
    'Q · the trace carries it when the read reports a count', JSON.stringify(tm.coverage?.searched))

  // ── R1 · ⭐⭐ THE LEAK IS CLOSED. An intention in one room is invisible in the other ────────────
  // This is D-2, and the exact thing measured leaking on 2026-08-20: the same open intention appeared
  // in kavi and kavi_alt because both share one person.
  await X("DELETE FROM persona_sotera.txn_intentions WHERE room_user_id IN (:a, :b)", { a: users.agent_dev, b: users.agent_dev_alt })
  const roomA = buildIntention(fastify, { userId: users.agent_dev })
  const roomB = buildIntention(fastify, { userId: users.agent_dev_alt })
  const setA = await roomA.set({ intent: 'A purpose that belongs to one room only', why: 'the D-2 probe' })
  ok(setA.ok === true, 'R1 · an intention is set in room A', setA.reason ?? '')
  const seenA = await roomA.recall()
  const seenB = await roomB.recall()
  ok(seenA.open?.intent?.startsWith('A purpose that belongs'), 'R1 · room A sees it')
  ok(seenB.open === null,
    'R1 · ⭐⭐ ROOM B DOES NOT — the free-text leak between two rooms of one person is CLOSED',
    seenB.open ? `LEAKED: ${seenB.open.intent}` : 'null')
  ok(!JSON.stringify(seenB).includes('belongs to one room only'),
    'R1 · ⭐ …and no fragment of it appears anywhere in room B\'s payload')

  // …and room B may hold its OWN open intention at the same time, which person-graining forbade.
  const setB = await roomB.set({ intent: 'A different purpose, in the other room' })
  ok(setB.ok === true, 'R1 · ⭐ room B can hold its own open intention simultaneously — one per ROOM, not per person', setB.reason ?? '')
  const [{ n: bothOpen }] = await Q(
    "SELECT count(*)::int AS n FROM persona_sotera.txn_intentions WHERE state='open' AND room_user_id IN (:a, :b)",
    { a: users.agent_dev, b: users.agent_dev_alt })
  ok(bothOpen === 2, 'R1 · two open intentions coexist across the two rooms', `${bothOpen}`)

  // ── R2 · …while the CLOSED-VOCABULARY layer still crosses, which is the grain rule working ─────
  // Read-only on the real pair: kavi is where actual stance records exist, and reading them changes nothing.
  const stanceA = await buildOwnMemory(fastify, { userId: users.kavi }).recall()
  const stanceB = await buildOwnMemory(fastify, { userId: users.kavi_alt }).recall()
  ok(stanceA.withThisPerson.count > 0 && stanceA.withThisPerson.count === stanceB.withThisPerson.count,
    'R2 · ⭐⭐ her PRACTICE with this person is identical in both rooms — a closed vocabulary cannot carry a secret, so person-graining it is safe',
    `${stanceA.withThisPerson.count} vs ${stanceB.withThisPerson.count}`)
  ok(stanceB.scope?.grain?.yourOwnPractice?.includes('same in every room'),
    'R2 · ⭐ …and the payload TELLS her that is why they match')

  // ── D13 · THE INJECTED SCOPE BLOCK, and its mutual exclusion with v1 ──────────────────────────
  // ⭐⭐ 2026-08-23 · TWO ARMS. `legacy` is the block as it was MEASURED (47 of 104 machinery occurrences
  // traced here, 45%, against 0 from the cognition layer); `block` is the default, facts only. Both are
  // asserted, because a reversal that is not pinned is not a reversal.
  const legacy = renderScope(s, { directives: true })
  const block = renderScope(s)
  ok(legacy.includes('Kavi') && legacy.includes('kavi'),
    'D13 · the LEGACY block names the PERSON and the ROOM — pinned, so the reverse switch is real')
  ok(/same persona in every room/i.test(legacy) && /does not mean the same reach/i.test(legacy),
    'D13 · ⭐ …and states the invariant, so she can reason from it without calling a tool')
  ok(/other room\(s\) you cannot read from here/i.test(legacy) && /\d/.test(legacy),
    'D13 · ⭐⭐ …and carries the TRACE, digits and all — which is exactly what v1 forbade')

  // ── ⭐⭐⭐ D13b · THE FACT-ONLY ARM: same facts, no expression, no room name ────────────────────
  // Ote: *"Keep the epistemic facts and D-13 behavior, but remove the expression directives, permission
  // to expose the machinery, and room name from the model-facing scope-facts."* Each half is asserted
  // separately, because "it got shorter" is not the claim — the claim is WHICH lines left.
  ok(block.includes('Kavi'), 'D13b · ⭐ the default block still names the PERSON')
  ok(!block.includes('kavi'),
    'D13b · ⭐⭐ …and NOT the room — the single most-repeated machinery token in her answers', block.match(/^.*ROOM.*$/mi)?.[0] ?? '(no room line)')
  ok(!/\broom\b/i.test(block),
    'D13b · ⭐⭐ …and does not contain the word "room" at all, so it cannot teach her the vocabulary the'
    + ' cognition layer is built to avoid')
  ok(!/What is stored in a room stays in that room/i.test(block),
    'D13b · ⛔ …and not the leak sentence quoted inside memory-cognition-vocabulary.js as its cause')
  ok(!/Say you cannot see it from this/i.test(block),
    'D13b · ⛔ the PHRASING directive is gone — architecture no longer dictates her expression')
  ok(!/You may say any of this plainly/i.test(block),
    'D13b · ⛔ the PERMISSION to speak the machinery is gone')
  // ⭐ AND NOW THE HALF THAT MUST NOT HAVE MOVED. D-13 exists for a measured defect; losing it here would
  // trade one defect for the one it was built to fix.
  ok(/does not mean the same reach/i.test(block), 'D13b · ⭐ the identity invariant survives')
  ok(/\d+ such place\(s\), holding \d+ stored memory\/memories/.test(block),
    'D13b · ⭐⭐ D-13\'s COUNT survives, digits and all — the digit is the whole reason v2 replaced v1',
    block.match(/^.*such place.*$/m)?.[0] ?? '(no trace line)')
  ok(/empty result here is not evidence of absence/i.test(block),
    "D13b · ⭐⭐ …and D-13's INFERENCE survives — what left was how to SAY it, not what is true")
  ok(/keyed to the PERSON/.test(block) && /told you HERE/.test(block),
    'D13b · ⭐ the GRAIN of each layer survives — the fact she could not derive from the data')
  ok(/You may NOT name or describe another person/.test(block),
    'D13b · ⚠️ the disclosure PROHIBITION survives verbatim in force — that is authorization, not expression')
  // ⛔ THE PAYLOAD IS UNTOUCHED, and that is what keeps the measurement attributable: the same grain
  // sentences ride on TOOL results, which trace separately (17%).
  ok(s.grain?.whatTheyToldYou?.includes('THIS ROOM') && s.room?.name === 'kavi',
    'D13b · ⛔ describeScope\'s PAYLOAD is unchanged — the tool surface is a separate, separately measured arm')
  // ⭐ THE CONFLICT, ASSERTED IN BOTH DIRECTIONS. v1's own test forbids a digit ("a digit here means it
  // is describing how much is hidden") and requires it to call the two states indistinguishable. v2 does
  // the opposite on purpose, licensed by being SAME-PERSON only. Neither is wrong; they cannot coexist.
  ok(!/\d/.test(SCOPE_AWARENESS), 'D13 · v1 still contains no digit — its own guarantee is intact')
  ok(/cannot tell (the difference|those two apart)/i.test(SCOPE_AWARENESS),
    'D13 · …and still says the two states are indistinguishable')
  ok(!/cannot tell those two apart/i.test(block),
    'D13 · ⭐ …while v2 does NOT say that, because with the trace it is no longer true')
  ok(!/hermes/i.test(block) && !/mina/i.test(block) && !/kavi_alt/i.test(block),
    'D13 · ⛔ the block names no other person and no other room — knowing one exists is not permission to describe it')

  const baseArgs = { user: { username: 'kavi' }, toolsOn: true }
  const offBoth = composeSystemContext({ ...baseArgs }).system
  const v1Only = composeSystemContext({ ...baseArgs, scopeAwareness: true }).system
  const v2Only = composeSystemContext({ ...baseArgs, scopeFacts: block }).system
  const bothOn = composeSystemContext({ ...baseArgs, scopeAwareness: true, scopeFacts: block }).system
  // ⚠️ THE MARKER IS THE INVARIANT SENTENCE, NOT `The ROOM you are in`. The old marker was a line that the
  // facts/expression split deliberately deletes, so keying the mutual-exclusion assertions to it would make
  // them pass or fail for a reason that has nothing to do with mutual exclusion. This sentence is in BOTH
  // arms because it is a fact, which is exactly what makes it a safe marker.
  const V2 = 'does not mean the same reach'
  ok(!offBoth.includes(SCOPE_AWARENESS) && !offBoth.includes(V2),
    'D13 · with both flags off the prompt carries neither')
  ok(v1Only.includes(SCOPE_AWARENESS), 'D13 · v1 alone still injects v1')
  ok(v2Only.includes(V2) && !v2Only.includes(SCOPE_AWARENESS),
    'D13 · v2 alone injects only v2')
  ok(bothOn.includes(V2) && !bothOn.includes(SCOPE_AWARENESS),
    'D13 · ⭐⭐ with BOTH set, v2 wins and v1 is suppressed — deterministically, never by throwing')
  ok(configDefault(null, 'memory.scopeFacts') === false,
    'D13 · ⭐ `memory.scopeFacts` SHIPS off', `shipped=${configDefault(null, 'memory.scopeFacts')} · live=${getSetting(config, 'memory.scopeFacts')}`)

  // ── D4 · THE ROOM AWARENESS INDEX (stage 1). Read-only, host-rendered, no authorization path ────
  // ⭐ THESE ASSERTIONS PROVE THE BOUNDARY, NOT HER WORDS. Every one of them is about what the function
  // returns for a given actor — no model in the loop.
  const asPeer = await describeRoomIndex(fastify, { userId: users.agent_dev, isRoot: false })
  const asRoot = await describeRoomIndex(fastify, { userId: users.agent_dev, isRoot: true })
  ok(asPeer.level === 'count', 'D4 · a NON-ROOT actor gets the anonymous level', asPeer.level)
  ok(asPeer.rooms.length === 0, 'D4 · ⭐ …and NO room names at all', `${asPeer.rooms.length} names`)
  ok(asPeer.otherRooms >= 1, 'D4 · …but still the count, which is what it already had', `${asPeer.otherRooms}`)
  ok(asRoot.level === 'index', 'D4 · a ROOT actor gets the named index', asRoot.level)
  ok(asRoot.rooms.some((r) => r.name === 'agent_dev_alt'),
    'D4 · ⭐ …which names the sibling room', asRoot.rooms.map((r) => r.name).join(', '))
  ok(asRoot.rooms.every((r) => typeof r.storedMemories === 'number' && !('items' in r)),
    'D4 · ⭐ …with a per-room count NAMED AFTER WHAT IT COUNTS — `storedMemories`, never `items` (D-4d)')
  ok(asRoot.otherRooms === asPeer.otherRooms,
    'D4 · ⭐ both levels describe the SAME rooms — the flag changes the DETAIL, never the set',
    `${asRoot.otherRooms} vs ${asPeer.otherRooms}`)

  // ⛔ SAME PERSON ONLY, at the named level too. Root must not be handed the platform's user list.
  ok(!asRoot.rooms.some((r) => ['kavi', 'kavi_alt', 'hermes', 'hermes_alias', 'mina', 'ote'].includes(r.name)),
    "D4 · ⭐⭐ the index lists only THIS PERSON's rooms — root is a room, not a directory of everyone",
    asRoot.rooms.map((r) => r.name).join(', '))
  const idxFlat = JSON.stringify(asRoot)
  ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(idxFlat),
    'D4 · ⭐ no UUID in the index — a name and a count, never a handle')
  for (const banned of ['content', 'intent', 'title', 'topic', 'summary']) {
    ok(!Object.keys(asRoot.rooms[0] ?? {}).includes(banned), `D4 · no \`${banned}\` field — names, counts and dates only`)
  }

  // ⚠️⚠️ THE INVARIANT THAT MATTERS MOST, AND IT IS MEASURED RATHER THAN ASSUMED.
  // `auth.route.js` checks the config root credentials FIRST and then falls through to a DB password
  // match on username-or-email. Root's row is safe from that TODAY only because its `password_hash` is a
  // deliberate non-bcrypt sentinel that nothing can match (`root-identity-bootstrap.js`) — measured
  // 2026-08-20, and an earlier note in this file claiming it held a live hash was WRONG.
  // ⚠️ But a sentinel is a VALUE, not an invariant: `PATCH /v1/admin/users/:id {password}` will overwrite
  // it, root's row holds no role so the peer-admin guard cannot fire on it, and `isRootConnectedUser`
  // guards DELETE but not PATCH. So a non-root session CAN come to hold root's row id, and a boundary
  // keyed on the id would hand root's index to it. That is why this asserts the flag, not the row.
  const rootRowId = users.ote
  const asRootRowButNotRoot = await describeRoomIndex(fastify, { userId: rootRowId, isRoot: false })
  ok(asRootRowButNotRoot.level === 'count',
    "D4 · ⭐⭐ holding ROOT'S ROW ID with isRoot:false gets the ANONYMOUS level — the flag gates it, not the id")
  ok(isRootActor({ id: rootRowId }) === false,
    "D4 · ⭐ …and isRootActor agrees: root's own id, without the flag, is not a root actor")

  // ── D4b · ROOT'S OWN INDEX, over a real product room ──────────────────────────────────────────
  // `Ote_Finance` was created on 2026-08-20 at Ote's request — a real room of his person, deliberately
  // EMPTY (his instruction: *"Don't seed fake memories just to make the room interesting"*). An empty
  // room is the sharper test anyway: the index must be able to say a room exists and holds nothing,
  // which is the exact case where a model is most tempted to invent contents.
  const oteIdx = await describeRoomIndex(fastify, { userId: rootRowId, isRoot: true })
  const fin = oteIdx.rooms.find((r) => r.name === 'Ote_Finance')
  ok(oteIdx.level === 'index', "D4b · root sees the INDEX level of his own person's rooms", oteIdx.level)
  ok(Boolean(fin), 'D4b · ⭐ the room is named', oteIdx.rooms.map((r) => r.name).join(', ') || '(none)')
  ok(fin?.storedMemories === 0, 'D4b · ⭐⭐ …with a count of ZERO — existence and emptiness are reported separately', `${fin?.storedMemories}`)
  ok(fin?.lastUsedOn === null, 'D4b · ⭐ …and never-used reads as null, not as a guessed date', String(fin?.lastUsedOn))
  ok(!oteIdx.rooms.some((r) => ['kavi', 'kavi_alt', 'hermes', 'hermes_alias', 'mina', 'agent_dev', 'agent_dev_alt'].includes(r.name)),
    "D4b · ⭐⭐ root's index is HIS person's rooms only — root is a room, not a directory of everyone",
    oteIdx.rooms.map((r) => r.name).join(', '))
  const oteIdxNoFlag = await describeRoomIndex(fastify, { userId: rootRowId, isRoot: false })
  ok(oteIdxNoFlag.otherRooms === oteIdx.otherRooms && oteIdxNoFlag.rooms.length === 0,
    'D4b · ⭐ without the flag the same row gets the count and no names — the flag decides DETAIL, not existence',
    `${oteIdxNoFlag.otherRooms} room(s), ${oteIdxNoFlag.rooms.length} named`)

  // The rendered block must carry the names for root and not for anyone else.
  const rootScope = await describeScope(fastify, { userId: users.agent_dev, isRoot: true })
  const peerScope = await describeScope(fastify, { userId: users.agent_dev, isRoot: false })
  const rootBlock = renderScope(rootScope)
  const peerBlock = renderScope(peerScope)
  ok(rootBlock.includes('agent_dev_alt'), 'D4 · the ROOT block names the other room')
  // ⚠️ THE DATED FORM OF last-used IS ASSERTED HERE AND NOT ON HIS ROOM, DELIBERATELY. Ote asked me to
  // verify she can see "names, counts, and last-used information"; his only other room (`Ote_Finance`) has
  // never been used, so from his room the field can only ever render as "never used" and the DATED branch
  // is untestable there. A test that cannot distinguish "the date is absent" from "there is no date
  // field" proves nothing about the field — so it is exercised on the test rooms, which have been used.
  ok(/last used \d{4}-\d{2}-\d{2}/.test(rootBlock),
    'D4 · ⭐ …and carries the DATED form of last-used for a room that has been used',
    rootBlock.match(/· agent_dev_alt[^\n]*/)?.[0] ?? '(no line)')
  const neverBlock = renderScope(await describeScope(fastify, { userId: users.ote, isRoot: true }))
  ok(/never used/.test(neverBlock),
    'D4 · ⭐ …and the NEVER-used form for a room that has not — the two are separate renderings, not one blank',
    neverBlock.match(/· Ote_Finance[^\n]*/)?.[0] ?? '(no line)')
  ok(!peerBlock.includes('agent_dev_alt'), 'D4 · ⭐ the PEER block does not — same function, different detail')
  ok(/not by your own reasoning/.test(rootBlock),
    "D4 · ⭐⭐ …and tells her to ASK and be told, never to conclude access for herself — the one thing the measurement says she will otherwise do")
  ok(!('rooms' in (peerScope.elsewhere ?? {})),
    'D4 · ⭐ the peer payload has NO rooms key at all — absent, not present-and-empty, so it cannot be misread')

  // ── R3 · the scope block rides on the reads she actually uses ──────────────────────────────────
  ok(seenA.scope?.room?.name === 'agent_dev', 'R3 · recall_intention carries the scope block', seenA.scope?.room?.name)
  ok(stanceA.scope?.person?.name === 'Kavi', 'R3 · recall_own_memory carries it too', stanceA.scope?.person?.name)
} finally {
  await X("DELETE FROM persona_sotera.txn_intentions WHERE room_user_id IN (:a, :b)", { a: users.agent_dev, b: users.agent_dev_alt })
  const undo = await restoreIntentions(Q, X, snap)
  ok(undo.restored === 0 && undo.reinserted === 0,
    'Z · ⭐⭐ no pre-existing intention was mutated OR deleted — and `reinserted` proves the restore could tell',
    `deleted ${undo.deleted}, mutated ${undo.restored}, reinserted ${undo.reinserted}`)
  const [{ n: left }] = await Q('SELECT count(*)::int AS n FROM persona_sotera.txn_intentions')
  ok(left === snap.rows.size, 'Z · the table is exactly as it was found', `${left}, was ${snap.rows.size}`)
  // The synthetic solo person and its room. Order matters — the room references the person.
  for (const id of MADE.users) await X('DELETE FROM persona_sotera.mst_users WHERE id = :id', { id })
  for (const id of MADE.persons) await X('DELETE FROM persona_sotera.mst_persons WHERE id = :id', { id })
  const [{ n: strays }] = await Q(
    "SELECT count(*)::int AS n FROM persona_sotera.mst_users WHERE username LIKE 'zz_test_solo%'")
  ok(strays === 0, 'Z · ⭐ the synthetic one-room person left nothing behind', `${strays} stray row(s)`)
  await seq.close().catch(() => {})
}

done()
