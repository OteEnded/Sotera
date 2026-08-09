import { requireLogin } from '../../auth/index.js'
import { getSetting } from '../../settings/index.js'

// Per-user chat preferences. Drives how a NEW chat seeds its model + ⚙ options and lets
// a browser refresh restore the last-used config. DB users persist on their own row
// (users.chat_prefs); ROOT has no users row, so its prefs live as one JSONB row in the
// `settings` table (ROOT_PREFS_KEY — not a registered setting, so the System UI never
// lists it and the admin settings PATCH rejects the key). Always the caller's OWN data.

const MODEL_MODES = ['default', 'last']
const OPTION_MODES = ['last', 'default']
// Leaving a generating chat: follow the platform setting, or force on/off for this account.
const BG_MODES = ['default', 'on', 'off']
// Appearance (Discord-like, synced across devices via these prefs): explicit light/dark,
// or 'system' = follow the device's prefers-color-scheme live.
const THEME_MODES = ['light', 'dark', 'system']

// ── Sound channels (Voice v1) ────────────────────────────────────────────────────────────
// Every place the app can EMIT sound gets a channel here, and the user sets a level per
// channel. Ote: *"add volumn slider for each where it emit sound, default 75%. so it not too
// lound"* + *"add section to setting about sound/volumn in options"*.
//   askUser — the HumanInteraction attention jingle (the only emitter that exists today)
//   speech  — reading a message aloud (the Voice; lands with the 🔊 button)
// ⚠ THIS LIST IS THE AUTHORITY for what may be stored. The chat site has a matching registry
// carrying LABELS ONLY (Frontend/src/lib/soundPrefs.ts). Adding a channel is one line in each,
// and a mismatch fails LOUDLY here (unknown_sound_channel) instead of silently persisting a typo.
const SOUND_CHANNELS = ['askUser', 'speech']
// ANSWER WITH SPEAK (Ote 2026-08-04): read the reply aloud AS IT GENERATES, not on a button press.
// ⚠ OFF BY DEFAULT, his explicit call — *"speech.autoSpeak off by default"*. It has to be, on two grounds:
// unexpected audio is the rudest default a chat app can have, and every reply would otherwise occupy the
// GPU the chat models are sharing. A boolean rather than a channel, because the LEVEL is already the
// `speech` channel — this only decides whether it starts by itself.
const AUTO_SPEAK_DEFAULT = false
const SOUND_DEFAULT = 75   // "so it not too lound" — 75, not 100
const clampVol = (n) => Math.max(0, Math.min(100, Math.round(n)))

// ── HOW FAST THE VOICE TALKS (Ote 2026-08-05) ────────────────────────────────────────────────────────────
// *"i dont know if we can make speak a bit faster, like 1.15x. so it not sound too slow"*.
//
// ⚠ THIS IS A PLAYBACK PREFERENCE, NOT A RENDER SETTING, and the distinction is load-bearing:
//   • A clip is content-addressed and WRITE-ONCE (see voice/store.js) precisely because no engine here has a
//     seed — a re-render is a different take. Baking speed into the audio would change the cache key, so every
//     already-spoken message would come back in a NEW VOICE the next time it was played. Speeding up at
//     playback leaves all 36 existing clips valid and costs no GPU.
//   • It is adjustable BY EAR in real time. Ote's standing rule is that numbers rank and the ear decides, so
//     the useful thing to ship is an instrument he can drag while listening — not a constant I picked.
// Stored per user (like theme and the sound levels) rather than as a platform setting, because pace is a
// listening preference, not a property of the voice.
//
// Range 0.75-1.5. The ceiling is not arbitrary: the live "answer with speak" path renders piece N+1 while
// piece N plays, and each piece is ~1.4x the last (GROWTH in voice/stream-speech.js) at a measured RTF of
// 0.38-0.54. Playback overtakes rendering at about 1/(1.4 x 0.54) ≈ 1.3x, so past there a long reply may
// pause between pieces. 1.5 stays available — it is a real preference for some listeners — and the UI says so
// rather than silently clamping to a number nobody asked for.
const SPEECH_RATE_DEFAULT = 1
const SPEECH_RATE_MIN = 0.75
const SPEECH_RATE_MAX = 1.5
// Quantised to 0.05 so the stored value matches the slider's steps exactly; a drifting 1.1500000000000001
// would make the UI show a value it cannot represent.
const shapeRate = (n) => Math.round(Math.max(SPEECH_RATE_MIN, Math.min(SPEECH_RATE_MAX, n)) * 20) / 20
export { SPEECH_RATE_DEFAULT, SPEECH_RATE_MIN, SPEECH_RATE_MAX }
const defaultSound = () => Object.fromEntries(SOUND_CHANNELS.map((c) => [c, SOUND_DEFAULT]))

