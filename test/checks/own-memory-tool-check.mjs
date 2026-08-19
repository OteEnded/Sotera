// OWN MEMORY TOOL — a memory tool, not a database tool.
//
//   node checks/own-memory-tool-check.mjs
//
// ⭐ THE BOUNDARY IS THE ABSENCE OF PARAMETERS, and most of these assertions are checking that the
// absence really is absent — that nothing crept in that would let the tool be pointed at a third party,
// iterate people, or reach a conversation.
//
// Read-only. Writes nothing; the real Kavi record must survive untouched.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildOwnMemory } from '../../Backend/app/components/own-memory-host.js'
import { readFileSync } from 'node:fs'

const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })
const { check, done } = makeChecker()
const ok = (c, l, d = '') => check(l, c, d)

const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))
const fastify = { db, config, log: null }

// ── T1 · the tool takes NO arguments ─────────────────────────────────────────────────────────────
const toolSrc = readFileSync(new URL('../../../../PortableComponents/Tools/OwnMemory/index.js', import.meta.url), 'utf8')
ok(/properties:\s*\{\s*\}/.test(toolSrc), 'T1 · ⭐ the tool declares NO parameters', 'no subject, no query, no id — the boundary is the absence')
ok(/required:\s*\[\s*\]/.test(toolSrc) && /additionalProperties:\s*false/.test(toolSrc),
  'T1 · …and additionalProperties is false, so nothing can be smuggled in')
for (const forbidden of ['personId', 'person_id', 'subject', 'userId', 'query', 'name', 'limit']) {
  ok(!new RegExp(`properties:[^}]*${forbidden}`, 's').test(toolSrc), `T1 · no \`${forbidden}\` parameter exists`)
}

// ── T2 · what it returns for a person WITH a stored stance ───────────────────────────────────────
const svcKavi = buildOwnMemory(fastify, { userId: users.kavi })
const kavi = await svcKavi.recall()
ok(kavi.withThisPerson.count >= 1, 'T2 · ⭐ Kavi\'s own-memory recall finds her stored stance',
  `${kavi.withThisPerson.count} item(s) — ${kavi.withThisPerson.items.map((i) => i.statement).join('; ')}`)
ok(kavi.withThisPerson.items.every((i) => typeof i.statement === 'string' && i.statement.length > 0),
  'T2 · each item carries the fixed statement, not a raw label')
ok(kavi.provenance?.whatTheseAre && kavi.provenance?.whatTheseAreNot,
  'T2 · ⭐ provenance ships WITH the answer — the failure this exists to fix was her not knowing the source')
ok(/NOT things this person told you/i.test(kavi.provenance.whatTheseAreNot),
  'T2 · …and it says explicitly that these are not things the person told her')

// ── T3 · ⭐ NOTHING that could become a database handle or a leak ─────────────────────────────────
const flat = JSON.stringify(kavi)
for (const forbidden of ['subject_person_id', 'subjectPersonId', 'message_id', 'memory_id', 'conversation_id', 'embedding', 'content', 'deriver_version', 'label']) {
  ok(!flat.includes(forbidden), `T3 · ⭐ the payload contains no \`${forbidden}\``)
}
ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(flat),
  'T3 · ⭐ no UUID of any kind is returned — an id is a handle, and a handle is the start of a database tool')

// ── T4 · it is bound to the CURRENT person, and cannot be redirected ─────────────────────────────
const svcMina = buildOwnMemory(fastify, { userId: users.mina })
const mina = await svcMina.recall()
ok(mina.withThisPerson.person === 'Mina', 'T4 · built for Mina, it describes Mina', `${mina.withThisPerson.person}`)
ok(mina.withThisPerson.count === 0, 'T4 · ⭐ Mina\'s recall does NOT show Kavi\'s stance', `${mina.withThisPerson.count} items`)
ok(!JSON.stringify(mina).includes('Kavi'), 'T4 · ⭐ …and never names Kavi at all')
ok(svcMina.recall.length === 0, 'T4 · ⭐ `recall()` accepts no argument — the subject cannot be overridden at the call site')
ok(Object.keys(svcMina).length === 1 && typeof svcMina.recall === 'function',
  'T4 · the service exposes exactly one method — no search, no list, no lookup', Object.keys(svcMina).join(', '))

// ── T5 · empty is reported as HER emptiness, not as a claim about anyone ─────────────────────────
ok(mina.aboutMyself.count === 0 && Array.isArray(mina.aboutMyself.items),
  'T5 · the persona-global slice is reported and is empty', 'true of HERSELF, not a negative claim about others')
ok(/have not stored anything of this kind yet/i.test(mina.provenance.ifEmpty),
  'T5 · ⭐ empty is framed as "I have not stored this", never as "that does not exist"')

// ── T6 · the host service never reads message or memory CONTENT of the other person ──────────────
const hostSrc = readFileSync(new URL('../../Backend/app/components/own-memory-host.js', import.meta.url), 'utf8')
const sql = hostSrc.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
ok(!/txn_messages/.test(sql), 'T6 · ⭐ it never touches txn_messages — no path to a conversation')
ok(!/txn_message_embeddings|embedding/.test(sql), 'T6 · ⭐ it never touches embeddings')
// It DOES read txn_memories, but only the persona-global identity slice, which is hers by definition.
ok(/user_id IS NULL AND kind = 'identity'/.test(sql),
  'T6 · its only txn_memories read is the PERSONA-GLOBAL identity slice — hers regardless of who is asking')
ok(!/user_id\s*=\s*:userId[\s\S]{0,80}txn_memories/.test(sql),
  'T6 · it never reads another account\'s scoped memories')

done()
