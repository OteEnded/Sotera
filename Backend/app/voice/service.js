// Voice HOST SERVICE — turns a message's text into audio by asking the local sidecar, cache-through.
//
// The engine does NOT live here. It lives in a separate Python process (VoiceModels/sidecar/serve.py)
// because every candidate engine is Python + CUDA with a conflicting dependency tree, and OteLLMServices
// must never grow one. This service speaks OUR contract to it — not an OpenAI-compatible /audio/speech.
// Ote: *"no need to be open ai compat. we try every thing"*, and the earlier POC's provider-shaped
// speak() was deleted rather than adapted, because a TTS engine is not a chat provider.
//
// Contract (see the sidecar's header): POST /speak {text, voice, language} -> audio/wav, with
// X-Voice-Engine / X-Voice-Voice / X-Voice-Render-Ms / X-Voice-Audio-Ms / X-Voice-RTF / X-Voice-Sample-Rate.
//
// Switching engines is an OPERATIONS change, not a code change: start a second sidecar from the other
// engine's venv on another port and move chat.speechSidecarUrl. Ote picked OmniVoice but said *"i still
// kinda want vox abit"*, so that had to stay a one-setting move.
import { getSetting } from '../settings/index.js'
import { createVoiceStore, speechKey } from './store.js'
import { wavInfo } from '../chat/wav.js'
import { toSpeakable, chunkForSpeech, languageOf } from './speakable.js'

export class VoiceError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** The Voice is OFF unless root points it at a sidecar. Empty URL = the 🔊 control never appears. */
export const voiceEnabled = (config) => Boolean(getSetting(config, 'chat.speechSidecarUrl'))

// Language detection moved to speakable.js — it is a property of the TEXT, it now also decides how numbers are
// expanded, and two copies of one threshold is how the two halves drift apart.

