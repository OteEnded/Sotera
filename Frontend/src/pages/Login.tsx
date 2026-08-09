import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { apiGet, apiPost } from '../lib/api'
import Req from '../components/Req'
import { dismissOnBackdrop } from '../lib/overlay'

type Mode = 'signin' | 'register' | 'forgot'

export default function Login() {
  const { login, refresh, expired } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // register-only fields
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirm, setConfirm] = useState('')

  // live password requirement (root-configurable security.passwordMinLength; /api/meta is public)
  const [pwMin, setPwMin] = useState(8)
  useEffect(() => {
    apiGet('/api/meta').then((m) => { if (Number.isInteger(m?.passwordMinLength)) setPwMin(m.passwordMinLength) }).catch(() => {})
  }, [])

  // forgot-password mode: file a reset request; an admin resets manually and
  // contacts the requester via the account email (full email flow = later phase).
  // Two steps: (1) the account EMAIL, (2) the username they claim — optional but
  // recommended (admins compare it to the matched account as a verification signal).
  const [resetSent, setResetSent] = useState('')
  const [forgotStep, setForgotStep] = useState<1 | 2>(1)
  const [resetEmail, setResetEmail] = useState('')
  const [resetUsername, setResetUsername] = useState('')

  // registering with NO email is allowed but risky (no account recovery, no way to
  // verify the account for email-gated features) — a warning modal asks once, with a
  // last-chance optional email input (leave blank to proceed without one)
  const [noEmailAsk, setNoEmailAsk] = useState(false)
  const [modalEmail, setModalEmail] = useState('')

  const switchMode = (next: Mode) => {
    setMode(next); setError(''); setResetSent(''); setPassword(''); setConfirm(''); setNoEmailAsk(false)
    setForgotStep(1); setResetEmail(''); setResetUsername('')
  }

  // Chat is the landing page after any successful sign-in/registration — the router
  // mounts at the CURRENT url (Login renders outside it), so rewrite it to /chat first.
  const goChatFirst = () => history.replaceState(null, '', '/chat')

  const doRegister = async (emailToUse: string) => {
    setBusy(true)
    try {
      await apiPost('/v1/auth/register', {
        username: username.trim(),
        email: emailToUse.trim() || undefined, // optional but used for account recovery
        password,
        displayName: displayName.trim() || undefined,
      })
      goChatFirst()
      await refresh() // register signs you in — pull the fresh session user
    } catch (err) {
      setNoEmailAsk(false)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password !== confirm) { setError('Passwords do not match.'); return }
    if (mode === 'register' && password.length < pwMin) { setError(`Password must be at least ${pwMin} characters.`); return }
    if (mode === 'register' && !email.trim()) {
      // no email — warn before creating the account
      setModalEmail('')
      setNoEmailAsk(true)
      return
    }
    if (mode === 'forgot' && forgotStep === 1) {
      // step 1 -> 2: email captured, ask for the (optional) username next
      if (!resetEmail.trim().includes('@')) { setError('Enter a valid email address.'); return }
      setForgotStep(2)
      return
    }
    setBusy(true)
    try {
      if (mode === 'forgot') {
        const r = await apiPost('/v1/auth/reset-request', {
          email: resetEmail.trim(),
          username: resetUsername.trim() || undefined,
        })
        setResetSent(r.message || 'Request recorded.')
      } else if (mode === 'register') {
        setBusy(false)
        return doRegister(email)
      } else {
        await login(username.trim(), password)
        goChatFirst()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'forgot' ? 'Reset password' : mode === 'register' ? 'Create account' : 'Sign in'
  const blurb =
    mode === 'forgot'
      ? (forgotStep === 1
        ? 'Step 1 of 2 — the email on your account. The administrator resets your password and contacts you there.'
        : 'Step 2 of 2 — your username (optional, but recommended: it helps the administrator verify it’s really you).')
    : mode === 'register' ? 'New accounts start on the member tier — you can upgrade for free from your Account page.'
    : 'Admin & gateway control panel'
  const canSubmit =
    mode === 'forgot' ? (forgotStep === 1 ? Boolean(resetEmail.trim()) : true)
    : mode === 'register' ? Boolean(username.trim() && password && confirm)
    : Boolean(username.trim() && password)

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        className="w-full max-w-[380px] bg-panel-strong border border-line rounded-[14px] p-7 shadow-modal flex flex-col gap-2"
        onSubmit={submit}
      >
        <p className="m-0 text-xs tracking-[0.12em] uppercase text-accent">OteLLMServices</p>
        <h1 className="mt-0.5 mb-0 text-[26px]">{title}</h1>
        <p className="mt-0 mb-3.5 text-muted text-sm">{blurb}</p>

        {expired && mode === 'signin' && !resetSent && (
          <div className="gw-meta gw-warn mb-2" data-ui="session-expired">⏳ Your session expired — please sign in again.</div>
        )}

        {resetSent ? (
          <>
            <div className="gw-meta gw-ok">{resetSent}</div>
            <button type="button" className="gw-btn mt-3 p-2.5" onClick={() => switchMode('signin')}>
              ← Back to sign in
            </button>
          </>
        ) : (
          <>
            {mode === 'forgot' ? (
              forgotStep === 1 ? (
                <>
                  <label className="text-xs text-muted mt-2">Email on your account<Req /></label>
                  <input className="gw-input gw-input-flex" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoFocus spellCheck={false} autoComplete="email" placeholder="you@example.com" />
                </>
              ) : (
                <>
                  <div className="gw-meta">
                    Email: <b>{resetEmail.trim()}</b>{' '}
                    <button type="button" className="text-xs text-accent underline decoration-dotted underline-offset-2 bg-transparent border-0 p-0 cursor-pointer" onClick={() => setForgotStep(1)}>change</button>
                  </div>
                  <label className="text-xs text-muted mt-2">Username (optional — recommended)</label>
                  <input className="gw-input gw-input-flex" value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} autoFocus spellCheck={false} autoComplete="username" placeholder="the username you use to sign in" />
                </>
              )
            ) : (
              <>
                <label className="text-xs text-muted mt-2">{mode === 'register' ? 'Username' : 'Username or email'}<Req /></label>
                <input className="gw-input gw-input-flex" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus spellCheck={false} autoComplete="username" />
              </>
            )}

            {mode === 'register' && (
              <>
                <label className="text-xs text-muted mt-2">Email — optional but used for account recovery</label>
                <input className="gw-input gw-input-flex" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
                <label className="text-xs text-muted mt-2">Display name (optional)</label>
                <input className="gw-input gw-input-flex" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
              </>
            )}

            {mode !== 'forgot' && (
              <>
                <label className="text-xs text-muted mt-2">{mode === 'register' ? `Password (min ${pwMin} characters)` : 'Password'}<Req /></label>
                <input className="gw-input gw-input-flex" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
              </>
            )}
            {mode === 'register' && (
              <>
                <label className="text-xs text-muted mt-2">Confirm password<Req /></label>
                <input className="gw-input gw-input-flex" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </>
            )}

            {error && <div className="gw-meta gw-error">{error}</div>}

            <button className="gw-btn gw-btn-primary mt-4 p-2.5" type="submit" disabled={busy || !canSubmit}>
              {busy
                ? (mode === 'forgot' ? 'Sending…' : mode === 'register' ? 'Creating account…' : 'Signing in…')
                : (mode === 'forgot' ? (forgotStep === 1 ? 'Continue' : 'Request password reset') : mode === 'register' ? 'Create account' : 'Sign in')}
            </button>

            <div className="flex items-center justify-between mt-1">
              {mode === 'signin' ? (
                <>
                  <button type="button" className="text-xs text-accent underline decoration-dotted underline-offset-2 bg-transparent border-0 p-0 cursor-pointer" onClick={() => switchMode('register')}>
                    Create an account
                  </button>
                  <button type="button" className="text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-ink bg-transparent border-0 p-0 cursor-pointer" onClick={() => switchMode('forgot')}>
                    Forgot password?
                  </button>
                </>
              ) : (
                <button type="button" className="text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-ink bg-transparent border-0 p-0 cursor-pointer" onClick={() => switchMode('signin')}>
                  ← Back to sign in
                </button>
              )}
            </div>
          </>
        )}
      </form>

      {noEmailAsk && (
        <div className="fixed inset-0 z-50 p-5 bg-[var(--overlay)] grid place-items-center" {...dismissOnBackdrop(() => setNoEmailAsk(false))}>
          <div
            className="w-full max-w-[420px] bg-panel-strong border border-line rounded-2xl p-5 shadow-modal flex flex-col gap-3"
            data-ui="no-email-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 text-lg">Register without an email?</h3>
            <div className="gw-meta gw-warn">
              ⚠ Without an email, a lost account <b>cannot be recovered</b>, and it can't be
              verified for features that may require it.
            </div>
            <p className="m-0 text-sm text-muted">
              You can register without one — but we recommend adding an email. You can also add
              it later on your Account page after signing in.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Email (optional — leave blank to continue without)</span>
              <input
                className="gw-input"
                type="email"
                value={modalEmail}
                onChange={(e) => setModalEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                autoFocus
              />
            </label>
            <div className="flex gap-2 justify-end mt-1">
              <button type="button" className="gw-btn" disabled={busy} onClick={() => setNoEmailAsk(false)}>Back</button>
              <button
                type="button"
                className="gw-btn gw-btn-primary"
                disabled={busy}
                onClick={() => { if (modalEmail.trim()) setEmail(modalEmail); void doRegister(modalEmail) }}
              >
                {busy ? 'Creating account…' : modalEmail.trim() ? 'Add email & register' : 'Register without email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
