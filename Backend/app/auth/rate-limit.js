// In-memory failure rate limiting for credential-guessing surfaces (login, key reveal).
//
// Sliding-window failure counters keyed by caller-chosen strings (usually ip / ip+identifier).
// Only FAILURES count toward the limit — a successful auth clears its bucket, so legitimate
// users never hit the wall. When a bucket exceeds its cap the key is locked for the remainder
// of the window and callers get a retry-after.
//
// This is deliberately in-memory (single-process platform): restarting the server resets the
// counters, which is acceptable — an attacker forcing restarts has bigger problems to cause.

const buckets = new Map() // key -> { count, windowStart, lockedUntil }

const MAX_BUCKETS = 10000 // memory backstop; prune expired before evicting anything live

function now() { return Date.now() }

function prune(windowMs) {
  if (buckets.size < MAX_BUCKETS) return
  const t = now()
  for (const [key, b] of buckets) {
    if ((b.lockedUntil || 0) < t && t - b.windowStart > windowMs) buckets.delete(key)
  }
}

// Limits are read per call (opts override the instance defaults) so the root-editable
// security settings (app/settings) apply immediately without rebuilding limiters.
export function makeLimiter({ maxAttempts = 8, windowMs = 15 * 60 * 1000, lockoutMs = null } = {}) {
  const defaults = { maxAttempts, windowMs, lockoutMs }

  return {
    // -> { limited: boolean, retryAfterSeconds?: number }
    check(key, opts = {}) {
      const win = opts.windowMs ?? defaults.windowMs
      const b = buckets.get(key)
      if (!b) return { limited: false }
      const t = now()
      if (b.lockedUntil && b.lockedUntil > t) {
        return { limited: true, retryAfterSeconds: Math.ceil((b.lockedUntil - t) / 1000) }
      }
      if (t - b.windowStart > win) { buckets.delete(key); return { limited: false } }
      return { limited: false }
    },

    recordFailure(key, opts = {}) {
      const win = opts.windowMs ?? defaults.windowMs
      const max = opts.maxAttempts ?? defaults.maxAttempts
      const lock = opts.lockoutMs ?? defaults.lockoutMs ?? win
      prune(win)
      const t = now()
      let b = buckets.get(key)
      if (!b || t - b.windowStart > win) {
        b = { count: 0, windowStart: t, lockedUntil: 0 }
        buckets.set(key, b)
      }
      b.count += 1
      if (b.count >= max) b.lockedUntil = t + lock
    },

    clear(key) { buckets.delete(key) },
  }
}

// Shared limiter instances. Two tiers for login: a per-identifier limit (stops guessing one
// account's password) and a looser per-IP limit (stops spraying many identifiers).
export const loginLimiter = makeLimiter({ maxAttempts: 8, windowMs: 15 * 60 * 1000 })
export const loginIpLimiter = makeLimiter({ maxAttempts: 30, windowMs: 15 * 60 * 1000 })
export const revealLimiter = makeLimiter({ maxAttempts: 8, windowMs: 15 * 60 * 1000 })

// Test hook: reset all counters (DevTools sweeps hammer these endpoints on purpose).
export function resetAllLimits() { buckets.clear() }

// Root visibility (System → Security): every bucket with recorded failures — locked
// ones AND those still counting toward the limit. Keys are the caller-chosen strings
// ('login:<ip>:<identifier>', 'login:<ip>', 'reveal:<ip>:<user>', 'register:<ip>',
// 'pwreset:<ip>') — the route parses them into kind/target for display.
export function listBuckets() {
  const t = now()
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    count: b.count,
    windowStartedAt: new Date(b.windowStart).toISOString(),
    locked: Boolean(b.lockedUntil && b.lockedUntil > t),
    retryAfterSeconds: b.lockedUntil && b.lockedUntil > t ? Math.ceil((b.lockedUntil - t) / 1000) : null,
  }))
}

// Clear ONE bucket (root unlocks a specific account/IP without resetting everything).
export function clearBucket(key) { return buckets.delete(key) }
