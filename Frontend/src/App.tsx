import { Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, type Capability } from './lib/auth';
import { lazyWithReload } from './lib/lazyWithReload';
import { chatHref } from './lib/lastConversation'
import { openFeedbackFrom } from './lib/feedbackApi';
import { getChatPrefs } from './lib/chatApi';
import { applyThemePref } from './lib/theme';
import FeedbackModalHost from './components/FeedbackModalHost';
import Login from './pages/Login';
import './index.css';

// Route-level code splitting: chat (react-markdown etc.) and the console pages load
// as separate chunks, so neither side pays for the other's bundle. lazyWithReload
// auto-recovers a stale chunk (e.g. after a redeploy) instead of blanking the page.
const ChatApp = lazyWithReload(() => import('./pages/chat/ChatApp'));
const GatewayConsole = lazyWithReload(() => import('./pages/GatewayConsole'));
const UsersPage = lazyWithReload(() => import('./pages/admin/UsersPage'));
const ApiKeysPage = lazyWithReload(() => import('./pages/admin/ApiKeysPage'));
const ProvidersPage = lazyWithReload(() => import('./pages/admin/ProvidersPage'));
const ModelsPage = lazyWithReload(() => import('./pages/admin/ModelsPage'));
const LocalPage = lazyWithReload(() => import('./pages/admin/LocalPage'));
const UsagePage = lazyWithReload(() => import('./pages/admin/UsagePage'));
const FeedbackPage = lazyWithReload(() => import('./pages/admin/FeedbackPage'));
const SkillsPage = lazyWithReload(() => import('./pages/admin/SkillsPage'));
const ComponentsPage = lazyWithReload(() => import('./pages/admin/ComponentsPage'));
const MemoriesPage = lazyWithReload(() => import('./pages/admin/MemoriesPage'));
const SystemPage = lazyWithReload(() => import('./pages/admin/SystemPage'));
const ApiDocsPage = lazyWithReload(() => import('./pages/ApiDocsPage'));
const MyProvidersPage = lazyWithReload(() => import('./pages/MyProvidersPage'));
const MyKeysPage = lazyWithReload(() => import('./pages/MyKeysPage'));
const MyUsagePage = lazyWithReload(() => import('./pages/MyUsagePage'));
const Account = lazyWithReload(() => import('./pages/Account'));

// Console nav — each item declares the capability needed to see it.
// hideForRoot: BYOK is per-user; root configures the GLOBAL providers instead.
// hideForCap: self-service pages step aside when the user has the ADMIN page
// covering the same thing (developer sees My API Keys; admin/root see API Keys).
const NAV: { to: string; label: string; end: boolean; cap: Capability | null; hideForRoot?: boolean; hideForCap?: Capability }[] = [
  { to: '/console', label: 'Playground', end: true, cap: 'console' },
  { to: '/console/users', label: 'Users', end: false, cap: 'manage_users' },
  { to: '/console/apikeys', label: 'API Keys', end: false, cap: 'manage_users' },
  { to: '/console/mykeys', label: 'My API Keys', end: false, cap: 'own_keys', hideForCap: 'manage_users' },
  { to: '/console/providers', label: 'Providers', end: false, cap: 'system_config' },
  { to: '/console/myproviders', label: 'My Providers (BYOK)', end: false, cap: 'select_model', hideForRoot: true },
  { to: '/console/models', label: 'Models', end: false, cap: 'manage_users' }, // root + admin (batch verify)
  { to: '/console/local', label: 'Local', end: false, cap: 'system_config' }, // resident models + attribution + both memory meters
  { to: '/console/usage', label: 'Usage', end: false, cap: 'manage_users' },
  { to: '/console/myusage', label: 'My Usage', end: false, cap: 'own_keys', hideForCap: 'manage_users' },
  { to: '/console/feedback', label: 'Feedback', end: false, cap: 'manage_users' },
  { to: '/console/skills', label: 'Skills', end: false, cap: 'system_config' },
  { to: '/console/components', label: 'Components', end: false, cap: 'system_config' },
  { to: '/console/memories', label: 'Memory', end: false, cap: 'system_config' },
  { to: '/console/system', label: 'System', end: false, cap: 'system_config' },
  { to: '/console/apidocs', label: 'API Docs', end: false, cap: 'console' },
  { to: '/console/account', label: 'Account', end: false, cap: null }, // any logged-in user
];

