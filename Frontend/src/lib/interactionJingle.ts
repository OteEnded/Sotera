// Waiting-room jingles for HumanInteraction (the `interaction.waiting` protocol event).
// The PROTOCOL only says "notify the user however you can" — this playful implementation
// is the chat site's own personality, deliberately NOT part of the Feature/SDK.
//
// Two sources, in order:
//   1. /interaction-music/manifest.json — a list of audio files the OPERATOR drops into
//      Frontend/public/interaction-music/ (random pick, looped). Ote's beta parody hook.
//   2. Fallback: original quiz-lobby-style loops synthesized with WebAudio (no assets,
//      no copyright — composed here). Random variant per wait.
//
// Autoplay policy: browsers only allow sound after a user gesture. The user usually just
// clicked Send (the turn that asked), so play generally succeeds; when it doesn't we fail
// silent — the title flash and the card itself still carry the notification.
import { gainOf, isMuted, onSoundChange } from './soundPrefs'

// Volume comes from the shared `askUser` sound channel (Options -> Sound, and the slider on the card
// itself). Volume 0 IS mute — there is no separate mute flag here any more; the old
// `chat_interaction_sound` on/off key is migrated by soundPrefs on first read so anyone who had it off
// stays off. These two base levels are the jingle's OWN mix and are then scaled by the channel.
const SYNTH_BASE = 0.16 // modest — a wink, not a broadcast
const TRACK_BASE = 0.4  // operator-provided files are usually mastered louder than our synth
export const isJingleMuted = () => isMuted('askUser')

let audioEl: HTMLAudioElement | null = null
let ctx: AudioContext | null = null
let masterGain: GainNode | null = null   // kept so the slider can move a PLAYING jingle
let synthTimer: number | null = null
let playing = false

/** Apply the channel level to whatever is currently making noise. Called on every change. */
function applyVolume() {
  const g = gainOf('askUser')
  if (masterGain) masterGain.gain.value = SYNTH_BASE * g
  if (audioEl) audioEl.volume = TRACK_BASE * g
  // Dropped to 0 while playing = mute. Stop rather than run a silent oscillator graph.
  if (g <= 0) stopJingle()
}
onSoundChange(applyVolume)

// ── the fallback compositions (original — quiz-lobby SPIRIT, our own notes) ──
// A bouncy two-voice loop: walking bass + marimba-ish melody over I–vi–IV–V.
// Notes are [semitoneFromC4, startBeat, lengthBeats]; melodies stay pentatonic-adjacent
// so the loop reads playful, not melodic enough to be anyone's tune but ours.
type Note = [number, number, number]
type Variant = { bpm: number; bars: number; bass: Note[]; melody: Note[] }
const VARIANTS: Variant[] = [
  { // "lobby bounce" — 132bpm, 4 bars
    bpm: 132,
    bars: 4,
    bass: [
      [-24, 0, 0.9], [-17, 1, 0.9], [-24, 2, 0.9], [-12, 3, 0.9],
      [-27, 4, 0.9], [-20, 5, 0.9], [-27, 6, 0.9], [-15, 7, 0.9],
      [-19, 8, 0.9], [-12, 9, 0.9], [-19, 10, 0.9], [-7, 11, 0.9],
      [-17, 12, 0.9], [-10, 13, 0.9], [-17, 14, 0.9], [-5, 15, 0.9],
    ],
    melody: [
      [0, 0, 0.45], [4, 0.5, 0.45], [7, 1, 0.45], [12, 1.5, 0.9], [7, 2.5, 0.45], [4, 3, 0.9],
      [-3, 4, 0.45], [0, 4.5, 0.45], [4, 5, 0.45], [9, 5.5, 0.9], [4, 6.5, 0.45], [0, 7, 0.9],
      [-7, 8, 0.45], [0, 8.5, 0.45], [5, 9, 0.45], [9, 9.5, 0.9], [5, 10.5, 0.45], [0, 11, 0.9],
      [-5, 12, 0.45], [2, 12.5, 0.45], [7, 13, 0.45], [11, 13.5, 0.45], [12, 14, 1.8],
    ],
  },
  { // "elevator quiz" — 118bpm, 4 bars, softer swing
    bpm: 118,
    bars: 4,
    bass: [
      [-24, 0, 1.4], [-12, 1.5, 0.4], [-24, 2, 1.4], [-12, 3.5, 0.4],
      [-19, 4, 1.4], [-7, 5.5, 0.4], [-19, 6, 1.4], [-7, 7.5, 0.4],
      [-22, 8, 1.4], [-10, 9.5, 0.4], [-22, 10, 1.4], [-10, 11.5, 0.4],
      [-17, 12, 1.4], [-5, 13.5, 0.4], [-17, 14, 0.9], [-19, 15, 0.9],
    ],
    melody: [
      [12, 0, 0.9], [9, 1, 0.45], [7, 1.5, 0.45], [4, 2, 1.8],
      [5, 4, 0.9], [9, 5, 0.45], [12, 5.5, 0.45], [14, 6, 1.8],
      [12, 8, 0.9], [7, 9, 0.45], [9, 9.5, 0.45], [5, 10, 1.8],
      [4, 12, 0.45], [7, 12.5, 0.45], [9, 13, 0.45], [12, 13.5, 0.45], [16, 14, 1.8],
    ],
  },
  { // "game-show waltz" — 140bpm in 3/4 feel (12 beats = 4 bars of 3), oom-pah-pah
    bpm: 140,
    bars: 3,
    bass: [
      [-24, 0, 0.8], [-12, 1, 0.4], [-12, 2, 0.4],
      [-17, 3, 0.8], [-5, 4, 0.4], [-5, 5, 0.4],
      [-19, 6, 0.8], [-7, 7, 0.4], [-7, 8, 0.4],
      [-12, 9, 0.8], [-24, 10, 0.4], [-24, 11, 0.4],
    ],
    melody: [
      [4, 0, 0.9], [7, 1, 0.45], [12, 2, 0.45],
      [11, 3, 0.9], [7, 4, 0.45], [4, 5, 0.45],
      [5, 6, 0.45], [9, 6.5, 0.45], [12, 7, 0.9], [9, 8, 0.45],
      [7, 9, 1.4], [4, 10.5, 0.45], [0, 11, 0.9],
    ],
  },
  { // "suspense tiptoe" — 96bpm, minor-leaning sneak (the "someone's deciding…" one)
    bpm: 96,
    bars: 4,
    bass: [
      [-24, 0, 0.4], [-24, 0.75, 0.3], [-21, 1.5, 0.9], [-24, 2.5, 0.4], [-17, 3, 0.9],
      [-22, 4, 0.4], [-22, 4.75, 0.3], [-19, 5.5, 0.9], [-22, 6.5, 0.4], [-14, 7, 0.9],
      [-24, 8, 0.4], [-24, 8.75, 0.3], [-21, 9.5, 0.9], [-24, 10.5, 0.4], [-17, 11, 0.9],
      [-19, 12, 0.9], [-17, 13, 0.9], [-14, 14, 0.9], [-12, 15, 0.9],
    ],
    melody: [
      [0, 0.5, 0.4], [3, 1, 0.4], [7, 1.5, 0.9], [3, 2.75, 0.4], [0, 3.25, 0.7],
      [-2, 4.5, 0.4], [2, 5, 0.4], [5, 5.5, 0.9], [2, 6.75, 0.4], [-2, 7.25, 0.7],
      [0, 8.5, 0.4], [3, 9, 0.4], [7, 9.5, 0.9], [10, 10.5, 0.4], [7, 11, 0.7],
      [8, 12, 0.7], [7, 13, 0.7], [3, 14, 0.7], [0, 14.75, 1.2],
    ],
  },
]

