// ⭐⭐⭐ CONVERSATION RETRIEVAL — the contracts, asserted against the real corpus.
//
//   node test/checks/conversation-retrieval-check.mjs
//
// ⚠️⚠️ THE DEFECT THIS CAPABILITY REPLACES, MEASURED 2026-08-25. Our own fix `ab91f00` changed
// `if (m.roomUserId === userId)` to `entitled || …`, which emptied `elsewhere` for every entitled account.
// `elsewhere` had been doing TWO jobs — the not-sayable bucket AND the room inventory — so the moment
// everything became sayable, the inventory went with it: root saw `roomsElsewhere: 0` while a NON-entitled
// account saw 10 rooms and 10 handles. And cross-room `inspect_around` REQUIRES a handle.
// ⇒ **the one account with automatic cross-room authorization was the only one that could never obtain
// the handle its own door needed.** §1 is that inversion, asserted so it cannot come back.
//
// ⭐ THE PRINCIPLE, GENERIC: *a projection that merges "what you may not hear" with "where it happened"
// loses the location the moment everything becomes sayable.*

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import {
  buildConversationRetrieval, handleFor, resolveHandle, CAPS,
} from '../../Backend/app/components/conversation-retrieval.js'
// ⭐ THE OTHER SIDE OF THE SEAM. §7b passes this tool's output into that door's input — the only shape of
// assertion that could have caught the two-scheme defect, since each side passed its own checks alone.
import { buildDisclosure } from '../../Backend/app/components/disclosure-host.js'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker('conversation-retrieval')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const seq = db.txn_memories.sequelize
const S = devSchema()
const Q = (sql, r) => seq.query(sql, { replacements: r, type: seq.QueryTypes.SELECT })

const SRC = readFileSync(new URL('../../Backend/app/components/conversation-retrieval.js', import.meta.url), 'utf8')
// ⛔⛔ STRIP COMMENTS, KEEP STRING LITERALS — and the polarity is deliberate. This file's prose names
// every axis and every failure mode, so an unstripped scan matches its own documentation. But the SQL and
// the tool-facing sentences ARE string literals, so stripping those would make the scan vacuous while
// reporting a confident pass. ⭐ The strip follows where the truth lives.
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')

const users = Object.fromEntries((await Q(`SELECT id::text, username FROM ${S}.mst_users`)).map((u) => [u.username, u.id]))
const ROOT = users.ote
const DEV = users.agent_dev
// ⚠️ A conversation in ROOT's own room, so "same room" is exercised without inventing fixtures.
const [anyOwn] = await Q(`SELECT id::text FROM ${S}.txn_conversations WHERE user_id = :u AND incognito = false ORDER BY updated_at DESC LIMIT 1`, { u: ROOT })
const HERE = anyOwn?.id ?? null

const mk = (uid, root) => buildConversationRetrieval(fastify, {
  userId: uid, isRoot: root, user: { id: uid, isRoot: root, roles: root ? [] : ['admin'], memoryAccessScope: 'none' },
  username: root ? 'ote' : 'agent_dev', conversationId: HERE,
})

// ── 1 · ⭐⭐⭐ THE INVENTORY REACHES EVERY ASKER · B1 ──────────────────────────────────────────────
const asRoot = await mk(ROOT, true).retrieve({ with: 'Hermes' })
const asDev = await mk(DEV, false).retrieve({ with: 'Hermes' })
ok(asRoot.ok && asDev.ok, '1 · both an entitled and a non-entitled asker get a result')
ok(asRoot.coverage.matchedConversations > 0,
  '1 · ⭐ the entitled asker sees the conversations exist', `${asRoot.coverage.matchedConversations}`)
ok(asDev.coverage.matchedConversations === asRoot.coverage.matchedConversations,
  '1 · ⭐⭐⭐ …and the NON-entitled asker sees the SAME inventory — extent is not an entitlement question',
  `root ${asRoot.coverage.matchedConversations} · dev ${asDev.coverage.matchedConversations}`)