// Wraps the developer Console pages: topbar (+ switcher back to Chat) and gated nav.
function ConsoleLayout({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const { pathname } = useLocation();
  const visibleNav = NAV.filter((n) =>
    (n.cap === null || can(n.cap)) && !(n.hideForRoot && user?.isRoot) && !(n.hideForCap && can(n.hideForCap)));
  // which console page we're on, for the feedback origin ("Console · Models")
  const pageLabel = NAV.find((n) => (n.end ? pathname === n.to : n.to !== '/console' && pathname.startsWith(n.to)))?.label ?? 'Console';

  return (
    <main className="app-shell">
      <div className="app-glow app-glow-left" aria-hidden="true" />
      <div className="app-glow app-glow-right" aria-hidden="true" />

      <section className="app-frame">
        <header className="adm-topbar">
          <div>
            <p className="hero-kicker">OteLLMServices</p>
            <h1 className="adm-topbar-title">Console</h1>
          </div>
          <div className="adm-topbar-user">
            <button
              className="gw-btn adm-btn-sm chat-foot-feedback"
              title={`Send feedback about this page (${pageLabel})`}
              onClick={() => openFeedbackFrom(`Console · ${pageLabel}`)}
            >📣 Feedback</button>
            <Link className="gw-btn adm-btn-sm" to={chatHref()}>← Chat</Link>
            <span className="adm-dim" title={user?.displayName ? `@${user?.username}` : undefined}>
              {user?.displayName || user?.username} · {user?.isRoot ? 'root' : (user?.roles.join(', ') || 'no roles')}
            </span>
            <button className="gw-btn adm-btn-sm" onClick={logout}>Sign out</button>
          </div>
        </header>

        <nav className="app-nav" aria-label="Primary">
          {visibleNav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => (isActive ? 'app-nav-link active' : 'app-nav-link')}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        {children}
        <FeedbackModalHost />
      </section>
    </main>
  );
}

function AppRouter() {
  const { can } = useAuth();
  const hasConsole = can('console');

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="app-shell"><div className="adm-loading">Loading…</div></div>}>
      <Routes>
        {/* Chat is universal (everyone has the chat capability). Each conversation is
            a route (/chat/:conversationId) so refresh/back land on the right chat. */}
        <Route path="/chat" element={<ChatApp />} />
        <Route path="/chat/:conversationId" element={<ChatApp />} />

        {/* Console — gated per page; non-console users get bounced to Chat. */}
        <Route
          path="/console"
          element={hasConsole ? <ConsoleLayout><GatewayConsole /></ConsoleLayout> : <Navigate to="/chat" replace />}
        />
        <Route path="/console/account" element={<ConsoleLayout><Account /></ConsoleLayout>} />
        {can('select_model') && <Route path="/console/myproviders" element={<ConsoleLayout><MyProvidersPage /></ConsoleLayout>} />}
        {can('own_keys') && <Route path="/console/mykeys" element={<ConsoleLayout><MyKeysPage /></ConsoleLayout>} />}
        {can('own_keys') && <Route path="/console/myusage" element={<ConsoleLayout><MyUsagePage /></ConsoleLayout>} />}
        {can('manage_users') && <Route path="/console/users" element={<ConsoleLayout><UsersPage /></ConsoleLayout>} />}
        {can('manage_users') && <Route path="/console/apikeys" element={<ConsoleLayout><ApiKeysPage /></ConsoleLayout>} />}
        {can('system_config') && <Route path="/console/providers" element={<ConsoleLayout><ProvidersPage /></ConsoleLayout>} />}
        {can('manage_users') && <Route path="/console/models" element={<ConsoleLayout><ModelsPage /></ConsoleLayout>} />}
        {can('system_config') && <Route path="/console/local" element={<ConsoleLayout><LocalPage /></ConsoleLayout>} />}
        {can('manage_users') && <Route path="/console/usage" element={<ConsoleLayout><UsagePage /></ConsoleLayout>} />}
        {can('manage_users') && <Route path="/console/feedback" element={<ConsoleLayout><FeedbackPage /></ConsoleLayout>} />}
        {can('system_config') && <Route path="/console/skills" element={<ConsoleLayout><SkillsPage /></ConsoleLayout>} />}
        {can('system_config') && <Route path="/console/components" element={<ConsoleLayout><ComponentsPage /></ConsoleLayout>} />}
        {can('system_config') && <Route path="/console/memories" element={<ConsoleLayout><MemoriesPage /></ConsoleLayout>} />}
        {can('system_config') && <Route path="/console/system" element={<ConsoleLayout><SystemPage /></ConsoleLayout>} />}
        {can('console') && <Route path="/console/apidocs" element={<ConsoleLayout><ApiDocsPage /></ConsoleLayout>} />}

        {/* Default + unknown -> Chat */}
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

// Pull the user's theme preference from their chat prefs (DB — synced across devices)
// once per login and apply it. Until this resolves the page runs on the localStorage
// mirror from the LAST visit (index.html applied it pre-paint; first-ever visit = dark).
function ThemeSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!user) return;
    getChatPrefs()
      .then(({ prefs }) => {
        const t = (prefs as { theme?: string }).theme;
        if (t === 'light' || t === 'dark' || t === 'system') applyThemePref(t);
      })
      .catch(() => { /* keep the cached theme — prefs are cosmetic, never block */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return null;
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-shell"><div className="adm-loading">Loading…</div></div>;
  if (!user) return <Login />;
  return <><ThemeSync /><AppRouter /></>;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
