import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../lib/api'
import { useAuth } from '../lib/auth'
import ConfirmModal from '../components/ConfirmModal'
import Req from '../components/Req'
import AppearancePanel from './chat/AppearancePanel'
import { ui } from './admin/ui'

type DevRequest = { id: string; requestedRole: string; note: string | null; status: string; at: string }

// `embedded` = rendered inside the chat site's Options modal (no page chrome/title).
export default function Account({ embedded = false }: { embedded?: boolean }) {
  const { user, refresh } = useAuth()

  // membership card (member -> power free upgrade; developer = manual request)
  const [upgradeAsk, setUpgradeAsk] = useState(false)
  const [tierMsg, setTierMsg] = useState('')
  const [tierErr, setTierErr] = useState('')
  const [devRequest, setDevRequest] = useState<DevRequest | null>(null)
  const [devNote, setDevNote] = useState('')
  const [devBusy, setDevBusy] = useState(false)

  // profile form
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pMsg, setPMsg] = useState('')
  const [pErr, setPErr] = useState('')
  const [pBusy, setPBusy] = useState(false)

  // password form
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setUsername(user?.username || '')
    setEmail(user?.email || '')
    setDisplayName(user?.displayName || '')
  }, [user])

  // BYOK moved to its own page (/console/myproviders) — Account keeps identity + password.

  const roles = user?.roles || []
  const isMember = !user?.isRoot && roles.includes('member') && !roles.some((r) => ['power', 'developer', 'admin'].includes(r))
  const isDev = Boolean(user?.isRoot) || roles.includes('developer') || roles.includes('admin')

  useEffect(() => {
    if (!user || user.isRoot || isDev) return
    apiGet('/v1/me/role-request').then((r) => setDevRequest(r.request)).catch(() => {})
  }, [user, isDev])

  const upgrade = async () => {
    setTierMsg(''); setTierErr('')
    await apiPost('/v1/me/upgrade-to-power')
    await refresh()
    setTierMsg('Your account is now on the Power tier — the model picker is unlocked. Enjoy!')
  }

  const requestDev = async () => {
    setTierMsg(''); setTierErr(''); setDevBusy(true)
    try {
      const r = await apiPost('/v1/me/role-request', devNote.trim() ? { note: devNote.trim() } : {})
      setDevRequest(r.request)
      setDevNote('')
    } catch (e2) {
      setTierErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setDevBusy(false)
    }
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setPMsg(''); setPErr(''); setPBusy(true)
    try {
      // Root sends ONLY the display name. Its username is a credential in config.json and its email
      // means nothing there, so the server refuses both by name — sending them unchanged would still
      // trip that refusal and turn a valid rename into an error.
      await apiPatch('/v1/me', user?.isRoot
        ? { displayName: displayName.trim() || null }
        : {
            username: username.trim() || undefined,
            email: email.trim() || null,
            displayName: displayName.trim() || null,
          })
      await refresh()
      setPMsg('Profile saved.')
    } catch (e2) {
      setPErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setPBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(''); setErr('')
    if (next !== confirm) { setErr('New passwords do not match.'); return }
    setBusy(true)
    try {
      await apiPost('/v1/auth/change-password', { currentPassword: current, newPassword: next })
      setMsg('Password changed.')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'flex flex-col gap-4' : `${ui.page} flex flex-col gap-5`}>
      {!embedded && <h2 className={ui.h2}>Account</h2>}
      <section className="gw-card">
        <div className="gw-card-title">Signed in as</div>
        <div className={ui.formRow}>
          <span><b>{user?.displayName || user?.username}</b></span>
          <span className="adm-dim">@{user?.username} · roles: {user?.isRoot ? 'root' : (user?.roles.join(', ') || 'none')}</span>
        </div>
      </section>

      {/* Console has no Options-modal-style tabs like chat does, where Appearance is its own
          section — so it lives here instead. Guarded on !embedded because chat's Options
          modal already renders AppearancePanel as a sibling tab; showing it here too (when
          this component is embedded there as the "Account" tab) would duplicate it. */}
      {!embedded && (
        <section className="gw-card" data-ui="appearance-card">
          <div className="gw-card-title">Appearance</div>
          <AppearancePanel />
        </section>
      )}

      {!user?.isRoot && (
        <section className="gw-card" data-ui="membership-card">
          <div className="gw-card-title">Membership</div>
          <div className={ui.formRow}>
            <span>Tier: <b>{roles.includes('admin') ? 'Admin' : roles.includes('developer') ? 'Developer' : roles.includes('power') ? 'Power' : 'Member'}</b></span>
          </div>

          {isMember && (
            <div className="mt-2">
              <p className="adm-dim mt-0 mb-2">
                First-phase promo: upgrade to the <b>Power</b> tier for free — it unlocks the model picker in chat.
              </p>
              <button className="gw-btn gw-btn-primary" onClick={() => { setTierMsg(''); setTierErr(''); setUpgradeAsk(true) }}>
                Upgrade to Power — free
              </button>
            </div>
          )}

          {!isDev && (
            <div className="mt-3">
              <p className="adm-dim mt-0 mb-2">
                Need API keys and console access? <b>Developer</b> accounts are granted manually — file a request and the
                administrator will review it and contact you via your account email.
              </p>
              {devRequest ? (
                <div className="gw-meta gw-ok">Developer-access request filed {new Date(devRequest.at).toLocaleString()} — status: <b>{devRequest.status}</b>. The administrator will contact you.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    className="gw-input"
                    placeholder="optional note — what will you build?"
                    value={devNote}
                    onChange={(e) => setDevNote(e.target.value)}
                    maxLength={2000}
                  />
                  <div><button className="gw-btn" disabled={devBusy} onClick={() => void requestDev()}>{devBusy ? 'Sending…' : 'Request developer access'}</button></div>
                </div>
              )}
            </div>
          )}

          {tierMsg && <div className="gw-meta gw-ok mt-2">{tierMsg}</div>}
          {tierErr && <div className="gw-meta gw-error mt-2">{tierErr}</div>}
        </section>
      )}

      <section className="gw-card">
        <div className="gw-card-title">Profile</div>
        {user?.isRoot ? (
          // ⚠ THIS USED TO SAY "there is no database profile to edit here", which stopped being true on
          // 2026-08-06 when root got its own user row. The row is about SCOPE (so root's data is
          // attributable and deletable); root's NAME stays config-canonical because root is the
          // bootstrap account and must stay usable when the database is unreachable. Say the values
          // instead of denying they exist — the page was hiding a name the chat persona already uses.
          <form className="flex flex-col gap-4" onSubmit={saveProfile}>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Display / preferred name — how the platform (and the chat persona) refers to you. Optional.</span>
              <input className="gw-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" placeholder="e.g. Ote" />
            </label>
            <div><button className="gw-btn gw-btn-primary" disabled={pBusy}>Save profile</button></div>
            {pMsg && <div className="gw-meta gw-ok">{pMsg}</div>}
            {pErr && <div className="gw-meta gw-error">{pErr}</div>}
            <div className="gw-meta gw-warn">
              Saved to root&apos;s own user row (<code className={ui.codeChip}>auth.root.userConnected</code>) — the
              same place every other account keeps its name, and the same row that owns root&apos;s conversations
              and memories. Only root&apos;s <b>username</b> (<code className={ui.codeChip}>@{user.username}</code>)
              and <b>password</b> live in <code className={ui.codeChip}>Backend/config.json</code>, because those
              must still be readable when the database is the thing you are signing in to fix. If it is
              unreachable, root signs in with no display name rather than not at all.
            </div>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={saveProfile}>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Display / preferred name — how the platform (and the chat persona) refers to you. Optional.</span>
              <input className="gw-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" placeholder="e.g. Ote" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>
                Email — optional but unique. ⚠ Used to verify you for account recovery (password reset etc.); without one, a lost account can't be recovered.
              </span>
              <input className="gw-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="you@example.com" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Username — unique; you can change it at most once every 48 hours.<Req /></span>
              <input className="gw-input" value={username} onChange={(e) => setUsername(e.target.value)} spellCheck={false} autoComplete="off" />
            </label>
            <div><button className="gw-btn gw-btn-primary" disabled={pBusy || !username.trim()}>Save profile</button></div>
            {pMsg && <div className="gw-meta gw-ok">{pMsg}</div>}
            {pErr && <div className="gw-meta gw-error">{pErr}</div>}
          </form>
        )}
      </section>

      <section className="gw-card">
        <div className="gw-card-title">Change password</div>
        {user?.isRoot ? (
          <div className="gw-meta gw-warn">
            You are signed in as <b>root</b>. Root's password lives in <code className={ui.codeChip}>Backend/config.json</code>
            (<code className={ui.codeChip}>auth.root</code>) and is changed there, not here.
          </div>
        ) : (
          <form className={ui.formCol} onSubmit={submit}>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Current password<Req /></span>
              <input className="gw-input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>New password<Req /></span>
              <input className="gw-input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Confirm new password<Req /></span>
              <input className="gw-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>
            <button className="gw-btn gw-btn-primary" disabled={busy || !current || !next}>Change password</button>
          </form>
        )}
        {msg && <div className="gw-meta gw-ok">{msg}</div>}
        {err && <div className="gw-meta gw-error">{err}</div>}
      </section>

      {/* BYOK removed for Sotera: per-user provider keys are a multi-user product feature. Her
          providers are configured once in Backend/config.json. Inbound API keys (/console/mykeys)
          are a different thing entirely and stay — they are how a client authenticates TO her. */}

      {upgradeAsk && (
        <ConfirmModal
          title="Upgrade to Power"
          message={<>Upgrade this account from <b>Member</b> to <b>Power</b> for free? Power unlocks the model picker in chat. This replaces your member tier (an admin can change it back later if needed).</>}
          confirmLabel="Upgrade for free"
          busyLabel="Upgrading…"
          danger={false}
          onConfirm={upgrade}
          onClose={() => setUpgradeAsk(false)}
        />
      )}
    </div>
  )
}