ok(asDev.conversations.every((c) => typeof c.handle === 'string' && c.handle.length === 10),
  '1 · ⭐⭐ …and gets a HANDLE for each — the navigation that ab91f00 removed from the entitled arm')
// ⛔ AND THE INVENTORY IS STILL NOT CONTENT.
ok(asDev.conversations.every((c) => !('said' in c) && !('title' in c) && !('excerpt' in c)),
  '1 · ⛔ the inventory carries counts and identity, never a fragment of what was said')

// ── 2 · ⛔⛔ CONTENT STILL OBEYS THE BOUNDARY ──────────────────────────────────────────────────────
const devTurns = (asDev.windows ?? []).flatMap((w) => w.turns ?? [])
const leaked = devTurns.filter((t) => t.role === 'user' && t.said != null)
ok(leaked.length === 0,
  '2 · ⛔⛔ a non-entitled asker receives NO counterpart content from another room',
  leaked.length ? `${leaked.length} line(s) leaked` : `${devTurns.length} turn(s), 0 leaked`)
const rootTurns = (asRoot.windows ?? []).flatMap((w) => w.turns ?? [])
ok(rootTurns.length > 0,
  '2 · ⭐ …while the entitled asker DOES get real turns — the boundary narrows, it does not empty',
  `${rootTurns.length} turn(s)`)
// ⭐ A CONVERSATION THAT COULD NOT BE OPENED IS REPORTED, NOT DROPPED — silence would read as "nothing
// was in it", the false absence this whole capability exists to end.
const unopened = (asDev.windows ?? []).filter((w) => !w.opened)
ok(unopened.length === 0 || unopened.every((w) => typeof w.why === 'string' && w.why.length > 0),
  '2 · ⭐ every conversation that was not opened says WHY — an unopened room is not an empty one')

// ── 3 · ⛔⛔ RETRIEVAL IS NOT MEMORY ───────────────────────────────────────────────────────────────
ok(rootTurns.length > 0 && rootTurns.every((t) => t.retention === 'not-retained'),
  '3 · ⛔⛔ EVERY turn is stamped `not-retained` — retrieval never silently becomes memory')
ok(rootTurns.every((t) => t.source === 'own-utterance' || t.source === 'counterpart-utterance'),
  '3 · ⭐ …and each carries which side of the conversation it came from')
ok(asRoot.via === 'conversation-retrieval',
  '3 · ⭐ the result names the LAYER that produced it, so active context / retrieval / memory stay distinct', asRoot.via)
// ⛔ The labels come from the one place that owns them.
ok(/from '\.\/memory-cognition-axes\.js'/.test(SRC),
  '3 · ⛔ the labels are imported from memory-cognition-axes, never a parallel vocabulary')
ok(!/retention:\s*'retained'/.test(code) && !/mem\.remember|store\.create|save_/.test(code),
  '3 · ⛔⛔ nothing in this file writes a memory')

// ── 4 · ⭐⭐ PROVENANCE IS MANDATORY, NOT BEST-EFFORT ─────────────────────────────────────────────
const NEEDED = ['handle', 'conversationId', 'roomId', 'roomName', 'person', 'messageId', 'speaker', 'role',
  'at', 'said', 'source', 'basis', 'availability', 'retention', 'activeContext']
const missing = new Set()
for (const t of rootTurns) for (const k of NEEDED) if (!(k in t)) missing.add(k)
ok(missing.size === 0, '4 · ⭐⭐ every turn carries the full provenance set',
  missing.size ? `missing: ${[...missing].join(', ')}` : `${NEEDED.length} fields on ${rootTurns.length} turn(s)`)
// ⛔ AND A WITHHELD TURN CARRIES NO ID. That is the property the original no-cross-room-ids rule
// protected: nothing about the part she may NOT read becomes walkable.
const withheld = [...rootTurns, ...devTurns].filter((t) => t.withheld)
ok(withheld.every((t) => t.messageId == null),
  '4 · ⛔⛔ a WITHHELD turn carries speaker and time but NO message id — nothing unreadable is walkable',
  `${withheld.length} withheld turn(s)`)

