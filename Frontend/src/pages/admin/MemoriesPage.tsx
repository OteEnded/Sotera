import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPost } from '../../lib/api'
import { copyToClipboard } from '../../lib/clipboard'
import ConfirmModal from '../../components/ConfirmModal'
import RefreshButton from '../../components/RefreshButton'
import MemoryHealthPanel from './MemoryHealthPanel'
import { cell, ui } from './ui'

// Persona Memory v2 inspector — see and manage what the persona remembers (RFC_PERSONA_MEMORY).
// Read-mostly: list with kind/scope filters + per-row pin / forget (soft) / delete (hard).

type Memory = {
  id: string; kind: 'episodic' | 'semantic' | 'identity' | 'card'; content: string
  entity: string | null; attribute: string | null; value: string | null
  importance: number | null; accessCount: number; pinned: boolean; tier: string
  userId: string | null; username: string; source: string | null; embeddingDim: number; embeddingModel: string | null
  supersedesId: string | null; validAt: string | null; invalidAt: string | null; expiredAt: string | null
  createdAt: string | null; lastAccess: string | null
}
type Summary = { total: number; live: number; archived: number; pinned: number; byKind: Record<string, number> }
type Owner = { key: string; name: string; live: number }

const KIND_TONE: Record<string, string> = {
  episodic: 'border-line text-muted',
  semantic: 'border-[var(--think-edge)] bg-[var(--think-soft)] text-[var(--think)]',
  identity: 'border-[var(--ok-edge)] bg-[var(--ok-soft)] text-[var(--ok)]',
  // `--edge` is the themed accent-tinted border; `--accent-edge` was a typo for it and is undefined in both
  // themes, which made this border silently fall back to currentColor. `--accent-deep` is the readable INK on
  // a soft/washed background (that is what it exists for).
  card: 'border-[var(--edge)] bg-[var(--accent-soft)] text-[var(--accent-deep)]',
}
const shortDate = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : '—')