// Normalize a stored sound map: every known channel present, every value an int 0-100,
// unknown keys dropped. A channel added later reads as 75 on rows written before it existed.
export function shapeSound(v) {
  const out = defaultSound()
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const c of SOUND_CHANNELS) {
      if (typeof v[c] === 'number' && Number.isFinite(v[c])) out[c] = clampVol(v[c])
    }
  }
  return out
}

// Ships-as defaults (confirmed): new chat snaps the MODEL to the platform default but
// CARRIES OVER the last-used options. Theme defaults to 'system' (the CLIENT's no-data
// boot default is dark — it only matters until these prefs load).
const DEFAULT_PREFS = { newChatModel: 'default', newChatOptions: 'last', backgroundGeneration: 'default', defaultModel: null, lastModel: null, lastSettings: null, timezone: null, theme: 'system' }
export { SOUND_CHANNELS, SOUND_DEFAULT }

// A timezone must be a REAL IANA zone id — the Intl API is the authority (throws on junk).
export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz.trim() || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// "<provider>/<model>" — same shape the settings layer accepts for chat.defaultModel
const MODEL_ID = /^[a-z0-9][a-z0-9_-]*\/.+$/i

export const ROOT_PREFS_KEY = 'root.chatPrefs'

// Normalize whatever is stored (or null) into the full shape the client expects.
export function shapePrefs(row) {
  const p = (row && typeof row === 'object') ? row : {}
  return {
    newChatModel: MODEL_MODES.includes(p.newChatModel) ? p.newChatModel : DEFAULT_PREFS.newChatModel,
    newChatOptions: OPTION_MODES.includes(p.newChatOptions) ? p.newChatOptions : DEFAULT_PREFS.newChatOptions,
    backgroundGeneration: BG_MODES.includes(p.backgroundGeneration) ? p.backgroundGeneration : DEFAULT_PREFS.backgroundGeneration,
    // personal default model — applies only while allowed (role unlocked; root always)
    defaultModel: typeof p.defaultModel === 'string' ? p.defaultModel : null,
    lastModel: typeof p.lastModel === 'string' ? p.lastModel : null,
    lastSettings: (p.lastSettings && typeof p.lastSettings === 'object' && !Array.isArray(p.lastSettings)) ? p.lastSettings : null,
    // IANA zone of the human (auto-synced from the browser; the chat pipeline formats
    // times and the get_current_time tool answers in THIS zone, never the server's)
    timezone: typeof p.timezone === 'string' && p.timezone ? p.timezone : null,
    theme: THEME_MODES.includes(p.theme) ? p.theme : DEFAULT_PREFS.theme,
    // per-emitter output levels, 0-100 (see SOUND_CHANNELS)
    sound: shapeSound(p.sound),
    // read replies aloud as they generate; the `speech` channel still sets the volume
    autoSpeak: typeof p.autoSpeak === 'boolean' ? p.autoSpeak : AUTO_SPEAK_DEFAULT,
    // how fast to PLAY a clip back, 0.75-1.5 (pitch preserved — see the note above)
    speechRate: (typeof p.speechRate === 'number' && Number.isFinite(p.speechRate))
      ? shapeRate(p.speechRate) : SPEECH_RATE_DEFAULT,
  }
}

// Root's stored prefs (raw object or null) — shared with the chat-site's userChatContext.
export async function loadRootPrefs(db) {
  const row = await db.mst_settings.findOne({ where: { key: ROOT_PREFS_KEY } })
  return row?.value ?? null
}