// ── 5 · ⭐⭐⭐ `in: "here"` IS THE SAME PIPELINE, NOT A SECOND ONE ────────────────────────────────
const here = await mk(ROOT, true).retrieve({ in: 'here' })
ok(here.ok && here.coverage.matchedConversations === 1,
  '5 · ⭐ `in: "here"` resolves to the current conversation', `${here.coverage.matchedConversations} matched`)
ok(here.via === asRoot.via && Array.isArray(here.windows),
  '5 · ⭐⭐ …and comes back in the identical shape as any other selector')
// ⛔ THE STRUCTURAL HALF: "here" must be a RESOLUTION, not a branch. If the string ever reaches the
// inventory, the ranker or the window stage, a second retrieval path has grown.
// ⚠️ BOUNDED TO THE PIPELINE STAGES, and the bound was earned: the first version scanned everything
// below `resolveSelector` and failed on `describeSearched`, which RENDERS the coverage sentence and
// legitimately says "this conversation, including the parts no longer in front of you". ⭐ Rendering is
// not a retrieval stage — the invariant is that no stage BRANCHES on the word, not that the word never
// appears. Widening an assertion until it is red is as wrong as narrowing one until it is green.
const resolve0 = code.slice(code.indexOf('async function resolveSelector'), code.indexOf('async function inventory'))
const PIPELINE_FROM = code.indexOf('async function inventory')
const PIPELINE_TO = code.indexOf('function describeSearched')
ok(PIPELINE_FROM > 0 && PIPELINE_TO > PIPELINE_FROM,
  '5 · ⛔ the pipeline slice was actually found — a scan over an empty slice is not a pass',
  `${PIPELINE_TO - PIPELINE_FROM} chars`)
