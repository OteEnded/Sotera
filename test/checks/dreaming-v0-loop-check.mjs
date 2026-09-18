// ⭐⭐⭐⭐ DREAMING v0 — THE LOOP, MEASURED END TO END ON THE REAL CORPUS.
//
//   node test/checks/dreaming-v0-loop-check.mjs
//
// ── THE LOOP OTE SPECIFIED ─────────────────────────────────────────────────────────────────────────
//
//   completed conversation → dream trigger → episode/context selection → reflection
//     → candidate insight → retention/non-retention decision → durable memory → A LATER CONVERSATION
//
// ⭐ EVERY HOP ALREADY EXISTS AND RUNS UNPROMPTED. `memory.reflectionEnabled` gates a 20-minute cron that
// calls `reflectAllQuiet`, which picks quiet+changed conversations, reflects with her own chat model, and
// offers exactly two write doors — `retain` and `decline_to_remember`. This check does not build that; it
// MEASURES it, hop by hop, so that "the loop works" is a number rather than an opinion.
//
// ⛔⛔ AND THE LAST HOP IS THE ONE THAT DOES NOT CLOSE. Reported, ⛔ not asserted — see H6. Asserting it
// would make this check permanently red, which is noise; leaving it out would make the check a green that
// proves nothing. ⇒ H1–H5 are ASSERTED (they are built and must not regress) and H6 is MEASURED and
// PRINTED, with H7 localising WHY.
//
// ⛔ ZERO WRITES. Every statement is a SELECT. ⛔ No recall is issued — `recall()` reinforces, and a
// confirmation run would inflate the very `access_count` this check reads.
import { makeChecker, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'

const { check, done } = makeChecker()
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const seq = db.txn_memories.sequelize
const schema = devSchema()
const Q = (s, r = {}) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const M = `"${schema}"."txn_memories"`
const R = `"${schema}"."log_conversation_revisits"`
const E = `"${schema}"."txn_message_embeddings"`

try {
  // ── H0 · THE TRIGGER IS ARMED ────────────────────────────────────────────────────────────────────
  // ⭐ The switch is read from `config.json` and nothing else — the same discipline the Dreaming M1 gate
  // uses, because a setting that can be flipped from a table is a setting nobody can audit from the repo.
  const armed = config?.memory?.reflectionEnabled === true
  check('H0 · ⭐⭐⭐ THE UNPROMPTED TRIGGER IS ARMED — `memory.reflectionEnabled` is true in config.json', armed,
    `reflectionEnabled=${config?.memory?.reflectionEnabled}`)

  // ── H1 · IT ACTUALLY FIRED, UNPROMPTED ───────────────────────────────────────────────────────────
  // ⛔ `trigger_source` is the whole point: a `manual` revisit proves a human can run it, which is not
  // the claim. Only `cron` is evidence that she reflects WITHOUT BEING PROMPTED.
  const [byTrigger] = await Q(`SELECT
      count(*) FILTER (WHERE trigger_source='cron')   AS cron,
      count(*) FILTER (WHERE trigger_source='manual') AS manual,
      count(*) FILTER (WHERE trigger_source='legacy') AS legacy,
      max(completed_at) FILTER (WHERE trigger_source='cron') AS newest
    FROM ${R}`)
  check('H1 · ⭐⭐⭐ SHE REFLECTS UNPROMPTED — cron-triggered revisits exist. ⛔ `manual` would not prove this', Number(byTrigger.cron) > 0,
    `cron=${byTrigger.cron} manual=${byTrigger.manual} legacy=${byTrigger.legacy} newest=${byTrigger.newest}`)

  // ── H2 · SELECTION IS BOUNDED AND NAMES ITS EPISODE ──────────────────────────────────────────────
  // ⚠️ A reflection that cannot say WHAT it read is not auditable. Every unprompted act must name a
  // conversation and the message window it considered — otherwise "she reflected" is unfalsifiable.
  const [sel] = await Q(`SELECT count(*) AS n,
      count(*) FILTER (WHERE conversation_id IS NOT NULL) AS named,
      count(*) FILTER (WHERE messages_considered > 0)     AS bounded,
      min(messages_considered) AS lo, max(messages_considered) AS hi
    FROM ${R} WHERE trigger_source='cron'`)
  check('H2 · ⭐⭐ EVERY unprompted act NAMES its conversation AND a bounded window — ⛔ an unauditable reflection is not evidence', Number(sel.named) === Number(sel.n) && Number(sel.bounded) === Number(sel.n),
    `${sel.named}/${sel.n} named, ${sel.bounded}/${sel.n} bounded, window ${sel.lo}..${sel.hi} messages`)

  // ── H3 · THE REFLECTION COMPLETED ────────────────────────────────────────────────────────────────
  const [out] = await Q(`SELECT count(*) AS n,
      count(*) FILTER (WHERE outcome='completed') AS completed,
      count(*) FILTER (WHERE failure IS NOT NULL) AS failed,
      count(*) FILTER (WHERE blocked_by_disclosure) AS blocked
    FROM ${R} WHERE trigger_source='cron'`)
  check('H3 · ⭐⭐ every unprompted reflection COMPLETED — ⛔ a lane that mostly fails is not a loop', Number(out.completed) === Number(out.n) && Number(out.failed) === 0,
    `completed=${out.completed}/${out.n} failed=${out.failed} blocked=${out.blocked}`)

  // ── H4/H5 · THE DECISION, AND THE DURABLE MEMORY BEHIND IT ───────────────────────────────────────
  // ⭐⭐ RETENTION AND NON-RETENTION ARE BOTH ACTIONS — a pass that kept nothing is a real outcome, not a
  // failure ("no reflection output does not automatically mean failure. Sometimes nothing is worth
  // retaining."). ⇒ what must hold is that whatever she DID keep is durable, live and reachable.
  const rows = await Q(`SELECT m.id::text AS id, m.writer, m.user_id::text AS room, m.created_at,
      r.completed_at, m.access_count, m.last_access, (m.invalid_at IS NULL) AS live,
      (m.embedding_hv IS NOT NULL) AS embedded
    FROM ${R} r JOIN ${M} m ON m.id = r.wrote_memory_id
    WHERE r.trigger_source='cron' ORDER BY m.created_at`)
  const kept = rows.length
  check('H4 · ⭐⭐⭐ AN UNPROMPTED REFLECTION HAS PRODUCED DURABLE LEARNING — the write door was actually used', kept > 0,
    `${kept} of ${out.n} unprompted acts wrote a memory`)
  const liveN = rows.filter((r) => r.live).length
  const embN = rows.filter((r) => r.embedded).length
  check('H5 · ⭐⭐ …and every one of them is LIVE and EMBEDDED — ⛔ an unembedded row could never be recalled at all', liveN === kept && embN === kept,
    `live=${liveN}/${kept} embedded=${embN}/${kept}`)

  // ── H6 · ⛔⛔ THE HOP THAT DOES NOT CLOSE — MEASURED, NOT ASSERTED ────────────────────────────────
  //
  // ⭐ THE WHOLE POINT OF v0: *"durable learning that can affect a later conversation."* A row that is
  // written and never returned has not affected anything. `access_count`/`last_access` are the durable
  // instrument — `recall()` reinforces everything it surfaces, and nothing resets the counter.
  const closed = rows.filter((r) => Number(r.access_count) > 0).length
  const after = rows.filter((r) => r.last_access && r.completed_at && new Date(r.last_access) > new Date(r.completed_at)).length
  // ⚠️ PINNED AT THE MEASURED BREAK rather than asserted as `true`. A `check(true, …)` cannot fail, and a
  // check that cannot fail is how "ALL CHECKS PASSED" gets printed over a broken loop. ⭐ So this asserts
  // TODAY'S NUMBER: if it goes red because closure became NON-ZERO, that is GOOD NEWS — the loop closed,
  // and the baseline below is what needs updating. ⛔ It must never be relaxed to make a run quiet.
  const CLOSURE_BASELINE = 0
  check(`H6 · ⛔⛔ CLOSURE IS PINNED AT ${CLOSURE_BASELINE}/${kept} — ⭐ RED HERE MEANS THE LOOP CLOSED; update the baseline`, closed === CLOSURE_BASELINE,
    `ever-recalled=${closed}/${kept} recalled-after-the-act=${after}/${kept}`
    + (closed === 0 ? '  ⇒ ⛔ THE LOOP DOES NOT CLOSE' : '  ⇒ ⭐ the loop closes'))

  // ── H7 · LOCALISE IT · ELIGIBLE, OR MERELY UNCOMPETITIVE? ────────────────────────────────────────
  //
  // ⭐⭐ THE DISCRIMINATION THAT MATTERS, because the two have opposite fixes. A row that cannot clear
  // `minRelevance` is INELIGIBLE (a retrieval problem). A row that clears it and still never appears is
  // ELIGIBLE BUT UNCOMPETITIVE (a ranking/salience problem — and that is fenced).
  // ⓘ A stored user-message embedding IS the query vector recall would build for that turn: same model,
  // same text, same embedder. So this measures the best score the row could ever have achieved.
  const [models] = await Q(`SELECT
      (SELECT count(DISTINCT embedding_model) FROM ${M} WHERE embedding_hv IS NOT NULL) AS mem,
      (SELECT count(DISTINCT embedding_model) FROM ${E} WHERE embedding_hv IS NOT NULL) AS msg,
      (SELECT count(*) FROM (SELECT embedding_model FROM ${M} WHERE embedding_hv IS NOT NULL
         INTERSECT SELECT embedding_model FROM ${E} WHERE embedding_hv IS NOT NULL) x) AS shared`)
  check('H7a · ⭐ THE TWO EMBEDDING SPACES ARE THE SAME — ⛔ otherwise every similarity below is meaningless', Number(models.shared) > 0 && Number(models.mem) === 1 && Number(models.msg) === 1,
    `memory models=${models.mem} message models=${models.msg} shared=${models.shared}`)

  const sims = await Q(`SELECT m.id::text AS id,
      (SELECT max(1-(e.embedding_hv <=> m.embedding_hv)) FROM ${E} e
        WHERE e.role='user' AND e.room_user_id=m.user_id AND e.created_at > m.created_at) AS best
    FROM ${R} r JOIN ${M} m ON m.id=r.wrote_memory_id
    WHERE r.trigger_source='cron' AND m.embedding_hv IS NOT NULL`)
  const GATE = 0.15 // retrieve()'s default minRelevance, and the route does not override it
  const scored = sims.filter((s) => s.best != null).map((s) => Number(s.best))
  const eligible = scored.filter((b) => b >= GATE).length
  const bestOf = scored.length ? Math.max(...scored).toFixed(3) : 'n/a'
  const avgOf = scored.length ? (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(3) : 'n/a'
  check('H7b · ⭐ every unprompted memory was scored against REAL later user turns in its own room', scored.length > 0,
    `${scored.length} scored · best=${bestOf} avg-best=${avgOf}`)
  check(`H7c · ⭐⭐⭐ THEY ARE ELIGIBLE — ${eligible}/${scored.length} clear minRelevance ${GATE} against a real later turn`, eligible > 0,
    '⛔ so the break is NOT the relevance gate, and ⛔ NOT the missing embedding')

  // ⭐⭐ THE CONTROL. Without it "reflection rows rank low" is a number with nothing to be low against.
  const [ctl] = await Q(`SELECT
      count(*) FILTER (WHERE writer='reflection') AS refl_n,
      count(*) FILTER (WHERE writer='reflection' AND access_count>0) AS refl_hit,
      count(*) FILTER (WHERE writer IS NOT NULL AND writer<>'reflection') AS other_n,
      count(*) FILTER (WHERE writer IS NOT NULL AND writer<>'reflection' AND access_count>0) AS other_hit
    FROM ${M} WHERE invalid_at IS NULL AND kind='semantic' AND embedding_hv IS NOT NULL
      AND created_at >= (SELECT min(m2.created_at) FROM ${M} m2 JOIN ${R} r2 ON r2.wrote_memory_id=m2.id WHERE r2.trigger_source='cron')`)
  const pct = (a, b) => (Number(b) ? Math.round((100 * Number(a)) / Number(b)) : 0)
  check('H7d · ⭐⭐ AGE-CONTROLLED CONTROL GROUP — same window, same kind, same embedder, different writers', Number(ctl.other_n) > 0,
    `reflection ${ctl.refl_hit}/${ctl.refl_n} (${pct(ctl.refl_hit, ctl.refl_n)}%) `
    + `vs other writers ${ctl.other_hit}/${ctl.other_n} (${pct(ctl.other_hit, ctl.other_n)}%)`)

  // ⭐ THE SIX MEASURED GAPS TO RANK 6 (bounded retrieval experiment, 2026-09-18 — each row given its BEST
  // real later user turn, scored with retrieve()'s own formula). ⛔ DECLARED, not recomputed: recomputing
  // would make this line depend on pgvector timing and on a corpus that keeps moving.
  const GAPS = [1.433, 0.395, 1.142, 0.219, 1.028, 0.716]

  // ── THE VERDICT LINE ─────────────────────────────────────────────────────────────────────────────
  console.log('')
  console.log('  ⭐ DREAMING v0 · THE LOOP, HOP BY HOP')
  console.log(`     trigger armed ......... ${armed ? 'YES' : 'NO'}   (config.memory.reflectionEnabled)`)
  console.log(`     fired unprompted ...... ${byTrigger.cron} cron acts, newest ${byTrigger.newest}`)
  console.log(`     selection bounded ..... ${sel.bounded}/${sel.n}, windows ${sel.lo}..${sel.hi} messages`)
  console.log(`     completed ............. ${out.completed}/${out.n}`)
  console.log(`     kept something ........ ${kept}/${out.n}   (non-retention is also a real outcome)`)
  console.log(`     durable + recallable .. live ${liveN}/${kept}, embedded ${embN}/${kept}`)
  console.log(`     ELIGIBLE .............. ${eligible}/${scored.length} clear minRelevance ${GATE} (best ${bestOf}, avg ${avgOf})`)
  console.log(`     ⛔ CLOSED THE LOOP .... ${closed}/${kept} ever recalled`)
  console.log('')
  // ⭐⭐ THE COUNTERFACTUAL, so the reach of the 2026-09-18 change is visible on every run.
  // ⛔ IT IS NOT RETROACTIVE: `retain()` now stamps the occasion's importance 7, but the rows above were
  // written when the lane declared NOTHING, and §0-D forbids historical row repair. ⇒ they keep
  // `importance = NULL`, and this line says what the SAME rows would have scored had the stamp existed.
  const DELTA = 2 * (7 / 10) - 2 * (5 / 10) // the importance term at 7 vs the scorer's `?? 5` default
  const gapsClosed = GAPS.filter((g) => g <= DELTA).length
  console.log(`  ⓘ COUNTERFACTUAL at importance 7: +${DELTA.toFixed(1)} on the importance term closes `
    + `${gapsClosed} of ${GAPS.length} measured gaps to rank 6  [${GAPS.map((g) => g.toFixed(3)).join(' ')}]`)
  console.log('')
  if (closed === 0) {
    console.log('  ⏸ THE LOOP HAS NOT CLOSED YET, AND THAT IS THE EXPECTED POSITION.')
    console.log('     The responsible mechanism was MEASURED (importance — 69% of the gap to rank 6) and')
    console.log('     SUPPLIED on 2026-09-18: retain() now stamps the occasion importance, 7.')
    console.log('     ⛔ It is NOT retroactive — closure waits on a NEW unprompted retention.')
    console.log('     ⛔ Do NOT tune the constant upward to force this number.')
  } else {
    console.log('  ⭐ v0 CLOSES: unprompted reflection produced durable learning that came back later.')
  }
} finally {
  await done()
  await seq.close()
}
