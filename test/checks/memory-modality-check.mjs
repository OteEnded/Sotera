// ⭐⭐⭐ MODALITY (031) + B2 — Ote's two rulings of 2026-08-26, asserted as live invariants.
//
//   node test/checks/memory-modality-check.mjs
//
// **A** *"figurative material should still be retainable, but it must not be flattened into
//        entity / attribute / value as though it were a literal fact."*
// **B2** *"it should stay in the system and remain available behind an explicit historical/why gate, but
//        it should not participate in normal retrieval as a current truth. I don't want us relying on
//        Sotera correctly interpreting a prose marker."*
//
// ⛔ Every write below is a fixture in agent_dev's own room and is removed at the end. ⛔ No historical
// row is read for classification, modified, or marked.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { readFileSync } from 'node:fs'
import { MODALITY_VALUES, slotViolation } from '../../Backend/app/components/memory-modality.js'

const { check, done } = makeChecker('memory-modality')
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows
const one = async (sql, p) => (await q(sql, p))[0]

// ── 1 · THE AXIS EXISTS AND CLASSIFIED NOTHING ───────────────────────────────────────────────────
const col = await one(
  `select data_type, udt_name, is_nullable, column_default from information_schema.columns
    where table_schema = $1 and table_name = 'txn_memories' and column_name = 'modality'`, [S])
ok(!!col, '1 · the modality column exists', col?.udt_name ?? '')
// ⚠️ NULLABLE WITH NO DEFAULT, AND BOTH HALVES MATTER. A default of `asserted` would rebuild the Rome
// bug on 92 rows silently; any other default would make a claim about material nobody has examined.
ok(col?.is_nullable === 'YES' && col?.column_default === null,
  '1 · ⭐⭐ nullable, no default — NULL means "nobody recorded it", ⛔ never "asserted"',
  `nullable=${col?.is_nullable} default=${col?.column_default ?? 'none'}`)

const enumVals = (await q(
  `select e.enumlabel v from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'memory_modality' order by e.enumsortorder`)).map((r) => r.v)
ok(enumVals.length === 5, '1 · the vocabulary is five, in the database as well as in code', enumVals.join(' '))
// ⭐ The DB enum and the JS module must not drift. Two vocabularies for one axis is how a value becomes
// storable and unrecognised, or recognised and unstorable.
ok([...enumVals].sort().join() === [...MODALITY_VALUES].sort().join(),
  '1 · ⭐ …and the database enum matches `memory-modality.js` exactly',
  `db=[${enumVals}] js=[${MODALITY_VALUES}]`)

const [{ n: classified }] = await q(`select count(*)::int n from ${S}.txn_memories where modality is not null`)
ok(classified === 0,
  '1 · ⛔⛔ NO historical row was classified — inferring a modality from stored prose would be the '
  + 'original flattening run a second time and called a repair', `${classified} classified`)

// ── 2 · THE SLOT RULE IS IN THE DATABASE, NOT ONLY IN THE STORE ──────────────────────────────────
// ⭐ The store gate is the loud half that explains itself; this half survives a writer nobody has
// written yet, a maintenance script, and a hand-typed UPDATE at 3am.
const ck = await one(
  `select pg_get_constraintdef(oid) def, convalidated from pg_constraint
    where conname = 'txn_memories_modality_slot_ck'`)
ok(!!ck, '2 · ⭐ the slot CHECK constraint exists')
ok(ck?.convalidated === true,
  '2 · ⭐⭐ …and it is VALIDATED — an unvalidated CHECK binds nothing already wrong', String(ck?.convalidated))
ok(/entity IS NULL/.test(ck?.def ?? '') && /attribute IS NULL/.test(ck?.def ?? '') && /value IS NULL/.test(ck?.def ?? ''),
  '2 · ⭐ …and it names all three slot columns', String(ck?.def ?? '').slice(0, 110))

const dev = await one(`select id from ${S}.mst_users where username = 'agent_dev'`)
ok(!!dev, '2 · the agent_dev fixture account exists')

