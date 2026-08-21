// E-1 — THE EVIDENCE IS AUTHORIZED SEPARATELY FROM THE MEMORY.
//
//   node checks/evidence-authorization-check.mjs
//
// Ote ratified the memory model on 2026-08-20: **"Memory ownership ≠ evidence ownership ≠ evidence
// access."** · *"A memory can be Sotera's while the original conversation/message remains someone else's
// material."* This is E-1, and it is first in the build order for a specific reason:
//
// ⚠️⚠️ `getSource` used to scope-check the MEMORY and then fetch the message, the conversation title, and
// EVERY message in that conversation BY ID, UNFILTERED. That was sound only because of an invariant nobody
// had written down — *a memory's source message belongs to the same room as the memory* — which held while
// `user_id` owned every memory. **The ratified reframe removes it.** Unchanged, the first Sotera-owned
// memory would have handed another person's actual words to whoever recalled it.
//
// ⭐ SO THE CENTRAL CASE HERE CANNOT OCCUR NATURALLY YET, AND IS BUILT ON PURPOSE: a memory in one scope
// whose `source_message_id` points into ANOTHER scope's conversation. That is exactly the shape
// ownership-follows-authorship creates, and the whole point of landing E-1 before it.
//
// ⛔ WRITES ONLY TO agent_dev / agent_dev_alt, and removes every row it makes. `kavi` and `hermes` are
// read-only observation accounts — see room-scope-check for what ignoring that cost once.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'

const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r) => seq.query(s, { replacements: r })
const PERSONA = config.persona?.name ?? null
const MADE = { memories: [], conversations: [] }

const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))

