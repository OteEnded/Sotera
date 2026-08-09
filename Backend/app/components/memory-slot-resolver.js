// Persona Memory V3 — the SLOT RESOLVER (RFC_MEMORY_SLOT_RESOLVER §6/§8/§8a). Phase 7a.
//
// ONE question: "which conceptual slot does this observation belong to?" That is CLASSIFICATION, not
// pairwise similarity shopping. It does NOT know what facts exist, it does NOT know persistence exists,
// and it never writes.
//
// PHASE 7a — the resolver now reasons about CONCEPTS, not RECORDS (Ote): it receives SLOT DESCRIPTORS
// (slotId, canonicalLabel, aliases, entity, namespace) instead of memory rows, and returns ONE slotId.
// Mapping a slot back to the rows that occupy it is the store's job. This is the real architectural
// consequence of having a Slot store, and it is what makes a learned ALIAS pay off:
//
//     System 2 (expensive verdict) → learned alias → future writes are System 1 (a lexical hit).
//
// WHY the seam exists at all: cosine ranges OVERLAP. On the real embedder a genuinely SAME slot
// ("favorite programming language" ↔ "primary language for coding") scored 0.744 while genuinely
// DIFFERENT slots ("favorite word" ↔ "favorite letter") scored 0.856. No threshold separates them, so
// tuning is a closed dead end — the answer is a better answering STRATEGY behind a stable contract.
// v1 cosine → v2 GrayZoneLlmResolver (an aux LLM only inside the gray band, caching its verdict as an
// alias) → v3 OntologyResolver, with nothing else changing.
//
// DEPS AT CONSTRUCTION, never per call, so the interface stays timeless:
//     interface Resolver { resolve(observation, context) → Resolution }
//
// §8a — the slot EMBEDDING is infrastructure, not domain: it is this resolver's PRIVATE INDEX (like a
// B-tree — rebuildable, disposable). Descriptors therefore carry NO vectors and `Resolution` returns
// none; the index is reached through an injected `loadIndex` port, so a future OntologyResolver can hold
// zero vectors and an alias-only hit costs no embedding at all.

import { cosine } from './memory-rank.js'
import { attributeSimilarity, sameEntity } from './memory-extract.js'

// Two SLOT phrases this close are treated as the SAME slot BY COSINE ALONE — it collapses phrasing the
// lexical arm misses. This is the compiled-in DEFAULT; the live value is `memory.resolver.slotSemThreshold`
// (read in memory-resolver-host.js), because a number this consequential must not be a constant.
//
// ⚠️ 0.85, RAISED FROM 0.80 (2026-08-03). What "deliberately high so adjacent-but-distinct slots don't
// merge" was worth in practice, measured on root's real memory: three bad merges at 0.82, 0.84 and 0.84.
// One of them let "role/association: On Behalf Of (for PR)" — scraped out of a JSON blob pasted for
// formatting help — displace "role: root of Ote's LLM Services platform", importance 10, recalled 109
// times. The measured different-slot HIGH is 0.856 ("favorite word" vs "favorite letter"), so 0.80 sat
// well inside the range where cosine provably cannot separate concepts.
//
// The subtle part, and the reason this was invisible: the gray-zone adjudicator only runs when cosine
// FAILS to resolve. Every one of those merges was above 0.80, so the qualified LLM (0 false merges on the
// held-out corpus) was enabled, resident, and never asked. Raising this to the band ceiling hands that
// 0.80-0.85 slice to the adjudicator instead of deciding it for free and wrong.
export const SLOT_SEM_THRESHOLD = 0.85
export const SLOT_LEX_THRESHOLD = 0.7

/**
 * rowsBySlotIndex — the §8a PRIVATE-INDEX ADAPTER for where the index physically lives TODAY: the
 * `slot_embedding` column on the rows occupying each slot (newest wins). It reads only from the per-call
 * context, so it holds no state and nothing depends on call order. When the index moves behind a Slot store
 * this is the one function that changes — descriptors and `Resolution` stay vector-free either way.
 */
export async function rowsBySlotIndex(slots, ctx) {
  const rowsBySlot = ctx?.rowsBySlot
  const out = new Map()
  if (!rowsBySlot) return out
  for (const s of slots) {
    for (const row of rowsBySlot.get(s.slotId) || []) {
      if (Array.isArray(row.slot_embedding)) { out.set(s.slotId, row.slot_embedding); break }
    }
  }
  return out
}

