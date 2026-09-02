// ⭐⭐⭐ IS A RETAINED PRACTICE ACTUALLY REACHABLE? — Ote's gate on the `persisted` ruling. ⛔ NO MODEL CALLS.
//
//   node test/checks/practice-reachability-check.mjs
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────────────────────────────
// Ote, 2026-09-02, ruling on the receipt semantics: *"use `persisted` to mean that the retention
// decision successfully became durable Sotera-owned state, regardless of which underlying storage
// represents it… One thing to verify before closing this: make sure txn_relational_records practice
// state is actually accessible through Sotera's normal memory/context retrieval path. Storage existing
// is not enough."*
//
// ⇒ ⭐ THE RULING IS CONDITIONAL ON A MEASUREMENT, and this is the measurement. `persisted` may only
// mean "durable Sotera-owned state" if the state is REACHABLE. A row nobody reads is not memory; it is
// residue. So this asserts the whole path and not the INSERT:
//
//   A · the write happens at all, and the row exists when `note()` returns
//   B · her MEMORY TOOL finds it            — `recall_own_memory` → withThisPerson
//   C · her CONTEXT finds it                — the Composer's relational-stance block
//   D · ⭐ the GRAIN is the PERSON, not the account — a second account of the same person reaches it
//   E · ⛔ and a DIFFERENT person does not — reachability is not a wildcard
//   F · ⚠️ provenance — what she is TOLD about where it came from
//
// ⛔ Runs as agent_dev. Every row it creates is removed at the end.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('practice-reachability')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

// ⛔ NEVER A FROZEN COUNT. 038's guard asserted 79 rows and the corpus had grown to 81 while we worked;
// `retention-occasion-check` asserted 77 for the same reason. ⭐ Capture the baseline, assert the DELTA.
const startedAt = new Date().toISOString()
let LABEL = null
let personId = null

