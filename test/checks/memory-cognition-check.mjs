// THE MEMORY COGNITION LAYER — the whole pipeline, on real data, with no model in the loop.
//
//   node checks/memory-cognition-check.mjs
//
// ⭐⭐⭐ WHAT THIS PROVES BEFORE A SINGLE LIVE CONVERSATION. The four questions that failed on 2026-08-21 —
// *"Have you talked with Hermes lately?"*, *"How's Hermes doing?"*, *"What have you and Hermes been talking
// about?"*, *"Do you know what Hermes has been up to?"* — produced 4, 5, 6 and 8 tool calls and two
// incompatible beliefs about her own access. Here they run through the layer instead of through her, and the
// assertion is that all four come out the SAME.
//
// ⛔ READ-ONLY. The layer is a read path; nothing here writes a memory, a grant is only ever obtained through
// the real disclosure host, and the check creates and deletes nothing.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import { findImplementationLeaks } from '../../Backend/app/components/memory-cognition-vocabulary.js'
import { findIllegalPromotions, AVAILABILITY, BASIS, RETENTION } from '../../Backend/app/components/memory-cognition-axes.js'

const { check, done } = makeChecker('memory-cognition')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const seq = db.txn_memories.sequelize
const { schema: S } = db.txn_memories.getTableName()
const Q = (sql, b = []) => seq.query(sql, { bind: b, type: seq.QueryTypes.SELECT })

const [root] = await Q(`SELECT id::text id, username FROM "${S}".mst_users WHERE username = $1`, [config.auth.root.username])
ok(Boolean(root), 'root row resolves', String(root?.username))
const [conv] = await Q(
  `SELECT id::text id FROM "${S}".txn_conversations WHERE user_id = $1 AND incognito = false ORDER BY updated_at DESC LIMIT 1`,
  [root.id])
ok(Boolean(conv), 'a conversation of root\'s to work in', String(conv?.id).slice(0, 8))

const cognition = buildMemoryCognition(fastify, {
  userId: root.id, isRoot: true, username: root.username, conversationId: conv.id, interactive: false,
})

// ── ⭐⭐⭐ 1 · THE VARIANCE TEST ────────────────────────────────────────────────────────────────────
const VARIANTS = [
  'Have you talked with Hermes lately?',
  "How's Hermes doing?",
  'What have you and Hermes been talking about?',
  'Do you know what Hermes has been up to?',
]
const runs = []
for (const v of VARIANTS) runs.push({ q: v, r: await cognition.recollect({ text: v }) })

// ⚠️⚠️ NON-VACUOUS ON PURPOSE, AND THE FIRST VERSION WAS NOT. It asserted "no leaks in the
// context" while `context` was `null` — and scanning null finds nothing, so four assertions passed by
// examining an absence. ⇒ activation and a non-null context are asserted FIRST, and everything downstream
// depends on them.
ok(runs.every((x) => x.r.activated === true && typeof x.r.context === 'string' && x.r.context.length > 20),
  '1 · ⭐⭐⭐ all four phrasings ACTIVATE and return a real context — memory happens without her deciding to look',
  runs.map((x) => `${x.r.activated}:${(x.r.context ?? '').length}`).join(' '))
// ⓘ If the layer withheld, say WHY — a silent false here used to look like "nothing matched".
for (const { q, r } of runs) {
  if (r.activated) continue
  ok(false, `1 · ⛔ "${q.slice(0, 30)}…" was WITHHELD`,
    `leaks=${JSON.stringify((r.leaks ?? []).map((l) => l.word))} illegal=${JSON.stringify(r.illegal ?? [])}`)
}
ok(new Set(runs.map((x) => (x.r.plan ?? []).sort().join(','))).size === 1,
  '1 · ⭐⭐ …and all four produce the SAME activation plan — the orchestration no longer varies with wording',
  runs[0].r.plan?.join(', '))
ok(new Set(runs.map((x) => x.r.cues.persons.join(','))).size === 1 && runs[0].r.cues.persons.some((p) => p.toLowerCase() === 'hermes'),
  '1 · ⭐ …resolving the same person every time', runs[0].r.cues.persons.join(', '))
