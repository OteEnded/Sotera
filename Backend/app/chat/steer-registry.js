// Steering registry — the server side of "nudge the in-flight reply".
//
// A STEER is a mid-generation user message the running assistant turn reacts to
// (Claude-Code style). B1 folded it in at the next round boundary; B2 goes further:
// the loop peeks `hasPending` between streamed events and CUTS the in-flight provider
// round (keeping the partial text as a segment), so the reply reacts immediately —
// the user's Stop remains the only outright cancel. This registry is the hand-off
// between the `POST /chat/conversations/:id/steer` endpoint (producer) and the agent
// loop in streamReply (consumer). In-memory + per-conversation, live only while a
// generation runs for that conversation.
//
// Concurrency: Node runs this single-threaded — the endpoint handler only runs between
// the loop's `await` points, so add()/take() never truly overlap. begin()/end() are
// REF-COUNTED because a user can (rarely) have two generations on one conversation at
// once (e.g. send + regenerate within the window); the inbox is shared and only torn
// down when the last generation ends, so one finishing can't strand the other.

export function createSteerRegistry() {
  const byConvo = new Map() // convoId -> { steers: string[], count: number, gens: number }

  return {
    // a generation for this conversation has started accepting steers
    begin(convoId) {
      const e = byConvo.get(convoId)
      if (e) { e.gens++; return }
      byConvo.set(convoId, { steers: [], count: 0, gens: 1 })
    },

    // a generation ended — drop the inbox once no generation is left
    end(convoId) {
      const e = byConvo.get(convoId)
      if (!e) return
      e.gens--
      if (e.gens <= 0) byConvo.delete(convoId)
    },

    // is a generation currently accepting steers for this conversation?
    isActive(convoId) {
      return byConvo.has(convoId)
    },

    // enqueue a steer. `maxSteers` caps the TOTAL steers per reply (count never resets
    // until the generation ends), so a user can't drive an unbounded continuation loop.
    // -> { ok: true } | { error: 'not_generating' | 'too_many_steers' }
    add(convoId, text, maxSteers) {
      const e = byConvo.get(convoId)
      if (!e) return { error: 'not_generating' }
      if (e.count >= maxSteers) return { error: 'too_many_steers' }
      e.count++
      e.steers.push(text)
      return { ok: true }
    },

    // peek: is a steer waiting? The loop checks this between streamed events (B2 —
    // mid-token interrupt) so it can cut the in-flight round without draining here.
    hasPending(convoId) {
      const e = byConvo.get(convoId)
      return Boolean(e && e.steers.length)
    },

    // drain pending steers (the loop calls this at each round boundary). Returns [] if none.
    take(convoId) {
      const e = byConvo.get(convoId)
      if (!e || !e.steers.length) return []
      const out = e.steers.slice()
      e.steers = []
      return out
    },
  }
}
