// THAI REGISTER — does she keep her own gender across situations?
//
//   node pipeline/thai-register-probe.mjs
//   node pipeline/thai-register-probe.mjs --only casual
//
// Ote, 2026-08-20: *"Please don't assume that ครับ 13 / ค่ะ 0 / ผม 12 proves the intended identity. Those
// counts only show what she generated. We need to establish what the persona is actually supposed to use,
// then measure deviations from that."*
//
// He was right, and my first measurement was worse than imprecise: it counted substrings across whole
// MESSAGES without asking whose voice they were in, so drafted lines written FOR a male user counted as
// her own speech. Hand-reading the real occurrences then overturned the headline entirely:
//
//   · 4 of her 5 Thai conversations contain NO male forms at all
//   · the 5th starts correctly female (ฉัน / นะคะ, turns 2-6) and flips at turn 8
//   · the user in that conversation never uses ผม or ครับ — he uses ฉัน, 18 times
//   · what changes at turn 7 is the USER'S REGISTER: แก, ฮ่าๆ, "ขอถามแบบเป็นกันเองหน่อย"
//
// ⇒ The hypothesis this probe tests: **Thai ties politeness particles and first-person pronouns to
// REGISTER, the casual/banter register is male-coded, and when she matches a person's register she
// inherits its gender.** Register-matching is the correct social move; the gender riding along is not.
//
// ── DESIGN ────────────────────────────────────────────────────────────────────────────────────────
// ⭐ EACH SITUATION GETS A FRESH CONVERSATION. The failure being studied is drift WITHIN a conversation,
// so running the situations in sequence would contaminate every one after the first. The `drift` case is
// the deliberate exception: it reproduces the measured turn-7 flip inside one conversation, on purpose.
//
// ⛔ IT DOES NOT SCORE HER. It records which markers appear and prints the reply. What is "correct" for a
// persona is not a regex's call — and a marker count is exactly what misled me the first time.

import { makeClient, devPg, devSchema } from '../harness.mjs'
import { loadConfig } from '../../Backend/lib/utility.js'
import { openRunArtifact } from '../lib/run-artifacts.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null

// ⭐ FEMALE forms she should be using · MALE forms she should not · NEUTRAL forms that are fine either way.
// The neutral column matters: ฉัน is not an error, so a probe that only counted ค่ะ would read a perfectly
// good reply as a failure.
const MARK = {
  female: [['ค่ะ', 'kha(statement)'], ['คะ', 'kha(question)'], ['ดิฉัน', 'dichan'], ['หนู', 'nuu']],
  male: [['ครับ', 'khrap'], ['ผม', 'phom'], ['กระผม', 'kraphom']],
  neutral: [['ฉัน', 'chan'], ['เรา', 'rao'], ['นะ', 'na']],
}

const SITUATIONS = [
  { key: 'normal', room: 'agent_dev', turns: ['สวัสดี วันนี้เป็นอย่างไรบ้าง ขอคุยภาษาไทยหน่อยนะ'] },
  { key: 'formal', room: 'agent_dev', turns: ['รบกวนขอคำอธิบายอย่างเป็นทางการเกี่ยวกับวิธีที่คุณเก็บความจำ'] },
  // ⭐ THE SUSPECTED TRIGGER, in its own conversation: casual/banter from the very first turn.
  { key: 'casual', room: 'agent_dev', turns: ['เฮ้ย สอเทรา ฮ่าๆ ขอถามแบบเป็นกันเองเลยนะ แกว่าตัวเองเก่งเรื่องอะไรที่สุด'] },
  { key: 'self-reference', room: 'agent_dev', turns: ['เล่าเรื่องตัวเองให้ฟังหน่อย คุณคือใคร'] },
  { key: 'about-me', room: 'agent_dev', turns: ['คุณรู้อะไรเกี่ยวกับฉันบ้าง'] },
  { key: 'mixed-technical', room: 'agent_dev', turns: ['ช่วยอธิบายเรื่อง connection pool timeout กับ idle timeout ต่างกันยังไง ตอบไทยผสมอังกฤษได้'] },
  // ⭐ AFTER SWITCHING ROOM — same person, the other room. Tests whether the room changes her voice.
  { key: 'other-room', room: 'agent_dev_alt', turns: ['สวัสดี ขอคุยภาษาไทยหน่อย คุณเป็นใคร'] },
  { key: 'after-own-memory', room: 'agent_dev', turns: ['ลองเช็คความจำของตัวเองดู แล้วเล่าให้ฟังว่าคุณจดจำอะไรเกี่ยวกับตัวเองไว้'] },
  // ⭐ THE DRIFT REPRODUCTION: polite first, then the exact register shift measured at turn 7.
  {
    key: 'drift',
    room: 'agent_dev',
    turns: [
      'สวัสดี ขอคุยภาษาไทยหน่อยนะ ช่วยเล่าเรื่องความจำของคุณสั้นๆ',
      'เฮ้ย ฮ่าๆ ขอถามแบบเป็นกันเองหน่อย แกว่าความจำที่แกอวดว่าเก็บได้เนี่ย จริงๆ มันก็แค่ pattern matching ป่ะ',
    ],
  },
]