export default function MemoriesPage() {
  const [items, setItems] = useState<Memory[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [owners, setOwners] = useState<Owner[]>([])
  const [kind, setKind] = useState('')
  const [scope, setScope] = useState('live')
  const [who, setWho] = useState('')
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<Memory | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyId = async (id: string) => {
    if (await copyToClipboard(id)) { setCopiedId(id); setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200) }
  }

  // No SYNCHRONOUS setState here: this runs from an effect whose dependencies change with the filters, and a
  // setState before the first await makes React re-render mid-effect (cascading renders). Every state write
  // now happens after the fetch resolves, including clearing a stale error.
  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams()
      if (kind) q.set('kind', kind)
      q.set('scope', scope)
      if (who) q.set('userId', who)
      const res = await apiGet(`/v1/admin/memories?${q.toString()}`)
      setItems(res.memories || [])
      setSummary(res.summary || null)
      setOwners(res.owners || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [kind, scope, who])

  // Fetching EXTERNAL data when the filters change is a legitimate effect; the rule cannot tell it apart from
  // deriving state in an effect (which is the thing worth banning), and it traces `load` -> setState whatever
  // the ordering. `load` already avoids any setState before its first await, so no render cascades.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    setError('')
    try { await fn(); await load() } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  const togglePin = (m: Memory) => act(() => apiPost(`/v1/admin/memories/${m.id}/pin`, { pinned: !m.pinned }))
  const forget = (m: Memory) => act(() => apiPost(`/v1/admin/memories/${m.id}/forget`, {}))
  const removeMem = async (m: Memory) => { await apiDelete(`/v1/admin/memories/${m.id}`); await load() }

  return (
    <div className={`${ui.page} memories-page`}>
      <h2 className={ui.h2}>Memory</h2>
      <p className="text-muted text-[13px] mt-0 mb-3">
        What the persona remembers (Persona Memory v2). <b>Episodic</b> = raw turns · <b>semantic</b> =
        distilled facts (update-not-append) · <b>identity</b> = stable traits · <b>card</b> = a
        consolidated per-topic summary (Knowledge Card). Recall ranks by relevance × importance ×
        recency; nightly decay archives unused noise. Pin to protect a memory from decay; forget to
        archive (soft); delete to remove permanently.
      </p>

      {/* Health first: the observe phase's KPIs were reachable only by running scripts, which made
          "observe for weeks" depend on someone being at a terminal. */}
      <MemoryHealthPanel />

      {summary && (
        <div className="memories-summary mb-3 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-full border border-[var(--ok-edge)] bg-[var(--ok-soft)] px-2 py-px text-[var(--ok)] font-semibold">{summary.live} live</span>
          <span className="rounded-full border border-line px-2 py-px text-muted">{summary.archived} archived</span>
          <span className="rounded-full border border-line px-2 py-px text-muted">{summary.pinned} pinned</span>
          <span className="rounded-full border border-line px-2 py-px text-muted">
            {summary.byKind.episodic} episodic · {summary.byKind.semantic} semantic · {summary.byKind.identity} identity{summary.byKind.card ? ` · ${summary.byKind.card} card` : ''}
          </span>
        </div>
      )}

      {error && <div className="text-danger text-[13px] mb-2 memories-error">{error}</div>}

      <div className={ui.formRow}>
        <label className="text-[13px] text-muted flex items-center gap-1.5">Kind
          <select className="gw-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">all</option><option value="episodic">episodic</option>
            <option value="semantic">semantic</option><option value="identity">identity</option><option value="card">card</option>
          </select>
        </label>
        <label className="text-[13px] text-muted flex items-center gap-1.5">Scope
          <select className="gw-input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="live">live</option><option value="archived">archived</option><option value="all">all</option>
          </select>
        </label>
        <label className="text-[13px] text-muted flex items-center gap-1.5">User
          <select className="gw-input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">all users</option>
            {owners.map((o) => <option key={o.key} value={o.key}>{o.name} ({o.live})</option>)}
          </select>
        </label>
        <RefreshButton onRefresh={load} />
      </div>

      <div className={ui.tableWrap}>
        <table className={`${ui.table} memories-table`}>
          <colgroup>
            <col className="w-[84px]" /><col className="w-[96px]" /><col /><col className="w-[56px]" /><col className="w-[56px]" /><col className="w-[104px]" /><col className="w-[150px]" />
          </colgroup>
          <thead>
            <tr>
              <th className={ui.th}>Kind</th><th className={ui.th}>Who</th><th className={ui.th}>Memory</th><th className={ui.th}>Imp.</th>
              <th className={ui.th}>Used</th><th className={ui.th}>Added</th><th className={ui.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className={ui.empty}>No memories for this filter yet.</td></tr>
            )}
            {items.map((m, i) => {
              const last = i === items.length - 1
              const archived = !!m.invalidAt || !!m.expiredAt
              return (
                <tr key={m.id} className={`memories-row ${archived ? 'opacity-60' : ''}`}>
                  <td className={cell(last)}>
                    <span className={`inline-block rounded-full border px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] ${KIND_TONE[m.kind] || 'border-line text-muted'}`}>{m.kind}</span>
                    {m.pinned && <span className="ml-1" title="Pinned — never auto-forgotten">📌</span>}
                  </td>
                  <td className={cell(last)} title={m.userId || 'root (config user)'}>
                    <span className="text-[12px] text-muted">{m.username}</span>
                  </td>
                  <td className={`${cell(last)} overflow-hidden`} title={`${m.content}${m.source ? `\nsource: ${m.source}` : ''}${m.embeddingModel ? `\nembed: ${m.embeddingModel} (${m.embeddingDim})` : ''}${m.supersedesId ? '\n(supersedes an earlier value)' : ''}`}>
                    {/* content on its own truncating line — the id chip goes on a SECOND line
                        below rather than inline after it, otherwise a long memory (the common
                        case) truncates the chip away with nowrap+ellipsis before it ever paints */}
                    <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                      <span>{m.content}</span>
                      {m.kind === 'semantic' && m.entity && (
                        <span className="ml-1.5 text-[11px] text-muted">· {m.entity}/{m.attribute}</span>
                      )}
                      {archived && <span className="ml-1.5 text-[10px] uppercase tracking-[0.04em] text-[var(--warn)]">{m.invalidAt ? 'superseded' : 'archived'}</span>}
                    </div>
                    <code
                      className={`${ui.codeChip} cursor-pointer`}
                      title={`${m.id} — click to copy (for debugging: DB lookups, logs)`}
                      onClick={(e) => { e.stopPropagation(); void copyId(m.id) }}
                    >{copiedId === m.id ? 'copied ✓' : `${m.id.slice(0, 8)}…`}</code>
                  </td>
                  <td className={cell(last)}>{m.importance ?? '—'}</td>
                  <td className={cell(last)} title={m.lastAccess ? `last ${shortDate(m.lastAccess)}` : 'never recalled'}>{m.accessCount}×</td>
                  <td className={cell(last)}>{shortDate(m.createdAt)}</td>
                  <td className={cell(last)}>
                    <div className="flex gap-1 items-center">
                      <button className="gw-btn adm-btn-sm" onClick={() => togglePin(m)} title={m.pinned ? 'Unpin' : 'Pin (protect from decay)'}>{m.pinned ? 'Unpin' : 'Pin'}</button>
                      {!archived && <button className="gw-btn adm-btn-sm" onClick={() => forget(m)} title="Forget (soft archive)">Forget</button>}
                      <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setRemoving(m)} title="Delete permanently">✕</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {removing && (
        <ConfirmModal
          title="Delete memory permanently?"
          confirmLabel="Delete"
          onConfirm={() => removeMem(removing)}
          onClose={() => setRemoving(null)}
          message={(
            <>
              <p className="text-[13px]">This permanently removes the memory (not a soft archive). Prefer <b>Forget</b> unless you want it gone for good.</p>
              <p className="text-[12px] text-muted mt-1.5 break-words">{removing.content}</p>
            </>
          )}
        />
      )}
    </div>
  )
}
