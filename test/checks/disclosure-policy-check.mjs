// DISCLOSURE POLICY — the deployment switch, asserted in BOTH positions.
//
// ⭐⭐⭐ WHAT THIS CHECK EXISTS FOR, and it is not the permissive half. Ote asked for a no-permission-first
// personal deployment and then asked for the thing that is actually hard: *"please make sure we can still
// tighten it later without redesigning the whole mechanism."*
//
// ⛔ A PROMISE THAT A SWITCH STILL WORKS IN THE OTHER POSITION IS WORTHLESS UNTIL SOMETHING FLIPS IT.
// This codebase has the receipt: `grantFromInteraction` was correct, tested, and had NO PRODUCTION CALLER
// for a day — a 28-assertion suite around a mechanism nothing could reach. The card path is now in exactly
// that position: nothing in this deployment can raise a card, so nothing in this deployment exercises it.
// ⇒ Every assertion below runs TWICE, once per policy value, against the same rooms and the same host —
// and the strict half is the one that would otherwise quietly rot.
//
// ⚠️ THE POLICY IS PASSED AS CONFIG, NOT MONKEY-PATCHED. `buildDisclosure` reads `fastify.config` on every
// call, so a check can hand it a different deployment and get that deployment's behaviour — which is also
// the proof that tightening is a config change rather than a code change.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildDisclosure } from '../../Backend/app/components/disclosure-host.js'
import {
  disclosureMode, autoAuthorizes, mayRaiseDisclosureCard, describeDisclosurePolicy, DISCLOSURE_MODES,
} from '../../Backend/app/components/disclosure-policy.js'

const { check, done } = makeChecker('disclosure-policy')
const db = await initDB(); setDB(db); await initSettings(db)
const realConfig = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()

// ── 1. THE PURE HALF — no database, no host, just the policy function ───────────────────────────────
// ⛔ STRICT BY DEFAULT, and this is the assertion that matters most: a deployment that never said anything
// about disclosure must not inherit permissiveness from the one that did.
check('1 · ⛔⛔ an empty config is STRICT — permissiveness is never inherited',
  disclosureMode({}) === 'shared' && disclosureMode(undefined) === 'shared', disclosureMode({}))
check('1 · ⛔ so is an unrecognised mode — a typo must fail CLOSED, not open',
  disclosureMode({ memory: { disclosure: { mode: 'persnal' } } }) === 'shared')
check('1 · a deployment that says `personal` gets personal',
  disclosureMode({ memory: { disclosure: { mode: 'personal' } } }) === 'personal')
// ⓘ The legacy flag is honoured rather than dropped: it is what shipped with migration 020, and a config
// that still carries it must keep behaving the way its author expects.
check('1 · ⓘ the legacy `rootAutoDisclosure: true` still means personal',
  disclosureMode({ memory: { rootAutoDisclosure: true } }) === 'personal')
check('1 · ⭐ …but an explicit mode WINS over the legacy flag — the stated policy beats the approximation',
  disclosureMode({ memory: { rootAutoDisclosure: true, disclosure: { mode: 'shared' } } }) === 'shared')
check('1 · ⛔⛔ NON-ROOT IS NEVER AUTOMATICALLY AUTHORIZED, in either mode',
  DISCLOSURE_MODES.every((mode) => autoAuthorizes({ memory: { disclosure: { mode } } }, { isRoot: false }) === false))
// ⚠️ The nine-instance defect in this codebase is inferring root-ness from a value's SHAPE. A missing
// `isRoot` is not root.
check('1 · ⚠ a missing isRoot is not root — root-ness is never inferred from an absence',
  autoAuthorizes({ memory: { disclosure: { mode: 'personal' } } }, {}) === false)
check('1 · ⭐ the two questions are separate: authorized automatically ⇒ no card is the right thing to reach for',
  mayRaiseDisclosureCard({ memory: { disclosure: { mode: 'personal' } } }, { isRoot: true }) === false
  && mayRaiseDisclosureCard({ memory: { disclosure: { mode: 'shared' } } }, { isRoot: true }) === true)