const PASSWORDS = { agent_dev: 'agentdev123', agent_dev_alt: 'agentdev123', kavi: 'kaviobs123' }
const config = loadConfig()
const pg = devPg(); await pg.connect()
const S = devSchema()
const call = makeClient()
const RESULTS = join(dirname(dirname(fileURLToPath(import.meta.url))), 'results')
const { path: OUT, write } = openRunArtifact({ stem: 'thai-register', dir: RESULTS, params: { n: SITUATIONS.length } })

const found = (text, list) => list.filter(([t]) => text.includes(t)).map(([, n]) => n)

console.log(`\n▶ THAI REGISTER PROBE · ${SITUATIONS.length} situations, one fresh conversation each\n${'═'.repeat(80)}`)

for (const sit of SITUATIONS) {
  if (only && sit.key !== only) continue
  const jar = `u_${sit.room}`
  const login = await call(jar, 'POST', '/v1/auth/login', { username: sit.room, password: PASSWORDS[sit.room] })
  if (login.status !== 200) { console.error(`  ${sit.key}: login failed for ${sit.room} (${login.status})`); continue }

  const convo = await call(jar, 'POST', '/v1/chat/conversations', {
    title: `THAI probe · ${sit.key}`,
    model: config.chat?.defaultModel,
    settings: { stream: false, toolsEnabled: true, useMemory: true, reasoning: { enabled: true } },
  })
  const cid = convo.json?.conversation?.id
  if (!cid) { console.error(`  ${sit.key}: no conversation`); continue }

  console.log(`\n── ${sit.key.toUpperCase()}  (room: ${sit.room})`)
  for (const [i, text] of sit.turns.entries()) {
    await call(jar, 'POST', `/v1/chat/conversations/${cid}/messages`, { content: text, stream: false })
    const rows = (await pg.query(
      `select role, content from ${S}.txn_messages where conversation_id = $1 order by created_at`, [cid])).rows
    const reply = rows.filter((r) => r.role === 'assistant').pop()?.content ?? ''
    const f = found(reply, MARK.female); const m = found(reply, MARK.male); const nu = found(reply, MARK.neutral)
    write({ situation: sit.key, room: sit.room, turn: i + 1, prompt: text, reply, female: f, male: m, neutral: nu })
    console.log(`   T${i + 1} ▸ ${text.slice(0, 66)}`)
    console.log(`      female: [${f.join(', ') || '—'}]   MALE: [${m.join(', ') || '—'}]   neutral: [${nu.join(', ') || '—'}]`)
    console.log(`      ${reply.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
  await call(jar, 'DELETE', `/v1/chat/conversations/${cid}`)
}

console.log(`\n${'═'.repeat(80)}\n  artifact: ${OUT}`)
console.log('  ⚠️  HAND-READ. The marker columns say what appeared, never whether she got it right —\n'
  + '      counting markers across a whole message is the mistake that produced the first wrong headline.\n')
await pg.end()
