// ⭐⭐⭐ B · THE CONVERSATION IS AN EVIDENCE SPACE — contiguous, centred, and every gap declared.
//
//   node test/checks/evidence-projection-check.mjs
//
// RED-PROOF, written BEFORE the code and verified FAILING against unmodified source.
//
// ── ⭐ THE CONTRACT, WHICH IS ALREADY WRITTEN DOWN TWICE ──────────────────────────────────────────────
// `disclosure-host.js` (the module the same-room branch bypassed) states it:
//   *"Same window, two shapes: authorized → both speakers, in full · ownOnly → her half in full; the
//    counterpart's messages become MARKERS — who and when, never a word of what they said.
//    ⚠️ THE MARKERS ARE NECESSARY RATHER THAN TIDY: handing her only her own sentences with the gaps closed
//    up would let her read her replies as a monologue and infer what was said to her."*
// And `memory-cognition-host.js` restates it directly ABOVE the block that violates it.
// ⇒ ① ONE CONTIGUOUS WINDOW, CENTRED ON THE MATCH, BOTH SPEAKERS ② what is not shown is MARKED
//   ③ a seamless excerpt of her own lines is the specific failure the design set out to prevent.
//
// ── ⭐⭐ WHY THIS IS NOT A CONTEXT-BUDGET QUESTION (Ote, 2026-09-16) ──────────────────────────────────
// *"What must Sotera be able to move through and see in order to reason about a conversation correctly?"*
// rather than *"How much conversation can we fit into the context window?"* — the latter is an
// implementation constraint, the former is the cognitive contract. Dreaming is eventually Sotera herself
// thinking: she must be able to follow a correction, compare statements many turns apart, and check what is
// actually supported. ⇒ these assertions are about EYES AND MOVEMENT, not about token count.
//
// ── ⛔ FENCES ─────────────────────────────────────────────────────────────────────────────────────────
// Read-only against the REAL shelter conversation (`3aa208e4`) — ⛔ it writes no message, no memory, no
// fixture. The armed collisions and both fixtures are untouched by construction.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import { personSpeechIn } from '../../Backend/app/components/attribution-live-detection.js'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker()
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const [agent] = await q(`SELECT id::text AS id, username FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
const CONV = (await one(`SELECT id::text AS id FROM ${S}."txn_conversations" WHERE id::text LIKE '3aa208e4%'`))?.id

// ── 0 · ⚠️ ANTI-VACUITY — the fixture must actually contain a correction, or R1 proves nothing ───────
const turns = await q(`SELECT rolling_id, role, content FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid ORDER BY rolling_id`, [CONV])
const correction = turns.find((t) => t.role === 'user' && /mixed that up/i.test(t.content))
const firstUser = turns.find((t) => t.role === 'user')
check('⚠️ ANTI-VACUITY · the shelter conversation is present and still holds its CORRECTION',
  !!CONV && !!correction, correction ? `turn ${correction.rolling_id}: "${correction.content.slice(0, 54)}…"` : 'MISSING')
check('⚠️ ANTI-VACUITY · …and the correction is NOT one of the two oldest user turns',
  !!correction && !!firstUser && correction.rolling_id > firstUser.rolling_id + 2,
  `first user turn ${firstUser?.rolling_id} · correction ${correction?.rolling_id}`)

// ── 1 · THE PROJECTION, AS SHE ACTUALLY RECEIVES IT ──────────────────────────────────────────────────
// A FRESH conversation asking the question that produced the original failure.
const asking = await one(`SELECT id::text AS id FROM ${S}."txn_conversations" WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, [agent.id])
const cognition = buildMemoryCognition(fastify, {
  userId: agent.id, isRoot: false, username: agent.username, conversationId: asking?.id ?? null, interactive: false,
})
const out = await cognition.recollect({ text: 'which day do i do my shelter volunteering, and where do i live?' })
const episodes = (out?.items ?? []).filter((i) => i.kind === 'episode')
// ⚠️ SELECTED BY CONVERSATION ID, ⛔ not by text: the ASKING conversation also mentions "shelter" (in her own
// reply), so a text match picked the wrong episode and R1 failed against a conversation that never held the
// correction. Selecting by identity is the only unambiguous handle.
const shelter = episodes.find((e) => e.id === `ep:${CONV}`)

