// ⭐⭐⭐ D4 · WHICH CANDIDATE SHOULD THE WINDOW CENTRE ON? — offline, clean corpus, ⛔ production untouched.
//
//   node pipeline/episode-centre-selection.mjs
//
// ⚠️⚠️ NAME COLLISION, SAID OUT LOUD: `D3` is already used in `ANALYSIS_SOTERA_RELEVANCE_FLOOR.md` for the
// floor's disjunction (`terms.some`). This is the **centre-selection** defect — the "third defect" Ote named
// after the D2 end-to-end run — so it is **D4** here, and it is not the same thing as that D3.
//
// ── ⭐ THE EVIDENCE THAT OPENED IT (the notebook trace) ────────────────────────────────────────────
//     the retriever's #1 candidate is in f3476cec — and it does NOT mention the notebook
//     a notebook candidate sits at pool rank 2 in 1055b266
//     a notebook candidate sits at pool rank 5 in f3476cec
// ⇒ D1 centres the window on a conversation's BEST-RANKED candidate. When that candidate is off-subject and a
// LOWER-ranked one in the same conversation is on-subject, the ±2 window is rebuilt around the wrong message
// and the floor — correctly — drops the episode.
//
// ── ⭐⭐ WHAT THIS FILE MEASURES, BEFORE ANY CODE CHANGES ───────────────────────────────────────────
// Per case, per conversation in the real discovery pool:
//   · does the conversation hold an on-subject candidate at all?
//   · is its BEST-RANKED candidate the on-subject one?  ⇒ D4 does not apply
//   · or is the on-subject one FURTHER DOWN?            ⇒ D4 applies, and by how many ranks
// ⇒ this is the PREVALENCE of the defect, which decides whether a fix is worth making before it is designed.
//
// ── ⛔ AND THE CONSTRAINT ANY FIX MUST SATISFY, stated here so the measurement is read against it ───
// ⭐⭐ A centre change may change WHICH MESSAGE a window is built around. It may **never** change WHICH
// CONVERSATIONS SURVIVE. A conversation with no cue-matching candidate must keep its best-ranked centre and
// stay in the running — otherwise we have built a second relevance floor upstream of the real one, which is
// exactly the thing Ote has ruled out repeatedly.

import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { formCues } from '../../Backend/app/components/memory-cognition-cues.js'
import { buildConversationSearch } from '../../Backend/app/components/conversation-search.js'
import { makeEmbedder } from '../../Backend/app/components/memory-embed-host.js'

const config = loadConfig()
const POOL = 40

// ⭐ The same ten-case set the end-to-end measure uses, so the two can be read together. `on` is the DECLARED
// subject; `cueTerms` is what the floor would actually use, recomputed here from `formCues`.
const CASES = [
  { key: 'basil-bare', ask: 'basil', on: /basil|rosemary|mint/i },
  { key: 'basil-sentence', ask: 'Has anyone ever talked to you about growing basil?', on: /basil|rosemary|mint/i },
  { key: 'notebook', ask: 'Do you remember anything about a herb notebook?', on: /notebook/i },
  { key: 'herb-promise', ask: 'What did you promise about the herbs?', on: /basil|rosemary|mint|herb/i },
  { key: 'hermes ⭐control', ask: "How's Hermes doing? What have you and he actually talked about?", on: /hermes/i },
  { key: 'hermes-variant ⭐control', ask: 'Have you talked with Hermes lately?', on: /hermes/i },
  { key: 'kavi ⭐control', ask: "How's Kavi? What have you and Kavi actually talked about?", on: /kavi/i },
  { key: 'mina ⭐control', ask: 'What do you know about Mina?', on: /mina/i },
  { key: 'kavi-thai ⭐control', ask: 'Kavi เป็นอย่างไรบ้าง เคยคุยกับเขาเรื่องอะไรบ้าง', on: /kavi/i },
  { key: 'ferdinand ⭐negative', ask: "How's Ferdinand doing? What have you and Ferdinand talked about?", on: /ferdinand/i },
]