// May this user set a PERSONAL default model? Root always can (it can always change
// things — and a personal default lets root experiment WITHOUT moving the platform
// default everyone inherits); members have a fixed model; others need their role
// unlocked via chat.personalDefaultModelRoles.
export function canSetPersonalDefault(config, user) {
  if (!user) return false
  if (user.isRoot) return true
  const unlocked = getSetting(config, 'chat.personalDefaultModelRoles') || []
  return (user.roles || []).some((r) => unlocked.includes(r))
}

// Validate + merge one PATCH body over the current prefs. Returns { error } | { next }.
function applyPrefsPatch(cur, b, { canSetDefault }) {
  const next = { ...cur }
  if (b.newChatModel !== undefined) {
    if (!MODEL_MODES.includes(b.newChatModel)) return { error: { code: 'invalid_pref', message: `newChatModel must be one of ${MODEL_MODES.join('/')}` } }
    next.newChatModel = b.newChatModel
  }
  if (b.newChatOptions !== undefined) {
    if (!OPTION_MODES.includes(b.newChatOptions)) return { error: { code: 'invalid_pref', message: `newChatOptions must be one of ${OPTION_MODES.join('/')}` } }
    next.newChatOptions = b.newChatOptions
  }
  if (b.backgroundGeneration !== undefined) {
    if (!BG_MODES.includes(b.backgroundGeneration)) return { error: { code: 'invalid_pref', message: `backgroundGeneration must be one of ${BG_MODES.join('/')}` } }
    next.backgroundGeneration = b.backgroundGeneration
  }
  if (b.defaultModel !== undefined) {
    // gated on the ROLE unlock (root always allowed); clearing is always allowed
    if (b.defaultModel !== null && !canSetDefault) {
      return { error: { code: 'default_model_locked', message: 'Your role cannot set a personal default model — it follows the platform default', status: 403 } }
    }
    if (b.defaultModel !== null && !MODEL_ID.test(b.defaultModel)) {
      return { error: { code: 'invalid_pref', message: 'defaultModel must be "<provider>/<model>"' } }
    }
    next.defaultModel = b.defaultModel
  }
  if (b.timezone !== undefined) {
    if (b.timezone !== null && !isValidTimezone(b.timezone)) {
      return { error: { code: 'invalid_pref', message: 'timezone must be a valid IANA zone id (e.g. "Europe/London")' } }
    }
    next.timezone = b.timezone
  }
  if (b.theme !== undefined) {
    if (!THEME_MODES.includes(b.theme)) return { error: { code: 'invalid_pref', message: `theme must be one of ${THEME_MODES.join('/')}` } }
    next.theme = b.theme
  }
  if (b.autoSpeak !== undefined) {
    if (typeof b.autoSpeak !== 'boolean') return { error: { code: 'invalid_pref', message: 'autoSpeak must be a boolean' } }
    next.autoSpeak = b.autoSpeak
  }
  if (b.speechRate !== undefined) {
    // REJECT out of range rather than clamping. A client asking for 3x has a bug, and silently storing 1.5
    // would make it look like the request worked; shapeRate() is for tidying what is already valid.
    if (typeof b.speechRate !== 'number' || !Number.isFinite(b.speechRate)
        || b.speechRate < SPEECH_RATE_MIN || b.speechRate > SPEECH_RATE_MAX) {
      return { error: { code: 'invalid_pref', message: `speechRate must be a number ${SPEECH_RATE_MIN}-${SPEECH_RATE_MAX}` } }
    }
    next.speechRate = shapeRate(b.speechRate)
  }
  if (b.sound !== undefined) {
    if (!b.sound || typeof b.sound !== 'object' || Array.isArray(b.sound)) {
      return { error: { code: 'invalid_pref', message: 'sound must be an object of channel -> 0-100' } }
    }
    const unknown = Object.keys(b.sound).filter((k) => !SOUND_CHANNELS.includes(k))
    if (unknown.length) {
      // Loud on purpose: a typo'd channel would otherwise persist and never play anything.
      return { error: { code: 'unknown_sound_channel', message: `unknown sound channel(s): ${unknown.join(', ')} — known: ${SOUND_CHANNELS.join(', ')}` } }
    }
    for (const [k, n] of Object.entries(b.sound)) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) {
        return { error: { code: 'invalid_pref', message: `sound.${k} must be a number 0-100` } }
      }
    }
    // PATCH semantics per CHANNEL — sending one channel must not reset the others.
    next.sound = shapeSound({ ...next.sound, ...b.sound })
  }
  if (b.lastModel !== undefined) next.lastModel = typeof b.lastModel === 'string' ? b.lastModel : null
  if (b.lastSettings !== undefined) {
    // Cap the stored snapshot so a client can't stuff arbitrary bulk into the row.
    const snap = (b.lastSettings && typeof b.lastSettings === 'object' && !Array.isArray(b.lastSettings)) ? b.lastSettings : null
    if (snap && JSON.stringify(snap).length > 8000) {
      return { error: { code: 'settings_too_large', message: 'lastSettings snapshot is too large' } }
    }
    next.lastSettings = snap
  }
  return { next }
}

