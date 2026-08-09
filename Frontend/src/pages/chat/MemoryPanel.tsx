import { useEffect, useState } from 'react'
import {
  type MemoryItem,
  type MemoryV2Item,
  addMemory,
  deleteMemory,
  deleteMemoryV2,
  listMemories,
  updateMemory,
} from '../../lib/chatApi'
import ConfirmModal from '../../components/ConfirmModal'

const MEM_ROW = 'chat-mem-row flex items-center gap-2 rounded-[10px] border border-line bg-[var(--bg)] px-2.5 py-1.5'

// Memory manager (the chat site's Options → 🧠 Memory section).
// Notes = user-curated (always injected). "Assistant memory" = Persona Memory v2 — the `memories`
// the assistant ACTUALLY recalls (was the legacy kv/facts; now v2, so this view == what it uses).
export default function MemoryPanel() {
  const [items, setItems] = useState<MemoryItem[]>([])
  const [assistant, setAssistant] = useState<MemoryV2Item[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listMemories()
      .then((r) => { setItems(r.memories); setAssistant(r.assistant || []) })
      .catch((e) => setError(e?.message || 'Failed to load memory'))
      .finally(() => setLoading(false))
  }, [])

  const add = async () => {
    const c = draft.trim()
    if (!c || busy) return
    setBusy(true); setError(null)
    try {
      const r = await addMemory(c)
      setItems((prev) => [...prev, r.memory])
      setDraft('')
    } catch (e) {
      setError((e as Error)?.message || 'Failed to add')
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (m: MemoryItem) => {
    try {
      const r = await updateMemory(m.id, { isEnabled: !m.isEnabled })
      setItems((prev) => prev.map((x) => (x.id === m.id ? r.memory : x)))
    } catch (e) { setError((e as Error)?.message || 'Failed to update') }
  }

  const saveContent = async (m: MemoryItem, content: string) => {
    const c = content.trim()
    if (!c || c === m.content) return
    try {
      const r = await updateMemory(m.id, { content: c })
      setItems((prev) => prev.map((x) => (x.id === m.id ? r.memory : x)))
    } catch (e) { setError((e as Error)?.message || 'Failed to save') }
  }

  // deletes are gated behind the shared confirmation modal
  const [confirming, setConfirming] = useState<{ label: string; run: () => Promise<void> } | null>(null)

  const remove = (m: MemoryItem) => setConfirming({
    label: m.content.slice(0, 120),
    run: async () => { await deleteMemory(m.id); setItems((prev) => prev.filter((x) => x.id !== m.id)) },
  })

  const removeV2 = (m: MemoryV2Item) => setConfirming({
    label: m.content.slice(0, 120),
    run: async () => { await deleteMemoryV2(m.id); setAssistant((prev) => prev.filter((x) => x.id !== m.id)) },
  })

  return (
    <div className="chat-mem-panel">
        {error && <div className="chat-error-bar mx-5 rounded-[10px] border border-[var(--danger-edge)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">{error}</div>}
        {loading && <p className="adm-dim">Loading…</p>}

        {/* Notes — curated, always injected */}
        <h3 className="chat-mem-section mb-1.5 mt-4 text-[13px]">Notes <span className="adm-dim !text-[12px]">— you write these; always added to every chat</span></h3>
        <div className="chat-mem-add mb-3 mt-3 flex items-start gap-2">
          <textarea
            className="gw-textarea !mb-0 flex-1"
            rows={2}
            placeholder="e.g. I prefer concise answers and TypeScript examples."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="gw-btn gw-btn-primary" onClick={() => void add()} disabled={busy || !draft.trim()}>Add</button>
        </div>
        <div className="chat-mem-list flex flex-col gap-2">
          {!loading && items.length === 0 && <p className="adm-dim">No notes yet.</p>}
          {items.map((m) => (
            <div key={m.id} className={`chat-mem-item flex items-start gap-2 ${m.isEnabled ? '' : 'off opacity-[.55]'}`}>
              <input className="mt-3 w-auto" type="checkbox" checked={m.isEnabled} onChange={() => void toggle(m)}
                title={m.isEnabled ? 'Enabled — click to disable' : 'Disabled — click to enable'} />
              <textarea className="gw-textarea chat-mem-text !mb-0 flex-1" defaultValue={m.content} rows={2}
                onBlur={(e) => void saveContent(m, e.target.value)} />
              <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => void remove(m)} title="Delete">×</button>
            </div>
          ))}
        </div>

        {/* Assistant memory — Persona Memory v2 (what the assistant actually recalls) */}
        <h3 className="chat-mem-section mb-1.5 mt-4 text-[13px]">Assistant memory <span className="adm-dim !text-[12px]">— saved automatically by the assistant</span></h3>
        {!loading && assistant.length === 0 && <p className="adm-dim">Nothing yet.</p>}
        {assistant.length > 0 && (
          <div className="chat-mem-list flex flex-col gap-2">
            {assistant.map((m) => (
              <div key={m.id} className={MEM_ROW}>
                <span className="chat-mem-kind whitespace-nowrap rounded-full border border-line px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] text-muted" title={m.entity && m.attribute ? `${m.entity} · ${m.attribute}` : m.kind}>{m.kind}</span>
                <span className="chat-mem-kvval flex-1 break-words text-[13px] text-ink">{m.content}{m.pinned ? ' 📌' : ''}</span>
                <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => void removeV2(m)} title="Forget">×</button>
              </div>
            ))}
          </div>
        )}

        {confirming && (
          <ConfirmModal
            title="Forget this memory?"
            message={<span>Forget this? <span className="adm-dim">“{confirming.label}{confirming.label.length >= 100 ? '…' : ''}”</span></span>}
            onConfirm={confirming.run}
            onClose={() => setConfirming(null)}
          />
        )}
    </div>
  )
}