try {
  // ── FIXTURE · a conversation owned by agent_dev_alt, with real messages ─────────────────────────
  const [conv] = await Q(
    `INSERT INTO persona_sotera.txn_conversations (id, user_id, title, model, created_at, updated_at)
     VALUES (gen_random_uuid(), :u, 'zz_test EVIDENCE fixture', 'ollama/test', now(), now()) RETURNING id::text`,
    { u: users.agent_dev_alt })
  MADE.conversations.push(conv.id)
  const msgs = []
  for (const [i, [role, content]] of [
    ['user', 'zz_test EVIDENCE line one — the setup before the source message'],
    ['user', 'zz_test EVIDENCE SOURCE — the sentence a memory was drawn from'],
    ['assistant', 'zz_test EVIDENCE line three — the reply after the source'],
    ['user', 'zz_test EVIDENCE line four — far enough away to be outside a ±1 window'],
  ].entries()) {
    const [m] = await Q(
      `INSERT INTO persona_sotera.txn_messages (id, conversation_id, role, content, created_at, updated_at)
       VALUES (gen_random_uuid(), :c, :r, :t, now() + (:i || ' seconds')::interval, now()) RETURNING id::text, rolling_id`,
      { c: conv.id, r: role, t: content, i })
    msgs.push(m)
  }
  const source = msgs[1]

  const mkMemory = async (userId, sourceMessageId) => {
    const [r] = await Q(
      `INSERT INTO persona_sotera.txn_memories
         (id, persona, user_id, namespace, kind, content, entity, importance, source, source_message_id, created_at, updated_at)
       VALUES (gen_random_uuid(), :p, :u, 'default', 'semantic', 'zz_test the abstraction, not the words', 'user', 5,
               :src, :smid, now(), now()) RETURNING id::text`,
      { p: PERSONA, u: userId, src: `conversation:${conv.id}`, smid: sourceMessageId })
    MADE.memories.push(r.id)
    return r.id
  }

  // ── V · VERIFIED — memory and evidence in the SAME scope. The path that already worked. ─────────
  const ownMem = await mkMemory(users.agent_dev_alt, source.id)
  const altStore = createSequelizeMemoryStore({ db, persona: PERSONA, userId: users.agent_dev_alt })
  const v = await altStore.getSource({ id: ownMem, context: 1 })
  ok(v.found === true && v.evidenceState === 'source-readable', 'V · same scope ⇒ evidenceState=source-readable', v.evidenceState)
  ok(Array.isArray(v.context) && v.context.some((c) => c.isSource), 'V · the source message is returned and flagged', `${v.context?.length} message(s)`)
  ok(v.context.some((c) => /SOURCE — the sentence/.test(c.content)), 'V · ⭐ and it is REAL evidence — the actual text, not metadata')
  ok(v.learnedHere === true && Boolean(v.learnedOn), 'V · provenance carries when, and that it was here', String(v.learnedOn))

  // ⚠️ THE WINDOW IS A WINDOW. It used to `findAll` the whole conversation and slice in JS — measured at
  // 70 messages loaded to return 5. With context:1 the 4-message fixture must yield 3, not 4.
  ok(v.context.length === 3, 'V · ⭐ the WINDOW is fetched, not the conversation — context:1 over 4 messages returns 3', `${v.context.length}`)
  ok(!v.context.some((c) => /line four/.test(c.content)),
    'V · ⭐⭐ …and the message outside the window is not present at all — not fetched, not filtered later')

  // ── A · ⭐⭐ ATTESTED — the case the reframe creates, and the one this check exists for ──────────
  // A memory owned by agent_dev, sourced from agent_dev_alt's conversation. `inScope` passes on the
  // MEMORY; the EVIDENCE must still be refused.
  const crossMem = await mkMemory(users.agent_dev, source.id)
  // The conversation the cross-room memory came from — needed to assert the handle points at the right one.
  const [{ cid: crossConvId }] = await Q(
    `SELECT m.conversation_id::text AS cid FROM persona_sotera.txn_memories mem
       JOIN persona_sotera.txn_messages m ON m.id = mem.source_message_id
      WHERE mem.id = :id`, { id: crossMem })
  const devStore = createSequelizeMemoryStore({ db, persona: PERSONA, userId: users.agent_dev })
  const a = await devStore.getSource({ id: crossMem, context: 2 })
  ok(a.found === true, 'A · the MEMORY is still returned — it is hers, and it stands', `found=${a.found}`)
  ok(a.evidenceState === 'source-unreadable',
    'A · ⭐⭐ …and the EVIDENCE is refused: evidenceState=source-unreadable, the state that did not exist before', a.evidenceState)
  ok(a.context === undefined, 'A · ⭐⭐ NO message content in the refused payload', `context=${JSON.stringify(a.context)}`)
  // ⚠️⚠️ THIS ASSERTION WAS REWRITTEN FOR P4 RATHER THAN LEFT GREEN, AND THE REASON IS THE POINT.
  // It used to read *"no title and no conversation id either — a title is content, an id is a handle to
  // it"*, and after P4 it would still have PASSED — because the handle is called
  // `sourceConversationHandle`, not `conversationId`. ⛔ A test that survives a change by virtue of a
  // FIELD RENAME is a test that has stopped describing the system, which is the exact failure this suite
  // exists to prevent. So the claim now states what is actually true.
  ok(a.conversationTitle === undefined,
    'A · ⭐ still no title — a title is a topic its owner chose, which is content')
  // ⭐⭐ P4 (2026-08-21): the refusal now carries the OPAQUE HANDLE, deliberately, because without it the
  // refusal was a dead end — she could learn that a memory came from somewhere unreadable and had nothing
  // that could be authorized. Ote: *"memory → source conversation handle → request_room_access →
  // inspect_around… The memory provenance should tell her where the memory came from, but it must not
  // automatically authorize access to that source conversation."*
  ok(typeof a.sourceConversationHandle === 'string' && a.sourceConversationHandle.length === 36,
    'A · ⭐⭐⭐ the refusal carries the OPAQUE HANDLE — the ability to ASK, which is what was missing',
    String(a.sourceConversationHandle))
  ok(a.sourceConversationHandle === crossConvId,
    'A · …and it identifies the conversation the memory actually came from')
  // ⛔ AND THE HANDLE IS NOT AN AUTHORIZATION. Same store, same handle, still refused: the grant is a
  // stored human answer, and nothing about holding a handle produces one.
  ok(a.evidenceState === 'source-unreadable' && a.context === undefined,
    'A · ⭐⭐ holding the handle changed NOTHING about what she may read — still attested, still no content')
  const flat = JSON.stringify(a)
  ok(!/SOURCE — the sentence|line one|line three|line four/.test(flat),
    'A · ⭐⭐ …and no fragment of ANY message text appears anywhere in the payload')
  ok(!/zz_test EVIDENCE fixture/.test(flat), 'A · …nor the conversation title')
  // ⚠️ AND NO VECTORS. `res.memory` used to be the RAW ROW — measured at ~119,000 bytes per memory, of
  // which ~45,700 was the `embedding` jsonb, and migration 019 just added `embedding_hv` beside it. This
  // object is a TOOL RESULT: the raw row spent a large slice of her context window on float arrays she
  // cannot use. ⛔ Vectors are what the store SEARCHES with, never what a reader reads.
  ok(a.memory && !('embedding' in a.memory) && !('embedding_hv' in a.memory) && !('slot_embedding' in a.memory),
    'A · ⭐⭐ the returned memory carries NO vectors — a tool result is not a place to spend context on floats',
    `${Object.keys(a.memory || {}).length} field(s), ${JSON.stringify(a.memory || {}).length} bytes`)
  ok(Boolean(a.learnedOn) && a.learnedHere === false,
    'A · ⭐ but it DOES carry safe provenance — when, and that it was not here', `learnedOn=${a.learnedOn}`)
  ok(/cannot be inspected from this context/.test(String(a.note)),
    'A · ⭐⭐ …and says the evidence is UNREACHABLE, never that it does not exist', a.note)

  // ── D · DESTROYED — the reference resolves to nothing. The memory survives. ─────────────────────
  const goneId = '00000000-0000-4000-8000-0000000000ff'
  const danglingMem = await mkMemory(users.agent_dev, goneId)
  const d = await devStore.getSource({ id: danglingMem })
  ok(d.found === true && d.evidenceState === 'source-destroyed', 'D · a dangling reference ⇒ evidenceState=source-destroyed', d.evidenceState)
  ok(/no longer exists/.test(String(d.note)), 'D · …and says so', d.note)
  ok(d.sourceMessageId === goneId,
    'D · ⭐ the dangling pointer is RETAINED — it is the attestation, and what keeps `destroyed` distinguishable from `unattested`')

  // ── U · UNATTESTED — no reference was ever recorded. ────────────────────────────────────────────
  const bareMem = await mkMemory(users.agent_dev, null)
  const u = await devStore.getSource({ id: bareMem })
  ok(u.found === true && u.evidenceState === 'source-never-recorded', 'U · no reference ⇒ evidenceState=source-never-recorded', u.evidenceState)
  ok(u.note === undefined, 'U · ⭐ and NO "deleted" note — never knowing is not the same as having lost it')

  // ── S · the four states are distinct values, so a caller cannot collapse them ───────────────────
  const states = [v.evidenceState, a.evidenceState, d.evidenceState, u.evidenceState]
  ok(new Set(states).size === 4, 'S · ⭐⭐ FOUR distinct states, never two', states.join(' · '))

  // ── Z · the memory guard itself still holds (the check that already existed) ────────────────────
  const z = await devStore.getSource({ id: ownMem })
  ok(z.found === false, "Z · another scope's memory is still refused outright — the first authorization is unchanged")
} finally {
  for (const id of MADE.memories) await X('DELETE FROM persona_sotera.txn_memories WHERE id = :id', { id })
  for (const id of MADE.conversations) {
    await X('DELETE FROM persona_sotera.txn_messages WHERE conversation_id = :id', { id })
    await X('DELETE FROM persona_sotera.txn_conversations WHERE id = :id', { id })
  }
  const [{ n: strays }] = await Q(
    "SELECT count(*)::int AS n FROM persona_sotera.txn_memories WHERE content LIKE 'zz_test%'")
  const [{ n: strayC }] = await Q(
    "SELECT count(*)::int AS n FROM persona_sotera.txn_conversations WHERE title LIKE 'zz_test%'")
  ok(strays === 0 && strayC === 0, 'Z · ⭐ the fixture left nothing behind', `${strays} memory, ${strayC} conversation`)
  await seq.close().catch(() => {})
}

done()
