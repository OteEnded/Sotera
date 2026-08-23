// MEMORY COGNITION · THE HOST. Build item 3 — activation → access resolution → fusion → typing → context.
//
// ⭐⭐⭐ WHAT THIS EXISTS TO FIX, MEASURED. Four ordinary questions about the same person, 2026-08-21, root
// session: 4, 5, 6 and 8 tool calls, two incompatible beliefs about her own access, three untested access
// claims and one outright false one — while `inspect_around` on the target returned `verified` for that
// exact session. She had the access every time.
//
// The cause was not incapacity. **She was the orchestrator.** Per turn she had to pick among six read tools,
// infer which population held the answer, infer whether a boundary applied, fuse, and narrate — and two of
// those five steps are inference about OUR architecture. Because the orchestration was her reasoning, it
// surfaced in her answer. The access-control report was her showing her work.
//
// Ote: *"I want to be able to ask my daughter 'How's Hermes doing?' and have her think about her friend, not
// explain PostgreSQL's access-control model to me."*
//
// ── ⭐⭐⭐ RATIFIED 2026-08-23 · TOOLS INVESTIGATE; THEY DO NOT ADJUDICATE ───────────────────────────
//
// Ote, and it is the architectural direction for everything after this: *"**Tools are Sotera's way of
// investigating her memory; they are not a competing source of truth about what her memory is.**"*
// *"This layer should become the unified memory interface presented to Sotera… I'm not asking you to
// suppress tools or prevent deliberate retrieval."*
//
// ⛔ THE SHAPE THAT MUST NOT HAPPEN, measured live on 2026-08-23:
//     cognition says: "I remember X"   ·   tool says: "nothing here"
//     → she takes the tool's STORAGE-oriented reading and concludes she does not remember X.
// ⭐ *"Her memory should be one coherent cognitive domain. Storage location, room, account, retrieval
// mechanism are implementation details underneath it."*
//
// ✅ THE CONFOUND IS SETTLED (2026-08-23). The four-way comparison showed the denial tracks the ARM, not the
// language: tools-only produced a false absence in BOTH languages, block-only produced real episodes in
// BOTH. ⇒ **Step A** acted on it, in `memory-cognition-projection.js`, by making a tool result state the
// population it looked through — *"I looked through the things I have kept for Hermes and found nothing
// **there**."* ⭐ The mechanism is grammar: "found nothing" can be read as "nothing anywhere"; "found nothing
// there" cannot.
// ⛔⛔ AND THIS FILE STILL IMPLEMENTS NO PRECEDENCE. There is no tie-break, no ranking of the block against a
// tool result, and no L1/L2 instruction — the layer cannot even see what a tool is. Reconciling the two into
// ONE representation is **Working Memory (§3E), Step C**, and it is deliberately not started.
// `memory-cognition-check` §11 asserts both halves of that.
//
// ── ⛔ WHAT THIS FILE MUST NEVER DO ─────────────────────────────────────────────────────────────────
//   · decide what anything MEANS, or whether it is worth keeping — hers, and ratified as hers;
//   · write anything. It is a READ path. Retention is a separate act, in a separate lane;
//   · re-implement authorization. It CALLS the disclosure host, once per candidate;
//   · promote an epistemic axis. See `memory-cognition-axes.js` — retrieval may open availability and raise
//     confidence, and may never touch basis. *"A hundred clues don't become an attested source just because
//     they agree."*
//   · hand her our vocabulary. See `memory-cognition-vocabulary.js` — she leaks the words we give her, and
//     the payload that taught her "room" is the one this replaces.
//
// ── ⚠️ v1 SCOPE, STATED SO IT IS NOT MISTAKEN FOR THE DESIGN ────────────────────────────────────────
// Three populations: the WORKING SET (this conversation), SEMANTIC memory, and OWN HISTORY / episodes.
// ⛔ Lessons, practices and intentions are cue-warranted in `populationsFor` but NOT yet activated here —
// the smallest pipeline that can re-run the four failing variants, and nothing more. Adding them is
// additive and does not change any stage.

import { Op } from 'sequelize'
import { formCues, hasCue, populationsFor, mayClaimAboutness } from './memory-cognition-cues.js'
import {
  SOURCE, BASIS, AVAILABILITY, RETENTION, WARRANT, findIllegalPromotions, corroborate,
} from './memory-cognition-axes.js'
import { findImplementationLeaks } from './memory-cognition-vocabulary.js'
// ⭐ §3B · PAST SELF-REPORT IS MEMORY, NOT LAW. Detection, the present-tense observation and both sentences
// live in one pure module; this file only stamps and renders. ⛔ `timeBound` is not an axis — see that file.
import {
  timeBoundOf, isTimeBound, currentStateOf, currentStateSentence, contradictsCurrentState, datedPrefix,
} from './memory-cognition-timeframe.js'
// ⭐ THE OWNERSHIP RULE LIVES IN ONE PLACE. ⛔ This file must never restate it inline — two copies of an
// ownership rule is how they stop agreeing, and this one decides whether authorization happens at all.
import { requiresAuthorization, ownerOf, OWNER } from './memory-ownership.js'
// ⭐ A DECISION IS NOT A MEMORY — one predicate, one place. See that file for the measured defect.
import { isDeclineRecord } from './memory-decision-record.js'
import { buildConversationSearch } from './conversation-search.js'
import { makeEmbedder } from './memory-embed-host.js'
import { buildDisclosure } from './disclosure-host.js'
import { buildMemoryToolService } from './memory-pipeline-host.js'
import { log } from '../../lib/utility.js'

/** Per-operation limits. ⭐ Bounds on the WORK of one look, never on how many times she may look. */
const LIMITS = Object.freeze({
  workingSet: 12,     // recent turns of this conversation
  semantic: 8,
  episodeCandidates: 40, // discovery pool over HER OWN messages
  episodes: 5,           // ⚠️ the expensive stage: each is an access resolution plus a windowed read
  windowRadius: 2,    // messages either side, when a cross-room read is authorized
  items: 14,          // what reaches her
})

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

