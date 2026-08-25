// Advice HOST SERVICE — the operations layer (canon: Feature → Host Service → Store → DB).
//
// Owns: resolving a destination, enforcing what it can do, composing how Sotera introduces herself,
// stamping provenance, bounding the interaction, and driving the exchange's state.
// ⛔ Does NOT own: any wire protocol (that is the binding), any persistence (that is the store), or the
// judgement of whether/whom/how to ask (that is the Skill).
//
// ⭐⭐⭐ THE ONE THING TO PRESERVE HERE: this file never mentions `/chat`, `/v1/runs`, a run, or Hermes's
// state vocabulary. It asks the binding what it can do and translates a MODE into an operation. Adding
// Cogito must not change a line of it.

import { createAdviceStore } from './store.js'
import { deriveWorld } from './lifecycle.js'
import { createHermesBinding } from './hermes.js'

// ── ⭐ THE SELF-PRESENTATION — five stable slots. E4 (purpose) rides in the message, deliberately. ──
// Measured 2026-08-24: a session's stored `system_prompt` is inert as identity (it cannot affect the
// first turn), so this is sent on EVERY exchange. And the preamble is byte-stable across turns, which is
// what keeps a counterpart's prompt prefix warm and — on Hermes — is what her background review fork
// inherits.
const PERSONA_SLOTS = {
  // E1 · identity — one value, everywhere she goes
  identity: "You are speaking with Sotera, Ote's AI daughter and personal AI companion.",
  // E2 · relationship to Ote
  toOte: "Sotera is Ote's personal AI companion and daughter, and is communicating through Ote's account.",
}

function composePresentation(destination) {
  // ⭐ ORDER: who I am · who we are to each other · what I may ask · whose access this is.
  // ⛔ A slot a destination cannot carry must be REFUSED out loud, never dropped silently — but every
  // slot here is text, so a text channel carries all of them.
  return [
    PERSONA_SLOTS.identity,
    PERSONA_SLOTS.toOte,
    destination.relationship,   // E3 — who they are to her
    destination.authorityNote,  // E5 — what she may ask of them
    destination.authNote,       // E6 — whose account reaches them
  ].filter(Boolean).join(' ')
}

const MAX_DEPTH = 2   // ⭐ loop guard in code, never a prompt line (two agents can ping-pong forever)

