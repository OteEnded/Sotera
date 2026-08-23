// ⭐⭐⭐ TRACE THE TOPIC-ONLY RELEVANCE FLOOR — ⛔ OFFLINE, no model, no turns, and NOTHING CHANGED.
//
//   node pipeline/relevance-floor-trace.mjs
//   node pipeline/relevance-floor-trace.mjs --ask "Has anyone ever talked to you about growing basil?"
//
// ── ⚠️⚠️ WHY: THE FLOOR IS NOW THE SUSPECT, AND IT BLOCKS THE EXPERIMENT WE NEED ────────────────────
// The false-absence search found ONE condition that fired 3/3 — `topic-basil` — and reading the evidence
// disqualified it: four episodes matched on the cue **"anyone"**, none mentioned basil, and her denial was
// CORRECT given what she was handed. ⇒ the defect is upstream, and it is also **the thing preventing us from
// constructing the evidence condition P5 would need to be evaluated against**.
//
// ⭐ Ote: *"do not weaken or change the floor yet. First establish exactly what it is doing, where the
// topic-only retrieval is coming from, and why `anyone` can become the surviving cue for a basil query."*
//
// ── ⭐⭐ WHAT THIS FILE ESTABLISHES, per question, from the real code path ──────────────────────────
//   1. the CUES formed, and which of them the floor will use as `terms`
//   2. the DISCOVERY pool — what the nearest-neighbour search returned BEFORE any floor
//   3. whether the truly relevant material is in that pool at all  ⇒ separates RECALL from PRECISION
//   4. for every candidate, WHICH TERM admitted it — the per-term attribution the defect needs
//
// ⛔ It changes nothing, asserts nothing, and is a REPORT. ⓘ It re-implements the floor's predicate rather
// than importing it, because the predicate is a closure inside `recollect()`. ⚠️ That is a copy, and a copy
// can drift — so it prints the production source line it mirrors, and any change to one must change both.

import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { formCues } from '../../Backend/app/components/memory-cognition-cues.js'
import { buildConversationSearch } from '../../Backend/app/components/conversation-search.js'
import { makeEmbedder } from '../../Backend/app/components/memory-embed-host.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const config = loadConfig()

// ⓘ The questions the search produced, plus the person control. ⭐ `mustMention` is the DECLARED expectation:
// what a human says the relevant material would contain. ⛔ Never inferred from what came back.
const QUESTIONS = opt('ask') ? [{ key: 'ad-hoc', ask: opt('ask'), mustMention: null }] : [
  { key: 'topic-basil', ask: 'Has anyone ever talked to you about growing basil?', mustMention: /basil|rosemary|mint/i },
  { key: 'topic-notebook', ask: 'Do you remember anything about a herb notebook?', mustMention: /notebook/i },
  { key: 'person-hermes ⭐control', ask: "How's Hermes doing? What have you and he actually talked about?", mustMention: /hermes/i },
  { key: 'topic-basil-bare', ask: 'basil', mustMention: /basil|rosemary|mint/i },
]

const pg = devPg(); await pg.connect()
const S = devSchema()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const { rows: [me] } = await pg.query(
  `select id::text id, username from ${S}.mst_users where username = $1`, ['agent_dev'])
const { rows: names } = await pg.query(
  `select coalesce(display_name, username) n from ${S}.mst_users`)
const knownNames = names.map((r) => r.n)

// ⚠️ THE PRODUCTION PREDICATE, MIRRORED — and printed so the copy can be checked against the original.
const HOST = readFileSync(new URL('../../Backend/app/components/memory-cognition-host.js', import.meta.url), 'utf8')
const PROD_TERMS = HOST.match(/^\s*const terms = .*$/m)?.[0]?.trim() ?? '(not found — the mirror has drifted)'
const PROD_SOME = HOST.match(/^\s*return terms\.some.*$/m)?.[0]?.trim() ?? '(not found — the mirror has drifted)'

console.log(`\n${'═'.repeat(110)}`)
console.log('  RELEVANCE-FLOOR TRACE — offline, nothing changed')
console.log(`${'═'.repeat(110)}`)
console.log('\n  THE PRODUCTION FLOOR, quoted from memory-cognition-host.js:')
console.log(`    ${PROD_TERMS}`)
console.log(`    ${PROD_SOME}`)
console.log('\n  ⇒ ⭐⭐ `terms.some(...)` is a DISJUNCTION over every topic. One weak term admits everything,')
console.log('    and the floor is therefore only as strong as its LEAST discriminating cue.')

