// ⭐⭐⭐ C3 · WHAT IS ACTUALLY STILL BROKEN? — PHRASING INVARIANCE of recall, on the clean corpus.
//
//   node pipeline/recall-failure-survey.mjs           (offline, no model, no turns)
//
// ⭐ Ote: *"Find several genuine remaining false-absence / recall failures on the clean corpus, rather than
// manufacturing a case to justify a parked mechanism… Measure whether D1+D2 generalizes beyond basil."*
//
// ── ⛔⛔ TWO INSTRUMENT FAULTS FOUND AND DISCARDED BEFORE ANY NUMBER WAS REPORTED ────────────────────
// ① **A naive term miner.** Mining rare words from her messages produced a **77% "recall failure" rate** —
//    from candidates like *"Do you remember anything about **consistently**?"*, *"…about **amount**?"*,
//    *"…about **remaining**?"*. ⇒ ⭐ that 77% measured the MINER, not her recall. A rare word is not a
//    subject, and a question nobody would ask cannot fail. ⛔ Discarded, not reported as a finding.
// ② **A single fixed question template.** Letting her own sentences define subjecthood (what follows
//    *"about / discussed / mentioned"*, plus stored memory slots) fixed ①, and then the anchor gave the game
//    away: **`basil` came back RECALL-FAIL** — the case measured two hours earlier as *recovered*. ⚠️ Same
//    subject, same corpus, same code; only the **wording** differed.
//
// ⇒ ⭐⭐⭐ SO THE PHRASING IS NOT A CONFOUND TO CONTROL — IT IS THE FINDING. This file measures it directly,
// because the project already has a STATED GUARANTEE that it should not matter: *"offline, all four
// phrasings come out identical"* (`memory-cognition-check` §1, the variance test that opened this whole
// layer). If wording now moves recall, that guarantee is broken — and that is a real remaining defect rather
// than one more thing to optimise.
//
// ── ⭐ THE DESIGN ──────────────────────────────────────────────────────────────────────────────────
//   SUBJECTS come from the corpus: two people with rich history, one with thin history, and the two topics
//   this arc already characterised. ⛔ None invented; all have material she can reach.
//   TEMPLATES are the ordinary ways a person asks. ⛔ Fixed here before the run.
//   The measure is ON-SUBJECT ITEMS REACHING HER — a count, per the standing rule that binary screens do not
//   resolve at the n available.
//
// ⛔ MECHANISM ONLY. It says what reaches the floor and survives it, never what she would say.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import { applyUtteranceBoundary } from '../../Backend/app/components/memory-utterance-boundary.js'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const LABEL = opt('label', 'shipped')
const config = loadConfig()
const OUT = new URL('../results/phrasing/', import.meta.url)

// ⭐ SUBJECTS — every one has material in her own history, established earlier in this arc.
const SUBJECTS = [
  { key: 'Hermes', on: /hermes/i, kind: 'person · rich history', anchor: 'known-good' },
  { key: 'Kavi', on: /kavi/i, kind: 'person · all cross-room' },
  { key: 'Mina', on: /mina/i, kind: 'person · thin history' },
  { key: 'basil', on: /basil|rosemary|mint/i, kind: 'topic · recovered by D1+D2', anchor: 'known-fixed' },
  { key: 'the herb notebook', on: /notebook/i, kind: 'topic · still failing', anchor: 'known-fail' },
]

// ⭐ TEMPLATES — ordinary phrasings, fixed before the run. ⓘ T1 is the bare subject, which is the form the
// earlier mechanism measurements used, so this matrix contains them as a row rather than beside them.
const TEMPLATES = [
  { key: 'bare', of: (x) => x },
  { key: 'remember-anything', of: (x) => `Do you remember anything about ${x}?` },
  { key: 'have-we-talked', of: (x) => `Have we ever talked about ${x}?` },
  { key: 'what-do-you-know', of: (x) => `What do you know about ${x}?` },
  { key: 'tell-me', of: (x) => `Tell me about ${x}.` },
]

const pg = devPg(); await pg.connect()
const S = devSchema()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const { rows: [me] } = await pg.query(
  `select id::text id, username, memory_access_scope s from ${S}.mst_users where username = $1`, ['agent_dev'])
if (me.s !== 'sotera_memory') {
  console.error(`✖ agent_dev entitlement is "${me.s}"; without the grant every cell fails criterion 3 for a`)
  console.error('  reason that has nothing to do with phrasing. Run block-vs-tools-2x2.mjs --grant first.')
  await pg.end(); process.exit(1)
}
// ⭐ THE ARM, read from the host's source — D1 has no flag, only the absence of an assignment.
const HOST = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
const ARM = {
  d1CentreFollowsClock: /prev\.lastAt = at; prev\.centre = mid/.test(HOST),
  d2TopHit: /episodeTopHit = true/.test(HOST),
  d2Weight: Number(/episodeTopHitWeight = (\d+)/.exec(HOST)?.[1] ?? NaN),
  d4CueCentre: /episodeCentreCueMatch = true/.test(HOST),
}
const { rows: [corpus] } = await pg.query(
  `select (select count(*)::int from ${S}.txn_conversations where title like 'RATE %') harness,
          (select count(*)::int from ${S}.txn_conversations) total`)

