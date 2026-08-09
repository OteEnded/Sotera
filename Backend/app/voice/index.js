// THE VOICE — host side of the Body Part that speaks (MM Arc · Audio phase, Voice v1).
//
// Assembled per the canon layering law: Feature → Host Service → Store → disk.
//   • Engine        a separate Python process (VoiceModels/sidecar/serve.py) — never in-process, because
//                   every candidate engine is Python + CUDA with a conflicting dependency tree
//   • Host Service  ./service.js — the sidecar client on OUR contract, cache-through, text→WAV
//   • Store         ./store.js   — content-addressed clips on disk, write-once/authoritative
// This index is WIRING plus the public entry the chat routes call.
//
// WHAT A SPOKEN REPLY IS (RFC_AUDIO_MODALITY, and it constrains everything here): a DERIVED RENDERING of
// the canonical text answer. It is never the message, never replayed into context, and never a fifth
// output role. The text stays the record; audio is a way of delivering it. That is why this module can
// cache aggressively and delete freely without touching conversation history.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVoiceService, VoiceError, voiceEnabled } from './service.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// Backend/var/voice — outside app/ (it is data, not code) and gitignored. Overridable for tests.
export const defaultVoiceDir = () => path.resolve(HERE, '..', '..', 'var', 'voice')

export { VoiceError, voiceEnabled }
export { speechKey } from './store.js'

let singleton = null

/** Build (once) the service the routes use. `dir` is injectable so a check can use a temp folder. */
export function voiceService({ config, dir } = {}) {
  if (singleton && !dir) return singleton
  const svc = createVoiceService({ config, dir: dir || defaultVoiceDir() })
  if (!dir) singleton = svc
  return svc
}

/** Test seam: forget the cached instance so a new config/dir takes effect. */
export function resetVoiceService() {
  singleton = null
}
