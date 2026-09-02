// ⭐⭐⭐ 035 · THE persona_global WRITE ROUTE — authority, storage semantics, and REACHABILITY.
//
//   node test/checks/persona-global-write-check.mjs
//
// ── WHAT THIS PROVES, AND WHY ⑥ IS THE ONE THAT MATTERS ─────────────────────────────────────────
// Ote, 2026-09-02: *"⑥ read-back from a different room. That's the one that proves we're actually
// implementing global reachability rather than merely writing a row with a different enum value."*
// ⇒ every other assertion here checks a COLUMN; ⑥ checks the PROPERTY the column exists to express.
//
// ── ⛔ AND THE AUTHORITY MODEL IT ASSERTS ────────────────────────────────────────────────────────
//   root                 → always authorized (config-defined, ⛔ never inferred from a NULL role)
//   explicit grant       → authorized (`mst_users.persona_global_write`, migration 035)
//   anyone else          → REFUSED, no row, refusal RECORDED. ⛔ Never downgraded to room scope.
//
// ⛔ Every fixture is removed at the end, INCLUDING the grant this check gives and takes back, and the
// two legacy persona_global rows are never read, modified or counted as ours.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('persona-global-write')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const ATTR = 'zz_global_probe'
const MARK = 'zz_global_'
let fastify = null

const globalRowsFor = async (attr) => q(
  `select scope::text, author::text, user_id::text, subject_person_id::text, value, content
     from ${S}.txn_memories where attribute = $1 and invalid_at is null`, [attr])