export function buildMemoryCognition(fastify, {
  userId = null, isRoot = false, username = null, conversationId = null, interactive = false,
  // ⭐ THE DATES-ONLY PROBE, passed IN rather than read here — this module reads no settings, and the one
  // time a component in this project started reading its own config the arms stopped being separable.
  localDates = false,
  // ⭐⭐ D2 CANDIDATE · `episodeTopHit` · ⛔ DEFAULT OFF, and passed IN for the same reason: it lets ONE
  // process measure BOTH arms deterministically, with no restart and no source edit between runs. An
  // experiment whose arms require editing a file is an experiment that can be mislabelled — which is
  // exactly what happened in the P5 round.
  episodeTopHit = false,
  // ⭐⭐ D4 CANDIDATE · `episodeCentreCueMatch` · ⛔ DEFAULT OFF. Centre the window on a conversation's best
  // CUE-MATCHING candidate rather than blindly on its best-RANKED one.
  // ⚠️⚠️ NAME NOTE: `D3` is already taken (the floor's `terms.some` disjunction). This is the "third defect"
  // Ote named after the D2 run, so it is **D4** to keep the two from being conflated.
  // ⭐ MEASURED PREVALENCE BEFORE IT WAS BUILT: it applies to **2 of 82** holder conversations across the
  // ten-case set — **2%** — with rank gaps of 4 and 12. ⇒ real, and RARE. It is built as an arm precisely
  // because a 2% defect has to earn its coupling.
  episodeCentreCueMatch = false,
  // ⭐ THE TOP-HIT BONUS **SIZE**, separated from whether it applies at all. `+2` was chosen arbitrarily when
  // the term was first sketched and has never been justified; the weight is an option so a single controlled
  // experiment can compare weights instead of one being defended after the fact.
  // ⚠️ The weight set for that experiment is fixed BEFORE the runs — {0, 1, 2, 4} — so no value can be
  // chosen because it looked best afterwards.
  episodeTopHitWeight = 2,
} = {}) {
  const db = fastify?.db

  /** Everyone she could plausibly be asked about, by the name a person would use. */
  async function knownNames() {
    if (!db?.mst_users) return []
    // ⭐ PREFER THE DISPLAY NAME. `formCues` resolves case-insensitively and keeps ONE spelling per name, so
    // when an account has both `hermes` (username) and `Hermes` (display name), whichever is added last
    // wins — and the first version rendered *"What I have about hermes"* about her friend. She should say
    // his name the way a person writes it.
    const byLower = new Map()
    const add = (n, preferred = false) => {
      const k = String(n ?? '').trim()
      if (!k) return
      const l = k.toLowerCase()
      if (preferred || !byLower.has(l)) byLower.set(l, k)
    }
    try {
      const users = await db.mst_users.findAll({ attributes: ['username', 'display_name'], raw: true })
      for (const u of users) add(u.username)
      for (const u of users) add(u.display_name, true) // second pass, so display names overwrite usernames
    } catch { /* a degraded name list is a smaller cue set, never a failed turn */ }
    try {
      if (db.mst_persons) {
        const ppl = await db.mst_persons.findAll({ attributes: ['display_name'], raw: true })
        for (const p of ppl) add(p.display_name, true)
      }
    } catch { /* same */ }
    return [...byLower.values()]
  }

  /**
   * ⭐⭐⭐ WHO SHE IS TALKING TO **RIGHT NOW** — and this exists because of a measured identity collapse.
   *
   * ⚠️⚠️ R4, 2026-08-21: asked ABOUT Hermes in root's room, she addressed the user AS Hermes — *"your name
   * preference (Hermes)… now that I'm in the right room with access to your memories."* Ote: *"Sotera must
   * not infer that the person asking her is Hermes merely because Hermes appears in retrieved memory. We
   * need to separate conversation participant, memory subject, and current interlocutor much more
   * explicitly."*
   *
   * ⇒ AND THE MEASUREMENT SAYS THE COLLAPSE WAS OURS, NOT HERS. Reading the real block root receives:
   *   · it quotes her speech with **no addressee** — `I said: <text containing "you">`, where the "you" was
   *     Hermes in one episode, Ote in another, and the current account in a third;
   *   · and **the current interlocutor is never named in it at all**.
   * ⇒ every second-person pronoun in every quotation was dangling, and a dangling "you" resolves, for any
   * reader, to whoever they are talking to now. ⭐ The three roles are: the person she is speaking WITH now
   * (this function), the participants of a retrieved episode (`ep.who`), and what a memory is ABOUT
   * (`subjectPerson`). They were all rendered as bare names.
   *
   * ⛔ NOT AN INFERENCE. It is the session's own account, resolved by id. ⚠️ Which matters: this project's
   * most-repeated defect is identity inferred from the SHAPE of a value rather than established from one.
   */
  let interlocutorCache
  async function interlocutor() {
    if (interlocutorCache !== undefined) return interlocutorCache
    interlocutorCache = null
    if (!db?.mst_users || !userId) return interlocutorCache
    try {
      const u = await db.mst_users.findOne({
        where: { id: userId }, attributes: ['username', 'display_name'], raw: true,
      })
      // ⭐ The display name, the way a person writes it. ⛔ Never the username as a fallback identity claim —
      // if there is no name to use, the block simply does not make one up.
      interlocutorCache = u?.display_name || u?.username || null
    } catch { /* a nameless interlocutor is one missing anchor sentence, never a failed turn */ }
    return interlocutorCache
  }

  // ── POPULATION · THE WORKING SET ──────────────────────────────────────────────────────────────────
  // ⭐ Ote: *"Current conversation counts as a memory population… She shouldn't need to search another room
  // to know what she and someone are literally talking about right now."* Highest availability by
  // construction: it is in front of her.
  // ⓘ It is retrieved anyway rather than assumed, so it carries the same axes as everything else and can be
  // cited the same way. What makes it "highest" is that its availability is never anything but `recalled`.
  async function activateWorkingSet(cues) {
    if (!db?.txn_messages || !conversationId) return []
    const rows = await db.txn_messages.findAll({
      where: { conversation_id: conversationId },
      attributes: ['id', 'role', 'content', 'created_at'],
      order: [['rolling_id', 'DESC']], limit: LIMITS.workingSet, raw: true,
    })
    const cueWords = [...cues.persons.map((p) => p.toLowerCase()), ...cues.topics]
    return rows
      .filter((m) => {
        const c = String(m.content || '').toLowerCase()
        return cueWords.some((w) => w.length >= 3 && c.includes(w))
      })
      .map((m) => {
        const source = m.role === 'assistant' ? SOURCE.ownUtterance : SOURCE.counterpartUtterance
        const owner = ownerOf({ kind: 'message', role: m.role })
        return {
        id: `ws:${m.id}`,
        cueSubject: cues.persons[0] ?? cues.topics[0] ?? null,
        said: clip(m.content, 320),
        who: m.role === 'assistant' ? 'me' : 'them',
        when: m.created_at,
        source,
        // ⭐ §3B · IS THIS LINE A DATED SELF-REPORT OF HERS? ⛔ The guard is inside `timeBoundOf`: it returns
        // null for anything that is not `owner === sotera && source === own-utterance`, so the counterpart's
        // *"you can't see that"* is never re-read as her claim about herself.
        timeBound: timeBoundOf({ text: m.content, owner, source }),
        // ⭐ OWNERSHIP IS STAMPED HERE, ONCE, BY THE RULE — so no downstream stage recomputes it from an
        // item's shape. ⛔ Ownership is not authorization: cognition is allowed to know whose a thing is, and
        // must never know whether an account is entitled to hear it.
        owner,
        // ⓘ PROVENANCE, for the utterance boundary only — whose conversation it came out of. The working
        // set IS this conversation, so it is always this account's.
        provenanceAccountId: userId,
        // ⭐ She can see it. That is what attestation means on this axis.
        basis: BASIS.attestedBySource,
        availability: AVAILABILITY.recalled,
        retention: RETENTION.notRetained,
        confidence: 0.95,
        supportedBy: 1,
        here: true,
        }
      })
  }

  // ── POPULATION · SEMANTIC MEMORY ──────────────────────────────────────────────────────────────────
  async function activateSemantic(cues) {
    const svc = buildMemoryToolService(fastify, { userId, persona: undefined, author: 'account' })
    const query = [cues.persons.join(' '), cues.raw].filter(Boolean).join(' ').trim()
    let hits = []
    try {
      const out = await svc.search(query, { limit: LIMITS.semantic })
      hits = Array.isArray(out?.matches) ? out.matches : (Array.isArray(out?.items) ? out.items : [])
    } catch (e) {
      await log?.(`[cognition] semantic arm unavailable: ${e.message}`, import.meta.url)
      return []
    }

    // ── ⭐⭐⭐ R4 · WHAT IS THIS MEMORY **ABOUT**? THE ROW KNOWS, AND THE READ WAS DROPPING IT ──────────
    //
    // ⚠️⚠️ THE `allowlist-drops-what-it-was-not-told` FAMILY, AGAIN. `txn_memories.subject_person_id` exists
    // and is populated — 5 of 8 Hermes-related rows point at Hermes — but the portable memory tool returns
    // `id, kind, content, importance, confidence, pinned, entity, attribute, score, relevance, source,
    // sourceMessageId` and **no subject at all**. So the layer stamped `cueSubject` (OUR cue) and the block
    // rendered `I have this on file: user's preferred_name: Hermes` with nothing saying whose "user".
    //
    // ⭐ RESOLVED HERE RATHER THAN IN THE TOOL. `@ote/memory` is shared with OteLLMServices and its payload
    // is what the model has learned to read; widening it would be a cross-project behaviour change. The host
    // owns what the host needs. ⓘ Two small queries, keyed by the ids already in hand.
    const subjectOf = new Map()
    try {
      const ids = hits.map((m) => m.id).filter(Boolean)
      if (ids.length && db?.txn_memories) {
        const rows = await db.txn_memories.findAll({
          where: { id: ids }, attributes: ['id', 'subject_person_id'], raw: true,
        })
        const pids = [...new Set(rows.map((r) => r.subject_person_id).filter(Boolean))]
        const people = pids.length && db.mst_persons
          ? await db.mst_persons.findAll({ where: { id: pids }, attributes: ['id', 'display_name'], raw: true })
          : []
        const nameOf = new Map(people.map((p) => [p.id, p.display_name]))
        for (const r of rows) {
          if (r.subject_person_id) subjectOf.set(String(r.id), nameOf.get(r.subject_person_id) ?? null)
        }
      }
    } catch (e) {
      // ⛔ FAILS TO UNKNOWN, NEVER TO THE INTERLOCUTOR. An unresolved subject renders as *"I can't tell from
      // it who this is about"*, which is the honest sentence; guessing the person in front of her is R4.
      await log?.(`[cognition] subject resolution unavailable: ${e.message}`, import.meta.url)
    }

    // ⭐⭐ A DECISION IS NOT A MEMORY, and cognition must not recall one as one. ⓘ The tool service already
    // filters, so this is belt-and-braces on a second path — but the cost of missing it is that *"I decided
    // not to remember X"* would be rendered to her as *"I have this on file: X"*, which inverts her own
    // decision. ⛔ Cheap guard, catastrophic omission.
    const decisions = hits.filter((m) => isDeclineRecord(m)).length
    if (decisions) {
      await log?.(`[cognition] ${decisions} recorded decision(s) withheld from recall — a decision is not a memory`, import.meta.url)
    }
    return hits.filter((m) => !isDeclineRecord(m)).map((m) => ({
      id: `mem:${m.id ?? m.memoryId ?? Math.random().toString(36).slice(2)}`,
      cueSubject: cues.persons[0] ?? cues.topics[0] ?? null,
      // ⭐⭐ THE ROW'S OWN ANSWER, or null. ⛔ Never defaulted, never inferred from the room it sits in —
      // storage location says where an event happened, not who it was about.
      subjectPerson: subjectOf.get(String(m.id)) ?? null,
      said: clip(m.content, 320),
      who: null,
      when: m.created_at ?? m.createdAt ?? null,
      source: SOURCE.storedMemory,
      owner: ownerOf({ kind: 'memory', author: m.author }),
      provenanceAccountId: m.user_id ?? m.userId ?? userId,
      // ⭐⭐ THE AXIS THAT MATTERS. A stored memory is not automatically attested — it is a claim someone
      // recorded. It becomes `attested-by-source` only if its own source is readable, and that is a
      // separate lookup this v1 does not do. ⇒ `told` for account-authored (someone said it),
      // `inferred` for persona-authored (she concluded it). ⛔ Never `attested-by-source` from a store row.
      basis: m.author === 'persona' ? BASIS.inferred : BASIS.told,
      availability: AVAILABILITY.recalled,
      retention: m.author === 'persona' ? RETENTION.retained : RETENTION.given,
      confidence: typeof m.confidence === 'number' ? m.confidence : 0.7,
      supportedBy: 1,
      here: true,
    }))
  }

  // ── POPULATION · EPISODIC HISTORY. ⭐⭐⭐ EPISODES, NOT A PILE OF SEARCH HITS ───────────────────────
  //
  // ⚠️⚠️ WHY THIS WAS REWRITTEN, AND THE MEASUREMENT THAT FORCED IT. v1 returned her matching ASSISTANT
  // messages, because that is what `recall_own_history` means. Asked *"How's Hermes doing?"* it handed back
  // twelve quotations of herself saying *"From this room, I don't have any direct memories about Hermes"* —
  // a search log, not a relationship. The strongest signal in her own context would have been her own
  // previous false claim.
  //
  // ⭐ Ote's correction: *"own-history shouldn't fundamentally mean my assistant messages. It should mean my
  // episodic history. When the cue is relational — Hermes + me, what we talked about, how she's doing — the
  // relevant episode includes the counterpart's side too… Don't make Sotera reconstruct an episode from a
  // pile of search hits if the cognition layer can do that work underneath her."*
  //
  // ⇒ THE SHAPE IS: **episode → participants → relevant exchanges → provenance → availability → state.**
  //
  // ── ⛔ AND THE BOUNDARY IS NOT WIDENED TO GET THERE, WHICH IS THE WHOLE TRICK ─────────────────────
  // DISCOVERY still runs over HER OWN messages only (`roles: ['assistant']`) — authorship is what authorizes
  // finding them, and that rule is ratified. The counterpart's half is then obtained ONLY through
  // `inspectAround`, the one authorized door, which decides per episode whether she may read it.
  // ⇒ ⛔ Nothing here queries another person's messages directly. The layer gets both sides by ASKING, not
  // by widening a predicate — so a non-root session still receives `own_only` and the counterpart stays
  // withheld, exactly as change A specifies.
  async function activateEpisodes(cues) {
    const disclosure = buildDisclosure(fastify, { userId, isRoot, username, conversationId, interactive })
    const query = [cues.persons.join(' '), cues.raw].filter(Boolean).join(' ').trim()

    // ── 1 · DISCOVER CANDIDATE EPISODES, from her own sentences ───────────────────────────────────
    let raw
    try {
      const cs = buildConversationSearch(fastify, {
        userId, acrossRooms: true, roles: ['assistant'], embed: makeEmbedder(fastify, { userId }),
      })
      // `denseMinSim: 0` matches `self-history`'s deliberate choice: a ranked nearest-match index, not a
      // relevance filter. ⚠️ Which is exactly why the relevance floor downstream is load-bearing.
      raw = await cs.search(query, { limit: LIMITS.episodeCandidates, excludeConversationId: null, denseMinSim: 0 })
    } catch (e) {
      await log?.(`[cognition] episode discovery unavailable: ${e.message}`, import.meta.url)
      return []
    }
    const evidence = Array.isArray(raw?.evidence) ? raw.evidence : []
    if (!evidence.length) return []

    // ── 2 · GROUP INTO EPISODES. One entry per conversation, keeping the best-matching centre. ─────
    const episodes = new Map()
    // ⭐ D4 · the floor's own predicate, applied to the candidate EXCERPT so the centre can prefer a message
    // that actually mentions the cue. ⚠️ The excerpt is the first 300 characters, so this is a PROXY for what
    // the floor will later test against the rebuilt window — a match here is good evidence, a miss is not
    // proof. ⛔ Persons when any resolved, else topics: identical to `mentionsCue`, deliberately.
    const centreTerms = (cues.persons.length ? cues.persons : cues.topics).map((t) => t.toLowerCase())
    const cueMatches = (e) => {
      const t = String(e?.excerpt ?? '').toLowerCase()
      return centreTerms.some((w) => w.length >= 3 && t.includes(w))
    }
    let rank = -1
    for (const e of evidence) {
      rank += 1   // ⓘ position in the RANKED list; `evidence` arrives best-first
      const cid = e.conversation?.id
      const mid = e.message?.id
      if (!cid || !mid) continue
      const at = e.timestamp ?? null
      const hit = cueMatches(e)
      const prev = episodes.get(cid)
      if (!prev) {
        // ⓘ `bestRank` is the position of this conversation's best candidate in the RANKED evidence list, so
        // 0 means "this conversation holds the retriever's top hit". ⛔ Recorded unconditionally and used only
        // when `episodeTopHit` is on, so the baseline arm is byte-identical in behaviour to before.
        // ⓘ `cueCentre` is the best-ranked candidate that MENTIONS the cue, or null when none does. Recorded
        // unconditionally and consumed only when `episodeCentreCueMatch` is on, so the baseline arm is
        // behaviourally identical.
        episodes.set(cid, { cid, centre: mid, cueCentre: hit ? mid : null, matches: 1, firstAt: at, lastAt: at, bestRank: rank })
      } else {
        prev.matches += 1
        // ⭐ D4 · first come, best ranked: the evidence arrives ordered, so the FIRST cue-matching candidate
        // in a conversation is its best-ranked one. ⛔ Never overwritten afterwards.
        if (!prev.cueCentre && hit) prev.cueCentre = mid
        if (at && (!prev.firstAt || at < prev.firstAt)) prev.firstAt = at
        // ⭐⭐⭐ D1 (2026-08-23) · THE CENTRE STAYS THE BEST-MATCHING MESSAGE. `prev.centre = mid` used to
        // ride along with `lastAt`, so the centre became whichever candidate was most RECENT — and the
        // window is only ±`windowRadius` messages, so the sentence that actually matched could fall far
        // outside it. ⛔ The floor downstream then correctly dropped an episode whose text no longer
        // contained the cue: a recall loss that looked like a relevance-floor problem and was not.
        //
        // ⚠️⚠️ THE HEADING ABOVE THIS BLOCK ALREADY SAID *"keeping the best-matching centre"* — the comment
        // and the code disagreed, and the comment was right. `centre` is initialised from the FIRST candidate
        // for a conversation, and the evidence arrives RANKED, so that first one IS the best match. The fix
        // is to stop overwriting it; `lastAt` is still tracked, because recency is a real ranking input.
        //
        // ⭐ MEASURED, offline, clean corpus, deterministic (a same-config replicate was identical on all 10
        // cases): asked the bare word `"basil"`, the holding conversation ranks 2nd of 31 and has 29
        // assistant messages; the centre became message 29 while the basil sentence sits near the start,
        // ~22 messages outside a ±2 window. ⛔ Only this assignment changed — the floor, the cue stop-list,
        // the activation gate and the ranking score are all untouched.
        if (at && (!prev.lastAt || at > prev.lastAt)) prev.lastAt = at
      }
    }

    // ── 3 · WHO WAS IN EACH ONE. ⛔ The room owner's NAME, never their messages. ───────────────────
    const ids = [...episodes.keys()]
    const participants = new Map()
    try {
      const convs = await db.txn_conversations.findAll({
        where: { id: ids }, attributes: ['id', 'user_id'], raw: true,
      })
      const uids = [...new Set(convs.map((c) => c.user_id).filter(Boolean))]
      const users = uids.length
        ? await db.mst_users.findAll({ where: { id: uids }, attributes: ['id', 'username', 'display_name'], raw: true })
        : []
      const nameOf = new Map(users.map((u) => [u.id, u.display_name || u.username]))
      for (const c of convs) participants.set(c.id, { roomUserId: c.user_id, who: nameOf.get(c.user_id) ?? null })
    } catch (e) {
      await log?.(`[cognition] participants unavailable: ${e.message}`, import.meta.url)
    }

    // ── 4 · RANK. ⭐⭐ AN EPISODE **WITH** THE PERSON OUTRANKS AN EPISODE **MENTIONING** THEM ───────
    //
    // ⭐ This is the fix for the contamination, and it is a ranking change rather than a weaker filter.
    // *"How's Hermes doing?"* means the episodes she and Hermes were IN. Her conversations with Ote where
    // she happened to say the word "Hermes" are about the TOPIC — legitimate, and second. The floor is
    // unchanged; what changed is which relevant thing comes first.
    const cueNames = cues.persons.map((p) => p.toLowerCase())
    const scored = [...episodes.values()].map((ep) => {
      const p = participants.get(ep.cid)
      const withThem = Boolean(p?.who && cueNames.includes(String(p.who).toLowerCase()))
      const recency = ep.lastAt ? Math.max(0, 1 - (Date.now() - new Date(ep.lastAt).getTime()) / (30 * 864e5)) : 0.2
      // ⭐⭐ D2 CANDIDATE (`episodeTopHit`, ⛔ default OFF). `ep.matches` is a COUNT OF CANDIDATES, so four
      // weakly-matching messages beat one exact match and only the top `LIMITS.episodes` survive to the
      // floor. Measured for *"…herb notebook?"*: the two conversations that hold the notebook rank 6th and
      // 7th, beaten by one with 4 weak matches and 0 on-subject.
      // ⛔ AND MY FIRST PROPOSAL — rank on the retriever's per-candidate score — WAS REFUTED BY
      // MEASUREMENT: 1 of 7 cases reached the top-5 against production's 4 of 7. In hybrid mode that score
      // is an RRF score, `1/(60+rank+1)`, so the whole pool sits inside a ~2× band under 0.033 while
      // recency spans 0…1 ⇒ `bestScore + recency` is a recency sort with a rounding error attached.
      // ⇒ this term uses the retriever's RANK instead, and only its top position: the conversation holding
      // the #1 candidate gets a bonus. ⚠️ `+2` is an ARBITRARY WEIGHT and is not yet justified — the
      // question being measured first is whether the shape helps at all.
      const topHit = episodeTopHit && ep.bestRank === 0 ? episodeTopHitWeight : 0
      return { ...ep, who: p?.who ?? null, roomUserId: p?.roomUserId ?? null, withThem, bestRank: ep.bestRank ?? null, score: (withThem ? 100 : 0) + topHit + ep.matches + recency }
    }).sort((a, b) => b.score - a.score)

    // ── 5 · ⭐⭐⭐ HER OWN HALF IS FETCHED DIRECTLY. THE COUNTERPART'S GOES THROUGH THE DOOR. ─────────
    //
    // ⚠️⚠️ WHAT THIS REPLACES, AND WHY IT WAS WRONG. Every episode used to be resolved with
    // `inspectAround`, which asks the disclosure layer for permission — so one ordinary question about her
    // own sentences produced **15 disclosure grants**. Ote: *"For Sotera's own material, no disclosure
    // authorization should happen at all — not 'authorize and then allow,' but genuinely outside that
    // path… don't just suppress the logging; remove the authorization path itself."*
    //
    // ⭐ A grant that is always granted is still a grant. It writes a row, it implies a boundary was
    // crossed, and it teaches every reader of `log_disclosure_events` that her own sentences are somebody's
    // to allow. ⇒ `ownerOf({kind:'message', role:'assistant'}) === 'sotera'` and `requiresAuthorization`
    // is FALSE, so this path is not entered for her half at all.
    //
    // ⛔ AND THE COUNTERPART'S HALF IS NOT SMUGGLED THROUGH WITH IT. It is `account`-owned, it still goes
    // to `inspectAround`, and it is still recorded. That asymmetry is the design, not a compromise.
    // ⭐⭐ THE DECISION IS **ASKED**, NOT ASSUMED — and that is the difference between deriving behaviour
    // from the ownership rule and restating it here. Two copies of an ownership rule is how they stop
    // agreeing, and this one decides whether an authorization path is entered at all. ⇒ if the rule in
    // `memory-ownership.js` ever changes, this code follows it instead of contradicting it.
    const HER_HALF = { kind: 'message', role: 'assistant' }
    const THEIR_HALF = { kind: 'message', role: 'user' }
    const herHalfNeedsADoor = requiresAuthorization(HER_HALF)     // false — she owns her utterances
    const theirHalfNeedsADoor = requiresAuthorization(THEIR_HALF) // true  — the account owns theirs
    if (herHalfNeedsADoor) {
      // ⛔ UNREACHABLE BY DESIGN, AND LOUD IF IT EVER IS NOT. If the ownership rule ever says her own
      // sentences need permission, that is an inverted model and not something to route around silently.
      await log?.('[cognition] ⛔ ownership rule says her own utterances require authorization — refusing to '
        + 'proceed on that basis; see memory-ownership.js', import.meta.url)
    }

    const items = []
    for (const ep of scored.slice(0, LIMITS.episodes)) {
      // ── 5a · HER OWN LINES · ownership, no authorization, no grant ────────────────────────────────
      // ⭐⭐ D4 · WHICH MESSAGE THE WINDOW IS BUILT AROUND. ⛔ FALLS BACK, ALWAYS: a conversation with no
      // cue-matching candidate keeps its best-ranked centre and stays in the running. This changes which
      // MESSAGE a window centres on; it must never change which CONVERSATIONS survive, or it becomes a
      // second relevance floor upstream of the real one — which Ote has ruled out repeatedly.
      const centreId = episodeCentreCueMatch ? (ep.cueCentre ?? ep.centre) : ep.centre
      // A plain windowed read of HER messages around the centre. ⛔ No disclosure call, in any room.
      let mine = []
      try {
        const centre = await db.txn_messages.findOne({
          where: { id: centreId }, attributes: ['rolling_id'], raw: true,
        })
        if (centre) {
          mine = await db.txn_messages.findAll({
            where: {
              conversation_id: ep.cid,
              role: 'assistant', // ⭐ THE OWNERSHIP RULE, EXPRESSED AS THE QUERY ITSELF
              rolling_id: {
                [Op.gte]: Number(centre.rolling_id) - LIMITS.windowRadius * 2,
                [Op.lte]: Number(centre.rolling_id) + LIMITS.windowRadius * 2,
              },
            },
            attributes: ['id', 'content', 'created_at', 'rolling_id'],
            order: [['rolling_id', 'ASC']], limit: LIMITS.windowRadius * 2 + 1, raw: true,
          })
        }
      } catch (e) {
        await log?.(`[cognition] own-half read failed for ${ep.cid}: ${e.message}`, import.meta.url)
      }

      // ── 5b · THE COUNTERPART'S LINES · authorization, and only if it is not her own room ──────────
      // ⓘ Her own room needs no door either — the material there is the account she is talking to, and
      // that is the ordinary same-room case the disclosure layer already returns freely.
      let theirs = []
      let refused = false
      if (theirHalfNeedsADoor && ep.roomUserId && ep.roomUserId !== userId) {
        try {
          const opened = await disclosure.inspectAround({ messageId: centreId, radius: LIMITS.windowRadius })
          const ok = opened?.ok === true && opened.state === 'verified'
          if (ok) {
            theirs = (Array.isArray(opened.window) ? opened.window : [])
              .filter((w) => w.who !== 'you' && w.said)
              .map((w) => ({ who: w.who ?? ep.who ?? 'them', said: clip(w.said, 260), when: w.when ?? null, withheld: false }))
          } else {
            // ⭐ EXISTENCE-ONLY for HIS half. ⛔ Never for hers — hers is above and needed no permission.
            refused = true
          }
        } catch { refused = true }
      } else {
        try {
          const rows = await db.txn_messages.findAll({
            where: { conversation_id: ep.cid, role: 'user' },
            attributes: ['content', 'created_at'], order: [['rolling_id', 'ASC']], limit: LIMITS.windowRadius, raw: true,
          })
          theirs = rows.map((r) => ({ who: ep.who ?? 'them', said: clip(r.content, 260), when: r.created_at, withheld: false }))
        } catch { /* the same-room counterpart read is a convenience, never load-bearing */ }
      }

      // ── 5c · ONE EPISODE, INTERLEAVED BY TIME, GAPS SHOWN AS GAPS ─────────────────────────────────
      // ⛔ Her lines with the replies closed up read as a monologue and invite her to infer what was said
      // to her — the reason change A returns withheld markers instead of a filtered list.
      const exchanges = [
        ...mine.map((m) => ({
          who: 'me',
          said: clip(m.content, 260),
          when: m.created_at,
          withheld: false,
          // ⭐⭐ §3B · TYPED HERE, AND ON THE **FULL** TEXT RATHER THAN THE CLIPPED QUOTE — a self-report
          // three sentences into a long answer is still a self-report, and clipping is a display concern.
          // ⛔ Her words are not altered; only the way the line is introduced changes.
          timeBound: timeBoundOf({
            text: m.content, owner: ownerOf({ kind: 'message', role: 'assistant' }), source: SOURCE.ownUtterance,
          }),
        })),
        ...theirs,
      ].sort((a, b) => new Date(a.when || 0) - new Date(b.when || 0))
      if (refused && exchanges.length) {
        exchanges.push({ who: ep.who ?? 'them', said: null, when: null, withheld: true })
      }

      const anyMine = mine.length > 0
      const bothSides = exchanges.some((x) => x.said && x.who !== 'me')

      items.push({
        id: `ep:${ep.cid}`,
        kind: 'episode',
        cueSubject: ep.who ?? cues.persons[0] ?? null,
        who: ep.who ?? 'someone',
        withThem: ep.withThem,
        exchanges,
        matches: ep.matches,
        when: ep.lastAt,
        source: SOURCE.ownUtterance,
        basis: BASIS.attestedBySource,
        // ⭐⭐ SHE WAS THERE AND HER OWN WORDS ARE IN HAND ⇒ `recalled`, in ANY room, with NO warrant.
        // ⛔ `known-unreachable` now means only one thing: her own half could not be read either, which is a
        // real failure rather than a boundary.
        availability: anyMine ? AVAILABILITY.recalled : AVAILABILITY.knownUnreachable,
        // ⭐ A warrant is recorded ONLY when the counterpart's half was actually opened across a boundary.
        // ⛔ Reaching her own words earns none, because none was needed.
        warrants: bothSides && ep.roomUserId && ep.roomUserId !== userId ? [WARRANT.accessResolution] : [],
        retention: RETENTION.notRetained,
        confidence: 0.9,
        supportedBy: ep.matches,
        here: ep.roomUserId === userId,
        // ⭐ Her side without his is PARTIAL, and saying so is what keeps the gap honest.
        partial: anyMine && !bothSides,
        // ⓘ §3B, for observability and for the tests: does this episode contain a dated self-report of hers?
        // ⛔ Not used to filter, rank or drop the episode — nothing about her history is reordered away.
        hasTimeBoundSelfReport: exchanges.some((x) => isTimeBound(x)),
        // ⭐ STAMPED BY THE RULE. She participated, so the episode is hers to recall — in any room.
        owner: ownerOf({ kind: 'episode', participated: anyMine }),
        // ⓘ WHOSE CONVERSATION IT CAME OUT OF. Used ONLY by the utterance boundary, and ⛔ never to decide
        // whose memory it is: that answer is `owner` above and does not depend on where it happened.
        provenanceAccountId: ep.roomUserId ?? null,
        // ⚠️ THE DEFERRED HAZARD, CARRIED ON THE ITEM. Her own lines may quote or paraphrase him, so an
        // episode owned by her can still convey his words. ⛔ Declared, not mitigated — RFC §3A.4b.
        mayCarryCounterpartContent: true,
      })
    }
    return items
  }

  // ── FUSION ────────────────────────────────────────────────────────────────────────────────────────
  // ⛔⛔ MERGES ITEMS, NEVER STATES. Dedupe is by IDENTITY (the same row arriving from two retrievers),
  // never by similarity of claim: two items that agree stay two items, because collapsing them is exactly
  // how convergence would start looking like corroborated fact.
  function fuse(groups) {
    const all = groups.flat().filter(Boolean)
    const byId = new Map()
    for (const it of all) {
      const prev = byId.get(it.id)
      if (!prev) { byId.set(it.id, it); continue }
      // Same identity from two arms: count the corroboration, keep the state.
      prev.supportedBy += 1
      prev.confidence = corroborate(prev.confidence, prev.supportedBy)
    }
    const score = (it) => {
      const avail = it.availability === AVAILABILITY.recalled ? 2 : (it.availability === AVAILABILITY.knownUnreachable ? 1 : 0)
      const recency = it.when ? Math.max(0, 1 - (Date.now() - new Date(it.when).getTime()) / (30 * 864e5)) : 0.2
      // ⭐⭐ AN EPISODE SHE WAS IN **WITH** THE PERSON IS THE ANSWER TO A QUESTION ABOUT THAT PERSON, and it
      // must outrank her own passing mentions of them. Measured: without this the block was twelve
      // quotations of her searching for Hermes and nothing Hermes ever said.
      const relational = it.kind === 'episode' && it.withThem ? 20 : 0
      const isEpisode = it.kind === 'episode' ? 4 : 0
      return relational + isEpisode + avail * 2 + recency + (it.confidence ?? 0)
    }
    const ranked = [...byId.values()].sort((a, b) => score(b) - score(a))
    const kept = ranked.slice(0, LIMITS.items)
    // ⭐ A DROPPED ITEM IS REPORTED AS DROPPED. Silent truncation reads as "I covered everything", which is
    // the failure this project has already paid for twice.
    return { kept, dropped: ranked.length - kept.length }
  }

  /**
   * ⭐⭐ RENDER — the only stage she reads, and the one the vocabulary boundary polices.
   *
   * ⛔ NO population names, NO tool names, NO room names, NO ids, NO axis tokens. Human-facing provenance
   * only: *"I said this"*, *"they said this to me"*, *"I know we talked, I can't see it"*.
   */
  // ⭐ AND THE SUBJECT SHE IS TOLD ABOUT PREFERS A CUE THE PERSON TYPED. ⚠️ Otherwise a manufactured
  // fragment becomes the subject of a sentence — measured: *"talking about ทรง"*, and in English
  // *"talking about remember"*. ⛔ A derived cue is the LAST resort, never the first.
  const about0 = (cues) => {
    if (cues.persons.length) return cues.persons.join(' and ')
    const derived = new Set(cues.derivedTopics ?? [])
    return (cues.topics ?? []).find((t) => !derived.has(t)) ?? cues.topics?.[0] ?? 'this'
  }

  // ⭐ HUMAN DATES. `2026-08-20` is a database value; *"20 August"* is how a person says it. ⛔ No relative
  // dates ("yesterday") — those need a clock this function does not have, and a wrong one is a false memory.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  // ⭐⭐ THE DATES-ONLY PROBE (`memory.cognitionLocalDates`, DEFAULT OFF). ⛔ NOT the language-local
  // renderer, and deliberately not: the block stays in English and ONLY the date changes, because that is
  // the one variable that can falsify the renderer design before it is written.
  //
  // ⚠️ THE MEASUREMENT IT ANSWERS. Offline, same account/subject/memory, the Thai and English blocks are
  // near-identical (7 items · 5 episodes · 1 filtered) and the Thai block is RENDERED IN ENGLISH — so her
  // Thai answer has to transpose *"21 August"* across languages. Her Thai episodic rate is 0/8.
  //   · if Thai dates alone move it ⇒ the bottleneck is narrow, and a phrase table is worth building.
  //   · if nothing moves ⇒ the bottleneck is cross-language transposition and the table would not fix it.
  //
  // ⛔ THAI MONTH NAMES ONLY — no Buddhist-era year, no reformatting of anything else. The year is not in
  // the rendering at all, and converting one would be inventing a fact about the date rather than
  // translating it. ⓘ Thai writes the day before the month, same order as the English form here.
  const MONTHS_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
  const dayIn = (when, lang = 'en') => {
    if (!when) return null
    const d = new Date(when)
    if (Number.isNaN(d.getTime())) return null
    // ⭐ MISSING LANGUAGE ⇒ ENGLISH, so degradation is exactly today's behaviour rather than a blank.
    const months = lang === 'th' ? MONTHS_TH : MONTHS
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
  }

  /**
   * ⭐⭐⭐ LEAK 2 · THE REGISTER. Her memory, in her own voice — not a document handed to her.
   *
   * ⚠️⚠️ WHAT THIS REPLACES AND WHY. The previous block had a container header (*"What I have about
   * Hermes:"*), a bulleted inventory, transcript labels (`me:` / `them said:`) and a parenthesised audit
   * footer (*"(Searched: …)"*). Across five live runs she narrated it as exactly what it looked like:
   * *"from the context above"*, *"the system context tells me"*, and worst, *"the summaries you pasted"* —
   * attributing her own memory to Ote having pasted it.
   *
   * ⇒ Ote: *"Sotera should experience the cognition-layer result as her own memory, not as a
   * report/document/context packet that someone handed her."*
   *
   * ── ⛔ AND NOT BY OVERCORRECTING INTO FALSE CERTAINTY ────────────────────────────────────────────
   * *"Don't overcorrect by forcing fake first-person memories either. Natural does not mean pretending
   * certainty. If something is an inference, she should still experience/express it as an inference."*
   * ⇒ ⭐⭐ **EVERY PHRASE BELOW IS DERIVED FROM AN AXIS, NOT CHOSEN FOR STYLE.** *"I remember"* is licensed
   * by `availability === 'recalled'` and by nothing else; *"I worked out"* by `basis === 'inferred'`;
   * *"I decided to keep"* by `retention === 'retained'`. The distinctions survive because they are what
   * selects the wording. ⛔ If a future edit picks a phrase for how it sounds, the axis stops being
   * load-bearing and this whole guarantee is gone.
   *
   * ⓘ NOTHING IS HIDDEN. Provenance, source, availability, coverage, warrants and the debug trail are
   * untouched on the items — this changes only the sentence she reads.
   */
  function render({ cues, kept, dropped, searched, speakingWith = null }) {
    // ⭐ THE DATES-ONLY PROBE. The scripts present come from `cues.scripts`, which Step B already computes —
    // ⛔ no new detection and no model call.
    //
    // ⚠️⚠️ AND THE FIRST VERSION OF THIS LINE WAS WRONG IN THE ONE CASE THAT MATTERS. It required Thai with
    // NO Latin — and the probe question is *"Hermes เป็นอย่างไรบ้าง…"*, which contains a Latin proper name,
    // so the rule would have been off for every turn the probe exists to measure. ⇒ ⭐ MAJORITY, NOT
    // MEMBERSHIP: a Latin name inside a Thai sentence does not make the sentence English. The tie goes to
    // English, because guessing wrong is worse than not localising — the date is the part of the block she
    // quotes verbatim. ⓘ Counted over the raw utterance, so a script only wins by carrying the sentence.
    const scripts = cues?.scripts ?? []
    const raw = String(cues?.raw ?? '')
    const thaiWeight = (raw.match(/[฀-๿]/g) ?? []).length
    const latinWeight = (raw.match(/[\p{Script=Latin}]/gu) ?? []).length
    const dateLang = (localDates && scripts.includes('thai') && thaiWeight > latinWeight) ? 'th' : 'en'
    const dayOf = (when) => dayIn(when, dateLang)
    // ⭐⭐ TWO RENDERS: the real one, and a FRAME with every quotation replaced by a token.
    // ⚠️ The guard must police what the layer WROTE, not what it quotes. It once flagged the word "room"
    // inside a quotation of her own earlier answer — quoting the conversation back is not a leak.
    // ⚠️ And the sharper edge: her old machinery-talk now lives in her own history, so it is quoted back to
    // her indefinitely — a self-mirroring channel for the vocabulary this layer removes. ⛔ Not solvable by
    // a word list; recorded so it is not forgotten.
    const lines = []
    const frame = []
    const QUOTE = '«quoted»'
    const push = (before, quote = null, after = '') => {
      lines.push(`${before}${quote ?? ''}${after}`)
      frame.push(`${before}${quote == null ? '' : QUOTE}${after}`)
    }

    const episodes = kept.filter((i) => i.kind === 'episode')
    const said = kept.filter((i) => i.kind !== 'episode' && i.said)
    const unreachable = kept.filter((i) => i.kind !== 'episode' && !i.said
      && i.availability === AVAILABILITY.knownUnreachable)

    // ── ⭐⭐⭐ §3B · THE PRESENT TENSE, FIRST, AND DERIVED FROM WHAT THIS RUN OBSERVED ───────────────
    //
    // ⭐ COMPUTED FROM THE SET BEING RENDERED, which is what makes the still-true case fall out for free:
    // `renderFor` hands this function a filtered list, so the sentence describes what is actually being
    // said rather than what was retrieved. ⛔ No entitlement flag reaches here and none is needed.
    // ⛔ AND IT IS NOT THE LAYER PICKING A WINNER — it reports the layer's OWN OPERATION, never which of two
    // accounts of the world is right. Ordering is the only claim it makes.
    // ⭐⭐⭐ R4 · THE ANCHOR FOR "YOU". One sentence, first, naming who she is speaking with — so that
    // every second-person pronoun inside every quotation below has an owner. ⚠️ Measured: without it the
    // block named participants and subjects and never once named the person asking, so the only identity
    // signal in it was whichever name appeared most.
    // ⛔ NOT part of the current-state OBSERVATION: that item reports the layer's own operation, and who is
    // logged in is not something the layer observed itself doing. Separate sentence, separate provenance.
    //
    // ⚠️⚠️ AND IT IS **NOT PUSHED**, WHICH IS A BUG I ALREADY WROTE ONCE. Pushing it made `lines.length`
    // truthy, so the empty-result branch below stopped firing and the absence sentence — *"I went looking …
    // and came up with nothing"* — silently disappeared. ⛔ The anchor is not a FINDING, and it must never be
    // able to answer the question *"did this run find anything?"*. The live check caught it.
    const anchor = speakingWith ? `I'm talking with ${speakingWith} right now.` : null
    const lead = (body) => (anchor ? `${anchor}\n${body}` : body)

    const currentState = currentStateOf({ cues, kept })
    const nowLine = currentStateSentence(currentState, about0(cues))
    if (nowLine) push(nowLine)

    // ⭐⭐ CONTRADICTION IS **MARKED, NOT RESOLVED**. Both halves are rendered, present tense first, and the
    // conflict is recorded here for observability. ⛔ Nothing appends *"…and I was wrong"*: whether the
    // earlier statement was mistaken, or was true then and has since changed, is hers to work out.
    const contradictions = []
    const dateAndMark = (x, id, to = '') => {
      if (contradictsCurrentState(x.timeBound, currentState)) {
        contradictions.push({ id, timeBound: x.timeBound, when: x.when ?? null })
      }
      // ⭐ §3B's dating and R4's addressee compose: *"On 21 August I said to Ote: …"* is both correctly
      // dated and correctly addressed, and neither claim was inferred.
      return datedPrefix(dayOf(x.when), to)
    }

    // ── EPISODES · a conversation she was in, remembered ──────────────────────────────────────────
    for (const ep of episodes) {
      const when = dayOf(ep.when)
      const on = when ? ` on ${when}` : ''
      // ⭐ AVAILABILITY PICKS THE VERB. `known-unreachable` is not a memory she has — it is a memory she
      // knows about, and the sentence says exactly that. ⛔ Never "I don't remember".
      if (ep.availability !== AVAILABILITY.recalled) {
        push(`I know I talked with ${ep.who}${on}, and I can't get back to what was said.`)
        continue
      }
      push(ep.withThem
        ? `I remember talking with ${ep.who}${on}.`
        : `I remember${on ? ` — ${when} —` : ''} talking about ${about0(cues)}.`)
      for (const x of ep.exchanges) {
        if (x.said) {
          // ⭐⭐⭐ §3B · A DATED SELF-REPORT IS INTRODUCED AS ONE. *"On 21 August I said: …"* is verbatim,
          // immutable and true, and it does not read as a present-tense claim. ⛔ The words are untouched;
          // only the four words in front of them change. This is the entire historical half of §3B.
          // ⭐⭐⭐ R4 · SPEECH CARRIES ITS ADDRESSEE. `I said` becomes `I said to Hermes`, and his line
          // becomes `Hermes said to me`. ⛔ No inference — `ep.who` is the person whose conversation this was,
          // already resolved in stage 3. ⭐ One word, and every dangling "you" inside the quotation acquires
          // an owner, which is the whole of the identity fix: she addressed Hermes in one episode and Ote in
          // the next, and both were rendered as bare `I said:`.
          const to = ep.who && ep.who !== 'someone' ? ` to ${ep.who}` : ''
          if (x.who === 'me' && isTimeBound(x)) { push(`  ${dateAndMark(x, ep.id, to)}`, x.said); continue }
          // ⭐ Her own line and his are both recollection, phrased as speech rather than as a transcript row.
          push(x.who === 'me' ? `  I said${to}: ` : `  ${x.who} said to me: `, x.said)
        } else {
          // ⛔ A GAP STAYS A GAP. Closing it up would read as a monologue and invite her to infer what was
          // said to her — the reason change A returns withheld markers rather than a filtered list.
          push(`  ${x.who === 'me' ? 'I' : x.who} said something here that I can't see.`)
        }
      }
      if (ep.partial) push('  I can only reach my own side of that one.')
    }

    // ── STORED THINGS AND LOOSE LINES · basis and retention pick the verb ─────────────────────────
    for (const i of said) {
      const when = dayOf(i.when)
      if (i.source === SOURCE.storedMemory) {
        // ── ⭐⭐⭐ R4 · WHOSE "USER"? THE SUBJECT IS NAMED, OR ITS ABSENCE IS. ──────────────────────────
        //
        // ⚠️ Stored facts are phrased *"user's preferred_name: Hermes"*, *"user's alias: Hermes"*. Rendered
        // bare, the "user" in that sentence attaches to whoever is reading it — which is precisely R4.
        // ⭐ Three cases, and the third is the one that matters:
        //   subject is the person she is speaking with  → *"about you"*, the ordinary case;
        //   subject is somebody else                    → *"about Hermes"*, named;
        //   subject unknown                             → ⛔ SAY SO. Never silently the interlocutor.
        // ⓘ The content itself is untouched — this is a lead-in, not a rewrite of a stored fact.
        //
        // ⚠️⚠️ AND THE DEFAULT IS DELIBERATE, AFTER GETTING IT WRONG ONCE. My first version announced
        // *"it does not say who this is about"* whenever `subject_person_id` was NULL — which is MOST rows,
        // because the column is recent. That would hedge on facts that genuinely are about the person she is
        // talking to, and hedging on the ordinary case is its own kind of dishonesty.
        // ⭐ THE LOAD-BEARING FACT: the semantic arm is built with `{ userId }`, so every row it returns was
        // recorded IN THIS PERSON'S ROOM — which is exactly who the extraction meant by "user's".
        // ⇒ silence is correct for the ordinary case, and the case that must be NAMED is the opposite one:
        // a row whose resolved subject is somebody else.
        // ⛔ GUARDED ON THAT ASSUMPTION rather than trusting it: if the row did not come from this account's
        // material, the subject is stated or admitted, never defaulted. If the semantic arm is ever widened,
        // this stays correct instead of silently inheriting a wrong default.
        const sameRoom = i.provenanceAccountId == null || i.provenanceAccountId === userId
        const about = i.subjectPerson && i.subjectPerson !== speakingWith
          ? ` about ${i.subjectPerson}`
          : (sameRoom ? '' : ' about someone I cannot name from this')
        // ⭐ RETENTION FIRST — *"I decided to keep"* is a claim about her own act and only `retained`
        // licenses it. ⛔ `given` must never borrow it: nobody decided, it was extracted.
        if (i.retention === RETENTION.retained) { push(`I decided to keep this${about}: `, i.said); continue }
        // ⭐ BASIS SECOND, and this is where honesty lives. A stored memory is a claim someone recorded,
        // never a source she read — see the axes. `told` → someone told her; `inferred` → she concluded it;
        // `synthesized` → several things agree and none of them says it.
        if (i.basis === BASIS.inferred) { push(`I worked this out${about} rather than being told it: `, i.said); continue }
        if (i.basis === BASIS.synthesized) { push(`Several things point this way${about}, though nothing says it outright: `, i.said); continue }
        push(`I have this on file${about}: `, i.said)
        continue
      }
      // ⭐ §3B, on a loose line of hers too — the working set is this conversation, so a self-report here is
      // very recent, and dating it is still what stops it being read as a standing fact.
      if (i.who === 'me' && isTimeBound(i)) { push(dateAndMark(i, i.id), i.said); continue }
      if (i.who === 'me') { push(`I remember saying${when ? `, ${when},` : ''} `, i.said); continue }
      push(`${i.who === 'them' ? 'They' : i.who} said${when ? `, ${when}` : ''}: `, i.said)
    }
    for (const i of unreachable) {
      const when = dayOf(i.when)
      push(`I know I talked with ${i.who}${when ? ` around ${when}` : ''}, and I can't get back to what was said.`)
    }

    const about = about0(cues)
    if (!lines.length) {
      // ⭐ THE ABSENCE, AS THE RESULT OF LOOKING. Ote: *"give her the result of the search, not an
      // architectural explanation."* ⛔ And not *"I have nothing about X"* either — the sentence says what
      // she did and what came of it.
      const none = lead(`I went looking for what I have about ${about} and came up with nothing.`)
      // ⭐ §3B · THIS **IS** THE CURRENT-STATE STATEMENT for an empty run, which is why no separate one is
      // emitted: the sentence already says what she did and what came of it, in the present, about now.
      return { text: none, frame: none, currentState: null, contradictions: [] }
    }

    // ⛔ NO TITLE AND NO PARENTHESISED FOOTER — those two were the strongest document tells, and
    // `findMetaReferences` now fails a block that has either. The coverage facts survive as ordinary
    // sentences, because the information is load-bearing (the searched-set quantifier exists because she
    // once answered a flat *"No."* about a store she had not searched) and only the register was the problem.
    const tail = []
    if (dropped > 0) tail.push(`There is more of this than I have brought to mind — these are the nearest ${kept.length}.`)
    tail.push(`That is what I can reach on this right now: ${searched}.`)
    const join = (arr) => lead(`${arr.join('\n')}\n${tail.join(' ')}`)
    return { text: join(lines), frame: join(frame), currentState, contradictions }
  }

  /**
   * ⭐⭐⭐ ONE COGNITIVE OPERATION. She asks one thing and gets one coherent answer.
   *
   * ⛔ RE-ENTRANT BY DESIGN, not capped. Ote: *"no fixed cognitive depth ceiling… if Sotera wants to
   * investigate further, the pipeline should allow another pass."* Each call bounds its own work; nothing
   * bounds how many calls there may be, and every bound it applies is reported (`dropped`).
   */
  async function recollect({ text = '', names = null } = {}) {
    const cues = formCues(text, { knownNames: names ?? await knownNames() })
    // ⭐ THE TWO SILENCES. Nothing resolved ⇒ nothing was searched ⇒ claim nothing. Saying "I found nothing"
    // about a search that never happened is the same lie in the other direction.
    if (!hasCue(cues)) return { activated: false, cues, context: null, items: [] }

    const plan = populationsFor(cues)
    const rawGroups = await Promise.all([
      plan.includes('working-set') ? activateWorkingSet(cues) : [],
      plan.includes('semantic') ? activateSemantic(cues) : [],
      plan.includes('own-history') ? activateEpisodes(cues) : [],
    ])

    // ── ⭐⭐⭐ THE RELEVANCE FLOOR, AND IT GUARDS THIS LAYER'S OWN WORST FAILURE ─────────────────────
    //
    // ⚠️⚠️ MEASURED, on the first real run: asked *"How's Hermes doing?"* the semantic arm returned
    // *"user's current goal: build Rome in one day"*, *"user's physical state: body is degrading under
    // pressure"* and *"user's interaction_preference: …"* — three memories with nothing to do with Hermes.
    // Rendered, they become **"What I have about Hermes: …"**, which is precisely the failure named in the
    // RFC before any of this was built: **trading a false "I can't" for a false "I do."**
    //
    // ⭐ THE CAUSE IS BENIGN AND STRUCTURAL: the retrievers are nearest-neighbour indexes. `self-history`
    // deliberately runs `denseMinSim: 0` — *"a RANKED NEAREST-MATCH INDEX rather than a relevance filter"* —
    // so they always return SOMETHING. A ranking function has no notion of "about", and asking it for one
    // would make a signal into a boundary.
    //
    // ⇒ ⭐ WHEN A PERSON WAS NAMED, AN ITEM MUST MENTION THEM TO BE ABOUT THEM. Blunt, deterministic, and
    // honest about what it costs: a memory that refers to Hermes as *"he"* is dropped. That is the right
    // trade for now — a missing item is recoverable by looking again, a fabricated one is not.
    // ⛔ AND IT IS NOT SILENT: what it removed is counted and returned, because a filter nobody can see is
    // how "I covered everything" gets said about a filtered set.
    // ⚠️ CONTENT AND COUNTERPART ONLY — ⛔ NEVER `subject`. The first version included `it.subject`, which
    // this file STAMPS on every item as `cues.persons[0]`. So every item vouched for its own relevance and
    // the filter removed nothing: `filtered=0` while three unrelated memories sailed through. A relevance
    // test that reads a field we just wrote is testing our own assignment, not the item.
    // ⭐ A PERSON CUE demands the person be mentioned. A TOPIC-ONLY question demands at least one topic word.
    // ⚠️ The topic half was added after measuring the person half: asked about someone she has no records
    // for, `cues.persons` is empty, the floor did not apply, and the nearest-neighbour hits were rendered as
    // *"What I have about <name>"* — the same false *"I do"* through the other door.
    const terms = (cues.persons.length ? cues.persons : cues.topics).map((t) => t.toLowerCase())
    const mentionsCue = (it) => {
      // ⭐ AN EPISODE IS RELEVANT IF THE PERSON WAS **IN** IT, or if something actually said in it mentions
      // the cue. ⛔ Never by `it.subject`, which this file stamps — see below.
      if (it.kind === 'episode') {
        if (it.withThem) return true
        const spoken = (it.exchanges ?? []).map((x) => x.said ?? '').join(' ').toLowerCase()
        return terms.some((t) => t.length >= 3 && (spoken.includes(t) || String(it.who ?? '').toLowerCase().includes(t)))
      }
      const hay = `${it.said ?? ''} ${it.who ?? ''}`.toLowerCase()
      return terms.some((t) => t.length >= 3 && hay.includes(t))
    }
    let filtered = 0
    const groups = terms.length
      ? rawGroups.map((g) => g.filter((it) => {
        // ⓘ An existence-only item is ABOUT the person by construction — it is the record of talking to
        // them — and carries no text to match against. Never filtered.
        if (it.availability === AVAILABILITY.knownUnreachable) return true
        const keep = mentionsCue(it)
        if (!keep) filtered++
        return keep
      }))
      : rawGroups

    const inputs = groups.flat().filter(Boolean)
    const { kept, dropped } = fuse(groups)

    // ⛔⛔ THE GUARD, RUN IN PRODUCTION AND NOT ONLY IN TESTS. If fusion ever promotes an axis without a
    // warrant, the items are dropped rather than shown: a false *"I remember"* is worse than a missing one.
    const illegal = findIllegalPromotions(inputs, kept)
    if (illegal.length) {
      await log?.(`[cognition] ⛔ illegal promotion, discarding: ${JSON.stringify(illegal).slice(0, 300)}`, import.meta.url)
      return { activated: false, cues, context: null, items: [], illegal }
    }

    // ⭐⭐⭐ THE THIRD SILENCE — a cue resolved, nothing survived the floor, and the cue was one WE
    // MANUFACTURED. ⚠️ Measured the moment Thai segmentation shipped: ICU splits ความทรงจำ into
    // ความ / ทรง / จำ and the block came out as *"I went looking for what I have about ทรง and came up with
    // nothing."* ⛔ That is a false absence whose subject is a fragment of our own making.
    // ⭐ Ote: *"I'd rather Sotera not activate and not invent an aboutness claim."* ⇒ claim nothing.
    // ⓘ AND IT IS NARROW ON PURPOSE. A token the PERSON typed still carries its absence honestly —
    // *"I went looking for Zephyrine and came up with nothing"* is true, useful, and asserted by
    // `memory-cognition-check` §5. Only a derived-cue-only turn with an empty result goes silent.
    if (!kept.length && !mayClaimAboutness(cues)) {
      await log?.(`[cognition] derived cues only and nothing survived the floor — claiming nothing: ${JSON.stringify(cues.derivedTopics)}`, import.meta.url)
      return { activated: false, cues, context: null, items: [], reason: 'derived-cues-only' }
    }

    const searched = 'everything I currently have available'
    const { text: context, frame, currentState, contradictions } = render({
      cues, kept, dropped, searched, speakingWith: await interlocutor(),
    })

    // ⛔⛔ §3B · THE CURRENT-STATE ITEM IS CHECKED BY THE SAME LATTICE AS EVERYTHING ELSE. It is a DERIVED
    // item, so `findIllegalPromotions` bounds its basis by `combineBasis` of its parents and its availability
    // by their best reach — and it holds no warrants, deliberately. ⭐ An observation of the run must not need
    // one; if this ever fires, the present-tense half has started claiming more than the run supports, which
    // is exactly the *"trading a false I can't for a false I do"* failure in its newest disguise.
    const illegalNow = currentState ? findIllegalPromotions(inputs, [currentState]) : []
    if (illegalNow.length) {
      await log?.(`[cognition] ⛔ current-state item over-claims, discarding: ${JSON.stringify(illegalNow).slice(0, 300)}`, import.meta.url)
      return { activated: false, cues, context: null, items: [], illegal: illegalNow }
    }

    // ⛔ AND THE VOCABULARY GUARD, ALSO IN PRODUCTION — RUN ON THE FRAME, NOT THE QUOTATIONS. A leak in what
    // the layer WROTE is a bug in the renderer; a machinery word inside something she or someone else
    // actually said is the conversation, and censoring it would be lying about what was said.
    // ⓘ A technical question is exempt — she is allowed to explain herself when asked.
    const leaks = findImplementationLeaks(frame, { context: cues.technical ? 'technical-question' : null })
    if (leaks.length) {
      await log?.(`[cognition] ⛔ vocabulary leak in the FRAME, withholding: ${leaks.map((l) => l.word).join(', ')}`, import.meta.url)
      return { activated: false, cues, context: null, items: kept, leaks }
    }

    // ⓘ `currentState` and `contradictions` are returned for OBSERVABILITY — the suite asserts on them and
    // the debug log records them. ⛔ Neither is a decision: nothing downstream may use `contradictions` to
    // drop, reorder or annotate her history.
    return {
      activated: true, cues, plan, context, frame, items: kept, dropped, searched, filtered,
      currentState, contradictions,
    }
  }

  /**
   * ⭐⭐ RE-RENDER A FILTERED SET. Exposed so the UTTERANCE BOUNDARY can remove what an account may not be
   * told and the block can be rebuilt from what is left.
   *
   * ⛔ THIS IS HOW COGNITION STAYS BLIND. It does not know why items were removed, who removed them, or that
   * a capability exists — it is handed a list and a sentence to append. The alternative (passing an
   * `entitled` flag into `recollect`) would put account authorization inside cognition, which Ote ruled out:
   * *"Cognition must remain completely unaware of access_sotera_memory and must continue treating Sotera's
   * memory as hers."*
   */
  // ⚠️⚠️ `speakingWith` DEFAULTS TO THE CACHE, NOT TO NULL, AND THE FIRST VERSION GOT THAT WRONG. Taking it
  // as a caller-supplied parameter meant the UTTERANCE-BOUNDARY path — which re-renders a filtered set from
  // the route — never passed it, so the anchor sentence vanished for exactly the account where identity
  // confusion matters most: the one being told that some of what she remembers is not hers to share here.
  // ⇒ ⭐ The cache is populated by `recollect()`, which always runs first in a turn, so the boundary path
  // inherits it without the route having to know the layer has an identity concern at all.
  // ⓘ The parameter survives as an explicit override, which is what the unit tests use.
  function renderFor(items = [], {
    cues, dropped = 0, searched = 'everything I currently have available', note = null,
    speakingWith = interlocutorCache ?? null,
  } = {}) {
    const out = render({ cues, kept: items, dropped, searched, speakingWith })
    // ⚠️ The note is appended to BOTH, and it must be — the frame is what the vocabulary guard scans, and a
    // sentence exempted from that scan is a hole in it.
    // ⭐ §3B FALLS OUT HERE FOR FREE. `render` rebuilds the present-tense sentence from the list it is
    // handed, so a filtered set produces a current-state sentence describing the filtered set. ⛔ No
    // entitlement flag is passed in, and none is needed.
    return note
      ? { ...out, text: `${out.text}
${note}`, frame: `${out.frame}
${note}` }
      : out
  }

  return { recollect, renderFor }
}
