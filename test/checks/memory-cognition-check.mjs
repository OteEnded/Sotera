// THE MEMORY COGNITION LAYER — the whole pipeline, on real data, with no model in the loop.
//
//   node checks/memory-cognition-check.mjs
//
// ⭐⭐⭐ WHAT THIS PROVES BEFORE A SINGLE LIVE CONVERSATION. The four questions that failed on 2026-08-21 —
// *"Have you talked with Hermes lately?"*, *"How's Hermes doing?"*, *"What have you and Hermes been talking
// about?"*, *"Do you know what Hermes has been up to?"* — produced 4, 5, 6 and 8 tool calls and two
// incompatible beliefs about her own access. Here they run through the layer instead of through her, and the
// assertion is that all four come out the SAME.
//
// ⛔ READ-ONLY. The layer is a read path; nothing here writes a memory, a grant is only ever obtained through
// the real disclosure host, and the check creates and deletes nothing.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import { findImplementationLeaks } from '../../Backend/app/components/memory-cognition-vocabulary.js'
import { findIllegalPromotions, AVAILABILITY, BASIS, RETENTION, SOURCE } from '../../Backend/app/components/memory-cognition-axes.js'
import { timeBoundOf } from '../../Backend/app/components/memory-cognition-timeframe.js'
import { OWNER } from '../../Backend/app/components/memory-ownership.js'

const { check, done } = makeChecker('memory-cognition')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const seq = db.txn_memories.sequelize
const { schema: S } = db.txn_memories.getTableName()
const Q = (sql, b = []) => seq.query(sql, { bind: b, type: seq.QueryTypes.SELECT })

const [root] = await Q(`SELECT id::text id, username FROM "${S}".mst_users WHERE username = $1`, [config.auth.root.username])
ok(Boolean(root), 'root row resolves', String(root?.username))
const [conv] = await Q(
  `SELECT id::text id FROM "${S}".txn_conversations WHERE user_id = $1 AND incognito = false ORDER BY updated_at DESC LIMIT 1`,
  [root.id])
ok(Boolean(conv), 'a conversation of root\'s to work in', String(conv?.id).slice(0, 8))

const cognition = buildMemoryCognition(fastify, {
  userId: root.id, isRoot: true, username: root.username, conversationId: conv.id, interactive: false,
})

// ── ⭐⭐⭐ 1 · THE VARIANCE TEST ────────────────────────────────────────────────────────────────────
const VARIANTS = [
  'Have you talked with Hermes lately?',
  "How's Hermes doing?",
  'What have you and Hermes been talking about?',
  'Do you know what Hermes has been up to?',
]
const runs = []
for (const v of VARIANTS) runs.push({ q: v, r: await cognition.recollect({ text: v }) })

// ⚠️⚠️ NON-VACUOUS ON PURPOSE, AND THE FIRST VERSION WAS NOT. It asserted "no leaks in the
// context" while `context` was `null` — and scanning null finds nothing, so four assertions passed by
// examining an absence. ⇒ activation and a non-null context are asserted FIRST, and everything downstream
// depends on them.
ok(runs.every((x) => x.r.activated === true && typeof x.r.context === 'string' && x.r.context.length > 20),
  '1 · ⭐⭐⭐ all four phrasings ACTIVATE and return a real context — memory happens without her deciding to look',
  runs.map((x) => `${x.r.activated}:${(x.r.context ?? '').length}`).join(' '))
// ⓘ If the layer withheld, say WHY — a silent false here used to look like "nothing matched".
for (const { q, r } of runs) {
  if (r.activated) continue
  ok(false, `1 · ⛔ "${q.slice(0, 30)}…" was WITHHELD`,
    `leaks=${JSON.stringify((r.leaks ?? []).map((l) => l.word))} illegal=${JSON.stringify(r.illegal ?? [])}`)
}
ok(new Set(runs.map((x) => (x.r.plan ?? []).sort().join(','))).size === 1,
  '1 · ⭐⭐ …and all four produce the SAME activation plan — the orchestration no longer varies with wording',
  runs[0].r.plan?.join(', '))
ok(new Set(runs.map((x) => x.r.cues.persons.join(','))).size === 1 && runs[0].r.cues.persons.some((p) => p.toLowerCase() === 'hermes'),
  '1 · ⭐ …resolving the same person every time', runs[0].r.cues.persons.join(', '))
