import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api'
import ConfirmModal from '../../components/ConfirmModal'
import ModelCombo from '../../components/ModelCombo'
import ClearableSelect from '../../components/ClearableSelect'
import RefreshButton from '../../components/RefreshButton'
import { CHAT_MODELS_KEY, markModelsFetched, modelsNeedRefresh } from '../../lib/modelRefresh'
import { cell, ui } from './ui'
import { dismissOnBackdrop } from '../../lib/overlay'

// Root-only platform configuration. Everything here follows the provider-config model:
// config.json holds the DEFAULTS, changes are stored in the settings DB table and
// override them (source chip shows which layer is active); null/Reset reverts.

type SettingEntry = { value: unknown; source: 'db' | 'default'; description: string }
type Settings = Record<string, SettingEntry>
type LogFile = { name: string; kind: string; bytes: number; modifiedAt: string }

const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`)
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// Small pill showing which layer a setting comes from — visually distinct from the label.
const SourceChip = ({ s }: { s?: SettingEntry }) => (
  s ? (
    <span
      className={`ml-1.5 inline-block align-middle rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${
        s.source === 'db' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-[var(--code-bg)] text-muted border-line'
      }`}
      title={s.source === 'db' ? 'Set from the console (stored in the database) — Reset reverts to the config.json default' : 'Using the config.json default'}
    >{s.source === 'db' ? 'custom' : 'default'}</span>
  ) : null
)

export default function SystemPage() {
  const [tab, setTab] = useState<'chat' | 'accounts' | 'limits' | 'security' | 'api' | 'schedules' | 'logs'>('chat')
  type AdminSchedule = {
    id: string; username: string; name: string; enabled: boolean
    trigger: { type: string; every?: string; expr?: string; tz?: string; at?: string }
    action: { skillId?: string }
    nextRunAt: string | null; lastRunAt: string | null
    lastStatus: string | null; lastError: string | null; lastDurationMs: number | null
  }
  const [adminSchedules, setAdminSchedules] = useState<AdminSchedule[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState('')

  // ---- chat defaults draft ----
  const [dModel, setDModel] = useState('')
  const [dSummary, setDSummary] = useState('')
  const [dTitle, setDTitle] = useState('')
  const [dAssistModel, setDAssistModel] = useState('') // '' = the schedule form's own pick
  const [dRelay, setDRelay] = useState('')
  const [dToolsOn, setDToolsOn] = useState(true)
  const [dMaxCalls, setDMaxCalls] = useState('8')
  const [dBgGen, setDBgGen] = useState(false)
  const [dMaxConc, setDMaxConc] = useState('2')
  const [dUnlockRoles, setDUnlockRoles] = useState<string[]>([])
  const [dSteer, setDSteer] = useState(false)
  const [dSkillTrigger, setDSkillTrigger] = useState(true)
  const [dSkillBinding, setDSkillBinding] = useState(true)
  const [dSlashCmds, setDSlashCmds] = useState(true)
  const [dMaxSched, setDMaxSched] = useState('10')
  const [dSchedMinInt, setDSchedMinInt] = useState('5')
  const [dSchedRoles, setDSchedRoles] = useState<string[]>(['admin', 'developer', 'power'])
  const [dAskTimeout, setDAskTimeout] = useState('300') // ask_user question hold (seconds)
  const [dFirstTok, setDFirstTok] = useState('180') // first-token watchdog (seconds, 0 = off)
  const [dDegenGuard, setDDegenGuard] = useState(true) // repetition-collapse guard
  const [dMarathonOn, setDMarathonOn] = useState(true) // Marathon mode platform switch
  const [dMarathonMax, setDMarathonMax] = useState('6') // Marathon auto-continue cap
  const [dNumCtx, setDNumCtx] = useState('0')
  const [dAutoCtx, setDAutoCtx] = useState(true)
  const [dAutoCtxPct, setDAutoCtxPct] = useState('90')
  const [dMaxSteers, setDMaxSteers] = useState('5')
  // default ⚙ options for NEW chats (chat.defaultOptions — partial over the built-ins)
  const [oThink, setOThink] = useState(true)
  const [oEffort, setOEffort] = useState('low') // '' = auto (model decides)
  const [oStream, setOStream] = useState(true)
  const [oMemory, setOMemory] = useState(true)
  const [oTools, setOTools] = useState(true)
  const [oTemp, setOTemp] = useState('')
  const [oTopP, setOTopP] = useState('')
  const [oMaxTok, setOMaxTok] = useState('')
  const [oInstr, setOInstr] = useState('')
  const [chatMsg, setChatMsg] = useState('')

  // ---- accounts draft (self-service registration + free member->power upgrade) ----
  const [aRegister, setARegister] = useState(true)
  const [aUpgrade, setAUpgrade] = useState(true)
  const [accMsg, setAccMsg] = useState('')

  // ---- token limits draft (per-user metering defaults + feedback reward tiers) ----
  const [lEnabled, setLEnabled] = useState(true)
  const [lDaily, setLDaily] = useState('888000')
  const [lMonthly, setLMonthly] = useState('0')
  const [lTier1, setLTier1] = useState('50000')
  const [lTier2, setLTier2] = useState('500000')
  const [lTier3, setLTier3] = useState('1000000')
  const [lSelfReward, setLSelfReward] = useState(false)
  const [limMsg, setLimMsg] = useState('')

  // ---- security draft ----
  const [sLogin, setSLogin] = useState('8')
  const [sLoginIp, setSLoginIp] = useState('30')
  const [sReveal, setSReveal] = useState('8')
  const [sWindow, setSWindow] = useState('15')
  const [sPwMin, setSPwMin] = useState('8')
  const [secMsg, setSecMsg] = useState('')

  // ---- Anthropic API surface draft (claude-* → platform model routing) ----
  const [apiRows, setApiRows] = useState<{ pattern: string; target: string }[]>([])
  const [apiDefault, setApiDefault] = useState('')
  const [apiAdvertised, setApiAdvertised] = useState('')
  const [apiMsg, setApiMsg] = useState('')

  // known Claude ids to map FROM — live from an anthropic-kind provider when one can
  // list models, else the server's built-in catalog; loaded lazily on the tab
  const [catalog, setCatalog] = useState<{ models: string[]; source: string; provider: string | null } | null>(null)
  const loadCatalog = useCallback((fresh = false) => {
    apiGet(`/v1/admin/anthropic-catalog${fresh ? '?fresh=1' : ''}`).then((r) => setCatalog(r)).catch(() => {})
  }, [])
  useEffect(() => { if (tab === 'api' && !catalog) loadCatalog() }, [tab, catalog, loadCatalog])
  const addCatalogRule = (id: string) =>
    setApiRows((rows) => (rows.some((r) => r.pattern.trim() === id) ? rows : [...rows, { pattern: id, target: '' }]))

  // active lockouts & failure counters (in-memory buckets; root can clear one or all)
  type Lockout = { key: string; kind: string; target: string; ip: string | null; count: number; locked: boolean; retryAfterSeconds: number | null; windowStartedAt: string }
  const [lockouts, setLockouts] = useState<Lockout[]>([])
  const loadLockouts = useCallback(() => {
    apiGet('/v1/admin/security/lockouts').then((r) => setLockouts(r.lockouts || [])).catch(() => {})
  }, [])

  // ---- logs ----
  const [logs, setLogs] = useState<LogFile[]>([])
  const [logDir, setLogDir] = useState('')
  const [logTotal, setLogTotal] = useState(0)
  const [logMsg, setLogMsg] = useState('')
  const [clearDays, setClearDays] = useState('7')
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => Promise<void> } | null>(null)

  // log search (grep across all files) + per-file viewer
  type LogMatch = { file: string; line: number; text: string }
  const [logQ, setLogQ] = useState('')
  const [logSearching, setLogSearching] = useState(false)
  const [logMatches, setLogMatches] = useState<LogMatch[] | null>(null)
  const [logSearchMeta, setLogSearchMeta] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  const [viewerText, setViewerText] = useState('')
  const [viewerInfo, setViewerInfo] = useState('')
  const [viewerTail, setViewerTail] = useState('256')
  const [viewerFilter, setViewerFilter] = useState('')
  const [viewerLoading, setViewerLoading] = useState(false)

  const searchLogs = async () => {
    const q = logQ.trim()
    if (q.length < 2) { setLogSearchMeta('Type at least 2 characters.'); return }
    setLogSearching(true); setLogSearchMeta(''); setLogMatches(null)
    try {
      const r = await apiGet(`/v1/admin/logs/search?q=${encodeURIComponent(q)}`)
      setLogMatches(r.matches || [])
      setLogSearchMeta(`${r.matches?.length ?? 0} match(es) across ${r.scannedFiles} file(s)${r.capped ? ' — capped at 300, narrow the query' : ''}${r.skippedFiles ? ` (${r.skippedFiles} oversized file(s) skipped)` : ''}`)
    } catch (e) {
      setLogSearchMeta(e instanceof Error ? e.message : String(e))
    } finally {
      setLogSearching(false)
    }
  }

  const openLog = async (name: string, filter = '', tailKb = viewerTail) => {
    setViewing(name); setViewerFilter(filter); setViewerText(''); setViewerInfo(''); setViewerLoading(true)
    try {
      const r = await apiGet(`/v1/admin/logs/${encodeURIComponent(name)}/content?tailKb=${encodeURIComponent(tailKb)}`)
      setViewerText(r.content || '')
      setViewerInfo(`${fmtBytes(r.bytes)}${r.truncated ? ` — showing the last ${tailKb} KB` : ' — full file'}`)
    } catch (e) {
      setViewerInfo(e instanceof Error ? e.message : String(e))
    } finally {
      setViewerLoading(false)
    }
  }
  const viewerLines = viewerFilter.trim()
    ? viewerText.split('\n').filter((l) => l.toLowerCase().includes(viewerFilter.trim().toLowerCase()))
    : viewerText.split('\n')

  const loadSettings = useCallback(() => {
    apiGet('/v1/admin/settings').then((r) => {
      const s: Settings = r.settings || {}
      setSettings(s)
      setDModel(String(s['chat.defaultModel']?.value ?? ''))
      setDSummary(String(s['chat.summaryModel']?.value ?? ''))
      setDTitle(String(s['chat.titleModel']?.value ?? ''))
      setDAssistModel(String(s['chat.scheduleAssistModel']?.value ?? ''))
      setDRelay(String(s['chat.visionRelayModel']?.value ?? ''))
      setDToolsOn(Boolean(s['chat.toolsEnabled']?.value ?? true))
      setDMaxCalls(String(s['chat.toolsMaxCalls']?.value ?? 8))
      setDBgGen(Boolean(s['chat.backgroundGeneration']?.value ?? false))
      setDMaxConc(String(s['chat.backgroundMaxConcurrent']?.value ?? 2))
      setDUnlockRoles(((s['chat.personalDefaultModelRoles']?.value ?? []) as string[]))
      setDSteer(Boolean(s['chat.steerEnabled']?.value ?? false))
      setDSkillTrigger(Boolean(s['chat.skillTriggerEnabled']?.value ?? true))
      setDSkillBinding(Boolean(s['chat.skillBindingEnabled']?.value ?? true))
      setDSlashCmds(Boolean(s['chat.slashCommandsEnabled']?.value ?? true))
      setDMaxSched(String(s['chat.maxSchedulesPerUser']?.value ?? 10))
      setDSchedMinInt(String(s['chat.scheduleMinIntervalMinutes']?.value ?? 5))
      setDAskTimeout(String(s['chat.interactionTimeoutSeconds']?.value ?? 300))
      setDFirstTok(String(s['chat.firstTokenTimeoutSeconds']?.value ?? 180))
      setDDegenGuard(Boolean(s['chat.degenerationGuard']?.value ?? true))
      setDMarathonOn(Boolean(s['chat.marathonEnabled']?.value ?? true))
      setDMarathonMax(String(s['chat.marathonMaxRounds']?.value ?? 6))
      setDSchedRoles(Array.isArray(s['chat.scheduleRoles']?.value) ? s['chat.scheduleRoles'].value : ['admin', 'developer', 'power'])
      setDNumCtx(String(s['providers.ollamaNumCtxLimit']?.value ?? 0))
      setDAutoCtx(Boolean(s['providers.ollamaAutoCtx']?.value ?? true))
      setDAutoCtxPct(String(s['providers.ollamaCtxOptimalPct']?.value ?? 90))
      setDMaxSteers(String(s['chat.maxSteersPerReply']?.value ?? 5))
      const o = (s['chat.defaultOptions']?.value ?? {}) as Record<string, unknown>
      setOThink(typeof o.thinkingEnabled === 'boolean' ? o.thinkingEnabled : true)
      setOEffort(o.thinkingEffort === undefined ? 'low' : (o.thinkingEffort === null ? '' : String(o.thinkingEffort)))
      setOStream(typeof o.stream === 'boolean' ? o.stream : true)
      setOMemory(typeof o.useMemory === 'boolean' ? o.useMemory : true)
      setOTools(typeof o.toolsEnabled === 'boolean' ? o.toolsEnabled : true)
      setOTemp(o.temperature == null ? '' : String(o.temperature))
      setOTopP(o.top_p == null ? '' : String(o.top_p))
      setOMaxTok(o.max_tokens == null ? '' : String(o.max_tokens))
      setOInstr(typeof o.customInstructions === 'string' ? o.customInstructions : '')
      setARegister(Boolean(s['auth.registrationEnabled']?.value ?? true))
      setAUpgrade(Boolean(s['auth.selfUpgradeEnabled']?.value ?? true))
      setLEnabled(Boolean(s['limits.enabled']?.value ?? true))
      setLDaily(String(s['limits.defaultDailyTokens']?.value ?? 888000))
      setLMonthly(String(s['limits.defaultMonthlyTokens']?.value ?? 0))
      setLTier1(String(s['limits.rewardTier1Tokens']?.value ?? 50000))
      setLTier2(String(s['limits.rewardTier2Tokens']?.value ?? 500000))
      setLTier3(String(s['limits.rewardTier3Tokens']?.value ?? 1000000))
      setLSelfReward(Boolean(s['limits.allowSelfReward']?.value ?? false))
      setSLogin(String(s['security.loginMaxAttempts']?.value ?? 8))
      setSLoginIp(String(s['security.loginIpMaxAttempts']?.value ?? 30))
      setSReveal(String(s['security.revealMaxAttempts']?.value ?? 8))
      setSWindow(String(s['security.rateWindowMinutes']?.value ?? 15))
      setSPwMin(String(s['security.passwordMinLength']?.value ?? 8))
      const mm = (s['api.anthropic.modelMap']?.value ?? {}) as Record<string, string>
      setApiRows(Object.entries(mm).map(([pattern, target]) => ({ pattern, target })))
      setApiDefault(String(s['api.anthropic.defaultModel']?.value ?? ''))
      setApiAdvertised(((s['api.anthropic.advertisedModels']?.value ?? []) as string[]).join(', '))
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  const loadLogs = useCallback(() => {
    apiGet('/v1/admin/logs').then((r) => { setLogs(r.files || []); setLogDir(r.directory || ''); setLogTotal(r.totalBytes || 0) }).catch(() => {})
  }, [])
  useEffect(() => { loadSettings(); loadLogs() }, [loadSettings, loadLogs])
  // model list for the pickers: loaded up front, re-fetched (throttled) whenever a
  // picker opens so new providers/models appear without a page reload
  const loadModels = useCallback(() => {
    markModelsFetched(CHAT_MODELS_KEY)
    apiGet('/v1/chat/models').then((r) => setModels((r.models || []).map((m: { id: string }) => m.id))).catch(() => {})
  }, [])
  useEffect(() => { loadModels() }, [loadModels])

  const saveChat = async () => {
    setChatMsg(''); setError('')
    const n = Math.floor(Number(dMaxCalls))
    try {
      const conc = Math.floor(Number(dMaxConc))
      const steers = Math.floor(Number(dMaxSteers))
      const numOrNull = (s: string) => { const v = Number(s); return s.trim() === '' || !Number.isFinite(v) ? null : v }
      await apiPatch('/v1/admin/settings', {
        'chat.defaultModel': dModel || null,
        'chat.summaryModel': dSummary, // '' is valid: use the conversation's model
        'chat.titleModel': dTitle, // '' is valid: fall back to the summary model
        'chat.scheduleAssistModel': dAssistModel, // '' is valid: the schedule form's own pick
        'chat.visionRelayModel': dRelay || null,
        'chat.toolsEnabled': dToolsOn,
        'chat.toolsMaxCalls': Number.isFinite(n) ? n : 8,
        'chat.backgroundGeneration': dBgGen,
        'chat.backgroundMaxConcurrent': Number.isFinite(conc) && conc >= 1 ? conc : 2,
        'chat.personalDefaultModelRoles': dUnlockRoles,
        'chat.steerEnabled': dSteer,
        'chat.skillTriggerEnabled': dSkillTrigger,
        'chat.skillBindingEnabled': dSkillBinding,
        'chat.slashCommandsEnabled': dSlashCmds,
        'chat.maxSchedulesPerUser': (() => { const v = Math.floor(Number(dMaxSched)); return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 10 })(),
        'chat.scheduleMinIntervalMinutes': (() => { const v = Math.floor(Number(dSchedMinInt)); return Number.isFinite(v) && v >= 1 && v <= 1440 ? v : 5 })(),
        'chat.scheduleRoles': dSchedRoles,
        'chat.interactionTimeoutSeconds': (() => { const v = Math.floor(Number(dAskTimeout)); return Number.isFinite(v) && v >= 10 && v <= 3600 ? v : 300 })(),
        'chat.firstTokenTimeoutSeconds': (() => { const v = Math.floor(Number(dFirstTok)); return Number.isFinite(v) && v >= 0 && v <= 1800 ? v : 180 })(),
        'chat.degenerationGuard': dDegenGuard,
        'chat.marathonEnabled': dMarathonOn,
        'chat.marathonMaxRounds': (() => { const v = Math.floor(Number(dMarathonMax)); return Number.isFinite(v) && v >= 1 && v <= 20 ? v : 6 })(),
        'chat.maxSteersPerReply': Number.isFinite(steers) && steers >= 1 ? steers : 5,
        'providers.ollamaNumCtxLimit': (() => { const v = Math.floor(Number(dNumCtx)); return Number.isFinite(v) && v >= 0 ? v : 0 })(),
        'providers.ollamaAutoCtx': dAutoCtx,
        'providers.ollamaCtxOptimalPct': (() => { const v = Math.floor(Number(dAutoCtxPct)); return Number.isFinite(v) && v >= 10 && v <= 100 ? v : 90 })(),
        'chat.defaultOptions': {
          thinkingEnabled: oThink,
          thinkingEffort: oEffort === '' ? null : oEffort,
          stream: oStream,
          useMemory: oMemory,
          toolsEnabled: oTools,
          temperature: numOrNull(oTemp),
          top_p: numOrNull(oTopP),
          max_tokens: (() => { const v = Math.floor(Number(oMaxTok)); return oMaxTok.trim() === '' || !Number.isFinite(v) || v <= 0 ? null : v })(),
          customInstructions: oInstr.slice(0, 2000),
        },
      })
      setChatMsg('Saved — applies immediately. (Changing the default model also resets every user’s personal default to it.)')
      loadSettings()
    } catch (e) { setChatMsg(e instanceof Error ? e.message : String(e)) }
  }
  const resetChat = async () => {
    setChatMsg('')
    try {
      await apiPatch('/v1/admin/settings', {
        'chat.defaultModel': null, 'chat.summaryModel': null, 'chat.titleModel': null, 'chat.scheduleAssistModel': null, 'chat.visionRelayModel': null,
        'chat.toolsEnabled': null, 'chat.toolsMaxCalls': null, 'chat.backgroundGeneration': null,
        'chat.backgroundMaxConcurrent': null, 'chat.personalDefaultModelRoles': null,
        'chat.steerEnabled': null, 'chat.maxSteersPerReply': null, 'chat.skillTriggerEnabled': null,
        'chat.skillBindingEnabled': null, 'chat.slashCommandsEnabled': null,
        'chat.maxSchedulesPerUser': null, 'chat.scheduleMinIntervalMinutes': null, 'chat.scheduleRoles': null,
        'chat.interactionTimeoutSeconds': null,
        'chat.firstTokenTimeoutSeconds': null, 'chat.degenerationGuard': null,
        'chat.marathonEnabled': null, 'chat.marathonMaxRounds': null,
        'providers.ollamaNumCtxLimit': null, 'providers.ollamaAutoCtx': null, 'providers.ollamaCtxOptimalPct': null,
        'chat.defaultOptions': null,
      })
      setChatMsg('Reverted to the config.json defaults.')
      loadSettings()
    } catch (e) { setChatMsg(e instanceof Error ? e.message : String(e)) }
  }

  const saveAccounts = async () => {
    setAccMsg('')
    try {
      await apiPatch('/v1/admin/settings', {
        'auth.registrationEnabled': aRegister,
        'auth.selfUpgradeEnabled': aUpgrade,
      })
      setAccMsg('Saved — applies immediately.')
      loadSettings()
    } catch (e) { setAccMsg(e instanceof Error ? e.message : String(e)) }
  }
  const resetAccounts = async () => {
    setAccMsg('')
    try {
      await apiPatch('/v1/admin/settings', { 'auth.registrationEnabled': null, 'auth.selfUpgradeEnabled': null })
      setAccMsg('Reverted to defaults.')
      loadSettings()
    } catch (e) { setAccMsg(e instanceof Error ? e.message : String(e)) }
  }

  const saveLimits = async () => {
    setLimMsg('')
    const int = (s: string, fallback: number) => { const n = Math.floor(Number(s)); return Number.isFinite(n) && n >= 0 ? n : fallback }
    try {
      await apiPatch('/v1/admin/settings', {
        'limits.enabled': lEnabled,
        'limits.defaultDailyTokens': int(lDaily, 888000),
        'limits.defaultMonthlyTokens': int(lMonthly, 0),
        'limits.rewardTier1Tokens': Math.max(1, int(lTier1, 50000)),
        'limits.rewardTier2Tokens': Math.max(1, int(lTier2, 500000)),
        'limits.rewardTier3Tokens': Math.max(1, int(lTier3, 1000000)),
        'limits.allowSelfReward': lSelfReward,
      })
      setLimMsg('Saved — applies to the next request.')
      loadSettings()
    } catch (e) { setLimMsg(e instanceof Error ? e.message : String(e)) }
  }
  const resetLimits = async () => {
    setLimMsg('')
    try {
      await apiPatch('/v1/admin/settings', {
        'limits.enabled': null, 'limits.defaultDailyTokens': null, 'limits.defaultMonthlyTokens': null,
        'limits.rewardTier1Tokens': null, 'limits.rewardTier2Tokens': null, 'limits.rewardTier3Tokens': null,
        'limits.allowSelfReward': null,
      })
      setLimMsg('Reverted to the config.json defaults.')
      loadSettings()
    } catch (e) { setLimMsg(e instanceof Error ? e.message : String(e)) }
  }

  const saveSecurity = async () => {
    setSecMsg('')
    try {
      await apiPatch('/v1/admin/settings', {
        'security.loginMaxAttempts': Math.floor(Number(sLogin)),
        'security.loginIpMaxAttempts': Math.floor(Number(sLoginIp)),
        'security.revealMaxAttempts': Math.floor(Number(sReveal)),
        'security.rateWindowMinutes': Math.floor(Number(sWindow)),
        'security.passwordMinLength': Math.floor(Number(sPwMin)),
      })
      setSecMsg('Saved — applies to the next attempt.')
      loadSettings()
    } catch (e) { setSecMsg(e instanceof Error ? e.message : String(e)) }
  }
  const resetSecurity = async () => {
    setSecMsg('')
    try {
      await apiPatch('/v1/admin/settings', {
        'security.loginMaxAttempts': null, 'security.loginIpMaxAttempts': null,
        'security.revealMaxAttempts': null, 'security.rateWindowMinutes': null,
        'security.passwordMinLength': null,
      })
      setSecMsg('Reverted to defaults.')
      loadSettings()
    } catch (e) { setSecMsg(e instanceof Error ? e.message : String(e)) }
  }
  const patchApiRow = (i: number, patch: Partial<{ pattern: string; target: string }>) =>
    setApiRows((rows) => rows.map((r, x) => (x === i ? { ...r, ...patch } : r)))
  const saveApi = async () => {
    setApiMsg('')
    const map: Record<string, string> = {}
    for (const r of apiRows) {
      const k = r.pattern.trim()
      if (!k) continue
      if (!r.target) { setApiMsg(`Pick a target model for '${k}'.`); return }
      map[k] = r.target
    }
    try {
      await apiPatch('/v1/admin/settings', {
        'api.anthropic.modelMap': map,
        'api.anthropic.defaultModel': apiDefault, // '' = fall back to the chat default model
        'api.anthropic.advertisedModels': apiAdvertised.split(',').map((x) => x.trim()).filter(Boolean),
      })
      setApiMsg('Saved — applies immediately, no restart.')
      loadSettings()
    } catch (e) { setApiMsg(e instanceof Error ? e.message : String(e)) }
  }
  const resetApi = async () => {
    setApiMsg('')
    try {
      await apiPatch('/v1/admin/settings', {
        'api.anthropic.modelMap': null, 'api.anthropic.defaultModel': null, 'api.anthropic.advertisedModels': null,
      })
      setApiMsg('Reverted to the config.json defaults.')
      loadSettings()
    } catch (e) { setApiMsg(e instanceof Error ? e.message : String(e)) }
  }

  const clearLockouts = async () => {
    setSecMsg('')
    try { await apiPost('/v1/admin/security/rate-limits/reset', {}); setSecMsg('All active lockouts cleared.'); loadLockouts() }
    catch (e) { setSecMsg(e instanceof Error ? e.message : String(e)) }
  }
  const clearOneLockout = async (key: string) => {
    setSecMsg('')
    try { await apiPost('/v1/admin/security/lockouts/clear', { key }); loadLockouts() }
    catch (e) { setSecMsg(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => { if (tab === 'security') loadLockouts() }, [tab, loadLockouts])
  const loadAdminSchedules = useCallback(() => {
    apiGet('/v1/admin/schedules').then((r) => setAdminSchedules(r.schedules || [])).catch(() => {})
  }, [])
  useEffect(() => { if (tab === 'schedules') loadAdminSchedules() }, [tab, loadAdminSchedules])

  const modelSelect = (value: string, onChange: (v: string) => void, emptyLabel?: string, pinnedOptions?: { value: string; label: string }[]) => (
    <ModelCombo
      items={value && !models.includes(value) && !pinnedOptions?.some((o) => o.value === value) ? [value, ...models] : models}
      value={value}
      onChange={onChange}
      onOpen={() => { if (modelsNeedRefresh(CHAT_MODELS_KEY)) loadModels() }}
      emptyLabel={emptyLabel}
      pinnedOptions={pinnedOptions}
      showFullValue
    />
  )

  return (
    <div className={`${ui.page} flex flex-col gap-5`}>
      <div>
        <h2 className={ui.h2}>System</h2>
        <p className="adm-dim">Platform configuration (root). Same layering as Providers: <code className={ui.codeChip}>Backend/config.json</code> holds the <b>defaults</b>; changes here are stored in the database and override them. Reset reverts to the file.</p>
        <div className="flex items-center gap-1.5 mt-2" data-ui="system-tabs">
          <button className={`gw-btn adm-btn-sm ${tab === 'chat' ? 'gw-btn-primary' : ''}`} onClick={() => setTab('chat')}>Chat defaults</button>
          <button className={`gw-btn adm-btn-sm ${tab === 'accounts' ? 'gw-btn-primary' : ''}`} onClick={() => setTab('accounts')}>Accounts</button>
          <button className={`gw-btn adm-btn-sm ${tab === 'limits' ? 'gw-btn-primary' : ''}`} onClick={() => setTab('limits')}>Token limits</button>
          <button className={`gw-btn adm-btn-sm ${tab === 'security' ? 'gw-btn-primary' : ''}`} onClick={() => setTab('security')}>Security</button>
          <button className={`gw-btn adm-btn-sm ${tab === 'api' ? 'gw-btn-primary' : ''}`} onClick={() => setTab('api')}>Claude API</button>
          <button className={`gw-btn adm-btn-sm ${tab === 'schedules' ? 'gw-btn-primary' : ''}`} onClick={() => setTab('schedules')}>Schedules</button>
          <button className={`gw-btn adm-btn-sm ${tab === 'logs' ? 'gw-btn-primary' : ''}`} onClick={() => setTab('logs')}>Server logs · {logs.length}</button>
          <RefreshButton className="ml-auto" onRefresh={async () => {
            loadSettings(); loadModels()
            if (tab === 'security') loadLockouts()
            if (tab === 'logs') loadLogs()
            if (tab === 'api') loadCatalog(true)
          }} />
        </div>
      </div>
      {error && <div className="gw-meta gw-error">{error}</div>}

      {/* ---- chat defaults ---- */}
      {tab === 'chat' && (
      <section className="gw-card" data-ui="chat-defaults-card">
        <div className="gw-card-title">Chat defaults</div>
        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
          <div className={ui.groupHead}>Models</div>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Default model — new chats + member-role users<SourceChip s={settings['chat.defaultModel']} /></span>
            {modelSelect(dModel, setDModel)}
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Summary model — rolling compaction<SourceChip s={settings['chat.summaryModel']} /></span>
            {modelSelect(dSummary, setDSummary, "(use the conversation's model)")}
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Title model — names conversations<SourceChip s={settings['chat.titleModel']} /></span>
            {modelSelect(dTitle, setDTitle, '(use the summary model)', [{ value: '@chat', label: "(use the chat's own model — no reload)" }])}
          </label>
          <label className={ui.field} data-ui="schedule-assist-model">
            <span className={ui.fieldLabel}>Schedules prompt model — interprets “describe it”<SourceChip s={settings['chat.scheduleAssistModel']} /></span>
            {modelSelect(dAssistModel, setDAssistModel, '(the model picked in the schedule form)')}
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Vision relay model — describes images for blind models<SourceChip s={settings['chat.visionRelayModel']} /></span>
            {modelSelect(dRelay, setDRelay)}
          </label>
          <div className={ui.field} data-ui="personal-default-roles">
            <span className={ui.fieldLabel}>Personal default model — unlocked roles<SourceChip s={settings['chat.personalDefaultModelRoles']} /></span>
            <div className="flex items-center gap-4">
              {(['admin', 'developer', 'power'] as const).map((r) => (
                <label key={r} className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={dUnlockRoles.includes(r)}
                    onChange={(e) => setDUnlockRoles((cur) => e.target.checked ? [...cur, r] : cur.filter((x) => x !== r))} />
                  <span>{r}</span>
                </label>
              ))}
            </div>
            <span className="adm-dim text-[12px]">
              Checked roles may pick their own default model for new chats (Options → Chat). Members always follow the
              platform default; root controls it here. <b>Changing the default model above resets every user's personal
              default to the new model.</b>
            </span>
          </div>
          <div className={ui.groupHead}>Tools &amp; skills</div>
          <div className={ui.field}>
            <span className={ui.fieldLabel}>Agent tools<SourceChip s={settings['chat.toolsEnabled']} /></span>
            <div className="flex items-center gap-4 h-[38px]">
              <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={dToolsOn} onChange={(e) => setDToolsOn(e.target.checked)} />
                <span>Enabled</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
                Max rounds<SourceChip s={settings['chat.toolsMaxCalls']} />
                <input className="gw-input !w-16" value={dMaxCalls} onChange={(e) => setDMaxCalls(e.target.value)} autoComplete="off" disabled={!dToolsOn} />
              </label>
            </div>
            <span className="adm-dim text-[12px]">
              Whether chat replies may call the installed tools (memory, search, …); <b>Max rounds</b> caps the tool
              steps one reply may take before it must answer. Users can turn tools off per chat (Options → ⚙).
            </span>
          </div>
          <div className={ui.field} data-ui="stream-rails">
            <span className={ui.fieldLabel}>Generation rails</span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
                First-token timeout (s)<SourceChip s={settings['chat.firstTokenTimeoutSeconds']} />
                <input className="gw-input !w-20" value={dFirstTok} onChange={(e) => setDFirstTok(e.target.value)} autoComplete="off" inputMode="numeric" data-ui="first-token-timeout" />
              </label>
              <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={dDegenGuard} onChange={(e) => setDDegenGuard(e.target.checked)} data-ui="degen-guard-toggle" />
                <span>Repetition-collapse guard<SourceChip s={settings['chat.degenerationGuard']} /></span>
              </label>
            </div>
            <span className="adm-dim text-[12px]">
              <b>First-token timeout</b>: if a reply's very first token doesn't arrive in time (a wedged model load),
              the turn ends with an honest error instead of a forever-blinking cursor (0 = never; slow <i>generation</i> is
              never cut). <b>Collapse guard</b>: when a model falls into a repetition loop ("…and floating islands and
              floating islands…"), the reply is cut with a visible note instead of streaming a wall of junk.
            </span>
          </div>
          <div className={ui.field} data-ui="marathon">
            <span className={ui.fieldLabel}>Marathon mode</span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={dMarathonOn} onChange={(e) => setDMarathonOn(e.target.checked)} data-ui="marathon-enabled" />
                <span>Enabled platform-wide<SourceChip s={settings['chat.marathonEnabled']} /></span>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
                Max auto-continues<SourceChip s={settings['chat.marathonMaxRounds']} />
                <input className="gw-input !w-16" value={dMarathonMax} onChange={(e) => setDMarathonMax(e.target.value)} autoComplete="off" inputMode="numeric" disabled={!dMarathonOn} data-ui="marathon-max" />
              </label>
            </div>
            <span className="adm-dim text-[12px]">
              When a reply ends with an <b>unfinished working plan</b> (Todo), the assistant automatically continues —
              round after round — until the plan completes, a round makes no progress, anything errors, or the cap is
              hit (1–20). Each conversation still opts in via its ⚙ panel; every auto-continue is a visible ▶️ bubble
              and bills the owner like any turn. Turning this off hides the ⚙ toggle and halts running marathons.
            </span>
          </div>
          <div className={ui.field} data-ui="skill-trigger">
            <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={dSkillTrigger} onChange={(e) => setDSkillTrigger(e.target.checked)} data-ui="skill-trigger-toggle" />
              <span>Skill trigger (model-invoked)<SourceChip s={settings['chat.skillTriggerEnabled']} /></span>
            </label>
            <span className="adm-dim text-[12px]">
              When a chat has <b>no bound skill</b>, the installed skills' descriptions ride the system prompt and the
              model may activate one itself (<code>use_skill</code>) when a task matches — like claude.ai. Costs ~100
              prompt tokens per installed skill per turn; skills marked <code>disable-model-invocation</code> stay out.
            </span>
          </div>
          <div className={ui.field} data-ui="skill-binding">
            <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={dSkillBinding} onChange={(e) => setDSkillBinding(e.target.checked)} data-ui="skill-binding-toggle" />
              <span>Skill binding (⚙ panel)<SourceChip s={settings['chat.skillBindingEnabled']} /></span>
            </label>
            <span className="adm-dim text-[12px]">
              Lets users run a conversation <b>as</b> a skill via the chat ⚙ panel's Skill picker. OFF hides the
              picker and existing bindings are <b>ignored</b> at turn time (nothing is deleted — turning it back
              on restores them).
            </span>
          </div>
          <div className={ui.field} data-ui="slash-commands">
            <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={dSlashCmds} onChange={(e) => setDSlashCmds(e.target.checked)} data-ui="slash-commands-toggle" />
              <span>Composer slash commands<SourceChip s={settings['chat.slashCommandsEnabled']} /></span>
            </label>
            <span className="adm-dim text-[12px]">
              Typing <code>/</code> in the chat composer — currently <code>/skill-name message</code> runs one message
              as a skill. OFF hides the suggestions and the server ignores slash invocations. Separate from binding
              because the <code>/</code> surface may grow non-skill commands.
            </span>
          </div>
          <div className={ui.groupHead}>Generation &amp; steering</div>
          <div className={ui.field}>
            <span className={ui.fieldLabel}>Leaving a generating chat — platform default<SourceChip s={settings['chat.backgroundGeneration']} /></span>
            <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={dBgGen} onChange={(e) => setDBgGen(e.target.checked)} />
              <span>Keep generating in the background</span>
            </label>
            <span className="adm-dim text-[12px]">
              {dBgGen
                ? 'On: a reply keeps running when the user switches away, and they can generate in other chats at the same time.'
                : 'Off: switching away cancels the reply and saves what generated so far (one reply at a time).'}
              {' '}Users can override this for their own account (Options → Chat).
            </span>
            <label className="flex items-center gap-2 text-[13px] text-muted mt-1" style={{ whiteSpace: 'nowrap' }}>
              Max concurrent replies / user<SourceChip s={settings['chat.backgroundMaxConcurrent']} />
              <input className="gw-input !w-16" value={dMaxConc} onChange={(e) => setDMaxConc(e.target.value)} autoComplete="off" inputMode="numeric"
                title="Further sends are blocked (⏳ on the Send button) until one reply finishes. Root is exempt." />
            </label>
          </div>
          <div className={ui.field} data-ui="steering">
            <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={dSteer} onChange={(e) => setDSteer(e.target.checked)} />
              <span>Enable steering<SourceChip s={settings['chat.steerEnabled']} /></span>
            </label>
            <span className="adm-dim text-[12px]">
              Lets a user send a message <b>while a reply is generating</b> — the in-flight reply is interrupted
              at once (its partial text is kept as a step) and continues reacting to the message (the composer's
              Enter/Send becomes <b>Steer</b>; <b>Stop</b> still cancels outright).
            </span>
            <label className="flex items-center gap-2 text-[13px] text-muted mt-1" style={{ whiteSpace: 'nowrap' }}>
              Max steers / reply<SourceChip s={settings['chat.maxSteersPerReply']} />
              <input className="gw-input !w-16" value={dMaxSteers} onChange={(e) => setDMaxSteers(e.target.value)} autoComplete="off" inputMode="numeric"
                disabled={!dSteer} title="How many times a user may steer a single reply (bounds the continuation the steers can drive)." />
            </label>
          </div>
          <div className={ui.groupHead}>Schedules</div>
          <div className={ui.field} data-ui="schedule-roles">
            <label className="flex items-center gap-2 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
              Tiers that may schedule<SourceChip s={settings['chat.scheduleRoles']} />
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {(['admin', 'developer', 'power', 'member'] as const).map((r) => (
                  <label key={r} className="gw-check text-[13px]" style={{ whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={dSchedRoles.includes(r)}
                      onChange={(e) => setDSchedRoles((prev) => e.target.checked ? [...prev, r] : prev.filter((x) => x !== r))}
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </span>
            </label>
            <span className="adm-dim text-[12px]">
              Which role tiers may create schedules (root always can). Unchecking everything makes scheduling root-only.
            </span>
          </div>
          <div className={ui.field} data-ui="max-schedules">
            <label className="flex items-center gap-2 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
              Max schedules / user<SourceChip s={settings['chat.maxSchedulesPerUser']} />
              <input className="gw-input !w-16" value={dMaxSched} onChange={(e) => setDMaxSched(e.target.value)} autoComplete="off" inputMode="numeric" />
            </label>
            <span className="adm-dim text-[12px]">
              Scheduled turns one user may own (tiers above).
              <b> 0 disables scheduling</b> platform-wide. Fires bill the owner's token limits.
            </span>
          </div>
          <div className={ui.field} data-ui="schedule-min-interval">
            <label className="flex items-center gap-2 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
              Min minutes between fires<SourceChip s={settings['chat.scheduleMinIntervalMinutes']} />
              <input className="gw-input !w-16" value={dSchedMinInt} onChange={(e) => setDSchedMinInt(e.target.value)} autoComplete="off" inputMode="numeric" />
            </label>
            <span className="adm-dim text-[12px]">
              The floor a schedule may fire at (1–1440) — protects the GPU from an accidental
              "every 30 seconds" research loop. A schedule failing 3 runs in a row disables itself.
            </span>
          </div>
          <div className={ui.groupHead}>Ask-the-user questions (HumanInteraction)</div>
          <div className={ui.field} data-ui="interaction-timeout">
            <label className="flex items-center gap-2 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
              Question timeout (seconds)<SourceChip s={settings['chat.interactionTimeoutSeconds']} />
              <input className="gw-input !w-20" value={dAskTimeout} onChange={(e) => setDAskTimeout(e.target.value)} autoComplete="off" inputMode="numeric" data-ui="interaction-timeout-input" />
            </label>
            <span className="adm-dim text-[12px]">
              How long an <code>ask_user</code> question holds the reply waiting for the human (10–3600, default 300).
              On expiry the model is told honestly there was no answer and continues with its best judgment —
              the turn never fails. The card shows this as a live countdown.
            </span>
          </div>
          <div className={ui.groupHead}>Ollama context window</div>
          <div className={ui.field} data-ui="ollama-numctx">
            <label className="flex items-center gap-2 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
              Ollama context window limit (num_ctx)<SourceChip s={settings['providers.ollamaNumCtxLimit']} />
              <input className="gw-input !w-28" value={dNumCtx} onChange={(e) => setDNumCtx(e.target.value)} autoComplete="off" inputMode="numeric" data-ui="ollama-numctx-input" />
            </label>
            <span className="adm-dim text-[12px]">
              An upper <b>LIMIT</b> on the window of every Ollama request (all surfaces). <b>0 = no limit</b> — each model
              runs at its own maximum: the measured cap below when calibrated, else its trained max (e.g. gemma4:26b
              goes to 262,144). An explicit num_ctx always rides the request — without it the Ollama
              <i> server</i> default rules and overflow <b>silently truncates</b>. Effective value per model shows on the Models page.
            </span>
          </div>
          <div className={ui.field} data-ui="ollama-autoctx">
            <div className="flex flex-wrap items-center gap-4">
              <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={dAutoCtx} onChange={(e) => setDAutoCtx(e.target.checked)} data-ui="ollama-autoctx-toggle" />
                <span>Auto-optimize context window<SourceChip s={settings['providers.ollamaAutoCtx']} /></span>
              </label>
              <label className="flex items-center gap-1.5 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
                at
                <input className="gw-input !w-16" value={dAutoCtxPct} onChange={(e) => setDAutoCtxPct(e.target.value)} disabled={!dAutoCtx} autoComplete="off" inputMode="numeric" data-ui="ollama-autoctx-pct" />
                % of the optimum<SourceChip s={settings['providers.ollamaCtxOptimalPct']} />
              </label>
            </div>
            <span className="adm-dim text-[12px]">
              Caps each model's window at its <b>measured optimum</b> — the largest num_ctx that still fits fully in VRAM
              (past it the KV cache spills to CPU RAM and generation slows several-fold). Only <b>downsizes</b> the value
              above; a lower value is used as-is. The <b>percent</b> (10–100) leaves VRAM headroom for other GPU tasks —
              at 90%, qwen3.6:27b runs ~88k instead of its full 98k optimum. Models whose <b>full trained window fits</b> in
              VRAM aren't scaled (the limit is the model, not the GPU — the headroom already exists). Measure per model with
              the <b>📐 Ctx</b> button on the Models page — uncalibrated models behave as if this were off.
            </span>
          </div>
          <div className={ui.groupHead}>Default ⚙ model options — new chats + member-role users<SourceChip s={settings['chat.defaultOptions']} /></div>
          <div className={`${ui.field} md:col-span-2`} data-ui="default-options">
            <div className="flex flex-wrap items-center gap-4">
              <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={oThink} onChange={(e) => setOThink(e.target.checked)} />
                <span>Thinking</span>
              </label>
              <label className="flex items-center gap-1.5 text-[13px] text-muted" style={{ whiteSpace: 'nowrap' }}>
                effort
                <ClearableSelect className="gw-input !w-28" value={oEffort} onChange={setOEffort} disabled={!oThink} clearTitle="Back to auto">
                  <option value="">auto</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </ClearableSelect>
              </label>
              <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={oStream} onChange={(e) => setOStream(e.target.checked)} />
                <span>Stream</span>
              </label>
              <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={oMemory} onChange={(e) => setOMemory(e.target.checked)} />
                <span>Use memory</span>
              </label>
              <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={oTools} onChange={(e) => setOTools(e.target.checked)} />
                <span>Tools</span>
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className={ui.field} style={{ maxWidth: 110 }}>
                <span className={ui.fieldLabel}>Temp</span>
                <input className="gw-input" value={oTemp} onChange={(e) => setOTemp(e.target.value)} placeholder="auto" autoComplete="off" inputMode="decimal" />
              </label>
              <label className={ui.field} style={{ maxWidth: 110 }}>
                <span className={ui.fieldLabel}>Top P</span>
                <input className="gw-input" value={oTopP} onChange={(e) => setOTopP(e.target.value)} placeholder="auto" autoComplete="off" inputMode="decimal" />
              </label>
              <label className={ui.field} style={{ maxWidth: 130 }}>
                <span className={ui.fieldLabel}>Max tokens</span>
                <input className="gw-input" value={oMaxTok} onChange={(e) => setOMaxTok(e.target.value)} placeholder="auto" autoComplete="off" inputMode="numeric" />
              </label>
            </div>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Custom instructions (default for every new chat)</span>
              <textarea className="gw-textarea" rows={2} maxLength={2000} value={oInstr} onChange={(e) => setOInstr(e.target.value)}
                placeholder="e.g. Always answer in British English." />
            </label>
            <span className="adm-dim text-[12px]">
              Existing conversations keep their own ⚙ settings — these seed NEW chats, lock member-role users, and are what
              the ⚙ panel's Reset returns to.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className="gw-btn gw-btn-primary" onClick={() => void saveChat()}>Save</button>
          <button className="gw-btn" onClick={() => void resetChat()}>Reset to defaults</button>
          {chatMsg && <span className="gw-meta">{chatMsg}</span>}
        </div>
      </section>
      )}

      {/* ---- accounts ---- */}
      {tab === 'accounts' && (
      <section className="gw-card" data-ui="accounts-card">
        <div className="gw-card-title">Accounts — self-service</div>
        <p className="adm-dim">Visitors can create their own account (starts as <b>member</b>). First-phase promo: members may upgrade to <b>power</b> for free from their Account page. Developer access is always a manual grant (requests appear on the Users page).</p>
        <div className="flex flex-wrap items-center gap-6">
          <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={aRegister} onChange={(e) => setARegister(e.target.checked)} />
            <span>Public registration<SourceChip s={settings['auth.registrationEnabled']} /></span>
          </label>
          <label className="gw-check" style={{ whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={aUpgrade} onChange={(e) => setAUpgrade(e.target.checked)} />
            <span>Free member → power upgrade<SourceChip s={settings['auth.selfUpgradeEnabled']} /></span>
          </label>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className="gw-btn gw-btn-primary" onClick={() => void saveAccounts()}>Save</button>
          <button className="gw-btn" onClick={() => void resetAccounts()}>Reset to defaults</button>
          {accMsg && <span className="gw-meta">{accMsg}</span>}
        </div>
      </section>
      )}

      {/* ---- token limits ---- */}
      {tab === 'limits' && (
      <section className="gw-card" data-ui="limits-card">
        <div className="gw-card-title">Token limits — per-user metering</div>
        <p className="adm-dim">
          Every user spends <b>prompt + completion tokens</b> against a daily budget, enforced on all surfaces
          (chat site, OpenAI + Anthropic APIs, embeddings). Per-user overrides and one-month <b>boost grants</b> live
          on the Users page (⛽); resolving feedback with 🎁 grants the tier amounts below. <b>0 = uncapped</b>; root is never limited.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className={ui.field} style={{ maxWidth: 190 }}>
            <span className={ui.fieldLabel}>Enforcement<SourceChip s={settings['limits.enabled']} /></span>
            <label className="gw-check h-[38px]" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={lEnabled} onChange={(e) => setLEnabled(e.target.checked)} />
              <span>Limits enabled</span>
            </label>
          </div>
          <label className={ui.field} style={{ maxWidth: 190 }}>
            <span className={ui.fieldLabel}>Default tokens / day<SourceChip s={settings['limits.defaultDailyTokens']} /></span>
            <input className="gw-input" value={lDaily} onChange={(e) => setLDaily(e.target.value)} autoComplete="off" inputMode="numeric" />
          </label>
          <label className={ui.field} style={{ maxWidth: 190 }}>
            <span className={ui.fieldLabel}>Default tokens / month<SourceChip s={settings['limits.defaultMonthlyTokens']} /></span>
            <input className="gw-input" value={lMonthly} onChange={(e) => setLMonthly(e.target.value)} autoComplete="off" inputMode="numeric" title="0 = no monthly cap. Boosts do not raise the monthly cap." />
          </label>
        </div>
        <div className="gw-card-title mt-4">Feedback rewards — extra tokens/day for one month</div>
        <p className="adm-dim">Resolving a feedback item with a reward grants its submitter a boost that stacks on their daily limit and expires one month later (13/3 → 13/4). Boosts stack: two active rewards = base + both.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className={ui.field} style={{ maxWidth: 190 }}>
            <span className={ui.fieldLabel}>Tier 1 · minor<SourceChip s={settings['limits.rewardTier1Tokens']} /></span>
            <input className="gw-input" value={lTier1} onChange={(e) => setLTier1(e.target.value)} autoComplete="off" inputMode="numeric" />
          </label>
          <label className={ui.field} style={{ maxWidth: 190 }}>
            <span className={ui.fieldLabel}>Tier 2<SourceChip s={settings['limits.rewardTier2Tokens']} /></span>
            <input className="gw-input" value={lTier2} onChange={(e) => setLTier2(e.target.value)} autoComplete="off" inputMode="numeric" />
          </label>
          <label className={ui.field} style={{ maxWidth: 190 }}>
            <span className={ui.fieldLabel}>Tier 3 · big feature/fix<SourceChip s={settings['limits.rewardTier3Tokens']} /></span>
            <input className="gw-input" value={lTier3} onChange={(e) => setLTier3(e.target.value)} autoComplete="off" inputMode="numeric" />
          </label>
          <div className={ui.field} style={{ maxWidth: 240 }}>
            <span className={ui.fieldLabel}>Self-reward<SourceChip s={settings['limits.allowSelfReward']} /></span>
            <label className="gw-check h-[38px]" style={{ whiteSpace: 'nowrap' }} title="Off = no self-dealing: an admin resolving their OWN feedback cannot attach a reward (another admin or root must grant it). On = allowed — for small teams where the admins are the main testers. Root can always reward anyone.">
              <input type="checkbox" checked={lSelfReward} onChange={(e) => setLSelfReward(e.target.checked)} data-ui="self-reward-toggle" />
              <span>Admins may reward their own</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className="gw-btn gw-btn-primary" onClick={() => void saveLimits()}>Save</button>
          <button className="gw-btn" onClick={() => void resetLimits()}>Reset to defaults</button>
          {limMsg && <span className="gw-meta">{limMsg}</span>}
        </div>
      </section>
      )}

      {/* ---- security ---- */}
      {tab === 'security' && (
      <>
      <section className="gw-card" data-ui="security-card">
        <div className="gw-card-title">Security — failure rate limits</div>
        <p className="adm-dim">Failed logins / key-reveal credential checks lock the account or flow for the window below. Successful attempts never count. Counters are in-memory (restart clears them).</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className={ui.field} style={{ maxWidth: 170 }}>
            <span className={ui.fieldLabel}>Login attempts / account <SourceChip s={settings['security.loginMaxAttempts']} /></span>
            <input className="gw-input" value={sLogin} onChange={(e) => setSLogin(e.target.value)} autoComplete="off" />
          </label>
          <label className={ui.field} style={{ maxWidth: 170 }}>
            <span className={ui.fieldLabel}>Login attempts / IP <SourceChip s={settings['security.loginIpMaxAttempts']} /></span>
            <input className="gw-input" value={sLoginIp} onChange={(e) => setSLoginIp(e.target.value)} autoComplete="off" />
          </label>
          <label className={ui.field} style={{ maxWidth: 170 }}>
            <span className={ui.fieldLabel}>Key-reveal attempts <SourceChip s={settings['security.revealMaxAttempts']} /></span>
            <input className="gw-input" value={sReveal} onChange={(e) => setSReveal(e.target.value)} autoComplete="off" />
          </label>
          <label className={ui.field} style={{ maxWidth: 170 }}>
            <span className={ui.fieldLabel}>Window / lockout (min) <SourceChip s={settings['security.rateWindowMinutes']} /></span>
            <input className="gw-input" value={sWindow} onChange={(e) => setSWindow(e.target.value)} autoComplete="off" />
          </label>
          <label className={ui.field} style={{ maxWidth: 170 }}>
            <span className={ui.fieldLabel}>Min password length <SourceChip s={settings['security.passwordMinLength']} /></span>
            <input className="gw-input" value={sPwMin} onChange={(e) => setSPwMin(e.target.value)} autoComplete="off" title="Applies to self-service registration and password changes; admin-set passwords are not restricted" />
          </label>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className="gw-btn gw-btn-primary" onClick={() => void saveSecurity()}>Save</button>
          <button className="gw-btn" onClick={() => void resetSecurity()}>Reset to defaults</button>
          <button className="gw-btn" title="Unlock any account/IP currently locked out" onClick={() => void clearLockouts()}>Clear all lockouts</button>
          {secMsg && <span className="gw-meta">{secMsg}</span>}
        </div>
      </section>

      <section className="gw-card" data-ui="lockouts-card">
        <div className="flex items-center gap-2">
          <div className="gw-card-title !mb-0">Active lockouts & counters</div>
          <button className="gw-btn adm-btn-sm" onClick={loadLockouts}>Refresh</button>
        </div>
        <p className="adm-dim">Every account/IP with recorded failures in the current window — <b className="text-red-700">locked</b> ones are rejected until the window ends; the rest are still counting. Clearing a row unlocks just that target. Counters are in-memory (restart clears them).</p>
        <div className={ui.tableWrap}>
          <table className={ui.table} data-ui="lockouts-table">
            <colgroup>
              <col style={{ width: 140 }} />{/* kind */}
              <col />{/* target */}
              <col style={{ width: 120 }} />{/* ip */}
              <col style={{ width: 60 }} />{/* fails */}
              <col style={{ width: 170 }} />{/* status */}
              <col style={{ width: 90 }} />{/* action */}
            </colgroup>
            <thead><tr>
              <th className={ui.th}>Kind</th><th className={ui.th}>Target</th><th className={ui.th}>IP</th>
              <th className={ui.th}>Fails</th><th className={ui.th}>Status</th><th className={ui.th}></th>
            </tr></thead>
            <tbody>
              {lockouts.map((l, i) => {
                const last = i === lockouts.length - 1
                return (
                  <tr key={l.key}>
                    <td className={cell(last, true)}>{l.kind}</td>
                    <td className={cell(last, true)} title={l.key}>{l.target}</td>
                    <td className={`${cell(last, true)} adm-dim`}>{l.ip || '—'}</td>
                    <td className={cell(last, true)}>{l.count}</td>
                    <td className={cell(last, true)}>
                      {l.locked
                        ? <b className="text-red-700">locked · ~{Math.ceil((l.retryAfterSeconds ?? 0) / 60)}m left</b>
                        : <span className="adm-dim">counting (since {new Date(l.windowStartedAt).toLocaleTimeString()})</span>}
                    </td>
                    <td className={cell(last)}>
                      <button className="gw-btn adm-btn-sm" onClick={() => void clearOneLockout(l.key)}>Clear</button>
                    </td>
                  </tr>
                )
              })}
              {lockouts.length === 0 && <tr><td colSpan={6} className={ui.empty}>No failures recorded in the current windows 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}

      {/* ---- Anthropic API surface: claude-* routing ---- */}
      {tab === 'api' && (
      <section className="gw-card" data-ui="anthropic-api-card">
        <div className="gw-card-title">Claude API — model routing</div>
        <p className="adm-dim">
          Claude clients (Claude Code, the Claude desktop app) call <code className={ui.codeChip}>/api/anthropic/v1</code> and
          request <code className={ui.codeChip}>claude-*</code> model names. Rules below route those names onto platform models —
          an exact id wins first, then trailing-<b>*</b> prefix patterns top to bottom; anything unmatched uses the fallback.
          <b> Exact rules (no *) are advertised to Claude clients</b> as the available models.
        </p>
        {catalog && (
          <div className="flex flex-wrap items-center gap-1.5 mb-1" data-ui="claude-catalog">
            <span className="text-[12px] font-bold text-muted">
              Known Claude ids{catalog.source === 'live' ? ` — live from ${catalog.provider}`
                : catalog.source === 'web' ? ` — public catalog · ${catalog.provider}`
                : ' — built-in list (no live source reachable)'}:
            </span>
            {catalog.models.map((id) => {
              const mapped = apiRows.some((r) => r.pattern.trim() === id)
              return (
                <button key={id} type="button"
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold transition-colors ${
                    mapped ? 'border-line text-muted bg-[var(--code-bg)] cursor-default' : 'border-line text-ink bg-[var(--surface)] hover:border-accent hover:text-accent'
                  }`}
                  title={mapped ? 'Already has an exact rule' : 'Add a routing rule for this id'}
                  onClick={() => addCatalogRule(id)}
                >{mapped ? `✓ ${id}` : id}</button>
              )
            })}
            <button className="gw-btn adm-btn-sm" title="Re-query the live sources" onClick={() => loadCatalog(true)}>↻</button>
          </div>
        )}
        <div className="flex flex-col gap-2" data-ui="anthropic-map-rows">
          {apiRows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="gw-input !w-[280px]" placeholder="claude-sonnet-5 or claude-*" value={r.pattern}
                onChange={(e) => patchApiRow(i, { pattern: e.target.value })} autoComplete="off" spellCheck={false} />
              <span className="text-muted">→</span>
              <div className="flex-1 min-w-0 max-w-[420px]">{modelSelect(r.target, (v) => patchApiRow(i, { target: v }))}</div>
              <button className="gw-btn adm-btn-sm" title="Remove rule"
                onClick={() => setApiRows((rows) => rows.filter((_, x) => x !== i))}>✕</button>
            </div>
          ))}
          {apiRows.length === 0 && <div className="adm-dim">No rules — every claude-* request lands on the fallback model.</div>}
          <div className="flex items-center gap-2">
            <button className="gw-btn adm-btn-sm" onClick={() => setApiRows((rows) => [...rows, { pattern: '', target: '' }])}>+ Add rule</button>
            <SourceChip s={settings['api.anthropic.modelMap']} />
          </div>
        </div>
        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 mt-3">
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Fallback model — unmatched ids<SourceChip s={settings['api.anthropic.defaultModel']} /></span>
            {modelSelect(apiDefault, setApiDefault, '(use the chat default model)')}
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Advertised ids override — comma separated<SourceChip s={settings['api.anthropic.advertisedModels']} /></span>
            <input className="gw-input" placeholder="empty = derive from exact rules (or a built-in trio)" value={apiAdvertised}
              onChange={(e) => setApiAdvertised(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className="gw-btn gw-btn-primary" onClick={() => void saveApi()}>Save</button>
          <button className="gw-btn" onClick={() => void resetApi()}>Reset to defaults</button>
          {apiMsg && <span className="gw-meta">{apiMsg}</span>}
        </div>
      </section>
      )}

      {/* ---- schedules (ops eyes — users manage their own in chat Options) ---- */}
      {tab === 'schedules' && (
      <section className="gw-card" data-ui="schedules-card">
        <div className="gw-card-title">Scheduled jobs — all users (read-only)</div>
        <p className="adm-dim">
          Users create these in chat → Options → Schedules; each fire runs a skill as a real chat turn billed to its owner.
          A job failing 3 runs in a row disables itself. Caps live under Chat defaults → Schedules.
        </p>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <colgroup>
              <col className="w-[110px]" /><col className="w-[170px]" /><col /><col className="w-[140px]" /><col className="w-[150px]" /><col className="w-[130px]" />
            </colgroup>
            <thead>
              <tr>
                <th className={ui.th}>User</th><th className={ui.th}>Name</th><th className={ui.th}>Trigger</th>
                <th className={ui.th}>Skill</th><th className={ui.th}>Next run</th><th className={ui.th}>Last run</th>
              </tr>
            </thead>
            <tbody>
              {adminSchedules.length === 0 && <tr><td colSpan={6} className={ui.empty}>No scheduled jobs on the platform yet.</td></tr>}
              {adminSchedules.map((s, i) => {
                const last = i === adminSchedules.length - 1
                const trig = s.trigger.type === 'interval' ? `every ${s.trigger.every}`
                  : s.trigger.type === 'cron' ? `cron ${s.trigger.expr} (${s.trigger.tz || 'UTC'})`
                  : `once ${s.trigger.at}`
                return (
                  <tr key={s.id}>
                    <td className={`${cell(last, true)} ${s.enabled ? '' : ui.cellDim}`}>{s.username}</td>
                    <td className={`${cell(last, true)} ${s.enabled ? '' : ui.cellDim}`} title={s.name}>{s.name}{!s.enabled && ' (disabled)'}</td>
                    <td className={`${cell(last, true)} ${s.enabled ? '' : ui.cellDim}`}>{trig}</td>
                    <td className={`${cell(last, true)} ${s.enabled ? '' : ui.cellDim}`}>{(s.action.skillId || '').replace(/^skill\./, '')}</td>
                    <td className={cell(last)}>{s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '—'}</td>
                    <td className={cell(last)} title={s.lastError || ''}>
                      {s.lastRunAt ? `${s.lastStatus}${s.lastDurationMs != null ? ` · ${s.lastDurationMs}ms` : ''}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* ---- server logs ---- */}
      {tab === 'logs' && (
      <section className="gw-card" data-ui="logs-card">
        <div className="gw-card-title">Server log files</div>
        <p className="adm-dim">
          Every boot writes fresh <code className={ui.codeChip}>message_</code> / <code className={ui.codeChip}>requests_</code> / <code className={ui.codeChip}>queries_</code> files
          under <code className={ui.codeChip}>{logDir || 'Backend/logs'}</code> — {logs.length} file{logs.length === 1 ? '' : 's'}, {fmtBytes(logTotal)} total.
          The current boot's files may refuse deletion while in use.
        </p>

        <div className="flex items-center gap-2 mb-2">
          <input
            className="gw-input max-w-[360px]"
            placeholder="🔍 search across ALL log files…"
            value={logQ}
            onChange={(e) => setLogQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void searchLogs() }}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="gw-btn adm-btn-sm" disabled={logSearching} onClick={() => void searchLogs()}>{logSearching ? 'Searching…' : 'Search'}</button>
          {logMatches !== null && <button className="gw-btn adm-btn-sm" onClick={() => { setLogMatches(null); setLogSearchMeta('') }}>Clear</button>}
          {logSearchMeta && <span className="adm-dim text-[12px]">{logSearchMeta}</span>}
        </div>
        {logMatches !== null && logMatches.length > 0 && (
          <div className="border border-line rounded-lg mb-3 max-h-64 overflow-auto">
            {logMatches.map((m, i) => (
              <button
                key={i}
                className="block w-full text-left px-3 py-1 border-b border-line/50 last:border-b-0 hover:bg-black/[.03] text-[12px] font-mono"
                title={`Open ${m.file} filtered to the search`}
                onClick={() => void openLog(m.file, logQ.trim())}
              >
                <span className="text-accent-deep">{m.file}</span><span className="adm-dim">:{m.line}</span> {m.text}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <button
            className="gw-btn adm-btn-danger adm-btn-sm"
            onClick={() => setConfirm({
              title: 'Delete ALL log files',
              message: `Delete all ${logs.length} log files (${fmtBytes(logTotal)})? Active files are skipped automatically.`,
              run: async () => {
                const r = await apiPost('/v1/admin/logs/clear', { olderThanDays: 0 })
                setLogMsg(`Deleted ${r.deleted}, skipped ${r.skipped} (in use).`)
                loadLogs()
              },
            })}
          >Delete all</button>
          <span className="adm-dim">or older than</span>
          <input className="gw-input !w-16" value={clearDays} onChange={(e) => setClearDays(e.target.value)} autoComplete="off" />
          <span className="adm-dim">days</span>
          <button
            className="gw-btn adm-btn-sm"
            onClick={() => setConfirm({
              title: `Delete logs older than ${clearDays} day(s)`,
              message: `Delete every log file whose last write is older than ${clearDays} day(s)?`,
              run: async () => {
                const r = await apiPost('/v1/admin/logs/clear', { olderThanDays: Math.max(0, Math.floor(Number(clearDays)) || 0) })
                setLogMsg(`Deleted ${r.deleted}, skipped ${r.skipped}.`)
                loadLogs()
              },
            })}
          >Delete old</button>
          <button className="gw-btn adm-btn-sm" onClick={loadLogs}>Refresh</button>
          {logMsg && <span className="gw-meta">{logMsg}</span>}
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table} data-ui="logs-table">
            <colgroup>
              <col />{/* name */}
              <col style={{ width: 90 }} />{/* kind */}
              <col style={{ width: 90 }} />{/* size */}
              <col style={{ width: 150 }} />{/* modified */}
              <col style={{ width: 150 }} />{/* view + delete */}
            </colgroup>
            <thead><tr>
              <th className={ui.th}>File</th><th className={ui.th}>Kind</th><th className={ui.th}>Size</th><th className={ui.th}>Last write</th><th className={ui.th}></th>
            </tr></thead>
            <tbody>
              {logs.slice(0, 100).map((f, i) => {
                const last = i === Math.min(logs.length, 100) - 1
                return (
                  <tr key={f.name}>
                    <td className={`${cell(last, true)} adm-dim`} title={f.name}>{f.name}</td>
                    <td className={cell(last, true)}>{f.kind}</td>
                    <td className={cell(last, true)}>{fmtBytes(f.bytes)}</td>
                    <td className={`${cell(last, true)} adm-dim`}>{fmtWhen(f.modifiedAt)}</td>
                    <td className={cell(last)}>
                      <div className={ui.actions}>
                        <button className="gw-btn adm-btn-sm" title="Open + search inside this file" onClick={() => void openLog(f.name)}>View</button>
                        <button
                          className="gw-btn adm-btn-sm adm-btn-danger"
                          onClick={() => setConfirm({
                            title: 'Delete log file',
                            message: `Delete '${f.name}' (${fmtBytes(f.bytes)})?`,
                            run: async () => {
                              await apiDelete(`/v1/admin/logs/${encodeURIComponent(f.name)}`)
                              setLogMsg(`Deleted ${f.name}.`)
                              loadLogs()
                            },
                          })}
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {logs.length === 0 && <tr><td colSpan={5} className={ui.empty}>No log files</td></tr>}
            </tbody>
          </table>
        </div>
        {logs.length > 100 && <div className="adm-dim text-[12px] mt-1.5">Showing 100 of {logs.length} — use "Delete old" to shrink the list.</div>}
      </section>
      )}

      {viewing && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setViewing(null))}>
          <div className={ui.modalCard} style={{ maxWidth: 1000, width: '95vw' }} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>{viewing} <span className="adm-dim text-[12px] font-normal">{viewerInfo}</span></h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setViewing(null)}>✕</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="gw-input max-w-[280px]"
                placeholder="filter lines…"
                value={viewerFilter}
                onChange={(e) => setViewerFilter(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <label className="flex items-center gap-1.5 text-[12px] text-muted">
                tail
                <select className="gw-input !w-24" value={viewerTail} onChange={(e) => { setViewerTail(e.target.value); void openLog(viewing, viewerFilter, e.target.value) }}>
                  <option value="64">64 KB</option>
                  <option value="256">256 KB</option>
                  <option value="1024">1 MB</option>
                  <option value="5120">5 MB</option>
                </select>
              </label>
              <button className="gw-btn adm-btn-sm" onClick={() => void openLog(viewing, viewerFilter)}>Refresh</button>
              <a className="gw-btn adm-btn-sm" href={`/v1/admin/logs/${encodeURIComponent(viewing)}/content?download=1`} download>⬇ Download</a>
              <span className="adm-dim text-[12px] ml-auto">{viewerFilter.trim() ? `${viewerLines.length} matching line(s)` : `${viewerLines.length} line(s)`}</span>
            </div>
            <pre className="mt-2 bg-surface border border-line rounded-lg p-2.5 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all overflow-auto" style={{ maxHeight: '60vh' }}>
              {viewerLoading ? 'Loading…' : (viewerLines.join('\n') || '(empty)')}
            </pre>
            <div className={ui.modalActions}>
              <button className="gw-btn" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