check('1 · the policy describes itself for a log without naming a room or a person',
  /^personal:/.test(describeDisclosurePolicy({ memory: { disclosure: { mode: 'personal' } } }))
  && /^shared:/.test(describeDisclosurePolicy({})))

// ── 2. TWO ROOMS AND ONE OF HER MESSAGES IN EACH ───────────────────────────────────────────────────
const { rows: pick } = await pg.query(
  `select c.user_id, u.username, m.id msg, c.id conversation_id
     from ${S}.txn_messages m
     join ${S}.txn_conversations c on c.id = m.conversation_id
     join ${S}.mst_users u on u.id = c.user_id
    where m.role='assistant' and c.incognito = false and length(m.content) > 40
    order by c.user_id, m.rolling_id desc`)
const byRoom = new Map()
for (const r of pick) if (!byRoom.has(r.username)) byRoom.set(r.username, r)
const rooms = [...byRoom.values()]
check('2 · at least two rooms with her messages exist to test the switch', rooms.length >= 2, `${rooms.length}`)
const mine = rooms[0]
const theirs = rooms[1]
const [conv0] = (await pg.query(
  `select id from ${S}.txn_conversations where user_id = $1 order by updated_at desc limit 1`, [mine.user_id])).rows
check('2 · a conversation of her own to work in', Boolean(conv0), String(conv0?.id))

const cfg = (mode) => ({ ...realConfig, memory: { ...realConfig.memory, rootAutoDisclosure: false, disclosure: { mode } } })
const host = (mode, { isRoot = true, interactive = true } = {}) => buildDisclosure(
  { db, config: cfg(mode), log: null },
  { userId: mine.user_id, isRoot, username: mine.username, conversationId: conv0.id, interactive })
const revoke = () => pg.query(`update ${S}.log_disclosure_events set revoked_at = now()
                                where revoked_at is null and from_room_user_id = $1`, [theirs.user_id])

// ── 3. `personal` — CAPABILITY FIRST. No card, either way in. ───────────────────────────────────────
await revoke()
const pInspect = await host('personal').inspectAround({ messageId: theirs.msg, radius: 2 })
check('3 · ⭐⭐ personal: INSPECTING another room returns the content, with nobody asked',
  pInspect.ok === true && pInspect.state === 'verified', `state=${pInspect.state}`)
await revoke()
const cardsBefore = (await pg.query(
  `select count(*)::int n from ${S}.txn_interaction_sessions where conversation_id=$1`, [conv0.id])).rows[0].n
const pAsk = await host('personal').requestRoomAccess({ conversationHandle: theirs.conversation_id, radius: 2 })
const cardsAfter = (await pg.query(
  `select count(*)::int n from ${S}.txn_interaction_sessions where conversation_id=$1`, [conv0.id])).rows[0].n
check('3 · ⭐⭐⭐ personal: ASKING is granted immediately — asking is never worse than not asking',
  pAsk.ok === true && pAsk.granted === true && pAsk.automatic === true, pAsk.reason || `automatic=${pAsk.automatic}`)
check('3 · ⭐⭐ personal: and NO card was raised by the request',
  cardsAfter === cardsBefore, `interaction rows ${cardsBefore} → ${cardsAfter}`)
// ⭐⭐⭐ THE ONE THAT MUST SURVIVE THE PERMISSIVE MODE, and Ote kept it in words: *"other people's
// conversation contents must remain protected."* Capability-first is about ROOT, not about everyone.
const pNonRoot = await host('personal', { isRoot: false }).inspectAround({ messageId: theirs.msg, radius: 2 })
const pWithheld = (pNonRoot.window || []).filter((w) => w.who !== 'you')
check('3 · ⭐⭐⭐ personal: a NON-ROOT session still gets her own half only — the mode is about root',
  pNonRoot.state === 'own_only' && pWithheld.every((w) => w.said === null),
  `state=${pNonRoot.state}, ${pWithheld.length} withheld`)