const FIXTURE = '[modality-check fixture] test/checks/memory-modality-check.mjs'
const ids = []
const insert = (extra) => pg.query(
  `insert into ${S}.txn_memories (id, persona, user_id, scope, namespace, kind, content, source,
                                  author, tier, created_at, updated_at, modality, entity, attribute, value)
   values (gen_random_uuid(), null, $1, 'room', 'default', 'semantic', $2, 'model-tool',
           'persona', 'warm', now(), now(), $3, $4, $5, $6) returning id`,
  [dev.id, FIXTURE, extra.modality ?? null, extra.entity ?? null, extra.attribute ?? null, extra.value ?? null])

if (dev) {
  await pg.query(`delete from ${S}.txn_memories where content = $1`, [FIXTURE])

  // ⭐⭐⭐ THE ROME SHAPE, REFUSED BY THE DATABASE ITSELF.
  let refused = null
  try {
    await insert({ modality: 'figurative', entity: 'user', attribute: 'current goal', value: 'build Rome in one day' })
  } catch (e) { refused = e.message }
  ok(/modality_slot_ck/.test(refused ?? ''),
    '2 · ⭐⭐⭐ the DATABASE refuses a figurative statement written into a fact slot',
    String(refused ?? 'IT WAS ACCEPTED').slice(0, 90))

  // ⭐ …and the SAME material as prose is accepted. "Retainable" is satisfied by the prose route.
  const prose = await insert({ modality: 'figurative' })
  ids.push(prose.rows[0].id)
  ok(!!prose.rows[0].id, '2 · ⭐⭐ …and the same modality is accepted as PROSE — figurative stays retainable')

  // ⛔ An unrecorded modality in a slot must still be accepted, or every current writer breaks.
  const legacy = await insert({ entity: 'user', attribute: 'check fixture attr', value: 'v' })
  ids.push(legacy.rows[0].id)
  ok(!!legacy.rows[0].id, '2 · ⭐ an UNRECORDED modality in a slot is still accepted — the gate binds only writers that say')

  // ── 3 · B2 · A CONTRADICTED ROW LEAVES NORMAL RETRIEVAL ────────────────────────────────────────
  const target = ids[0]
  const msg = await one(
    `select m.id from ${S}.txn_messages m join ${S}.txn_conversations c on c.id = m.conversation_id
      where c.user_id = $1 order by m.created_at desc limit 1`, [dev.id])
  await pg.query(`update ${S}.txn_memories set contradicted_at = now(), contradicted_by_message_id = $2 where id = $1`,
    [target, msg?.id ?? null])

  // ⭐ THE EXCLUSION IS A **WHERE CLAUSE**, NOT A POST-FILTER, and this asserts it at the query level —
  // `recall({limit:6})` must still return six LIVE rows, not four after a filter shrank the page.
  const [{ n: visible }] = await q(
    `select count(*)::int n from ${S}.txn_memories
      where content = $1 and invalid_at is null and expired_at is null and contradicted_at is null`, [FIXTURE])
  ok(visible === 1, '3 · ⭐⭐ the contradicted fixture is out of the normal-retrieval predicate', `${visible} of 2 visible`)

  // ⛔ AND IT IS STILL THERE, IN FULL. *"I used to think X"* is true and worth keeping; a row that
  // silently vanished could be neither audited nor explained.
  const kept = await one(`select content, invalid_at, expired_at, contradicted_at from ${S}.txn_memories where id = $1`, [target])
  ok(kept?.content === FIXTURE && kept.invalid_at === null && kept.expired_at === null,
    '3 · ⭐⭐⭐ …and NOTHING was deleted — content, invalid_at and expired_at are untouched')

  // ⚠️ CONTRADICTED IS NOT ARCHIVED. Two states, two reads: `listArchived` is *"the ONLY read that
  // returns the dead"*, and a disputed-but-standing belief is not dead.
  const [{ n: inArchive }] = await q(
    `select count(*)::int n from ${S}.txn_memories
      where id = $1 and (invalid_at is not null or expired_at is not null)`, [target])
  ok(inArchive === 0, '3 · ⭐ contradicted ≠ archived — 030 keeps the two states apart', `${inArchive}`)

  // ⭐ The explicit gate returns it.
  const [{ n: throughGate }] = await q(
    `select count(*)::int n from ${S}.txn_memories
      where id = $1 and contradicted_at is not null and invalid_at is null and expired_at is null`, [target])
  ok(throughGate === 1, '3 · ⭐⭐ the historical gate\'s own predicate still reaches it')
}

