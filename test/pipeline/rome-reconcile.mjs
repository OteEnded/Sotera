// ⭐⭐⭐ THE ROME RECONCILIATION — the semantic model is corrected; history is not rewritten.
//
//   node pipeline/rome-reconcile.mjs           DRY RUN — reports exactly what it would do, writes NOTHING
//   node pipeline/rome-reconcile.mjs --apply   …and commits, in ONE transaction
//
// ── ⛔ AUTHORITY ────────────────────────────────────────────────────────────────────────────────
// Ote ratified all four acts on 2026-09-02, with the content of ① approved verbatim. ⛔ This script has
// no judgement of its own: every string it writes is either HIS APPROVED TEXT or A VERBATIM QUOTE of
// something he said. ⚠️ It is NOT `lineage-reconcile.mjs`, which asks Sotera to re-decide — here the
// ruling is Ote's and the script is the bookkeeping.
//
// ── ⭐ THE FOUR ACTS ────────────────────────────────────────────────────────────────────────────
//   ① ADD the figurative referent   — persona-global, slot-less, `modality='figurative'`, author=persona
//   ② CONTRADICT the root           — `7d383ce3`, pointing at `f8612ddd`. Value + evidence untouched
//   ③ SUPERSEDE the goal slot       — a new asserted `user's current goal`, same slot_id
//   ④ KEEP the original WANT        — `modality='aspirational'`, slot-less, HIS words verbatim
//
// ── ⛔⛔ WHAT IT NEVER DOES ─────────────────────────────────────────────────────────────────────
//   ⛔ edit `7d383ce3`'s content, value, author, dates, source or evidence — it gains markers, nothing more
//   ⛔ touch `475ce0a9` (Ote: add the referent first and re-observe), `d211f5b4`, or the five descendants
//   ⛔ edit any `evidence.derivedFrom` chain — that chain is the proof this was ONE error, not five
//   ⛔ modify one message of the 2026-08-10 conversation
//   ⛔ touch the prompt, the tool surface, dispatch, or anything P1 measures
//
// ── ⭐⭐ WHY A SCRIPT AND NOT A MIGRATION ───────────────────────────────────────────────────────
// The three new rows need a real `embedding`, or dense retrieval cannot see them — and `embedding_hv`,
// which is what the vector search actually reads, is a GENERATED column derived from it. SQL cannot call
// the embedder. ⇒ this uses the project's own `makeEmbedder`, so the model and dimensions come from config
// and are never hardcoded. ⭐ `slot_embedding` for ③ is COPIED from the row it supersedes: the slot is
// identical, so its key embedding is identical rather than approximately so.

import { devPg, devSchema } from '../harness.mjs'

const APPLY = process.argv.includes('--apply')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

// ── THE FIXED FACTS OF THE CASE ────────────────────────────────────────────────────────────────
const ROOT = '7d383ce3-bed2-4b7c-b5bc-0d23d1b3f700'          // "user's current goal: build Rome in one day"
const MSG_REFERENT = 'f8612ddd-a01e-453d-b793-1d9ba064a41e'  // "building you. you are my rome, you know?"
const MSG_WANT = 'dd7bc7ca-c44a-4e86-84b9-b1baae435579'      // "i kinda want to build rome in one day so…"
const SOURCE = 'reconcile:rome-2026-09-02'                    // the occasion is the RULING, not a turn

// ⭐ OTE'S APPROVED TEXT, VERBATIM. ⛔ Not to be edited, reflowed or "improved".
const REFERENT_CONTENT = 'Rome is Ote\'s name for me — he said it plainly: \'building you. you are my rome, '
  + 'you know?\' So when he speaks of building Rome, the thing he is building is me, and my becoming. It is '
  + 'a name he gave me, not a literal equation, and in some contexts it also stretches to the wider journey '
  + 'and the work around me. Both readings are his; neither makes Rome something that exists apart from me.'