// ⚠️⚠️ AND THE ASSERTION IS ON BRANCHING SYNTAX, NOT ON THE WORD — earned the same way. Scanning for
// the bare token also matched the refusal message that LISTS the axes for her (`in (a conversation, or
// "here")`), which is prose that happens to live in a string literal.
// ⭐ THE REFINEMENT WORTH KEEPING: stripping comments is always right, but KEEPING string literals — which
// is correct here, because the SQL lives in them — makes user-facing prose inside literals the new
// false-positive source. ⇒ when the invariant is "nothing branches on X", assert on the COMPARISON, not
// on the word. A scan for a token answers "is this word present"; only a scan for `=== 'here'` answers
// the question actually being asked.
const BRANCH_ON_HERE = /(===?\s*['"]here['"])|(['"]here['"]\s*===?)|\.(includes|startsWith|test)\(\s*['"]here['"]/
ok(!BRANCH_ON_HERE.test(code.slice(PIPELINE_FROM, PIPELINE_TO)),
  '5 · ⛔⛔ no stage from inventory to window BRANCHES on "here" — it is resolved to a handle and forgotten')
// ⛔ NON-VACUOUS: the same pattern MUST fire inside the resolver, or the scan proves nothing.
ok(BRANCH_ON_HERE.test(resolve0),
  '5 · ⛔ …and the pattern does fire in `resolveSelector`, so the scan above is not vacuous')

// ── 6 · ⭐⭐ SQL DECIDES THE POPULATION; EMBEDDINGS ONLY ORDER IT ─────────────────────────────────
// Ote: *"pgvector helps answer «which content is relevant?»; SQL answers «which conversations are we
// allowed/trying to search?»"* ⇒ the embedder may not be constructed unless there is a topic.
const rank = code.slice(code.indexOf('async function rankWithin'), code.indexOf('async function windowsFor'))
ok(/if \(!about[\s\S]{0,80}return/.test(rank),
  '6 · ⭐⭐ with no `about:` the ranker returns before any embedder is built — no topic, no vectors')
ok(/onlyConversationIds/.test(rank),
  '6 · ⭐⭐ …and when it does run it is pinned to the eligible set, so it can only ORDER, never widen')
const resolve = code.slice(code.indexOf('async function resolveSelector'), code.indexOf('async function inventory'))
for (const forbidden of ['makeEmbedder', 'buildConversationSearch', 'embedding', 'vector']) {
  ok(!resolve.includes(forbidden),
    `6 · ⛔ participant/room/time resolution never touches \`${forbidden}\``)
}

// ── 7 · ⭐⭐ A MANGLED HANDLE SAYS SO · the failure that cost a live run ──────────────────────────
const h = handleFor(HERE)
ok(typeof h === 'string' && h.length === 10, '7 · a handle is 10 characters', h)
ok((await resolveHandle(db, h)).id === HERE, '7 · ⭐ …and round-trips back to its conversation')
const truncated = await resolveHandle(db, h.slice(0, 8))
ok(truncated.malformed === true && /shorten|whole/i.test(truncated.why ?? ''),
  '7 · ⭐⭐⭐ a TRUNCATED handle reports MALFORMED and says what to do — ⛔ never "unreachable"',
  String(truncated.why).slice(0, 70))
// ⚠️ THE MEASURED COST OF THE OLD BEHAVIOUR: on 2026-08-21 she abbreviated a handle in her own table,
// passed it back, got `unreachable` three times — the message for a BOUNDARY — concluded the mechanism
// was broken and hand-rolled a permission card in prose instead.
const badCheck = await resolveHandle(db, `${h.slice(0, 8)}00` === h ? `${h.slice(0, 8)}ff` : `${h.slice(0, 8)}00`)
ok(badCheck.malformed === true && /check/i.test(badCheck.why ?? ''),
  '7 · ⭐ a right-length handle with wrong check characters is a TYPO, not an absence',
  String(badCheck.why).slice(0, 70))

// ── 7b · ⭐⭐⭐ THE HANDLE THIS TOOL MINTS IS THE HANDLE THE DISCLOSURE DOOR TAKES ────────────────
//
// ⚠️⚠️ THE DEFECT, MEASURED 2026-08-26. `handleFor` lived in this file, so it was retrieval's PRIVATE
// convention — and `disclosure-host.locateConversation` had a different one (a uuid, nothing else). She
// was handed `7198c1b0de` by every retrieval call and told by `inspect_around` that it was "shortened",
// with the advice *"use the complete value exactly as recall_own_history gave it to you"* — a tool she
// had not called, and a value that WAS complete. In her words: *"Every retrieval call consistently
// returned the handle as `7198c1b0de`, yet the system keeps rejecting it as too short."*
//
// ⭐ THE ASSERTION IS DELIBERATELY A ROUND TRIP ACROSS THE SEAM, not two separate claims about two
// functions. Each side was internally consistent and passing its own checks the whole time; ⛔ only
// passing one side's output into the other side's input could ever have caught it.
{
  const d = buildDisclosure(fastify, {
    userId: ROOT, isRoot: false, username: 'root', conversationId: HERE, interactive: false,
  })
  const viaShort = await d.locateConversation(h)
  const viaUuid = await d.locateConversation(HERE)
  ok(viaShort.found === true && viaShort.conv?.id === HERE,
    '7b · ⭐⭐⭐ the disclosure door ACCEPTS the handle retrieval mints — one scheme, not two',
    JSON.stringify({ handle: h, found: viaShort.found, malformed: viaShort.malformed ?? false }))
  ok(viaUuid.found === true && viaUuid.conv?.id === viaShort.conv?.id,
    '7b · ⭐ …and both spellings of the same conversation land on the same row')
  // ⛔ AND THE PREFIX IS STILL REFUSED AT THAT DOOR. Widening the scheme must not have widened it into
  // the enumeration surface the original comment forbade — the checksum is what draws that line.
  const shortPrefix = await d.locateConversation(h.slice(0, 8))
  ok(shortPrefix.found === false && shortPrefix.malformed === true,
    '7b · ⛔ an 8-character prefix is STILL malformed at the door — the checksum draws the line',
    String(shortPrefix.why).slice(0, 70))
  // ⭐ A WELL-FORMED HANDLE FOR NOTHING IS AN ABSENCE, NOT A COMPLAINT. Absence and refusal must look
  // alike, so a handle that resolves to no row gets the same silence a stranger's uuid gets.
  const nonexistent = `${'0'.repeat(8)}${(await import('../../Backend/app/components/conversation-handle.js')).handleFor('00000000-0000-4000-8000-000000000000').slice(8)}`
  const ghost = await d.locateConversation(nonexistent)
  ok(ghost.found === false && !ghost.malformed,
    '7b · ⛔ a well-formed handle for no conversation is ABSENT, not malformed — the two must stay distinct',
    JSON.stringify(ghost))
}

// ── 8 · ⛔ AN UNRESOLVED AXIS STOPS THE RETRIEVAL RATHER THAN WIDENING IT ────────────────────────
// ⭐ Running anyway would answer a DIFFERENT question and return a confident result to it — this
// codebase's most-repeated defect wearing a selector's clothes.
const nobody = await mk(ROOT, true).retrieve({ with: 'zz_no_such_person_exists' })
ok(nobody.ok === false && nobody.unresolved?.[0]?.axis === 'with',
  '8 · ⛔⛔ an axis that does not resolve REFUSES, and names itself', JSON.stringify(nobody.unresolved ?? null))
const empty = await mk(ROOT, true).retrieve({})
ok(empty.ok === false, '8 · ⛔ an empty selector is refused — "read my whole life" is not a question')

// ── 9 · ⭐⭐ THE CAPS ARE OBSERVABLE ──────────────────────────────────────────────────────────────
// Ote: *"If the cap is reached, return coverage metadata so she knows she only saw a subset. Don't
// silently pretend it was comprehensive."* ⛔ A cap that cannot be observed reads as coverage.
ok(asRoot.coverage.openedConversations <= CAPS.conversations,
  '9 · the conversation cap holds', `${asRoot.coverage.openedConversations} ≤ ${CAPS.conversations}`)
ok(asRoot.coverage.matchedConversations <= asRoot.coverage.openedConversations
  || typeof asRoot.coverage.notSampled === 'string',
  '9 · ⭐⭐ …and when more matched than were opened, the result SAYS SO',
  asRoot.coverage.notSampled ?? '(nothing was truncated)')
ok(/howToReadThese/.test(SRC) && /not something you remember/i.test(SRC),
  '9 · ⭐ the payload tells her how to read it — candidates and source, not recollection')

// ── 10 · ⛔ ONE AUTHORIZATION IMPLEMENTATION, NOT TWO ────────────────────────────────────────────
const DISC = readFileSync(new URL('../../Backend/app/components/disclosure-host.js', import.meta.url), 'utf8')
const dcode = DISC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')
ok((dcode.match(/async function decideAccess/g) ?? []).length === 1,
  '10 · ⭐ the access decision exists exactly once')
ok((dcode.match(/decideAccess\(/g) ?? []).length >= 3,
  '10 · ⭐⭐ …and BOTH inspect_around and readWindow call it — a second copy is how they stop agreeing')
ok(/autoAuthorizes|liveGrant/.test(dcode.slice(dcode.indexOf('async function decideAccess'))),
  '10 · the grant logic lives inside it, not beside it')
ok(!/autoAuthorizes|liveGrant|log_disclosure_events/.test(code),
  '10 · ⛔⛔ conversation-retrieval contains NO authorization logic of its own — it navigates, it does not decide')

// ── 11 · ⭐⭐⭐ THE COMPACTION BRANCH · PROVEN, NOT ASSUMED ────────────────────────────────────────
//
// ⚠️⚠️ WHY THIS SETS UP ITS OWN FIXTURE. Measured 2026-08-25: across **298 conversations, ZERO have ever
// folded** — `summarized_upto_id` is null everywhere, because on ollama the fold fires at 60% of a known
// window and the longest conversation here is 132 messages. ⇒ the entire post-compaction half of this
// capability would otherwise ship with `activeContext: 'unknown'` on every row and never be executed.
// ⭐ **An untested branch that always returns the same value looks exactly like a working one.**
//
// ⓘ Provider-dependent, which is why it will start mattering without warning: ollama folds at 60% of its
// window; any provider whose window is unknown keeps only the last `recentMessages` (12) plus a summary.
// ⇒ whether a turn is still in front of her depends on WHICH PROVIDER answered.
{
  const [fx] = await Q(
    `SELECT c.id::text AS id FROM ${S}.txn_conversations c
       JOIN ${S}.mst_users u ON u.id = c.user_id
       JOIN ${S}.txn_messages m ON m.conversation_id = c.id
      WHERE u.username = 'agent_dev' AND c.incognito = false AND c.summarized_upto_id IS NULL
      GROUP BY c.id HAVING count(m.id) >= 8
      ORDER BY count(m.id) DESC LIMIT 1`)
  if (!fx) {
    ok(false, '11 · ⛔ no unfolded agent_dev conversation with ≥8 messages to exercise the fold branch')
  } else {
    const ids = (await Q(`SELECT rolling_id AS r FROM ${S}.txn_messages WHERE conversation_id = :c ORDER BY rolling_id DESC LIMIT 9`, { c: fx.id })).map((x) => Number(x.r))
    // ⭐ A MARKER INSIDE THE WINDOW THE READ WILL PRODUCE, so ONE window straddles the boundary and both
    // sides are proven at once. A marker above or below the window proves only half and reads as a pass.
    const mark = ids[Math.floor(ids.length / 2)]
    const cr = buildConversationRetrieval(fastify, {
      userId: DEV, isRoot: false, user: { id: DEV, isRoot: false }, username: 'agent_dev', conversationId: fx.id,
    })
    const pre = await cr.retrieve({ in: 'here' })
    ok((pre.windows?.[0]?.turns ?? []).every((t) => t.activeContext === 'unknown'),
      '11 · ⭐ a conversation that has NEVER folded reports `unknown` — ⛔ not "in", which would be a guess')
    try {
      await seq.query(`UPDATE ${S}.txn_conversations SET summarized_upto_id = :m WHERE id = :c`,
        { replacements: { c: fx.id, m: mark } })
      const post = await cr.retrieve({ in: 'here' })
      const turns = post.windows?.[0]?.turns ?? []
      const out = turns.filter((t) => t.activeContext === 'out').length
      const inn = turns.filter((t) => t.activeContext === 'in').length
      ok(out > 0 && inn > 0,
        '11 · ⭐⭐⭐ …and once folded, ONE window distinguishes what is still in front of her from what is not',
        `${out} out-of-active-context · ${inn} still-in`)
      ok(post.conversations?.[0]?.partlyOutOfActiveContext === true,
        '11 · ⭐⭐ …and the inventory says the conversation is partly out of active context',
        'the fold boundary, surfaced for the first time')
      ok(post.coverage?.foldedConversations >= 1,
        '11 · ⭐ …and coverage counts it — compaction is a fact she can see, not a silent loss')
    } finally {
      // ⛔ PUT BACK EXACTLY AS FOUND. This check writes to a real conversation row; leaving a fold marker
      // behind would make every later read of it lie about her active context.
      await seq.query(`UPDATE ${S}.txn_conversations SET summarized_upto_id = NULL WHERE id = :c`, { replacements: { c: fx.id } })
      const [after] = await Q(`SELECT summarized_upto_id AS v FROM ${S}.txn_conversations WHERE id = :c`, { c: fx.id })
      ok(after.v == null, '11 · ⛔ the fixture is restored — the fold marker is gone', `now ${after.v ?? 'NULL'}`)
    }
  }
}

done()