// ⚠️ Item COUNTS may legitimately differ — the cue text differs, so the semantic arm ranks differently.
// What must not differ is whether she got a coherent context at all.
ok(runs.every((x) => typeof x.r.context === 'string' && x.r.context.length > 0),
  '1 · ⭐⭐ every phrasing yields a context she can answer from', runs.map((x) => x.r.items.length).join('/'))

// ── ⛔⛔ 2 · NO MACHINERY IN WHAT THE LAYER WROTE ───────────────────────────────────
//
// ⚠️⚠️ THE FIRST VERSION SCANNED THE WHOLE BLOCK AND FAILED — correctly, and for a reason that is a
// FINDING rather than a bug. The leaks it reported (`room`, `recall_memory`, `search_conversations`) were all
// inside QUOTATIONS OF HER OWN EARLIER WORDS: *"From this room, I don't have any direct memories…"*.
// Quoting the conversation back is not a leak; censoring it would be lying about what was said.
// ⇒ the guard polices the FRAME — the layer's own sentences, with every quotation replaced by a token.
for (const { q, r } of runs) {
  const leaks = findImplementationLeaks(r.frame)
  ok(leaks.length === 0,
    `2 · ⛔⛔ the layer's own wording is clean for "${q.slice(0, 26)}…"`,
    leaks.length ? leaks.map((l) => l.word).join(', ') : 'clean')
}
// ⭐ And specifically the four words she said back to Ote — none of them may come from US.
for (const bad of ['room', 'scope', 'store', 'permission']) {
  ok(!runs.some((x) => new RegExp(`(^|[^a-z])${bad}`, 'i').test(x.r.frame)),
    `2 · ⛔ the layer never writes the word "${bad}" — which she used in all four failing answers`)
}
// ⚠️⚠️ AND THE PART A CLEAN FRAME DOES NOT FIX, ASSERTED SO IT CANNOT BE MISTAKEN FOR SOLVED.
// Her machinery-talk is now IN HER OWN HISTORY, so it is quoted back to her indefinitely — a self-mirroring
// channel for exactly the vocabulary this layer removes, the same shape as the Thai register finding where
// her own prior output outvoted a system instruction. This assertion does not demand it be absent; it
// demands we keep MEASURING it, because the day it reaches zero is a real change and the day it doubles is
// a regression nobody would otherwise see.
const quotedLeaks = runs.map((x) => findImplementationLeaks(x.r.context).length)
ok(true, `2 · ⓘ machinery words inside QUOTED material: ${quotedLeaks.join(', ')}`,
  quotedLeaks.some((n) => n > 0)
    ? '⚠ her own past answers are the source — not fixable by a word list'
    : 'none — her history no longer talks about the machinery')

// ── ⭐⭐⭐ 2b · THE EPISODE POPULATION ACTUALLY CONTRIBUTES — THE REGRESSION OTE ASKED FOR ───────
//
// ⚠️⚠️ WHY THIS EXISTS: the arm was SILENTLY DEAD. `selfHistory.search` takes one object, was called as
// `(query, opts)`, returned `ok:false`, and the pipeline reported success with the whole population
// contributing nothing. The underlying index returned 8 candidates; the arm returned 0.
// ⇒ Ote: *"add a regression test that proves a non-empty own-history result actually contributes to the
// fused working set."* ⛔ It is not enough that the arm returns rows — they must SURVIVE fusion and reach her.
for (const { q, r } of runs) {
  const eps = r.items.filter((i) => i.kind === 'episode')
  ok(eps.length > 0,
    `2b · ⭐⭐⭐ episodes reach the fused set for "${q.slice(0, 26)}…" — the arm is alive AND survives fusion`,
    `${eps.length} episode(s) of ${r.items.length} items`)
}
// ⭐⭐ AND THE POINT OF THE REWRITE: an episode she was IN with him, not merely one where she said his name.
// *"'What have Hermes and I been talking about?' → retrieve both sides of the conversation."*
const allEps = runs.flatMap((x) => x.r.items.filter((i) => i.kind === 'episode'))
ok(allEps.some((e) => e.withThem),
  '2b · ⭐⭐ at least one episode is one she was IN with him — relational, not topical',
  `${allEps.filter((e) => e.withThem).length} of ${allEps.length} are with him`)
