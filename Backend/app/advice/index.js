// SeekAdvice — the host half, assembled per the canon layering law:
//   Feature → Host Service → Store → DB
//     • Host Service  ./service.js — destinations, modes, self-presentation, provenance, bounds
//     • Store         ./store.js   — raw persistence for txn_advice_exchanges / txn_advice_turns
//     • Binding       ./hermes.js  — ⭐ the ONLY file that knows Hermes exists
// This index is wiring and the public entry, exactly as app/interaction/index.js is for HumanInteraction.
//
// ⭐ Built PER REQUEST, bound to the caller — an exchange belongs to one room, and the owner boundary
// must never be something a caller passes in.
// ⓘ Deliberately NOT registered as a host service yet: no component consumes it, and a registered-but-
// unused service is a second path that can drift from the one the route actually calls.

import { createAdviceService } from './service.js'

export { createAdviceService }

/**
 * ⭐ The authorized-session block for her context — Ote's ruling, 2026-08-24: it rides in her context
 * every turn rather than being a tool call, because it is HER authorization information and not something
 * to ask a counterpart about.
 * ⚠️ Kept deliberately small: it enters the system prompt on every turn, and this project measures prompt
 * composition. ⛔ Re-run `noticing-prompt-purity-check` after any change to the wording.
 */
export function adviceContextBlock(config) {
  const dests = config?.advice?.destinations || {}
  const lines = []
  for (const [name, d] of Object.entries(dests)) {
    if (d.enabled === false) continue
    const who = d.display || name
    const what = d.capability ? ` — ${d.capability}` : ''
    lines.push(`${who} (${name})${what}`)
    for (const s of d.sessions || []) {
      if (s.grantedFor) lines.push(`  · ${s.grantedFor}`)
    }
  }
  if (!lines.length) return null
  return `Other intelligences you can reach:\n${lines.join('\n')}`
}