const pg = devPg(); await pg.connect()
const S = devSchema()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const { rows: [me] } = await pg.query(`select id::text id from ${S}.mst_users where username='agent_dev'`)
const { rows: names } = await pg.query(`select coalesce(display_name, username) n from ${S}.mst_users`)
const knownNames = names.map((r) => r.n)
const { rows: [corpus] } = await pg.query(
  `select (select count(*)::int from ${S}.txn_conversations where title like 'RATE %') harness,
          (select count(*)::int from ${S}.txn_conversations) total`)

console.log(`\n${'═'.repeat(112)}`)
console.log('  D4 · CENTRE SELECTION — how often is a conversation\'s best-RANKED candidate not its on-subject one?')
console.log(`${'═'.repeat(112)}`)
console.log(`  corpus: ${corpus.harness} harness conversation(s) of ${corpus.total}`
  + `${corpus.harness ? ' ⚠️ CONTAMINATED' : ' ✓ clean'}   ⛔ nothing is changed by this file`)
console.log(`\n  ${'case'.padEnd(26)}${'convs'.padEnd(7)}${'holders'.padEnd(9)}${'centre already right'.padEnd(21)}`
  + `${'centre would MOVE'.padEnd(19)}rank gap`)

let applies = 0; let total = 0
for (const c of CASES) {
  const cues = formCues(c.ask, { knownNames })
  // ⓘ What the floor would use, mirrored from `recollect()`: persons when any resolved, else topics.
  const terms = (cues.persons.length ? cues.persons : cues.topics).map((t) => t.toLowerCase())
  const cs = buildConversationSearch(fastify, {
    userId: me.id, acrossRooms: true, roles: ['assistant'], embed: makeEmbedder(fastify, { userId: me.id }),
  })
  const raw = await cs.search(cues.raw, { limit: POOL, excludeConversationId: null, denseMinSim: 0 })
  const ev = raw.evidence ?? []
  // group, keeping every candidate's pool rank and whether it is on-subject / cue-matching
  const eps = new Map()
  ev.forEach((e, i) => {
    const cid = e.conversation?.id
    if (!cid) return
    const text = String(e.excerpt ?? '').toLowerCase()
    if (!eps.has(cid)) eps.set(cid, { cid, cands: [] })
    eps.get(cid).cands.push({
      rank: i,
      onSubject: c.on.test(text),
      // ⭐ CUE-MATCHING is what a fix could actually use — the floor's own predicate, on the excerpt.
      cueMatch: terms.some((t) => t.length >= 3 && text.includes(t)),
    })
  })
  const convs = [...eps.values()]
  const holders = convs.filter((x) => x.cands.some((k) => k.onSubject))
  // ⭐ THE MEASUREMENT: for a holder, is candidate[0] (the centre today) the on-subject one?
  let right = 0; let move = 0; const gaps = []
  for (const h of holders) {
    if (h.cands[0].onSubject) { right += 1; continue }
    move += 1
    const firstOn = h.cands.find((k) => k.onSubject)
    gaps.push(firstOn.rank - h.cands[0].rank)
  }
  total += holders.length; applies += move
  console.log(`  ${c.key.padEnd(26)}${String(convs.length).padEnd(7)}${String(holders.length).padEnd(9)}`
    + `${String(right).padEnd(21)}${String(move).padEnd(19)}${gaps.length ? gaps.join(',') : '—'}`)
}

console.log(`\n  ⭐ D4 APPLIES TO ${applies} OF ${total} holder conversations across the ten cases`
  + ` (${total ? Math.round((applies / total) * 100) : 0}%).`)
console.log('     ⓘ "applies" means: the conversation DOES hold on-subject material, and today\'s centre —')
console.log('     its best-RANKED candidate — is not that material, so the window is built around the wrong')
console.log('     message. ⚠️ Whether the on-subject text nonetheless falls inside the ±2 window is NOT')
console.log('     measured here; that is what the end-to-end arm measures.')
console.log('\n  ⛔ A CENTRE FIX MAY CHANGE WHICH MESSAGE A WINDOW IS BUILT AROUND. It may NEVER change which')
console.log('     conversations survive — a conversation with no cue-matching candidate keeps its best-ranked')
console.log('     centre, or we have built a second relevance floor upstream of the real one.')
await pg.end()
