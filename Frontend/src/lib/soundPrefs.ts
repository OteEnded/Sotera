// Sound channels — one output level per place the app can EMIT sound (Voice v1).
//
// Ote, 2026-08-04: *"as we starting to emit sound from the app. add volumn slider for each where it emit
// sound, default 75%. so it not too lound"* + *"add section to setting about sound/volumn in options. user
// can set for, ask_user valumn, stt voumn, and maybe else in thefuter."*
//
// Design decisions worth knowing:
//
// * **Volume 0 IS mute.** There is no separate muted flag. Two states that can disagree ("muted, but volume
//   60") is a bug generator, and the speaker icon has to pick one to display anyway. `toggleMute` remembers
//   the last audible level so unmuting restores it rather than jumping to 100.
// * **Levels sync across devices** via chat_prefs (like theme), with a localStorage mirror so a sound that
//   fires before the prefs request lands still plays at the right level instead of full blast.
// * **Live**: emitters subscribe. Dragging the slider while the ask_user jingle is playing changes it in
//   place — that is the whole point of putting a slider next to the thing making noise.
// * **This registry carries LABELS ONLY.** The authority for which channels may be stored is the backend
//   (`Backend/app/routes/v1/me-prefs.route.js`, SOUND_CHANNELS). Adding a channel = one line in each; a
//   mismatch fails loudly with `unknown_sound_channel` rather than persisting a key that never plays.
import { saveChatPrefs, type ChatPrefs } from './chatApi'

export type SoundChannel = 'askUser' | 'speech'
export const SOUND_DEFAULT = 75

export type SoundChannelInfo = {
  key: SoundChannel
  label: string
  hint: string
  icon: string
}

// Presentation only — see the note above about where the authority lives.
export const SOUND_CHANNELS: SoundChannelInfo[] = [
  {
    key: 'askUser',
    label: 'When the assistant asks you something',
    hint: 'The waiting music while a reply is paused on your answer (ask_user). Plays until you answer, skip, or it times out.',
    icon: '❓',
  },
  {
    key: 'speech',
    label: 'Reading a message aloud',
    hint: 'The 🔊 button on a message. Generated locally on your own machine — nothing is sent to a cloud service.',
    icon: '🔊',
  },
]

const MIRROR_KEY = 'chat_sound_levels'
const RATE_MIRROR_KEY = 'chat_speech_rate'
const LEGACY_MUTE_KEY = 'chat_interaction_sound' // pre-Voice: a single on/off for the ask_user jingle

// ── SPEECH RATE ──────────────────────────────────────────────────────────────────────────────────────────
// Ote, 2026-08-05: *"i dont know if we can make speak a bit faster, like 1.15x. so it not sound too slow"*.
//
// It lives in this module rather than a new one because it is the same KIND of thing as a channel level — a
// listening preference, mirrored locally, synced to the account, and applied LIVE to audio that is already
// playing. Splitting it out would mean a second copy of the mirror/persist/subscribe machinery for one number.
// The authority for the range is the backend (me-prefs.route.js); these bounds must match it.
export const SPEECH_RATE_DEFAULT = 1
export const SPEECH_RATE_MIN = 0.75
export const SPEECH_RATE_MAX = 1.5
// Past ~1.3x on the live "answer with speak" path, playback can overtake rendering and pause between pieces
// (each piece is ~1.4x the last at a measured RTF of 0.38-0.54). Not a clamp — a threshold the UI names.
export const SPEECH_RATE_STREAM_SAFE = 1.3

const clampRate = (n: number) =>
  Math.round(Math.max(SPEECH_RATE_MIN, Math.min(SPEECH_RATE_MAX, n)) * 20) / 20

function readRateMirror(): number {
  try {
    const raw = localStorage.getItem(RATE_MIRROR_KEY)
    const v = raw == null ? NaN : Number(raw)
    if (Number.isFinite(v)) return clampRate(v)
  } catch { /* private mode — the default is fine */ }
  return SPEECH_RATE_DEFAULT
}

let speechRate = readRateMirror()

export const getSpeechRate = (): number => speechRate

/**
 * Apply the current rate to an <audio> element.
 *
 * ⚠ `preservesPitch` IS THE WHOLE POINT, and it is set explicitly rather than trusted. With it off, 1.15x
 * playback also raises the pitch by 12·log2(1.15) ≈ **2.4 semitones** — which would silently undo the entire
 * per-voice pitch-matching pipeline, whose worst measured error is currently 0.75 st. The spec default is
 * true, but "the default is probably fine" is how a subsystem gets quietly reverted by an unrelated setting.
 * Safari needs the webkit- name.
 */
export function applyPlaybackRate(el: HTMLAudioElement) {
  type PitchFlags = { preservesPitch?: boolean; webkitPreservesPitch?: boolean }
  const e = el as HTMLAudioElement & PitchFlags
  e.preservesPitch = true
  e.webkitPreservesPitch = true
  el.playbackRate = speechRate
}

let rateTimer: number | null = null

/** Set the playback rate. Applies instantly (subscribers re-apply it to what is playing); persists after. */
export function setSpeechRate(v: number, opts: { persist?: boolean } = {}) {
  const next = clampRate(v)
  if (speechRate === next) return
  speechRate = next
  try { localStorage.setItem(RATE_MIRROR_KEY, String(next)) } catch { /* ignore */ }
  emit()
  if (opts.persist !== false) {
    if (rateTimer != null) clearTimeout(rateTimer)
    rateTimer = window.setTimeout(() => {
      rateTimer = null
      void saveChatPrefs({ speechRate } as Partial<ChatPrefs>).catch(() => {})
    }, 400)
  }
}