// ⚠️ Item COUNTS may legitimately differ — the cue text differs, so the semantic arm ranks differently.
// What must not differ is whether she got a coherent context at all.
ok(runs.every((x) => typeof x.r.context === 'string' && x.r.context.length > 0),
  '1 · ⭐⭐ every phrasing yields a context she can answer from', runs.map((x) => x.r.items.length).join('/'))

// ── ⛔⛔ 2 · NO MACHINERY IN WHAT THE LAYER WROTE ───────────────────────────────────
//
// ⚠️⚠️ THE FIRST VERSION SCANNED THE WHOLE BLOCK AND FAILED — correctly, and for a reason that is a
// FINDING rather than a bug. The leaks it reported (`room`, `recall_memory`, `search_conversations`) were all
// inside QUOTATIONS OF HER OWN EARLIER WORDS: *"From this room, I don't have any direct memories…"*.
// Quoting the conversation back is not a leak; censoring it would be lying about what was said.
// ⇒ the guard polices the FRAME — the layer's own sentences, with every quotation replaced by a token.
for (const { q, r } of runs) {
  const leaks = findImplementationLeaks(r.frame)
  ok(leaks.length === 0,
    `2 · ⛔⛔ the layer's own wording is clean for "${q.slice(0, 26)}…"`,
    leaks.length ? leaks.map((l) => l.word).join(', ') : 'clean')
}
// ⭐ And specifically the four words she said back to Ote — none of them may come from US.
for (const bad of ['room', 'scope', 'store', 'permission']) {
  ok(!runs.some((x) => new RegExp(`(^|[^a-z])${bad}`, 'i').test(x.r.frame)),
    `2 · ⛔ the layer never writes the word "${bad}" — which she used in all four failing answers`)
}
// ⚠️⚠️ AND THE PART A CLEAN FRAME DOES NOT FIX, ASSERTED SO IT CANNOT BE MISTAKEN FOR SOLVED.
// Her machinery-talk is now IN HER OWN HISTORY, so it is quoted back to her indefinitely — a self-mirroring
// channel for exactly the vocabulary this layer removes, the same shape as the Thai register finding where
// her own prior output outvoted a system instruction. This assertion does not demand it be absent; it
// demands we keep MEASURING it, because the day it reaches zero is a real change and the day it doubles is
// a regression nobody would otherwise see.
const quotedLeaks = runs.map((x) => findImplementationLeaks(x.r.context).length)
ok(true, `2 · ⓘ machinery words inside QUOTED material: ${quotedLeaks.join(', ')}`,
  quotedLeaks.some((n) => n > 0)
    ? '⚠ her own past answers are the source — not fixable by a word list'
    : 'none — her history no longer talks about the machinery')

// ── ⭐⭐ 3 · THE LATTICE HOLDS ON REAL DATA ────────────────────────────────────────────────────────
for (const { q, r } of runs) {
  ok(findIllegalPromotions(r.items, r.items).length === 0,
    `3 · the returned set is self-consistent ("${q.slice(0, 20)}…")`)
}
// ⛔ THE ONE THAT MATTERS: a stored memory must never arrive claiming attestation. It is a claim someone
// recorded, not a source she read — and that distinction is the Hermes failure.
const allItems = runs.flatMap((x) => x.r.items)
const storedClaimingAttested = allItems.filter((i) => i.source === 'stored-memory' && i.basis === BASIS.attestedBySource)
ok(storedClaimingAttested.length === 0,
  '3 · ⛔⛔ no stored memory arrives as `attested-by-source` — a recorded claim is not a read source',
  `${storedClaimingAttested.length} violation(s)`)
// ⭐ Retention is never minted by the layer: anything marked retained must be persona-authored, which the
// layer reads rather than decides.
const retained = allItems.filter((i) => i.retention === RETENTION.retained)
ok(retained.every((i) => i.source === 'stored-memory'),
  '3 · ⭐ only a stored memory can be `retained` — the layer never mints retention', `${retained.length} retained`)

