// Run the CS2b message-embedding drain ON DEMAND — the same job the 04:10 cron tick runs.
//
//   node maintenance/run-cs2b-drain.mjs [--force]
//
// ⚠️ WHY THIS EXISTS. CS2b rides `retentionPass('daily')` at 04:10 and is deliberately excluded from the
// boot pass, so after a migration that creates the table there is no way to populate the dense arm
// before the next night. That is fine for production and useless for verification: you cannot check
// whether Conversation Search works in Thai until something has actually been embedded.
//
// This changes NO behaviour and adds no capability — it invokes the existing `drainPendingEmbeddings`
// with the existing gating, in a process that mirrors `plugins/db.js` exactly. The rows it writes are
// byte-identical to the ones tonight's tick would write, and tonight's tick will then find nothing left
// to do. It does NOT touch settings, the composer, or any prompt.
//
// ⚠️ Makes real embedder calls (one per eligible message). Announce before running on a shared box.

import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { rebuildProviderRegistry } from '../../Backend/app/adapters/registry.js'
import { initSettings, getSetting } from '../../Backend/app/settings/index.js'
import { drainPendingEmbeddings } from '../../Backend/app/components/conversation-search.js'

const force = process.argv.includes('--force')

const config = loadConfig()
const db = await initDB()
setDB(db)
await rebuildProviderRegistry({ db, config })
await initSettings(db)

const fastify = { db, config }

const gate = getSetting(config, 'memory.embedMessagesEnabled')
console.log(`memory.embedMessagesEnabled = ${gate}${force ? '  (--force bypasses the gate anyway)' : ''}`)

const before = (await db.txn_messages.sequelize.query(
  'select count(*)::int n from persona_sotera.txn_message_embeddings', { type: db.txn_messages.sequelize.QueryTypes.SELECT },
))[0].n
console.log(`embeddings BEFORE: ${before}`)

const t0 = Date.now()
const r = await drainPendingEmbeddings(fastify, { force })
const secs = ((Date.now() - t0) / 1000).toFixed(1)

const after = (await db.txn_messages.sequelize.query(
  'select count(*)::int n from persona_sotera.txn_message_embeddings', { type: db.txn_messages.sequelize.QueryTypes.SELECT },
))[0].n
console.log(`drain result: ${JSON.stringify(r)}  in ${secs}s`)
console.log(`embeddings AFTER:  ${after}   (+${after - before})`)
// ⭐ Prove the STATE, not the return value. A drain that reports embedded:N while the table is empty is
// exactly the class of failure this project keeps re-learning.
if (after === before && !r.skipped) console.log('⚠️ the drain reported work but the table did not grow — do not trust the return value')
process.exit(0)