/** Adopt the server copy when chat prefs load. Does not re-persist what it just read. */
export function hydrateSpeechRate(rate: number | undefined | null) {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return
  const next = clampRate(rate)
  if (next === speechRate) return
  speechRate = next
  try { localStorage.setItem(RATE_MIRROR_KEY, String(next)) } catch { /* ignore */ }
  emit()
}

type Levels = Record<SoundChannel, number>
const defaults = (): Levels =>
  Object.fromEntries(SOUND_CHANNELS.map((c) => [c, SOUND_DEFAULT])) as Levels

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

function readMirror(): Levels {
  const out = defaults()
  try {
    const raw = localStorage.getItem(MIRROR_KEY)
    if (raw) {
      const j = JSON.parse(raw) as Record<string, unknown>
      for (const c of SOUND_CHANNELS) {
        const v = j[c.key]
        if (typeof v === 'number' && Number.isFinite(v)) out[c.key] = clamp(v)
      }
      return out
    }
    // No mirror yet — inherit the old single mute toggle so anyone who turned the jingle off
    // stays off instead of being surprised by sound after an upgrade.
    if (localStorage.getItem(LEGACY_MUTE_KEY) === 'off') out.askUser = 0
  } catch { /* private mode / disabled storage — defaults are fine */ }
  return out
}

let levels: Levels = readMirror()
const lastAudible: Partial<Levels> = {}
const listeners = new Set<(l: Levels) => void>()

function writeMirror() {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(levels))
    localStorage.removeItem(LEGACY_MUTE_KEY) // migrated — one source of truth from here
  } catch { /* ignore */ }
}

function emit() {
  for (const fn of listeners) {
    try { fn(levels) } catch { /* a bad listener must not stop the others */ }
  }
}

/**
 * Subscribe to any playback-preference change — levels OR the speech rate. Returns an unsubscribe.
 *
 * The callback receives the levels because that is what every existing subscriber wanted; a rate change fires
 * it too, so re-read `getSpeechRate()` there rather than trusting the argument to tell you what moved. One
 * notification channel for both is deliberate: a subscriber that re-applies "current output settings" to the
 * element it is playing is correct for either, and two channels would let one of them be forgotten.
 */
export function onSoundChange(fn: (l: Levels) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 0-100, for UI. */
export const getLevel = (c: SoundChannel): number => levels[c] ?? SOUND_DEFAULT
/** 0-1 multiplier, for an audio graph. Multiply an emitter's OWN base level by this. */
export const gainOf = (c: SoundChannel): number => getLevel(c) / 100
export const isMuted = (c: SoundChannel): boolean => getLevel(c) <= 0
export const allLevels = (): Levels => ({ ...levels })

// Slider drags fire continuously: apply locally every tick, persist on a trailing timer.
let saveTimer: number | null = null
const pendingSave: Partial<Record<SoundChannel, number>> = {}
function schedulePersist() {
  if (saveTimer != null) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    const patch = { ...pendingSave }
    for (const k of Object.keys(pendingSave)) delete pendingSave[k as SoundChannel]
    if (!Object.keys(patch).length) return
    // Fire-and-forget: a failed save must never block audio or freeze the slider. The mirror
    // already holds the value, so the level survives a reload even if the network lost it.
    void saveChatPrefs({ sound: patch } as Partial<ChatPrefs>).catch(() => {})
  }, 400)
}

/** Set a channel's level. Applies instantly; persists shortly after the user stops dragging. */
export function setLevel(c: SoundChannel, v: number, opts: { persist?: boolean } = {}) {
  const next = clamp(v)
  if (next > 0) lastAudible[c] = next
  if (levels[c] === next) return
  levels = { ...levels, [c]: next }
  writeMirror()
  emit()
  if (opts.persist !== false) {
    pendingSave[c] = next
    schedulePersist()
  }
}

/** Mute (→ 0) or restore the last audible level. Volume 0 is the only mute state. */
export function toggleMute(c: SoundChannel) {
  if (isMuted(c)) setLevel(c, lastAudible[c] ?? SOUND_DEFAULT)
  else setLevel(c, 0)
}

/** Adopt the server copy when chat prefs load. Does not re-persist what it just read. */
export function hydrateSoundPrefs(sound: Partial<Record<SoundChannel, number>> | undefined | null) {
  if (!sound || typeof sound !== 'object') return
  let changed = false
  const next = { ...levels }
  for (const c of SOUND_CHANNELS) {
    const v = sound[c.key]
    if (typeof v === 'number' && Number.isFinite(v) && clamp(v) !== next[c.key]) {
      next[c.key] = clamp(v)
      changed = true
    }
  }
  if (!changed) return
  levels = next
  for (const c of SOUND_CHANNELS) if (levels[c.key] > 0) lastAudible[c.key] = levels[c.key]
  writeMirror()
  emit()
}

/** A short, harmless blip at a channel's current level — so a slider can be judged by ear. */
export function previewChannel(c: SoundChannel) {
  const g = gainOf(c)
  if (g <= 0) return
  try {
    const AC: typeof AudioContext = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ac = new AC()
    const t = ac.currentTime
    // Two short notes rather than a beep: a level is easier to judge on something with an
    // attack and a tail, which is what real notifications sound like.
    for (const [i, semi] of [0, 7].entries()) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'triangle'
      osc.frequency.value = 523.25 * Math.pow(2, semi / 12)
      const at = t + i * 0.16
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.28 * g, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.34)
      osc.connect(gain).connect(ac.destination)
      osc.start(at)
      osc.stop(at + 0.4)
    }
    window.setTimeout(() => { void ac.close().catch(() => {}) }, 900)
  } catch { /* no audio device — the slider still works */ }
}