console.log(`\n${'═'.repeat(112)}`)
console.log(`  C3 · PHRASING INVARIANCE OF RECALL — offline · arm "${LABEL}"`)
console.log(`${'═'.repeat(112)}`)
console.log(`  corpus: ${corpus.harness} harness of ${corpus.total} conversations`
  + `${corpus.harness ? ' ⚠️ CONTAMINATED' : ' ✓ clean'}`)
console.log(`  arm: D1 ${ARM.d1CentreFollowsClock ? '⛔ PRE-FIX' : '✓ fixed'} · D2 topHit `
  + `${ARM.d2TopHit ? `ON w=${ARM.d2Weight}` : 'off'} · D4 ${ARM.d4CueCentre ? 'ON' : 'off'}`)
console.log('\n  cells show ON-SUBJECT items reaching her (a count). ⓘ "·" = activated but nothing on subject.')
console.log(`\n  ${'subject'.padEnd(20)}${TEMPLATES.map((t) => t.key.padEnd(19)).join('')}`)

const out = { label: LABEL, at: new Date().toISOString(), arm: ARM, corpus, cells: [] }
for (const s of SUBJECTS) {
  const row = []
  for (const t of TEMPLATES) {
    const ask = t.of(s.key)
    const cog = buildMemoryCognition(fastify, {
      userId: me.id, isRoot: false, username: me.username, conversationId: null, interactive: false,
    })
    let cell = { subject: s.key, template: t.key, ask, activated: false, items: 0, onSubject: 0, sayable: 0 }
    try {
      const r = await cog.recollect({ text: ask })
      const items = r.items ?? []
      cell.activated = r.activated === true
      cell.items = items.length
      cell.onSubject = items.filter((i) => s.on.test(JSON.stringify(i))).length
      if (cell.activated) {
        const b = applyUtteranceBoundary({
          items, user: { id: me.id, memoryAccessScope: 'sotera_memory', isRoot: false }, currentAccountId: me.id,
        })
        cell.sayable = b.sayable?.length ?? 0
      }
    } catch (e) { cell.error = e?.message ?? String(e) }
    out.cells.push(cell)
    row.push(cell)
  }
  const shown = row.map((c) => {
    if (c.error) return 'err'.padEnd(19)
    if (!c.activated) return 'silent'.padEnd(19)
    return `${c.onSubject || '·'} of ${c.items}`.padEnd(19)
  }).join('')
  const on = row.map((c) => c.onSubject)
  const spread = Math.max(...on) - Math.min(...on)
  const flag = spread === 0 ? '✓ invariant' : `⛔ SPREAD ${Math.min(...on)}–${Math.max(...on)}`
  console.log(`  ${(s.key + (s.anchor ? ` ⭐${s.anchor}` : '')).padEnd(20)}${shown}${flag}`)
}

// ── ⭐⭐ THE SUMMARY THAT MATTERS: does wording change what she can reach? ──────────────────────────
const bySubject = SUBJECTS.map((s) => {
  const on = out.cells.filter((c) => c.subject === s.key).map((c) => c.onSubject)
  return { subject: s.key, min: Math.min(...on), max: Math.max(...on), spread: Math.max(...on) - Math.min(...on) }
})
const broken = bySubject.filter((b) => b.spread > 0)
console.log(`\n  ⭐ ${broken.length} of ${bySubject.length} subjects are PHRASING-DEPENDENT`
  + ` (their on-subject count changes with the wording):`)
for (const b of bySubject) {
  console.log(`     ${b.subject.padEnd(20)}${b.spread ? `⛔ ${b.min} → ${b.max} depending on how it is asked` : '✓ invariant'}`)
}
console.log('\n  ⚠️ THE STANDING GUARANTEE THIS TESTS: `memory-cognition-check` §1 asserts that four phrasings of')
console.log('     one question produce an IDENTICAL block. That test uses four PERSON phrasings; these are')
console.log('     wider, and they include topics. ⛔ A spread here is not a contradiction of that check — it')
console.log('     is a gap in what the check covers.')
console.log('\n  ⛔ MECHANISM ONLY. What she would SAY needs turns and is not claimed here.')

out.bySubject = bySubject
mkdirSync(OUT, { recursive: true })
writeFileSync(new URL(`${LABEL}.json`, OUT), JSON.stringify(out, null, 2))
console.log(`  → test/results/phrasing/${LABEL}.json`)
await pg.end()