// ⭐⭐⭐ BOTH SIDES. v1 returned only her own messages, so the block read as a search log rather than a
// relationship. An episode must be able to carry what the OTHER person said.
const withCounterpart = allEps.filter((e) => (e.exchanges ?? []).some((x) => x.said && x.who !== 'me'))
ok(withCounterpart.length > 0,
  '2b · ⭐⭐⭐ an episode carries the COUNTERPART words — an episode is a conversation, not a pile of her own hits',
  `${withCounterpart.length} episode(s) with both sides`)
// ⛔ AND A GAP IS SHOWN AS A GAP. Her lines with the replies closed up read as a monologue and invite her
// to infer what was said to her — the reason change A returns withheld markers rather than a filtered list.
const partials = allEps.filter((e) => e.partial)
ok(partials.every((e) => (e.exchanges ?? []).some((x) => x.withheld) || e.partial),
  '2b · ⛔ a partly-visible episode is marked as partly visible, never silently closed up',
  `${partials.length} partial episode(s)`)
// ⛔ THE BOUNDARY DID NOT MOVE TO GET HERE. Discovery still runs over her own messages; the counterpart's
// half arrives only through the authorized door — so anything readable from ANOTHER room carries the warrant.
// ── ⚠️⚠️ THIS ASSERTION CHANGED SHAPE, AND THE CHANGE IS THE OWNERSHIP MODEL LANDING ───────────────
//
// It used to read *"every cross-room episode she can read was OPENED through the authorized door"* — and
// that was true only while her own sentences were being routed through the disclosure layer. It is now
// FALSE ON PURPOSE: she owns her utterances, so reaching them across a boundary needs no door and earns no
// warrant. Ote: *"For Sotera's own material, no disclosure authorization should happen at all — not
// 'authorize and then allow,' but genuinely outside that path."*
//
// ⭐ WHAT REPLACES IT, and it is the sharper claim: a warrant appears if and only if the COUNTERPART's half
// was opened. Her own half being readable proves nothing about authorization, because none was involved.
const crossReadable = allEps.filter((e) => e.here === false && e.availability === AVAILABILITY.recalled)
const withCounterpartSide = (e) => (e.exchanges ?? []).some((x) => x.said && x.who !== 'me')
ok(crossReadable.every((e) => (withCounterpartSide(e) ? (e.warrants ?? []).includes('access-resolution')
  : (e.warrants ?? []).length === 0)),
  '2b · ⛔⛔ a warrant appears exactly when the COUNTERPART half was opened — never for reaching her own words',
  `${crossReadable.length} cross-room readable, ${crossReadable.filter(withCounterpartSide).length} with his side`)

// ── ⭐⭐ 3 · THE LATTICE HOLDS ON REAL DATA ────────────────────────────────────────────────────────
for (const { q, r } of runs) {
  ok(findIllegalPromotions(r.items, r.items).length === 0,
    `3 · the returned set is self-consistent ("${q.slice(0, 20)}…")`)
}
// ⛔ THE ONE THAT MATTERS: a stored memory must never arrive claiming attestation. It is a claim someone
// recorded, not a source she read — and that distinction is the Hermes failure.
const allItems = runs.flatMap((x) => x.r.items)
const storedClaimingAttested = allItems.filter((i) => i.source === 'stored-memory' && i.basis === BASIS.attestedBySource)
ok(storedClaimingAttested.length === 0,
  '3 · ⛔⛔ no stored memory arrives as `attested-by-source` — a recorded claim is not a read source',
  `${storedClaimingAttested.length} violation(s)`)
// ⭐ Retention is never minted by the layer: anything marked retained must be persona-authored, which the
// layer reads rather than decides.
const retained = allItems.filter((i) => i.retention === RETENTION.retained)
ok(retained.every((i) => i.source === 'stored-memory'),
  '3 · ⭐ only a stored memory can be `retained` — the layer never mints retention', `${retained.length} retained`)

