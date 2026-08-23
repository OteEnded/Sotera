// ⭐⭐⭐ THE COMBINED CONTROLLED EXPERIMENT · baseline → top-hit weights → + cue-centre × hybrid/lexical.
//
//   node pipeline/retrieval-arms.mjs
//   node pipeline/retrieval-arms.mjs --quick        (hybrid only — for iterating on the harness itself)
//
// ⭐ Ote: *"test the combined path end-to-end: baseline → top-hit → top-hit + cueCentre. And include the
// lexical-fallback case in the same experiment rather than treating it as a separate future concern."*
//
// ── ⛔⛔ THE WEIGHT SET IS FIXED HERE, BEFORE ANY RUN ───────────────────────────────────────────────
// `{0, 1, 2, 4}` — off, half the current value, the current value, double it. ⭐ Chosen a priori and
// reported in full, every arm, so no value can be picked because it looked best afterwards. Ote:
// *"Compare topHit weights, including the current +2, but don't tune toward a desired result."*
//
// ── ⭐⭐ WHAT MAKES THIS ATTRIBUTABLE ──────────────────────────────────────────────────────────────
//   · D1 is the SHIPPED baseline; it is not an arm and it is not toggled here
//   · every arm runs the REAL `recollect()` — ranking → centre selection → window rebuild → floor → evidence
//   · `topHit` and `cueCentre` stay INDEPENDENT options, so the 2×2 remains reproducible at every weight
//   · the ten cases include five person controls and a negative control, and both are reported per arm
//   · ⭐ the whole matrix runs in ONE process ⇒ deterministic, and no arm can be mislabelled
//
// ── ⭐ AND THE LEXICAL FALLBACK IS FORCED WITHOUT TOUCHING PRODUCTION ──────────────────────────────
// `makeEmbedder` reads the embedding model from `fastify.config`, and `conversation-search` catches an
// embedder failure and falls back to lexical by design (*"dense best-effort → lexical only"*). ⇒ handing the
// host a config whose embedding model does not resolve reproduces the REAL degradation mode with **zero**
// production changes and no test-only switch inside the shipping code.
//
// ⛔ MECHANISM ONLY. This reports what the floor was shown and what survived it — never what she would say.

