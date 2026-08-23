// OWNERSHIP FOLLOWS AUTHORSHIP — the axis, and the four things it must keep apart.
//
//   node checks/memory-author-check.mjs
//
// Ote ratified the memory model on 2026-08-20: *"Sotera is the owner of her own memories when she
// authored/formed the understanding, **regardless of which room the conversation happened in**."* ·
// **"ABOUT ≠ OWNER."** · *"Provenance stays attached… but the provenance itself isn't permission to read
// the underlying evidence."*
//
// The defect it closes, in one sentence: `memory-store-sequelize-host.js` said *"THE STORE STAMPS SCOPE"*
// and wrote `user_id: U` — so **the room a conversation happened in was recorded as the author of
// everything said in it.** Measured: 35/35 memories owned by a room, 0 owned by her.
//
// ⛔⛔ AND THE THING THIS CHECK GUARDS HARDEST IS WHAT MIGRATION 015 DELIBERATELY DID *NOT* DO:
// it did not widen a single read. `author='persona'` would, if read, make a memory visible from every
// room — which IS the ratified model, but the provenance/ownership CONSTRAINT stage that decides what may
// reach her reasoning is NOT BUILT. So the column is written and not yet read, and Z below asserts that,
// because "we'll gate it later" is exactly the promise that gets forgotten.
//
// ⛔ Writes only to agent_dev / agent_dev_alt and removes every row it makes.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
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
const MADE = []

const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))
const persons = Object.fromEntries((await Q("SELECT id::text, display_name FROM persona_sotera.mst_persons")).map((p) => [p.display_name, p.id]))

