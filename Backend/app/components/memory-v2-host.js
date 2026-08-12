// Persona Memory v2 — host wiring. Builds a per-request v2 memory service bound to (persona, user)
// with a real embedder over the platform gateway. This is the seam the chat route (and, later, the
// Context Composer + the portable memory tools) use to reach v2.

// ⚠️ THIS FILE IS THE HOST HALF, and after RFC step 1b it is where the database stops. It assembles the
// three adapters the cognition needs and hands them over; `fastify.db` must not travel past this line.
import { createMemoryV2Service } from './memory-v2-service.js'
import { createSequelizeMemoryStore } from './memory-store-sequelize-host.js'
import { createSlotStore } from './memory-slot-store-host.js'
import { logMemoryChange, snapshot } from '../audit/memory-log.js'
import { makeEmbedder } from './memory-embed-host.js'
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
  const log = fastify.log

  // THE THREE ADAPTERS, and each one's guarantee if it were absent (Ote's rule for where a seam goes):
  //   store     REQUIRED — memory is broken without it. Owns scope + every query.
  //   slotStore OPTIONAL — absent means facts write with slot_id null, as before Phase 6.
  //   auditLog  OPTIONAL — absent means beliefs still change, the trail is missing.
  const store = createSequelizeMemoryStore({ db: fastify.db, persona, userId, log })
  const slotStore = createSlotStore({ db: fastify.db, persona, userId, log })
  // Bind the writer to THIS host's storage. The cognition calls `auditLog(entry)` and never learns that
  // a database was involved. ⚠️ It used to call `logMemoryChange(db, …)` directly with a `db` the
  // factory no longer receives — syntactically valid, ReferenceError at runtime, inside a swallowing
  // try. The audit trail would have stopped silently, which is the incident memory-log.js exists for.
  //
  // ⚠️ THE HOST PROJECTS `before`, NOT THE COGNITION. The service used to call
  // `snapshot(row)` itself, importing it from ../audit/memory-log.js — the LAST reach across the seam
  // after step 1b, and a real one: it made the component depend on the host's audit module to describe
  // its own belief. It now hands over the raw row and the writer decides what is worth persisting,
  // which is where a persistence decision belongs. (`after` is always a plain object built by the
  // cognition — a description of the CHANGE, not of a row — so it is passed through untouched.)
  const auditLog = (entry) => logMemoryChange(fastify.db, {
    ...entry,
    ...(entry?.before ? { before: snapshot(entry.before) } : {}),
  })

  return createMemoryV2Service({
    store, slotStore, auditLog,
    embed, persona, userId, sourceMessageId, log, self, slotResolver, actor,
  })
}
