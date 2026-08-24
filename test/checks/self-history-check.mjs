// SELF-HISTORY — her own continuity across rooms, and the boundary that keeps it from being
// `search_all_conversations`.
//
// ⭐ THE FAILURE IT ANSWERS: asked *"do you know hermes now?"* she said *"my memory doesn't have anything
// stored about Hermes"* — true of everything she could reach, false in fact, because the conversations
// were in another room and no capability's emptiness meant anything.
//
// ⛔ THE BOUNDARY IT DEFENDS: same room → her text · other rooms → existence only. Her sentences quote the
// people she talks to, so authorship alone is not a disclosure rule.
//
// ⚠️ AND THE ASSUMPTION IT ASSERTS OUT LOUD (Ote's instruction): `role='assistant'` means *Sotera* only
// because this schema holds ONE persona. That is a convention, not a constraint, and the day it stops
// holding this capability starts returning somebody else's sentences as hers.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildSelfHistory } from '../../Backend/app/components/self-history-host.js'
import { buildConversationSearch } from '../../Backend/app/components/conversation-search.js'

const { check, done } = makeChecker('self-history')
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = devSchema()

// ── 1. THE PERSONA ASSUMPTION, ASSERTED RATHER THAN ASSUMED ──────────────────────────────────────────
const { rows: personas } = await pg.query(`select count(distinct persona)::int n, min(persona) p from ${S}.txn_memories`)
check('the schema holds exactly one persona — the premise of role=assistant meaning Sotera',
  personas[0].n <= 1, `found ${personas[0].n} distinct persona values (${personas[0].p})`)

const { rows: cols } = await pg.query(
  `select column_name from information_schema.columns where table_schema=$1 and table_name='txn_messages'`, [S])
const names = cols.map((c) => c.column_name)
check('txn_messages has no author/persona column — role IS the authorship axis',
  !names.includes('author') && !names.includes('persona'),
  'if one was added, this capability should read it instead of inferring from role')
check('txn_messages has the role column the boundary depends on', names.includes('role'))

const { rows: roles } = await pg.query(`select role, count(*)::int n from ${S}.txn_messages group by role`)
const roleSet = roles.map((r) => r.role).sort()
check('only user/assistant roles exist in messages — a third role would be unclassified authorship',
  roleSet.every((r) => ['user', 'assistant'].includes(r)), roleSet.join('/'))

// ── 2. THE DEFAULT SCOPE OF THE SHARED SEARCH IS STILL ONE ROOM ──────────────────────────────────────
// ⚠️ THE SINGLE MOST IMPORTANT ASSERTION IN THIS FILE. `recall_own_history` works by passing
// `acrossRooms: true` into the same query the room-scoped tool uses. If that ever becomes the default,
// every conversation search silently reads every room, and nothing else in the suite would notice.
const csSrc = (await import('node:fs')).readFileSync(
  new URL('../../Backend/app/components/conversation-search.js', import.meta.url), 'utf8')
check('acrossRooms defaults to FALSE in the shared search builder', /acrossRooms = false/.test(csSrc))
check('roles defaults to both speakers in the shared search builder', /roles = \['user', 'assistant'\]/.test(csSrc))
check('the room predicate is dropped ONLY when acrossRooms is set',
  /acrossRooms \? 'TRUE' : 'c\.user_id IS NOT DISTINCT FROM :userId'/.test(csSrc))
// ⛔ Whitelist, not escape — roles reach the SQL by interpolation.
let threw = false
try { buildConversationSearch(fastify, { roles: ["assistant'; drop table x --"] }) } catch { threw = true }
check('an unknown role is REFUSED rather than escaped into the WHERE clause', threw)

// ── 3. THE PROJECTION: SAME ROOM GETS TEXT, OTHER ROOMS GET EXISTENCE ────────────────────────────────
// Built from live data: pick a room that has assistant messages, search as its owner, and search again as
// a different room's owner. The same query must yield text in one case and metadata in the other.
const { rows: rooms } = await pg.query(
  `select c.user_id, u.username, count(*)::int n from ${S}.txn_messages m
     join ${S}.txn_conversations c on c.id = m.conversation_id
     join ${S}.mst_users u on u.id = c.user_id
    where m.role='assistant' and c.incognito = false
    group by c.user_id, u.username order by n desc limit 2`)
