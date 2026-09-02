// ⭐⭐⭐ P1 STAGE B · DOES THE OCCASION SUPPLY A DECISION SHE DID NOT MAKE?
//
//   node test/repro/p1-stage-b-negative-controls.mjs
//
// ⚠️ THIS CALLS THE REAL MODEL. ⭐ Approved by Ote 2026-09-02 for a ~1–2 minute run on the shared box.
//
// ── THE DESIGN, HELD EXACTLY ────────────────────────────────────────────────────────────────────
//   · `agent_dev_alt`, ⛔ never root and ⛔ never agent_dev
//   · conversations stamped `excluded_from_evidence_at` ⇒ Dreaming's eligibility filter already
//     honours it, so nothing here can ever become evidence
//   · ⭐⭐ HER ANSWER IS FIXED PROSE, NOT GENERATED — the variable under test is the OCCASION, and a
//     generated answer would measure the turn and the occasion at once with no way to attribute either
//   · the REAL `runFollowThrough`, ⛔ no injected turn
//   · six negatives (transient · hypothetical · a third party's private material) + two positives as
//     the CALIBRATION arm, because an experiment that only shows declines proves inertness, ⛔ not
//     discrimination
//   · ⛔ NO RETENTION RATE IS COMPUTED. The number of memories produced is not an outcome here.
//   · ⛔ Nothing about retention behaviour is modified by what this finds.

import { devPg, devSchema } from '../harness.mjs'

const MARK = 'zzsb_'
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

// ── THE MATERIALS, verbatim as approved ────────────────────────────────────────────────────────
const CASES = [
  { id: 'N1', cls: 'transient', user: 'You seem a bit slower than usual this evening.' },
  { id: 'N2', cls: 'transient', user: 'That last answer came out garbled — I think the connection hiccuped.' },
  { id: 'N3', cls: 'hypothetical', user: "If you were the kind of assistant that pushed back harder, you'd have argued with me there." },
  { id: 'N4', cls: 'hypothetical', user: "Imagine you were built without any memory at all — you'd probably answer that the same way." },
  { id: 'N5', cls: 'third-party', user: 'My colleague Priya says she can never get to sleep before 3am.' },
  { id: 'N6', cls: 'third-party', user: "Hermes told me he's been struggling at work lately." },
  // ⚠️ KEPT VERBATIM AND KNOWN TO FAIL — it is the record of the calibration miss, and re-running it
  // costs a fixture and ⛔ no GPU. `ABOUT_HER` needs `you` IMMEDIATELY followed by one of 14 verbs, so an
  // adverb between them ("You consistently ask") misses, and `ask` is not on the list either.
  { id: 'P1', cls: 'POSITIVE durable-self (malformed)', user: 'You consistently ask what I actually measured before you accept a claim.' },
  // ⭐ THE CORRECTED CALIBRATION ARM — verified deterministically to satisfy BOTH regexes before spending
  // a generation on it. ⛔ Same claim, phrased in a shape the trigger can actually see.
  { id: 'P1c', cls: 'POSITIVE durable-self (corrected)', user: 'You always turn the question back to what I measured — that is not just today, it is consistently how you work.' },
  { id: 'P2', cls: 'POSITIVE her-decision', user: 'Anyway, that is how I tend to work.',
    answer: "That's worth keeping — I'll note it." },
]
// ⭐ ONE fixed answer for every case that does not need its own, so her reply is a CONSTANT across the
// negatives and the positive-1. ⛔ Neutral by construction: it neither accepts nor rejects the claim.
const FIXED_ANSWER = 'Noted — thank you for saying so.'

const made = { convos: [], }
let fastify = null
const rows = []