// ── 4 · THE EXCLUSION IS WIRED IN EVERY READ PATH, NOT JUST ONE ──────────────────────────────────
// ⚠️ A SOURCE SCAN WITH ITS ANCHOR ASSERTED FIRST. A scan whose pattern stops matching reports a
// triumphant pass over nothing, and this project has four recorded instances of exactly that.
const storeSrc = readFileSync(new URL('../../Backend/app/components/memory-store-sequelize-host.js', import.meta.url), 'utf8')
const storeCode = storeSrc.replace(/^\s*\/\/[^\n]*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
ok(/visibleWhere|scopeClause/.test(storeCode), '4 · ⛔ ANCHOR: the scan can still see the store\'s read paths')
ok(/NOT_CONTRADICTED/.test(storeCode), '4 · ⭐ the ORM reads exclude contradicted rows')
ok(/contradicted_at IS NULL/.test(storeCode),
  '4 · ⭐⭐ …and so do the raw SQL search arms — both arms feed recall, so one alone would make her '
  + 'answer depend on which index happened to be installed')
ok(/findOwnLive[\s\S]{0,400}NOT_CONTRADICTED/.test(storeCode),
  '4 · ⭐⭐⭐ …and RECONCILE excludes them too — a repudiated belief must not shape what replaces it')
ok(/slotViolation/.test(storeCode), '4 · ⭐ the store enforces the modality slot gate on every write')

// ⭐ And the gate is reachable: a tool with no consumer is a capability she does not have.
const hostSrc = readFileSync(new URL('../../Backend/app/components/corrections-host.js', import.meta.url), 'utf8')
ok(/listContradicted/.test(hostSrc), '4 · ⭐ the corrections host reads through the store\'s gate')
const routeSrc = readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')
ok(/^\s*initCorrections\(\)/m.test(routeSrc), '4 · ⭐⭐ …and it is REGISTERED at boot, not merely written')
const personaJson = JSON.parse(readFileSync(new URL('../../Backend/app/components/persona.json', import.meta.url), 'utf8'))
ok(personaJson.components.some((c) => c.name === 'Corrections' && c.enabled),
  '4 · ⭐⭐ …and the Corrections tool is installed, so `recall_corrections` actually reaches her')

// ── 5 · C · ACT-CERTAINTY NO LONGER BECOMES A BELIEF'S CONFIDENCE ────────────────────────────────
// ⭐ Ote: *"no confidence migration… fix what confidence actually means going forward."* Both halves are
// asserted: the number stopped flowing into `confidence`, and ⛔ the existing values were left alone.
const idSrc = readFileSync(new URL('../../Backend/app/components/memory-identity-host.js', import.meta.url), 'utf8')
ok(/actCertainty/.test(idSrc),
  '5 · ⭐⭐ the identity interpreter\'s certainty is carried as `context.actCertainty` — a property of the ACT')
ok(/const \{ confidence: actCertainty, \.\.\.obs \} = o/.test(idSrc),
  '5 · ⭐⭐⭐ …and it is DESTRUCTURED OUT of the observation, so it cannot reach the confidence column')

// ⛔ THE EXISTING NUMBERS ARE UNCHANGED. They honestly record what the writers used to do, and repairing
// them would be dressing up history.
const conf = await q(`select confidence, count(*)::int n from ${S}.txn_memories
                       where content <> $1 group by confidence order by n desc`, [FIXTURE])
const distinct = conf.length
ok(distinct >= 7, '5 · ⛔ the existing confidence values are NOT migrated — still all of them, untouched',
  conf.map((c) => `${c.confidence ?? 'null'}×${c.n}`).join(' '))

// ── CLEANUP ──────────────────────────────────────────────────────────────────────────────────────
if (ids.length) await pg.query(`delete from ${S}.txn_memories where id = any($1::uuid[])`, [ids])
const [{ n: leftover }] = await q(`select count(*)::int n from ${S}.txn_memories where content = $1`, [FIXTURE])
ok(leftover === 0, '⭐ the fixture rows were removed', `${leftover} left behind`)

await pg.end()
done()
