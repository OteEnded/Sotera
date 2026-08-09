import { useEffect, useState } from 'react'
import { type ChatPrefs, getChatModels, getChatPrefs, saveChatPrefs } from '../../lib/chatApi'
import ModelCombo from '../../components/ModelCombo'

// Chat preferences (Options → Chat), for model-selecting users. Controls how a NEW chat
// seeds its model and its ⚙ options — carry over what you last used, or snap to default —
// plus what happens when you leave a chat that is still generating. The default-model
// field is editable only when root has unlocked it for this user's role.
export default function ChatPrefsPanel({ onChange }: { onChange?: (p: ChatPrefs) => void }) {
  const [prefs, setPrefs] = useState<ChatPrefs | null>(null)
  const [persisted, setPersisted] = useState(true)
  const [platformDefault, setPlatformDefault] = useState('')
  const [platformBg, setPlatformBg] = useState<boolean | null>(null)
  const [canSetDefault, setCanSetDefault] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getChatPrefs().then((r) => { setPrefs(r.prefs); setPersisted(r.persisted) }).catch(() => {})
    getChatModels().then((r) => {
      setPlatformDefault(r.platformDefaultModel || r.defaultModel || '')
      setCanSetDefault(r.canSetDefaultModel === true)
      setModels((r.models || []).map((m) => m.id))
      // NOTE: r.backgroundGeneration is the EFFECTIVE value (pref applied) — for labeling
      // the "platform default" choice we want the platform's own setting, which equals the
      // effective one only when the pref is 'default'. Good enough for the label; the radio
      // state itself comes from prefs.
      setPlatformBg(r.backgroundGeneration === true)
    }).catch(() => {})
  }, [])

  const update = async (patch: Partial<ChatPrefs>) => {
    if (!prefs) return
    setPrefs({ ...prefs, ...patch }) // optimistic
    try {
      const r = await saveChatPrefs(patch)
      setPrefs(r.prefs); setPersisted(r.persisted); onChange?.(r.prefs)
      setMsg(r.persisted ? '✓ Saved' : 'Applied (not stored)')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save')
      // re-sync from the server (e.g. a 403 default_model_locked rollback)
      getChatPrefs().then((r) => setPrefs(r.prefs)).catch(() => {})
    }
    setTimeout(() => setMsg(''), 2400)
  }

  if (!prefs) return <p className="adm-dim text-[13px]">Loading…</p>

  const choice = (
    group: string,
    current: string,
    value: string,
    label: string,
    desc: string,
    onPick: () => void,
  ) => (
    <label className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
      current === value ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/50'
    }`}>
      {/* w-4 h-4 shrink-0 overrides the global `input{width:100%}` that would otherwise
          stretch the radio full-width and shove the label to the right */}
      <input type="radio" name={group} className="mt-0.5 w-4 h-4 shrink-0 accent-accent" checked={current === value} onChange={onPick} />
      <span className="flex flex-col min-w-0">
        <b className="text-[13px]">{label}</b>
        <em className="not-italic text-[12px] text-muted">{desc}</em>
      </span>
    </label>
  )

  return (
    <div className="flex flex-col gap-4" data-ui="chat-prefs">
      <p className="adm-dim m-0 text-[13px]">
        How a <b>new chat</b> starts. An existing conversation always keeps its own settings; these apply
        only when you begin a fresh chat. Your last-used choices are remembered across refreshes.
        {!persisted && <span className="text-amber-700"> (These aren’t being saved.)</span>}
      </p>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-accent-deep">New chat — model</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {choice('m', prefs.newChatModel, 'last', 'Carry over last used', 'Start on the model you used most recently.', () => void update({ newChatModel: 'last' }))}
          {choice('m', prefs.newChatModel, 'default', 'Snap to default', 'Always start on the default model below.', () => void update({ newChatModel: 'default' }))}
        </div>
        {canSetDefault ? (
          <label className="flex flex-col gap-1 mt-1" data-ui="personal-default">
            <span className="text-[12px] text-muted">Your default model <span className="opacity-60">(unlocked for your role — cleared if root changes the platform default)</span></span>
            <div className="max-w-[320px]">
              <ModelCombo
                items={prefs.defaultModel && !models.includes(prefs.defaultModel) ? [prefs.defaultModel, ...models] : models}
                value={prefs.defaultModel || ''}
                onChange={(id) => void update({ defaultModel: id || null })}
                emptyLabel={`(platform default — ${platformDefault || 'unset'})`}
                showFullValue
              />
            </div>
          </label>
        ) : (
          <label className="flex flex-col gap-1 mt-1">
            <span className="text-[12px] text-muted">Default model <span className="opacity-60">(locked)</span></span>
            <input className="gw-input max-w-[280px] opacity-70 cursor-not-allowed" value={platformDefault} disabled readOnly title="The platform default — root hasn't unlocked personal defaults for your role" />
          </label>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-accent-deep">New chat — ⚙ options</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {choice('o', prefs.newChatOptions, 'last', 'Carry over last used', 'Reuse your last thinking / tools / sampling / instructions.', () => void update({ newChatOptions: 'last' }))}
          {choice('o', prefs.newChatOptions, 'default', 'Snap to default', 'Start every new chat from the default options.', () => void update({ newChatOptions: 'default' }))}
        </div>
      </div>

      <div className="flex flex-col gap-2" data-ui="bg-pref">
        <span className="text-[11px] font-bold uppercase tracking-wider text-accent-deep">Leaving a chat that is still generating</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {choice('bg', prefs.backgroundGeneration, 'default', 'Platform default',
            prefs.backgroundGeneration === 'default' && platformBg !== null
              ? `Follow the platform setting (currently: ${platformBg ? 'keep generating' : 'cancel on leave'}).`
              : 'Follow the platform setting.',
            () => void update({ backgroundGeneration: 'default' }))}
          {choice('bg', prefs.backgroundGeneration, 'on', 'Keep generating', 'The reply keeps running in the background; you can generate in several chats at once (up to the platform limit).', () => void update({ backgroundGeneration: 'on' }))}
          {choice('bg', prefs.backgroundGeneration, 'off', 'Cancel on leave', 'Switching away stops the reply and saves what streamed so far.', () => void update({ backgroundGeneration: 'off' }))}
        </div>
      </div>

      <div className="flex flex-col gap-1" data-ui="tz-pref">
        <span className="text-[11px] font-bold uppercase tracking-wider text-accent-deep">Timezone</span>
        <span className="adm-dim text-[13px]">
          {prefs.timezone || 'not set yet'} — auto-detected from your browser each visit. Replies and the
          current-time tool answer in this zone, not the server's.
        </span>
      </div>

      {msg && <span className="gw-meta">{msg}</span>}
    </div>
  )
}
