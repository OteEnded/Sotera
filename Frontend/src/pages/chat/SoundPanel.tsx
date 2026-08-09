// Options → Sound. One row per channel the app can emit sound on.
//
// Ote: *"add section to setting about sound/volumn in options. user can set for, ask_user valumn, stt
// voumn, and maybe else in thefuter."* — so the panel is generated from the channel registry rather than
// hand-written per control. A new emitter appears here by adding one line to SOUND_CHANNELS (and the
// matching line in the backend's authority list).
//
// Levels save to the account, so they follow the user across devices — same as theme.
import { useEffect, useState } from 'react'
import { getChatPrefs, saveChatPrefs, type ChatPrefs } from '../../lib/chatApi'
import {
  SOUND_CHANNELS, SOUND_DEFAULT, SPEECH_RATE_DEFAULT, SPEECH_RATE_MAX, SPEECH_RATE_MIN,
  SPEECH_RATE_STREAM_SAFE, allLevels, getLevel, getSpeechRate, hydrateSoundPrefs, hydrateSpeechRate, isMuted,
  onSoundChange, previewChannel, setLevel, setSpeechRate, toggleMute, type SoundChannel,
} from '../../lib/soundPrefs'

const glyph = (level: number) => (level <= 0 ? '🔇' : level < 40 ? '🔈' : '🔊')