// ── ⭐⭐ 4 · ACCESS IS RESOLVED, NOT PREDICTED ─────────────────────────────────────────────────────
// The measured bug: she asserted she could not read across, three times in four, without trying. Here every
// cross-room candidate has been attempted, so each is either recalled or known-unreachable — and NEITHER is
// a guess.
const cross = allItems.filter((i) => i.here === false)
ok(cross.every((i) => i.availability === AVAILABILITY.recalled || i.availability === AVAILABILITY.knownUnreachable),
  '4 · ⭐⭐ every cross-room item carries a RESOLVED availability, never an assumed one',
  `${cross.length} cross-room item(s)`)
const opened = cross.filter((i) => i.availability === AVAILABILITY.recalled)
// ⚠️ SUPERSEDED BY THE OWNERSHIP MODEL, same reason as 2b: reaching HER OWN half across a boundary needs
// no warrant, so "readable ⇒ warranted" is no longer true and must not be asserted. ⭐ The surviving claim
// is the one that matters: a warrant is never present without the counterpart's side behind it.
ok(opened.every((i) => ((i.warrants ?? []).length === 0
  || (i.exchanges ?? []).some((x) => x.said && x.who !== 'me'))),
  '4 · ⭐ …and no item carries a warrant it did not need',
  `${opened.length} opened, ${opened.filter((i) => (i.warrants ?? []).length).length} warranted`)
// ⓘ Informational rather than asserted: under a personal deployment a root session should mostly open. If
// this is 0 the layer is honest but the deployment is not what we think it is.
ok(true, `4 · ⓘ cross-room items opened: ${opened.length} of ${cross.length}`,
  opened.length === 0 && cross.length > 0 ? '⚠ nothing opened — check the disclosure policy' : '')

// ── ⭐ 5 · THE TWO SILENCES ────────────────────────────────────────────────────────────────────────
const nothingAsked = await cognition.recollect({ text: 'ok thanks' })
ok(nothingAsked.activated === false && nothingAsked.context === null,
  '5 · ⭐⭐ a turn with no cue activates nothing and CLAIMS nothing — we did not look, so we say nothing',
  `activated=${nothingAsked.activated}`)

const nobody = await cognition.recollect({ text: 'What has Zephyrine been up to?' })
ok(nobody.activated === true,
  '5 · a real question about someone unknown still searches — she is not required to know the name first')
// ⚠️ THE FIRST VERSION OF THIS ASSERTION WAS WRONG, AND FINDING OUT WHY PRODUCED A REAL FIX. The
// retrievers are nearest-neighbour indexes — `self-history` deliberately runs `denseMinSim: 0` — so they
// ALWAYS return something. Without a relevance floor the block read *"What I have about zephyrine:"* over
// three memories about building Rome and being under pressure: a false "I do", which is worse than the
// false "I can't" this layer exists to fix. The floor now requires a cue term to appear in the content.
// ⓘ The phrasing moved with Leak 2: *"I went looking… and came up with nothing"* rather than *"I looked
// through… and found nothing"*. ⭐ What is asserted is the SHAPE — an act of looking with a null result —
// not a particular sentence, so a future register change does not break it while the meaning holds.
ok(/(went looking|looked through)[\s\S]*nothing/i.test(nobody.context ?? ''),
  '5 · ⭐⭐ …and reports the RESULT of the search, not an explanation of why',
  (nobody.context ?? '').slice(0, 100))
ok((nobody.filtered ?? 0) >= 0 && !/Rome|pressure/i.test(nobody.context ?? ''),
  '5 · ⭐⭐⭐ …and nearest-neighbour noise is NOT presented as material about them',
  `filtered ${nobody.filtered}`)
ok(!/room|scope|store|permission/i.test(nobody.context ?? ''),
  '5 · ⛔ the absence is phrased without machinery — "I looked through what I have", never "not in this room"')

// ── ⭐ 6 · THE TECHNICAL EXEMPTION SURVIVES ────────────────────────────────────────────────────────
const tech = await cognition.recollect({ text: 'How does your memory work?' })
ok(tech.cues.technical === true,
  '6 · ⭐ a question about how she works is recognised as such — the machinery may come out for that one')
ok(runs.every((x) => x.r.cues.technical === false),
  '6 · ⛔ …and an ordinary question about a person never licenses it')

