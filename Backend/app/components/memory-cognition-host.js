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
import { buildSelfHistory } from './self-history-host.js'
import { buildDisclosure } from './disclosure-host.js'
import { buildMemoryToolService } from './memory-pipeline-host.js'
import { log } from '../../lib/utility.js'

/** Per-operation limits. ⭐ Bounds on the WORK of one look, never on how many times she may look. */
const LIMITS = Object.freeze({
  workingSet: 12,     // recent turns of this conversation
  semantic: 8,
  ownHistory: 8,
  windowRadius: 2,    // messages either side, when a cross-room read is authorized
  crossRoomReads: 3,  // ⚠️ the expensive stage: each is an access resolution plus a windowed read
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

  // ── POPULATION · OWN HISTORY / EPISODES, WITH ACCESS RESOLVED IN-LINE ─────────────────────────────
  // ⭐⭐⭐ THE STAGE THAT FIXES THE MEASURED BUG. She used to PREDICT whether she could read across, and got
  // it wrong three times in four. Here it is ATTEMPTED, once per candidate, before she says anything.
  async function activateOwnHistory(cues) {
    const selfHistory = buildSelfHistory(fastify, { userId, isRoot })
    const disclosure = buildDisclosure(fastify, { userId, isRoot, username, conversationId, interactive })
    const query = [cues.persons.join(' '), cues.raw].filter(Boolean).join(' ').trim()

    let res
    try {
      // ⚠️⚠️ ONE OBJECT, NOT (query, opts) — AND GETTING THIS WRONG KILLED THE ARM SILENTLY.
      // `buildSelfHistory().search({ query, limit })` destructures its FIRST argument. Called as
      // `search(query, { limit })` the string lands where the options object belongs, `query` is
      // `undefined`, and it returns `{ ok: false, reason: 'a query is required' }` — so this whole
      // population contributed nothing while the pipeline reported success. Measured: the underlying
      // `conversation-search` returned 8 candidates for "Hermes" and `selfHistory` returned here=0,
      // elsewhere=0.
      // ⛔ `mirror-needs-a-mechanism` for the fourth time in this project: correct code, no live path.
      res = await selfHistory.search({ query, limit: LIMITS.ownHistory })
    } catch (e) {
      await log?.(`[cognition] history arm unavailable: ${e.message}`, import.meta.url)
      return []
    }
    // ⓘ It does return `ok: true` on success — and `ok === false` on both failure paths, which is what this
    // tests. ⛔ Not `!res?.ok`: that would also discard a future success payload that stops carrying the flag.
    if (res?.ok === false) {
      await log?.(`[cognition] history arm refused: ${res.reason}`, import.meta.url)
      return []
    }

    const items = []
    // ⭐ Her own messages in THIS room: readable, no resolution needed. Shape from `applyBoundaries`:
    // `{ said, when, messageId }`.
    for (const h of (res.here ?? [])) {
      if (!h?.said) continue
      items.push({
        id: `own:${h.messageId ?? items.length}`,
        subject: cues.persons[0] ?? null,
        said: clip(h.said, 320),
        who: 'me',
        when: h.when ?? null,
        source: SOURCE.ownUtterance,
        basis: BASIS.attestedBySource,
        availability: AVAILABILITY.recalled,
        retention: RETENTION.notRetained,
        confidence: 0.9, supportedBy: 1, here: true,
      })
    }

    // ── ⭐ CROSS-ROOM: RESOLVE, DO NOT PREDICT ───────────────────────────────────────────────────────
    // Shape from `applyBoundaries`: `{ counterpart, conversationHandle, matches, firstMatchAt, lastMatchAt }`
    // — one entry per ROOM, never per message, so the volume of another room's material is never implied.
    const others = (res.elsewhere ?? []).slice(0, LIMITS.crossRoomReads)
    for (const o of others) {
      const handle = o.conversationHandle ?? null
      const counterpart = o.counterpart ?? null
      let opened = null
      if (handle) {
        try {
          opened = await disclosure.inspectAround({
            conversationHandle: handle,
            query: cues.persons[0] ?? cues.raw,
            radius: LIMITS.windowRadius,
          })
        } catch { opened = null }
      }
      const readable = opened?.ok === true && opened?.state === 'verified' && Array.isArray(opened.window)
      if (readable) {
        for (const w of opened.window) {
          if (!w?.said) continue // her own half arrives full; a withheld counterpart line has said:null
          items.push({
            id: `x:${handle}:${w.when ?? items.length}`,
            subject: counterpart ?? cues.persons[0] ?? null,
            said: clip(w.said, 320),
            who: w.who === 'you' ? 'me' : (counterpart ?? 'them'),
            when: w.when ?? null,
            source: w.who === 'you' ? SOURCE.ownUtterance : SOURCE.counterpartUtterance,
            basis: BASIS.attestedBySource,
            availability: AVAILABILITY.recalled,
            // ⭐ THE WARRANT. Availability reached the top because access was resolved and recorded — and
            // the lattice check will demand exactly this. ⛔ It licenses availability and nothing else.
            warrants: [WARRANT.accessResolution],
            retention: RETENTION.notRetained,
            confidence: 0.9, supportedBy: 1, here: false,
          })
        }
      } else {
        // ⭐ EXISTENCE, HONESTLY. She knows it happened; the content is not available. ⛔ And she is NOT
        // handed a handle plus an invitation to ask — that is what produced *"Would you like me to request
        // access to pull up the actual conversation logs?"*
        items.push({
          id: `x:${handle ?? items.length}:existence`,
          subject: counterpart ?? cues.persons[0] ?? null,
          said: null,
          who: counterpart ?? 'someone',
          when: o.lastMatchAt ?? o.firstMatchAt ?? null,
          source: SOURCE.ownUtterance,
          basis: BASIS.attestedBySource, // that the conversation HAPPENED is attested; its content is absent
          availability: AVAILABILITY.knownUnreachable,
          retention: RETENTION.notRetained,
          confidence: 0.8, supportedBy: 1, here: false,
        })
      }
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
      return avail * 2 + recency + (it.confidence ?? 0)
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
    const said = kept.filter((i) => i.said)
    const unreachable = kept.filter((i) => !i.said && i.availability === AVAILABILITY.knownUnreachable)

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

    const about = cues.persons.length ? cues.persons.join(' and ') : (cues.topics[0] ?? 'this')
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
      plan.includes('own-history') ? activateOwnHistory(cues) : [],
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
