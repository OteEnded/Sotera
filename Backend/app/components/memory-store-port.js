// THE MEMORY STORE PORT — the one seam between memory COGNITION and memory PERSISTENCE.
//
// RFC_MEMORY_AS_COMPONENT step 1. The cognition above this line becomes a portable Memory-kind
// component; everything below it is one host's business.
//
// ── WHY THIS IS DOMAIN-SHAPED AND NOT VERB-SHAPED ────────────────────────────────────────────────
// ⚠️ THE RFC FIRST SAID "SIX METHODS" AND THAT WAS WRONG. I counted the SEQUELIZE VERBS the service
// calls — create / findAll / findOne / update / increment / getSource — and called that the contract.
// A verb-shaped port looks smaller and is not a port at all: every one of those verbs takes a `where`,
// so the caller keeps composing queries. That drags Sequelize's `Op` across the boundary, and worse it
// drags SCOPING — `persona`, `user_id`, the identity-is-persona-global rule — into the component.
//
// Ote's requirement is what makes that fatal: *"it really the 'Portable component' that can work with
// many persona."* Pareto/OteLLMServices hosts many personas and scopes by a `persona` column; Sotera is
// one persona per schema. A component that composes its own WHERE has already chosen one of them.
//
// ⇒ **SCOPE IS THE STORE'S BUSINESS. The component never says `persona`, never says `user_id`.** It says
// what it wants — "the live facts I can see", "the nearest neighbours to this vector" — and the store
// decides what "I" means. That single rule is what lets one component serve both hosts, and it is why
// the port is eleven domain operations rather than six generic ones.
//
// ── THE SCOPE, STATED ONCE SO NO IMPLEMENTATION HAS TO GUESS ─────────────────────────────────────
// A store is constructed bound to a subject (host's choice of persona/user/tenant). Within that binding
// every read below means: rows this subject can see, LIVE only (not invalidated, not expired), UNION the
// persona-global identity rows — which belong to the persona, not to any user, and are the one place a
// null owner is correct. `listArchived` is the sole exception: it deliberately returns the dead.
//
// ⚠️ Two things that look like scope but are COGNITION, and must never move into a store: the relevance
// floor (which candidates are good enough) and reconcile (which row occupies a slot). A store that
// filters by relevance has started making the decisions this split exists to protect.

/**
 * @typedef {Object} MemoryRow  A stored memory, plain data — never an ORM instance.
 * @property {string}  id
 * @property {string}  kind             'episodic' | 'semantic' | 'identity' | 'card'
 * @property {string}  [namespace]
 * @property {string}  [content]
 * @property {string}  [entity] @property {string} [attribute] @property {string} [value]
 * @property {number}  [importance] @property {number} [confidence]
 * @property {boolean} [pinned] @property {string} [tier]
 * @property {number[]|null} [embedding]
 * @property {string|null}   [slot_id]
 * @property {string|null}   [source] @property {string|null} [source_message_id]
 * @property {Date|null}     [invalid_at] @property {Date|null} [expired_at]
 * @property {Date}          [created_at] @property {Date|null} [last_access]
 * @property {number}        [access_count]
 */