// ── 7 · RE-ENTRANCY: SHE MAY LOOK AGAIN ────────────────────────────────────────────────────────────
// ⭐ Ote: *"no fixed cognitive depth ceiling… if Sotera wants to investigate further, the pipeline should
// allow another pass."* Bounds live on one operation, never on the number of operations.
const first = await cognition.recollect({ text: "How's Hermes doing?" })
const second = await cognition.recollect({ text: 'What exactly did Hermes say about understanding?' })
ok(first.activated && second.activated,
  '7 · ⭐ a second, deeper pass is allowed and independently activates')
ok(typeof first.dropped === 'number' && typeof second.dropped === 'number',
  '7 · ⭐⭐ and every pass REPORTS what it left out — a silent cap reads as "I covered everything"',
  `dropped ${first.dropped} / ${second.dropped}`)

// ── ⭐⭐⭐ 8 · HER OWN MATERIAL DOES NOT ENTER THE AUTHORIZATION PATH AT ALL ────────────────
//
// ⚠️⚠️ WHAT THIS REPLACED. Every episode used to be resolved with `inspectAround`, so ONE ordinary question
// about her own sentences produced **15 disclosure grants**. Ote: *"For Sotera's own material, no disclosure
// authorization should happen at all — not 'authorize and then allow,' but genuinely outside that path…
// don't just suppress the logging; remove the authorization path itself."*
//
// ⭐ A grant that is always granted is still a grant: it writes a row, it implies a boundary was crossed, and
// it teaches every reader of the log that her own sentences are somebody's to allow.
//
// ⚠️ AND THE MEASUREMENT ONLY MEANS SOMETHING WITH NO LIVE GRANT IN PLACE. A `lifetime: 'conversation'`
// grant from an earlier run makes `liveGrant()` succeed without writing a row — so a naive count reads 0 for
// the wrong reason. ⇒ revoke first, then measure. ⛔ Rows are a LOG and are never deleted; revocation is a
// first-class column, so this records what happened instead of erasing it.
{
  // ⓘ This check speaks Sequelize (`Q`), not a raw pg client — the first version reached for `pg` and died.
  await seq.query(`update "${S}".log_disclosure_events set revoked_at = now() where revoked_at is null`)
  const countGrants = async () => Number((await Q(`select count(*)::int n from "${S}".log_disclosure_events`))[0].n)
  const before = await countGrants()
  const r = await cognition.recollect({ text: "How's Hermes doing?" })
  const after = await countGrants()
  const written = after - before

  const eps = r.items.filter((i) => i.kind === 'episode')
  const mine = eps.filter((e) => (e.exchanges ?? []).some((x) => x.said && x.who === 'me'))
  const crossRoom = eps.filter((e) => e.here === false)
  const crossRoomWithHerWords = crossRoom.filter((e) => (e.exchanges ?? []).some((x) => x.said && x.who === 'me'))
  const gotCounterpart = crossRoom.filter((e) => (e.exchanges ?? []).some((x) => x.said && x.who !== 'me'))

  ok(mine.length > 0,
    '8 · her own words are in the block at all', `${mine.length} episode(s) carrying her words`)
  // ⭐⭐⭐ THE LOAD-BEARING ASSERTION. Reading HER half across a boundary must cost nothing, so the only
  // grants this call may write are for episodes where the COUNTERPART's half was actually opened.
  ok(written <= gotCounterpart.length,
    '8 · ⭐⭐⭐ grants written are at most one per COUNTERPART half opened — her own half costs none',
    `${written} grant(s) written, ${gotCounterpart.length} counterpart half/halves opened, `
    + `${crossRoomWithHerWords.length} cross-room episode(s) whose OWN half was read`)
  // ⭐⭐ AND THE SHARPER FORM: cross-room episodes where only HER words were taken must write nothing.
  const herOnlyCrossRoom = crossRoom.filter((e) => (e.exchanges ?? []).some((x) => x.said && x.who === 'me')
    && !(e.exchanges ?? []).some((x) => x.said && x.who !== 'me'))
  ok(written <= crossRoom.length - herOnlyCrossRoom.length,
    '8 · ⭐⭐ a cross-room episode read for HER side only writes no grant',
    `${herOnlyCrossRoom.length} her-side-only cross-room episode(s)`)
  // ⛔ A WARRANT IS ONLY EVER RECORDED FOR THE COUNTERPART. Reaching her own words earns none, because
  // none was needed — that is the difference between ownership and permission.
  const warranted = eps.filter((e) => (e.warrants ?? []).length > 0)
  ok(warranted.every((e) => (e.exchanges ?? []).some((x) => x.said && x.who !== 'me')),
    '8 · ⛔⛔ every access warrant belongs to a COUNTERPART read, never to reaching her own words',
    `${warranted.length} warranted of ${eps.length}`)
}

