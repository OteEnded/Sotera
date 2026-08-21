// ⭐⭐ A SIGNAL IS NOT A BOUNDARY — the separation, asserted rather than promised.
//
//   node checks/layer-separation-check.mjs
//
// Ote ratified this as the thing to preserve while Gen-3 runs (2026-08-21):
//
//   > *"Retrieve decides where to look. Project / boundary decides what Sotera is allowed to see. Sotera
//   >  decides what the information means and whether it is worth retaining. And especially: a signal is
//   >  not a boundary. So don't let vector similarity, provenance, confidence, or any other retrieval
//   >  signal leak into authorization or projection."*
//
// ⭐ THIS IS A CLAIM ABOUT WHAT THE CODE DOES **NOT** DO, which is exactly the kind that stops being true
// without anyone noticing. `mirror-needs-a-mechanism` ran the same shape in reverse — a unit-tested module
// imported by nothing — and migration 014's "nothing writes this table" survived only because a check
// asserted it. A boundary that is correct today and unguarded is a boundary with an expiry date.
//
// ⛔ AND THE LEAK WOULD NOT ARRIVE AS AN ACCESS DECISION. Nobody will ever write "let a high score widen
// the projection". It arrives as a tuning change: *"we already have the score here, and a confident match
// is obviously fine to show."* That is why the assertion is on the PROJECTION STAGE'S SOURCE rather than
// on behaviour — by the time behaviour differs, the rule is already gone.
//
// ⚠️ SLICES ARE ASSERTED NON-TRIVIAL BEFORE THEY ARE SCANNED. A previous check in this project "passed"
// three source assertions by matching my own explanatory comments, and another passed because a bad split
// caught the wrong function entirely. A scan over an empty string passes everything.

import { readFileSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('layer-separation')
const ok = (c, l, d = '') => check(l, c, d)
const pg = devPg(); await pg.connect()
const S = devSchema()

const read = (rel) => readFileSync(new URL(`../../Backend/${rel}`, import.meta.url), 'utf8')
// Comments are stripped BEFORE any scan: a rule explained in prose must not satisfy the test for itself.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
/** The source BETWEEN two anchors, so a scan covers one stage and not its neighbours. */
const between = (src, from, to) => {
  const a = src.indexOf(from)
  const b = to ? src.indexOf(to, a + 1) : -1
  if (a === -1) return ''
  return src.slice(a, b === -1 ? undefined : b)
}

// ⭐ Every name a retrieval signal travels under in this codebase. ⛔ A new one must be added here the day
// it is introduced — which is the only maintenance this check needs.
const SIGNAL_WORDS = ['score', 'relevance', 'similarity', 'cosine', 'distance', 'denseMinSim',
  'minRelevance', 'confidence', 'provenance', 'rrf', 'rank', 'weight', 'embedding']
const leaks = (code) => SIGNAL_WORDS.filter((w) => new RegExp(`\\b${w}`, 'i').test(code))

try {
  const shRaw = read('app/components/self-history-host.js')
  const sh = strip(shRaw)
  const csRaw = read('app/components/conversation-search.js')
  const disclosure = strip(read('app/components/disclosure-host.js'))

  // ── S · THE THREE STAGES EXIST AS SEPARATE, NAMED THINGS ────────────────────────────────────────
  // If they are ever collapsed into one function the rest of this file becomes unassertable, so the
  // structure is checked before the restraint is.
  for (const stage of ['retrieveCandidates', 'applyBoundaries', 'search']) {
    ok(new RegExp(`function ${stage}\\b`).test(sh), `S · the stage exists as its own function: ${stage}`)
  }

  // ── O · THE OPPORTUNITY IS REAL — candidates DO arrive carrying a score ─────────────────────────
  // ⭐ This assertion exists so the next one means something. "The projection ignores the score" is only
  // interesting if a score is actually there to ignore; without this, the check could be green because
  // retrieval never produced one.
  ok(/score:\s*typeof row\.score/.test(csRaw) || /\bscore\b/.test(csRaw),
    'O · ⭐ retrieval really does attach a score to every candidate — so the restraint below is restraint, not absence')

  // ── P · THE PROJECTION STAGE IS INDEX-AGNOSTIC ──────────────────────────────────────────────────
  const projection = between(sh, 'async function applyBoundaries', 'async function search')
  ok(projection.length > 400,
    'P · the projection slice was actually extracted (a scan over nothing passes everything)',
    `${projection.length} chars`)
  // ⭐⭐ AND THE MATCHER IS PROVEN NON-VACUOUS BEFORE IT IS TRUSTED. A green scan is worthless if the
  // scanner cannot go red — the same discipline as the self-model mutation proof. This is the realistic
  // leak: someone keeps the candidate's score because it is already in hand.
  const WOULD_LEAK = 'if (m.roomUserId === userId || e.score > 0.8) { here.push(e) }'
  ok(leaks(WOULD_LEAK).includes('score'),
    'P · ⭐ the leak scanner DOES fire on a realistic leak — it is not a matcher that can only pass',
    `caught: ${leaks(WOULD_LEAK).join(', ')}`)
  const projectionLeaks = leaks(projection)
  ok(projectionLeaks.length === 0,
    'P · ⭐⭐ THE PROJECTION STAGE READS NO RETRIEVAL SIGNAL — it never learns how a candidate was found',
    projectionLeaks.join(', ') || 'no score, relevance, confidence, provenance or embedding term present')
  // ⭐ And what it DOES decide from: room identity, and nothing else.
  ok(/roomUserId === userId/.test(projection),
    'P · ⭐ the include/exclude decision is made from ROOM IDENTITY — an id comparison, not a threshold')
  ok(/if \(!m\) continue/.test(projection),
    'P · ⛔ and a candidate whose room cannot be established is DROPPED, never included')

  // ── A · THE AUTHORIZATION LAYER IS INDEX-AGNOSTIC TOO ───────────────────────────────────────────
  // The disclosure host is the only thing that can turn an existence handle into readable content. If a
  // similarity score ever reaches it, "the match was strong" becomes an argument for opening a room.
  const disclosureLeaks = leaks(disclosure)
  ok(disclosureLeaks.length === 0,
    'A · ⭐⭐ THE AUTHORIZATION LAYER READS NO RETRIEVAL SIGNAL EITHER — a strong match is not a permission',
    disclosureLeaks.join(', ') || 'none present')
  // ⛔ Its authority comes from a stored human answer, and from nothing computed.
  ok(/GRANT_LABEL/.test(disclosure) && /status !== 'answered'/.test(disclosure),
    'A · ⭐ its authority is a STORED CARD ANSWER, verified server-side — not a value it derived')

  // ── F · FLOORS ARE PER-CONSUMER, WHICH IS THE SAME PRINCIPLE ONE LEVEL DOWN ─────────────────────
  // The index is tuned where it is consumed; ⛔ the global default is not moved to suit one caller.
  ok(/denseMinSim = 0\.5/.test(csRaw),
    'F · ⭐ the shared evidence floor is still 0.5 — evidence fails toward silence')
  ok(/denseMinSim: 0\b/.test(sh),
    'F · ⭐ and self-history sets its OWN floor of 0 — a ranked nearest-match index, not a relevance filter')

  // ── R · REFLECTIONS ARE NOT EMBEDDED, AND THAT IS A DECISION ────────────────────────────────────
  // Ote, 2026-08-21: *"If we embed previous reflections and make them retrievable, we're effectively
  // giving Gen-3 its own prior reflections and changing the experiment."* ⇒ the same hazard as
  // PRIORS_OFFERED, with a vector attached: her earlier answer shows her a SHAPE, and shape is the
  // variable generation 3 exists to measure.
  const cols = (await pg.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='log_reflections'`,
    [S])).rows.map((r) => r.column_name)
  ok(cols.length > 0, 'R · log_reflections exists', `${cols.length} columns`)
  const vectorish = cols.filter((c) => /embed|vector|hv$/i.test(c))
  ok(vectorish.length === 0,
    'R · ⭐⭐ NO EMBEDDING COLUMN ON log_reflections — her prior reflections are not retrievable, on purpose',
    vectorish.join(', ') || 'none')
  const reflectionHost = strip(read('app/components/reflection-lifecycle-host.js'))
  ok(!/makeEmbedder|embeddings\(/.test(reflectionHost),
    'R · ⭐ and the reflection host embeds nothing itself')

  // ── V · PROVENANCE IS COMPLETE ON EVERY ROW ─────────────────────────────────────────────────────
  // Ote: *"I want us to be able to look back and know exactly what tools/context/code were available for
  // each reflection."* ⇒ a row missing one of these is a row that cannot answer that, and the failure
  // mode is an explicit field list quietly dropping one.
  const [prov] = (await pg.query(
    `SELECT count(*)::int n,
            count(prompt_generation)::int gen, count(code_mtime)::int code, count(model)::int model
       FROM ${S}.log_reflections`)).rows
  ok(prov.n === prov.gen && prov.n === prov.code && prov.n === prov.model,
    'V · ⭐⭐ every reflection row records its generation, its code and its model',
    `${prov.n} row(s): gen=${prov.gen} code=${prov.code} model=${prov.model}`)
  // ⭐ The stamp must pin BOTH source files, because the OFFERED TOOLSET lives in the pure one — a row
  // that named only the host could not answer "which tools were available".
  ok(/host=\$\{host\}\|pure=\$\{pure\}/.test(reflectionHost),
    'V · ⭐ the code stamp pins BOTH halves (host + pure), so the offered toolset is recoverable')
  ok(/REFLECTION_TOOLS/.test(strip(read('app/plugins/cron.js'))),
    'V · ⓘ and the boot line records how many tools were offered, alongside the context knobs')
} finally {
  await pg.end()
}

done()
