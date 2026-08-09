import fp from 'fastify-plugin'
import { logRequest } from '../../lib/utility.js'

// Headers that AUTHENTICATE — a request log must never become a credential store.
// The internal-impersonation secret (auth/index.js: "never persisted") rides on every
// scheduled/digest self-request; API-key bearers and session cookies ride on real ones.
// Redact by name (case-insensitive) so the log keeps its diagnostic value without the keys.
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key', 'x-ote-internal', 'x-ote-internal-user'])
const redactHeaders = (headers) => {
  const out = {}
  for (const [k, v] of Object.entries(headers || {})) out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '<redacted>' : v
  return out
}

export default fp(async function (fastify, opts) {
  fastify.addHook('onRequest', async (request, reply) => {
    // webhook fire URLs carry their CREDENTIAL in the path (the minted token) — never
    // write it to the request log; a log file must not become a token directory
    const safeUrl = request.url.replace(/(\/v1\/hooks\/[^/]+\/)[^/?]+/, '$1<redacted>')
    const requestData = {
      request_at: new Date(),
      request_ip: request.ip || request.socket.remoteAddress || 'unknown',
      request_to: request.hostname + safeUrl,
      request_protocol: request.protocol,
      request_method: request.method,
      request_header: redactHeaders(request.headers),
      // cookies carry the session token — keep only the NAMES for diagnostics, never values
      request_cookies: Object.keys(request.cookies || {}),
      request_body: request.body || {}
    }

    // Log asynchronously without blocking the request
    logRequest(requestData).catch((err) => {
      console.error('Error logging request:', err)
    })
  })
})