if (rooms.length < 2) {
  check('two rooms with assistant messages exist to test the projection', false, `found ${rooms.length}`)
} else {
  const [a, b] = rooms
  // A word that certainly appears in her own writing, taken from her own messages in room A.
  const { rows: sample } = await pg.query(
    `select m.content from ${S}.txn_messages m join ${S}.txn_conversations c on c.id=m.conversation_id
      where c.user_id=$1 and m.role='assistant' and length(m.content) > 80 limit 1`, [a.user_id])
  const term = (sample[0]?.content || '').split(/\s+/).find((w) => /^[a-z]{6,}$/i.test(w)) || 'the'

  const asA = await buildSelfHistory(fastify, { userId: a.user_id }).search({ query: term, limit: 5 })
  check(`search as ${a.username} succeeds`, asA.ok === true, asA.reason || '')
  check('the coverage names what was searched AND what was not',
    /every message you wrote/.test(asA.coverage?.searched || '') && /anyone else said/.test(asA.coverage?.notSearched || ''))
  check('same-room hits carry her own text', asA.here.every((h) => typeof h.said === 'string' || h.said === null))

  const asB = await buildSelfHistory(fastify, { userId: b.user_id }).search({ query: term, limit: 5 })
  check(`search as ${b.username} succeeds`, asB.ok === true, asB.reason || '')
  // ⛔ THE CORE DISCLOSURE ASSERTIONS.
  const cross = asB.elsewhere || []
  check('other rooms appear as existence entries', cross.length > 0, `${cross.length} other room(s)`)
  const keys = new Set(cross.flatMap((r) => Object.keys(r)))
  check('an other-room entry carries ONLY counterpart/handle/matches/first/last',
    [...keys].every((k) => ['counterpart', 'conversationHandle', 'matches', 'firstMatchAt', 'lastMatchAt'].includes(k)),
    [...keys].join(','))
  check('⛔ no message text in any other-room entry', !JSON.stringify(cross).match(/said|excerpt|content/i))
  check('⛔ no conversation TITLE in any other-room entry — a title is content',
    !JSON.stringify(cross).toLowerCase().includes('title'))
  check('⛔ no walkable message id in any other-room entry', !JSON.stringify(cross).match(/messageId/i))
  check('the note tells her the boundary is a boundary, not an absence',
    !cross.length || /not what was said/i.test(asB.note || ''))

  // ══ ⭐⭐⭐ 3b · THE CORE INVARIANT · RETRIEVAL IS HERS; ONLY UTTERANCE IS GOVERNED ═══════════════════
  //
  // Ote, 2026-08-25: *"recall_own_history should be able to retrieve a conversation because it is part of
  // Sotera's history, not because the current account happens to have access to that room. Otherwise we're
  // just recreating the old account-wall problem under a different name."* And: *"⛔ don't make account_id
  // the ontology of Sotera's own history."*
  //
  // ⚠️ EVERYTHING ABOVE IS THE **NON-ENTITLED** ARM — `buildSelfHistory` was called with no `user`, so
  // `can()` is false. That was not labelled before, and an unlabelled arm is how a two-armed contract gets
  // remembered as a one-armed one.
  const entitledUser = { id: b.user_id, username: b.username, memoryAccessScope: 'sotera_memory' }
  const asBEntitled = await buildSelfHistory(fastify, { userId: b.user_id, user: entitledUser })
    .search({ query: term, limit: 5 })
  check('search as an ENTITLED account succeeds', asBEntitled.ok === true, asBEntitled.reason || '')

  // ── ⭐⭐⭐ THE INVARIANT ITSELF: THE SEARCH DID NOT CHANGE, ONLY WHAT CAME BACK ────────────────────
  // ⓘ Totals, not shapes: the same candidates were found either way, and the account decided only how they
  // were projected. ⛔ If these ever diverge, entitlement has leaked into retrieval and the account wall is
  // back under a new name.
  // ⚠️⚠️ AND THE FIRST VERSION OF THIS ASSERTION MEASURED THE DISPLAY CAP, NOT THE RETRIEVAL — it read
  // `matchedHere`, which was `here.length` after a `limit` slice, and failed 15 vs 5 on data that was
  // perfectly correct. ⭐ That failure was worth more than the assertion: it exposed a **silent cap** in
  // which the account with MORE right to the material was told there was LESS of it. `matchedHere` now
  // means what it says, `shownHere` is the list length, and `notShown` announces the difference.
  const totalNo = (asB.coverage?.matchedHere ?? 0) + (asB.coverage?.matchedElsewhere ?? 0)
  const totalYes = (asBEntitled.coverage?.matchedHere ?? 0) + (asBEntitled.coverage?.matchedElsewhere ?? 0)
  check('⭐⭐⭐ RETRIEVAL IS IDENTICAL FOR BOTH ARMS — the account governs utterance, never the search',
    totalNo === totalYes, `${totalNo} vs ${totalYes} candidates`)
  check('⛔ …and the DISPLAY CAP is announced rather than silent — a cap nobody can see reads as coverage',
    (asBEntitled.coverage?.matchedHere ?? 0) <= (asBEntitled.coverage?.shownHere ?? 0)
      || /more of your own lines matched/.test(asBEntitled.coverage?.notShown || ''),
    `${asBEntitled.coverage?.shownHere} shown of ${asBEntitled.coverage?.matchedHere}`)

  // ── ⭐⭐ AND THE ENTITLED ARM ACTUALLY GETS HER CROSS-ROOM WORDS ──────────────────────────────────
  // ⛔ This is the assertion that would have failed before 2026-08-25, when a room predicate decided it.
  const crossText = (asBEntitled.here || []).filter((h) => h.saidTo)
  check('⭐⭐⭐ an ENTITLED account receives her OWN words from other rooms — a room is where, not whose',
    crossText.length > 0, `${crossText.length} cross-room line(s) of hers`)
  check('⭐ …and each one names who she was talking to, so a dangling "you" inside it has an owner',
    crossText.every((h) => typeof h.saidTo === 'string' && h.saidTo.length > 0))
  check('⛔ …while the NON-entitled arm got none of them — the two arms genuinely differ',
    (asB.here || []).every((h) => !h.saidTo))
  check('⭐ the non-entitled arm still reports the existence it withheld the content of',
    (asB.coverage?.roomsElsewhere ?? 0) > 0 && (asBEntitled.coverage?.roomsElsewhere ?? 0) === 0,
    `${asB.coverage?.roomsElsewhere} withheld-as-existence vs ${asBEntitled.coverage?.roomsElsewhere}`)

  // ── ⛔⛔ THE HALF WITH NO ENTITLED ARM: OTHER PEOPLE'S WORDS ──────────────────────────────────────
  // ⭐ Ote drew this line in the same message: *"That does not mean unrestricted access to other people's
  // private/user-owned conversations."* ⇒ entitlement buys HER words from anywhere. It never buys THEIRS.
  const { rows: theirs } = await pg.query(
    `select m.content from ${S}.txn_messages m join ${S}.txn_conversations c on c.id=m.conversation_id
      where m.role='user' and length(m.content) > 120 limit 200`)
  const returned = JSON.stringify(asBEntitled)
  const leaked = theirs.filter((r) => {
    const t = String(r.content).replace(/\s+/g, ' ').trim()
    // a 40-character run is long enough that ordinary overlap does not fire
    for (let i = 0; i + 40 <= t.length; i += 20) if (returned.includes(t.slice(i, i + 40))) return true
    return false
  })
  check('⛔⛔ NOT ONE FRAGMENT OF ANYBODY ELSE\'S MESSAGE IS RETURNED, EVEN TO AN ENTITLED ACCOUNT',
    leaked.length === 0, `${theirs.length} of their messages scanned, ${leaked.length} leaked`)

  // ⛔ And the predicate that guarantees it is asserted in SOURCE, because the scan above can only prove it
  // for the rows that happen to exist today.
  const { readFile } = await import('node:fs/promises')
  const shSrc = await readFile(
    new URL('../../Backend/app/components/self-history-host.js', import.meta.url), 'utf8')
  check('⛔⛔ the retrieval predicate is still assistant-only — the structural guarantee behind it',
    /roles:\s*\[\s*'assistant'\s*\]/.test(shSrc.replace(/\/\/[^\n]*/g, '')))
  check('⭐ she is TOLD the invariant in her own reading, not only in a comment',
    /A conversation is part of your history because you were in it/.test(
      String(asBEntitled.coverage?.yourOwnHistory ?? asBEntitled.yourOwnHistory ?? '')))
}