export default function SoundPanel({ onChange }: { onChange?: (p: ChatPrefs) => void } = {}) {
  const [levels, setLevels] = useState(allLevels)
  // ANSWER WITH SPEAK — Ote: *"in audio option, user can set, answer with speak"* and *"speech.autoSpeak
  // off by default"*. It belongs here rather than in Chat prefs because it is about SOUND, and because the
  // `speech` channel above already owns its volume; this only decides whether it starts by itself.
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [autoErr, setAutoErr] = useState('')
  // SPEED — Ote: *"i dont know if we can make speak a bit faster, like 1.15x. so it not sound too slow"*.
  // Applied at PLAYBACK, so dragging this re-paces audio that is already rendered and already playing. That is
  // the point: a pace is chosen by ear, and re-rendering to try a number would cost GPU time AND hand back a
  // different take of the voice (clips are write-once because no engine here has a seed).
  const [rate, setRate] = useState(getSpeechRate)

  // Trust the server copy when the panel opens (the local mirror may be from another device).
  useEffect(() => {
    getChatPrefs()
      .then(({ prefs }) => {
        hydrateSoundPrefs(prefs.sound)
        hydrateSpeechRate(prefs.speechRate)
        setAutoSpeak(Boolean(prefs.autoSpeak))
        setRate(getSpeechRate())
      })
      .catch(() => { /* offline — the mirror is still correct locally */ })
  }, [])
  useEffect(() => onSoundChange(() => { setLevels(allLevels()); setRate(getSpeechRate()) }), [])

  const anyMuted = SOUND_CHANNELS.some((c) => isMuted(c.key))
  const allDefault = SOUND_CHANNELS.every((c) => getLevel(c.key) === SOUND_DEFAULT)

  return (
    <div className="sound-panel flex flex-col gap-3" data-ui="sound-panel">
      <p className="adm-dim m-0 text-[13px]">
        A level for each place the app makes sound. Everything ships at <b>{SOUND_DEFAULT}%</b> so nothing
        arrives louder than you expect, and <b>0% is muted</b>. These follow your account across devices,
        and every sound also has this slider next to it where it plays.
      </p>

      <div className="flex flex-col gap-2">
        {SOUND_CHANNELS.map((c) => {
          const level = levels[c.key as SoundChannel] ?? SOUND_DEFAULT
          const muted = level <= 0
          return (
            <div
              key={c.key}
              className="flex flex-col gap-2 rounded-[10px] border border-line bg-panel-strong p-3"
              data-ui={`sound-row-${c.key}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-px flex-none text-[14px]" aria-hidden>{c.icon}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink">{c.label}</div>
                    <div className="mt-px text-[12px] leading-snug text-muted">{c.hint}</div>
                  </div>
                </div>
                <span
                  className={`flex-none font-mono text-[12px] font-bold tabular-nums ${muted ? 'text-muted' : 'text-ink'}`}
                  data-ui={`sound-value-${c.key}`}
                >{muted ? 'muted' : `${level}%`}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-none cursor-pointer rounded-md border-0 bg-transparent px-1 py-0.5 text-[15px] leading-none text-muted transition-colors hover:text-ink"
                  onClick={() => toggleMute(c.key)}
                  title={muted ? 'Unmute' : 'Mute'}
                  aria-label={muted ? `Unmute ${c.label}` : `Mute ${c.label}`}
                  data-ui={`sound-mute-${c.key}`}
                >{glyph(level)}</button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={level}
                  // --pct paints the fill, so a muted channel shows an EMPTY bar rather than
                  // the accent-coloured thumb blob that accent-color leaves at 0.
                  style={{ ['--pct' as string]: `${level}%` }}
                  className={`vol-range min-w-0 flex-1${muted ? ' is-muted' : ''}`}
                  onChange={(e) => setLevel(c.key, Number(e.target.value))}
                  onMouseUp={() => previewChannel(c.key)}
                  onKeyUp={() => previewChannel(c.key)}
                  aria-label={`${c.label} volume`}
                  data-ui={`sound-slider-${c.key}`}
                />
                <button
                  type="button"
                  className="gw-btn adm-btn-sm flex-none"
                  onClick={() => previewChannel(c.key)}
                  disabled={muted}
                  title={muted ? 'Muted — nothing to hear' : 'Play a short test at this level'}
                  data-ui={`sound-test-${c.key}`}
                >Test</button>
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="flex flex-col gap-2 rounded-[10px] border border-line bg-panel-strong p-3"
        data-ui="sound-rate-row"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-px flex-none text-[14px]" aria-hidden>⏩</span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink">Speaking speed</div>
              <div className="mt-px text-[12px] leading-snug text-muted">
                How fast a spoken reply plays back. <b>The pitch does not change</b> — the voice sounds like
                itself, just quicker. Applies while something is playing, so you can find your pace by ear.
              </div>
            </div>
          </div>
          <span
            className="flex-none font-mono text-[12px] font-bold tabular-nums text-ink"
            data-ui="sound-rate-value"
          >{rate.toFixed(2)}×</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={SPEECH_RATE_MIN}
            max={SPEECH_RATE_MAX}
            step={0.05}
            value={rate}
            style={{ ['--pct' as string]: `${(rate - SPEECH_RATE_MIN) / (SPEECH_RATE_MAX - SPEECH_RATE_MIN) * 100}%` }}
            className="vol-range min-w-0 flex-1"
            onChange={(e) => setSpeechRate(Number(e.target.value))}
            aria-label="Speaking speed"
            data-ui="sound-rate-slider"
          />
          {/* ⚠ THIS SLOT TAKES A VERB, NOT A VALUE. Ote, looking at the shipped row: *"what are these diff
              number? is this good ux."* It first read "1.00×" — the reset TARGET — while the live value sat in
              the header as "1.35×". Two numbers in one row, and the nearer one to the slider was the one that
              was not the current value, so the eye read it as the readout. Every sibling row here puts an
              action in this position ("Test"), and the value only in the header. One number per row. */}
          <button
            type="button"
            className="gw-btn adm-btn-sm flex-none"
            disabled={rate === SPEECH_RATE_DEFAULT}
            onClick={() => setSpeechRate(SPEECH_RATE_DEFAULT)}
            title={`Back to ${SPEECH_RATE_DEFAULT.toFixed(2)}× — the voice's own pace`}
            data-ui="sound-rate-reset"
          >Reset</button>
        </div>
        {/* Not a clamp — a threshold worth naming. Above this, the live path's playback can catch up with the
            renderer and pause between pieces, because each piece is rendered while the previous one plays. */}
        {rate > SPEECH_RATE_STREAM_SAFE && (
          <div className="text-[12px] leading-snug text-muted" data-ui="sound-rate-warn">
            Above {SPEECH_RATE_STREAM_SAFE.toFixed(2)}×, “Answer with speak” may pause between sentences on a
            long reply — playback catches up with what is still being generated. The 🔊 button is unaffected.
          </div>
        )}
      </div>

      <div
        className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-panel-strong p-3"
        data-ui="sound-autospeak-row"
      >
        {/* ⚠ `m-0 w-auto` is not cosmetic. index.css has a GLOBAL `input { width: 100% }`, and `gw-check` is
            a WRAPPER class (inline-flex) whose `.gw-check input` child gets width:auto — putting it on the
            input itself made the box 666px wide and squeezed the text to 0, one word per line. This is the
            same pattern every other checkbox in the app uses. */}
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="m-0 mt-0.5 w-auto flex-none"
            checked={autoSpeak}
            onChange={(e) => {
              const next = e.target.checked
              setAutoSpeak(next)
              setAutoErr('')
              // Optimistic so the toggle feels instant; on failure it snaps back rather than lying.
              // ⚠ HAND THE SAVED PREFS BACK UP. Without this the toggle persisted but the CHAT APP never
              // learned: it reads autoSpeak from its own prefs state, so flipping this did nothing until a
              // full page reload — which is exactly how "it not speak anything on my test" happened.
              saveChatPrefs({ autoSpeak: next })
                .then((r) => onChange?.(r.prefs))
                .catch((err) => {
                  setAutoSpeak(!next)
                  setAutoErr(err instanceof Error ? err.message : 'Could not save that')
                })
            }}
            data-ui="sound-autospeak"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">Answer with speak</span>
            <span className="mt-px block text-[12px] leading-snug text-muted">
              Read each reply aloud <b>as it is written</b>, instead of waiting for the 🔊 button. Uses the
              volume above. <b>Off by default</b> — and worth knowing: text is written about 13× faster than
              it can be spoken, so on a long reply the voice falls well behind what is on screen. It suits
              short, conversational answers.
            </span>
          </span>
        </label>
        {autoErr && <div className="text-danger text-[12px]">{autoErr}</div>}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="gw-btn adm-btn-sm"
          disabled={allDefault}
          onClick={() => SOUND_CHANNELS.forEach((c) => setLevel(c.key, SOUND_DEFAULT))}
          data-ui="sound-reset"
        >Reset to {SOUND_DEFAULT}%</button>
        <button
          type="button"
          className="gw-btn adm-btn-sm"
          onClick={() => SOUND_CHANNELS.forEach((c) => setLevel(c.key, anyMuted ? SOUND_DEFAULT : 0))}
          data-ui="sound-all"
        >{anyMuted ? 'Unmute everything' : 'Mute everything'}</button>
      </div>

      <p className="adm-dim m-0 text-[12px]">
        Speech is generated on this machine, so reading a message aloud never sends your text to a cloud
        service. A muted channel is not rendered at all — muting is not just silence, it skips the work.
      </p>
    </div>
  )
}
