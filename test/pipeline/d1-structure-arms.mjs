// ⭐⭐⭐ D1 · IS THE GEN-3 STRUCTURE THE RESPONDER'S, OR THE INSTRUMENT'S?
//
//   node pipeline/d1-structure-arms.mjs --arms A,C,D          (the 9b arms — cheap, CPU)
//   node pipeline/d1-structure-arms.mjs --arms B --limit 1    (⚠️ 35B on CPU — TIME THIS FIRST)
//   node pipeline/d1-structure-arms.mjs --report              (read the log, run nothing)
//
// ── ⛔⛔ WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────────
// It does NOT touch the live noticing instrument, its config, or one row of the gen-3 population. It
// writes to its OWN log. Gen-3 keeps accumulating underneath, untouched, priors parked.
//
// ── ⭐⭐ WHY IT EXISTS, AND THE FACT THAT REFRAMED IT ───────────────────────────────────────────────
// The gen-3 population shows heading-like lines in 53 of 86 rows and numbered lists in 54. The obvious
// reading is "her structure". ⛔ It cannot be: the noticing call sends `messages: [{role:'user'}]` with
// **no system prompt, no persona, no identity, no memory**, to `qwen3.5:9b` — an AUX model, ⛔ not her
// 35B chat model — at `temperature: 0`. Ote, on being shown that: *"let's not call the Gen-3 structural
// patterns «Sotera behavior» at all. They're aux-model behavior until proven otherwise."*
//
// ⇒ ⭐ THE FOUR ARMS, EACH CHANGING EXACTLY ONE THING, fixed before the first call:
//     A  replica    the current instrument, replayed        → baseline; must reproduce ~53/86
//     B  model      `qwen3.6:35b`, else identical           → model house style
//     C  sampling   `qwen3.5:9b` at temperature 0.7         → determinism as a structure driver
//     D  frameless  transcript + question, ⛔ no frame line → the frame line
//
// ── ⛔ THE DECISION RULE, ALSO FIXED BEFORE RUNNING ─────────────────────────────────────────────────
// If **B or C** collapses the heading rate, the structure is model or sampling and ⛔ NOT behaviour.
// If it survives all four, it is induced by the transcript or is intrinsic to the responder — and only
// THEN is a persona-routed experiment warranted. ⛔ Gen-4 is not designed and must not be built here.
//
// ⛔ MECHANICAL MEASUREMENTS ONLY. No semantic classification, no reading of what she said, no outcome
// field. The population this is about was retired for exactly that kind of help.

import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildNoticingPrompt, THE_QUESTION } from '../../Backend/app/components/noticing-host.js'
import { shapeTranscript } from '@ote/memory/cognition/memory-distill.js'
import { chat } from '../../Backend/app/chat-runtime/index.js'

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const REPORT_ONLY = argv.includes('--report')
const ARMS = String(arg('--arms', 'A,C,D')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
const LIMIT = Number(arg('--limit', 12))
const LOG = new URL('../results/d1-structure-arms.jsonl', import.meta.url)

// ⭐ ONE ARM DEFINITION PER ROW, so "what was different" is never reconstructed from memory afterwards.
// ⛔ `numGpu: 0` on every arm including the 35B: Ote — *"No GPU requirement; CPU is fine. Don't spend GPU
// just to make this faster."* A GPU-placed aux model also evicts the chat model, ~29s on the next real turn.
const ARM_DEFS = {
  A: { model: 'ollama/qwen3.5:9b', temperature: 0, frame: true, note: 'replica of the live instrument' },
  B: { model: 'ollama/qwen3.6:35b', temperature: 0, frame: true, note: 'her chat model, else identical' },
  C: { model: 'ollama/qwen3.5:9b', temperature: 0.7, frame: true, note: 'sampling, else identical' },
  D: { model: 'ollama/qwen3.5:9b', temperature: 0, frame: false, note: 'no frame line' },
}

/** ⛔ MECHANICAL ONLY. Every one of these is a typographic fact; none of them reads what she said. */
export function structureOf(text) {
  const t = String(text ?? '')
  return {
    chars: t.length,
    headingLike: /^#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$/m.test(t),
    numbered: /^\s*\d[.)]\s+/m.test(t),
    bullets: /^\s*[-*•]\s+/m.test(t),
    bold: t.includes('**'),
    paragraphs: t.split('\n\n').filter((p) => p.trim()).length,
    opening4: t.trim().split(/\s+/).slice(0, 4).join(' '),
  }
}

