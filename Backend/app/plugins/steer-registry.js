// ⭐⭐⭐ "IS SOTERA BUSY RIGHT NOW?" — SHARED RUNTIME STATE, AND THEREFORE A ROOT PLUGIN.
//
// Ote, 2026-08-26: *"Take option 2 — move steerReg into its own root plugin. 'Is Sotera busy?' is shared
// runtime state, so it should be a first-class service rather than belonging to the chat route."*
//
// ── ⚠️⚠️ THE MEASURED FAILURE THIS EXISTS TO END ─────────────────────────────────────────────────
// The registry used to be created inside `chat-site.route.js` and decorated from there. That module is
// `export default async function chatSiteRoutes(fastify)` — **encapsulated** — so the decoration landed
// on a CHILD scope. `cron.js` is `fp`-wrapped at ROOT, so `fastify.steerReg` was `undefined` there.
//
// ⇒ ⭐ **A child's decoration is invisible to a sibling**, and the reflection lane's idle gate read
// `undefined`, failed CLOSED — correctly — and **stopped a live background lane for 28 hours in
// silence.** 96 conversations were eligible; zero attempts were made. The gate shipped 2026-08-25 16:04
// and the lane's last attempt was 4½ hours earlier.
//
// ⚠️ Nothing was broken. The route worked, the gate worked, the config was fine. The two halves simply
// could not see each other, and the only symptom was a log line naming the wrong cause.
//
// ── ⭐⭐ WHY A PLUGIN RATHER THAN `fp`-WRAPPING THE ROUTE ────────────────────────────────────────
// Wrapping the route would have made EVERY decoration and hook in that 3,900-line module root-visible to
// fix one object — the widest possible blast radius for the narrowest possible need. ⛔ And handing the
// registry to the cron explicitly would create a second reference to one object, which the gate's own
// comment warns against: *"the gate must read the same object the route writes, or the two drift about
// whether a turn is running."*
//
// ⇒ ⭐ The registry is not route state. It answers a question about the WHOLE RUNTIME — *is a user turn
// in flight anywhere* — and every other thing of that kind here (`db`, `cronManager`, `ws`) is already a
// root plugin. `steerReg` was the only one attempted from a route scope, and the only one a sibling
// needed to read. **The boundary follows the guarantee: shared state lives where every scope can reach it.**
//
// ── ⛔ WHAT DID NOT CHANGE ──────────────────────────────────────────────────────────────────────
// ⛔ ONE registry, exactly as before. This moves WHERE it is created, not how many exist.
// ⛔ No behaviour in the steer path. The route reads `fastify.steerReg` instead of a local const; the
//    endpoint, the agent loop's drain points and the ref-counted begin/end are untouched.

import fp from 'fastify-plugin'
import { createSteerRegistry } from '../chat/steer-registry.js'

export default fp(async function steerRegistryPlugin(fastify) {
  // ⚠️ GUARDED, because a harness can register the app more than once and `decorate` throws on a
  // duplicate key. ⛔ It must stay a no-op on the second call rather than minting a second registry —
  // two registries tracking one turn lifecycle is the drift Ote refused when he chose one source of truth.
  if (!fastify.hasDecorator('steerReg')) fastify.decorate('steerReg', createSteerRegistry())
}, { name: 'steer-registry' })