export function createVoiceService({ config, dir, fetchImpl = fetch }) {
  const store = createVoiceStore({ dir })

  return {
    store,
    enabled: () => voiceEnabled(config),

    /** Sidecar liveness + what it is loaded with. Surfaced so a failure names the sidecar, not "speech". */
    async health() {
      const base = getSetting(config, 'chat.speechSidecarUrl')
      if (!base) return { enabled: false }
      try {
        const res = await fetchImpl(`${base.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(4000) })
        if (!res.ok) return { enabled: true, ok: false, status: res.status }
        return { enabled: true, ok: true, sidecar: await res.json() }
      } catch (e) {
        return { enabled: true, ok: false, error: e?.message || String(e) }
      }
    },

    /** Everything the console needs in one object: config, sidecar liveness, and disk footprint. */
    async status() {
      const base = getSetting(config, 'chat.speechSidecarUrl')
      const out = {
        enabled: Boolean(base),
        sidecarUrl: base || null,
        voice: getSetting(config, 'chat.speechVoice') || null,
        sampleRate: getSetting(config, 'chat.speechSampleRate') || null,
        maxChars: getSetting(config, 'chat.speechMaxChars') || null,
        cache: await store.usage().catch(() => null),
        cacheLimits: this.cacheLimits(),   // so the console can state the budget beside the usage
        sidecar: null,
        reachable: false,
        error: null,
        voices: null,
      }
      if (!base) return out
      const url = base.replace(/\/$/, '')
      try {
        const res = await fetchImpl(`${url}/health`, { signal: AbortSignal.timeout(4000) })
        if (res.ok) { out.sidecar = await res.json(); out.reachable = true } else out.error = `HTTP ${res.status}`
      } catch (e) {
        out.error = e?.message || String(e)
      }
      // What the RUNNING engine accepts — the console can then show whether the configured voice is even
      // a thing this engine understands, which is the difference between "wrong voice" and "silent".
      if (out.reachable) {
        try {
          const v = await fetchImpl(`${url}/voices`, { signal: AbortSignal.timeout(4000) })
          if (v.ok) out.voices = await v.json()
        } catch { /* optional */ }
      }
      return out
    },

    /**
     * Load the engine NOW, before anyone asks it to say anything.
     *
     * Ote, 2026-08-04: *"if user use answer with speak, it should warm up omni right after user send a
     * prompt. so when result start going, it can catch up faster"*. Exactly right, and it is free: the model
     * load (3.6s warm path, ~7s from cold disk) used to land on the FIRST PIECE — the one piece the listener
     * is actually waiting for. Sent at prompt time it hides behind the chat model's own thinking instead.
     *
     * The sidecar unloads after 15 minutes idle, so this is the difference between "instant" and "seven
     * seconds of nothing" on every reply after a break, not just the first one of the day.
     */
    async warm() {
      const base = getSetting(config, 'chat.speechSidecarUrl')
      if (!base) throw new VoiceError('speech_disabled', 'No voice sidecar is configured.', 400)
      let res
      try {
        res = await fetchImpl(`${base.replace(/\/$/, '')}/warm`, {
          method: 'POST',
          // A cold load is 3.6s for OmniVoice and 14.6s for VoxCPM2; 120s is a ceiling, not an expectation.
          signal: AbortSignal.timeout(120_000),
        })
      } catch (e) {
        throw new VoiceError('sidecar_unreachable', `The voice sidecar at ${base} did not answer (${e?.message || e}).`, 503)
      }
      if (res.status === 503) {
        // The card is busy with a chat model. Warming is a courtesy, so this is information, not an error to
        // put in front of anyone: the first piece will load it later, or refuse the same way.
        throw new VoiceError('gpu_busy', 'The GPU is busy, so the voice did not pre-load.', 503)
      }
      if (!res.ok) throw new VoiceError('load_failed', `The sidecar answered HTTP ${res.status}.`, 502)
      return await res.json()
    },

    /** Ask the sidecar to release the GPU. Non-destructive: it reloads on the next press. */
    async unload() {
      const base = getSetting(config, 'chat.speechSidecarUrl')
      if (!base) throw new VoiceError('speech_disabled', 'No voice sidecar is configured.', 400)
      try {
        const res = await fetchImpl(`${base.replace(/\/$/, '')}/unload`, { method: 'POST', signal: AbortSignal.timeout(10_000) })
        if (!res.ok) throw new VoiceError('unload_failed', `The sidecar answered HTTP ${res.status}.`, 502)
        return await res.json()
      } catch (e) {
        if (e instanceof VoiceError) throw e
        throw new VoiceError('sidecar_unreachable', `The voice sidecar did not answer (${e?.message || e}).`, 503)
      }
    },

    /** Delete every cached clip. Safe by construction — a clip is a derived rendering, never a record. */
    async clearCache() {
      return store.clear()
    },

    /** The clip pile, newest-played first, plus totals grouped by voice and engine. */
    async clips({ limit = 200 } = {}) {
      const rows = await store.entries()
      const byVoice = {}
      const byEngine = {}
      let bytes = 0
      for (const r of rows) {
        bytes += r.bytes
        const v = r.voice || '(unknown)'
        const e = r.engine || '(unknown)'
        byVoice[v] = byVoice[v] || { files: 0, bytes: 0 }
        byVoice[v].files += 1; byVoice[v].bytes += r.bytes
        byEngine[e] = byEngine[e] || { files: 0, bytes: 0 }
        byEngine[e].files += 1; byEngine[e].bytes += r.bytes
      }
      return {
        files: rows.length,
        bytes,
        limits: this.cacheLimits(),
        byVoice,
        byEngine,
        oldestPlayed: rows.length ? rows[rows.length - 1].lastPlayed : null,
        clips: rows.slice(0, limit),
        truncated: Math.max(0, rows.length - limit),
      }
    },

    /** The two eviction levers, resolved from settings — never constants. See settings/index.js for the why. */
    cacheLimits() {
      const maxMB = getSetting(config, 'chat.speechCacheMaxMB')
      const ttlDays = getSetting(config, 'chat.speechCacheTtlDays')
      return {
        maxMB: Number.isFinite(maxMB) ? maxMB : 0,
        ttlDays: Number.isFinite(ttlDays) ? ttlDays : 0,
        maxBytes: (Number.isFinite(maxMB) ? maxMB : 0) * 1024 * 1024,
        ttlMs: (Number.isFinite(ttlDays) ? ttlDays : 0) * 24 * 60 * 60 * 1000,
      }
    },

    /**
     * Evict by TTL then by cap, least-recently-played first. Callable from the console, and run automatically
     * after a render — THROTTLED, because a sweep stats every clip and a reply renders a piece every few
     * seconds. Once a minute keeps the pile bounded without turning every chunk into a directory walk.
     */
    _sweptAt: 0,
    async sweepCache({ force = false } = {}) {
      const { maxBytes, ttlMs } = this.cacheLimits()
      if (!maxBytes && !ttlMs) return { skipped: 'no limits set', files: 0, bytes: 0 }
      if (!force && Date.now() - this._sweptAt < 60_000) return { skipped: 'throttled', files: 0, bytes: 0 }
      this._sweptAt = Date.now()
      return store.sweep({ maxBytes, ttlMs })
    },

    /**
     * The speakable body for a message: markdown resolved, then clipped. Shared by BOTH the whole-clip
     * and the chunked path — if these ever diverged, a chunk could be cached under a key that no longer
     * matches what the whole-clip path would have said.
     */
    prepare(text) {
      const { text: spoken, omitted } = toSpeakable(text)
      const clean = spoken.trim()
      if (!clean) {
        const onlyUnspeakable = omitted.codeBlocks || omitted.tables || omitted.images
        throw new VoiceError('nothing_to_say', onlyUnspeakable
          ? 'That reply is only code, tables or images — there is no prose to read aloud.'
          : 'That message has no text to speak.', 400)
      }
      const maxChars = getSetting(config, 'chat.speechMaxChars') || 4000
      const clipped = clean.length > maxChars
      let body = clipped ? clean.slice(0, maxChars) : clean
      if (clipped) {
        const cut = Math.max(body.lastIndexOf('. '), body.lastIndexOf('! '), body.lastIndexOf('? '),
                             body.lastIndexOf('\n'), body.lastIndexOf('ครับ'), body.lastIndexOf('ค่ะ'))
        if (cut > maxChars * 0.6) body = body.slice(0, cut + 1)
      }
      return { body, omitted, clipped }
    },

    /** How many chunks this message becomes, so the client knows how many to fetch. */
    plan(text) {
      const { body, omitted, clipped } = this.prepare(text)
      // Ote, 2026-08-04: *"bigger chuck size limit is fine. >5s is acceptable"* — so this is a lever, not
      // a constant. It trades FIRST SOUND against FLOW: every chunk boundary is an independent render, so
      // OmniVoice restarts its prosody there. Fewer, longer chunks = fewer resets, later first sound.
      const target = getSetting(config, 'chat.speechChunkChars') || 600
      return { chunks: chunkForSpeech(body, { target }), omitted, clipped, chars: body.length }
    },

    /**
     * Render ONE chunk. Same cache, same key rule — each chunk is an independent clip, so editing one
     * sentence re-renders one sentence and a re-press replays every chunk for free.
     */
    async speakChunk({ text, index }) {
      const { chunks, omitted, clipped } = this.plan(text)
      if (!chunks.length) throw new VoiceError('nothing_to_say', 'That message has no text to speak.', 400)
      const i = Number(index)
      if (!Number.isInteger(i) || i < 0 || i >= chunks.length) {
        throw new VoiceError('bad_chunk', `Chunk ${index} does not exist; this message has ${chunks.length}.`, 400)
      }
      const out = await this.render(chunks[i])
      return { ...out, chunk: i, chunks: chunks.length, omitted, clipped }
    },

    /**
     * ONE LIVE PIECE from answer-with-speak. Normalises, then renders — and returns `{ empty: true }`
     * rather than throwing when there is nothing left to say.
     *
     * ⚠ THIS METHOD EXISTS BECAUSE OF A REAL FAILURE, and the shape of the failure matters more than the
     * fix. /speak-text used to call render() directly, whose contract is "synthesize EXACTLY this string",
     * with a comment saying the streamer had already normalised the piece — while the browser streamer's
     * header said normalisation happens on the server. Each side named the other, so nothing did it, and
     * '## heading', '| cell |' and '**bold**' went to the TTS verbatim. Ote heard the result and reported
     * it exactly right: *"it sound random"*.
     *
     * The lesson is the placement, not the call: NORMALISATION IS A SERVER RESPONSIBILITY, because the
     * server is the only side that is always there. A scheduled turn has no browser to trust.
     *
     * `empty` is a normal outcome, not an error: a piece that is only a table has nothing to say, and the
     * caller should stay silent for it rather than show the user a failure.
     */
    async speakPiece(text, { signal } = {}) {
      const { text: spoken, omitted } = toSpeakable(text)
      const body = spoken.trim()
      if (!body) return { empty: true, omitted, spoken: '' }
      // `signal` is the CALLER GOING AWAY (the browser aborted, the socket closed) — distinct from the render
      // timeout inside render(). Both must be able to end the wait; see render() for how they are combined.
      const out = await this.render(body, { signal })
      // `render` may itself come back empty (sidecar 204 — the engine produced no samples). Carry that flag
      // through rather than overwriting it with `false`: the route decides 204-vs-audio on exactly this.
      return { ...out, omitted, spoken: body, empty: Boolean(out?.empty) }
    },

    /**
     * Render text to a WAV. Returns { bytes, hash, cached, seconds, engine, voice, renderMs }.
     * Cache-through: a hit never touches the GPU, which is the difference between a free replay and
     * evicting a chat model's KV cache to say the same sentence again.
     */
    async speak({ text } = {}) {
      const { body, omitted, clipped } = this.prepare(text)
      const out = await this.render(body)
      return { ...out, omitted, clipped }
    },

    /** Synthesize EXACTLY this string (already normalised and clipped). Cache-through. */
    async render(body, { voiceOverride, signal } = {}) {
      const base = getSetting(config, 'chat.speechSidecarUrl')
      if (!base) throw new VoiceError('speech_disabled', 'No voice sidecar is configured (chat.speechSidecarUrl).', 400)

      // Normalisation and clipping happened in prepare(). This function synthesizes EXACTLY the string
      // it is handed — which is what lets the whole-clip and per-chunk paths share one cache: a chunk is
      // just a shorter body, and the hash does not need to know which path asked for it.
      if (!String(body || '').trim()) {
        throw new VoiceError('nothing_to_say', 'That message has no text to speak.', 400)
      }

      const voice = String(voiceOverride || getSetting(config, 'chat.speechVoice') || '').trim()
      const sampleRate = getSetting(config, 'chat.speechSampleRate') || 24000
      // The ENGINE is part of the cache key, but only the sidecar knows which one it is. Ask once and
      // remember: otherwise a cache hit could serve OmniVoice bytes after a switch to VoxCPM2.
      const engine = await this.engineId(base)
      const hash = speechKey({ text: body, voice, engine, sampleRate })

      const hit = await store.get(hash)
      if (hit) {
        // ⚠ A CACHE HIT MUST RETURN THE SAME SHAPE AS A FRESH RENDER. The fresh path below returns
        // `{ ...saved, ...meta, hash }`, so every field of `meta` — including `chars`, the SPOKEN length —
        // is flattened onto it. This path used to name only three of them, so `out.chars` was defined on a
        // miss and undefined on a hit, and any caller reading it got a silent `undefined` half the time.
        // Spread `meta` here too, and keep `renderMs: 0` LAST so it wins over the original render's time.
        return {
          ...hit,
          ...hit.meta,
          // ⚠⚠ `bytes` MUST COME BACK FROM `hit`, NOT FROM `meta` — AND THIS BROKE PLAYBACK FOR A WHOLE
          // EVENING. The store writes a byte COUNT into the clip's metadata (`"bytes": 247218`), while `hit`
          // carries the actual Buffer. Spreading meta second therefore replaced the audio with an integer, and
          // the route's `reply.send(out.bytes)` answered
          //     FastifyError: Attempted to send payload of invalid type 'number'
          // as a 500 — but ONLY on a cache HIT, so a fresh sentence worked perfectly and every replay failed.
          // Ote hit it immediately ("i cannot use speak, why?") because almost every press is a cache hit.
          // THE LESSON, and it is about the test, not the spread: my shape test asserted that `engine`, `voice`,
          // `chars`, `seconds`, `language` and `sampleRate` agreed across the two exits — the fields I had been
          // thinking about — and never checked the one field that carries the payload. Spreading a metadata bag
          // over a record that shares key names needs the collision named explicitly, not trusted to ordering.
          bytes: hit.bytes,
          seconds: hit.meta?.seconds ?? null,
          engine: hit.meta?.engine ?? engine,
          voice: hit.meta?.voice ?? voice,
          renderMs: 0,
        }
      }

      const started = Date.now()
      let res
      try {
        res = await fetchImpl(`${base.replace(/\/$/, '')}/speak`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: body, voice: voice || undefined, language: languageOf(body), sample_rate: sampleRate }),
          // ADAPTIVE, because a fixed timeout is wrong at both ends: 180s aborted long renders that were
          // working fine, and a flat 15 minutes would leave a genuinely wedged sidecar hanging the request.
          // Measured on OmniVoice: 2940 chars -> 82s render, i.e. ~28ms/char. Budget 3x that plus a 30s
          // floor for model load, and cap at 15 minutes so nothing hangs forever.
          // A timeout that fires mid-render throws away GPU time already spent — the expensive mistake.
          //
          // ⚠ TWO REASONS TO STOP WAITING, AND THEY ARE NOT THE SAME REASON. The timeout means "this is taking
          // longer than the work should"; `signal` means "the person who asked has gone away". Only the timeout
          // existed, so a Stop left every queued render running on the GPU for audio nobody would hear (Ote saw
          // "1 rendering" on the Voice card after stopping). AbortSignal.any fires on whichever comes first, and
          // the catch below already tells a timeout apart from a hang-up by inspecting the error.
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(Math.min(900_000, 30_000 + body.length * 84))])
            : AbortSignal.timeout(Math.min(900_000, 30_000 + body.length * 84)),
        })
      } catch (e) {
        // Distinguish "not there" from "took too long": one is a service to start, the other is a
        // request to shorten, and telling someone to check whether a running process is running is
        // the kind of error message people learn to ignore.
        // ⚠ A HANG-UP IS NOT A TIMEOUT, and it must not be reported as one. Both arrive as an abort, and the
        // check below matched /abort/i — so a cancelled render logged "Synthesis ran past Ns … lower
        // chat.speechMaxChars", advice aimed at a user who had already walked away. Ask the caller's signal
        // whether IT fired: that is the only way to tell "nobody is waiting" from "this took too long".
        if (signal?.aborted) {
          throw new VoiceError('client_gone', 'The caller stopped listening, so this render was abandoned.', 499)
        }
        const timedOut = e?.name === 'TimeoutError' || /abort|timeout/i.test(String(e?.message || ''))
        throw new VoiceError(timedOut ? 'synthesis_timeout' : 'sidecar_unreachable',
          timedOut
            ? `Synthesis ran past ${Math.round(Math.min(900_000, 30_000 + body.length * 84) / 1000)}s for `
              + `${body.length} characters and was given up on. Lower chat.speechMaxChars, or wait for a quieter GPU.`
            : `The voice sidecar at ${base} did not answer (${e?.message || e}). Is it running?`,
          timedOut ? 504 : 503)
      }
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        let code = null
        try {
          const j = await res.json()
          detail = j?.detail || detail
          code = j?.error || null
        } catch { /* not json */ }
        // GPU CONTENTION IS NOT A FAILURE, IT IS A WAIT. The sidecar refuses rather than squeezing the
        // card, because taking the last gigabyte once made Ollama's llama-server crash mid-conversation.
        // Surfaced as a sentence the user can act on instead of a red error they cannot.
        if (res.status === 503 || code === 'gpu_busy') {
          throw new VoiceError('gpu_busy',
            'The GPU is busy with a chat model right now, so the voice stepped aside rather than risk it. '
            + 'Try again in a moment — already-spoken replies still play.', 503)
        }
        throw new VoiceError('synthesis_failed', `The voice sidecar refused: ${detail}`, 502)
      }

      // ⚠ 204 = THE ENGINE HAD NOTHING TO RENDER, WHICH IS SURVIVABLE. Measured 2026-08-05: OmniVoice returns
      // zero samples for very short input (2 of 8 renders of a 10-char Thai greeting, 3 of 8 of "Hello"), and
      // the sidecar retries then answers 204 rather than dying. Note 204 passes `res.ok`, so without this the
      // next line turns it into a 502 — a survivable gap presented as a broken request. `{ empty: true }`
      // reuses the path a table-only piece already takes: the route sends 204 and the browser skips the
      // piece, so the REST of the reply still speaks. The streamer's MIN_SPEAKABLE floor makes this rare;
      // this is what happens when it still gets through.
      if (res.status === 204) {
        return { empty: true, bytes: null, hash: null, cached: false, seconds: 0,
                 engine: res.headers.get('x-voice-engine') || null, voice, renderMs: 0 }
      }
      const bytes = Buffer.from(await res.arrayBuffer())
      if (!bytes.length) throw new VoiceError('synthesis_failed', 'The sidecar returned no audio.', 502)
      // Never trust a synthesizer's own header. A streaming engine writes a PLACEHOLDER length (a 3.7s
      // clip once claimed 134,217 seconds) and a browser <audio> is a strict decoder — see chat/wav.js.
      const info = wavInfo(bytes)
      const headerMs = Number(res.headers.get('x-voice-audio-ms')) || null
      const meta = {
        engine: res.headers.get('x-voice-engine') || engine,
        voice: res.headers.get('x-voice-voice') || voice,
        language: res.headers.get('x-voice-language') || languageOf(body),
        sampleRate: Number(res.headers.get('x-voice-sample-rate')) || sampleRate,
        // ⚠ `durationSec`, NOT `seconds` — wavInfo() has never had a `seconds` field, so this read was
        // always `undefined` and the expression ALWAYS fell through to the engine's own header. The guard
        // three lines up ("never trust a synthesizer's own header") therefore never fired once. Measuring
        // the bytes present is the whole point: a streaming engine's placeholder length is a lie, and a
        // typo'd property name is a silent one. Header stays as the fallback for a non-WAV payload.
        seconds: info?.durationSec ?? (headerMs ? headerMs / 1000 : null),
        rtf: Number(res.headers.get('x-voice-rtf')) || null,
        renderMs: Date.now() - started,
        chars: body.length,
        // A short preview so the cache listing says WHAT a clip is, not just how big (Ote: *"list of cache it
        // pile up"*). The WAV already contains these words out loud, so recording ~120 of them alongside it
        // exposes nothing the file did not. Clips written before this report `text: null` rather than guessing.
        text: body.slice(0, 120),
        createdAt: new Date().toISOString(),
      }
      const saved = await store.put(hash, bytes, meta)
      // Keep the pile inside its budget as it grows, rather than waiting for someone to notice 81.7 MB in the
      // console. Throttled and non-blocking: the clip we just rendered is already safe to return.
      this.sweepCache().catch(() => {})
      return { ...saved, ...meta, hash }
    },

    // The sidecar's ENGINE IDENTITY, cached for a minute — and it deliberately includes any sidecar
    // setting that changes the AUDIO, not just the engine name.
    //
    // ⚠ WHY: adding silence-trimming changed every clip's waveform while leaving the cache key identical,
    // so already-cached padded clips would have been served forever and the fix would have looked like it
    // did nothing. A cache key must describe the artifact, not merely the request. Folding trim into the
    // identity makes the cache SELF-INVALIDATING when audio-affecting config moves.
    _engine: { id: null, at: 0 },
    async engineId(base) {
      if (this._engine.id && Date.now() - this._engine.at < 60_000) return this._engine.id
      try {
        const res = await fetchImpl(`${base.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(4000) })
        const j = res.ok ? await res.json() : null
        const trim = j?.trim_silence_ms
        // ⚠ ANY AUDIO-SHAPING STATE OF THE SIDECAR BELONGS IN THIS ID, because it is part of the cache key and
        // a clip rendered under different shaping is a different clip. `trim` was already here; `matching_
        // signature` covers the per-voice level+pitch targets. Without it, calibrating a voice left every
        // previously-spoken message replaying its OLD UNMATCHED clip — which is indistinguishable from "the
        // fix does not work", and is exactly what Ote reported: *"i feel like it not filterd?"*
        const match = j?.matching_signature
        const id = [j?.engine || 'unknown',
                    trim == null ? null : `trim${trim}`,
                    match ? `m${match}` : null].filter(Boolean).join('/')
        this._engine = { id, at: Date.now() }
      } catch {
        // Unreachable: do NOT cache 'unknown' for a minute, or the first clip after a sidecar start
        // would be keyed wrongly and then served forever from that wrong key.
        return 'unknown'
      }
      return this._engine.id
    },
  }
}
