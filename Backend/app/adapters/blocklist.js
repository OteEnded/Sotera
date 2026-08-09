// Root's model blocklist — in-memory snapshot of the model_blocks table, mirroring
// the provider-registry pattern (registry.js): rebuild at boot (plugins/db.js) and
// after every block mutation (admin routes). The snapshot makes the check SYNCHRONOUS,
// so the chat runtime can refuse blocked models on every surface (chat site, OpenAI,
// Anthropic, embeddings) without a per-request DB read.

let blocked = new Set() // 'provider/model'

export async function rebuildModelBlocklist(db) {
  try {
    const rows = await db.mst_model_blocks.findAll()
    blocked = new Set(rows.map((r) => `${r.provider}/${r.model}`))
  } catch { /* table unreachable — keep the last known snapshot (fail closed-ish) */ }
  return blocked
}

export function isModelBlocked(provider, model) {
  return blocked.has(`${provider}/${model}`)
}