try {
  const { loadConfig } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const config = loadConfig()
  const db = await initDB()
  const log = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, child() { return this } }
  fastify = { db, log, config }

  const { buildMemoryPipeline } = await import('../../Backend/app/components/memory-pipeline-host.js')
  const { can } = await import('../../Backend/app/auth/permissions.js')

  // ── ROOMS ───────────────────────────────────────────────────────────────────────────────────────
  // ⛔ root's own room is used ONLY as the authority under test — nothing is written into it.
  const rootId = String(config?.auth?.root?.userConnected ?? '').toLowerCase()
  const agent = await one(`select id::text, person_id::text from ${S}.mst_users where username='agent_dev'`)
  const other = await one(`select id::text from ${S}.mst_users where username='kavi'`)
  const persona = await one(`select id::text from ${S}.mst_persons where kind='persona' limit 1`)
  check('rooms resolve: root (config), agent_dev, and a second room to read back from',
    Boolean(rootId && agent?.id && other?.id && persona?.id))
  check('⭐ root is config-defined, ⛔ not derived from a NULL role',
    (await one(`select 1 x from ${S}.mst_users where id=$1`, [rootId]))?.x === 1, rootId.slice(0, 8))

  const pipelineFor = (userId, scope) => buildMemoryPipeline(fastify, {
    userId, serializeCommits: true, author: 'persona', scope,
  }).pipeline
  const obs = (value) => ({ type: 'fact', entity: 'sotera', attribute: ATTR, value })

  // ── ① THE PERMISSION IS ITS OWN, AND SEPARATE ──────────────────────────────────────────────────
  const caps = { isRoot: false, memoryAccessScope: 'sotera_memory', crossRoomConversations: true }
  check('① ⛔ the DISCLOSURE permissions do NOT grant the write — they are separate levers',
    can(caps, 'write_persona_global_memory') === false, 'sotera_memory + cross_room ⇒ no write grant')
  check('① ⛔ admin role does not grant it either — Ote refused admin by name',
    can({ roles: ['admin'] }, 'write_persona_global_memory') === false)
  check('① ⭐ root does, and an explicit grant does',
    can({ isRoot: true }, 'write_persona_global_memory') === true
    && can({ personaGlobalWrite: true }, 'write_persona_global_memory') === true)
  check('① ⚠️ and it FAILS CLOSED on a missing field',
    can({}, 'write_persona_global_memory') === false && can(null, 'write_persona_global_memory') === false)

  // ── ② AN UNPERMITTED ROOM IS REFUSED ───────────────────────────────────────────────────────────
  const refusalsBefore = Number((await one(`select count(*)::int n from ${S}.log_memory_refusals`)).n)
  const denied = await pipelineFor(other.id, 'persona_global').ingest(obs('zz_global_denied'))
  check('② ⛔ an unpermitted room is REFUSED', denied.ok === false, `ok=${denied.ok}`)
  check('② ⭐ with the classification carried out (M2-16 + M2-17 on the automatic path)',
    denied.code === 'PERSONA_GLOBAL_SCOPE', `code=${denied.code}`)
  check('② ⛔ and NO row was written — ⛔ NOT downgraded to room scope',
    (await globalRowsFor(ATTR)).length === 0, `${(await globalRowsFor(ATTR)).length} row(s)`)
  const refusalRow = await one(
    `select refusal_class::text cls, author from ${S}.log_memory_refusals order by created_at desc limit 1`)
  check('② ⭐ the refusal was RECORDED, not merely thrown',
    Number((await one(`select count(*)::int n from ${S}.log_memory_refusals`)).n) === refusalsBefore + 1
    && refusalRow?.cls === 'persona-global-unauthorized-room', `${refusalRow?.cls}`)

  // ── ③ author='account' + global is a CONTRADICTION, refused even for an authorized room ────────
  const wrongAuthor = await buildMemoryPipeline(fastify, {
    userId: rootId, serializeCommits: true, author: 'account', scope: 'persona_global',
  }).pipeline.ingest(obs('zz_global_wrong_author'))
  check('③ ⛔ author=account + persona_global is refused even in ROOT\'s room',
    wrongAuthor.ok === false && wrongAuthor.code === 'PERSONA_GLOBAL_SCOPE', `code=${wrongAuthor.code}`)
  check('③ ⭐ and it is recorded as the AUTHOR class, not the authority class',
    (await one(`select refusal_class::text cls from ${S}.log_memory_refusals order by created_at desc limit 1`))?.cls
      === 'persona-global-requires-persona-author')

  // ── ④ ROOT WRITES GLOBALLY ─────────────────────────────────────────────────────────────────────
  const asRoot = await pipelineFor(rootId, 'persona_global').ingest(obs('zz_global_from_root'))
  check('④ ⭐ root\'s room writes persona_global', asRoot.ok === true, `ok=${asRoot.ok} code=${asRoot.code}`)

  // ── ⑤ AN EXPLICITLY PERMITTED ROOM WRITES GLOBALLY ─────────────────────────────────────────────
  await pg.query(`update ${S}.mst_users set persona_global_write = true where id = $1`, [agent.id])
  const granted = await pipelineFor(agent.id, 'persona_global').ingest(obs('zz_global_from_grant'))
  check('⑤ ⭐⭐ an explicitly permitted account writes persona_global — ⛔ without pretending to be root',
    granted.ok === true, `ok=${granted.ok} code=${granted.code}`)

  // ── ⑥ THE FIELDS, ON THE ROWS THAT LANDED ──────────────────────────────────────────────────────
  const rows = await globalRowsFor(ATTR)
  const fromGrant = rows.find((r) => r.value === 'zz_global_from_grant')
  check('⑥ scope = persona_global', fromGrant?.scope === 'persona_global', `${fromGrant?.scope}`)
  check('⑥ ⭐ author = persona — hers, not the account holder\'s', fromGrant?.author === 'persona', `${fromGrant?.author}`)
  check('⑥ ⭐ subject = Sotera the persona', fromGrant?.subject_person_id === persona.id)
  check('⑥ ⭐⭐ user_id = the FORMATION ROOM, ⛔ never NULL (029 — where it happened, not where it is read)',
    fromGrant?.user_id === agent.id, `${fromGrant?.user_id === agent.id ? 'agent_dev' : fromGrant?.user_id}`)

  // ── ⑦ ⭐⭐⭐ READ-BACK FROM A DIFFERENT ROOM — the assertion that proves REACHABILITY ───────────
  const { createSequelizeMemoryStore } = await import('../../Backend/app/components/memory-store-sequelize-host.js')
  const otherRoomStore = createSequelizeMemoryStore({ db, userId: other.id, config })
  const visible = (await otherRoomStore.findVisible({})).filter((r) => r.attribute === ATTR)
  check('⑦ ⭐⭐⭐ a THIRD room, which wrote nothing, can READ both global rows',
    visible.length === 2, `${visible.length} visible from kavi's room`)

  // ── ⑧ AN ORDINARY ROOM MEMORY STAYS ROOM-SCOPED, AND IS NOT REACHABLE ─────────────────────────
  const ordinary = await pipelineFor(agent.id, 'room').ingest(
    { type: 'fact', entity: 'sotera', attribute: `${ATTR}_room`, value: 'zz_global_ordinary' })
  check('⑧ an ordinary keep still writes', ordinary.ok === true, `ok=${ordinary.ok} code=${ordinary.code}`)
  const roomRow = (await globalRowsFor(`${ATTR}_room`))[0]
  check('⑧ ⛔ NO accidental promotion — it is room-scoped', roomRow?.scope === 'room', `${roomRow?.scope}`)
  const visibleRoom = (await otherRoomStore.findVisible({})).filter((r) => r.attribute === `${ATTR}_room`)
  check('⑧ ⭐ and it is INVISIBLE from the other room — the negative half of ⑦',
    visibleRoom.length === 0, `${visibleRoom.length} visible`)

  // ── ⑩ ⭐⭐⭐ THROUGH THE REAL FRONT DOOR — `keep()`, the tool she actually calls ────────────────
  // ⚠️ Everything above drives the PIPELINE. This drives `buildRetention().keep()`, which is where the
  // declaration is first read, where `can()` is consulted, and where the store is built for the scope she
  // asked for. ⛔ Without this the tool front door had no test at all, and a route is not built until the
  // door people use is the one that was proved.
  const { buildRetention } = await import('../../Backend/app/components/retention-host.js')
  const { buildMemoryV2 } = await import('../../Backend/app/components/memory-v2-host.js')
  // ⚠️⚠️ `keep()` RETURNS BEFORE THE WRITE HAPPENS, and sleeping on it is not a test — it is a race with
  // a nicer name. The tool answers `{ok:true, queued:true}` synchronously so the model's turn never
  // blocks on a CPU embed, and the real work runs on the serial lane. ⭐ `WRITE_LANES` is module-level
  // and keyed by (persona, userId), so a throwaway service in the SAME scope hands back that very lane —
  // which is precisely what `_drainWrites` documents itself as being for.
  // ⓘ This is the `queued ≠ written` gap Ote has tracked separately since M2-17. ⛔ Not papered over
  // here: it is the reason this drain exists, and a sleep would have hidden it.
  // ⚠️⚠️ AND NOTHING BELOW PASSES `persona`. `DEFAULT_PERSONA` is NULL and the tool path never supplies
  // one, so a check that hardcoded 'sotera' would build a DIFFERENT write lane (`WRITE_LANES` is keyed
  // by persona|userId) — this drain returned instantly on an empty lane and the rows it was waiting for
  // were still in flight. ⭐ A harness that configures itself differently from production tests a
  // system nobody runs.
  const drain = (userId) => buildMemoryV2(fastify, { userId })._drainWrites()
  const rootUser = { isRoot: true }
  const plainUser = { isRoot: false, roles: ['admin'], memoryAccessScope: 'sotera_memory' }
  const KEPT = `${ATTR}_keep`

  const keepAs = (userId, user) => buildRetention(fastify, { userId, user, isRoot: user?.isRoot === true }).keep

  // ⑩a · ROOM A (root's room) writes something true of her everywhere.
  const keptGlobal = await keepAs(rootId, rootUser)({
    what: 'zz_global_ I think in measurements before conclusions.',
    kind: 'fact', attribute: KEPT, mine: true, everywhere: true,
  })
  check('⑩a ⭐⭐ keep({mine:true, everywhere:true}) SUCCEEDS from root\'s room',
    keptGlobal?.ok === true, JSON.stringify(keptGlobal?.refused ?? keptGlobal?.ok))

  // ⚠️ The write is queued on the serial lane; drain it before reading, or this races the assertion.
  await drain(rootId)
  const keptRow = (await globalRowsFor(KEPT))[0]
  check('⑩a scope = persona_global · author = persona · subject = Sotera · user_id = root\'s room',
    keptRow?.scope === 'persona_global' && keptRow?.author === 'persona'
    && keptRow?.subject_person_id === persona.id && keptRow?.user_id === rootId,
    `${keptRow?.scope}/${keptRow?.author}/${keptRow?.user_id === rootId ? 'root-room' : keptRow?.user_id}`)

  // ⑩b · ROOM B reads it back. ⭐ The capability, end to end, through the door she uses.
  const roomBStore = createSequelizeMemoryStore({ db, userId: other.id, config })
  check('⑩b ⭐⭐⭐ ROOM B reads what ROOM A wrote — global reachability through the real front door',
    (await roomBStore.findVisible({})).some((r) => r.attribute === KEPT))

  // ⑩c · an UNPERMITTED account is refused AT THE DOOR, with a sentence rather than a thrown error.
  const keptDenied = await keepAs(other.id, plainUser)({
    what: 'zz_global_ this should not become globally true.',
    kind: 'fact', attribute: `${KEPT}_denied`, mine: true, everywhere: true,
  })
  check('⑩c ⛔ an unpermitted account (even admin + sotera_memory) is refused at the door',
    keptDenied?.ok === false && keptDenied?.refused === 'global_not_authorized', `${keptDenied?.refused}`)
  check('⑩c ⭐ and the refusal is a SENTENCE she can act on, ⛔ not an internal code',
    typeof keptDenied?.why === 'string' && !/PERSONA_GLOBAL_SCOPE|persona_global/.test(keptDenied.why),
    keptDenied?.why ?? '')
  check('⑩c ⛔ and nothing was written', (await globalRowsFor(`${KEPT}_denied`)).length === 0)

  // ⑩d · `everywhere` without `mine` is a contradiction, refused before authority is even consulted.
  const keptNotMine = await keepAs(rootId, rootUser)({
    what: 'zz_global_ a fact about someone else cannot be true of me everywhere.',
    kind: 'fact', attribute: `${KEPT}_notmine`, mine: false, everywhere: true,
  })
  check('⑩d ⛔ everywhere + mine:false is refused — WHERE it is true and WHOSE it is stay separate',
    keptNotMine?.ok === false && keptNotMine?.refused === 'global_requires_mine', `${keptNotMine?.refused}`)

  // ⑩e · ⭐ AND THE ORDINARY PATH IS UNTOUCHED — the same door, no declaration.
  const keptOrdinary = await keepAs(rootId, rootUser)({
    what: 'zz_global_ an ordinary memory of this room.',
    kind: 'fact', attribute: `${KEPT}_ordinary`, mine: true,
  })
  await drain(rootId)
  const ordinaryRow = (await globalRowsFor(`${KEPT}_ordinary`))[0]
  check('⑩e ⭐ an ordinary keep() still succeeds and stays ROOM-scoped',
    keptOrdinary?.ok === true && ordinaryRow?.scope === 'room', `ok=${keptOrdinary?.ok} scope=${ordinaryRow?.scope}`)

  // ── ⑨ 029 IS UNCHANGED ────────────────────────────────────────────────────────────────────────
  // ⚠️ THE COUNT WAS 2 AND IS NOW 3, AND THE THIRD IS THE POINT. The Rome reconciliation added a
  // persona-global identity row whose scope was **DECLARED** under 035 — ⛔ not acquired as a side effect of
  // `kind='identity'`, which is exactly how the two legacy rows got there. ⇒ asserting a bare count would
  // now be asserting that 035 never got used. ⭐ What must stay true is that the two LEGACY rows are
  // untouched and that anything new arrived through the declared route.
  const globalIdentity = await q(
    `select left(id::text,8) id, author::text author, source, modality::text modality
       from ${S}.txn_memories where scope='persona_global' and kind='identity' order by created_at`)
  const legacy = globalIdentity.filter((r) => !String(r.source ?? '').startsWith('reconcile:'))
  check('⑨ ⛔ the two LEGACY persona_global rows are still exactly two, and untouched',
    legacy.length === 2 && legacy.every((r) => r.author === 'account' && r.modality === null),
    legacy.map((r) => `${r.id}:${r.author}`).join(' '))
  check('⑨b ⭐⭐ and any newer one came through the DECLARED route — hers, and modality-marked',
    globalIdentity.filter((r) => String(r.source ?? '').startsWith('reconcile:'))
      .every((r) => r.author === 'persona' && r.modality === 'figurative'),
    globalIdentity.map((r) => `${r.id}:${r.author}/${r.modality ?? '—'}`).join(' '))
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  try { await pg.query(`delete from ${S}.txn_memories where attribute like $1`, [`${ATTR}%`]) } catch { /* nothing written */ }
  try { await pg.query(`delete from ${S}.log_memory_refusals where proposed_value like $1`, [`${MARK}%`]) } catch { /* none */ }
  // ⛔ THE GRANT IS TAKEN BACK. A test that leaves a standing write permission behind has changed the
  // system it was measuring — and this is the one permission where that matters most.
  try { await pg.query(`update ${S}.mst_users set persona_global_write = false`) } catch { /* none */ }
  try { await fastify?.db?.sequelize?.close?.() } catch { /* already closed */ }
  await pg.end()
}

done()