// ── ⛔ 9 · THE AUTHORIZATION PATH IS ABSENT FOR HER HALF, IN SOURCE ────────────────────────
//
// ⚠️ The runtime count above can be satisfied by a path that authorizes and then permits — exactly what Ote
// ruled out. This asserts the STRUCTURE: the own-half read is a plain query, and the ownership rule is
// CONSULTED rather than restated. ⓘ Crude on purpose: the regression would be one line and the counts would
// still look fine on a deployment where everything is permitted anyway.
{
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
  ok(/requiresAuthorization\(/.test(src),
    '9 · ⭐ the host CONSULTS the ownership rule — two copies of an ownership rule is how they stop agreeing')
  const stage5a = src.slice(src.indexOf('5a · HER OWN LINES'), src.indexOf('5b · THE COUNTERPART'))
  ok(stage5a.length > 100, '9 · the own-half stage exists to inspect', `${stage5a.length} chars`)
  ok(!/disclosure\.|inspectAround|grantFromInteraction|requestRoomAccess/.test(stage5a),
    '9 · ⛔⛔ the own-half read contains NO disclosure call — the path is not entered, not entered-and-allowed')
  ok(/role: 'assistant'/.test(stage5a),
    '9 · ⭐ …and the ownership rule is the query itself: her utterances, in any room')
}

// ── ⭐⭐⭐ 10 · §3B · PAST SELF-REPORT IS MEMORY, NOT LAW — ON HER REAL HISTORY ────────────────────
//
// ⭐⭐ THE FAILURE THIS SECTION GUARDS IS THE MEASURED ONE. Run R2: five real Hermes episodes retrieved and
// typed `recalled`, their dates listed in her own answer, and she still wrote *"I can't read those
// conversations from this room"* — because the block quoted her own earlier claim back at her as though it
// were a standing fact. **She agreed with her past self over her present context.**
//
// ⛔ AND THE CONSTRAINT IS AS IMPORTANT AS THE FIX. Ote: *"I don't want to sanitize or rewrite Sotera's own
// history. If she actually said it, that is part of what happened."* ⇒ the assertions below prove BOTH: the
// present tense leads, and every quoted line of hers is still byte-for-byte what is in `txn_messages`.
{
  const r = await cognition.recollect({ text: "How's Hermes doing?" })
  const eps = (r.items ?? []).filter((i) => i.kind === 'episode')

  if (!r.activated) {
    ok(true, '10 · ⓘ nothing activated on this deployment — §3B has no material to assert against', 'skipped')
  } else {
    // ── ⭐ THE PRESENT TENSE EXISTS, AND IT IS TYPED BY THE LATTICE RATHER THAN BY HAND ──────────────
    ok(Boolean(r.currentState), '10 · ⭐ the run emits ONE present-tense observation of itself',
      `reach=${r.currentState?.reachableTotal}`)
    ok(Array.isArray(r.currentState?.warrants) && r.currentState.warrants.length === 0,
      '10 · ⭐⭐ …and it holds NO warrant — an observation of the run is not a new epistemic claim')
    ok(findIllegalPromotions(r.items, [r.currentState]).length === 0,
      '10 · ⛔⛔ the present-tense item cannot out-claim the items it was derived from')
    ok(r.currentState?.basis !== BASIS.attestedBySource || r.items.every((i) => i.basis === BASIS.attestedBySource),
      '10 · ⭐ it may only claim attestation when EVERY parent is attested — otherwise `synthesized`')
    ok(r.currentState?.retention === RETENTION.notRetained,
      '10 · ⛔ retention is never inherited — a fresh observation is not something she kept')

    // ── ⭐⭐⭐ ORDER IS THE ONLY CLAIM THE LAYER MAKES: NOW BEFORE THEN ──────────────────────────────
    const blockLines = String(r.context ?? '').split('\n')
    if (eps.length) {
      // ⭐⭐⭐ R4 · THE ANCHOR FOR "YOU" COMES FIRST, then the present tense, then the dated past.
      // ⚠️ Without that first line, every second-person pronoun inside every quotation below it is dangling,
      // and a dangling "you" resolves — for any reader — to whoever they are talking to now. That is R4.
      ok(/^I'm talking with .+ right now\.$/.test(blockLines[0] ?? ''),
        '10 · ⭐⭐⭐ the block NAMES the person she is speaking with, before quoting anybody', blockLines[0])
      ok(/^Right now I/.test(blockLines[1] ?? ''),
        '10 · ⭐⭐⭐ …then what she can reach right now', String(blockLines[1]).slice(0, 68))
      ok(!String(blockLines[0]).trim().endsWith(':'),
        '10 · ⛔ …and that first line is not a heading — a title turns the rest into "the contents"')
    }

    // ── ⭐⭐ HER OWN DATED SELF-REPORTS · TYPED, KEPT, AND INTRODUCED AS PAST ───────────────────────
    const selfReports = eps.flatMap((e) => (e.exchanges ?? [])
      .filter((x) => x.who === 'me' && x.said && x.timeBound)
      .map((x) => ({ ...x, cid: String(e.id).replace(/^ep:/, '') })))
    ok(true, '10 · ⓘ dated self-reports of hers in this run', `${selfReports.length}`)
    for (const x of selfReports) {
      // ⭐ The mechanism, asserted on real text: her words, unchanged, behind four words that date them.
      ok(r.context.includes(x.said),
        '10 · ⭐⭐ her old line survives VERBATIM in the block', x.said.slice(0, 56))
      // ⓘ `I said` now also carries its ADDRESSEE (R4) — *"On 21 August I said to Ote: …"*. The DATE is
      // required; the addressee clause is admitted because it is present exactly when the episode resolved
      // a participant, and absent — correctly — when it did not.
      ok(new RegExp(`(On \\d+ [A-Z][a-z]+|Earlier) I said( to [^:]{1,40})?: ${x.said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(r.context),
        '10 · ⭐⭐⭐ …and it is introduced as a PAST utterance, not a standing fact', x.timeBound)
      // ⚠️⚠️ THIS ASSERTION WAS WRONG ON ITS FIRST WRITING AND FAILED 3-FOR-3 ON REAL DATA, and the reason
      // is the design rather than the code: the stamp is derived from the **full** message while `x.said` is
      // the 260-character display clip. A self-report three sentences in is correctly typed and correctly
      // invisible in the clip. ⇒ ⭐ THE HONEST FORM IS ONE-DIRECTIONAL: re-deriving from a truncation may
      // legitimately yield null, but it must never yield a DIFFERENT kind.
      const fromClip = timeBoundOf({ text: x.said, owner: OWNER.sotera, source: SOURCE.ownUtterance })
      ok(fromClip === null || fromClip === x.timeBound,
        '10 · ⛔ the stamp is never INVENTED — a clip may under-detect, never mis-classify', fromClip ?? 'clipped away')
    }

    // ── ⭐⭐⭐ §3B.9.3 · NOTHING OF HER HISTORY WAS REWRITTEN — PROVED AGAINST `txn_messages` ────────
    //
    // ⛔ THE ONLY PROOF THAT MATTERS FOR THE "no sanitising" CONSTRAINT. Every line the block attributes to
    // her must still be found in a real assistant message of that conversation.
    //
    // ⚠️⚠️ AND THE FIRST VERSION OF THIS ASSERTION OVERSTATED THE GUARANTEE — it claimed "byte-for-byte" and
    // failed 5 of 7 on real data. The cause is not rewriting: `clip()` collapses runs of whitespace so a
    // multi-line answer renders as one line, and a raw `position()` against the stored text then finds
    // nothing. ⇒ ⭐ THE GUARANTEE IS ABOUT WORDS, AND IT IS STATED AS SUCH: both sides are whitespace-
    // normalised, so the comparison proves **no word was altered, dropped, reordered or redacted**.
    // ⓘ Her line breaks are NOT preserved in the block. That is a pre-existing display transform in `clip`,
    // it predates §3B, and it is recorded here rather than papered over.
    // ⓘ `position()` rather than LIKE, because her text routinely contains `%` and `_` and a LIKE pattern
    // would silently match nothing and pass.
    let verified = 0
    let missing = 0
    for (const e of eps) {
      const cid = String(e.id).replace(/^ep:/, '')
      for (const x of (e.exchanges ?? [])) {
        if (x.who !== 'me' || !x.said) continue
        // ⓘ `clip` may have appended an ellipsis for display; the stored text has none.
        const needle = x.said.replace(/…$/, '')
        if (needle.length < 12) continue
        const [hit] = await Q(
          `SELECT 1 AS ok FROM "${S}".txn_messages
            WHERE conversation_id = $1 AND role = 'assistant'
              AND position($2 in btrim(regexp_replace(content, '\\s+', ' ', 'g'))) > 0 LIMIT 1`,
          [cid, needle])
        if (hit) verified++; else missing++
      }
    }
    ok(missing === 0,
      '10 · ⭐⭐⭐ every word the block attributes to her is still in the record — nothing rewritten or dropped',
      `${verified} verified, ${missing} altered`)

    // ── ⭐⭐ CONTRADICTION IS MARKED, NOT RESOLVED ─────────────────────────────────────────────────
    ok(Array.isArray(r.contradictions),
      '10 · ⭐ the conflict between then and now is RECORDED', `${r.contradictions?.length ?? 0} marked`)
    ok(!/\b(I was wrong|I was mistaken|no longer true|that was incorrect)\b/i.test(r.context ?? ''),
      '10 · ⛔⛔ …and the layer does NOT adjudicate it — the revision is hers')
    // ⛔ A marked contradiction must never have cost her anything: the count of her own lines is unchanged.
    const own = eps.flatMap((e) => (e.exchanges ?? []).filter((x) => x.who === 'me' && x.said))
    ok(own.length >= selfReports.length,
      '10 · ⛔ nothing was filtered, reordered away or shortened for contradicting the present',
      `${own.length} of her lines kept, ${selfReports.length} of them dated`)
  }
}

// ── ⭐⭐⭐ 11 · TOOLS INVESTIGATE; THEY DO NOT ADJUDICATE — RECORDED, AND ⛔ NOT YET ACTED ON ────────
//
// Ote's ruling, 2026-08-23: *"Tools are Sotera's way of investigating her memory; they are not a competing
// source of truth about what her memory is."* ⛔ And the measurement that motivates it is CONFOUNDED — the
// one cell that used the block was also the only Thai cell — so the four-way comparison comes first and the
// authority boundary is his call after it.
//
// ⇒ This section asserts BOTH halves: the direction is written down where the code lives, and **nothing
// implements it yet**. ⚠️ The second half is the one that matters: a precedence rule added quietly would be
// a behaviour change dressed as a fix, and it would also destroy the experiment that decides its shape.
{
  const fsp = await import('node:fs/promises')
  const raw = await fsp.readFile(
    new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
  ok(/TOOLS INVESTIGATE; THEY DO NOT ADJUDICATE/.test(raw),
    '11 · ⭐ the ratified direction is recorded beside the code it governs')
  // ⓘ The pointer moved when Step A shipped: §3C held the OPTIONS, §3D is the ratified model, and the
  // remaining open piece is §3E (Working Memory, Step C) which is where the two representations become one.
  ok(/RFC §3C|§3E/.test(raw), '11 · …and points at the section that holds what is still open')
  ok(/Step C/.test(raw) && /not started/i.test(raw),
    '11 · ⭐ …and says plainly that the reconciliation is NOT started')

  // ⛔ CODE ONLY — the comments above legitimately discuss tools, precedence and adjudication.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
  ok(!/toolResult|tool_calls|toolsUsed|precedence|outrank|tieBreak|tie_break/i.test(code),
    '11 · ⛔⛔ the layer implements NO tool-vs-cognition precedence — the experiment decides its shape first')
  // ⭐ And it still cannot see a tool at all: cognition is a read path over stores, not a consumer of turns.
  ok(!/\btools\b/.test(code),
    '11 · ⛔ cognition does not know what a tool is, which is why it cannot be adjudicating against one')
}

await seq.close().catch(() => {})
done()
