// Model pickers re-fetch their source list when the user opens them, so newly
// enabled providers / freshly pulled models show up without a page reload
// (the backend list is live — it queries every provider per call). This gate
// throttles that per data source: opening pickers repeatedly within the TTL
// costs nothing, and several pickers sharing one source share one clock.

const lastAt = new Map<string, number>()

export const MODEL_REFRESH_TTL_MS = 15_000
export const CHAT_MODELS_KEY = '/v1/chat/models'

export function modelsNeedRefresh(key: string, ttlMs = MODEL_REFRESH_TTL_MS): boolean {
  return Date.now() - (lastAt.get(key) ?? 0) >= ttlMs
}

// Call when a fetch STARTS (not completes) so a burst of opens can't stack requests.
export function markModelsFetched(key: string): void {
  lastAt.set(key, Date.now())
}
