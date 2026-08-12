// THE MEMORY SEAM'S CONTRACTS — including, deliberately, what happens when a dependency is ABSENT.
//
//   node --test "unit/**/*.test.mjs"
//
// ⚠️ THESE ARE HERE BECAUSE OTE ASKED FOR THEM BY NAME: *"preserve the existing degradation behavior as
// an explicit tested contract."* Every degradation asserted below was previously a COMMENT — true, but
// unenforced, and therefore one refactor away from silently stopping being true. A promise nobody tests
// is a promise that quietly stops being kept, and every silent-degradation bug in this system's history
// had a correct comment sitting above it.
//
// 🔑 The rule these contracts encode (Ote, 2026-08-11): **a component boundary follows what happens when
// the dependency disappears** — not shared tables, not conceptual relatedness.
//
//     MemoryStore absent  → memory is BROKEN            → fail loudly, by name
//     SlotStore absent    → bookkeeping SKIPPED         → memory still works, silently
//     text index absent   → lexical arm returns []      → recall continues, dense-only
//     vector index absent → dense arm returns NULL      → recall falls back to JS cosine
//     conversations absent→ getSource returns no context→ that is SUCCESS, not failure
//
// No database and no server: these are the CONTRACTS, not the queries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MEMORY_STORE_METHODS, SLOT_STORE_METHODS, NULL_SLOT_STORE,
  assertMemoryStore, resolveSlotStore,
} from '../../Backend/app/components/memory-store-port.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'

// ── a models bag good enough to construct against, with the query arm under our control ──────────
function fakeDb({ queryThrows = false, withConversations = true } = {}) {
  const calls = { create: [], update: [], increment: [], query: 0 }
  const txn_memories = {
    getTableName: () => ({ tableName: 'txn_memories', schema: 'persona_sotera' }),
    async create(row) { calls.create.push(row); return { get: () => ({ id: 'new-id', ...row }) } },
    async update(patch, opts) { calls.update.push({ patch, where: opts?.where }); return [1] },
    async increment(field, opts) { calls.increment.push({ field, where: opts?.where }); return [1] },
    async findAll() { return [] },
    async findOne() { return null },
    async count() { return 0 },
    sequelize: {
      async query() {
        calls.query++
        if (queryThrows) throw new Error('column "content_tsv" does not exist')
        return []
      },
    },
  }
  const db = { txn_memories }
  if (withConversations) { db.txn_messages = { async findOne() { return null }, async findAll() { return [] } } }
  return { db, calls }
}
const store = (opts) => createSequelizeMemoryStore({ db: fakeDb(opts).db, persona: null, userId: 'u1' })

// ═══ THE SEAM ITSELF ════════════════════════════════════════════════════════════════════════════

test('the Sequelize store satisfies the MemoryStore port in full', () => {
  assert.equal(assertMemoryStore(store(), 'SequelizeMemoryStore') !== null, true)
  for (const m of MEMORY_STORE_METHODS) assert.equal(typeof store()[m], 'function', `missing ${m}`)
})

test('a db with no txn_memories is refused at construction, not at first query', () => {
  assert.throws(() => createSequelizeMemoryStore({ db: {} }), /db\.txn_memories is required/)
})

test('MemoryStore ABSENT or INCOMPLETE fails LOUDLY, naming what is missing', () => {
  assert.throws(() => assertMemoryStore(null), /expected an object/)
  assert.throws(() => assertMemoryStore({ findVisible() {} }), /missing 12 method\(s\)/)
  // named, not just counted — the point is that the error tells you what to go and write
  assert.throws(() => assertMemoryStore({ findVisible() {} }), /findOwnLive/)
})

// ═══ DEGRADATION — ABSENT IS LEGAL, BROKEN IS NOT ═══════════════════════════════════════════════

test('SlotStore ABSENT → the no-op store, silently. Memory must still write.', async () => {
  const s = resolveSlotStore(null)
  assert.equal(s, NULL_SLOT_STORE)
  // the "nothing here" values must leave the caller's logic intact: a fact writes with slot_id null,
  // and the slot view is built purely from ephemeral descriptors, exactly as it was pre-Phase-6.
  assert.equal(await s.ensure({ entity: 'user', canonicalLabel: 'x' }), null)
  assert.equal(await s.get('anything'), null)
  assert.deepEqual(await s.list(), [])
  assert.equal(await s.recordAlias({}, 'x'), false)
  await s.touch({}) // must not throw
  assert.equal(s.isDisabled, true)
})

test('SlotStore PRESENT BUT BROKEN → throws. "not provided" and "provided broken" are DIFFERENT.', () => {
  // ⚠️ Falling back to the no-op here would turn a wiring bug into months of quietly missing slot
  // identity: every fact writing slot_id null, every reworded belief splitting into a new concept,
  // and nothing anywhere saying so.
  assert.throws(() => resolveSlotStore({ ensure() {}, get() {} }), /provided but is incomplete/)
  assert.throws(() => resolveSlotStore({ ensure() {}, get() {} }), /recordAlias, touch, list/)
  assert.throws(() => resolveSlotStore('nope'), /expected an object or null/)
})

