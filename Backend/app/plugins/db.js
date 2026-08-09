import fp from 'fastify-plugin'
import { initDB } from '../../database/index.js'
import { setDB } from '../../lib/utility.js'
import { rebuildProviderRegistry } from '../adapters/registry.js'
import { rebuildModelBlocklist } from '../adapters/blocklist.js'
import { initSettings } from '../settings/index.js'

export default fp(async function (fastify, opts) {
  const db = await initDB()
  setDB(db)
  fastify.decorate('db', db)
  // Merge DB-configured providers over the config.json defaults (in-memory snapshot;
  // decrypted keys never touch disk). Re-run by the admin routes after mutations.
  await rebuildProviderRegistry({ db, config: fastify.config })
  // Root's model blocklist snapshot (checked synchronously by the chat runtime).
  await rebuildModelBlocklist(db)
  // Runtime settings: DB rows override config.json defaults (app/settings/index.js).
  await initSettings(db)
})