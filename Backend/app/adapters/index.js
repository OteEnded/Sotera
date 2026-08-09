// Adapter registry + provider resolution.
//
// Maps a configured provider (from config.json `providers.<name>`) to its
// adapter implementation under Backend/providers/. Provider-specific logic
// stays inside the adapters; this layer only decides WHICH adapter to use.

import * as ollama from '../../providers/ollama/index.js'
import * as openaiCompatible from '../../providers/openai-compatible/index.js'
import * as anthropic from '../../providers/anthropic/index.js'

export class GatewayError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

export const adapters = {
  ollama,
  'openai-compatible': openaiCompatible,
  anthropic,
}

// A provider is enabled unless it explicitly sets "enabled": false in config.
// (Omitting the field = enabled, so existing configs keep working.)
export function isProviderEnabled(providerConfig) {
  return providerConfig?.enabled !== false
}

// --- effective provider map ---------------------------------------------------
// config.json `providers` holds the PLATFORM DEFAULTS (root-managed file). Rows in
// the `providers` DB table override them by name and add new ones. Rows with an
// owner_user_id are BYOK: they exist only for that user, layered over the global
// map at resolution time (a user's 'openrouter' row means THEIR key serves their
// calls). The merged snapshots are attached to the config object as NON-ENUMERABLE
// properties so JSON.stringify/saveConfig can never accidentally persist DB-sourced
// entries (or their decrypted keys) to disk.
export function effectiveProviders(serverConfig) {
  return serverConfig?._effectiveProviders || serverConfig?.providers || {}
}
export function providerMeta(serverConfig) {
  return serverConfig?._providerMeta || {}
}
// BYOK overlay for one user: { name -> providerConfig } (empty for no rows / no user).
export function userProvidersFor(serverConfig, userId) {
  return (userId && serverConfig?._userProviders?.[userId]) || {}
}
// Global map with the user's BYOK rows layered on top — what THIS user can reach.
export function effectiveProvidersFor(serverConfig, userId) {
  const overlay = userProvidersFor(serverConfig, userId)
  return Object.keys(overlay).length ? { ...effectiveProviders(serverConfig), ...overlay } : effectiveProviders(serverConfig)
}
export function setEffectiveProviders(serverConfig, merged, meta, userProviders = {}) {
  Object.defineProperty(serverConfig, '_effectiveProviders', { value: merged, writable: true, configurable: true, enumerable: false })
  Object.defineProperty(serverConfig, '_providerMeta', { value: meta, writable: true, configurable: true, enumerable: false })
  Object.defineProperty(serverConfig, '_userProviders', { value: userProviders, writable: true, configurable: true, enumerable: false })
}

export function resolveProvider(serverConfig, providerName, userId = null) {
  if (!providerName) {
    throw new GatewayError('provider_required', 'Request must specify a provider', 400)
  }

  // BYOK first: the caller's own row (same name = personal override, new name = personal provider)
  const providersConfig = effectiveProvidersFor(serverConfig, userId)
  const providerConfig = providersConfig[providerName]
  if (!providerConfig) {
    throw new GatewayError(
      'provider_not_configured',
      `Provider '${providerName}' is not configured. Add it in the console (Providers) or under "providers.${providerName}" in Backend/config.json.`,
      400
    )
  }

  if (!isProviderEnabled(providerConfig)) {
    throw new GatewayError(
      'provider_disabled',
      `Provider '${providerName}' is disabled. Set "enabled": true (or remove the flag) under "providers.${providerName}" in Backend/config.json.`,
      403
    )
  }

  const kind = providerConfig.kind || providerName
  const adapter = adapters[kind]
  if (!adapter) {
    throw new GatewayError(
      'provider_unsupported',
      `Provider kind '${kind}' is not yet supported by this gateway`,
      400
    )
  }

  return {
    adapter,
    providerConfig: { ...providerConfig, name: providerName },
    kind,
  }
}

export function listConfiguredProviders(serverConfig, { includeDisabled = true, userId = null } = {}) {
  const providersConfig = effectiveProvidersFor(serverConfig, userId)
  const overlay = userProvidersFor(serverConfig, userId)
  return Object.entries(providersConfig)
    .filter(([, cfg]) => includeDisabled || isProviderEnabled(cfg))
    .map(([name, cfg]) => ({
      name,
      kind: cfg.kind || name,
      type: cfg.kind === 'ollama' ? 'local' : 'remote',
      supported: Boolean(adapters[cfg.kind || name]),
      enabled: isProviderEnabled(cfg),
      byok: Boolean(overlay[name]),
    }))
}
