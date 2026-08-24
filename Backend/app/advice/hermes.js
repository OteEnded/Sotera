// THE HERMES BINDING — and it is the ONLY file in this Feature that knows Hermes exists.
//
// ⭐⭐⭐ Ote, 2026-08-24: *"Hermes should remain just the first counterpart implementation. Nothing in the
// generic architecture should become Hermes-specific because of what we discovered here."*
// ⇒ everything Hermes-shaped lives below this line: endpoint names, the run state vocabulary, the session
// concept, the key, the port. ⛔ Nothing above it may import from this file except through the transport
// contract it returns.
//
// ── ⭐⭐ THE TWO INTERFACES, AND THEY ARE NOT INTERCHANGEABLE (measured 2026-08-24) ──────────────────
//   converse → POST /api/sessions/{id}/chat
//              ⭐ Hermes loads the relationship's history HERSELF (`_conversation_history_for_session`).
//              ⛔ Request-bound: the streaming sibling explicitly interrupts the agent on client
//                 disconnect, so the work IS the request.
//              ✅ Returns `runtime: {provider, model}` — the model that actually answered.
//   delegate → POST /v1/runs
//              ⭐ A DETACHED task: 202 + `run_id` in ~5 ms, and the run survives the caller.
//              ⛔⛔ It NEVER reads the session's history — verified in source at the installed version
//                 AND upstream 386 commits ahead. A run WRITES INTO a session; it does not think within
//                 one. This is why `delegate` requires a self-contained brief.
//              ⛔ Reports no `runtime`; `model` is the virtual name `hermes-agent`.
//
// ⛔⛔ THE FORBIDDEN FIX. `/v1/runs` accepts a `conversation_history` array, so we COULD read her
// transcript and feed it back. We must not. That would make Sotera the manager of Aunt Hermes's context —
// deciding what she remembers and when to compact. Owning her context is owning her cognition.

const DEFAULT_BASE = 'http://127.0.0.1:8642'

/** Refuse any URL that is not exactly the configured host:port. Tighter than a general fetch, by design. */
function assertAllowed(base, url) {
  const b = new URL(base)
  const u = new URL(url)
  if (u.protocol !== b.protocol || u.hostname !== b.hostname || u.port !== b.port) {
    throw new Error(`hermes binding: refusing a request outside the allowlist (${b.host})`)
  }
}

export function createHermesBinding({ config, destination }) {
  const base = (destination?.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
  // ⛔ Never logged, never returned, never put in an error message.
  const key = destination?.key || config?.advice?.hermesKey || process.env.API_SERVER_KEY || ''

  async function call(method, path, body, timeoutMs = 30_000) {
    const url = base + path
    assertAllowed(base, url)
    const res = await fetch(url, {
      method,
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    let json = null
    try { json = await res.json() } catch { /* empty or non-JSON body */ }
    return { status: res.status, json }
  }

  return {
    id: 'hermes',

    /**
     * ⭐ What this destination can actually do. The Host Service reads ONLY this — never the endpoint
     * names — so a destination that cannot do something says so instead of being special-cased upstream.
     */
    capabilities() {
      return {
        converse: true,
        delegate: true,
        // ⭐ converse carries the relationship's context because SHE loads it; delegate does not, and no
        // amount of effort on our side may change that (see the header).
        contextOnConverse: true,
        contextOnDelegate: false,
        awaitsInput: true,        // she can pause mid-work to ask us something
        cancellable: true,        // ⚠️ cooperative: "an unbounded window" in her own words
        attestable: true,         // we hold her verbatim reply either way
        reportsModel: { converse: true, delegate: false },
      }
    },

    /** Resolve one AUTHORIZED session. ⛔ There is deliberately no list() — the Feature never enumerates. */
    async resolveSession(sessionId) {
      const { status, json } = await call('GET', `/api/sessions/${encodeURIComponent(sessionId)}`)
      if (status === 404) return { ok: false, reason: 'not_found' }
      if (status >= 300) return { ok: false, reason: `http_${status}` }
      const s = json?.session || {}
      return { ok: true, session: { id: s.id, title: s.title ?? null, messageCount: s.message_count ?? null } }
    },

    /** CONVERSE — synchronous by nature, because this is the interface where she owns the context. */
    async converse({ sessionId, message, preamble, timeoutMs = 300_000 }) {
      const t0 = Date.now()
      const { status, json } = await call(
        'POST', `/api/sessions/${encodeURIComponent(sessionId)}/chat`,
        { message, ...(preamble ? { system_message: preamble } : {}) }, timeoutMs,
      )
      if (status === 503) return { outcome: 'refused', reason: 'destination at capacity' }
      if (status >= 300) return { outcome: 'failed', reason: `http_${status}` }
      const rt = json?.runtime || {}
      return {
        outcome: 'completed',
        text: json?.message?.content ?? '',
        latencyMs: Date.now() - t0,
        // ⭐ The one interface that tells us who actually answered.
        model: rt.model ? `${rt.provider || '?'}/${rt.model}` : null,
      }
    },

    /** DELEGATE — returns a handle, not an answer. The run outlives this call. */
    async delegate({ sessionId, brief, preamble }) {
      const { status, json } = await call('POST', '/v1/runs', {
        input: brief,
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(preamble ? { instructions: preamble } : {}),
      })
      if (status === 503) return { outcome: 'refused', reason: 'destination at capacity' }
      if (status >= 300 || !json?.run_id) return { outcome: 'failed', reason: `http_${status}` }
      // ⭐ Returned as a neutral `handle`: 'run' is this binding's word and stops here.
      return { outcome: 'pending', handle: json.run_id }
    },

    /**
     * Observe a delegated run. ⭐ Maps Hermes's vocabulary onto the generic states HERE, so nothing
     * above this file ever sees `waiting_for_approval` or `stopping`.
     */
    async observe(runId) {
      const { status, json } = await call('GET', `/v1/runs/${encodeURIComponent(runId)}`)
      if (status === 404) return { state: 'failed', reason: 'run_not_found' }
      if (status >= 300) return { state: 'failed', reason: `http_${status}` }
      const MAP = {
        queued: 'pending', running: 'running', waiting_for_approval: 'awaiting_input',
        stopping: 'cancelling', completed: 'completed', failed: 'failed', cancelled: 'cancelled',
      }
      const state = MAP[json?.status] || 'running'
      return {
        state,
        text: state === 'completed' ? (json?.output ?? '') : null,
        // ⭐⭐ DELIBERATELY NO MODEL. The run object reports the virtual name `hermes-agent` and carries no
        // `runtime`. Passing that up — or substituting the session's configured model — would be
        // provenance inflation. The Host Service records `model_source: 'unavailable'` and the database
        // refuses any attempt to claim otherwise.
        model: null,
      }
    },

    /** ⚠️ Cooperative. `cancelling` may never settle, and the caller must not assume it does. */
    async cancel(runId) {
      const { status } = await call('POST', `/v1/runs/${encodeURIComponent(runId)}/stop`, {})
      return { ok: status < 300 }
    },
  }
}