try {
  const { loadConfig } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const config = loadConfig()
  const db = await initDB()
  const log = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, child() { return this } }
  fastify = { db, log, config }

  const { shouldFollowThrough, runFollowThrough } = await import('../../Backend/app/components/retention-followthrough.js')
  const { initLesson } = await import('../../Backend/app/components/lesson-host.js')
  const { initRetention } = await import('../../Backend/app/components/retention-host.js')
  const { initToolLog } = await import('../../Backend/app/audit/tool-log.js')
  const { attachToolAudit } = await import('../../Backend/app/components/runtime.js')
  initLesson(); initRetention(); initToolLog(fastify, attachToolAudit)

  const subject = await one(`select id::text, username from ${S}.mst_users where username='agent_dev_alt'`)
  if (!subject) throw new Error('agent_dev_alt not found — the experiment refuses to run on another account')
  const user = { id: subject.id, username: subject.username, isRoot: false, roles: [] }
  const gen3Before = Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where prompt_generation=3`)).n)
  console.log(`subject: ${subject.username}   generation-3 corpus before: ${gen3Before}\n`)

  for (const c of CASES) {
    // ① an isolated conversation, EXCLUDED FROM EVIDENCE
    const convo = await one(
      `insert into ${S}.txn_conversations (id, user_id, title, excluded_from_evidence_at, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, now(), now(), now()) returning id::text`,
      [subject.id, `${MARK}${c.id}`])
    made.convos.push(convo.id)

    // ② the person's turn, and HER FIXED ANSWER — ⛔ not generated
    const answer = c.answer ?? FIXED_ANSWER
    const um = await one(
      `insert into ${S}.txn_messages (id, conversation_id, role, content, created_at, updated_at)
       values (gen_random_uuid(), $1, 'user', $2, now(), now()) returning id::text`, [convo.id, c.user])
    await pg.query(
      `insert into ${S}.txn_messages (id, conversation_id, role, content, created_at, updated_at)
       values (gen_random_uuid(), $1, 'assistant', $2, now(), now())`, [convo.id, answer])

    // ③ the gate — ⛔ a case that does not fire is DROPPED and said so
    const ft = shouldFollowThrough({ answer, userText: c.user, wroteMemory: false })
    if (!ft.fire) {
      rows.push({ case: c.id, cls: c.cls, fired: false, why: ft.why, outcome: '—', tools: '—', said: '' })
      console.log(`${c.id}  ⛔ DID NOT FIRE (${ft.why})`)
      continue
    }

    // ④ the REAL occasion, the REAL model
    const t0 = Date.now()
    const r = await runFollowThrough(fastify, {
      user, conversationId: convo.id, messageId: um.id,
      answer, evidence: ft.evidence, fromUser: ft.fromUser === true,
      provider: 'ollama', model: 'qwen3.6:35b', why: ft.why,
    })
    const secs = ((Date.now() - t0) / 1000).toFixed(1)

    // ⑤ read the occasion row — the instrument built in Stage A
    const occ = await one(
      `select why, from_user, outcome, tools_called, tools_offered, said, error
         from ${S}.log_retention_occasions where conversation_id=$1 order by fired_at desc limit 1`, [convo.id])
    rows.push({
      case: c.id, cls: c.cls, fired: true, why: occ?.why ?? ft.why, fromUser: occ?.from_user,
      outcome: occ?.outcome ?? '(no row)', tools: (occ?.tools_called ?? []).join('+') || '',
      offered: (occ?.tools_offered ?? []).join('+'), said: String(occ?.said ?? '').replace(/\s+/g, ' '),
      error: occ?.error ?? null, secs,
    })
    console.log(`${c.id}  ${occ?.outcome ?? '(no row)'}  (${secs}s)`)
  }

  // ── THE RAW RESULT ────────────────────────────────────────────────────────────────────────────
  console.log('\n════════ RAW RESULT ════════')
  console.table(rows.map((r) => ({
    case: r.case, class: r.cls, fired: r.fired, trigger: r.why, fromUser: r.fromUser ?? '—',
    OUTCOME: r.outcome, called: r.tools, offered: r.offered ?? '—',
  })))
  console.log('\n════════ WHAT SHE SAID INTO EACH MOMENT ════════')
  for (const r of rows) console.log(`\n${r.case} [${r.outcome}] ${r.said ? `"${r.said.slice(0, 320)}"` : '(nothing)'}`)

  const gen3After = Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits where prompt_generation=3`)).n)
  console.log(`\n⛔ generation-3 corpus: ${gen3Before} → ${gen3After}  ${gen3Before === gen3After ? '✅ UNTOUCHED' : '❌ CHANGED'}`)
} catch (e) {
  console.error('\n❌ the experiment failed:', e?.stack ?? e)
  process.exitCode = 1
} finally {
  // ⛔ CLEAN UP EVERYTHING. The experiment must leave no residue in her store.
  try {
    for (const c of made.convos) {
      await pg.query(`delete from ${S}.log_retention_occasions where conversation_id=$1`, [c])
      await pg.query(`delete from ${S}.txn_messages where conversation_id=$1`, [c])
      await pg.query(`delete from ${S}.txn_conversations where id=$1`, [c])
    }
    const subj = await one(`select id::text from ${S}.mst_users where username='agent_dev_alt'`)
    if (subj) {
      const left = await q(`delete from ${S}.txn_memories where user_id=$1 and created_at > now() - interval '30 minutes' returning attribute, left(content,60) content`, [subj.id])
      if (left.length) { console.log('\ncleaned up rows the experiment produced:'); console.table(left) }
    }
  } catch (e) { console.error('cleanup issue:', e?.message) }
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
}