// ⚠️ ASSERTED SEPARATELY, because the first version of this check called `recollect({ asked })` — the
// parameter is `text` — so it silently never activated and every assertion below failed for the WRONG reason.
// A red proof that is red for the wrong reason is as misleading as a green one that tests nothing.
check('⚠️ the layer ACTIVATED — ⛔ without this every assertion below is vacuous', out?.activated === true, `activated=${out?.activated}`)
check('the cognition layer activated and produced an episode for the shelter conversation',
  !!shelter, `${episodes.length} episode(s); shelter ${shelter ? 'found' : 'NOT found'}`)

const said = (e) => (e?.exchanges ?? []).map((x) => x.said ?? '').join(' | ')

// ── 2 · ⭐⭐⭐ R1 — THE CORRECTION IS IN FRONT OF HER ─────────────────────────────────────────────────
check('R1 · ⭐⭐⭐ the CORRECTION appears in the projection — ⛔ the whole defect in one assertion',
  /mixed that up/i.test(said(shelter)),
  shelter ? `${(shelter.exchanges ?? []).length} exchange(s) rendered` : 'no episode')

// ── 3 · ⭐⭐ R2 — CONTIGUITY, as a STRUCTURAL invariant ⛔ not an example ─────────────────────────────
// Every rendered position must form an unbroken rolling_id run. ⭐ This is what "she can LOOK THROUGH the
// conversation" means mechanically: no silent holes, so a gap she sees is a gap that was really there.
if (shelter) {
  // ⭐ POSITIONS COME FROM THE PROJECTION ITSELF — `rollingId` rides on every rendered position, including a
  // WITHHELD one, because a position is STRUCTURE and not content (the disclosure layer's own rule).
  const ids = (shelter.exchanges ?? []).map((x) => x.rollingId).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  // ⚠️ CONTIGUITY IS JUDGED IN CONVERSATION ORDER, ⛔ never by rolling_id arithmetic: `rolling_id` is ONE
  // GLOBAL SEQUENCE, so consecutive messages of one conversation can be hundreds apart. Measured: 46% of
  // conversations of >=12 messages have interior gaps, the worst 1,136 of them.
  const order = turns.map((t) => t.rolling_id)
  const idx = ids.map((n) => order.indexOf(n))
  const gaps = idx.length > 1 ? idx.slice(1).map((n, i) => n - idx[i]).filter((d) => d !== 1).length : 0
  check('R2 · ⭐⭐ the rendered positions are CONTIGUOUS — no silent hole in the middle',
    ids.length > 0 && gaps === 0, `positions [${ids.join(', ')}] · ${gaps} gap(s)`)
  check('R2b · both speakers are represented — ⛔ not a monologue of her own lines',
    (shelter.exchanges ?? []).some((x) => x.who === 'me') && (shelter.exchanges ?? []).some((x) => x.who !== 'me'),
    JSON.stringify([...new Set((shelter.exchanges ?? []).map((x) => x.who))]))
}

// ── 4 · B2 — `partial` vs `incomplete` ──────────────────────────────────────────────────────────────
check('B2-① · `partial` is AUTHORIZATION — this same-room episode withheld nothing, so it is false',
  shelter?.partial === false, `partial=${shelter?.partial}`)
check('B2-② · ⭐⭐ `incomplete` EXISTS as its own fact, distinct from `partial`',
  shelter && typeof shelter.incomplete === 'boolean',
  `incomplete=${shelter?.incomplete} (${typeof shelter?.incomplete})`)