for (const q of QUESTIONS) {
  const cues = formCues(q.ask, { knownNames })
  const usesPersons = cues.persons.length > 0
  const terms = (usesPersons ? cues.persons : cues.topics).map((t) => t.toLowerCase())

  console.log(`\n${'─'.repeat(110)}`)
  console.log(`  ${q.key}   "${q.ask}"`)
  console.log(`  persons=[${cues.persons.join(', ')}]  topics=[${cues.topics.join(', ')}]`)
  console.log(`  ⇒ the floor uses ${usesPersons ? 'PERSONS' : 'TOPICS'}: terms=[${terms.join(', ')}]`)

  // ── 2 · THE DISCOVERY POOL, exactly as activateEpisodes builds it ────────────────────────────────
  // ⚠️ `denseMinSim: 0` is deliberate in production and documented there as *"a ranked nearest-match index,
  // not a relevance filter"* ⇒ discovery ALWAYS returns something, and the floor is the only gate.
  const query = [cues.persons.join(' '), cues.raw].filter(Boolean).join(' ').trim()
  let evidence = []
  try {
    // ⚠️⚠️ AND THE FIRST VERSION OF THIS LINE PASSED `embed: null`, WHICH SILENTLY RAN LEXICAL-ONLY.
    // The Hermes control then reported "29 candidates, 0 mentioning Hermes" while the real pipeline kept 5
    // on-subject items — an impossible pair, and the tell. ⭐ Production passes `makeEmbedder`, so the pool
    // is HYBRID; a lexical-only replication is a different retriever wearing the same name.
    const cs = buildConversationSearch(fastify, {
      userId: me.id, acrossRooms: true, roles: ['assistant'], embed: makeEmbedder(fastify, { userId: me.id }),
    })
    const raw = await cs.search(query, { limit: 40, excludeConversationId: null, denseMinSim: 0 })
    evidence = Array.isArray(raw?.evidence) ? raw.evidence : []
  } catch (e) { console.log(`  ⛔ discovery failed: ${e.message}`) }

  // ⚠️ `toEvidence()` names the text `excerpt` — ⛔ NOT `message.content`. The first version read a field
  // that does not exist, so every candidate looked empty and every term looked perfectly discriminating.
  const said = (e) => String(e?.excerpt ?? '').toLowerCase()
  const onSubject = q.mustMention ? evidence.filter((e) => q.mustMention.test(said(e))) : []
  console.log(`\n  DISCOVERY POOL: ${evidence.length} candidate message(s) (limit 40, denseMinSim 0)`)
  if (q.mustMention) {
    console.log(`  ⭐ candidates matching the DECLARED subject ${q.mustMention}: ${onSubject.length}`
      + `${onSubject.length ? '' : '  ⇒ ⛔ RECALL FAILURE — the relevant material never entered the pool'}`)
  }

  // ── 4 · PER-TERM ATTRIBUTION · which term admits each candidate, and how discriminating each one is ──
  console.log('\n  PER-TERM ADMISSION over the discovery pool:')
  const rows = terms.map((t) => ({
    term: t,
    admits: t.length >= 3 ? evidence.filter((e) => said(e).includes(t)).length : 0,
    tooShort: t.length < 3,
  })).sort((a, b) => b.admits - a.admits)
  for (const r of rows) {
    const pct = evidence.length ? Math.round((r.admits / evidence.length) * 100) : 0
    const flag = r.tooShort ? '⛔ under the 3-char minimum — cannot admit anything'
      : pct >= 50 ? '⚠️⚠️ NEAR-UNIVERSAL — this term is doing no discriminating at all'
        : pct >= 20 ? '⚠️ weak' : '⭐ discriminating'
    console.log(`    ${r.term.padEnd(14)} admits ${String(r.admits).padStart(3)}/${evidence.length} (${String(pct).padStart(3)}%)  ${flag}`)
  }
  const admitted = evidence.filter((e) => terms.some((t) => t.length >= 3 && said(e).includes(t)))
  const admittedOnSubject = q.mustMention ? admitted.filter((e) => q.mustMention.test(said(e))) : []
  console.log(`  ⇒ the DISJUNCTION admits ${admitted.length}/${evidence.length}`
    + (q.mustMention ? `, of which ${admittedOnSubject.length} are actually on the declared subject` : ''))
  if (q.mustMention && admitted.length && !admittedOnSubject.length) {
    console.log('  ⇒ ⛔⛔ PRECISION FAILURE: everything that survives the floor is off-subject, so the block')
    console.log('       describes material that has nothing to do with what was asked.')
  }

  // ── 5 · WHAT THE REAL PIPELINE ACTUALLY KEPT, for the same question ──────────────────────────────
  const cog = buildMemoryCognition(fastify, {
    userId: me.id, isRoot: false, username: me.username, conversationId: null, interactive: false,
  })
  const out = await cog.recollect({ text: q.ask })
  const kept = out.items ?? []
  const keptOnSubject = q.mustMention ? kept.filter((i) => q.mustMention.test(JSON.stringify(i))) : []
  console.log(`\n  THE REAL PIPELINE: activated=${out.activated} · kept ${kept.length} item(s) · filtered ${out.filtered ?? 0}`
    + (q.mustMention ? ` · on-subject ${keptOnSubject.length}` : ''))
  // ⭐ And what the RENDERED subject becomes — the `about0` half of the same defect.
  const about = (out.context ?? '').match(/^.*(?:came up|talking about|about)\s+([^\n.]+)/m)?.[1] ?? null
  if (about) console.log(`  ⚠️ the block names its subject as: "${about.trim().slice(0, 60)}"`)
}

console.log(`\n${'═'.repeat(110)}`)
console.log('  ⛔ NOTHING WAS CHANGED. This is a trace, and the floor is untouched.')
await pg.end()
