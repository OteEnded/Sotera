// SearchService implementations for the Chat Site host.
//   Brave-backed when a key is configured; otherwise a "not configured" impl that returns a
//   helpful error so search_web degrades gracefully instead of crashing.
//
// Satisfies the PortableComponents SearchService contract (SDK/contracts.js).

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

/** Brave Web Search API → normalized { results:[{title,url,snippet}] }. */
export function createBraveSearchService(apiKey) {
  return {
    async search(query, { count = 5 } = {}) {
      const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=${Math.min(Math.max(count, 1), 20)}`
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Brave search failed (${res.status}): ${body.slice(0, 200)}`)
      }
      const data = await res.json()
      const results = (data?.web?.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      }))
      return { results }
    },
  }
}

/** Used when no search provider is configured. */
export function createNullSearchService() {
  return {
    async search() {
      throw new Error(
        'Web search is not configured. Set chat.web.braveApiKey in config.json (or env BRAVE_API_KEY) to enable search_web.',
      )
    },
  }
}

/** Pick an implementation from server config. */
export function searchServiceFromConfig(config) {
  const apiKey = config?.chat?.web?.braveApiKey || process.env.BRAVE_API_KEY || ''
  return apiKey ? createBraveSearchService(apiKey) : createNullSearchService()
}
