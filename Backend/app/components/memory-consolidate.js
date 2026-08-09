// Persona Memory v2 — Phase 3 cognition: DCPM consolidation → Knowledge Cards (RFC_PERSONA_MEMORY
// §4.5; RESEARCH_CHATGPT_MEMORY §24/37/54). The scheduled System-2 pass clusters many small episodic
// memories by semantic similarity, has the LLM induce ONE living per-topic summary (a `kind='card'`
// memory) per cluster, then archives the originals — "100 small memories → merge → Knowledge Card →
// archive originals", keeping the working set compact while preserving history (soft-expire, not
// delete). PURE here (clustering + plan + prompt + parse); the LLM call + DB writes are the host's.

import { cosine } from './memory-rank.js'

/**
 * Greedy single-link agglomerative clustering by embedding cosine. O(n²) — fine at persona scale
 * (hundreds of rows). Only rows WITH an embedding cluster; each joins the existing cluster it's most
 * similar to (max similarity to any member ≥ threshold), else starts its own. Order-stable.
 * @param {Array<{id:string, embedding?:number[]}>} rows
 * @param {{threshold?:number}} opts  cosine link threshold. Default 0.55: measured on real
 *   (non-paraphrastic) episodic memories, same-topic pairs sit ~0.51-0.72 (mins ~0.51-0.60) and
 *   distinct topics stay <0.40; 0.55 groups a topic reliably (greedy single-link + order means a
 *   borderline member near 0.6 would otherwise singleton) without merging topics. (Old 0.82
 *   clustered nothing.) Precise tuning belongs to the Card Eval harness.
 * @returns {Array<Array<row>>} clusters (singletons included)
 */
export function clusterMemories(rows, { threshold = 0.55 } = {}) {
  const withEmb = (rows || []).filter((r) => Array.isArray(r.embedding) && r.embedding.length)
  const clusters = []
  for (const r of withEmb) {
    let best = null
    let bestSim = threshold
    for (const c of clusters) {
      let s = 0
      for (const m of c) { const cs = cosine(r.embedding, m.embedding); if (cs > s) s = cs }
      if (s >= bestSim) { bestSim = s; best = c }
    }
    if (best) best.push(r)
    else clusters.push([r])
  }
  return clusters
}

/**
 * Which clusters are worth consolidating into a Knowledge Card: a real topic (≥ minSize members),
 * not a one-off. Sorted largest-first so the host can cap how many cards it induces per run.
 * @returns {Array<Array<row>>}
 */
export function consolidationPlan(clusters, { minSize = 4 } = {}) {
  return (clusters || []).filter((c) => Array.isArray(c) && c.length >= minSize).sort((a, b) => b.length - a.length)
}

/**
 * The induction prompt: given the contents of a cluster of related episodic memories, produce ONE
 * living topic summary. Pure string. `existingCard` (optional) is the prior card body for this topic
 * so the summary EVOLVES (living card) instead of being rewritten from scratch.
 */
export function buildCardPrompt(members, { existingCard = null } = {}) {
  const bullets = (members || []).map((m, i) => `${i + 1}. ${String(m.content ?? '').trim()}`).join('\n')
  return (
    `You maintain a durable KNOWLEDGE CARD — one living, human-readable summary of a single topic about ` +
    `the user, distilled from many small observations. Merge the observations below into a concise, ` +
    `factual summary (no chit-chat, no speculation, keep only what is durably useful).\n` +
    // GROUNDING (Cards = consolidation, NOT reinterpretation): state only what the observations (and
    // the existing card, if any) support. Do NOT infer, speculate, editorialize, or re-narrate beyond
    // the evidence — reinterpreting history is the Reflection Feature's job, not the card's.
    `Use ONLY the information in the observations and existing card; do not add, infer, or reinterpret ` +
    `anything not directly supported by them.\n\n` +
    (existingCard ? `EXISTING CARD (update/extend it with the new observations, don't restate verbatim, don't drop still-true facts):\n${existingCard}\n\n` : '') +
    `OBSERVATIONS:\n${bullets}\n\n` +
    `Return ONLY JSON (no prose): {"topic": "<3-5 word topic name>", "summary": "<the card, a few sentences>"}.\n` +
    `Return {"topic":"","summary":""} if there is nothing durably useful to summarize.`
  )
}

/** Pure: pull the first JSON object out of an LLM reply → {topic, summary} or null. Tolerant. */
export function parseCard(raw) {
  try {
    const m = String(raw ?? '').match(/\{[\s\S]*\}/)
    if (!m) return null
    const o = JSON.parse(m[0])
    const topic = String(o?.topic ?? '').trim().slice(0, 80)
    const summary = String(o?.summary ?? '').trim().slice(0, 1200)
    if (!topic || !summary) return null
    return { topic, summary }
  } catch {
    return null
  }
}