test('a complete SlotStore passes through untouched', () => {
  const real = Object.fromEntries(SLOT_STORE_METHODS.map((m) => [m, () => {}]))
  assert.equal(resolveSlotStore(real), real)
})

test('NO TEXT INDEX → lexicalSearch returns [], and warns only ONCE', async () => {
  const { db, calls } = fakeDb({ queryThrows: true })
  const warns = []
  const s = createSequelizeMemoryStore({ db, userId: 'u1', log: { warn: (_, m) => warns.push(m) } })
  assert.deepEqual(await s.lexicalSearch({ query: 'hello' }), [], 'first call degrades to []')
  assert.deepEqual(await s.lexicalSearch({ query: 'again' }), [], 'and stays degraded')
  assert.equal(warns.length, 1, 'a missing index must not log once per query')
  assert.equal(calls.query, 1, 'and must not keep hitting the database after latching')
})

test('NO VECTOR INDEX → denseRelevances returns NULL, never an empty Map', async () => {
  // ⚠️ THE DISTINCTION IS LOAD-BEARING. null = "I cannot answer, fall back to in-JS cosine".
  // An empty Map = "I answered, nothing is relevant" → recall returns nothing and looks like amnesia.
  const { db } = fakeDb({ queryThrows: true })
  const s = createSequelizeMemoryStore({ db, userId: 'u1' })
  const r = await s.denseRelevances({ qVec: [0.1, 0.2] })
  assert.equal(r, null)
  assert.notEqual(r instanceof Map, true, 'an empty Map here would read as "nothing matched"')
})

test('an empty/absent query vector also yields null, not a wrong answer', async () => {
  const s = store()
  assert.equal(await s.denseRelevances({ qVec: [] }), null)
  assert.equal(await s.denseRelevances({}), null)
  assert.deepEqual(await s.lexicalSearch({ query: '   ' }), [], 'blank query is not a search')
})

// ═══ SCOPE IS THE STORE'S BUSINESS ══════════════════════════════════════════════════════════════

test('create() STAMPS scope — the component never passes persona or user_id', async () => {
  const { db, calls } = fakeDb()
  const s = createSequelizeMemoryStore({ db, persona: 'p1', userId: 'u1' })
  await s.create({ kind: 'semantic', content: 'x' })
  assert.equal(calls.create[0].persona, 'p1')
  assert.equal(calls.create[0].user_id, 'u1')
})

test('...and enforces identity-is-persona-global rather than trusting every caller', async () => {
  const { db, calls } = fakeDb()
  const s = createSequelizeMemoryStore({ db, persona: 'p1', userId: 'u1' })
  await s.create({ kind: 'identity', content: 'x' })
  assert.equal(calls.create[0].user_id, null, 'identity rows belong to the persona, not to a user')
})

test('update() takes IDS, never a predicate — and no ids is a no-op, not a full-table write', async () => {
  const { db, calls } = fakeDb()
  const s = createSequelizeMemoryStore({ db, userId: 'u1' })
  assert.equal(await s.update([], { pinned: true }), 0)
  assert.equal(await s.update(null, { pinned: true }), 0)
  assert.equal(calls.update.length, 0, 'an empty id list must never reach the database')
  await s.update('one-id', { pinned: true })
  assert.deepEqual(calls.update[0].where, { id: ['one-id'] }, 'a bare id is accepted and normalised')
})

test('touch() is telemetry — it must NEVER throw into the read that triggered it', async () => {
  const db = {
    txn_memories: {
      getTableName: () => ({ tableName: 't', schema: null }),
      async increment() { throw new Error('db went away mid-read') },
      async update() { return [0] },
    },
  }
  const s = createSequelizeMemoryStore({ db, userId: 'u1' })
  await s.touch(['a', 'b']) // swallowed by design: recency bookkeeping is not a belief change
  assert.equal(await s.touch([]), undefined)
})

// ═══ getSource — kept inside MemoryStore, and degradable ════════════════════════════════════════

test('getSource with NO conversation tables returns the memory and no context — that is SUCCESS', async () => {
  const db = {
    txn_memories: {
      getTableName: () => ({ tableName: 't', schema: null }),
      async findOne() { return { id: 'm1', user_id: 'u1', source_message_id: 'msg1', source: 'conversation:c1' } },
    },
    // deliberately no txn_messages: a host may legitimately have memory and no chat history
  }
  const s = createSequelizeMemoryStore({ db, userId: 'u1' })
  const r = await s.getSource({ id: 'm1' })
  assert.equal(r.found, true, 'the memory is still returned')
  assert.equal(r.sourceMessageId, 'msg1', 'and what it points at is still reported')
  assert.equal(r.context, undefined, 'only the surrounding conversation is missing')
})

test('getSource on a row OUT OF SCOPE reads as absent, never as a hit', async () => {
  const db = {
    txn_memories: {
      getTableName: () => ({ tableName: 't', schema: null }),
      async findOne() { return { id: 'm1', user_id: 'SOMEONE-ELSE' } },
    },
  }
  const s = createSequelizeMemoryStore({ db, userId: 'u1' })
  assert.deepEqual(await s.getSource({ id: 'm1' }), { found: false })
})

test('getSource still refuses a missing id — a bug is not a degradation', async () => {
  await assert.rejects(() => store().getSource({}), /id is required/)
})
