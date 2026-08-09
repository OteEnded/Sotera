import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import fastifySecureSession from '@fastify/secure-session'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadConfig, logInit, requestLogInit, queryLogInit, log } from './lib/utility.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const config = loadConfig()

// Initialize logging
const logPath = logInit()
if (logPath) {
  console.log(`Message log file created at: ${logPath}`)
}

const requestLogPath = requestLogInit()
if (requestLogPath) {
  console.log(`Request log file created at: ${requestLogPath}`)
}

import dbPlugin from './app/plugins/db.js'
import requestLoggerPlugin from './app/plugins/request-logger.js'
import cronPlugin from './app/plugins/cron.js'
import websocketPlugin from './app/plugins/websocket.js'
import routes from './app/routes/index.js'
import { reconcileRootUserRecord, logRootReconciliation } from './app/auth/root-identity-bootstrap.js'

// bodyLimit raised for chat image attachments (data URLs; the composer resizes client-side)
const fastify = Fastify({ logger: config.logging?.fastify || false, bodyLimit: 16 * 1024 * 1024 })
fastify.decorate('config', config)

const env = process.env.NODE_ENV || 'development'
const port = process.env.PORT || config.app.port

await log(`Initializing server in ${env} environment`, import.meta.url)

await fastify.register(fastifyCors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
})
await log(`CORS plugin registered`, import.meta.url)

await fastify.register(requestLoggerPlugin)
await log(`Request logger plugin registered`, import.meta.url)

// Backward compatible: if `database.enabled` is not set, DB is considered enabled.
const shouldUseDatabase = config.database?.enabled !== false
if (shouldUseDatabase) {
  const queryLogPath = queryLogInit()
  if (queryLogPath) {
    console.log(`Query log file created at: ${queryLogPath}`)
  }

  await fastify.register(dbPlugin)
  await log(`Database plugin registered`, import.meta.url)
} else {
  await log(`Database plugin skipped (database.enabled=false)`, import.meta.url)
}

await fastify.register(cronPlugin)
await log(`Cron plugin registered`, import.meta.url)

await fastify.register(websocketPlugin)
await log(`Websocket plugin registered`, import.meta.url)

const sessionConfig = config.auth?.session || {}
// No silent fallback: a missing or template-default session secret is a hard boot error.
// Run `node ../DevTools/maintenance/rotate-secrets.mjs` (from the workspace) to generate real secrets
// without losing re-copyable API keys.
const KNOWN_DEFAULT_SECRETS = [
  'ote_llmservices_dev_session_secret_change_me_in_prod',
  'change-me-to-a-32+-char-random-secret-string',
]
if (!sessionConfig.secret || KNOWN_DEFAULT_SECRETS.includes(sessionConfig.secret)) {
  throw new Error('auth.session.secret is missing or still the template default — set a real random secret in Backend/config.json (DevTools/maintenance/rotate-secrets.mjs generates one and re-encrypts stored API keys).')
}
if (!sessionConfig.salt || sessionConfig.salt === 'change-me-16char' || sessionConfig.salt === 'ote_llm_v2_salt!') {
  throw new Error('auth.session.salt is missing or still the template default — set a random 16-char salt in Backend/config.json (DevTools/maintenance/rotate-secrets.mjs generates one).')
}
// Root is a full superuser; a weak root password is as dangerous as a weak session
// secret. We WARN (not hard-fail) so an existing deployment still boots — but loudly,
// because "admin/admin"-class credentials are exactly how the platform gets breached.
{
  const rp = config.auth?.root?.password || ''
  const TRIVIAL_ROOT = ['root', 'admin', 'password', 'toor', '123456', 'changeme', 'ote', 'w']
  if (rp.length < 8 || TRIVIAL_ROOT.includes(rp.toLowerCase())) {
    // eslint-disable-next-line no-console
    console.warn('\n⚠️  SECURITY: auth.root.password in Backend/config.json is weak (short or a common value).\n' +
      '    Root is a full superuser reachable from the network — set a strong, unique password and restart.\n')
  }
}
await fastify.register(fastifySecureSession, {
  sessionName: 'session',
  cookieName: sessionConfig.cookieName || 'ote_llm_session',
  secret: sessionConfig.secret,
  salt: sessionConfig.salt,
  cookie: {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Enable when the deployment is behind HTTPS (config auth.session.secureCookie:true)
    // so the cookie is never sent over plaintext. Off by default for HTTP/LAN dev.
    secure: sessionConfig.secureCookie === true,
    maxAge: sessionConfig.maxAgeSeconds || 604800,
  },
})
await log(`Secure session plugin registered`, import.meta.url)

await fastify.register(fastifyStatic, {
  root: join(__dirname, 'public', 'dist'),
  prefix: '/'
})
await log(`Static file serving registered from public/dist`, import.meta.url)

// A malformed :id in the URL (e.g. a non-UUID hitting a UUID/typed column) makes Postgres
// throw 22P02, which otherwise bubbles to a leaky, misleading 500. Map just that to a clean
// 400 — everything else keeps Fastify's default handling (schema-validation 400s, the
// routes' own explicit error responses, and genuine 500s, which we still log).
fastify.setErrorHandler((error, request, reply) => {
  if ((error?.parent?.code || error?.original?.code) === '22P02') {
    return reply.code(400).send({ error: { code: 'invalid_id', message: 'Invalid identifier in the request path.' } })
  }
  if ((error.statusCode || 500) >= 500) request.log?.error?.(error)
  reply.send(error)
})

await fastify.register(routes)
await log(`Routes registered (api + spa fallback)`, import.meta.url)

// Root's user record — find-or-create by username, then report how config lines up with it.
// Never throws and never blocks boot: a reconciliation step must not be able to stop the platform.
// Phase 1 of the root refactor, so the row is only ensured to exist; nothing reads it yet.
{
  const res = await reconcileRootUserRecord(fastify)
  logRootReconciliation(fastify, res)
}

// MATHS SPEECH — warm the rule engine now rather than on the first formula.
//
// It costs 48ms once and is synchronous afterwards, so this is not about latency: `speakMath` returns null
// until the engine is ready, and null means "fall back to the signpost". Warming lazily would therefore make
// the FIRST formula after a restart get pointed at instead of read — a bug that only ever appears once,
// never reproduces, and looks exactly like the feature not being wired up.
// Fire-and-forget: a speech nicety must never delay or fail the listen().
void import('./app/voice/math-speech.js')
  .then((m) => m.mathSpeechReady())
  .then(({ ready, failed }) => log(ready
    ? 'Maths speech ready (ClearSpeak) — formulas are read aloud'
    : `Maths speech unavailable, formulas keep the signpost: ${failed}`, import.meta.url))
  .catch(() => {})

await fastify.listen({
  port,
  host: '0.0.0.0'
})

await log(`Server started successfully on port ${port}`, import.meta.url)
console.log(`Running in ${env} on port ${port}`)