// ── ⭐⭐ 4 · ACCESS IS RESOLVED, NOT PREDICTED ─────────────────────────────────────────────────────
// The measured bug: she asserted she could not read across, three times in four, without trying. Here every
// cross-room candidate has been attempted, so each is either recalled or known-unreachable — and NEITHER is
// a guess.
const cross = allItems.filter((i) => i.here === false)
ok(cross.every((i) => i.availability === AVAILABILITY.recalled || i.availability === AVAILABILITY.knownUnreachable),
  '4 · ⭐⭐ every cross-room item carries a RESOLVED availability, never an assumed one',
  `${cross.length} cross-room item(s)`)
const opened = cross.filter((i) => i.availability === AVAILABILITY.recalled)
ok(opened.every((i) => (i.warrants ?? []).includes('access-resolution')),
  '4 · ⭐ …and anything that became readable carries the warrant that made it so',
  `${opened.length} opened`)
// ⓘ Informational rather than asserted: under a personal deployment a root session should mostly open. If
// this is 0 the layer is honest but the deployment is not what we think it is.
ok(true, `4 · ⓘ cross-room items opened: ${opened.length} of ${cross.length}`,
  opened.length === 0 && cross.length > 0 ? '⚠ nothing opened — check the disclosure policy' : '')

// ── ⭐ 5 · THE TWO SILENCES ────────────────────────────────────────────────────────────────────────
const nothingAsked = await cognition.recollect({ text: 'ok thanks' })
ok(nothingAsked.activated === false && nothingAsked.context === null,
  '5 · ⭐⭐ a turn with no cue activates nothing and CLAIMS nothing — we did not look, so we say nothing',
  `activated=${nothingAsked.activated}`)

const nobody = await cognition.recollect({ text: 'What has Zephyrine been up to?' })
ok(nobody.activated === true,
  '5 · a real question about someone unknown still searches — she is not required to know the name first')
// ⚠️ THE FIRST VERSION OF THIS ASSERTION WAS WRONG, AND FINDING OUT WHY PRODUCED A REAL FIX. The
// retrievers are nearest-neighbour indexes — `self-history` deliberately runs `denseMinSim: 0` — so they
// ALWAYS return something. Without a relevance floor the block read *"What I have about zephyrine:"* over
// three memories about building Rome and being under pressure: a false "I do", which is worse than the
// false "I can't" this layer exists to fix. The floor now requires a cue term to appear in the content.
ok(/found nothing/i.test(nobody.context ?? ''),
  '5 · ⭐⭐ …and reports the RESULT of the search, not an explanation of why',
  (nobody.context ?? '').slice(0, 100))
ok((nobody.filtered ?? 0) >= 0 && !/Rome|pressure/i.test(nobody.context ?? ''),
  '5 · ⭐⭐⭐ …and nearest-neighbour noise is NOT presented as material about them',
  `filtered ${nobody.filtered}`)
ok(!/room|scope|store|permission/i.test(nobody.context ?? ''),
  '5 · ⛔ the absence is phrased without machinery — "I looked through what I have", never "not in this room"')

// ── ⭐ 6 · THE TECHNICAL EXEMPTION SURVIVES ────────────────────────────────────────────────────────
const tech = await cognition.recollect({ text: 'How does your memory work?' })
ok(tech.cues.technical === true,
  '6 · ⭐ a question about how she works is recognised as such — the machinery may come out for that one')
ok(runs.every((x) => x.r.cues.technical === false),
  '6 · ⛔ …and an ordinary question about a person never licenses it')

// ── 7 · RE-ENTRANCY: SHE MAY LOOK AGAIN ────────────────────────────────────────────────────────────
// ⭐ Ote: *"no fixed cognitive depth ceiling… if Sotera wants to investigate further, the pipeline should
// allow another pass."* Bounds live on one operation, never on the number of operations.
const first = await cognition.recollect({ text: "How's Hermes doing?" })
const second = await cognition.recollect({ text: 'What exactly did Hermes say about understanding?' })
ok(first.activated && second.activated,
  '7 · ⭐ a second, deeper pass is allowed and independently activates')
ok(typeof first.dropped === 'number' && typeof second.dropped === 'number',
  '7 · ⭐⭐ and every pass REPORTS what it left out — a silent cap reads as "I covered everything"',
  `dropped ${first.dropped} / ${second.dropped}`)

await seq.close().catch(() => {})
done()
