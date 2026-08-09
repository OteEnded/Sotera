import { useCallback, useEffect, useRef, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../lib/api'
import { apiUrl } from '../../config'
import ConfirmModal from '../../components/ConfirmModal'
import RefreshButton from '../../components/RefreshButton'
import { cell, ui } from './ui'
import { dismissOnBackdrop } from '../../lib/overlay'

type Skill = {
  id: string; slug: string; registryId: string; description: string
  license: string | null; enabled: boolean; allowedTools: string[] | null
  extensions: Record<string, unknown> | null; warnings: string[] | null
  files: number; createdAt?: string; updatedAt?: string
  builtin?: boolean // persona component skill (code, not an imported archive) — read-only here
}

type SkillDetail = Skill & {
  prompt: string
  skillMd: string | null
  fileList: { path: string; size: number; binary: boolean }[]
}

const kb = (n: number) => (n >= 1024 ? `${Math.round(n / 102.4) / 10} KB` : `${n} B`)

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

// Root-only manager for Agent Skills (agentskills.io): import a `.skill`/zip exported from
// claude.ai / Claude Code / Cowork, and it becomes bindable in the chat ⚙ panel. Exports
// repack the ORIGINAL files, so a skill re-uploads to Claude surfaces unchanged.
export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [removing, setRemoving] = useState<Skill | null>(null)
  // a 409 'exists' import parks here so the user can confirm the overwrite
  const [pendingReplace, setPendingReplace] = useState<{ name: string; data: string } | null>(null)

  // authoring: write a skill here (name/description/instructions -> SKILL.md server-side).
  // The same modal edits an installed DB skill in place (editing set, name locked) and
  // clones a built-in one into an editable copy (prefilled, saved as a new skill).
  const [authoring, setAuthoring] = useState(false)
  const [editing, setEditing] = useState<Skill | null>(null)
  const [aName, setAName] = useState('')
  const [aDesc, setADesc] = useState('')
  const [aBody, setABody] = useState('')
  const [aLicense, setALicense] = useState('')
  const [aReplaceAsk, setAReplaceAsk] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await apiGet('/v1/admin/skills')
      setSkills(res.skills || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const doImport = async (data: string, replace: boolean, name: string) => {
    setError(''); setNotice(''); setBusy(true)
    try {
      const res = await apiPost('/v1/admin/skills/import', { data, ...(replace ? { replace: true } : {}) })
      setNotice(`${res.skill.slug} ${res.skill.status || 'imported'} (${res.skill.files} files)`)
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'exists') {
        setPendingReplace({ name, data }) // ask before overwriting the installed version
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // same file can be picked again
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { setError(`"${file.name}" is over the 8 MB archive cap`); return }
    await doImport(await fileToBase64(file), false, file.name)
  }

  const closeAuthor = () => { setAuthoring(false); setEditing(null); setAName(''); setADesc(''); setABody(''); setALicense('') }

  const submitAuthor = async (replace: boolean) => {
    setError(''); setNotice(''); setBusy(true); setAReplaceAsk(false)
    try {
      if (editing) {
        // edit in place: content only (the slug is the skill's identity)
        const res = await apiPatch(`/v1/admin/skills/${editing.id}`, {
          description: aDesc.trim(), instructions: aBody, license: aLicense.trim(),
        })
        setNotice(`${res.skill.slug} updated`)
      } else {
        const res = await apiPost('/v1/admin/skills', {
          name: aName.trim(), description: aDesc.trim(), instructions: aBody,
          ...(aLicense.trim() ? { license: aLicense.trim() } : {}),
          ...(replace ? { replace: true } : {}),
        })
        setNotice(`${res.skill.slug} ${res.skill.status || 'created'}`)
      }
      closeAuthor()
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'exists') setAReplaceAsk(true) // confirm the overwrite
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Edit prefills from the stored content; Clone prefills from a built-in's synthesized
  // detail under a fresh name (built-in code itself can't be edited from the console).
  const openEdit = async (s: Skill, clone: boolean) => {
    setError('')
    try {
      const res = await apiGet(`/v1/admin/skills/${s.id}`)
      const d = res.skill as SkillDetail
      setEditing(clone ? null : s)
      setAName(clone ? `${s.slug}-copy` : s.slug)
      setADesc(d.description || '')
      setABody(d.prompt || '')
      setALicense(d.license || '')
      setAuthoring(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const openDetail = async (s: Skill) => {
    setError('')
    try {
      const res = await apiGet(`/v1/admin/skills/${s.id}`)
      setDetail(res.skill)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const exportSkill = async (s: Skill) => {
    setError('')
    try {
      const res = await fetch(apiUrl(`/v1/admin/skills/${s.id}/export`), { credentials: 'include' })
      if (!res.ok) throw new Error(`export failed (HTTP ${res.status})`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${s.slug}.skill`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggle = async (s: Skill) => {
    setError('')
    try {
      await apiPatch(`/v1/admin/skills/${s.id}`, { enabled: !s.enabled })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async () => {
    if (!removing) return
    setError('')
    try {
      await apiDelete(`/v1/admin/skills/${removing.id}`)
      setRemoving(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className={`${ui.page} skills-page`}>
      <h2 className={ui.h2}>Skills</h2>
      <p className="text-muted text-[13px] mt-0 mb-3">
        Agent Skills in the open <code className={ui.codeChip}>SKILL.md</code> format — a <code className={ui.codeChip}>.skill</code> file
        from claude.ai, Claude Code, or Cowork imports here and becomes bindable in the chat ⚙ panel. Tools the skill
        expects but this platform lacks are skipped (listed under warnings); bundled reference files are served to the
        model on demand. Exports repack the original files, so they re-upload to Claude surfaces unchanged.
        Rows marked <b>built-in</b> are persona component skills (code shipped with the platform) — disable, export,
        or <b>Clone</b> them into an editable copy here; the code itself is managed in the persona.
      </p>

      {error && <div className="text-danger text-[13px] mb-2 skills-error">{error}</div>}
      {notice && <div className="text-[13px] mb-2 text-[var(--ok)] skills-notice">{notice}</div>}

      <div className={ui.formRow}>
        <input ref={fileRef} type="file" accept=".skill,.zip" className="hidden" onChange={onPickFile} />
        <button className="gw-btn skills-import" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Importing…' : 'Import .skill / .zip'}
        </button>
        <button className="gw-btn skills-new" disabled={busy} onClick={() => setAuthoring(true)}>✎ New skill</button>
        <RefreshButton onRefresh={load} />
      </div>

      <div className={ui.tableWrap}>
        <table className={`${ui.table} skills-table`}>
          <colgroup>
            <col className="w-[168px]" /><col /><col className="w-[52px]" /><col className="w-[76px]" /><col className="w-[356px]" />
          </colgroup>
          <thead>
            <tr>
              <th className={ui.th}>Skill</th>
              <th className={ui.th}>Description</th>
              <th className={ui.th}>Files</th>
              <th className={ui.th}>Status</th>
              <th className={ui.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {skills.length === 0 && (
              <tr><td colSpan={5} className={ui.empty}>No skills imported yet — drop a .skill export here.</td></tr>
            )}
            {skills.map((s, i) => {
              const last = i === skills.length - 1
              return (
                <tr key={s.id} className="skills-row">
                  <td className={`${cell(last, true)} ${s.enabled ? '' : ui.cellDim}`} title={s.registryId}>
                    <strong>{s.slug}</strong>
                    {s.builtin && (
                      <span className="ml-1.5 align-middle text-[10px] uppercase tracking-[0.04em] text-muted border border-line rounded-full px-1.5 py-px"
                        title="A persona component skill — its code ships with the platform. Disable, export, or clone it into an editable copy here; the code itself is managed in the persona.">built-in</span>
                    )}
                    {(s.warnings?.length ?? 0) > 0 && (
                      <span title={s.warnings!.join('\n')} className="ml-1.5 cursor-help">⚠</span>
                    )}
                  </td>
                  <td className={`${cell(last, true)} ${s.enabled ? '' : ui.cellDim}`} title={s.description}>{s.description}</td>
                  <td className={`${cell(last)} ${s.enabled ? '' : ui.cellDim}`}>{s.files}</td>
                  <td className={cell(last)}>{s.enabled ? 'enabled' : 'disabled'}</td>
                  <td className={cell(last)}>
                    <div className={ui.actions}>
                      <button className="gw-btn adm-btn-sm" onClick={() => openDetail(s)}>Detail</button>
                      <button className="gw-btn adm-btn-sm" onClick={() => exportSkill(s)}>Export</button>
                      {s.builtin
                        ? <button className="gw-btn adm-btn-sm skills-clone" title="Copy this built-in skill into an editable skill of its own" onClick={() => void openEdit(s, true)}>Clone</button>
                        : <button className="gw-btn adm-btn-sm skills-edit" onClick={() => void openEdit(s, false)}>Edit</button>}
                      <button className={`gw-btn adm-btn-sm ${s.enabled ? 'adm-btn-warn' : 'adm-btn-ok'}`} onClick={() => toggle(s)}>{s.enabled ? 'Disable' : 'Enable'}</button>
                      {!s.builtin && <button className="gw-btn adm-btn-sm adm-btn-danger" onClick={() => setRemoving(s)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(() => setDetail(null))}>
          <div className={`${ui.modalCard} max-w-[760px] skills-detail`} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>{detail.slug}</h3>
              <button className="gw-btn adm-btn-sm" onClick={() => setDetail(null)}>Close</button>
            </div>
            <div className="text-[13px] text-muted">{detail.description}</div>
            <div className="text-[13px]">
              {detail.license && <span className="mr-3">License: {detail.license}</span>}
              <span className="mr-3">Tools: {detail.allowedTools?.length ? detail.allowedTools.join(', ') : 'unrestricted'}</span>
              {detail.extensions && <span>Extensions: {Object.keys(detail.extensions).join(', ')}</span>}
            </div>
            {(detail.warnings?.length ?? 0) > 0 && (
              <div className="text-[13px] bg-[var(--warn-soft)] border border-[var(--warn-edge)] rounded-lg px-3 py-2">
                {detail.warnings!.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {detail.fileList.length > 0 && (
              <>
                <div className="text-xs text-muted uppercase tracking-[0.04em] font-semibold mt-1">Bundled files</div>
                <ul className="m-0 pl-5 text-[13px]">
                  {detail.fileList.map((f) => (
                    <li key={f.path}>{f.path} <span className="text-muted">({kb(f.size)}{f.binary ? ', binary' : ''})</span></li>
                  ))}
                </ul>
              </>
            )}
            <div className="text-xs text-muted uppercase tracking-[0.04em] font-semibold mt-1">SKILL.md</div>
            <pre className="m-0 max-h-[320px] overflow-auto whitespace-pre-wrap break-words text-xs bg-[var(--code-bg)] border border-line rounded-lg p-3">
              {detail.skillMd || detail.prompt}
            </pre>
          </div>
        </div>
      )}

      {authoring && (
        <div className={ui.modalOverlay} {...dismissOnBackdrop(closeAuthor)}>
          <div className={`${ui.modalCard} max-w-[680px] skills-author`} onClick={(e) => e.stopPropagation()}>
            <div className={ui.modalHead}>
              <h3 className={ui.modalTitle}>{editing ? `Edit skill — ${editing.slug}` : 'New skill'}</h3>
              <button className="gw-btn adm-btn-sm" onClick={closeAuthor}>Close</button>
            </div>
            <p className="adm-dim m-0 text-[13px]">
              {editing ? (
                <>Edits the installed skill in place: <code className={ui.codeChip}>SKILL.md</code> is regenerated spec-faithfully
                (allowed-tools and extension keys are kept); bundled files stay untouched. Chats bound to it pick the change up
                on their next turn.</>
              ) : (
                <>Becomes a spec-faithful <code className={ui.codeChip}>SKILL.md</code> — exportable as a <code className={ui.codeChip}>.skill</code> that
                uploads to claude.ai/Cowork unchanged. The <b>description is the trigger</b>: say what the skill does AND when to use it, with the
                phrases users would actually type.</>
              )}
            </p>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>{editing ? 'Name — the skill\'s identity, not editable' : 'Name — kebab-case, becomes the id (skill.<name>)'}</span>
              <input className="gw-input" value={aName} onChange={(e) => setAName(e.target.value)} placeholder="e.g. release-notes-writer" autoComplete="off" spellCheck={false} disabled={!!editing} />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Description — what it does + when to use it ({aDesc.length}/1024)</span>
              <textarea className="gw-textarea !mb-0" rows={3} maxLength={1024} value={aDesc} onChange={(e) => setADesc(e.target.value)}
                placeholder="Writes crisp release notes from a changelog. Use whenever the user mentions release notes, changelogs, version announcements…" />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Instructions — the markdown body the model follows when the skill runs</span>
              <textarea className="gw-textarea !mb-0 font-mono text-[13px]" rows={12} value={aBody} onChange={(e) => setABody(e.target.value)}
                placeholder={'# Release Notes Writer\n\nWhen given a changelog:\n1. Group changes by theme…'} />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>License (optional)</span>
              <input className="gw-input max-w-[240px]" value={aLicense} onChange={(e) => setALicense(e.target.value)} placeholder="e.g. MIT" autoComplete="off" />
            </label>
            <div className={ui.modalActions}>
              <button className="gw-btn" disabled={busy} onClick={closeAuthor}>Cancel</button>
              <button className="gw-btn gw-btn-primary skills-author-save" disabled={busy || !aName.trim() || !aDesc.trim() || !aBody.trim()}
                onClick={() => void submitAuthor(false)}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create skill'}</button>
            </div>
          </div>
        </div>
      )}

      {aReplaceAsk && (
        <ConfirmModal
          title="Skill already installed"
          message={`"${aName.trim()}" already exists. Replace the installed version with this one?`}
          confirmLabel="Replace"
          danger={false}
          onConfirm={() => submitAuthor(true)}
          onClose={() => setAReplaceAsk(false)}
        />
      )}

      {removing && (
        <ConfirmModal
          title="Delete skill"
          message={`Delete "${removing.slug}"? Conversations bound to it will fall back to normal turns.`}
          confirmLabel="Delete"
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}

      {pendingReplace && (
        <ConfirmModal
          title="Skill already installed"
          message={`A skill with this name is already installed. Replace it with the version from "${pendingReplace.name}"?`}
          confirmLabel="Replace"
          danger={false}
          onConfirm={async () => { const p = pendingReplace; setPendingReplace(null); await doImport(p.data, true, p.name) }}
          onClose={() => setPendingReplace(null)}
        />
      )}
    </div>
  )
}