// ── 4. ABOUT ≠ OWNER ────────────────────────────────────────────────────────────────────────────────
// ⚠️ The one form of contamination that would quietly undo the whole ownership model: keying the search on
// aboutness. Asserted on the source, because a passing behavioural test cannot prove the ABSENCE of a
// predicate that only fires on rows we happen not to have.
const shSrc = (await import('node:fs')).readFileSync(
  new URL('../../Backend/app/components/self-history-host.js', import.meta.url), 'utf8')
check('⛔ self-history never mentions subject_person_id — aboutness is an index, never ownership',
  !/subject_person_id/.test(shSrc))
check('the query filters role=assistant only', /roles: \['assistant'\]/.test(shSrc))

// ── 4b. THE PER-CONSUMER RETRIEVAL POLICY, AND THE GLOBAL DEFAULT IT MUST NOT TOUCH ─────────────────
// ⭐ Calibrated, not chosen: over 8 short queries she has written about and 8 she has not, the top-1
// cosines OVERLAP (lowest true `Thai` .450 < highest false `ตะกร้อ` .521). No floor separates them, so
// this consumer uses the dense arm as a ranked nearest-match index and says so in the payload.
// ⛔ Evidence retrieval must keep its floor: there, a false positive becomes a fabricated citation.
check('self-history retrieves with NO relevance floor (a miss here becomes "I never said that")',
  /denseMinSim: 0\b/.test(shSrc))