/**
 * @typedef {Object} MemoryStore
 *
 * ── READS ──────────────────────────────────────────────────────────────────────────────────────
 * ⚠️ TWO SCOPES, AND THE DISTINCTION IS DOMAIN, NOT SQL. Measured across every call site in the 902-line
 * service: recall wants everything the user can SEE (their rows ∪ the persona-global identity rows);
 * reconcile, episode clustering and card matching all want only what the user OWNS. Those are different
 * questions, so they are different methods. My first draft of this port guessed one `findLive` plus a
 * speculative `findSlot`, and reading the code collapsed four guesses into these two.
 *
 * @property {(opts?: {kind?: string|string[], namespace?: string}) => Promise<MemoryRow[]>} findVisible
 *   Live rows this subject can SEE — theirs plus the persona-global identity. Recall candidates.
 * @property {(opts?: {kind?: string, namespace?: string}) => Promise<MemoryRow[]>} findOwnLive
 *   Live rows this subject OWNS, newest-first. Reconcile (semantic), episodeClusters (episodic),
 *   findPriorCard (card). ⚠️ Never includes the persona-global rows — reconciling against a belief the
 *   user does not own would let one user's write displace a persona-wide fact.
 * @property {(id: string) => Promise<MemoryRow|null>} findById
 *   One LIVE row, scope-checked — an id from outside the scope must read as absent, not as a hit.
 * @property {(id: string) => Promise<MemoryRow|null>} findAnyById
 *   As above but INCLUDING archived rows. Separate on purpose: pin/forget/revive legitimately act on
 *   the dead, and a single method with an `includeArchived` flag is one bad default away from leaking
 *   a forgotten belief into a live prompt.
 * @property {(ids: string[]) => Promise<MemoryRow[]>} findByIds
 *   Rehydrate a ranked id list in one round trip (search returns ids, ranking needs rows).
 * @property {(opts: {slotId?: string|null, entity?: string, attribute?: string}) => Promise<number>} countLiveInSlot
 *   How many live beliefs occupy this slot. The guard that makes un-superseding safe: revive the
 *   displaced belief ONLY if nothing else has taken the slot, so it always holds exactly one.
 *   Prefers slotId; falls back to (entity, attribute) for rows written before the Slot store existed.
 * @property {(opts: {kind?: string, namespace?: string, limit?: number, offset?: number}) => Promise<MemoryRow[]>} listArchived
 *   ⚠️ The ONLY read that returns non-live rows (superseded or forgotten). Without it memory can only
 *   ever LOSE: every other read hides the dead, so a belief that was taken away is indistinguishable
 *   from one never held.
 *
 * ── SEARCH: two arms, because they fail independently ──────────────────────────────────────────
 * @property {(opts: {query: string, kind?: string, namespace?: string, limit?: number}) => Promise<string[]>} lexicalSearch
 *   Ids best-first by full-text rank. ⚠️ Returns [] when the host has no text index — a MISSING
 *   CAPABILITY IS NOT AN ERROR. Recall degrades to the dense arm; it must not throw a turn away.
 * @property {(opts: {qVec: number[], kind?: string, namespace?: string, limit?: number}) => Promise<Map<string, number>|null>} denseRelevances
 *   id → cosine relevance for the nearest in scope. ⚠️ Returns NULL (not an empty Map) when the host
 *   has no vector index — null means "I cannot answer, fall back to in-JS cosine", empty means "I
 *   answered and nothing matched". Collapsing those two is a silently empty recall.
 * @property {(opts: {memoryId: string, context?: number}) => Promise<{message: object, conversation: object, surrounding: object[]}|null>} getSource
 *   Trace a memory to the message it came from, plus neighbours. The only method that reads outside
 *   the memory tables, and the reason provenance can ever be checked rather than asserted.
 *
 * ── WRITES ─────────────────────────────────────────────────────────────────────────────────────
 * @property {(row: Partial<MemoryRow>) => Promise<MemoryRow>} create
 *   The store stamps scope. ⚠️ The component MUST NOT pass persona/user — that is the whole seam.
 * @property {(ids: string[], patch: Partial<MemoryRow>) => Promise<number>} update
 *   By id only, never by predicate: a predicate would be the component composing a query again.
 * @property {(ids: string[]) => Promise<void>} touch
 *   Recency bookkeeping (access_count + last_access). Separate from `update` because it is telemetry,
 *   not a belief change, and a failure here must never fail a read.
 */

/**
 * Every method a MemoryStore must provide. Order = the doc above.
 *
 * ⚠️ THIS LIST IS MEASURED, NOT DESIGNED. The first draft had 12 entries invented from a call-site
 * grep; reading all 902 lines changed five of them. `findLive`+`findSlot` became `findVisible`+
 * `findOwnLive` (two different questions, not one), `count` became `countLiveInSlot` (its only caller
 * asks about slot occupancy), and `findAnyById` appeared because pin/forget/revive act on archived rows.
 * A port guessed from grep output is a port that will need a flag bolted on later.
 */
export const MEMORY_STORE_METHODS = Object.freeze([
  'findVisible', 'findOwnLive', 'findById', 'findAnyById', 'findByIds', 'countLiveInSlot', 'listArchived',
  'lexicalSearch', 'denseRelevances', 'getSource',
  'create', 'update', 'touch',
])

/**
 * Fail LOUDLY and EARLY on an incomplete store, naming what is missing.
 *
 * ⚠️ This exists because of how the alternative fails: an absent method is `undefined`, calling it
 * throws `x.foo is not a function` deep inside a recall, on a path wrapped in best-effort try/catch —
 * so a half-built store degrades into "memory just doesn't remember much" instead of an error. That is
 * the same shape as every other silent-degradation bug in this system's history.
 *
 * @param {object} store @param {string} [label] @returns {object} the store, unchanged
 */
export function assertMemoryStore(store, label = 'MemoryStore') {
  if (!store || typeof store !== 'object') throw new TypeError(`${label}: expected an object, got ${store === null ? 'null' : typeof store}`)
  const missing = MEMORY_STORE_METHODS.filter((m) => typeof store[m] !== 'function')
  if (missing.length) {
    throw new TypeError(`${label} is incomplete — missing ${missing.length} method(s): ${missing.join(', ')}. See memory-store-port.js for the contract.`)
  }
  return store
}
