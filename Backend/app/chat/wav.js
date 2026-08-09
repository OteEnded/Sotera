// WAV inspection + header repair — the VOICE's first hazard.
//
// WHY THIS EXISTS. fish-speech (and other STREAMING synthesizers) cannot know the length of the audio
// when they write the header, so they emit a PLACEHOLDER: the `data` chunk size is `0xFFFFFF00` and the
// RIFF size is similarly wrong. Measured on the real sample (2026-08-01 SiliconFlow probe): a 3.74-second
// clip whose header claims **134,217 seconds**. Anything that trusts the header — a duration label, a
// seek bar, a progress indicator — reports nonsense, and a strict decoder may refuse the file outright.
// A browser <audio> element is a strict decoder.
//
// So the platform NEVER hands synthesized audio onward as it arrived: it repairs the two size fields
// from the bytes actually present. This is not a fish-speech workaround, it is the honest shape of
// streamed WAV, and the same repair will be needed for any TTS provider that streams.
//
// Pure and dependency-free (Buffer only) so it is unit-testable without a provider or a network call.

const ASCII = (buf, at) => (buf.length >= at + 4 ? buf.toString('latin1', at, at + 4) : '')

/**
 * Walk the RIFF chunk list. Returns the offsets/sizes we care about, or null when this is not a WAV.
 * Chunks are WALKED rather than assumed at fixed offsets: real files carry LIST/INFO/fact chunks before
 * `data`, and hardcoding 36 is the classic way to read a valid file wrongly.
 */
function chunks(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null
  if (ASCII(buf, 0) !== 'RIFF' || ASCII(buf, 8) !== 'WAVE') return null
  const out = { riffSizeAt: 4, fmt: null, dataAt: null, dataSizeAt: null, dataSize: null }
  let at = 12
  while (at + 8 <= buf.length) {
    const id = ASCII(buf, at)
    const size = buf.readUInt32LE(at + 4)
    const body = at + 8
    if (id === 'fmt ' && body + 16 <= buf.length) {
      out.fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      }
    } else if (id === 'data') {
      out.dataAt = body
      out.dataSizeAt = at + 4
      out.dataSize = size
      break // the payload runs to EOF for a streamed file; nothing after it is trustworthy
    }
    // chunks are word-aligned; a zero/garbage size would loop forever without the guard
    const step = 8 + size + (size % 2)
    if (!Number.isFinite(step) || step <= 8 || at + step <= at) break
    at += step
  }
  return out.dataAt == null ? null : out
}

/**
 * What the file really contains, with the header's own claim alongside it so a caller can SEE the lie.
 * @returns {{bytes:number, claimedDataSize:number, actualDataSize:number, truncatedHeader:boolean,
 *   sampleRate:number|null, channels:number|null, bitsPerSample:number|null, durationSec:number|null}|null}
 */
export function wavInfo(buf) {
  const c = chunks(buf)
  if (!c) return null
  const actualDataSize = buf.length - c.dataAt
  const f = c.fmt
  const bytesPerSec = f ? f.sampleRate * f.channels * (f.bitsPerSample / 8) : 0
  return {
    bytes: buf.length,
    claimedDataSize: c.dataSize,
    actualDataSize,
    // The header claims more payload than the file holds — the streamed-placeholder signature.
    truncatedHeader: c.dataSize > actualDataSize,
    sampleRate: f?.sampleRate ?? null,
    channels: f?.channels ?? null,
    bitsPerSample: f?.bitsPerSample ?? null,
    durationSec: bytesPerSec > 0 ? actualDataSize / bytesPerSec : null,
  }
}

/**
 * Return a WAV whose RIFF and `data` sizes describe the bytes actually present.
 *
 * Repairs ONLY when the header over-claims (the streaming placeholder). A correct header is returned
 * untouched — and a file that is NOT a WAV is returned untouched too, because this is a repair, not a
 * validator: rejecting an mp3 here would break every non-WAV format the same seam will carry later.
 */
export function normalizeWav(buf) {
  const c = chunks(buf)
  if (!c) return buf
  const actualDataSize = buf.length - c.dataAt
  if (c.dataSize === actualDataSize && buf.readUInt32LE(c.riffSizeAt) === buf.length - 8) return buf
  const out = Buffer.from(buf) // never mutate the caller's buffer — it may be a cached response body
  out.writeUInt32LE(buf.length - 8, c.riffSizeAt)
  out.writeUInt32LE(actualDataSize, c.dataSizeAt)
  return out
}