const freq = (semi: number) => 261.63 * Math.pow(2, semi / 12) // C4 base

function scheduleVariant(ac: AudioContext, master: GainNode, v: Variant, t0: number) {
  const spb = 60 / v.bpm
  const note = (semi: number, start: number, len: number, type: OscillatorType, gain: number) => {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = type
    osc.frequency.value = freq(semi)
    const at = t0 + start * spb
    const rel = Math.max(0.05, len * spb)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + 0.02) // fast attack
    g.gain.exponentialRampToValueAtTime(0.001, at + rel) // marimba-ish decay
    osc.connect(g).connect(master)
    osc.start(at)
    osc.stop(at + rel + 0.05)
  }
  for (const [s, b, l] of v.bass) note(s, b, l, 'triangle', 0.5)
  for (const [s, b, l] of v.melody) note(s, b, l, 'square', 0.22)
  return v.bars * 4 * spb // loop length in seconds
}

let lastVariant = -1 // never the same tune twice in a row (Ote: "not too repetitive")
function startSynthLoop() {
  try {
    ctx = ctx || new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const master = ctx.createGain()
    master.gain.value = SYNTH_BASE * gainOf('askUser')
    masterGain = master
    let idx = Math.floor(Math.random() * VARIANTS.length)
    if (VARIANTS.length > 1 && idx === lastVariant) idx = (idx + 1) % VARIANTS.length
    lastVariant = idx
    const variant = VARIANTS[idx]
    master.connect(ctx.destination)
    const loop = () => {
      if (!playing || !ctx) return
      const len = scheduleVariant(ctx, master, variant, ctx.currentTime + 0.05)
      synthTimer = window.setTimeout(loop, (len - 0.1) * 1000)
    }
    loop()
  } catch { /* no audio — the title flash still notifies */ }
}

/** Start the waiting jingle (idempotent; silent when the askUser channel is at 0). */
export function startJingle() {
  if (playing || isJingleMuted()) return
  playing = true
  // operator-provided tracks first (Ote's parody hook) — synth fallback otherwise
  fetch('/interaction-music/manifest.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((files: unknown) => {
      if (!playing) return
      const list = Array.isArray(files) ? files.filter((f) => typeof f === 'string' && f) : []
      if (list.length) {
        audioEl = new Audio(`/interaction-music/${list[Math.floor(Math.random() * list.length)]}`)
        audioEl.loop = true
        audioEl.volume = TRACK_BASE * gainOf('askUser')
        audioEl.play().catch(() => { if (playing) startSynthLoop() }) // blocked → try synth (same gesture rules, cheap)
      } else {
        startSynthLoop()
      }
    })
    .catch(() => { if (playing) startSynthLoop() })
}

/** Stop it (answer / skip / timeout / navigate away / mute). */
export function stopJingle() {
  playing = false
  if (synthTimer != null) { clearTimeout(synthTimer); synthTimer = null }
  if (audioEl) { audioEl.pause(); audioEl.src = ''; audioEl = null }
  masterGain = null
  if (ctx) { void ctx.close().catch(() => {}); ctx = null }
}