function report() {
  if (!existsSync(LOG)) { console.log('  no log yet'); return }
  const rows = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const byArm = new Map()
  for (const r of rows) { if (!byArm.has(r.arm)) byArm.set(r.arm, []); byArm.get(r.arm).push(r) }
  const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : '–')
  console.log(`\n  ${'arm'.padEnd(4)} ${'n'.padStart(3)}  ${'heading'.padStart(12)} ${'numbered'.padStart(12)} ${'bullets'.padStart(11)} ${'bold'.padStart(11)}  ${'med chars'.padStart(9)}  ${'distinct open'.padStart(13)}`)
  for (const a of ['A', 'B', 'C', 'D']) {
    const rs = (byArm.get(a) ?? []).filter((r) => !r.error)
    if (!rs.length) { console.log(`  ${a.padEnd(4)} ${String(0).padStart(3)}  (not run)`); continue }
    const n = rs.length
    const med = [...rs.map((r) => r.structure.chars)].sort((x, y) => x - y)[n >> 1]
    const opens = new Set(rs.map((r) => r.structure.opening4)).size
    console.log(`  ${a.padEnd(4)} ${String(n).padStart(3)}  `
      + `${pct(rs.filter((r) => r.structure.headingLike).length, n).padStart(12)} `
      + `${pct(rs.filter((r) => r.structure.numbered).length, n).padStart(12)} `
      + `${pct(rs.filter((r) => r.structure.bullets).length, n).padStart(11)} `
      + `${pct(rs.filter((r) => r.structure.bold).length, n).padStart(11)}  `
      + `${String(med).padStart(9)}  ${`${opens}/${n}`.padStart(13)}`)
  }
  console.log('\n  ⓘ gen-3 live population, for reference: heading 53/86 (62%) · numbered 54/86 (63%) · bullets 30/86 (35%) · bold 75/86 (87%)')
  const errs = rows.filter((r) => r.error)
  if (errs.length) console.log(`  ⚠️ ${errs.length} errored call(s): ${[...new Set(errs.map((e) => e.error))].join(' · ')}`)
}

if (REPORT_ONLY) { report(); process.exit(0) }

const pg = devPg(); await pg.connect()
const S = devSchema()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config: loadConfig(), log: null }

// ⭐ THE SAME CONVERSATIONS FOR EVERY ARM, chosen from the gen-3 population itself and pinned by id, so no
// arm can be handed easier material. Ordered by id for determinism — ⛔ not by recency, which would bias
// toward whatever was happening today.
const seen = new Map()
for (const line of readFileSync(new URL('../results/noticing-proposals.jsonl', import.meta.url), 'utf8').split('\n')) {
  if (!line.trim()) continue
  let r; try { r = JSON.parse(line) } catch { continue }
  if (String(r.promptGeneration) !== '3') continue
  if (!seen.has(r.conversationId)) seen.set(r.conversationId, r)
}
const picked = [...seen.values()].sort((a, b) => String(a.conversationId).localeCompare(String(b.conversationId))).slice(0, LIMIT)
console.log(`\n  D1 · ${picked.length} conversation(s) × arms [${ARMS.join(',')}] = ${picked.length * ARMS.length} call(s)`)
console.log(`  rooms: ${JSON.stringify(picked.reduce((m, r) => ({ ...m, [r.who]: (m[r.who] ?? 0) + 1 }), {}))}`)

for (const arm of ARMS) {
  const def = ARM_DEFS[arm]
  if (!def) { console.log(`  ✖ unknown arm ${arm}`); continue }
  console.log(`\n  ── ARM ${arm} · ${def.note} · ${def.model} · temp ${def.temperature} · frame ${def.frame}`)
  for (const [i, row] of picked.entries()) {
    const msgs = await db.txn_messages.findAll({
      where: { conversation_id: row.conversationId }, order: [['rolling_id', 'ASC']], raw: true,
    })
    const transcript = shapeTranscript(msgs)
    // ⛔ Arm D drops ONLY the frame line. The question is byte-identical in every arm.
    const prompt = def.frame ? buildNoticingPrompt({ who: row.who, transcript }) : `${transcript}\n\n${THE_QUESTION}`
    const [provider, model] = [def.model.slice(0, def.model.indexOf('/')), def.model.slice(def.model.indexOf('/') + 1)]
    const t0 = Date.now()
    let out = null; let error = null
    try {
      // ⚠️ THE CALL SHAPE IS `{ serverConfig, request }` — copied from the live instrument rather than
      // guessed. My first version passed the fields at the top level; it would have failed every arm
      // identically, which is the failure mode that looks most like a finding.
      const res = await chat({
        serverConfig: fastify.config,
        request: {
          provider,
          model,
          messages: [{ role: 'user', content: prompt }],
          options: { stream: false, reasoning: { enabled: false }, max_tokens: 1600, temperature: def.temperature, numGpu: 0, keepAlive: '5m' },
          userId: row.userId ?? null,
        },
      })
      out = res?.message?.content || ''
    } catch (e) { error = e.message }
    const ms = Date.now() - t0
    const rec = {
      at: new Date().toISOString(), arm, ...def,
      conversationId: row.conversationId, who: row.who, messages: msgs.length,
      promptChars: prompt.length, ms,
      structure: error ? null : structureOf(out),
      // ⭐ The text is kept so a HUMAN can read it later if it ever matters. ⛔ Nothing here reads it.
      text: error ? null : String(out), error,
    }
    appendFileSync(LOG, `${JSON.stringify(rec)}\n`)
    console.log(`     ${String(i + 1).padStart(2)}/${picked.length} ${row.conversationId.slice(0, 8)} ${String(ms).padStart(6)}ms `
      + `${error ? `✖ ${error.slice(0, 60)}` : `${rec.structure.chars}ch head=${rec.structure.headingLike ? 'y' : 'n'} num=${rec.structure.numbered ? 'y' : 'n'}`}`)
  }
}

report()
await pg.end()
process.exit(0)