/**
 * createCosineSlotResolver — v1: lexical match over a slot's canonical label AND its learned aliases,
 * unioned with a semantic match over the private index, all gated on the (already canonical) owner.
 *
 * @param {object} deps
 * @param {(text:string)=>Promise<{vector:number[]|null}>|null} [deps.embed] embedder; null → lexical only
 * @param {(slots:object[], context:object)=>Promise<Map<string,number[]>>|null} [deps.loadIndex]
 *        slotId → index vector (the §8a private-index port). It also receives resolve()'s context, so the
 *        adapter can answer from per-call data without any shared state. Absent → lexical/alias only.
 * @param {number} [deps.threshold]        semantic floor (SLOT_SEM_THRESHOLD)
 * @param {number} [deps.lexicalThreshold] lexical floor (SLOT_LEX_THRESHOLD)
 */
export function createCosineSlotResolver({ embed = null, loadIndex = null, threshold = SLOT_SEM_THRESHOLD, lexicalThreshold = SLOT_LEX_THRESHOLD } = {}) {
  // one embed per distinct slot phrase, shared with Persistence's column maintenance
  const vectors = new Map()
  const slotText = (obs) => `${obs.owner ?? ''} ${obs.attribute ?? ''}`.trim()

  /** The incoming slot phrase's vector, memoized. PRIVATE INDEX — see §8a. */
  async function indexVectorFor(obs) {
    if (!embed) return null
    const key = slotText(obs)
    if (!vectors.has(key)) {
      let v = null
      try { v = (await embed(key))?.vector ?? null } catch { v = null }
      vectors.set(key, v)
    }
    return vectors.get(key)
  }

  // best lexical similarity of an attribute phrase against a slot's canonical label OR any learned alias.
  // An alias hit is the CHEAP path a gray-zone verdict buys us — no embedding, no LLM, forever after.
  function lexicalScore(slot, attribute) {
    let best = attributeSimilarity(slot.canonicalLabel, attribute)
    let via = best > 0 ? 'label' : null
    let matchedAlias = null
    for (const a of slot.aliases || []) {
      const s = attributeSimilarity(a, attribute)
      // report WHICH alias matched, so the store can tell whether a previously PROMOTED verdict is now
      // paying dividends (the promotion-reuse rate — does teaching the resolver actually stick?).
      if (s > best) { best = s; via = 'alias'; matchedAlias = a }
    }
    return { score: best, via, matchedAlias }
  }

  /**
   * resolve — classify one observation into ONE conceptual slot.
   * @param {{owner:string, attribute:string}} observation  owner must already be CANONICAL
   * @param {{slots?: Array<{slotId:string, canonicalLabel:string, aliases?:string[], entity:string}>}} context
   * @returns {Promise<{slotId:string|null, confidence:number, evidence:object}>}
   */
  async function resolve(observation, context = {}) {
    const { slots = [] } = context
    const own = slots.filter((s) => s && sameEntity(s.entity, observation.owner))
    if (!own.length) return { slotId: null, confidence: 0, evidence: { candidates: 0, lexical: 0, semantic: 0, bestCosine: 0 } }

    // ── lexical / alias arm ───────────────────────────────────────────────────────────────────
    let bestLex = null
    let bestLexScore = 0
    let bestVia = null
    let bestAlias = null
    for (const s of own) {
      const { score, via, matchedAlias } = lexicalScore(s, observation.attribute)
      if (score > bestLexScore) { bestLexScore = score; bestLex = s; bestVia = via; bestAlias = matchedAlias }
    }
    if (bestLexScore >= lexicalThreshold) {
      return {
        slotId: bestLex.slotId,
        confidence: bestLexScore,
        evidence: { candidates: own.length, lexical: 1, semantic: 0, bestCosine: 0, via: bestVia, matchedAlias: bestAlias, lexicalScore: Number(bestLexScore.toFixed(4)) },
      }
    }

    // ── semantic arm (only when the cheap arms didn't decide) ─────────────────────────────────
    const vec = await indexVectorFor(observation)
    let bestSem = null
    let bestCos = 0
    if (vec && loadIndex) {
      // the index port receives this call's CONTEXT too, so the adapter needs no shared state
      let index = null
      try { index = await loadIndex(own, context) } catch { index = null }
      if (index) {
        for (const s of own) {
          const iv = index.get(s.slotId)
          if (!Array.isArray(iv)) continue
          const c = cosine(vec, iv)
          if (c > bestCos) { bestCos = c; bestSem = s }
        }
      }
    }
    const semanticHit = bestSem && bestCos >= threshold
    return {
      slotId: semanticHit ? bestSem.slotId : null,
      confidence: semanticHit ? bestCos : 0,
      evidence: {
        candidates: own.length,
        lexical: 0,
        semantic: semanticHit ? 1 : 0,
        bestCosine: Number(bestCos.toFixed(4)),
        // what the NEXT resolver version needs to spot the gray zone (Phase 7b reads these)
        nearest: bestSem?.slotId ?? null,
        bestLexicalScore: Number(bestLexScore.toFixed(4)),
        via: semanticHit ? 'cosine' : null,
      },
    }
  }

  return { resolve, indexVectorFor }
}
