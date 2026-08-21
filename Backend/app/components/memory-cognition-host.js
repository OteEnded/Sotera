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

import { formCues, hasCue, populationsFor } from './memory-cognition-cues.js'
import {
  SOURCE, BASIS, AVAILABILITY, RETENTION, WARRANT, findIllegalPromotions, corroborate,
} from './memory-cognition-axes.js'
import { findImplementationLeaks } from './memory-cognition-vocabulary.js'
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
      .map((m) => ({
        id: `ws:${m.id}`,
        subject: cues.persons[0] ?? cues.topics[0] ?? null,
        said: clip(m.content, 320),
        who: m.role === 'assistant' ? 'me' : 'them',
        when: m.created_at,
        source: m.role === 'assistant' ? SOURCE.ownUtterance : SOURCE.counterpartUtterance,
        // ⭐ She can see it. That is what attestation means on this axis.
        basis: BASIS.attestedBySource,
        availability: AVAILABILITY.recalled,
        retention: RETENTION.notRetained,
        confidence: 0.95,
        supportedBy: 1,
        here: true,
      }))
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
    return hits.map((m) => ({
      id: `mem:${m.id ?? m.memoryId ?? Math.random().toString(36).slice(2)}`,
      subject: cues.persons[0] ?? cues.topics[0] ?? null,
      said: clip(m.content, 320),
      who: null,
      when: m.created_at ?? m.createdAt ?? null,
      source: SOURCE.storedMemory,
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
    for (const e of evidence) {
      const cid = e.conversation?.id
      const mid = e.message?.id
      if (!cid || !mid) continue
      const at = e.timestamp ?? null
      const prev = episodes.get(cid)
      if (!prev) {
        episodes.set(cid, { cid, centre: mid, matches: 1, firstAt: at, lastAt: at })
      } else {
        prev.matches += 1
        if (at && (!prev.firstAt || at < prev.firstAt)) prev.firstAt = at
        if (at && (!prev.lastAt || at > prev.lastAt)) { prev.lastAt = at; prev.centre = mid }
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
      return { ...ep, who: p?.who ?? null, roomUserId: p?.roomUserId ?? null, withThem, score: (withThem ? 100 : 0) + ep.matches + recency }
    }).sort((a, b) => b.score - a.score)

    // ── 5 · RESOLVE EACH EPISODE THROUGH THE ONE DOOR ─────────────────────────────────────────────
    const items = []
    for (const ep of scored.slice(0, LIMITS.episodes)) {
      let opened = null
      try {
        opened = await disclosure.inspectAround({ messageId: ep.centre, radius: LIMITS.windowRadius })
      } catch { opened = null }

      // ⭐ THE THREE OUTCOMES, ALL OF THEM RESOLVED RATHER THAN PREDICTED:
      //   verified   — she may read the exchange, both sides
      //   own_only   — her half in full, the counterpart's withheld (change A)
      //   anything else — she knows it happened and cannot see it
      const state = opened?.ok === true ? opened.state : null
      const window = Array.isArray(opened?.window) ? opened.window : []
      const exchanges = window
        .map((w) => ({
          who: w.who === 'you' ? 'me' : (w.who ?? ep.who ?? 'them'),
          said: w.said ? clip(w.said, 260) : null,
          when: w.when ?? null,
          withheld: !w.said,
        }))
        .filter((x) => x.said || x.withheld)

      const anyReadable = exchanges.some((x) => x.said)
      const bothSides = exchanges.some((x) => x.said && x.who !== 'me')

      items.push({
        id: `ep:${ep.cid}`,
        kind: 'episode',
        subject: ep.who ?? cues.persons[0] ?? null,
        who: ep.who ?? 'someone',
        // ⭐ WITH the person, or merely MENTIONING them. Rendered differently, because they are different
        // facts about her life and collapsing them is what made the block read like a search log.
        withThem: ep.withThem,
        exchanges,
        matches: ep.matches,
        when: ep.lastAt,
        // ⭐ An episode is a THING THAT HAPPENED; that it happened is attested by her own message being in
        // it. ⛔ Its CONTENT is a separate question, which is what availability answers.
        source: SOURCE.ownUtterance,
        basis: BASIS.attestedBySource,
        availability: anyReadable ? AVAILABILITY.recalled : AVAILABILITY.knownUnreachable,
        // ⭐ The warrant only when the door actually opened across a boundary; her own room needs none.
        warrants: anyReadable && ep.roomUserId && ep.roomUserId !== userId ? [WARRANT.accessResolution] : [],
        retention: RETENTION.notRetained,
        confidence: 0.9,
        supportedBy: ep.matches,
        here: ep.roomUserId === userId,
        partial: state === 'own_only' || (anyReadable && !bothSides),
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
  const about0 = (cues) => (cues.persons.length ? cues.persons.join(' and ') : (cues.topics[0] ?? 'this'))

  function render({ cues, kept, dropped, searched }) {
    // ⭐⭐ TWO RENDERS: the real one, and a FRAME with every quotation replaced by a token.
    //
    // ⚠️⚠️ THE GUARD MUST POLICE WHAT THE LAYER WROTE, NOT WHAT IT QUOTES — and the first version got this
    // wrong, in a way that only real data exposed. It scanned the whole block and flagged the word "room"…
    // inside a quotation of HER OWN EARLIER ANSWER: *"From this room, I don't have any direct memories."*
    // Quoting the conversation back is not a leak; it is the conversation.
    // ⚠️ And there is a sharper edge underneath it: her old machinery-talk now LIVES in her own history, so
    // it will be quoted back to her indefinitely. That is a self-mirroring channel for exactly the
    // vocabulary this layer exists to remove — the same shape as the Thai register finding, where her own
    // prior output outvoted an instruction. ⛔ Not solvable by a word list; recorded so it is not forgotten.
    const lines = []
    const frame = []
    const QUOTE = '«quoted»'
    const push = (before, quote, after = '') => {
      lines.push(`${before}${quote ?? ''}${after}`)
      frame.push(`${before}${quote == null ? '' : QUOTE}${after}`)
    }
    const episodes = kept.filter((i) => i.kind === 'episode')
    const said = kept.filter((i) => i.kind !== 'episode' && i.said)
    const unreachable = kept.filter((i) => i.kind !== 'episode' && !i.said && i.availability === AVAILABILITY.knownUnreachable)

    // ⭐⭐ EPISODES FIRST, AND AS CONVERSATIONS RATHER THAN HITS. *"episode → participants → relevant
    // exchanges."* An exchange she may not read is shown as a gap with a name on it — ⛔ never closed up,
    // because her own lines with the replies removed read as a monologue and invite her to infer what was
    // said to her.
    for (const ep of episodes) {
      const when = ep.when ? new Date(ep.when).toISOString().slice(0, 10) : 'at some point'
      if (ep.availability !== AVAILABILITY.recalled) {
        push(`- I talked with ${ep.who} on ${when}, and I can't see that conversation`, null)
        continue
      }
      push(`- ${ep.withThem ? `With ${ep.who}` : `Talking about ${about0(cues)}`}, ${when}:`, null)
      for (const x of ep.exchanges) {
        if (x.said) push(`    ${x.who === 'me' ? 'me' : x.who}: `, x.said)
        else push(`    ${x.who === 'me' ? 'me' : x.who}: (I can't see this part)`, null)
      }
      if (ep.partial) push('    (I can only see my own side of this one)', null)
    }

    for (const i of said) {
      const when = i.when ? new Date(i.when).toISOString().slice(0, 10) : 'at some point'
      if (i.source === SOURCE.storedMemory) {
        push(i.retention === RETENTION.retained ? '- I decided to keep this: ' : '- I have this on file: ', i.said)
      } else if (i.who === 'me') {
        push(`- I said, ${when}: `, i.said)
      } else {
        push(`- ${i.who} said, ${when}: `, i.said)
      }
    }
    for (const i of unreachable) {
      const when = i.when ? ` around ${new Date(i.when).toISOString().slice(0, 10)}` : ''
      push(`- I know I talked with ${i.who}${when}, and I can't see that conversation`, null)
    }

    const about = about0(cues)
    if (!lines.length) {
      // ⭐ THE ABSENCE, AS A RESULT RATHER THAN AN EXPLANATION. Ote: *"give her the result of the search,
      // not an architectural explanation… That's very different from 'I don't have X in this room.'"*
      const none = `About ${about}: I looked through what I currently have available and found nothing.`
      return { text: none, frame: none }
    }
    const tail = dropped > 0 ? `\n(There is more than this; I looked at the closest ${kept.length}.)` : ''
    const head = `What I have about ${about}:\n`
    const foot = `${tail}\n(Searched: ${searched}.)`
    return { text: `${head}${lines.join('\n')}${foot}`, frame: `${head}${frame.join('\n')}${foot}` }
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

    const searched = 'everything I currently have available'
    const { text: context, frame } = render({ cues, kept, dropped, searched })

    // ⛔ AND THE VOCABULARY GUARD, ALSO IN PRODUCTION — RUN ON THE FRAME, NOT THE QUOTATIONS. A leak in what
    // the layer WROTE is a bug in the renderer; a machinery word inside something she or someone else
    // actually said is the conversation, and censoring it would be lying about what was said.
    // ⓘ A technical question is exempt — she is allowed to explain herself when asked.
    const leaks = findImplementationLeaks(frame, { context: cues.technical ? 'technical-question' : null })
    if (leaks.length) {
      await log?.(`[cognition] ⛔ vocabulary leak in the FRAME, withholding: ${leaks.map((l) => l.word).join(', ')}`, import.meta.url)
      return { activated: false, cues, context: null, items: kept, leaks }
    }

    return { activated: true, cues, plan, context, frame, items: kept, dropped, searched, filtered }
  }

  return { recollect }
}
