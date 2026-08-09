import { apiUrl } from '../config'

export class ApiError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

// Global "session died" signal: any request that comes back 401 not_authenticated means
// the cookie session expired/was revoked. The AuthProvider registers a handler here so it
// can flip the whole app to the login screen instead of leaving stale content on screen
// with a little red error (Ote's report). api.ts stays React-free — this is a plain
// pub-sub the provider wires up on mount.
type AuthExpiredHandler = () => void
let authExpiredHandler: AuthExpiredHandler | null = null
export function setAuthExpiredHandler(h: AuthExpiredHandler | null) { authExpiredHandler = h }

/** The platform's error envelope. Only the shape this function actually reads. */
type ErrorEnvelope = { error?: { code?: string; message?: string } }

/**
 * A decoded response body. Untyped BY NATURE — every endpoint returns a different shape, and the ~40 call
 * sites assert their own. Giving each one a real response type is a worthwhile refactor but a separate one, so
 * the `any` is pinned to this single boundary with a name, instead of leaking out of an untyped local.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WirePayload = any

async function parse(res: Response): Promise<WirePayload> {
  const text = await res.text()
  // `unknown` INSIDE the function: the error-envelope read below is the part that was genuinely unsafe off
  // `any`, and narrowing it is the fix. The permissive type stops at the return boundary above.
  let json: unknown = null
  if (text) {
    try { json = JSON.parse(text) } catch { /* non-json */ }
  }
  if (!res.ok) {
    const env = (json ?? {}) as ErrorEnvelope
    const code = env.error?.code || 'http_error'
    const message = env.error?.message || text || `HTTP ${res.status}`
    // notify BEFORE throwing so the app bounces to login even if the caller swallows the error
    if (res.status === 401 && code === 'not_authenticated') { try { authExpiredHandler?.() } catch { /* never let the handler break a response */ } }
    throw new ApiError(message, code, res.status)
  }
  return json
}

export function apiGet(path: string) {
  return fetch(apiUrl(path), { credentials: 'include' }).then(parse)
}

// NOTE: only send the JSON content-type when there IS a body — Fastify rejects an empty body
// that claims to be JSON (FST_ERR_CTP_EMPTY_JSON_BODY), which silently broke e.g. logout.
export function apiPost(path: string, body?: unknown) {
  return fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(parse)
}

export function apiPatch(path: string, body?: unknown) {
  return fetch(apiUrl(path), {
    method: 'PATCH',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(parse)
}

export function apiPut(path: string, body?: unknown) {
  return fetch(apiUrl(path), {
    method: 'PUT',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(parse)
}

export function apiDelete(path: string) {
  return fetch(apiUrl(path), { method: 'DELETE', credentials: 'include' }).then(parse)
}
