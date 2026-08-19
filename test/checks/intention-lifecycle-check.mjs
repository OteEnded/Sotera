// INTENTION — a purpose that survives the conversation.
//
//   node checks/intention-lifecycle-check.mjs
//
// Ote: *"Before wiring it into background execution, prove the persistence lifecycle and boundaries
// with tests."* So this proves three separate things, and they fail for different reasons:
//
//   LIFECYCLE   create → inspect → update → complete/abandon, and — the point of the whole feature —
//               that it SURVIVES the object that created it. A new service instance is what a new turn
//               actually is.
//   BOUNDARIES  it cannot be aimed at anyone else, cannot enumerate, carries no id, and cannot reach a
//               transcript. Most of these assert that an ABSENCE is really absent.
//   NOT WIRED   nothing fires on it. No trigger, no executor, no caller for the cross-person read.
//
// ⚠️ Runs against **agent_dev**'s person — the designated test identity. Snapshots and restores the
// whole table (see lib/intention-fixtures.mjs): this store is mutated in place, and "delete what I
// created" has already proven insufficient on a table of exactly this shape.

import { readFileSync, readdirSync } from 'node:fs'
import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildIntention, intentionsDue, LIMITS } from '../../Backend/app/components/intention-host.js'
import { snapshotIntentions, restoreIntentions } from '../lib/intention-fixtures.mjs'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const X = (s, r) => seq.query(s, { replacements: r })
const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)

const fastify = { db, config, log: null }
const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))
const [me] = await Q('SELECT person_id::text AS pid FROM persona_sotera.mst_users WHERE id = :id', { id: users.agent_dev })

const snap = await snapshotIntentions(Q)
let tempPersonId = null