export function createAdviceService({ db, config, user }) {
  const store = createAdviceStore(db)
  const destinations = config?.advice?.destinations || {}

  const bindingFor = (dest) => {
    if (dest.transport === 'hermes-session') return createHermesBinding({ config, destination: dest })
    return null
  }

  const resolveDestination = (name) => {
    const d = destinations[name]
    if (!d || d.enabled === false) return null
    return d
  }

  return {
    /**
     * ⭐ What she may attend — from OUR record, never from the destination.
     * ⛔ There is no enumeration of the counterpart's sessions anywhere in this Feature. A listing on the
     * Hermes side is scoped by nothing and returns a 60-character preview of every private conversation,
     * so discovery is an allowlist on our side and stays that way.
     */
    authorized() {
      return Object.entries(destinations)
        .filter(([, d]) => d.enabled !== false)
        .map(([name, d]) => ({
          destination: name,
          display: d.display || name,
          capability: d.capability || null,
          sessions: (d.sessions || []).map((s) => ({ id: s.id, grantedFor: s.grantedFor || null })),
        }))
    },

    /**
     * Reach a destination. `mode` is Sotera's judgement, arriving from above; this decides only whether
     * the destination can honour it and what to record.
     */
    async reach({ destination: name, sessionId = null, message, brief = null, mode, conversationId = null, depth = 0 }) {
      const dest = resolveDestination(name)
      if (!dest) return { ok: false, reason: `no destination named "${name}"` }
      const binding = bindingFor(dest)
      if (!binding) return { ok: false, reason: `destination "${name}" has no usable transport` }

      const caps = binding.capabilities()
      // ⭐ EXPLICIT REFUSAL, never a silent substitution. A destination that cannot delegate must not have
      // its delegation quietly turned into a conversation — that is the OLS rule, and it is what will keep
      // a human-relay destination honest when one exists.
      if (!caps[mode]) {
        return { ok: false, reason: `${dest.display || name} cannot ${mode} — this destination supports ${Object.keys(caps).filter((k) => caps[k] === true && (k === 'converse' || k === 'delegate')).join(' / ') || 'neither'}` }
      }
      if (mode === 'delegate' && !brief) {
        // ⭐ The brief is the artefact. The database refuses a delegation without one; refuse it earlier
        // and more legibly here.
        return { ok: false, reason: 'a delegation needs a brief that stands on its own' }
      }
      if (depth >= MAX_DEPTH) return { ok: false, reason: `depth ${depth} reached the ceiling (${MAX_DEPTH})` }

      // The session must be one Ote authorized. ⛔ An id she was not given is not attendable.
      const allowed = (dest.sessions || []).map((s) => s.id)
      const useSession = sessionId || allowed[0] || null
      if (useSession && !allowed.includes(useSession)) {
        return { ok: false, reason: `session ${useSession} is not one you are authorized to attend` }
      }
      // ⚠️ Only converse needs the relationship; a delegated run does not read it (and saying otherwise
      // would be overclaiming what the session means on that interface).
      if (mode === 'converse' && !useSession) return { ok: false, reason: 'no authorized session to converse in' }

      const preamble = composePresentation(dest)
      const outbound = mode === 'delegate' ? brief : message

      const ex = await store.open({
        destination: name,
        mode,
        authority: dest.authority || 'ote-account',
        openedBy: user.id,
        openedInConversation: conversationId,
        remoteSessionId: useSession,
        brief: mode === 'delegate' ? brief : null,
        depth,
      })
      await store.addTurn(ex.id, { direction: 'out', content: outbound, attested: true })

      if (mode === 'converse') {
        const r = await binding.converse({ sessionId: useSession, message, preamble })
        if (r.outcome === 'refused' || r.outcome === 'failed') {
          await store.patch(ex.id, { state: r.outcome === 'refused' ? 'refused' : 'failed', error: r.reason, closedAt: new Date() })
          return { ok: false, exchangeId: ex.id, state: r.outcome, reason: r.reason }
        }
        await store.addTurn(ex.id, { direction: 'in', content: r.text, attested: true, latencyMs: r.latencyMs })
        // ⭐ Record the model ONLY because this interface reported it.
        await store.patch(ex.id, {
          state: 'completed',
          closedAt: new Date(),
          ...(r.model ? { modelSource: 'reported', modelReported: r.model } : {}),
        })
        return { ok: true, exchangeId: ex.id, state: 'completed', mode, said: r.text, model: r.model || null }
      }

      // delegate
      const r = await binding.delegate({ sessionId: useSession, brief, preamble })
      if (r.outcome === 'refused' || r.outcome === 'failed') {
        await store.patch(ex.id, { state: r.outcome === 'refused' ? 'refused' : 'failed', error: r.reason, closedAt: new Date() })
        return { ok: false, exchangeId: ex.id, state: r.outcome, reason: r.reason }
      }
      await store.patch(ex.id, { state: 'pending', remoteWorkId: r.handle })
      // ⭐ She gets a handle and goes on with her own work. ⛔ Nothing waits here.
      return { ok: true, exchangeId: ex.id, state: 'pending', mode }
    },

    /**
     * Ask how a delegated exchange is going. ⭐ THIS is how a long-running counterpart reaches her:
     * she comes back and asks, rather than anything blocking or polling on her behalf.
     */
    async observe(exchangeId) {
      const ex = await store.findById(exchangeId, user.id)
      if (!ex) return { ok: false, reason: 'no such exchange' }
      if (['completed', 'failed', 'cancelled', 'refused'].includes(ex.state)) {
        const turns = await store.turns(ex.id)
        const said = turns.filter((t) => t.direction === 'in').map((t) => t.content).join('\n\n')
        return { ok: true, exchangeId: ex.id, state: ex.state, mode: ex.mode, said: said || null, model: ex.modelReported, modelSource: ex.modelSource }
      }
      const dest = resolveDestination(ex.destination)
      const binding = dest && bindingFor(dest)
      if (!binding || !ex.remoteWorkId) return { ok: true, exchangeId: ex.id, state: ex.state, mode: ex.mode }

      const o = await binding.observe(ex.remoteWorkId)
      if (o.state === 'completed') {
        await store.addTurn(ex.id, { direction: 'in', content: o.text ?? '', attested: true })
        // ⭐⭐ NO MODEL RECORDED — this interface does not expose one, and `model_source` stays
        // 'unavailable'. Substituting the configured model would be provenance inflation.
        const done = await store.patch(ex.id, { state: 'completed', closedAt: new Date() })
        return { ok: true, exchangeId: ex.id, state: 'completed', mode: ex.mode, said: o.text ?? '', model: null, modelSource: done.modelSource }
      }
      if (o.state === 'failed' || o.state === 'cancelled') {
        await store.patch(ex.id, { state: o.state, error: o.reason ?? null, closedAt: new Date() })
        return { ok: true, exchangeId: ex.id, state: o.state, mode: ex.mode, reason: o.reason ?? null }
      }
      await store.patch(ex.id, { state: o.state })
      return { ok: true, exchangeId: ex.id, state: o.state, mode: ex.mode }
    },

    // ══ ⭐⭐⭐ THE LIFECYCLE TRIO · peek / probe / abandon — and the split is the whole point ═════
    //
    //   peek     ⛔ PURE READ. No network, no write. Derives the world from what is already stored.
    //   probe    the BINDING asks the counterpart and records an OBSERVATION. ⛔ never collects, never closes.
    //   collect  ⭐ HER act — `observe()` above. Writes the inbound turn and closes the exchange.
    //   abandon  ⭐ HER act — the one ending with no counterpart signal behind it.
    //
    // ⚠⚠ THE NEAR-MISS THAT FORCED THIS SPLIT: `observe()` reads like an inspection and IS A COMMIT. A
    // status panel built the obvious way — poll observe() to render a chip — would have fetched the answer,
    // written it into her exchange as an inbound turn and closed it, **because someone wanted a progress
    // indicator**. ⛔ That is why `peek` may not touch the network and `probe` may not touch content.

    /**
     * ⭐ PEEK — what is this exchange doing, as far as we already know?
     * ⛔ PURE: no HTTP, no writes, no state change. Anyone may call it: a UI, a status script, an operator.
     * ⓘ It can be STALE by construction, and says so — `sinceHeardMs` is returned so a reader can see that
     * the last thing we heard is ninety minutes old. ⛔ Nothing here turns that number into a conclusion.
     */
    async peek(exchangeId) {
      const ex = await store.findById(exchangeId, user.id)
      if (!ex) return { ok: false, reason: 'no such exchange' }
      const latest = await store.latestObservation(ex.id)
      const turns = await store.turns(ex.id)
      const inbound = turns.filter((t) => t.direction === 'in').length
      const derived = deriveWorld({ exchange: ex, latest, inboundTurns: inbound })
      return {
        ok: true,
        exchangeId: ex.id,
        destination: ex.destination,
        mode: ex.mode,
        // ⚠️ THE STORED STATE IS REPORTED AS WHAT IT IS — a record of the last ACT, not a live status.
        recordedState: ex.state,
        openedAt: ex.openedAt,
        ...derived,
        // ⛔ A COUNT, NEVER CONTENT. Whether she has it is an input to the world; delivering it is `collect`.
        received: inbound,
      }
    },

    /**
     * ⭐⭐ PROBE — the BINDING's own recovery observation. ⛔ NOT Sotera polling.
     *
     * ⭐ Ote's framing: *"the binding could have a recovery watcher because the binding owns the
     * relationship with the destination."* ⇒ this is housekeeping between two systems, categorically
     * different from her going to look.
     *
     * ⛔⛔ IT NEVER COLLECTS. Even when the counterpart reports `completed` **and hands back the output**,
     * this records only THAT they finished. The words stay theirs until she receives them.
     * ⚠️ AND IT HAS A DEADLINE: the destination retains a terminal status for a bounded window
     * (Hermes `64a6f42c`: 3600 s). A watcher slower than that loses a completed result to the reaper while
     * both sides are perfectly healthy.
     */
    async probe(exchangeId) {
      const ex = await store.findById(exchangeId, user.id)
      if (!ex) return { ok: false, reason: 'no such exchange' }
      const dest = resolveDestination(ex.destination)
      const binding = dest && bindingFor(dest)
      if (!binding || !ex.remoteWorkId) {
        return { ok: false, reason: 'nothing detached to observe' }
      }
      const t0 = Date.now()
      let o = null
      try {
        o = await binding.observe(ex.remoteWorkId)
      } catch (e) {
        // ⛔ A TRANSPORT FAILURE IS RECORDED AS A TRANSPORT FAILURE, never as a state. ⚠️ "unreachable"
        // and "not_found" are DIFFERENT worlds — up-but-forgotten is permanent, not-there-at-all may be
        // transient — and a model that merges them will get one of them wrong.
        await store.recordObservation(ex.id, {
          contactResult: 'unreachable', latencyMs: Date.now() - t0, note: String(e?.message ?? '').slice(0, 200),
        })
        return { ok: true, exchangeId: ex.id, observed: 'unreachable' }
      }
      const notFound = o?.state === 'failed' && o?.reason === 'run_not_found'
      await store.recordObservation(ex.id, {
        contactResult: notFound ? 'not_found' : (o?.state ? 'heard' : 'error'),
        heardState: notFound ? null : (o?.state ?? null),
        heardLastEvent: o?.lastEvent ?? null,
        askedHow: 'probe',
        latencyMs: Date.now() - t0,
      })
      // ⛔ THE RETURN CARRIES NO WORDS. `o.text` may be populated — it is deliberately dropped here.
      return { ok: true, exchangeId: ex.id, observed: notFound ? 'not_found' : (o?.state ?? 'error') }
    },

    /**
     * ⭐⭐⭐ STEER — influence work that is already in flight.
     *
     * ⭐ Ote: steering is broader than correction. Legitimate reasons include ADDING a requirement,
     * correcting direction, clarifying scope, changing priority, adding a constraint, or responding to
     * something newly discovered. ⓘ And the DOMINANT case originates on HER side — *"Ote just told me
     * something that changes the job"* — which needs no progress observation at all.
     *
     * ⛔⛔ A STEER NEVER CREATES L3. That she instructed the counterpart is HER action; their eventual
     * result stays something she may subsequently COLLECT. ⇒ `direction: 'out'`, always — and migration
     * 024's CHECK makes the opposite impossible rather than merely discouraged.
     *
     * ⚠⚠ IT DOES NOT GATE ON `peek`, AND THAT IS DELIBERATE. A derived world is only as fresh as the
     * last observation; the run may have finished since. ⇒ **attempt, then let the OUTCOME re-derive the
     * world.** Do not store a conclusion — act, and record what actually happened.
     *
     * ⭐⭐ AND EVERY FAILURE IS FREE LIVENESS INFORMATION. A 409 proves they are alive and not running
     * this work; a 404 proves they no longer know it; a timeout proves nothing except that we could not
     * reach them. ⛔ None of these is "an error" — each is an OBSERVATION, and each is written as one.
     */
    async steer(exchangeId, text) {
      const ex = await store.findById(exchangeId, user.id)
      if (!ex) return { ok: false, reason: 'no such exchange' }

      const said = String(text ?? '').trim()
      if (!said) return { ok: false, reason: 'a steer needs something to say' }

      const dest = resolveDestination(ex.destination)
      const binding = dest && bindingFor(dest)
      const caps = binding?.capabilities?.() ?? {}

      // ⛔⛔ EXPLICIT REFUSAL, NEVER EMULATION. A destination that cannot be steered is told so — it is
      // ⛔ NOT emulated as stop-then-re-brief, which would discard work in flight and quietly become a
      // DIFFERENT exchange. Same rule as every other mode in this Feature.
      if (!caps.steerable) {
        return {
          ok: false,
          reason: `${dest?.display || ex.destination} cannot be steered once work has started. `
            + 'You could wait for them to finish, or start again with a fuller brief.',
        }
      }
      if (!ex.remoteWorkId) return { ok: false, reason: 'there is no detached work to steer' }

      const t0 = Date.now()
      let outcome = 'error'
      let observation = null
      try {
        const r = await binding.steer(ex.remoteWorkId, said)
        outcome = r?.outcome ?? 'error'
        // ⭐ THE OUTCOME IS ALSO AN OBSERVATION. ⛔ `refused_not_running` maps to `refused`, NOT to
        // `unreachable`: they answered us, so they are demonstrably up.
        observation = outcome === 'accepted' || outcome === 'declined'
          ? { contactResult: 'heard', heardState: 'running' }
          : outcome === 'refused_not_running' ? { contactResult: 'refused' }
            : outcome === 'not_found' ? { contactResult: 'not_found' }
              : { contactResult: 'error' }
      } catch (e) {
        outcome = 'unreachable'
        observation = { contactResult: 'unreachable', note: String(e?.message ?? '').slice(0, 200) }
      }

      // ⛔ RECORDED WHATEVER HAPPENED — including a refusal. Measured against Hermes `64a6f42c`: a
      // refused steer left `status`, `last_event` AND `updated_at` byte-identical. ⇒ **our row is the
      // only record that will ever exist that she tried.**
      const turn = await store.addTurn(ex.id, {
        direction: 'out', content: said, kind: 'steer', outcome,
        latencyMs: Date.now() - t0, attested: false,
      })
      if (observation) {
        await store.recordObservation(ex.id, { ...observation, askedHow: 'probe', latencyMs: Date.now() - t0 })
      }

      const latest = await store.latestObservation(ex.id)
      const turns = await store.turns(ex.id)
      const derived = deriveWorld({
        exchange: ex, latest, inboundTurns: turns.filter((x) => x.direction === 'in').length,
      })

      // ⭐ A STEER THAT ARRIVED TOO LATE IS NOT AN ERROR — it is news that the work is over, and the
      // honest next act is to go and get it. ⛔ Reporting "your steer failed" would be true about the
      // mechanism and misleading about the relationship.
      return {
        ok: outcome === 'accepted',
        exchangeId: ex.id,
        outcome,
        turnOrdinal: turn.ordinal,
        ...derived,
        note: outcome === 'accepted'
          ? 'They have it and are still working — this is not an answer yet.'
          : outcome === 'declined' ? 'They took the message and chose not to act on it.'
            : outcome === 'refused_not_running'
              ? 'They are there, but that work is no longer running — see what state it is in.'
              : outcome === 'not_found' ? 'They no longer have that work at all.'
                : 'They could not be reached just now.',
      }
    },

    /**
     * ⭐⭐⭐ ABANDON — **hers, explicitly.** ⛔ Never a timeout, never inferred from silence.
     *
     * ⚠⚠ SILENCE IS THE ONE THING ALL FOUR FAILURE WORLDS HAVE IN COMMON — unreachable, swept,
     * blocked-and-ignored and still-thinking-slowly are indistinguishable from absence alone. ⓘ A
     * 68-minute run sat apparently idle for six-minute stretches while working perfectly. ⇒ no clock may
     * ever close an exchange; the layer's job is to make the evidence legible and let HER decide.
     * ⛔ The reason is REQUIRED, and the schema refuses the row without it: an ending nobody can audit is
     * not an act, it is a disappearance.
     */
    async abandon(exchangeId, reason) {
      const ex = await store.findById(exchangeId, user.id)
      if (!ex) return { ok: false, reason: 'no such exchange' }
      const why = String(reason ?? '').trim()
      if (!why) return { ok: false, reason: 'abandoning needs a reason — say what you observed' }
      const done = await store.abandon(ex.id, why.slice(0, 500))
      return { ok: true, exchangeId: done.id, state: done.state, reason: why }
    },

    /** Her unfinished exchanges — so "did Aunt Hermes come back to me?" is answerable. */
    async unfinished() {
      return (await store.listUnfinished(user.id)).map((e) => ({
        exchangeId: e.id, destination: e.destination, mode: e.mode, state: e.state, openedAt: e.openedAt,
      }))
    },

    _store: store,   // tests only
    _compose: composePresentation,
  }
}
