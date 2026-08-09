/* eslint-disable react-refresh/only-export-components --
 * DELIBERATE: `AuthProvider` (a component) and `useAuth` (its hook) live together on purpose — a context and
 * its accessor are one unit, and splitting them would put the hook in a file that cannot be understood without
 * this one. The rule's real cost is that editing THIS file does a full reload instead of a fast refresh in dev;
 * that is a fair price, and 10 call sites are not worth churning to buy it back. Reviewed 2026-07-30.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { apiGet, apiPost, setAuthExpiredHandler } from './api'

// Mirrors CAPABILITIES in Backend/app/auth/permissions.js — a name missing here is a compile error at
// the call site, which is how this stayed in sync.
export type Capability = 'system_config' | 'manage_users' | 'console' | 'chat' | 'select_model' | 'own_keys' | 'context_detail'

export type CurrentUser = {
  id: number | null
  username: string
  email: string | null
  displayName?: string | null
  roles: string[]
  isRoot?: boolean
  capabilities?: Partial<Record<Capability, boolean>>
}

type AuthState = {
  user: CurrentUser | null
  loading: boolean
  expired: boolean // the session died mid-use (vs a plain "never logged in") — Login shows a notice
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  can: (cap: Capability) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)
  // live mirror so the (React-free) 401 interceptor can tell "session died mid-use" from
  // "never logged in" without going stale in a closure
  const userRef = useRef<CurrentUser | null>(null)
  userRef.current = user

  const loadMe = useCallback(async () => {
    try {
      const res = await apiGet('/v1/me')
      setUser(res.user)
      setExpired(false) // a good /v1/me clears any prior expiry notice
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMe()
  }, [loadMe])

  // Global session-expiry: ANY 401 not_authenticated (from api.ts) flips the app to Login.
  // Only counts as "expired" if we THOUGHT we were logged in — the boot /v1/me 401 for a
  // fresh visitor must not show an "expired" notice.
  useEffect(() => {
    setAuthExpiredHandler(() => {
      if (userRef.current) setExpired(true)
      setUser(null)
    })
    return () => setAuthExpiredHandler(null)
  }, [])

  // Re-check when the tab regains focus, so a session that died while the tab was
  // backgrounded (came back after lunch) lands on Login without needing a click first.
  // A 401 here routes through the same interceptor above.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && userRef.current) void loadMe() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadMe])

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiPost('/v1/auth/login', { username, password })
    setUser(res.user)
    setExpired(false)
  }, [])

  const logout = useCallback(async () => {
    try { await apiPost('/v1/auth/logout') } catch { /* ignore */ }
    setUser(null)
    setExpired(false) // a deliberate logout is not an "expired" event
  }, [])

  const can = useCallback((cap: Capability) => Boolean(user?.capabilities?.[cap]), [user])

  return (
    <AuthContext.Provider value={{ user, loading, expired, login, logout, refresh: loadMe, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