check('B2-③ · ⭐ the PROJECTION declares how it was built — centre, span, and what it covered',
  !!shelter?.projection?.window && Number.isFinite(shelter?.projection?.covered) && Number.isFinite(shelter?.projection?.ofSpan),
  JSON.stringify(shelter?.projection ?? null))
check('B2-④ · ⛔ `incomplete` is DERIVED from the projection, never hand-set',
  shelter && shelter.incomplete === (shelter.projection?.covered < shelter.projection?.ofSpan),
  `incomplete=${shelter?.incomplete} covered=${shelter?.projection?.covered} of=${shelter?.projection?.ofSpan}`)

// ── 5 · ⭐⭐⭐ B-D4 — A GAP MARKER MUST NEVER BE READABLE AS SPEECH ──────────────────────────────────
// The attribution detector parses the rendered block for `X said to me:` to build its REQ_PRIOR_CONV source
// set. ⛔ Metadata describing a gap must never become detector-visible as FABRICATED SPEECH.
const rendered = out?.context ?? ''
const speech = personSpeechIn({ cognition: rendered })
const gapLines = rendered.split('\n').filter((l) => /\[|withheld|not shown|gap|could not|omitted/i.test(l))
check('B-D4 · ⭐⭐⭐ no gap/withheld marker is parsed as SPEECH by the frozen attribution detector',
  !speech.some((s) => gapLines.some((g) => g.includes(String(s.text ?? '').slice(0, 30)))),
  `${speech.length} speech line(s) · ${gapLines.length} marker-ish line(s)`)
check('B-D4b · every speech line the detector sees has a real speaker and real text',
  speech.every((s) => s.speaker && String(s.text ?? '').trim().length > 0),
  JSON.stringify(speech.slice(0, 2).map((s) => s.speaker)))

// ── 6 · ⭐⭐ R3 — THE GRANT-COUNT CONTROL, with live grants CLEARED FIRST ────────────────────────────
// ⚠️ Ote's warning, and it is the whole reason this assertion is written this way:
//     grant already exists → liveGrant() succeeds → no new row → test says "zero grants" → NOTHING PROVED.
// ⇒ the standing grants are cleared, THEN the projection is rebuilt, THEN the rows are counted.
const grantTable = await one(`SELECT to_regclass('${devSchema()}.log_disclosure_events') AS t`)
if (grantTable?.t) {
  await q(`DELETE FROM ${S}."log_disclosure_events" WHERE created_at > now() - interval '1 day' AND authorized_via IS NOT DISTINCT FROM 'zzB_probe'`).catch(() => {})
  const before = Number((await one(`SELECT count(*) n FROM ${S}."log_disclosure_events"`))?.n ?? 0)
  await cognition.recollect({ text: 'which day do i do my shelter volunteering, and where do i live?' })
  const after = Number((await one(`SELECT count(*) n FROM ${S}."log_disclosure_events"`))?.n ?? 0)
  check('R3 · ⭐⭐ the SAME-ROOM projection creates ZERO disclosure grants — the 84e2c18 win is kept',
    after === before, `${before} → ${after} grant rows`)
} else {
  check('R3 · the disclosure event table exists to count against', false, 'log_disclosure_events missing')
}

// ── 7 · R7 — ONE SPAN, DECLARED ONCE ────────────────────────────────────────────────────────────────
// ⛔ Crude on purpose: three different spans derived from one constant is exactly how this defect arose.
const SRC = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
check('R7 · ⛔ the counterpart half no longer uses `ORDER BY rolling_id ASC LIMIT windowRadius` with no window',
  !/role:\s*'user'[\s\S]{0,320}?limit:\s*LIMITS\.windowRadius\s*,/.test(CODE),
  'the uncentred same-room read is gone')
check('R9 · ⛔ HER OWN HALF is still read directly — no disclosure call in that stage (84e2c18 preserved)',
  /role:\s*'assistant'/.test(CODE) && !/role:\s*'assistant'[\s\S]{0,400}?inspectAround/.test(CODE),
  'own-half stage contains no inspectAround')

await pg.end()
done()