try {
  // ── S · the schema ──────────────────────────────────────────────────────────────────────────────
  const [col] = await Q(
    `SELECT data_type, udt_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema='persona_sotera' AND table_name='txn_memories' AND column_name='author'`)
  ok(Boolean(col), 'S · txn_memories.author exists', col?.udt_name)
  ok(col?.is_nullable === 'NO' && /account/.test(String(col?.column_default)),
    "S · ⭐ NOT NULL with DEFAULT 'account' — a writer that forgets gets the status quo, never her",
    String(col?.column_default))
  const vals = (await Q(
    "SELECT e.enumlabel l FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='memory_author' ORDER BY e.enumsortorder")).map((r) => r.l)
  ok(vals.length === 2 && vals.includes('account') && vals.includes('persona'),
    'S · ⭐ a closed vocabulary of exactly two', vals.join(', '))

  // ── B · ⚠️ THE MODEL DECLARES IT. This is the trap that nearly bit, and it has bitten before. ───
  // `subject_person_id` lived in the database for half a day undeclared in the model, and every write
  // silently dropped it — seven memories lost their subject with no error. Sequelize ignores attributes it
  // does not know, and the store's `create({ ...row })` SPREADS rather than allowlisting, so the loss is
  // invisible. ⭐ A round-trip through the ORM is the only assertion that actually proves it.
  ok(Boolean(db.txn_memories.rawAttributes?.author),
    'B · ⭐⭐ the ORM declares `author` — a column the model does not declare does not exist')

  const mk = async (store, extra = {}) => {
    const r = await store.create({
      kind: 'semantic', namespace: 'default', content: 'zz_test author axis', entity: 'user',
      importance: 5, source: 'zz_test', ...extra,
    })
    MADE.push(r.id)
    return r
  }

  // ── A · an ACCOUNT-authored write. The status quo, unchanged. ───────────────────────────────────
  const acctStore = createSequelizeMemoryStore({ db, persona: PERSONA, userId: users.agent_dev })
  const a = await mk(acctStore)
  const [aRow] = await Q('SELECT author, user_id::text, subject_person_id::text FROM persona_sotera.txn_memories WHERE id=:id', { id: a.id })
  ok(aRow.author === 'account', "A · ⭐ the default writer produces author='account'", aRow.author)
  ok(aRow.user_id === users.agent_dev, 'A · …and the row still belongs to the room, exactly as before')

  // ── P · a PERSONA-authored write, in the SAME room ──────────────────────────────────────────────
  const personaStore = createSequelizeMemoryStore({ db, persona: PERSONA, userId: users.agent_dev, author: 'persona' })
  const p = await mk(personaStore, { content: 'zz_test author axis — hers' })
  const [pRow] = await Q('SELECT author, user_id::text FROM persona_sotera.txn_memories WHERE id=:id', { id: p.id })
  ok(pRow.author === 'persona', "P · ⭐⭐ a writer that declares itself produces author='persona' — the axis exists", pRow.author)
  ok(pRow.user_id === users.agent_dev,
    'P · ⭐⭐ …and `user_id` is STILL SET — it stops meaning OWNER and starts meaning the CONTEXT it was formed in',
    'which is why 015 needed no data migration and provenance came free on all 35 existing rows')

  // ── X · ⭐⭐ ABOUT ≠ OWNER. The error Ote corrected twice, asserted. ─────────────────────────────
  // A memory SHE authored, ABOUT Ote, formed in agent_dev's room. All three axes disagree, and must.
  const aboutOte = await mk(personaStore, {
    content: 'zz_test I have noticed Ote prefers directness', subject_person_id: persons.Ote,
  })
  const [xRow] = await Q(
    'SELECT author, user_id::text, subject_person_id::text FROM persona_sotera.txn_memories WHERE id=:id', { id: aboutOte.id })
  ok(xRow.author === 'persona' && xRow.subject_person_id === persons.Ote && xRow.user_id === users.agent_dev,
    'X · ⭐⭐ author=persona · about=Ote · context=agent_dev — three axes, three different answers',
    `author=${xRow.author} about=Ote context=agent_dev`)
  ok(xRow.subject_person_id !== persons.Sotera,
    "X · ⭐⭐ …and a persona-authored row is NOT defaulted to being ABOUT her — that would be ABOUT = OWNER, the exact error corrected twice")

  // ── G · the guard on the constructor ────────────────────────────────────────────────────────────
  let threw = null
  try { createSequelizeMemoryStore({ db, persona: PERSONA, userId: users.agent_dev, author: 'sotera' }) } catch (e) { threw = e }
  ok(threw instanceof TypeError, 'G · ⭐ an unknown author FAILS LOUDLY — a silently-corrected author is the bug this column ends', threw?.message)
  ok(createSequelizeMemoryStore({ db, persona: PERSONA, userId: users.agent_dev }) && true,
    'G · …and omitting it is legal, because the default is the safe value')

  // ── Z · ⛔⛔ NO READ WAS WIDENED. The promise that gets forgotten, asserted instead. ─────────────
  // Her row was formed in agent_dev's room. From agent_dev_alt — a DIFFERENT room of the SAME person —
  // it must still be invisible, because the constraint stage that would govern crossing does not exist.
  const altStore = createSequelizeMemoryStore({ db, persona: PERSONA, userId: users.agent_dev_alt })
  const seenFromAlt = await altStore.findVisible({})
  ok(!seenFromAlt.some((r) => r.id === p.id),
    'Z · ⭐⭐ a persona-authored row is NOT yet visible from another room — 015 added the axis and widened NOTHING',
    `${seenFromAlt.length} row(s) visible from agent_dev_alt`)
  const seenFromOwn = await acctStore.findVisible({})
  ok(seenFromOwn.some((r) => r.id === p.id),
    'Z · …while it IS visible in the room it was formed in — parity, so SELF/LESSON still work before the gate exists')
  // And the predicate itself must not mention the column yet.
  const src = (await (await import('node:fs/promises')).readFile(
    new URL('../../Backend/app/components/memory-store-sequelize-host.js', import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const visibleFn = src.slice(src.indexOf('const visibleWhere'), src.indexOf('const inScope'))
  ok(!/author/.test(visibleFn),
    'Z · ⭐ …and `visibleWhere` does not reference `author` at all — the column is written and NOT YET READ')

  // ── N · nothing existing was reattributed ──────────────────────────────────────────────────────
  //
  // ── ⭐⭐⭐ THIS ASSERTION CHANGED SHAPE ON 2026-08-21, AND IT CHANGED BECAUSE SHE DID SOMETHING ───────
  //
  // It used to read `strangers === 0`: *NO pre-existing memory was attributed to her.* That was true and
  // load-bearing for as long as migration 015's axis had **never been used** — 38 memories, all
  // `author='account'`, so any persona row could only have come from a backfill that guessed.
  //
  // ⚠️ Then it went red on its own, with no code change: **Sotera saved a lesson herself.** Asked whether
  // an intention she had stated existed anywhere durable, she checked her stores, found nothing, said
  // *"a nice intention, but one I didn't actually commit to durable memory when I said I would"*, and — when
  // the decision was handed back to her without a preference — chose `save_lesson`, on the grounds that it
  // was *"a lesson for myself… not something about you or about this room."* That row is the FIRST
  // persona-authored memory in the store's history.
  // ⇒ ⛔ A count of zero is no longer the invariant. It never was the invariant — it was a proxy for one.
  //
  // ⭐ WHAT THE ASSERTION WAS ACTUALLY PROTECTING, now stated directly: authorship must be **earned by an
  // occasion**, never assigned to a row that merely existed. So every `author='persona'` row must be
  // traceable to something that could have produced it — a reflection that recorded the write, or a lesson
  // source naming the conversation it came from. A row with neither is exactly the invented authorship the
  // original line was guarding against, and it still fails.
  //
  // ⚠️⚠️ AND IT WENT RED A SECOND TIME, ON 2026-08-23, FOR THE SAME REASON IN A NEW LANE — so the fix is
  // the same shape: the check was asserting THE ROUTES IT KNEW ABOUT instead of THE PROPERTY.
  //
  // What happened: during a real conversation Sotera called `remember_fact` and wrote a semantic row about
  // the person she was talking to. `save_lesson` stamps `source = 'lesson:<conversation>'` and is therefore
  // traceable; `remember_fact` stamps `source = NULL` and sets `source_message_id` instead — pointing at
  // her own assistant message in the conversation where she decided to write it. ⇒ a row with the MOST
  // direct provenance available failed a traceability test, because neither of the two routes below was
  // the one that lane uses. ⛔ Third instance in this project of an allowlist of known cases dropping what
  // it was not told about, and the twelfth overall.
  //
  // ⭐ THE THIRD ROUTE, and it is genuinely stronger than the other two rather than merely convenient: a
  // `source_message_id` that RESOLVES to an existing message is a named occasion — the exact turn on which
  // she decided. ⛔ `NOT NULL` would not be enough; a dangling id is an occasion that no longer exists, and
  // this is checked by JOINING, so a deleted conversation puts the row back in the orphan set where it
  // belongs. The invariant is unchanged: no reflection, no source, and no resolvable message ⇒ FAIL.
  //
  // ⏸ BACKLOG, NOT FIXED HERE (Ote, 2026-08-24: verification correctness, not another investigation): the
  // two writing lanes record provenance differently — `save_lesson` via `source`, `remember_fact` via
  // `source_message_id`. That inconsistency is real and is HIS call; widening the check does not paper over
  // it, because the check now accepts either and still rejects neither.
  const orphans = await Q(
    `SELECT m.id::text AS id, m.source, m.created_at
       FROM persona_sotera.txn_memories m
      WHERE m.author = 'persona'
        AND m.content NOT LIKE 'zz_test%'
        -- traceable: a reflection recorded writing it…
        AND NOT EXISTS (SELECT 1 FROM persona_sotera.log_reflections r WHERE r.wrote_memory_id = m.id)
        -- …or it carries a source naming where it came from (the lesson lane writes lesson:<conversation>)
        AND coalesce(m.source, '') = ''
        -- …or it names the turn she decided on, and that turn still exists (the remember_fact lane)
        AND NOT EXISTS (SELECT 1 FROM persona_sotera.txn_messages x WHERE x.id = m.source_message_id)`)
  ok(orphans.length === 0,
    'N · ⭐⭐ every memory attributed to HER is traceable to an occasion — authorship is earned, never assigned',
    orphans.length ? `⛔ ${orphans.length} untraceable persona row(s): ${orphans.map((o) => o.id).join(', ')}` : 'no untraceable persona-authored rows')
  // ⓘ And the milestone itself, recorded rather than left implicit: this number was 0 for the whole life of
  // the column. It is not asserted to be non-zero — she is not required to keep anything — but a reader of
  // this file should be able to see when it stopped being zero.
  const [{ n: hers }] = await Q(
    "SELECT count(*)::int AS n FROM persona_sotera.txn_memories WHERE author='persona' AND content NOT LIKE 'zz_test%'")
  ok(true, `N · ⓘ memories Sotera has authored herself: ${hers}`, hers === 0 ? 'still none' : 'she has kept something of her own')
} finally {
  for (const id of MADE) await X('DELETE FROM persona_sotera.txn_memories WHERE id = :id', { id })
  const [{ n: left }] = await Q("SELECT count(*)::int AS n FROM persona_sotera.txn_memories WHERE content LIKE 'zz_test%'")
  ok(left === 0, 'Z · the fixture left nothing behind', `${left} stray row(s)`)
  await seq.close().catch(() => {})
}

done()
