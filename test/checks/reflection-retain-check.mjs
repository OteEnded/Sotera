// ⭐⭐⭐ `retain()` — THE DECISION-SHAPED INTERFACE, PROVED DETERMINISTICALLY. ⛔ ZERO MODEL CALLS.
//
//   node test/checks/reflection-retain-check.mjs
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
//   A · the five receipt states, each meaning exactly one thing
//   B · ⭐⭐⭐ THE FOUR AXES, INDEPENDENTLY — owner · formation room · reachability · subject.
//       Ote: *"make the red-proofs genuinely capable of catching accidental coupling between them."*
//   C · the invariants that must not move
//   D · red-proofs, including one that only passes if the axes are NOT derived from each other
//
// ⛔ Runs as agent_dev. Every fixture is removed at the end.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('reflection-retain')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const MARK = 'zz_retain_'
let fastify = null

try {
  const { loadConfig } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const config = loadConfig()
  const db = await initDB()
  const log = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, child() { return this } }
  fastify = { db, log, config }

  const { buildRetention } = await import('../../Backend/app/components/retention-host.js')
  const { REFLECTION_WRITE_TOOLS, REFLECTION_TOOL_GENERATION } = await import('../../Backend/app/components/reflection-lifecycle.js')
  const { toolDefinitions } = await import('../../Backend/app/components/runtime.js')

  const agent = await one(`select id::text, username, person_id::text from ${S}.mst_users where username='agent_dev'`)
  const persona = await one(`select id::text from ${S}.mst_persons where kind='persona' limit 1`)
  const user = { id: agent.id, username: agent.username, isRoot: false, roles: ['admin'] }
  // ⚠️ A CONVERSATION ID IS PART OF THE PRODUCTION SHAPE, and omitting it changed the row this check
  // produced: `lesson-host` tags `source` as `lesson:<conversationId>` and falls back to a bare `lesson`
  // without one — which `memory-lineage-check` does not recognise. ⭐ A harness that configures itself
  // differently from production tests a system nobody runs; that lesson has now cost twice.
  const convo = await one(`select id::text from ${S}.txn_conversations where user_id=$1 order by created_at desc limit 1`, [agent.id])
  const { retain } = buildRetention(fastify, { userId: agent.id, user, isRoot: false, conversationId: convo?.id ?? null })
  check('agent_dev resolves — ⛔ never root', Boolean(agent?.id && persona?.id))

  const decisions = async (state) => q(
    `select content, kind, mine, about, attribute, distinction, state, why, memory_id::text
       from ${S}.log_retention_decisions where content like $1 ${state ? 'and state=$2' : ''} order by created_at`,
    state ? [`${MARK}%`, state] : [`${MARK}%`])
  const memRow = async (id) => one(
    `select id::text, author, user_id::text, scope::text, subject_person_id::text, entity, attribute, content
       from ${S}.txn_memories where id=$1`, [id])

  // ── A · THE FIVE RECEIPT STATES ────────────────────────────────────────────────────────────────

  // A1 · PERSISTED — a lesson with its distinction
  const r1 = await retain({
    content: `${MARK}I state absence as a finding without checking the store first`,
    kind: 'lesson', mine: true,
    distinction: 'not having checked vs having checked and found nothing',
  })
  check('A1 · ⭐⭐ a lesson PERSISTS', r1?.state === 'persisted', `${r1?.state} — ${r1?.why ?? ''}`)
  check('A1 · ⭐⭐⭐ and it carries a REAL row id — ⛔ not a queued receipt', Boolean(r1?.memoryId))
  check('A1 · the row actually exists', Boolean(await memRow(r1.memoryId)))

  // A2 · UNREPRESENTED — a novel practice, which the closed label set cannot express
  const r2 = await retain({ content: `${MARK}I slow down when someone is tired`, kind: 'practice', mine: true })
  check('A2 · ⭐⭐⭐ a NOVEL practice is UNREPRESENTED — ⛔ not refused, ⛔ not coerced into a note',
    r2?.state === 'unrepresented', `${r2?.state}`)
  check('A2 · ⛔ and it carries NO id', !r2?.memoryId)
  const d2 = (await decisions('unrepresented'))[0]
  check('A2 · ⭐⭐ THE DECISION IS RECORDED, verbatim, with why',
    d2?.content?.includes('slow down when someone is tired') && /practice label/i.test(String(d2?.why)),
    String(d2?.why ?? '').slice(0, 80))
  check('A2 · ⛔⛔ AND NO MEMORY ROW EXISTS FOR IT — a decision is not a memory',
    (await q(`select 1 from ${S}.txn_memories where content like $1`, ['%slow down when someone is tired%'])).length === 0)

  // A3 · REFUSED — mine undeclared
  const r3 = await retain({ content: `${MARK}something`, kind: 'note' })
  check('A3 · ⭐ an undeclared owner is REFUSED — the existing gate, reached not re-implemented',
    r3?.state === 'refused' && /whose memory/i.test(String(r3?.why)), `${r3?.state}`)

  // A4 · REFUSED — a fact with no attribute is not coerced into a note
  const r4 = await retain({ content: `${MARK}they prefer English`, kind: 'fact', mine: true, about: 'zz_someone' })
  check('A4 · ⛔ a fact without an attribute is REFUSED, ⛔ never guessed into a slot',
    r4?.state === 'refused' && /attribute/i.test(String(r4?.why)), `${r4?.state}`)

  // A6 · ⭐⭐⭐ A REFLECTION DECISION IS ALWAYS HERS — the live run caught this one escaping.
  // ⚠️ On the first live pass she said `mine:false` about a user preference and the row landed
  // `author='account'` — a reflection's conclusion filed as the ACCOUNT'S memory, which is the
  // family-lineage shape rebuilt through a new door.
  const r7 = await retain({ content: `${MARK}they prefer plain corrections`, kind: 'fact', mine: false, attribute: `${MARK}p` })
  check('A6 · ⭐⭐⭐ mine:false is REFUSED from a reflection — retention here is Sotera-owned',
    r7?.state === 'refused' && /is mine/i.test(String(r7?.why)), `${r7?.state}`)
  check('A6 · ⛔ and it says WHERE "about them" belongs — a question, ⛔ not a silent correction',
    /`?about`?/.test(String(r7?.why)), String(r7?.why ?? '').slice(0, 70))
  check('A6 · ⛔⛔ AND NO account-authored row exists from any retain call',
    (await q(`select 1 from ${S}.txn_memories where author='account' and (content like $1 or attribute like $1)`, [`${MARK}%`])).length === 0)

  // A5 · every state that happened was recorded
  const all = await decisions()
  check('A5 · ⭐ EVERY decision was recorded, whatever became of it', all.length >= 4, `${all.length}`)
  check('A5 · ⭐⭐ and memory_id is set ONLY on persisted — the receipt contract',
    all.every((d) => (d.state === 'persisted') === Boolean(d.memory_id)),
    all.map((d) => `${d.state}:${d.memory_id ? 'id' : '-'}`).join(' '))

  // ── B · ⭐⭐⭐ THE FOUR AXES, EACH FROM ITS OWN COLUMN ──────────────────────────────────────────
  // A fact she keeps as HERS about someone ELSE — the shape that separates all four at once.
  const r5 = await retain({
    content: `${MARK}zzsubject prefers plain corrections`,
    kind: 'fact', mine: true, about: 'zz_subject', attribute: `${MARK}pref`,
  })
  check('B0 · the four-axis fixture persisted', r5?.state === 'persisted', `${r5?.state} — ${r5?.why ?? ''}`)
  const row = await memRow(r5.memoryId)

  check('B1 · ⭐ OWNER — author=persona, because SHE said mine:true',
    row?.author === 'persona', `${row?.author}`)
  check('B2 · ⭐ FORMATION ROOM — user_id is the room it happened in, ⛔ NOT an owner',
    row?.user_id === agent.id, `${row?.user_id === agent.id ? 'agent_dev room' : row?.user_id}`)
  check('B3 · ⭐ REACHABILITY — scope=room, ⛔ and reflection has no `everywhere`',
    row?.scope === 'room', `${row?.scope}`)
  // ⚠️ The store NORMALISES an entity label (`norm()` collapses punctuation), so `zz_subject` is stored
  // as `zz subject`. ⭐ Asserting the raw string would be asserting my input rather than the axis.
  check('B4 · ⭐ SUBJECT — the entity is who it is ABOUT, ⛔ not who owns it',
    row?.entity === 'zz subject', `${row?.entity}`)

  // ⭐⭐⭐ THE COUPLING TESTS — each axis must be able to differ from the others.
  check('B5 · ⭐⭐ OWNER ≠ SUBJECT: hers, about someone else — both true at once',
    row?.author === 'persona' && row?.entity === 'zz subject')
  check('B6 · ⭐⭐ OWNER ≠ ROOM: authored by the persona, formed in an ACCOUNT\'s room',
    row?.author === 'persona' && row?.user_id === agent.id)
  check('B7 · ⭐⭐ OWNER ≠ REACHABILITY: hers, and reachable from ONE room only',
    row?.author === 'persona' && row?.scope === 'room')
  check('B8 · ⭐⭐ SUBJECT ≠ ROOM: the subject is not the room\'s account holder',
    row?.entity === 'zz subject' && row?.subject_person_id !== agent.person_id)

  // ⭐⭐⭐ AND THE ONE THAT CATCHES DERIVATION: a SECOND row differing in exactly ONE axis must differ
  // in that axis ALONE. ⛔ If any axis were computed from another, this pair would move together.
  const r6 = await retain({
    content: `${MARK}I tend to ask before assuming`,
    kind: 'note', mine: true,   // ⭐ same owner, same room, same scope — ⛔ DIFFERENT subject (none given)
  })
  const row6 = await memRow(r6.memoryId)
  check('B9 · ⭐⭐⭐ changing ONLY the subject moves ONLY the subject',
    row6?.author === row?.author && row6?.user_id === row?.user_id && row6?.scope === row?.scope
      && row6?.entity !== row?.entity,
    `author=${row6?.author} room=${row6?.user_id === agent.id} scope=${row6?.scope} entity=${row6?.entity}`)

  // ── C · INVARIANTS ─────────────────────────────────────────────────────────────────────────────
  check('C1 · ⭐ the reflection surface is exactly [retain, decline_to_remember]',
    JSON.stringify(REFLECTION_WRITE_TOOLS) === JSON.stringify(['retain', 'decline_to_remember']),
    REFLECTION_WRITE_TOOLS.join(','))
  check('C2 · ⛔ remember_fact is STILL withheld from reflection',
    !REFLECTION_WRITE_TOOLS.includes('remember_fact'))
  check('C3 · ⛔ and so are the five specialised doors',
    !['remember', 'save_lesson', 'propose_lesson', 'note_own_practice'].some((t) => REFLECTION_WRITE_TOOLS.includes(t)))
  check('C4 · ⭐ the tool generation is 2, and separate from the prompt generation',
    REFLECTION_TOOL_GENERATION === 2)
  check('C5 · ⭐ `retain` is actually INSTALLED, not merely declared',
    (toolDefinitions() || []).some((d) => d?.function?.name === 'retain'))
  const retainDef = (toolDefinitions() || []).find((d) => d?.function?.name === 'retain')
  check('C6 · ⛔⛔ and NO TOOL NAME appears in its parameters — the abstraction is decision-shaped',
    !/remember|save_lesson|note_own_practice|keep\b/.test(JSON.stringify(retainDef?.function?.parameters ?? {})),
    Object.keys(retainDef?.function?.parameters?.properties ?? {}).join(','))
  check('C7 · ⛔ `mine` is NOT schema-required — the refusal must be a legible question',
    !(retainDef?.function?.parameters?.required ?? []).includes('mine'))
  check('C8 · ⛔ the historical corpus is still generation 1, and untouched',
    Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where tool_generation=1`)).n) >= 81
    && Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where tool_generation is null`)).n) === 0)

  // ── D · RED-PROOFS ─────────────────────────────────────────────────────────────────────────────
  // D1 · the database refuses an id on a non-persisted state — the receipt contract, enforced below us
  let bit = false
  try {
    await pg.query(`insert into ${S}.log_retention_decisions (content, state, memory_id) values ($1,'accepted',gen_random_uuid())`, [`${MARK}redproof`])
  } catch { bit = true }
  check('D1 · ⭐⭐ the DATABASE refuses an id on a non-persisted state', bit)

  let bit2 = false
  try {
    await pg.query(`insert into ${S}.log_retention_decisions (content, state) values ($1,'persisted')`, [`${MARK}redproof`])
  } catch { bit2 = true }
  check('D2 · ⭐⭐ and refuses `persisted` with NO id — ⛔ accepted can never become persisted',
    bit2)
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  try { await pg.query(`delete from ${S}.txn_memories where content like $1 or attribute like $1`, [`${MARK}%`]) } catch { /* none */ }
  // ⚠️ A LESSON ROW IS STORED UNDER ITS DISTINCTION, not under the content — so the marker never matched
  // it and five rows leaked across five runs before `memory-lineage-check` caught them. ⛔ Delete by the
  // distinction this check actually used.
  try { await pg.query(`delete from ${S}.txn_memories where content = $1`, ['not having checked vs having checked and found nothing']) } catch { /* none */ }
  try { await pg.query(`delete from ${S}.txn_memories where content like '%slow down when someone is tired%'`) } catch { /* none */ }
  try { await pg.query(`delete from ${S}.log_retention_decisions where content like $1`, [`${MARK}%`]) } catch { /* none */ }
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
}

done()