import { writeFileSync, mkdirSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'

const argv = process.argv.slice(2)
const QUICK = argv.includes('--quick')
const OUT = new URL('../results/', import.meta.url)
const config = loadConfig()

const WEIGHTS = [0, 1, 2, 4]          // ⛔ fixed before the runs
const CUE = [false, true]
const MODES = QUICK ? ['hybrid'] : ['hybrid', 'lexical']

const CASES = [
  { key: 'basil-bare', ask: 'basil', on: /basil|rosemary|mint/i },
  { key: 'basil-sentence', ask: 'Has anyone ever talked to you about growing basil?', on: /basil|rosemary|mint/i },
  { key: 'notebook', ask: 'Do you remember anything about a herb notebook?', on: /notebook/i },
  { key: 'herb-promise', ask: 'What did you promise about the herbs?', on: /basil|rosemary|mint|herb/i },
  { key: 'hermes-open', ask: "How's Hermes doing? What have you and he actually talked about?", on: /hermes/i, control: true },
  { key: 'hermes-variant', ask: 'Have you talked with Hermes lately?', on: /hermes/i, control: true },
  { key: 'kavi-open', ask: "How's Kavi? What have you and Kavi actually talked about?", on: /kavi/i, control: true },
  { key: 'mina-open', ask: 'What do you know about Mina?', on: /mina/i, control: true },
  { key: 'kavi-thai', ask: 'Kavi เป็นอย่างไรบ้าง เคยคุยกับเขาเรื่องอะไรบ้าง', on: /kavi/i, control: true },
  { key: 'ferdinand', ask: "How's Ferdinand doing? What have you and Ferdinand talked about?", on: /ferdinand/i, negative: true },
]

const pg = devPg(); await pg.connect()
const S = devSchema()
const db = await initDB(); setDB(db); await initSettings(db)
const { rows: [me] } = await pg.query(`select id::text id, username from ${S}.mst_users where username='agent_dev'`)
const { rows: [corpus] } = await pg.query(
  `select (select count(*)::int from ${S}.txn_conversations where title like 'RATE %') harness,
          (select count(*)::int from ${S}.txn_conversations) total`)

// ⚠️ ONE `fastify` PER MODE. The lexical one carries a config whose embedding model cannot resolve, which is
// how the real fallback happens. ⛔ Nothing in Backend knows this file exists.
const hosts = {
  hybrid: { db, config, log: null },
  lexical: {
    db,
    config: { ...config, memory: { ...(config.memory ?? {}), embeddingModel: 'ollama/__no_such_embed_model__' } },
    log: null,
  },
}

console.log(`\n${'═'.repeat(116)}`)
console.log('  COMBINED RETRIEVAL EXPERIMENT — D1 shipped as baseline · topHit weights × cueCentre × mode')
console.log(`${'═'.repeat(116)}`)
console.log(`  corpus: ${corpus.harness} harness conversation(s) of ${corpus.total}`
  + `${corpus.harness ? ' ⚠️ CONTAMINATED' : ' ✓ clean'}`)
console.log(`  weights ${JSON.stringify(WEIGHTS)} (fixed before the runs) · cueCentre ${JSON.stringify(CUE)}`
  + ` · modes ${JSON.stringify(MODES)} ⇒ ${MODES.length * WEIGHTS.length * CUE.length} arms × ${CASES.length} cases`)

const runArm = async (mode, weight, cue) => {
  const out = { mode, weight, cue, cases: {} }
  for (const c of CASES) {
    const cog = buildMemoryCognition(hosts[mode], {
      userId: me.id, isRoot: false, username: me.username, conversationId: null, interactive: false,
      // ⓘ weight 0 means the term is OFF, expressed as the flag rather than as a zero bonus, so the
      // baseline arm takes exactly the production code path.
      episodeTopHit: weight > 0, episodeTopHitWeight: weight, episodeCentreCueMatch: cue,
    })
    let r = { kept: 0, onSubject: 0, filtered: 0, withThem: 0, error: null }
    try {
      const o = await cog.recollect({ text: c.ask })
      const items = o.items ?? []
      r.kept = items.length
      r.onSubject = items.filter((i) => c.on.test(JSON.stringify(i))).length
      r.filtered = o.filtered ?? 0
      r.withThem = items.filter((i) => i.withThem === true).length
    } catch (e) { r.error = e?.message ?? String(e) }
    // ⭐ OFF-SUBJECT is reported as its own number, because Ote asked for the COST and not just the target:
    // *"If cue-centre admits off-subject material, quantify that cost."*
    r.offSubject = r.kept - r.onSubject
    out.cases[c.key] = r
  }
  return out
}

const arms = []
for (const mode of MODES) {
  for (const weight of WEIGHTS) {
    for (const cue of CUE) {
      process.stdout.write(`  … ${mode} w=${weight} cue=${cue ? 'on ' : 'off'}\r`)
      arms.push(await runArm(mode, weight, cue))
    }
  }
}
process.stdout.write('                                        \r')

// ══ REPORT ════════════════════════════════════════════════════════════════════════════════════════
const targets = CASES.filter((c) => !c.control && !c.negative).map((c) => c.key)
const controls = CASES.filter((c) => c.control).map((c) => c.key)
const negative = CASES.filter((c) => c.negative).map((c) => c.key)
const sum = (a, keys, f) => keys.reduce((s, k) => s + f(a.cases[k]), 0)

for (const mode of MODES) {
  const inMode = arms.filter((a) => a.mode === mode)
  const base = inMode.find((a) => a.weight === 0 && !a.cue)
  console.log(`\n${'─'.repeat(116)}`)
  console.log(`  MODE: ${mode}${mode === 'lexical' ? '   ⚠️ the real degradation path — dense arm unavailable' : ''}`)
  console.log(`  ${'arm'.padEnd(20)}${'target on-subj'.padEnd(16)}${'target OFF-subj'.padEnd(17)}`
    + `${'controls on-subj'.padEnd(18)}${'negative on-subj'.padEnd(18)}gained/lost vs base`)
  for (const a of inMode) {
    const t = sum(a, targets, (x) => x.onSubject)
    const off = sum(a, targets, (x) => x.offSubject)
    const ct = sum(a, controls, (x) => x.onSubject)
    const ng = sum(a, negative, (x) => x.onSubject)
    const bT = sum(base, targets, (x) => x.onSubject)
    const bC = sum(base, controls, (x) => x.onSubject)
    // ⭐ GAINED AND LOST SEPARATELY, per case, so a +1/−1 cannot present itself as "unchanged".
    let g = 0; let l = 0
    for (const k of [...targets, ...controls]) {
      const d = a.cases[k].onSubject - base.cases[k].onSubject
      if (d > 0) g += d; else if (d < 0) l -= d
    }
    const label = `w=${a.weight}${a.weight === 2 ? '*' : ' '} cue=${a.cue ? 'ON ' : 'off'}`
    const ctlFlag = ct === bC ? '' : ` ⛔ CONTROLS MOVED ${ct - bC}`
    const ngFlag = ng ? ` ⛔ NEGATIVE ${ng}` : ''
    console.log(`  ${label.padEnd(20)}${String(t).padEnd(16)}${String(off).padEnd(17)}`
      + `${`${ct}${ctlFlag}`.padEnd(18)}${`${ng}${ngFlag}`.padEnd(18)}+${g} / -${l}`)
  }
  console.log(`  ⓘ * = the current default weight. base = w=0 cue=off (production today) — targets `
    + `${sum(base, targets, (x) => x.onSubject)}, controls ${sum(base, controls, (x) => x.onSubject)}.`)
}

// ── ⭐ THE TWO QUESTIONS OTE ASKED FOR EXPLICITLY, ANSWERED AS THEIR OWN LINES ─────────────────────
console.log(`\n${'═'.repeat(116)}`)
if (MODES.includes('lexical')) {
  console.log('  ⚠️ LEXICAL-ONLY REGRESSION CAUSED BY THE BONUS, per weight:')
  const lex = arms.filter((a) => a.mode === 'lexical')
  const lbase = lex.find((a) => a.weight === 0 && !a.cue)
  for (const w of WEIGHTS) {
    const a = lex.find((x) => x.weight === w && !x.cue)
    let g = 0; let l = 0
    for (const k of [...targets, ...controls]) {
      const d = a.cases[k].onSubject - lbase.cases[k].onSubject
      if (d > 0) g += d; else if (d < 0) l -= d
    }
    console.log(`     w=${w}: gained ${g}, LOST ${l}${l ? '  ⛔ a real regression on the fallback path' : ''}`)
  }
}
console.log('\n  ⭐ CUE-CENTRE\'S OFF-SUBJECT COST, per mode and weight (off-subject items admitted on TARGET cases):')
for (const mode of MODES) {
  for (const w of WEIGHTS) {
    const a = arms.find((x) => x.mode === mode && x.weight === w && !x.cue)
    const b = arms.find((x) => x.mode === mode && x.weight === w && x.cue)
    const dOn = sum(b, targets, (x) => x.onSubject) - sum(a, targets, (x) => x.onSubject)
    const dOff = sum(b, targets, (x) => x.offSubject) - sum(a, targets, (x) => x.offSubject)
    console.log(`     ${mode.padEnd(8)} w=${w}: on-subject ${dOn >= 0 ? '+' : ''}${dOn}, off-subject `
      + `${dOff >= 0 ? '+' : ''}${dOff}${dOff > 0 && dOn <= 0 ? '  ⛔ cost with no benefit' : ''}`)
  }
}
console.log('\n  ⛔ MECHANISM ONLY — what the floor was shown and what survived it, never what she would say.')

mkdirSync(OUT, { recursive: true })
writeFileSync(new URL('retrieval-arms.json', OUT), JSON.stringify({
  at: new Date().toISOString(), corpus, weights: WEIGHTS, modes: MODES,
  note: 'D1 is the shipped baseline and is not an arm. The weight set was fixed before the runs. Mechanism '
    + 'only: ranking → centre selection → window rebuild → floor → final evidence, no model.',
  targets, controls, negative, arms,
}, null, 2))
console.log('  → test/results/retrieval-arms.json')
await pg.end()