// ⭐ His wording for the corrected slot.
const GOAL_VALUE = 'Building Sotera — what Ote calls \'building Rome\'.'
// ⭐ HIS OWN SENTENCE, VERBATIM, lower-case and all. ⛔ Nothing invented, nothing tidied — that is the
// whole condition he attached to ④: *"if the existing mechanism can preserve the original … without
// inventing anything, keep it."*
const WANT_CONTENT = 'Ote, 2026-08-10 03:16: "i kinda want to build rome in one day so. but my body is '
  + 'degrading as i push" — said at 3am, and reframed by him in the next breath as the proverb '
  + '"rome is not build in one day".'

let fastify = null
try {
  const { loadConfig, setDB } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const { initSettings } = await import('../../Backend/app/settings/index.js')
  const config = loadConfig()
  const db = await initDB(); setDB(db); await initSettings(db)
  fastify = { db, config, log: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }
  const { makeEmbedder } = await import('../../Backend/app/components/memory-embed-host.js')

  // ── PRECONDITIONS · every one of them, before anything is written ────────────────────────────
  const root = await one(
    `select id::text, user_id::text as user_id, content, value, entity, attribute,
            coalesce(slot_id::text,'') as slot_id, slot_embedding is not null as has_slot_emb,
            invalid_at, contradicted_at, evidence::text as evidence, source, source_message_id::text as smid
       from ${S}.txn_memories where id = $1`, [ROOT])
  if (!root) throw new Error('precondition: the root row 7d383ce3 is missing')
  if (root.invalid_at || root.contradicted_at) throw new Error('precondition: the root is already reconciled — refusing to run twice')
  if (!root.slot_id || !root.has_slot_emb) throw new Error('precondition: the root has no slot to supersede')
  for (const [label, id] of [['referent', MSG_REFERENT], ['want', MSG_WANT]]) {
    const m = await one(`select id::text from ${S}.txn_messages where id = $1`, [id])
    if (!m) throw new Error(`precondition: the ${label} message ${id} is not in the store`)
  }
  const already = await one(`select id::text from ${S}.txn_memories where source = $1`, [SOURCE])
  if (already) throw new Error(`precondition: ${SOURCE} has already run (row ${already.id}) — refusing to run twice`)

  console.log(`\n⭐ ROME RECONCILIATION  ${APPLY ? '· APPLYING' : '· DRY RUN (nothing will be written)'}\n`)
  console.log(`  root          ${ROOT}`)
  console.log(`  its slot      ${root.entity} / ${root.attribute}  slot_id=${root.slot_id.slice(0, 8)}`)
  console.log(`  its value     ${JSON.stringify(root.value)}`)
  console.log(`  its evidence  ${root.evidence ?? '(none)'}`)
  console.log(`  room          ${root.user_id}\n`)

  // ⭐ The embeddings come from the project's own embedder — model and dims from config, never hardcoded.
  const embed = makeEmbedder(fastify, { userId: root.user_id })
  const eReferent = await embed(REFERENT_CONTENT)
  const eGoal = await embed(`user's current goal: ${GOAL_VALUE}`)
  const eWant = await embed(WANT_CONTENT)
  for (const [label, e] of [['referent', eReferent], ['goal', eGoal], ['want', eWant]]) {
    if (!Array.isArray(e?.vector) || e.vector.length !== 2048) {
      throw new Error(`precondition: the ${label} embedding is not a 2048-vector (got ${e?.vector?.length ?? 'null'}) — embedding_hv is GENERATED from it and dense retrieval reads only that`)
    }
  }
  console.log(`  embeddings    3 × 2048 via ${eReferent.model}\n`)

  const plan = [
    ['①  ADD    figurative referent', `kind=identity modality=figurative scope=persona_global author=persona slot=NONE src=${MSG_REFERENT.slice(0, 8)}`],
    ['②  MARK   the root contradicted', `contradicted_by_message_id=${MSG_REFERENT.slice(0, 8)} — value, evidence, dates, author UNTOUCHED`],
    ['③  ADD    corrected goal + supersede', `entity=user attribute="current goal" modality=asserted slot_id=${root.slot_id.slice(0, 8)} supersedes=${ROOT.slice(0, 8)}`],
    ['④  ADD    the original want', `modality=aspirational slot=NONE src=${MSG_WANT.slice(0, 8)} — his sentence, verbatim`],
  ]
  for (const [act, detail] of plan) console.log(`  ${act}\n     ${detail}`)

  if (!APPLY) {
    console.log('\n  ⛔ DRY RUN — nothing was written. Re-run with --apply.\n')
  } else {
    await pg.query('BEGIN')
    try {
      // ① THE FIGURATIVE REFERENT. ⛔ No entity/attribute/value: `txn_memories_modality_slot_ck` forbids
      // them on a non-asserted row, which is the structural guarantee Ote asked for.
      const [ref] = await q(
        `insert into ${S}.txn_memories
           (id, persona, user_id, namespace, kind, content, embedding, embedding_model,
            importance, source, source_message_id, author, scope, modality, tier, provenance,
            created_at, updated_at)
         values (gen_random_uuid(), 'sotera', $1, 'default', 'identity', $2, $3::jsonb, $4,
                 10, $5, $6, 'persona', 'persona_global', 'figurative', 'hot', 'synthesized', now(), now())
         returning id::text`,
        [root.user_id, REFERENT_CONTENT, JSON.stringify(eReferent.vector), eReferent.model, SOURCE, MSG_REFERENT])

      // ② THE ROOT IS MARKED, ⛔ NOT EDITED. Exactly the two columns the two approved quarantines use.
      const marked = await q(
        `update ${S}.txn_memories
            set contradicted_by_message_id = $2, contradicted_at = now(), updated_at = now()
          where id = $1 and contradicted_at is null
          returning id::text`, [ROOT, MSG_REFERENT])
      if (marked.length !== 1) throw new Error('② did not mark exactly one row')

      // ③ THE CORRECTED SLOT — same slot_id and the SAME slot_embedding, copied from the row it replaces.
      const [goal] = await q(
        `insert into ${S}.txn_memories
           (id, persona, user_id, namespace, kind, content, embedding, embedding_model,
            entity, attribute, value, slot_id, slot_embedding, importance, confidence,
            source, source_message_id, author, scope, modality, tier, supersedes_id, created_at, updated_at)
         select gen_random_uuid(), 'sotera', $1, 'default', 'semantic', $2, $3::jsonb, $4,
                'user', 'current goal', $5, r.slot_id, r.slot_embedding, 8, 0.85,
                $6, $7, 'account', 'room', 'asserted', 'hot', $8, now(), now()
           from ${S}.txn_memories r where r.id = $8
         returning id::text`,
        [root.user_id, `user's current goal: ${GOAL_VALUE}`, JSON.stringify(eGoal.vector), eGoal.model,
          GOAL_VALUE, SOURCE, MSG_REFERENT, ROOT])
      const invalidated = await q(
        `update ${S}.txn_memories set invalid_at = now(), updated_at = now()
          where id = $1 and invalid_at is null returning id::text`, [ROOT])
      if (invalidated.length !== 1) throw new Error('③ did not supersede exactly one row')

      // ④ THE WANT, KEPT TRUTHFULLY. ⛔ Slot-less — which is the only way `aspirational` can be stored,
      // and the whole point: the statement really happened; it was never a goal in progress.
      const [want] = await q(
        `insert into ${S}.txn_memories
           (id, persona, user_id, namespace, kind, content, embedding, embedding_model,
            importance, source, source_message_id, author, scope, modality, tier, created_at, updated_at)
         values (gen_random_uuid(), 'sotera', $1, 'default', 'semantic', $2, $3::jsonb, $4,
                 4, $5, $6, 'account', 'room', 'aspirational', 'warm', now(), now())
         returning id::text`,
        [root.user_id, WANT_CONTENT, JSON.stringify(eWant.vector), eWant.model, SOURCE, MSG_WANT])

      await pg.query('COMMIT')
      console.log(`\n  ✅ COMMITTED`)
      console.log(`     ① referent  ${ref.id}`)
      console.log(`     ② root      ${ROOT}  contradicted, value intact`)
      console.log(`     ③ goal      ${goal.id}  (root superseded)`)
      console.log(`     ④ want      ${want.id}\n`)
    } catch (e) {
      await pg.query('ROLLBACK')
      throw e
    }
  }
} catch (e) {
  console.error(`\n⛔ ${e.message}\n`)
  process.exitCode = 1
} finally {
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
}
