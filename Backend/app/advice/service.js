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