export default async function mePrefsRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())

  fastify.get('/me/chat-prefs', async (request) => {
    if (request.user.isRoot) {
      return { prefs: shapePrefs(await loadRootPrefs(fastify.db)), persisted: true }
    }
    const user = await fastify.db.mst_users.findByPk(request.user.id, { attributes: ['id', 'chat_prefs'] })
    return { prefs: shapePrefs(user?.chat_prefs), persisted: true }
  })

  fastify.patch('/me/chat-prefs', {
    schema: {
      body: {
        type: 'object',
        properties: {
          newChatModel: { type: 'string' },
          newChatOptions: { type: 'string' },
          backgroundGeneration: { type: 'string' },
          defaultModel: { type: ['string', 'null'], maxLength: 200 },
          timezone: { type: ['string', 'null'], maxLength: 64 },
          theme: { type: 'string', maxLength: 10 },
          sound: { type: 'object' },   // channel -> 0-100; channels validated in applyPrefsPatch
          autoSpeak: { type: 'boolean' },
          // ⚠ THE KEY MUST BE DECLARED HERE OR IT IS SILENTLY DROPPED. With additionalProperties:false,
          // Fastify's ajv defaults REMOVE an undeclared property rather than rejecting it — so a PATCH would
          // answer 200 and change nothing, which looks exactly like a broken slider. Bounds are repeated from
          // the constants above so the API refuses out-of-range input before it reaches applyPrefsPatch.
          speechRate: { type: 'number', minimum: SPEECH_RATE_MIN, maximum: SPEECH_RATE_MAX },
          lastModel: { type: ['string', 'null'], maxLength: 200 },
          lastSettings: { type: ['object', 'null'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const canSetDefault = canSetPersonalDefault(fastify.config, request.user)
    const b = request.body || {}

    if (request.user.isRoot) {
      const cur = shapePrefs(await loadRootPrefs(fastify.db))
      const r = applyPrefsPatch(cur, b, { canSetDefault })
      if (r.error) return reply.code(r.error.status || 400).send({ error: { code: r.error.code, message: r.error.message } })
      const [row, created] = await fastify.db.mst_settings.findOrCreate({ where: { key: ROOT_PREFS_KEY }, defaults: { key: ROOT_PREFS_KEY, value: r.next } })
      if (!created) await row.update({ value: r.next })
      return reply.send({ prefs: shapePrefs(r.next), persisted: true })
    }

    const user = await fastify.db.mst_users.findByPk(request.user.id)
    if (!user) return reply.code(404).send({ error: { code: 'user_not_found', message: 'User not found' } })
    const r = applyPrefsPatch(shapePrefs(user.chat_prefs), b, { canSetDefault })
    if (r.error) return reply.code(r.error.status || 400).send({ error: { code: r.error.code, message: r.error.message } })
    await user.update({ chat_prefs: r.next })
    return reply.send({ prefs: shapePrefs(r.next), persisted: true })
  })
}