// ⭐ AND A HEADLESS ROOT RUN AGREES WITH THE INTERACTIVE ONE. This ordering was wrong until today: the
// `interactive` gate sat in FRONT of the policy, so a headless run was refused by the request path and
// granted by the inspect path — the same two-paths-disagree bug in a second costume.
await revoke()
const pHeadless = await host('personal', { interactive: false }).requestRoomAccess({ conversationHandle: theirs.conversation_id, radius: 2 })
check('3 · ⭐⭐ personal: a HEADLESS root run is granted too — whether a human is present only matters if one is to be asked',
  pHeadless.ok === true && pHeadless.granted === true, pHeadless.reason || '')
// ⛔ The record is the thing that keeps this reversible. Automatic removes the click, never the row.
const { rows: via } = await pg.query(
  `select authorized_via, interaction_id, lifetime from ${S}.log_disclosure_events
    where from_room_user_id = $1 order by disclosed_at desc limit 1`, [theirs.user_id])
check('3 · ⭐⭐ personal: every automatic disclosure is RECORDED as automatic, with no interaction behind it',
  via[0]?.authorized_via === 'root_session' && via[0]?.interaction_id === null,
  `${via[0]?.authorized_via} / interaction=${via[0]?.interaction_id} / lifetime=${via[0]?.lifetime}`)

// ── 4. `shared` — THE TIGHTENED DEPLOYMENT, ON THE SAME CODE ────────────────────────────────────────
// ⭐⭐⭐ THIS IS THE HALF THAT MAKES "we can tighten it later" A FACT RATHER THAN AN INTENTION.
await revoke()
const sInspect = await host('shared').inspectAround({ messageId: theirs.msg, radius: 2 })
const sWithheld = (sInspect.window || []).filter((w) => w.who !== 'you')
check('4 · ⭐⭐⭐ shared: the SAME root session gets her own half only — the switch really switches',
  sInspect.state === 'own_only' && sWithheld.every((w) => w.said === null),
  `state=${sInspect.state}, ${sWithheld.length} withheld`)
check('4 · ⭐ shared: …and it is told how to open it, rather than left at a dead end',
  Boolean(sInspect.howToOpen), String(sInspect.howToOpen).slice(0, 70))
// ⛔ NO AUTOMATIC GRANT MAY HAVE BEEN WRITTEN. A row here would mean the strict mode disclosed and then
// reported that it had not.
const { rows: sRows } = await pg.query(
  `select count(*)::int n from ${S}.log_disclosure_events
    where from_room_user_id = $1 and revoked_at is null and authorized_via = 'root_session'`, [theirs.user_id])
check('4 · ⛔⛔ shared: no automatic grant exists — the strict mode wrote nothing it then denied',
  sRows[0].n === 0, `${sRows[0].n} live root_session grant(s)`)
// ⭐ A HEADLESS RUN IN THE STRICT MODE SAYS SO INSTEAD OF HANGING. ⛔ Deliberately not calling the
// interactive path here: `askInteraction` HOLDS the turn for a live human, so a check that reached it would
// sit for the full card timeout. What is asserted is that the strict path leads TO the card and not past it.
const sHeadless = await host('shared', { interactive: false }).requestRoomAccess({ conversationHandle: theirs.conversation_id, radius: 2 })
check('4 · ⭐⭐ shared: a run with no human refuses rather than raising a card nobody can answer',
  sHeadless.ok === false && /no human/.test(sHeadless.reason || ''), sHeadless.reason)
const sNonRoot = await host('shared', { isRoot: false }).requestRoomAccess({ conversationHandle: theirs.conversation_id, radius: 2 })
check('4 · ⛔ shared: a non-root session still cannot even ask',
  sNonRoot.ok === false && /root/.test(sNonRoot.reason || ''), sNonRoot.reason)

// ── 5. THE DEPLOYMENT AS IT IS ACTUALLY CONFIGURED ─────────────────────────────────────────────────
// ⚠️ NOT A TAUTOLOGY, and worth its own line: everything above ran on a config this check built. This one
// reads the config the SERVER reads, so "we changed the policy" and "the policy changed" are separate facts.
check(`5 · ⭐ this deployment is running policy: ${disclosureMode(realConfig)}`,
  DISCLOSURE_MODES.includes(disclosureMode(realConfig)), describeDisclosurePolicy(realConfig))

await revoke()
await pg.end()
done()
