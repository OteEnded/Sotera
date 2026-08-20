// THE NAME PATH — shape, subject, and a card that cannot state a false premise.
//
//   node checks/name-path-check.mjs
//
// Ote, 2026-08-20, after a screenshot from Hermes's room: *"omg, this is bad."* Three instances on one
// unvalidated path (`DEFECT_MEMORY_NAME_FRAGMENT_CAPTURE.md`):
//
//   1  `preferred_name: "Being Your"`           — STORED, importance 9, root's own room
//   2  a card offering `"กระบวนการ ไม่ใช่แก่น"` — *"process, not essence"*, a phrase from the discussion
//   3  a card offering `"โอเต้"`                — a THIRD PARTY's name, after Hermes wrote *"correct OTE's
//                                                 name"* and named Ote twice
//
// ⭐ The gate DID hold — `set_display_name` has been called zero times ever — but it held by asking the user
// a question built on a false premise, and one card timed out unanswered. So the gate was absorbing a
// defect upstream of it.
//
// ⚠️ AND THE LIMIT IS ASSERTED HERE TOO, NOT HIDDEN: the service never sees the sentence, so a reliable
// SUBJECT check cannot live in it. Instance 3's remedy is the card, and this check proves the card can no
// longer misstate the premise or omit the correction.
//
// Read-only on real accounts: every assertion below is a first-phase call, which by contract writes nothing.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { setDisplayName, looksLikeAName } from '../../Backend/app/components/profile-service.js'

const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const fastify = { db, config, log: null }

const users = Object.fromEntries((await Q('SELECT id::text, username, display_name FROM persona_sotera.mst_users')).map((u) => [u.username, u]))
const agentDev = { id: users.agent_dev.id, username: 'agent_dev', isRoot: false }

try {
  // ── S · SHAPE. The two real fragments, and the names that must still pass. ──────────────────────
  ok(looksLikeAName('Being Your').ok === false,
    'S · ⭐⭐ "Being Your" is refused — instance 1, which was STORED at importance 9',
    looksLikeAName('Being Your').why)
  ok(looksLikeAName('กระบวนการ ไม่ใช่แก่น').ok === false,
    'S · ⭐⭐ "กระบวนการ ไม่ใช่แก่น" is refused — instance 2, "process, not essence"',
    looksLikeAName('กระบวนการ ไม่ใช่แก่น').why)
  // ⚠️ FALSE POSITIVES ARE THE REAL RISK OF A SHAPE RULE, so the names that must survive are asserted
  // with more weight than the ones that must fail. A rule that rejects real names is worse than no rule.
  for (const good of ['Ote', 'โอเต้', 'Hermes', 'Kavi', 'Jean-Luc', "O'Brien", 'María José', 'Ote Ended', 'มินา', '大輔']) {
    ok(looksLikeAName(good).ok === true, `S · a real name still passes: ${good}`, looksLikeAName(good).why ?? '')
  }
  ok(looksLikeAName('María José de la Cruz').ok === true,
    'S · ⭐ …including a long multi-part name — 5 words is the bound, and it admits real ones')
  ok(looksLikeAName('process, not essence').ok === false, 'S · sentence punctuation is refused')

  // ── T · the tool refuses a fragment before proposing anything ───────────────────────────────────
  const frag = await setDisplayName(fastify, agentDev, 'Being Your', { turnId: 'zz_test_turn_1' })
  ok(frag.ok === false && frag.reason === 'not_name_shaped',
    'T · ⭐ the tool refuses it with a NAMED reason, before any card is proposed', frag.reason)
  ok(!frag.needs_confirmation,
    'T · ⭐⭐ …and does NOT ask the user about it — a fragment should never reach a card at all')
  ok(/does not look like a name/.test(frag.message) && /phrase from the conversation/.test(frag.message),
    'T · …with a message she can relay, and a hint at the likely cause')

  // ── O · SUBJECT, the computable half. Another account's name is refused. ────────────────────────
  const other = await setDisplayName(fastify, agentDev, users.hermes.display_name || 'Hermes', { turnId: 'zz_test_turn_2' })
  ok(other.ok === false && other.reason === 'name_belongs_to_another_person',
    "O · ⭐⭐ renaming this account to ANOTHER person's name is refused", other.reason)
  ok(/not this account's display name/.test(other.message),
    'O · ⭐ …and the message says the thing that was actually wrong: a name learned ABOUT someone is not this account\'s')

  // ⚠️ THE LIMIT, ASSERTED. Instance 3's Thai spelling was not on any other row at the time, so the
  // computable check would NOT have caught it. Stating that here so nobody reads O above as a fix for it.
  const notCaught = await setDisplayName(fastify, agentDev, 'โอเต้', { turnId: 'zz_test_turn_3' })
  ok(notCaught.needs_confirmation === true,
    'O · ⚠️⚠️ a third party\'s name that is NOT on file still reaches the card — the service never sees the sentence, so the CARD is the remedy, not this check')

  // ── C · THE CARD. It cannot state a false premise, and cannot omit the correction. ──────────────
  const card = notCaught.ask
  ok(Boolean(card), 'C · ⭐ the service BUILDS the card — it is no longer hers to phrase')
  ok(!/just given your name/i.test(card.question) && /\?$/.test(card.question.trim()),
    'C · ⭐⭐ the premise is a QUESTION, not the assertion "you\'ve just given your name as X"', card.question)
  ok(/YOUR name/.test(card.question),
    'C · ⭐ …and it makes the SUBJECT explicit, which is the axis that failed', card.question)
  ok(card.options.some((o) => /someone else/i.test(o.label)),
    "C · ⭐⭐ a THIRD option exists — \"that is someone else's name\" — so the human can correct what code cannot infer",
    card.options.map((o) => o.label).join(' | '))
  ok(card.options.length === 3 && card.allowCustom === true,
    'C · three options plus free text — the old card offered two, both wrong', `${card.options.length} options`)
  ok(/EXACTLY as given/.test(notCaught.message) && /do not drop/.test(notCaught.message),
    'C · …and she is told to pass it through unrewritten')

  // ── W · NOTHING WAS WRITTEN. Every call above was first-phase. ──────────────────────────────────
  const [after] = await Q("SELECT display_name FROM persona_sotera.mst_users WHERE username='agent_dev'")
  ok(after.display_name === users.agent_dev.display_name,
    'W · ⭐ agent_dev\'s display name is unchanged — the whole check is first-phase by contract',
    `${after.display_name}`)
  const [{ n: calls }] = await Q("SELECT count(*)::int AS n FROM persona_sotera.log_tool_calls WHERE tool='set_display_name'")
  ok(calls === 0, 'W · ⭐⭐ and set_display_name has STILL never been called in production', `${calls} call(s), ever`)
} finally {
  await seq.close().catch(() => {})
}

done()
