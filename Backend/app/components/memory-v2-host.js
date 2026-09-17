// Persona Memory v2 — host wiring. Builds a per-request v2 memory service bound to (persona, user)
// with a real embedder over the platform gateway. This is the seam the chat route (and, later, the
// Context Composer + the portable memory tools) use to reach v2.

// ⚠️ THIS FILE IS THE HOST HALF, and after RFC step 1b it is where the database stops. It assembles the
// three adapters the cognition needs and hands them over; `fastify.db` must not travel past this line.
import { createMemoryV2Service } from '@ote/memory/cognition/memory-v2-service.js'
import { createSequelizeMemoryStore } from './memory-store-sequelize-host.js'
import { createSlotStore } from './memory-slot-store-host.js'
import { logMemoryChange, snapshot } from '../audit/memory-log.js'
import { makeEmbedder } from './memory-embed-host.js'
import { rowsBySlotIndex } from '@ote/memory/cognition/memory-slot-resolver.js'
import { buildSlotResolver } from './memory-resolver-host.js'
import { admitCandidates } from './memory-admission-gate.js'
import { projectAdmissionFacts } from './memory-admission-read.js'

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
// ⭐⭐ `author` — WHOSE WRITE THIS IS, AND IT FOLLOWS THE OCCASION RATHER THAN THE TOOL.
// Migration 015 put the ownership axis on the table and `createSequelizeMemoryStore` has taken an `author`
// since; this factory never passed one, so EVERY write through it was 'account' — the axis existed and no
// caller could reach it. (`save_lesson` sidesteps this with its own INSERT, which is why lessons are the
// only persona-authored rows.)
//
// ⭐ The rule the reflection lifecycle establishes: a tool call in an ordinary turn is a response to a
// person speaking, so 'account' is right; a tool call in a REFLECTION is her own decision about what to
// carry forward, so 'persona' is right — for the same tool, the same content, the same room. Authorship is
// a property of the occasion. ⛔ It is declared by the caller and never inferred from kind, room, or login.
// ⚠️ Default stays 'account': six times in this project an omitted field has silently changed meaning, so
// a caller that does not say gets the status quo and nothing can drift into being hers.
/**
 * ⭐ THE STORE ALONE, for readers that need a scoped query and none of the cognition.
 *
 * ⚠️ ADDED 2026-08-26 FOR `corrections-host.js`, and deliberately NOT by making the service expose its
 * store: handing the store out through `buildMemoryV2` would let any consumer reach past the cognition
 * into the database, which is the seam this file exists to hold. A caller that genuinely wants a query
 * and no beliefs asks for a store; everyone else keeps getting a service.
 *
 * ⛔ `author` is not a parameter. This is a READ construction — nothing built here may write, and
 * accepting an author would imply it could.
 */
export function buildMemoryStoreFor(fastify, { userId = null, persona = DEFAULT_PERSONA } = {}) {
  return createSequelizeMemoryStore({ db: fastify.db, persona, userId, log: fastify.log })
}

export function buildMemoryV2(fastify, { userId = null, persona = DEFAULT_PERSONA, sourceMessageId = null, self = null, actor = null, author = 'account', scope = 'room', sourceText = null, occasion = null, writer = null, act = null, reach = null } = {}) {
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
  // ⭐ 035 · `scope` rides beside `author` — declared once by the caller that knows the occasion, never
  // a per-row field. `config` goes with it because the store DERIVES root-ness itself rather than being
  // told: an authority handed in as a parameter is an authority a caller can get wrong.
  // ⭐ `occasion` is the TURN KEY, declared once beside `author`/`scope`/`sourceText`. ⓘ On this path the
  // row carries it too (`reconcileFact` stamps `source_message_id` from the same constant), so this is
  // the store's fallback for a write that has no row-level turn — ⛔ never a way to override one.
  // ⭐ 049 · the four axes travel with the construction: WRITER (contract key) · ACT (occasion) · REACH (material).
  const store = createSequelizeMemoryStore({ db: fastify.db, persona, userId, author, scope, sourceText, occasion: occasion ?? sourceMessageId, writer, act, reach, config: fastify.config, log })
  // ⭐ A3 · the slot store now receives the ACT too. An alias is asserted by `WRITER.resolver` (a fixed actor,
  // so it is not passed) on THIS write's occasion (which only the caller knows). ⛔ Absent ⇒ it refuses to teach
  // rather than teaching anonymously — `WRITER.resolver` is `pass: false`.
  const slotStore = createSlotStore({ db: fastify.db, persona, userId, log, act })
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
  // ⭐ 049 · every audit row carries the ACT of the change (M7) — the audit trail is never the one place acts stay anonymous
  const auditLog = (entry) => logMemoryChange(fastify.db, {
    ...entry,
    act: entry?.act ?? act ?? null,
    ...(entry?.before ? { before: snapshot(entry.before) } : {}),
  })

  // ══ ⭐⭐⭐ THE ADMISSION PORT (A-D4/A-D5 · A — ACCEPT) ══════════════════════════════════════════════
  //
  // ⭐ THE HOST HALF resolves the INCUMBENT'S OWN pin to a question key; the VERDICT is decided by the PURE
  // gate. ⛔ The lookup is the only IO, and it fails CLOSED (`admissionKeysFor` returns an empty map), so a
  // broken lookup reads as NOT ESTABLISHED ⇒ DEFER ⇒ nothing competes.
  //
  // ⛔⛔ THE VACUITY TRAP, GUARDED BY CONSTRUCTION AND VISIBLE AT THIS SEAM: `incomingQuestionKey` comes
  // from `claimKind` — the caller's own declaration — and `incumbentKeyById` comes from the ROWS' pins.
  // ⛔ NEITHER IS DERIVED FROM THE OTHER, and neither comes from the resolved slot. Deriving the incoming's
  // side from the incumbent's would make the comparison trivially true and the gate would ALWAYS ADMIT.
  const admitCompetition = async ({ candidates = [], claimKind = null } = {}) => admitCandidates({
    candidates,
    incomingQuestionKey: claimKind,                        // ⭐ the CLAIM's own declaration. ⛔ never a row.
    incumbentKeyById: await store.admissionKeysFor(candidates), // ⭐ each ROW's own pin. ⛔ never the slot.
  })

  // ⭐⭐⭐ THE READ-SIDE PROJECTION (ruled 2026-09-17) — the HOST owns the ledger, the PURE module owns
  // the semantics, and ⛔ neither of them owns a presentation policy.
  //
  // ⛔⛔ THE FOUR STATES STAY FOUR. `projectAdmissionFacts` reports only pairs it actually has on record;
  // a pair with no row is answered by `verdictBetween` as **NO-RECORDED-VERDICT**, which is ⛔ NOT a DEFER.
  // ⚠️ A DEFER means an evaluation HAPPENED and could not establish the warrant. An absent row means no
  // such evaluation is recorded. ⛔ Collapsing them would manufacture an act that never occurred.
  const admissionFacts = async ({ ids = [] } = {}) =>
    projectAdmissionFacts(await store.admissionFactsFor(ids), ids)

  return createMemoryV2Service({
    store, slotStore, auditLog,
    embed, persona, userId, sourceMessageId, log, self, slotResolver, actor,
    admitCompetition, admissionFacts,
  })
}
