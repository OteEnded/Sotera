import { useCallback, useEffect, useMemo, useState } from 'react'
import { copyToClipboard } from '../../lib/clipboard'
import {
  type ChatSkill, type Schedule, type ScheduleAction, type ScheduleRun, type ScheduleTrigger,
  assistSchedule, createSchedule, deleteSchedule, getChatModels, listChatSkills, listConversations,
  listScheduleRuns, listSchedules, rotateScheduleHook, runScheduleNow, updateSchedule,
} from '../../lib/chatApi'
import ModelCombo from '../../components/ModelCombo'
import ConfirmModal from '../../components/ConfirmModal'
import ClearableSelect from '../../components/ClearableSelect'

// Schedules — the proactive persona surface (Milestone ②): a trigger (clock or webhook)
// fires an action — usually a skill running a REAL chat turn whose answer lands in a
// conversation; tool calls and (root-only) http requests ride the same envelope. The heavy
// lifting is server-side (TriggerService + executors); this panel is create/list/run/toggle.

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// '@dedicated' = "create this schedule's own chat and reuse it" — the backend resolves it
// at save time into a real conversation named after the schedule (seeded with a note).
// It is the DEFAULT destination for new schedules (Ote's call): one tidy home per schedule.
const DEDICATED = '@dedicated'
const ordinal = (n: number) => {
  const tens = n % 100
  const suf = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${n}${suf}`
}

// Plain-words preview for a 5-field cron — pure logic, no model (Ote's ask: the user
// should SEE what their expression means before saving it). dom+dow combos follow the
// standard vixie OR rule the trigger engine implements ("the 1st … and every Wednesday").
// Returns null for shapes we can't voice confidently; callers fall back to the raw expr.
// Not exported: nothing outside this file consumes it, and exporting a non-component from a component file
// breaks Vite fast refresh for the whole module.
function describeCron(expr: string): string | null {
  const p = expr.trim().split(/\s+/)
  if (p.length !== 5) return null
  const [min, hour, dom, mon, dow] = p
  const int = (s: string, max: number) => (/^\d{1,2}$/.test(s) && Number(s) <= max ? Number(s) : null)
  const step = (s: string) => /^\*\/(\d{1,2})$/.exec(s)?.[1] ?? null
  // day-of-week tokens: single digit / a-b range / comma list (7 ≡ 0 = Sunday)
  const dowSet = (s: string): number[] | null => {
    const out = new Set<number>()
    for (const tok of s.split(',')) {
      const r = /^([0-7])-([0-7])$/.exec(tok)
      if (r) for (let i = Number(r[1]); i <= Number(r[2]); i++) out.add(i % 7)
      else if (/^[0-7]$/.test(tok)) out.add(Number(tok) % 7)
      else return null
    }
    return out.size ? [...out].sort((a, b) => a - b) : null
  }
  const mStep = step(min)
  if (mStep && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `every ${mStep} minutes`
  const m0 = int(min, 59)
  const hStep = step(hour)
  if (m0 != null && hStep && dom === '*' && mon === '*' && dow === '*') return `every ${hStep} hours (at :${String(m0).padStart(2, '0')})`
  const h0 = int(hour, 23)
  if (m0 == null || h0 == null) return null
  const at = `${String(h0).padStart(2, '0')}:${String(m0).padStart(2, '0')}`
  const dowPhrase = (s: string): string | null => {
    const days = dowSet(s)
    if (!days) return null
    if (days.join() === '1,2,3,4,5') return 'weekdays'
    if (days.join() === '0,6') return 'weekends'
    return `every ${days.map((d) => DOW[d]).join(', ')}`
  }
  if (dom === '*' && mon === '*') {
    if (dow === '*') return `every day at ${at}`
    const p = dowPhrase(dow)
    return p ? `${p} at ${at}` : null
  }
  const d0 = int(dom, 31)
  if (d0 != null && d0 >= 1 && mon === '*' && dow !== '*') {
    // dom + dow = EITHER matches (standard cron OR — the engine implements it)
    const p = dowPhrase(dow)
    return p ? `on the ${ordinal(d0)} of every month AND ${p}, at ${at}` : null
  }
  if (d0 != null && d0 >= 1 && dow === '*') {
    if (mon === '*') return `on the ${ordinal(d0)} of every month at ${at}`
    const mo = int(mon, 12)
    if (mo != null && mo >= 1) return `every year on ${MONTHS[mo - 1]} ${d0} at ${at}`
  }
  return null
}

function describeTrigger(t: ScheduleTrigger): string {
  if (t.type === 'interval') return `every ${t.every}`
  if (t.type === 'at') return `once, ${new Date(t.at).toLocaleString()}`
  if (t.type === 'webhook') return 'webhook — fired from outside'
  const m = /^(\d+) (\d+) \* \* (\*|\d)$/.exec(t.expr)
  const tz = t.tz ? ` (${t.tz})` : ''
  if (m) {
    const time = `${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}`
    return m[3] === '*' ? `daily at ${time}${tz}` : `every ${DOW[Number(m[3])]} at ${time}${tz}`
  }
  const plain = describeCron(t.expr) // fancier crons get the same plain-words treatment
  return plain ? `${plain}${tz}` : `cron "${t.expr}"${tz}`
}

function describeAction(a: ScheduleAction): string {
  if (a.type === 'tool') return `🔧 ${a.toolId}`
  if (a.type === 'http') {
    try { return `🌐 ${a.method ?? 'GET'} ${new URL(a.url).host}` } catch { return `🌐 ${a.method ?? 'GET'}` }
  }
  return a.skillId ? `🧩 ${a.skillId.replace(/^skill\./, '')}` : '💬 instruction'
}

// Date → the value a <input type="datetime-local"> wants (browser-local wall clock)
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Semantic trigger equality — the edit diff. A spent one-shot would FAIL revalidation
// ("in the past") if resent unchanged, so an edit only sends the trigger when it truly
// changed. Webhook tokens live server-side; same type = same trigger.
function trigEqual(a: ScheduleTrigger, b: ScheduleTrigger): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'interval' && b.type === 'interval') return a.every === b.every
  if (a.type === 'cron' && b.type === 'cron') return a.expr === b.expr && (a.tz || 'UTC') === (b.tz || 'UTC')
  if (a.type === 'at' && b.type === 'at') return Date.parse(a.at) === Date.parse(b.at)
  return true
}

export default function SchedulesPanel() {
  const [data, setData] = useState<Awaited<ReturnType<typeof listSchedules>> | null>(null)
  const [skills, setSkills] = useState<ChatSkill[]>([])
  const [models, setModels] = useState<string[]>([])
  const [convos, setConvos] = useState<{ id: string; title: string }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [runs, setRuns] = useState<ScheduleRun[] | null>(null)
  const [revealedHook, setRevealedHook] = useState<string | null>(null) // schedule id whose fire URL is shown
  const [copiedHook, setCopiedHook] = useState<string | null>(null)

  const copyHook = async (id: string, hookPath: string) => {
    // copyToClipboard, NOT raw navigator.clipboard — that API doesn't exist over plain
    // HTTP (LAN testers), which is exactly how "Copy URL did nothing" was reported
    const ok = await copyToClipboard(`${window.location.origin}${hookPath}`)
    setCopiedHook(ok ? id : null)
    if (ok) setTimeout(() => setCopiedHook((cur) => (cur === id ? null : cur)), 1500)
    else setError('Could not copy — select the URL by hand (Show URL).')
  }

  const toggleHistory = async (id: string) => {
    if (historyFor === id) { setHistoryFor(null); setRuns(null); return }
    setHistoryFor(id); setRuns(null)
    try { setRuns((await listScheduleRuns(id)).runs) } catch { setRuns([]) }
  }

  // create-form state
  const [fName, setFName] = useState('')
  const [fAction, setFAction] = useState<'skill-turn' | 'tool' | 'http'>('skill-turn')
  const [fSkill, setFSkill] = useState('') // '' = no skill — a plain instruction turn
  const [fTurnTools, setFTurnTools] = useState<string[]>([]) // optional narrowing; empty = all tools
  const [fPrompt, setFPrompt] = useState('')
  const [fModel, setFModel] = useState('')
  const [fTool, setFTool] = useState('')
  const [fToolArgs, setFToolArgs] = useState('')
  const [fHttpUrl, setFHttpUrl] = useState('')
  const [fHttpMethod, setFHttpMethod] = useState('GET')
  const [fHttpBody, setFHttpBody] = useState('')
  const [fKind, setFKind] = useState<'daily' | 'weekly' | 'every' | 'once' | 'cron' | 'webhook'>('daily')
  const [fTime, setFTime] = useState('07:30')
  const [fDow, setFDow] = useState('1')
  const [fEveryN, setFEveryN] = useState('1')
  const [fEveryUnit, setFEveryUnit] = useState<'m' | 'h' | 'd'>('h')
  const [fOnce, setFOnce] = useState(() => toLocalInput(new Date(Date.now() + 3600_000))) // one-shot moment (browser-local)
  const [fCron, setFCron] = useState('30 7 * * *')
  const [fTz, setFTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [fDest, setFDest] = useState<string>(DEDICATED) // default: the schedule's own reused chat ('' = new conversation each run)
  const [fCatchUp, setFCatchUp] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null) // non-null = the form EDITS this schedule
  const [reEnableId, setReEnableId] = useState<string | null>(null) // editing to RE-ENABLE a target-deleted schedule (Save also flips enabled on)

  // assist ("describe it") state — the model fills the form, the human saves
  const [aPrompt, setAPrompt] = useState('')
  const [aBusy, setABusy] = useState(false)
  const [aSummary, setASummary] = useState('')

  // Reverse-map a schedule spec into the form fields — shared by Edit (pre-fill) and
  // the assist proposal (the filled form IS the review surface; Save applies it).
  const fillFormFrom = (s: Pick<Schedule, 'name' | 'trigger' | 'action' | 'catchUp'>) => {
    setFName(s.name)
    if (s.action.type === 'tool') {
      setFAction('tool'); setFTool(s.action.toolId); setFToolArgs(s.action.args ? JSON.stringify(s.action.args) : '')
    } else if (s.action.type === 'http') {
      setFAction('http'); setFHttpUrl(s.action.url); setFHttpMethod(s.action.method ?? 'GET'); setFHttpBody(s.action.body ?? '')
    } else {
      setFAction('skill-turn'); setFSkill(s.action.skillId ?? ''); setFPrompt(s.action.prompt)
      setFModel(s.action.model); setFDest(s.action.conversationId ?? ''); setFTurnTools(s.action.tools ?? [])
    }
    const t = s.trigger
    if (t.type === 'webhook') setFKind('webhook')
    else if (t.type === 'at') { setFKind('once'); setFOnce(toLocalInput(new Date(t.at))) }
    else if (t.type === 'interval') {
      const m = /^(\d+)(m|h|d)$/.exec(t.every)
      setFKind('every'); setFEveryN(m ? m[1] : '1'); setFEveryUnit(m ? (m[2] as 'm' | 'h' | 'd') : 'h')
    } else {
      const m = /^(\d+) (\d+) \* \* (\*|\d)$/.exec(t.expr)
      if (m) {
        setFKind(m[3] === '*' ? 'daily' : 'weekly')
        setFTime(`${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}`)
        if (m[3] !== '*') setFDow(m[3])
      } else {
        setFKind('cron'); setFCron(t.expr)
      }
      setFTz(t.tz || 'UTC')
    }
    setFCatchUp(s.catchUp)
  }

  // Everything back to first-open defaults — a NEW schedule must never inherit the last
  // edit's leftovers (Ote hit "+ New schedule" pre-filled with the row he'd just edited).
  // fModel deliberately survives: it already holds the platform default / last pick.
  const resetForm = () => {
    setFName(''); setFAction('skill-turn'); setFSkill(''); setFTurnTools([]); setFPrompt('')
    setFTool(''); setFToolArgs(''); setFHttpUrl(''); setFHttpMethod('GET'); setFHttpBody('')
    setFKind('daily'); setFTime('07:30'); setFDow('1'); setFEveryN('1'); setFEveryUnit('h')
    setFOnce(toLocalInput(new Date(Date.now() + 3600_000))); setFCron('30 7 * * *')
    setFTz(Intl.DateTimeFormat().resolvedOptions().timeZone); setFDest(DEDICATED); setFCatchUp(false)
  }

  // Populate the form from an existing schedule and open it in edit mode.
  const startEdit = (s: Schedule) => {
    fillFormFrom(s)
    setAPrompt(''); setASummary('')
    setReEnableId(null)
    setEditingId(s.id)
    setCreating(true)
  }

  // Re-enable a schedule whose destination chat was deleted: open the edit form, reset the
  // (now-dead) destination to a fresh dedicated home chat so Save is valid out of the box,
  // and remember to flip `enabled` on when Save applies (Ote: must pick a destination first).
  const startReEnable = (s: Schedule) => {
    startEdit(s)
    setFDest(DEDICATED)
    setReEnableId(s.id)
  }

  const closeForm = () => { setCreating(false); setEditingId(null); setReEnableId(null); setAPrompt(''); setASummary('') }

  // Enable/disable a row. Disabling is a plain toggle; ENABLING a schedule whose chat was
  // deleted must first get a new destination — route it to the re-enable form (proactively
  // for a 'target-deleted' row, and as a fallback if the backend rejects with target_missing).
  const toggleEnabled = async (s: Schedule) => {
    if (s.enabled) { void act(() => updateSchedule(s.id, { enabled: false })); return }
    if (s.disabledReason === 'target-deleted') { startReEnable(s); return }
    setError('')
    try { await updateSchedule(s.id, { enabled: true }); await load() }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/deleted|destination|target/i.test(msg)) startReEnable(s)
      else setError(msg)
    }
  }

  // "Describe it" → the assist endpoint returns a validated proposal → it lands in the
  // form fields for review. NOTHING saves until the user clicks Save/Create.
  const propose = async () => {
    setError(''); setABusy(true); setASummary('')
    try {
      const r = await assistSchedule({ prompt: aPrompt.trim(), scheduleId: editingId ?? undefined, model: fModel || undefined })
      fillFormFrom({ ...r.proposal, catchUp: r.proposal.catchUp })
      setASummary(r.summary || describeTrigger(r.proposal.trigger))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setABusy(false)
    }
  }

  // the full IANA zone catalog — ModelCombo groups it by region via the "/" prefix
  const tzItems = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return [fTz, 'UTC'] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const destLabels = useMemo((): Record<string, string> => ({
    [DEDICATED]: '★ its own new chat — created now, reused every run',
    ...Object.fromEntries(convos.map((c) => [c.id, c.title])),
  }), [convos])

  const load = useCallback(async () => {
    setError('')
    try { setData(await listSchedules()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => {
    void load()
    listChatSkills().then((r) => setSkills(r.skills || [])).catch(() => {})
    getChatModels().then((r) => {
      setModels((r.models || []).filter((m) => !m.notChat).map((m) => m.id))
      setFModel((cur) => cur || r.defaultModel || '')
    }).catch(() => {})
    listConversations().then((r) => setConvos((r.conversations || []).slice(0, 50).map((c) => ({ id: c.id, title: c.title || '(untitled)' })))).catch(() => {})
  }, [load])

  // the form view swaps in over the list — if Edit was clicked far down a scrolled list,
  // start the form at its top (the Back header), not wherever the scroller happened to be
  useEffect(() => {
    if (creating) document.querySelector('.schedules-form-head')?.scrollIntoView({ block: 'nearest' })
  }, [creating])

  const trigger = useMemo((): ScheduleTrigger => {
    if (fKind === 'webhook') return { type: 'webhook' } // the server mints the secret fire URL
    if (fKind === 'once') return { type: 'at', at: new Date(fOnce).toISOString() } // datetime-local = browser zone
    if (fKind === 'every') return { type: 'interval', every: `${Math.max(1, Math.floor(Number(fEveryN)) || 1)}${fEveryUnit}` }
    if (fKind === 'cron') return { type: 'cron', expr: fCron.trim(), tz: fTz.trim() || 'UTC' }
    const [hh = '7', mm = '30'] = fTime.split(':')
    const expr = fKind === 'daily' ? `${Number(mm)} ${Number(hh)} * * *` : `${Number(mm)} ${Number(hh)} * * ${fDow}`
    return { type: 'cron', expr, tz: fTz.trim() || 'UTC' }
  }, [fKind, fEveryN, fEveryUnit, fOnce, fCron, fTime, fDow, fTz])

  const submit = async () => {
    setError(''); setBusy(true)
    try {
      let action: Record<string, unknown>
      if (fAction === 'tool') {
        let args: Record<string, unknown> | undefined
        if (fToolArgs.trim()) {
          try { args = JSON.parse(fToolArgs) as Record<string, unknown> } catch { throw new Error('Tool arguments must be valid JSON (or empty).') }
        }
        action = { type: 'tool', toolId: fTool, args }
      } else if (fAction === 'http') {
        action = { type: 'http', url: fHttpUrl.trim(), method: fHttpMethod, body: fHttpBody || undefined }
      } else {
        action = {
          skillId: fSkill || null, // '' = a plain instruction turn
          prompt: fPrompt,
          model: fModel,
          conversationId: fDest || null,
          ...(fTurnTools.length ? { tools: fTurnTools } : {}),
        }
      }
      if (editingId) {
        // EDIT: send only what changed — a spent one-shot must survive a rename
        // (resending its past trigger would fail "in the past" revalidation)
        const orig = data?.schedules.find((x) => x.id === editingId)
        const patch: Parameters<typeof updateSchedule>[1] = { name: fName.trim(), catchUp: fCatchUp, action: action as never }
        if (!orig || !trigEqual(trigger, orig.trigger)) patch.trigger = trigger
        if (reEnableId === editingId) patch.enabled = true // re-enable now that a destination is set
        await updateSchedule(editingId, patch)
      } else {
        await createSchedule({ name: fName.trim(), trigger, action: action as never, catchUp: fCatchUp })
      }
      closeForm()
      setFName(''); setFPrompt('')
      await load()
      // a '@dedicated' save just minted a conversation — refresh the destination catalog
      // so the row detail can name it right away
      listConversations().then((r) => setConvos((r.conversations || []).slice(0, 50).map((c) => ({ id: c.id, title: c.title || '(untitled)' })))).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn: () => Promise<unknown>) => {
    setError('')
    try { await fn(); await load() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  // Destructive actions get the shared ConfirmModal (the platform pattern) — Delete is
  // gone-forever (row + run history), Renew kills the live fire URL the moment it runs.
  const [deleting, setDeleting] = useState<Schedule | null>(null)
  const [renewing, setRenewing] = useState<Schedule | null>(null)

  if (!data) return <p className="adm-dim text-[13px]">{error || 'Loading…'}</p>

  // FORM VIEW replaces the list entirely while creating/editing (Ote's call: a form
  // rendered as "one more list item" reads as part of the list and pushes Save
  // off-screen) — a plain list ↔ form swap, with a Back header for orientation.
  if (creating) {
    return (
      <div className="flex flex-col gap-4 schedules-panel">
        <div className="flex min-w-0 items-center gap-2.5 schedules-form-head">
          <button className="gw-btn adm-btn-sm schedules-back shrink-0" disabled={busy} onClick={closeForm}>← Back</button>
          <strong className="min-w-0 truncate text-[13px]" title={editingId ? (data.schedules.find((x) => x.id === editingId)?.name ?? '') : undefined}>
            {editingId ? `Editing "${data.schedules.find((x) => x.id === editingId)?.name ?? ''}"` : 'New schedule'}
          </strong>
        </div>
        {error && <div className="text-danger text-[13px] schedules-error">{error}</div>}
        {renderForm()}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 schedules-panel">
      <p className="adm-dim m-0 text-[13px]">
        Schedules run an <b>instruction as a real chat turn</b> on a clock — optionally as a skill, with
        the answer landing in a conversation like any reply (your token limits apply). Tool calls and
        webhook-fired jobs ride the same rails. Times follow each schedule's own timezone; a schedule that
        fails {3} times in a row disables itself. Up to {data.maxPerUser} schedules, at least {data.minIntervalMinutes} minutes apart.
        You can also just ask the assistant — <code className="font-mono text-[12px]">/scheduler remind me…</code>
      </p>

      {!data.canSchedule && (
        <p className="adm-dim m-0 text-[13px] schedules-locked">Scheduling isn't enabled for your role tier on this platform.</p>
      )}

      {error && <div className="text-danger text-[13px] schedules-error">{error}</div>}

      {data.schedules.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.schedules.map((s) => (
            <div key={s.id} className="schedules-row rounded-[10px] border border-line bg-panel-strong px-3 py-2">
              {/* header = identity only (name + type chip + state); the TIMING sentence
                  lives in the detail line below — a long cron description was dragging
                  the chip onto its own wrapped line (Ote's catch) */}
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[13px]">{s.name}</strong>
                <span className="rounded-full border border-[var(--edge)] bg-[var(--wash)] px-2 py-px text-[11px] font-bold text-accent-deep">{describeAction(s.action)}</span>
                {!s.enabled && (s.disabledReason === 'target-deleted'
                  ? <span className="rounded-full border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-2 py-px text-[11px] font-bold text-[var(--warn)]" title="The chat this schedule ran in was deleted — Enable to pick a new destination">chat deleted</span>
                  : <span className="text-[11px] font-bold uppercase text-muted">disabled</span>)}
                {s.running && <span className="text-[11px] font-bold text-[var(--warn)]">running…</span>}
                <span className="ml-auto flex flex-wrap gap-1.5">
                  <button className="gw-btn adm-btn-sm schedules-run" disabled={!s.enabled} onClick={() => void act(() => runScheduleNow(s.id))}>Run now</button>
                  <button className="gw-btn adm-btn-sm schedules-history" onClick={() => void toggleHistory(s.id)}>{historyFor === s.id ? 'Hide history' : 'History'}</button>
                  <button className="gw-btn adm-btn-sm schedules-edit" onClick={() => startEdit(s)}>Edit</button>
                  <button className={`gw-btn adm-btn-sm ${s.enabled ? 'adm-btn-warn' : 'adm-btn-ok'}`} onClick={() => void toggleEnabled(s)}>{s.enabled ? 'Disable' : 'Enable'}</button>
                  <button className="gw-btn adm-btn-sm adm-btn-danger schedules-delete" onClick={() => setDeleting(s)}>Delete</button>
                </span>
              </div>
              {/* three detail lines (Ote's call): WHEN it runs · next/last · destination */}
              <div className="mt-1 text-[12px] text-muted">
                <div>{describeTrigger(s.trigger)}</div>
                {(s.nextRunAt || s.lastRunAt || s.trigger.type !== 'webhook') && (
                  <div>
                    {s.nextRunAt ? `next: ${new Date(s.nextRunAt).toLocaleString()}` : (s.trigger.type === 'webhook' ? '' : 'no further runs')}
                    {s.lastRunAt && (
                      <>{(s.nextRunAt || s.trigger.type !== 'webhook') ? ' · ' : ''}last: {new Date(s.lastRunAt).toLocaleString()} — {s.lastStatus === 'ok'
                        ? `ok (${s.lastDurationMs ?? '?'}ms)`
                        : <span className="text-danger" title={s.lastError || ''}>error{s.consecutiveFailures > 1 ? ` ×${s.consecutiveFailures}` : ''}</span>}
                      </>
                    )}
                  </div>
                )}
                {s.action.type === 'skill-turn' && (
                  <div>
                    {s.disabledReason === 'target-deleted'
                      ? <span className="text-[var(--warn)]">its destination chat was deleted — Enable to point it at a new one</span>
                      : s.action.conversationId
                        ? (destLabels[s.action.conversationId]
                          ? <span title={`conversation ${s.action.conversationId}`}>appends to “{destLabels[s.action.conversationId]}”</span>
                          : 'appends to a conversation')
                        : 'new conversation per run'}
                  </div>
                )}
              </div>
              {s.hookPath && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted schedules-hook">
                  {/* the URL IS the credential — hidden until asked for; shown in full
                      (break-all, no truncation) so what you read is what fires */}
                  {revealedHook === s.id
                    ? <span className="min-w-0 basis-full break-all font-mono schedules-hook-url">POST {window.location.origin}{s.hookPath}</span>
                    : <span className="schedules-hook-hidden">secret fire URL — POST it from anywhere to fire this schedule</span>}
                  <button className="gw-btn adm-btn-sm shrink-0 schedules-hook-toggle" onClick={() => setRevealedHook(revealedHook === s.id ? null : s.id)}>
                    {revealedHook === s.id ? 'Hide URL' : 'Show URL'}
                  </button>
                  <button className="gw-btn adm-btn-sm shrink-0 schedules-hook-copy" onClick={() => void copyHook(s.id, s.hookPath!)}>
                    {copiedHook === s.id ? '✓ copied' : 'Copy URL'}
                  </button>
                  <button className="gw-btn adm-btn-sm shrink-0 schedules-hook-renew"
                    title="Mint a fresh fire URL — the current one stops working immediately (use when a URL may have leaked)"
                    onClick={() => setRenewing(s)}>Renew URL</button>
                </div>
              )}
              {historyFor === s.id && (
                <div className="schedules-runs mt-2 flex flex-col gap-1 rounded-[8px] border border-line bg-panel px-2.5 py-2 text-[12px]">
                  {runs === null && <span className="text-muted">Loading…</span>}
                  {runs !== null && runs.length === 0 && <span className="text-muted">No runs recorded yet.</span>}
                  {(runs || []).map((r) => (
                    <div key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-muted">{new Date(r.startedAt).toLocaleString()}</span>
                      {r.status === 'ok'
                        ? <span className="font-bold text-[var(--ok)]">ok</span>
                        : <span className="font-bold text-danger">error</span>}
                      <span className="text-muted">{r.durationMs != null ? `${r.durationMs}ms` : ''}</span>
                      {/* the landing conversation by TITLE — the uuid stays on hover for debugging.
                          min-w-0 + max-w-full so a long title ELLIPSISES instead of clipping at
                          the modal edge (truncate on a flex child needs min-w-0 to shrink) */}
                      {r.conversation
                        ? <span className="min-w-0 max-w-full truncate text-muted" title={`conversation ${r.conversation.id}`}>
                            → {r.conversation.title ? `“${r.conversation.title}”` : 'a since-deleted conversation'}
                          </span>
                        : r.summary && <span className="min-w-0 max-w-full truncate text-muted">{r.summary}</span>}
                      {r.error && <span className="min-w-0 max-w-full truncate text-danger" title={r.error}>{r.error.slice(0, 120)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {data.schedules.length === 0 && (
        <p className="adm-dim m-0 text-[13px] schedules-empty">No schedules yet — this is where your persona learns to act on its own.</p>
      )}

      <div>
        <button className="gw-btn schedules-new" disabled={!data.canSchedule || data.schedules.length >= data.maxPerUser} onClick={() => { resetForm(); setEditingId(null); setAPrompt(''); setASummary(''); setCreating(true) }}>+ New schedule</button>
      </div>

      {deleting && (
        <ConfirmModal
          title="Delete schedule"
          message={<span>Delete <b>“{deleting.name}”</b>? It will never fire again and its run history goes with it — this cannot be undone. (A conversation its runs landed in stays.)</span>}
          onConfirm={async () => { await act(() => deleteSchedule(deleting.id)) }}
          onClose={() => setDeleting(null)}
        />
      )}
      {renewing && (
        <ConfirmModal
          title="Renew fire URL"
          message={<span>Mint a fresh fire URL for <b>“{renewing.name}”</b>? The current URL <b>stops working immediately</b> — anything still calling it must be given the new one. Use this when a URL may have leaked.</span>}
          confirmLabel="Renew URL"
          onConfirm={async () => { await act(() => rotateScheduleHook(renewing.id)) }}
          onClose={() => setRenewing(null)}
        />
      )}
    </div>
  )

  // The one shared form (the form view swaps in over the list). A hoisted function so
  // the JSX above can call it before its textual position.
  function renderForm() {
    if (!data) return null // narrowing doesn't flow into hoisted functions
    return (
        <div className="schedules-form flex flex-col gap-2.5 rounded-[10px] border border-line bg-panel-strong p-3">
          {reEnableId && (
            <div className="schedules-reenable rounded-[8px] border border-[var(--warn-edge)] bg-[var(--warn-soft)] px-2.5 py-2 text-[13px] text-[var(--warn)]">
              ⏰ This schedule's chat was deleted. Pick a <b>Destination</b> below, then <b>Save</b> — it re-enables once it has somewhere to run.
            </div>
          )}
          {/* "describe it" — the model proposes, the FILLED FORM below is the review
              surface, and only the user's Save/Create writes. Instruction jobs only:
              tool/http rows are hand-edited (the assist endpoint refuses them too). */}
          {fAction === 'skill-turn' && (
            <div className="schedules-assist flex flex-col gap-1.5 rounded-[8px] border border-[var(--edge)] bg-[var(--wash)] px-2.5 py-2">
              <span className="text-xs text-muted">
                ✨ Or just describe it — the assistant fills the form below; nothing is saved until you review and {editingId ? 'save' : 'create'}.
              </span>
              <div className="flex gap-1.5">
                <input
                  className="gw-input flex-1 schedules-assist-input"
                  value={aPrompt}
                  onChange={(e) => setAPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && aPrompt.trim() && !aBusy) { e.preventDefault(); void propose() } }}
                  placeholder={editingId ? 'e.g. move it to 8pm, weekdays only' : 'e.g. every morning at 9, remind me to check the deploy queue'}
                  disabled={aBusy}
                  autoComplete="off"
                />
                <button className="gw-btn shrink-0 schedules-assist-go" disabled={aBusy || !aPrompt.trim()} onClick={() => void propose()}>
                  {aBusy ? 'Thinking…' : 'Propose'}
                </button>
              </div>
              {aSummary && (
                <span className="text-[12px] text-ink schedules-assist-note">
                  <b>Proposed:</b> {aSummary} — review the form, then <b>{editingId ? 'Save changes' : 'Create schedule'}</b>.
                </span>
              )}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Name</span>
            <input className="gw-input schedules-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Morning research digest" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 self-start">
            <span className="text-xs text-muted">Action</span>
            <select className="gw-input schedules-action" value={fAction} onChange={(e) => setFAction(e.target.value as typeof fAction)}>
              <option value="skill-turn">instruction — the assistant does it (may use tools)</option>
              <option value="tool">tool call (advanced) — one tool, fixed args, no AI</option>
              {data.canHttp && <option value="http">http request (advanced) — root only</option>}
            </select>
          </label>
          {fAction === 'skill-turn' && (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Skill (optional)</span>
                  <ClearableSelect className="gw-input schedules-skill" value={fSkill} onChange={setFSkill}>
                    <option value="">no skill — plain instruction</option>
                    {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </ClearableSelect>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Model</span>
                  <ModelCombo items={models} value={fModel} onChange={setFModel} clearable={false} showFullValue />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Instruction — what each run is asked to do</span>
                <textarea className="gw-textarea !mb-0" rows={3} maxLength={4000} value={fPrompt} onChange={(e) => setFPrompt(e.target.value)}
                  placeholder="e.g. Research the latest local-LLM releases from the past day and summarize with sources." />
              </label>
              <details className="schedules-turntools">
                <summary className="cursor-pointer text-xs text-muted">
                  Tools (optional — all available when none selected{fTurnTools.length ? `; ${fTurnTools.length} selected` : ''})
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {data.tools.map((t) => (
                    <label key={t.id} className="gw-check text-[12px]" title={t.description}>
                      <input
                        type="checkbox"
                        checked={fTurnTools.includes(t.id)}
                        onChange={(e) => setFTurnTools((prev) => e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id))}
                      />
                      <span className="font-mono">{t.id}</span>
                    </label>
                  ))}
                </div>
              </details>
            </>
          )}
          {fAction === 'tool' && (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Tool</span>
                  <select className="gw-input schedules-tool" value={fTool} onChange={(e) => setFTool(e.target.value)}>
                    <option value="">pick a tool…</option>
                    {data.tools.map((t) => <option key={t.id} value={t.id} title={t.description}>{t.id}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Arguments (JSON, optional)</span>
                  <input className="gw-input font-mono schedules-args" value={fToolArgs} onChange={(e) => setFToolArgs(e.target.value)}
                    placeholder='e.g. {"expression": "2+3"}' spellCheck={false} />
                </label>
              </div>
              <p className="adm-dim m-0 text-[12px] schedules-tool-note">
                Advanced: this runs the component tool <b>directly</b> — no model, no instruction, the exact
                JSON arguments every time (deterministic and token-free, e.g. for webhook-fired pings).
                Want to describe the job in plain words and have the assistant work out the details at run
                time? Use <b>instruction</b> — and optionally narrow its Tools to just this one.
              </p>
            </>
          )}
          {fAction === 'http' && (
            <div className="flex flex-wrap items-end gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Method</span>
                <select className="gw-input" value={fHttpMethod} onChange={(e) => setFHttpMethod(e.target.value)}>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="flex min-w-[280px] flex-1 flex-col gap-1">
                <span className="text-xs text-muted">URL</span>
                <input className="gw-input font-mono" value={fHttpUrl} onChange={(e) => setFHttpUrl(e.target.value)}
                  placeholder="https://…" spellCheck={false} />
              </label>
              {fHttpMethod !== 'GET' && fHttpMethod !== 'HEAD' && (
                <label className="flex w-full flex-col gap-1">
                  <span className="text-xs text-muted">Body (optional)</span>
                  <textarea className="gw-textarea !mb-0 font-mono" rows={2} maxLength={16000} value={fHttpBody} onChange={(e) => setFHttpBody(e.target.value)} spellCheck={false} />
                </label>
              )}
            </div>
          )}
          {/* items-START: every column is label+input with one-line labels, so inputs line
              up top-aligned too — and the cron hint can hang BELOW its input without
              lifting anything (items-end punished any column that grew downward) */}
          <div className="flex flex-wrap items-start gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">When</span>
              <select className="gw-input schedules-kind" value={fKind} onChange={(e) => setFKind(e.target.value as typeof fKind)}>
                <option value="daily">daily at…</option>
                <option value="weekly">weekly on…</option>
                <option value="every">every…</option>
                <option value="once">once, at…</option>
                <option value="cron">custom cron…</option>
                <option value="webhook">webhook (fired from outside)</option>
              </select>
            </label>
            {fKind === 'weekly' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Day</span>
                <select className="gw-input" value={fDow} onChange={(e) => setFDow(e.target.value)}>
                  {DOW.map((d, i) => <option key={d} value={String(i)}>{d}</option>)}
                </select>
              </label>
            )}
            {(fKind === 'daily' || fKind === 'weekly') && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Time</span>
                <input type="time" className="gw-input schedules-time" value={fTime} onChange={(e) => setFTime(e.target.value)} />
              </label>
            )}
            {fKind === 'every' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Every</span>
                  <input className="gw-input !w-16" value={fEveryN} onChange={(e) => setFEveryN(e.target.value)} inputMode="numeric" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Unit</span>
                  <select className="gw-input" value={fEveryUnit} onChange={(e) => setFEveryUnit(e.target.value as typeof fEveryUnit)}>
                    <option value="m">minutes</option>
                    <option value="h">hours</option>
                    <option value="d">days</option>
                  </select>
                </label>
              </>
            )}
            {fKind === 'once' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted" title="One-shot — runs a single time, in your local time">When exactly</span>
                <input type="datetime-local" className="gw-input schedules-once" value={fOnce} onChange={(e) => setFOnce(e.target.value)} />
              </label>
            )}
            {fKind === 'cron' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Cron (5 fields)</span>
                <input className="gw-input font-mono !w-44" value={fCron} onChange={(e) => setFCron(e.target.value)} spellCheck={false} />
                {/* classic help-text placement: the translation hangs right under the box
                    it describes — stable at EVERY width (in-row spans wandered on wrap) */}
                <span className="max-w-[240px] text-[11px] leading-snug text-muted schedules-cron-hint">
                  {(() => { const d = describeCron(fCron); return d ? `= ${d}` : fCron.trim() ? 'not a recognized 5-field cron yet' : '' })()}
                </span>
              </label>
            )}
            {fKind !== 'every' && fKind !== 'webhook' && fKind !== 'once' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted" title="IANA zone — wall-clock times mean THIS zone">Timezone</span>
                <ModelCombo
                  items={tzItems} value={fTz} onChange={setFTz}
                  clearable={false} showFullValue className="!w-56 schedules-tz"
                  searchPlaceholder="type to search timezones…" noMatchLabel="No timezone matches"
                />
              </label>
            )}
            {fKind === 'webhook' && (
              <span className="pt-6 text-[12px] text-muted">a secret fire URL is minted on create — POST it from anywhere</span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            {fAction === 'skill-turn' && (
              <label className="flex flex-col gap-1 min-w-[260px]">
                <span className="text-xs text-muted">Destination</span>
                <ModelCombo
                  items={[DEDICATED, ...convos.map((c) => c.id)]} labels={destLabels}
                  value={fDest} onChange={setFDest}
                  emptyLabel="new conversation each run"
                  className="schedules-dest" searchPlaceholder="type to search conversations…"
                  noMatchLabel="No conversation matches" wide
                />
              </label>
            )}
            {fKind !== 'webhook' && (
              <label className="gw-check pb-1.5" style={{ whiteSpace: 'nowrap' }} title="If the server was off when a run was due, run once at the next start instead of skipping.">
                <input type="checkbox" checked={fCatchUp} onChange={(e) => setFCatchUp(e.target.checked)} />
                <span>catch up a missed run</span>
              </label>
            )}
          </div>
          {/* who's being edited lives in the view header now — the footer is just the verbs */}
          <div className="flex items-center justify-end gap-2">
            <button className="gw-btn" disabled={busy} onClick={closeForm}>Cancel</button>
            <button className="gw-btn gw-btn-primary schedules-save"
              disabled={busy || !fName.trim() || (fAction === 'skill-turn' ? (!fPrompt.trim() || !fModel) : fAction === 'tool' ? !fTool : !fHttpUrl.trim())}
              onClick={() => void submit()}>{busy ? 'Saving…' : reEnableId ? 'Save & re-enable' : editingId ? 'Save changes' : 'Create schedule'}</button>
          </div>
        </div>
    )
  }
}