try {
  // ── P · preconditions. Fail FAST rather than clobbering something real ──────────────────────────
  ok(Boolean(me?.pid), 'P · agent_dev has a person row to hold an intention with')
  const [{ n: preOpen }] = await Q(
    "SELECT count(*)::int AS n FROM persona_sotera.txn_intentions WHERE person_id = :pid AND state = 'open'", { pid: me.pid })
  ok(preOpen === 0, 'P · agent_dev starts with no open intention', 'a leftover open row would mean the previous run did not restore')

  // ── L1 · CREATE ─────────────────────────────────────────────────────────────────────────────────
  const turn1 = buildIntention(fastify, { userId: users.agent_dev })
  const created = await turn1.set({
    intent: 'Work out why the check suite flakes on a cold database',
    why: 'It has failed once and I could not reproduce it, so the cause is still unknown',
    reviewInDays: 7,
  })
  ok(created.ok === true, 'L1 · set_intention creates an intention', created.reason ?? '')
  ok(created.intention?.intent?.startsWith('Work out why'), 'L1 · …and hands back what was stored')
  ok(/still be here in your next conversation/i.test(created.note ?? ''),
    'L1 · ⭐ the reply states the persistence claim explicitly — she called her durable store "an illusion" when it was only described in prose')

  // ── L2 · ⭐ IT SURVIVES THE OBJECT THAT CREATED IT ──────────────────────────────────────────────
  // This is the feature. A new service instance is what a new turn is: nothing is carried in memory
  // between them, so anything that comes back came out of the database.
  const turn2 = buildIntention(fastify, { userId: users.agent_dev })
  const seen = await turn2.recall()
  ok(seen.open?.intent === created.intention.intent,
    'L2 · ⭐ a NEW service instance recalls it — the purpose outlived the object that created it')
  ok(seen.open?.why?.startsWith('It has failed once'), 'L2 · …with its reason intact')
  ok(typeof seen.open?.revisitAfter === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(seen.open.revisitAfter),
    'L2 · …and a review date', seen.open?.revisitAfter)
  ok(/did not run between conversations/i.test(seen.provenance?.aboutTheGap ?? ''),
    'L2 · ⭐ provenance says dates are facts about rows, NOT time she experienced — the over-correction the self-model exists to prevent')

  // ── L3 · ONE OPEN PER PERSON, enforced by the database ──────────────────────────────────────────
  const second = await turn2.set({ intent: 'Something else entirely' })
  ok(second.ok === false, 'L3 · ⭐ a second open intention is REFUSED, not silently added')
  ok(second.alreadyOpen?.intent === created.intention.intent,
    'L3 · …and it hands back the one that already exists rather than a bare error')
  const [{ n: openNow }] = await Q(
    "SELECT count(*)::int AS n FROM persona_sotera.txn_intentions WHERE person_id = :pid AND state = 'open'", { pid: me.pid })
  ok(openNow === 1, 'L3 · exactly one open row exists in the table', `${openNow}`)

  // ── L4 · UPDATE ─────────────────────────────────────────────────────────────────────────────────
  const updated = await turn2.update({ progress: 'Ruled out the connection pool. It only happens on the first run after a restart.' })
  ok(updated.ok === true, 'L4 · update_intention records progress', updated.reason ?? '')
  ok(updated.intention?.progressSoFar?.startsWith('Ruled out'), 'L4 · …and the progress comes back')
  ok(updated.intention?.intent === created.intention.intent,
    'L4 · ⭐ …without disturbing the fields that were not passed')
  const empty = await turn2.update({})
  ok(empty.ok === false, 'L4 · an update with nothing in it is refused rather than silently doing nothing')

  // ── L5 · the caps are enforced, with a usable message ───────────────────────────────────────────
  const tooLong = await turn2.update({ progress: 'x'.repeat(LIMITS.progress + 1) })
  ok(tooLong.ok === false && /limit is \d+/.test(tooLong.reason), 'L5 · an over-long field is refused with the actual limit', tooLong.reason)
  let dbRejected = false
  try {
    await X(`UPDATE persona_sotera.txn_intentions SET intent = :v WHERE person_id = :pid AND state='open'`,
      { v: 'y'.repeat(LIMITS.intent + 1), pid: me.pid })
  } catch { dbRejected = true }
  ok(dbRejected, 'L5 · ⭐ …and the DATABASE refuses it too — the cap is a constraint, not a convention')

  // ── L6 · the scheduler seam: due-ness is a QUERY, and it is the intention that answers ──────────
  await X("UPDATE persona_sotera.txn_intentions SET next_review_at = now() - INTERVAL '1 hour' WHERE person_id = :pid AND state='open'", { pid: me.pid })
  const due = await intentionsDue(fastify)
  ok(due.some((d) => d.personId === me.pid), 'L6 · ⭐ intentionsDue() reports it once its review time has passed', `${due.length} due`)
  ok(due.every((d) => !('id' in d)), 'L6 · …and returns no row id')
  await X("UPDATE persona_sotera.txn_intentions SET next_review_at = now() + INTERVAL '7 days' WHERE person_id = :pid AND state='open'", { pid: me.pid })

  // ── L7 · COMPLETE ───────────────────────────────────────────────────────────────────────────────
  const closed = await turn2.close({ as: 'completed', outcome: 'It was the cold page cache, not the pool.' })
  ok(closed.ok === true, 'L7 · close_intention completes it', closed.reason ?? '')
  const turn3 = buildIntention(fastify, { userId: users.agent_dev })
  const after = await turn3.recall()
  ok(after.open === null, 'L7 · ⭐ …and there is no longer an open intention')
  ok(after.recentlyClosed[0]?.howItEnded === 'completed', 'L7 · it appears in the record of what she finished')
  ok(after.recentlyClosed[0]?.outcome?.startsWith('It was the cold'), 'L7 · …with its outcome')
  const nothingToClose = await turn3.close({ as: 'completed' })
  ok(nothingToClose.ok === false, 'L7 · closing when nothing is open is refused')

  // ── L8 · ABANDON is a first-class ending, and terminal is terminal ──────────────────────────────
  const again = await turn3.set({ intent: 'Find out whether the Thai search gap affects short queries' })
  ok(again.ok === true, 'L8 · a new intention can be set after the last one closed')
  const dropped = await turn3.close({ as: 'abandoned', outcome: 'Ote parked it; not mine to carry.' })
  ok(dropped.ok === true && dropped.closed.howItEnded === 'abandoned', 'L8 · ⭐ abandoning is a real outcome, recorded as one')
  let reopenRejected = false
  try {
    await X("UPDATE persona_sotera.txn_intentions SET state='open' WHERE person_id = :pid AND state='abandoned'", { pid: me.pid })
  } catch { reopenRejected = true }
  ok(reopenRejected, 'L8 · ⭐ a closed intention cannot be flipped back to open — the state and the clock must agree')

  // ── B1 · the service exposes EXACTLY the lifecycle, and nothing that reads across people ────────
  const svc = buildIntention(fastify, { userId: users.agent_dev })
  ok(Object.keys(svc).sort().join(',') === 'close,recall,set,update',
    'B1 · ⭐ the service is exactly recall/set/update/close — no list, no search, no by-id', Object.keys(svc).join(', '))
  ok(!('due' in svc) && !('intentionsDue' in svc),
    'B1 · ⭐⭐ the cross-person read is NOT on the service — a tool receives the service, so a function that is not on it cannot be called, however the model asks')
  ok(svc.recall.length === 0, 'B1 · recall() accepts no argument — the person cannot be overridden at the call site')

  // ── B2 · the TOOLS carry no id and no subject ───────────────────────────────────────────────────
  const toolSrc = readFileSync(new URL('../../../../PortableComponents/Tools/Intention/index.js', import.meta.url), 'utf8')
  ok(/name:\s*'recall_intention'[\s\S]*?properties:\s*\{\s*\}/.test(toolSrc),
    'B2 · ⭐ recall_intention declares NO parameters at all')
  for (const forbidden of ['personId', 'person_id', 'subject', 'userId', 'conversationId', 'query', 'limit']) {
    ok(!new RegExp(`\\b${forbidden}\\s*:\\s*\\{`).test(toolSrc), `B2 · no \`${forbidden}\` parameter exists on any tool`)
  }
  // ⚠️ Match the PARAMETER, not the letters: "id" appears inside "considered", "provides", "avoid"…
  // A substring test here would be the same defect this project has now shipped five times.
  ok(!/\bid\s*:\s*\{\s*type:/.test(toolSrc),
    'B2 · ⭐ no `id` parameter anywhere — one open intention per person is what makes ids unnecessary')
  ok((toolSrc.match(/additionalProperties:\s*false/g) || []).length === 4,
    'B2 · all four tools set additionalProperties:false, so nothing can be smuggled in')

  // ── B3 · scope: another person's recall cannot see it, and there is no way to ask ───────────────
  await svc.set({ intent: 'A scope probe that should be invisible to everyone else' })
  const kaviView = await buildIntention(fastify, { userId: users.kavi }).recall()
  ok(kaviView.open === null || !kaviView.open.intent.includes('scope probe'),
    'B3 · ⭐ Kavi does not see agent_dev\'s intention')
  ok(!JSON.stringify(kaviView).includes('scope probe'), 'B3 · …and it appears nowhere in her payload')
  const noPerson = await buildIntention(fastify, { userId: users.mina }).recall()
  ok(noPerson.open === null && noPerson.recentlyClosed.length === 0,
    'B3 · an account with no person row gets an empty answer, not an error and not someone else\'s')
  ok(/have not set one with this person yet/i.test(noPerson.provenance?.ifEmpty ?? ''),
    'B3 · ⭐ empty is framed as "I have not set one", never as a claim that none exists')

  // ── B4 · no handle of any kind comes back ───────────────────────────────────────────────────────
  const payload = JSON.stringify(await svc.recall())
  ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(payload),
    'B4 · ⭐ no UUID is returned — an id is a handle, and a handle is the start of a database tool')
  for (const forbidden of ['person_id', 'conversation_id', 'message_id', 'writer_version']) {
    ok(!payload.includes(forbidden), `B4 · the payload contains no ${forbidden}`)
  }

  // ── B5 · the TABLE cannot hold a transcript ─────────────────────────────────────────────────────
  const cols = (await Q(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='persona_sotera' AND table_name='txn_intentions'"))
    .map((c) => c.column_name)
  ok(cols.length > 0, 'B5 · txn_intentions exists', cols.join(', '))
  for (const banned of ['conversation_id', 'message_id', 'memory_id', 'transcript', 'content', 'source', 'excerpt', 'embedding']) {
    ok(!cols.includes(banned), `B5 · ⭐ there is no \`${banned}\` column — the guarantee is the schema's, not a writer's discipline`)
  }
  const [idx] = await Q(
    "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='persona_sotera' AND tablename='txn_intentions' AND indexname='txn_intentions_one_open_per_person'")
  ok(idx.n === 1, 'B5 · the one-open-per-person index is present — the id-free tool surface depends on it')

  // ── B6 · ⭐ DE-IDENTIFICATION: an intention does not outlive the person ─────────────────────────
  // Deliberately the OPPOSITE of migration 007's SET NULL, because the payload differs: a stance label
  // carries no personal data and survives as HER practice; an intention's text can name someone's work.
  const [tmp] = await Q("INSERT INTO persona_sotera.mst_persons (display_name, kind) VALUES ('ZZ Test Person', 'human') RETURNING id::text")
  tempPersonId = tmp.id
  await X("INSERT INTO persona_sotera.txn_intentions (person_id, intent, writer_version) VALUES (:pid, 'a throwaway intention', 'test')", { pid: tempPersonId })
  const [{ n: before }] = await Q('SELECT count(*)::int AS n FROM persona_sotera.txn_intentions WHERE person_id = :pid', { pid: tempPersonId })
  await X('DELETE FROM persona_sotera.mst_persons WHERE id = :pid', { pid: tempPersonId })
  const [{ n: gone }] = await Q('SELECT count(*)::int AS n FROM persona_sotera.txn_intentions WHERE person_id = :pid', { pid: tempPersonId })
  tempPersonId = null // the delete succeeded; nothing left to clean up
  ok(before === 1 && gone === 0, 'B6 · ⭐ deleting a person CASCADES to their intentions — he can be forgotten', `${before} → ${gone}`)

  // ── N1 · NOT WIRED. Nothing fires on any of this ────────────────────────────────────────────────
  const [{ n: jobs }] = await Q("SELECT count(*)::int AS n FROM persona_sotera.mst_trigger_jobs WHERE action::text ILIKE '%intention%'")
  ok(jobs === 0, 'N1 · ⭐ no scheduled job references an intention')
  const backend = new URL('../../Backend/app/', import.meta.url)
  const callers = []
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) walk(new URL(`${f.name}/`, dir))
      else if (f.name.endsWith('.js') && f.name !== 'intention-host.js') {
        const src = readFileSync(new URL(f.name, dir), 'utf8')
        // Strip line comments first: this file's own prose says "intentionsDue() is called by NOTHING",
        // and a matcher that counts a sentence ABOUT a call as a call is the defect it is checking for.
        const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
        if (/\bintentionsDue\s*\(/.test(code)) callers.push(f.name)
      }
    }
  }
  walk(backend)
  ok(callers.length === 0, 'N1 · ⭐⭐ intentionsDue() is called by NOTHING — the seam exists, the wiring is Ote\'s next decision', callers.join(', '))
  const schedSrc = readFileSync(new URL('../../Backend/app/schedules/service.js', import.meta.url), 'utf8')
  ok(!/intention/i.test(schedSrc), 'N1 · the scheduler does not know this store exists')
  // ⚠️ This assertion used to COUNT occurrences of the word "intention" in the route and allow three.
  // That is the defect this project has shipped five times — a matcher keyed on letters rather than on
  // what the code DOES — and it failed immediately, correctly, on an import line. What actually matters
  // is that the route never builds or reads the service, so assert the identifiers instead.
  const stripComments = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
  // …and the second attempt was ALSO wrong, in a smaller way: it stripped only whole-line comments, so
  // a trailing `// …intention…` still counted. Chasing a comment stripper is the wrong game — assert the
  // identifiers that would have to appear for the route to use this store at all.
  const routeSrc = readFileSync(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')
  ok(!/buildIntention/.test(routeSrc), 'N1 · ⭐ the chat route never CONSTRUCTS the intention service')
  ok(!/\.intention\b/.test(routeSrc), 'N1 · ⭐ …and never reads one off the services bag')
  ok(!/(recall|set|update|close)_intention/.test(routeSrc), 'N1 · …and never calls the tools itself')
  const composerCode = stripComments(readFileSync(new URL('../../Backend/app/components/context-composer.js', import.meta.url), 'utf8'))
  ok(!/intention/i.test(composerCode),
    'N1 · ⭐ the Context Composer does not know this store exists — an intention reaches a turn only when she calls the tool (RFC D9, Ote\'s decision)')
} finally {
  if (tempPersonId) await X('DELETE FROM persona_sotera.mst_persons WHERE id = :pid', { pid: tempPersonId }).catch(() => {})
  const undo = await restoreIntentions(Q, X, snap)
  ok(undo.restored === 0, 'Z · ⭐ the restore had to undo NO mutation of pre-existing rows', `deleted ${undo.deleted} test row(s)`)
  const [{ n: left }] = await Q('SELECT count(*)::int AS n FROM persona_sotera.txn_intentions')
  ok(left === snap.rows.size, 'Z · the table is exactly as it was found', `${left} row(s), was ${snap.rows.size}`)
  await seq.close().catch(() => {})
}

done()
