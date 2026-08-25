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
//
// ── ⭐⭐ THIS REGISTRY NOW SERVES TWO RELATED CONCERNS, AND THEY ARE NAMED ────────────────────────────
//
//   1. MAY THIS CONVERSATION ACCEPT A STEER RIGHT NOW?   `isActive` · `add` · `hasPending` · `take`
//   2. IS SOTERA BUSY WITH AN INTERACTIVE TURN AT ALL?   `anyActive` · `msSinceLastActivity`
//
// Ote, 2026-08-25, choosing this over a second module: *"I prefer one source of truth for activity
// because two registries tracking the same user-turn lifecycle is exactly the kind of drift we've been
// fixing."* ⇒ the second concern is a READ over state the first already maintains — `begin`/`end` are the
// only writers, they already cover every exit path, and nothing new has to be remembered at a call site.
// ⛔ THE ALTERNATIVE WAS WORSE: a separate activity registry means the route must call two things on
// every turn, and the day one call is added without the other they disagree about whether she is busy.
//
// ⚠️⚠️ AND THE SEMANTICS ARE EXPLICIT, BECAUSE THE OBVIOUS READING IS WRONG:
// **an active interaction is NOT the same as a generation in flight.** Someone reading her reply, or
// part-way through a back-and-forth, is still interacting — and starting a background revisit one second
// after her reply lands is still an interruption. ⇒ `anyActive()` is the HARD INTERLOCK (a turn is
// literally running) and `msSinceLastActivity()` feeds a COOL-DOWN that stands in for the part we cannot
// observe. ⛔ We do not detect reading, and this must not be described as if we do: the cool-down is a
// PROXY, chosen because the failure it prevents is cheap to over-prevent and expensive to under-prevent.

export function createSteerRegistry() {
  const byConvo = new Map() // convoId -> { steers: string[], count: number, gens: number }
  // ⭐ THE BASELINE IS PROCESS START, NOT `null`. A fresh process has seen no turns, and reporting that as
  // "infinitely idle" would let a background pass fire the instant Sotera comes up — precisely when a
  // person whose turn just died in the restart is most likely to be typing again. ⇒ uptime IS the honest
  // answer to "how long since anything happened", and it makes the cool-down apply after a restart too.
  let lastActivityAt = Date.now()
  // ⭐ MONOTONIC. Incremented on every interactive turn START; see `interactiveEpoch` below.
  let epoch = 0

  return {
    // a generation for this conversation has started accepting steers
    // ⭐ BOTH EDGES STAMP THE CLOCK. A turn beginning and a turn ending are both "something just
    // happened", and stamping only the end would make a long generation look increasingly idle while it
    // is the single busiest thing the process does.
    begin(convoId) {
      lastActivityAt = Date.now()
      // ⭐⭐ THE PREEMPTION SIGNAL, RAISED THE MOMENT A USER TURN OPENS — before the fold, before the
      // agent loop. ⛔ Never lowered: passive work compares epochs, so an interactive turn that
      // starts and finishes inside one long revisit round is still detected.
      epoch += 1
      const e = byConvo.get(convoId)
      if (e) { e.gens++; return }
      byConvo.set(convoId, { steers: [], count: 0, gens: 1 })
    },

    // a generation ended — drop the inbox once no generation is left
    end(convoId) {
      lastActivityAt = Date.now()
      const e = byConvo.get(convoId)
      if (!e) return
      e.gens--
      if (e.gens <= 0) byConvo.delete(convoId)
    },

    // ── CONCERN 2 · IS SHE BUSY? ────────────────────────────────────────────────────────────────
    // ⭐ THE HARD INTERLOCK. Any conversation, any user — this is deliberately not per-conversation,
    // because the question a background pass asks is "is Sotera occupied", not "is THIS chat occupied".
    anyActive() {
      return byConvo.size > 0
    },

    // How many, for a log line that can distinguish "busy with one" from "busy with four".
    activeCount() {
      return byConvo.size
    },

    // ⭐ Milliseconds since the last turn STARTED OR ENDED — never negative, and never `null`: see the
    // process-start baseline above. ⓘ `now` is injected so the gate stays testable without waiting.
    msSinceLastActivity(now = Date.now()) {
      return Math.max(0, now - lastActivityAt)
    },

    // ── ⭐⭐⭐ CONCERN 3 · PREEMPTION · user interaction has ABSOLUTE priority ──────────────────────
    //
    // Ote: *"Sotera's passive cognition is always interruptible; user interaction is not delayed by it."*
    //
    // ⭐⭐ AN EPOCH, NOT A FLAG, AND THE DIFFERENCE IS A REAL BUG AVOIDED. A boolean "someone arrived"
    // would be cleared by the next `end()` — so a turn that started AND finished entirely inside one
    // long revisit round would raise the flag and lower it again, and the revisit would never notice it
    // had been preempted. A monotonic counter cannot be un-rung: passive work captures the value when it
    // starts and compares later, so ANY interactive turn in between is detected even if it is already
    // over. ⛔ Never reset, never decremented.
    interactiveEpoch() {
      return epoch
    },

    // ⚠️ TEST SEAM ONLY. Lets a check drive the cool-down without sleeping. ⛔ Never called by the route:
    // production activity is stamped by begin/end and nothing else, so there is one writer, not two.
    _setLastActivityForTest(ms) {
      lastActivityAt = ms
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
