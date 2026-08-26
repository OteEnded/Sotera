import { devPg, devSchema } from './harness.mjs'
import { initDB } from '../Backend/database/index.js'
import { setDB, loadConfig } from '../Backend/lib/utility.js'
import { initSettings } from '../Backend/app/settings/index.js'
import { buildMemoryPipeline } from '../Backend/app/components/memory-pipeline-host.js'
import { OBSERVATION_TYPE } from '@ote/memory/cognition/memory-observation.js'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const log = { warn: (...a) => console.log('WARN', JSON.stringify(a).slice(0, 400)), error: (...a) => console.log('ERROR', JSON.stringify(a).slice(0, 700)), info: () => {}, debug: () => {} }
const fastify = { db, config, log }
const pg = devPg(); await pg.connect(); const S = devSchema()
const [me] = (await pg.query(`select id::text id from ${S}.mst_users where username='agent_dev'`)).rows

const { pipeline } = buildMemoryPipeline(fastify, { userId: me.id, author: 'persona' })
const stamp = `keepprobe3-${Date.now()}`
// ⭐ EXACTLY what rememberAsync enqueues, called SYNCHRONOUSLY so nothing can swallow the outcome.
try {
  const res = await pipeline.ingest({ content: `${stamp} · direct`, kind: 'semantic', type: OBSERVATION_TYPE.episodic, source: 'model-tool' })
  console.log('INGEST RESULT:', JSON.stringify(res)?.slice(0, 400))
} catch (e) {
  console.log('INGEST THREW:', e?.code ?? '', e?.message)
  console.log(String(e?.stack ?? '').split('\n').slice(0, 5).join('\n'))
}
const rows = (await pg.query(`select id::text id, author from ${S}.txn_memories where content like $1`, [`%${stamp}%`])).rows
console.log('ROWS:', JSON.stringify(rows))
await pg.query(`delete from ${S}.txn_memories where content like $1`, [`%${stamp}%`])
await pg.end()
process.exit(0)