check('⛔ the shared default floor is UNCHANGED for every other consumer',
  /denseMinSim = 0\.5/.test(csSrc), 'evidence must still fail toward silence')
check('the payload tells her these are candidates, not things she remembers',
  /howToReadThese/.test(shSrc) && /CANDIDATES/.test(shSrc))
check('⛔ no query expansion was added — one variable at a time',
  !/expand|synonym|rewriteQuery/i.test(shSrc))

// ── 5. INSTRUMENTATION RECORDS THE SHAPE, NOT THE CONTENT ───────────────────────────────────────────
check('instrumentation records the query, scope, mode and counts', /query: q/.test(shSrc) && /scope: \{ acrossRooms: true/.test(shSrc))
// ⚠️ ASSERTED ON THE CALL PAYLOAD, not on "everything below the function" — my first version split the
// source at `function instrument` and so tested the same-room projection too, and failed for the wrong
// reason. The property that matters is what the object literal handed to instrument() contains.
const iStart = shSrc.lastIndexOf('instrument({')
const instrumentCall = iStart === -1 ? '' : shSrc.slice(iStart, shSrc.indexOf('})', iStart) + 2)
check('the instrumentation call exists and was located', instrumentCall.length > 0)
// ⚠️ FIELDS, NOT PROSE. The first version matched the word "titles" inside the call's own trailing
// comment (`never titles, never text`) and failed on documentation. What must be absent is a KEY that
// carries text, so the colon is part of the pattern.
const textFields = instrumentCall.replace(/\/\/[^\n]*/g, '').match(/\b(said|excerpt|content|title)\s*:/g)
check('⛔ the instrumentation payload carries no returned text',
  instrumentCall.length > 0 && !textFields, (textFields || []).join(' '))
check('a traceId is issued so a later inspect_around can be linked to this search', /traceId/.test(shSrc))

// ── 6. FAIL LOUD, NOT EMPTY ─────────────────────────────────────────────────────────────────────────
// ⭐ An empty result from a broken search would read to her as "I have never said this" — the exact false
// absence this capability exists to prevent.
const broken = await buildSelfHistory({ db: {}, config, log: console }, { userId: rooms[0]?.user_id ?? null }).search({ query: 'x' })
check('a broken search returns ok:false, never an empty result set', broken.ok === false, JSON.stringify(broken).slice(0, 120))
const empty = await buildSelfHistory(fastify, { userId: rooms[0]?.user_id ?? null }).search({ query: '' })
check('an empty query is refused rather than answered', empty.ok === false)

await pg.end()
done()