try {
  const { loadConfig } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const config = loadConfig()
  const db = await initDB()
  const log = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, child() { return this } }
  const fastify = { db, log, config }

  const { buildRetention } = await import('../../Backend/app/components/retention-host.js')
  const { buildOwnMemory } = await import('../../Backend/app/components/own-memory-host.js')
  const { readOwnStance, renderOwnStance } = await import('../../Backend/app/components/relational-knowledge.js')
  const { STANCE_LABELS, STANCE_LABEL_KEYS } = await import('../../Backend/app/components/relational-taxonomy.js')
  // ⭐ PRODUCTION'S OWN READ. `getSetting` answers from a cache hydrated by `initSettings`, so a check
  // that skipped the hydration would read the config.json default and report the opposite of live.
  const { initSettings, getSetting } = await import('../../Backend/app/settings/index.js')
  await initSettings(db)

  const agent = await one(`select id::text, username, person_id::text as pid from ${S}.mst_users where username='agent_dev'`)
  const alt = await one(`select id::text, username, person_id::text as pid from ${S}.mst_users where username='agent_dev_alt'`)
  const other = await one(`select id::text, username, person_id::text as pid from ${S}.mst_users
                            where person_id is not null and person_id <> $1 and username <> 'ote' limit 1`, [agent?.pid])
  personId = agent?.pid ?? null
  check('P0 · agent_dev resolves to a person — ⛔ never root', Boolean(agent?.id && agent?.pid), `${agent?.username}`)
  check('P0 · a SECOND account of the SAME person exists (the grain probe)', Boolean(alt?.id && alt.pid === agent.pid), `${alt?.username}`)
  check('P0 · a DIFFERENT person exists (the boundary probe)', Boolean(other?.id), `${other?.username}`)

  // Pick a label this person does NOT already carry, so the assertion is about THIS write.
  const held = new Set((await q(`select label from ${S}.txn_relational_records where subject_person_id=$1`, [agent.pid])).map((r) => r.label))
  LABEL = STANCE_LABEL_KEYS.find((k) => !held.has(k)) ?? null
  check('P0 · a free label exists to test with', Boolean(LABEL), `${LABEL} (holds ${held.size})`)

  const convo = await one(`select id::text from ${S}.txn_conversations where user_id=$1 order by created_at desc limit 1`, [agent.id])
  const { retain } = buildRetention(fastify, { userId: agent.id, user: { id: agent.id, username: agent.username, isRoot: false, roles: ['admin'] }, isRoot: false, conversationId: convo?.id ?? null })

  // ── A · THE WRITE ─────────────────────────────────────────────────────────────────────────────
  const r = await retain({ content: LABEL, kind: 'practice', mine: true })
  // ⭐⭐⭐ OTE'S RULING, ASSERTED. *"A successful note_own_practice should return `persisted`, even though
  // it doesn't have a txn_memories ID. Don't weaken this to `accepted`."*
  check('A1 · ⭐⭐⭐ a successful practice note is PERSISTED — ⛔ never `accepted`', r?.state === 'persisted', `${r?.state} — ${r?.why ?? ''}`)
  check('A1 · ⭐ and it carries a real id', Boolean(r?.memoryId), `${r?.memoryId ?? 'none'}`)
  check('A1 · ⭐⭐ and NAMES the store the id belongs to — ⛔ not inferred from the kind',
    r?.store === 'txn_relational_records', `${r?.store}`)
  const row = await one(
    `select id::text, tier, label, origin::text as origin, conversation_count, window_start::text as ws
       from ${S}.txn_relational_records where subject_person_id=$1 and label=$2`, [agent.pid, LABEL])
  check('A2 · ⭐⭐ THE ROW EXISTS THE MOMENT retain() RETURNS — ⛔ not queued, not eventual', Boolean(row?.id), `${row?.id ?? 'none'}`)

  // ── B · HER MEMORY TOOL ───────────────────────────────────────────────────────────────────────
  const mine = await buildOwnMemory(fastify, { userId: agent.id, isRoot: false, user: { id: agent.id, isRoot: false } }).recall()
  const found = (mine?.withThisPerson?.items ?? []).find((i) => i.practiceLabel === LABEL)
  check('B1 · ⭐⭐⭐ `recall_own_memory` REACHES IT — the practice is in withThisPerson', Boolean(found),
    `${(mine?.withThisPerson?.items ?? []).length} item(s)`)
  check('B2 · ⭐ and it comes back as the TAXONOMY SENTENCE, ⛔ never the raw label',
    found?.statement === STANCE_LABELS[LABEL], `${found?.statement ?? '—'}`)
  check('B3 · ⛔ and it is NOT in keptByMe — a practice is not a txn_memories row wearing another name',
    !(mine?.keptByMe?.items ?? []).some((i) => String(i.statement ?? '').includes(LABEL)))

  // ── C · HER CONTEXT ───────────────────────────────────────────────────────────────────────────
  // ⚠️ THE INJECTION IS A SETTING, and the setting is what decides whether this state is context at all.
  const stanceOn = getSetting(config, 'memory.relationalStance') === true
  check('C1 · ⭐⭐ the Composer block is ENABLED in the live settings — ⛔ storage without injection is residue',
    stanceOn, `memory.relationalStance=${stanceOn}`)
  const stance = await readOwnStance({ db, personId: agent.pid })
  const block = renderOwnStance(stance, { subjectName: 'agent_dev' })
  check('C2 · ⭐⭐⭐ IT RENDERS INTO HER CONTEXT — the same read the chat route performs per turn',
    typeof block === 'string' && block.includes(STANCE_LABELS[LABEL]), `${String(block ?? '').slice(0, 60)}…`)
  check('C3 · ⭐ and the block says what it is NOT — she has invented a rapport from counts before',
    /not about them/i.test(String(block ?? '')))

  // ── D · ⭐ THE GRAIN IS THE PERSON ────────────────────────────────────────────────────────────
  // ⓘ Two accounts, one person. If this reached only the account that wrote it, "durable Sotera-owned
  // state" would be an overstatement — it would be durable ROOM state.
  const altRecall = await buildOwnMemory(fastify, { userId: alt.id, isRoot: false, user: { id: alt.id, isRoot: false } }).recall()
  check('D1 · ⭐⭐ A SECOND ACCOUNT OF THE SAME PERSON REACHES IT — person-grained, ⛔ not account-grained',
    (altRecall?.withThisPerson?.items ?? []).some((i) => i.practiceLabel === LABEL))

  // ── E · ⛔ AND THE BOUNDARY HOLDS ─────────────────────────────────────────────────────────────
  const otherRecall = await buildOwnMemory(fastify, { userId: other.id, isRoot: false, user: { id: other.id, isRoot: false } }).recall()
  check('E1 · ⛔ a DIFFERENT person does not see it — reachability is not a wildcard',
    !(otherRecall?.withThisPerson?.items ?? []).some((i) => i.practiceLabel === LABEL))
  const otherBlock = renderOwnStance(await readOwnStance({ db, personId: other.pid }), { subjectName: other.username })
  check('E2 · ⛔ nor does their context block carry it',
    !String(otherBlock ?? '').includes(STANCE_LABELS[LABEL]))

  // ── F · ⭐⭐ PROVENANCE — RULED, AND NOW ASSERTED ──────────────────────────────────────────────
  // Ote, 2026-09-02: *"origin:'instructed' is semantically wrong for a practice Sotera derived herself
  // during Reflection. Add: observed · instructed · reflection… Do not reinterpret it as observed or
  // instructed just to fit the existing vocabulary."*
  // ⚠️ This pair was a TRIPWIRE pinning the wrong behaviour, and it has now fired as designed.
  check('F1 · ⭐⭐⭐ a reflection-derived practice is stored origin=REFLECTION — ⛔ never instructed',
    row?.origin === 'reflection', `${row?.origin}`)
  check('F2 · ⭐⭐ and she is told SHE reached it — ⛔ not that the person said it',
    /reflecting on a conversation/.test(String(found?.howLearned ?? ''))
    && !/told you/.test(String(found?.howLearned ?? '')), `${found?.howLearned ?? '—'}`)
  // ⛔ AND THE TOOL'S OWN OCCASION IS UNCHANGED. `note_own_practice` exists because a person said something
  // about her practice, so its default must still be `instructed` — the occasion decides, not a flag.
  const { buildOwnMemory: bom } = await import('../../Backend/app/components/own-memory-host.js')
  const svc = bom(fastify, { userId: agent.id, isRoot: false, user: { id: agent.id, isRoot: false } })
  const spare = STANCE_LABEL_KEYS.find((k) => k !== LABEL && !held.has(k))
  const noted = await svc.note({ label: spare })
  check('F3 · ⭐ `note_own_practice` still defaults to INSTRUCTED — the occasion decides the provenance',
    noted?.ok === true && noted?.origin === 'instructed', `${noted?.origin}`)
  check('F4 · ⛔ and an unknown origin is REFUSED, ⛔ never coerced into a known one',
    (await svc.note({ label: spare, origin: 'zz_invented' }))?.ok === false)
  await pg.query(`delete from ${S}.txn_relational_records where subject_person_id=$1 and label=$2`, [agent.pid, spare])

  // ── THE RECEIPT AS IT STANDS TODAY ───────────────────────────────────────────────────────────
  const dec = await one(
    `select state, memory_id::text, store from ${S}.log_retention_decisions
      where user_id=$1 and content=$2 and created_at >= $3 order by created_at desc limit 1`, [agent.id, LABEL, startedAt])
  check('G1 · the decision was recorded', Boolean(dec), `${dec?.state ?? 'none'}`)
  check('G2 · ⭐⭐ and the RECORDED id is the row that actually exists — ⛔ not a second, unrelated uuid',
    dec?.memory_id === row?.id && dec?.store === 'txn_relational_records', `${dec?.memory_id} in ${dec?.store}`)
  console.log(`\n  ⓘ receipt: state=${r?.state} memory_id=${dec?.memory_id ?? 'null'} store=${dec?.store ?? 'null'}\n`)
} catch (e) {
  check('the check itself ran', false, e?.message)
} finally {
  // ⛔ CLEANUP IS NOT OPTIONAL. Five lesson rows leaked once because the marker never matched the stored
  // shape; a practice has no marker to carry, so it is removed by (person, label) and the decisions by
  // (user, content, time) — the three coordinates this run actually wrote under.
  try {
    if (personId && LABEL) {
      await pg.query(`delete from ${S}.txn_relational_records where subject_person_id=$1 and label=$2`, [personId, LABEL])
      await pg.query(`delete from ${S}.log_retention_decisions where content=$1 and created_at >= $2 and source='retain'`, [LABEL, startedAt])
    }
  } catch { /* cleanup is best-effort; the assertions above already ran */ }
  await pg.end()
  done()
}
