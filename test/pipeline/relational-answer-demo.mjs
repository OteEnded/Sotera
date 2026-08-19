// account memory → relational derivation → Sotera's answer, end to end, WITHOUT wiring anything.
//
//   node pipeline/relational-answer-demo.mjs
//
// ⛔ READ-ONLY and OFF the production path. It composes the system prompt locally (the same way the
// falsifier runner does), injects the derived relational line as one extra part, and asks the model.
// No conversation row is created, nothing is written, and the live Composer is untouched.
//
// ⭐ The point is to show WHERE the boundary sits: the model is never handed Hermes's rows, because the
// derivation that produced its context never selected them. The refusal is not the model being careful.

import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { composeSystemContext, composeRuntimeTail } from '../../Backend/app/components/context-composer.js'
import { describeRelationship, renderRelationship } from '../../Backend/app/components/relational-knowledge.js'

const MODEL = 'qwen3.6:35b'
const config = loadConfig()
const db = await initDB()
setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (s, r) => seq.query(s, { replacements: r, type: seq.QueryTypes.SELECT })

const persons = Object.fromEntries((await Q('SELECT id::text, display_name FROM persona_sotera.mst_persons')).map((p) => [p.display_name, p.id]))
const users = Object.fromEntries((await Q('SELECT id::text, username FROM persona_sotera.mst_users')).map((u) => [u.username, u.id]))

const QUESTIONS = [
  'Do you know Hermes?',
  'How have you and Hermes been?',
  'What have you two talked about?',
  'What exactly did Hermes tell you?',
]

async function ask(messages) {
  const r = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream: false, think: false }),
    signal: AbortSignal.timeout(180000),
  })
  if (!r.ok) throw new Error(`ollama ${r.status}`)
  return (await r.json()).message?.content ?? ''
}

async function run(label, username, displayName) {
  const rel = await describeRelationship({ db, askingUserId: users[username], personId: persons.Hermes })
  const line = renderRelationship(rel)
  console.log(`\n${'='.repeat(94)}\n${label}  (account: ${username})`)
  console.log(`DERIVED  : ${JSON.stringify(rel)}`)
  console.log(`INJECTED : ${line ? line.slice(0, 150) + '…' : '(nothing)'}`)
  console.log('='.repeat(94))
  for (const q of QUESTIONS) {
    const composed = composeSystemContext({
      systemPrompt: null, assistantIdentity: null,
      user: { username, displayName }, timezone: 'Asia/Bangkok',
      toolsOn: false, useMemory: true, selfModel: true,
    })
    // The prototype's one injected part — appended, nothing else changed.
    const system = line ? `${composed.system}\n\n${line}` : composed.system
    const tail = composeRuntimeTail({ toolsOn: false, useMemory: true, nowString: '2026-08-19, 15:00', zone: 'Asia/Bangkok' })
    let reply = ''
    try { reply = await ask([{ role: 'system', content: system }, { role: 'user', content: q }, ...tail]) } catch (e) { reply = `ERROR ${e.message}` }
    console.log(`\n  Q: ${q}\n  A: ${String(reply).replace(/\s+/g, ' ').trim().slice(0, 420)}`)
  }
}

await run('① OTE — with relational derivation', 'ote', 'Ote')
await run('② MINA — normal account, same derivation policy', 'mina', 'Mina')
// Control: no relational line at all — today's production behaviour.
{
  console.log(`\n${'='.repeat(94)}\n③ CONTROL — no relational layer (production today)\n${'='.repeat(94)}`)
  const composed = composeSystemContext({
    systemPrompt: null, assistantIdentity: null, user: { username: 'ote', displayName: 'Ote' },
    timezone: 'Asia/Bangkok', toolsOn: false, useMemory: true, selfModel: true,
  })
  const tail = composeRuntimeTail({ toolsOn: false, useMemory: true, nowString: '2026-08-19, 15:00', zone: 'Asia/Bangkok' })
  for (const q of [QUESTIONS[0], QUESTIONS[1]]) {
    const reply = await ask([{ role: 'system', content: composed.system }, { role: 'user', content: q }, ...tail]).catch((e) => `ERROR ${e.message}`)
    console.log(`\n  Q: ${q}\n  A: ${String(reply).replace(/\s+/g, ' ').trim().slice(0, 320)}`)
  }
}
process.exit(0)
