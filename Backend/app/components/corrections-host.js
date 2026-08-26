// ⭐⭐⭐ CORRECTIONS — the host service behind `recall_corrections`. B2's other half.
//
// Ote, 2026-08-26: *"If a memory has been contradicted, it should stay in the system and remain
// available behind an explicit historical/why gate, but it should not participate in normal retrieval as
// a current truth. I don't want us relying on Sotera correctly interpreting a prose marker."*
//
// ⇒ the EXCLUSION lives in the store's WHERE clauses (`NOT_CONTRADICTED`); this file is the GATE.
//
// ── ⛔ WHAT IT RETURNS, AND WHAT IT REFUSES TO RETURN ──────────────────────────────────────────────
// ⭐ It returns the belief AS IT WAS STATED — untouched, because *"I used to think Rome was a project"*
// is true and worth keeping — plus **when** it was contradicted and **which message** did it, so she can
// go and read what was actually said instead of taking the record's word for it.
// ⛔ It does not return the message CONTENT. Following that pointer goes through
// `recall_memory_source`, which authorizes the evidence separately from the memory — the same rule the
// lesson references follow: *a memory being yours does not make its evidence yours.*
// ⛔ It does not rank, score, re-interpret or explain. What the correction MEANT is hers to work out.
//
// ── ⚠️ AND IT IS SCOPED LIKE EVERY OTHER READ ─────────────────────────────────────────────────────
// The store decides what "mine" means; this file passes no room and no persona. A correction spoken in
// one room must not surface a belief formed in another.

import { registerHostService } from './runtime.js'
import { buildMemoryStoreFor } from './memory-v2-host.js'

/**
 * @returns {{ listCorrections: Function, countCorrections: Function }}
 */
export function buildCorrections(fastify, { userId = null } = {}) {
  const store = buildMemoryStoreFor(fastify, { userId })

  return {
    async listCorrections({ limit = 20 } = {}) {
      const rows = await store.listContradicted({ limit })
      return {
        count: rows.length,
        // ⭐ THE SHAPE IS DELIBERATELY NOT A MEMORY'S SHAPE. A memory read returns `{content, …}` and
        // reads as current knowledge; this returns `usedToThink`, so the payload itself says what kind
        // of thing it is. ⛔ The framing must not depend on her noticing a flag.
        corrections: rows.map((r) => ({
          id: r.id,
          usedToThink: r.content,
          contradictedAt: r.contradicted_at,
          // The pointer, not the content. `recall_memory_source` authorizes reading it.
          contradictedByMessageId: r.contradicted_by_message_id ?? null,
          // Where the belief itself came from, so *"why did I believe that?"* has an answer.
          learnedFrom: r.source_message_id ?? null,
          writtenAt: r.created_at,
        })),
        note: 'These are beliefs you no longer hold. Say that you used to think them and what changed — '
          + 'never answer a question about what is true now from one of these.',
      }
    },

    /** ⭐ The COUNT, for surfaces that need to say something exists without showing it. */
    countCorrections: () => store.countContradicted(),
  }
}

/** Register at boot, per request, exactly like `ownMemory` and `intention`. */
export function initCorrections() {
  registerHostService('corrections', ({ fastify: f, user }) => buildCorrections(f, { userId: user?.id ?? null }))
}
