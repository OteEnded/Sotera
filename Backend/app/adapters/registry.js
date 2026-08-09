// Runtime provider registry — merges config.json defaults with DB-configured providers.
//
// config.json `providers` = the platform DEFAULTS (root's file, survives DB resets).
// `providers` DB rows with owner_user_id NULL = platform-global runtime configuration:
// they OVERRIDE a config default of the same name or ADD a new provider. Rows WITH an
// owner_user_id are BYOK — collected into a per-user overlay that resolution layers on
// top of the global map for that user only (same name = their key replaces the
// platform's for their calls; new name = a provider only they can reach). API keys live
// encrypted in the DB (key-vault) and are only decrypted into the in-memory snapshot —
// never written to config.json.
//
// Call rebuildProviderRegistry at boot and after every provider mutation.

import { decryptRawKey } from '../auth/key-vault.js'
import { setEffectiveProviders } from './index.js'

function rowToConfig(config, r) {
  const cfg = { kind: r.kind }
  if (r.kind === 'ollama') cfg.host = r.endpoint
  else cfg.baseURL = r.endpoint
  const key = r.api_key_encrypted ? decryptRawKey(config, r.api_key_encrypted) : null
  if (key) cfg.apiKey = key
  else if (r.kind !== 'ollama') cfg.apiKey = ''
  if (!r.enabled) cfg.enabled = false
  return cfg
}

export async function rebuildProviderRegistry({ db, config }) {
  const merged = {}
  const meta = {} // name -> { source: 'config'|'db'|'override', id?, ownerUserId? }
  const userProviders = {} // userId -> { name -> cfg } (BYOK overlays)

  for (const [name, cfg] of Object.entries(config?.providers || {})) {
    merged[name] = { ...cfg }
    meta[name] = { source: 'config' }
  }

  if (db?.mst_providers) {
    const rows = await db.mst_providers.findAll({ order: [['rolling_id', 'ASC']] })
    for (const r of rows) {
      const cfg = rowToConfig(config, r)
      if (r.owner_user_id) {
        if (!userProviders[r.owner_user_id]) userProviders[r.owner_user_id] = {}
        userProviders[r.owner_user_id][r.name] = cfg
        continue
      }
      meta[r.name] = {
        source: merged[r.name] ? 'override' : 'db',
        id: r.id,
        ownerUserId: null,
      }
      merged[r.name] = cfg
    }
  }

  setEffectiveProviders(config, merged, meta, userProviders)
  return merged
}
