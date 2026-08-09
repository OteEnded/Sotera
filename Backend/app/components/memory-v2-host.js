// Persona Memory v2 — host wiring. Builds a per-request v2 memory service bound to (persona, user)
// with a real embedder over the platform gateway. This is the seam the chat route (and, later, the
// Context Composer + the portable memory tools) use to reach v2.

import { createMemoryV2Service } from './memory-v2-service.js'
import { makeEmbedder } from './memory-embed.js'
import { rowsBySlotIndex } from './memory-slot-resolver.js'
import { buildSlotResolver } from './memory-resolver-host.js'

// Until Personas are first-class (Milestone B) the chat site runs one default persona → null.
// null persona + null user = the platform/root scope; a real user id scopes per-(persona, user).
export const DEFAULT_PERSONA = null

// `self` = the authenticated user's own identity labels ({ username, displayName }) so the service can
// canonicalize "facts about me" to ONE owner regardless of how the model/extractor names the user.
// `actor` labels the memory AUDIT TRAIL (log_memory_changes): who caused a belief to change. The
// distinction that matters on read is model vs person vs background job — "the nightly pass archived it"
// and "you asked me to forget it" are different answers to "where did my fact go?". Callers that know
// better should say so ('model' from a tool call, 'system:decay' from cron); the default is honest about
// not knowing rather than guessing.
export function buildMemoryV2(fastify, { userId = null, persona = DEFAULT_PERSONA, sourceMessageId = null, self = null, actor = null } = {}) {
  const embed = makeEmbedder(fastify, { userId })
  // RESOLUTION comes from the host so the CHAIN is assembled from settings (cosine → gray-zone → …).
  // With `memory.resolver.grayZoneMode` off (the default) this is exactly the cosine resolver: no added
  // cost, no behaviour change. See memory-resolver-host.js / RFC §15.
  const slotResolver = buildSlotResolver(fastify, { embed, loadIndex: rowsBySlotIndex, userId })
  return createMemoryV2Service({ db: fastify.db, embed, persona, userId, sourceMessageId, log: fastify.log, self, slotResolver, actor })
}
