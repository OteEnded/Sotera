// ⭐⭐ EXCLUDE ONE CONVERSATION FROM EVIDENCE — a deliberate, reversible, single act (migration 033).
//
//   node maintenance/exclude-conversation.mjs <id-prefix> --reason "why"        (DRY RUN)
//   node maintenance/exclude-conversation.mjs <id-prefix> --reason "why" --apply
//   node maintenance/exclude-conversation.mjs <id-prefix> --release
//
// ⭐ 033 gave the corpus a third state — *"this happened, and it is not evidence"* — and Ote's standing
// rule is that the capability lands while **every use of it is a separate deliberate act**. This file is
// what one of those acts looks like: one id, one stated reason, printed before and after, reversible.
//
// ── ⛔ WHAT EXCLUSION IS NOT ─────────────────────────────────────────────────────────────────────
// ⛔ Not deletion — the conversation, its title and every message stay exactly where they are.
// ⛔ Not `incognito` — that is a privacy promise fixed at create, and this is not it.
// ⛔ Not archiving — `archived_at` gates the revisit lanes, not retrieval.
// ⛔ AND NOT A CONTAMINATION COVER-UP. `pipeline/corpus-precondition.mjs` reads `txn_messages` directly
//    against its own DECLARED fixture and consults neither `incognito` nor `excluded_from_evidence_at`.
//    ⇒ excluding a conversation **cannot** silence the phrase check. Verified before this file was
//    written, because *"the exclusion made the tripwire go green"* is the one outcome that would make
//    this capability worse than useless.

import { devPg, devSchema } from '../harness.mjs'
import { validateExclusion } from '../../Backend/app/components/corpus-eligibility.js'

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const RELEASE = argv.includes('--release')
const PREFIX = argv.find((a) => !a.startsWith('--') && a !== argv[argv.indexOf('--reason') + 1])
const REASON = argv[argv.indexOf('--reason') + 1] ?? null
if (!PREFIX) { console.error('usage: node maintenance/exclude-conversation.mjs <id-prefix> --reason "why" [--apply|--release]'); process.exit(1) }

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (s, p) => (await pg.query(s, p)).rows

// ⛔ EXACTLY ONE MATCH, OR REFUSE. A prefix that matches two conversations is not an instruction, it is
// an ambiguity, and acting on the first row would be picking one of somebody's conversations at random.
const found = await q(
  `select c.id::text id, c.title, u.username room, c.incognito, c.archived_at,
          c.excluded_from_evidence_at, c.exclusion_reason,
          (select count(*)::int from ${S}.txn_messages m where m.conversation_id = c.id) msgs
     from ${S}.txn_conversations c left join ${S}.mst_users u on u.id = c.user_id
    where c.id::text like $1`, [`${PREFIX}%`])
if (found.length !== 1) {
  console.error(`✖ expected exactly 1 conversation for "${PREFIX}", found ${found.length} — refusing to guess`)
  await pg.end(); process.exit(1)
}
const c = found[0]

console.log(`\n══ ${RELEASE ? 'RELEASE' : 'EXCLUDE'} · ${c.id.slice(0, 8)} ═══════════════════════════════`)
console.log(`   room      : ${c.room}`)
console.log(`   messages  : ${c.msgs}   ⛔ none of them will be touched`)
console.log(`   incognito : ${c.incognito}   archived: ${c.archived_at ? 'yes' : 'no'}`)
console.log(`   currently : ${c.excluded_from_evidence_at ? `EXCLUDED since ${c.excluded_from_evidence_at.toISOString().slice(0, 19)} — "${c.exclusion_reason}"` : 'evidence'}`)

if (RELEASE) {
  if (!APPLY) { console.log('\n   DRY RUN — add --apply to release. Nothing changed.'); await pg.end(); process.exit(0) }
  await pg.query(`update ${S}.txn_conversations set excluded_from_evidence_at = null, exclusion_reason = null where id = $1`, [c.id])
  console.log('\n   ✅ released — it is evidence again.')
  await pg.end(); process.exit(0)
}

const v = validateExclusion({ reason: REASON })
if (!v.ok) { console.error(`\n✖ ${v.why}`); await pg.end(); process.exit(1) }
console.log(`   reason    : ${v.reason}`)
if (!APPLY) { console.log('\n   DRY RUN — add --apply to exclude. Nothing changed.'); await pg.end(); process.exit(0) }

await pg.query(
  `update ${S}.txn_conversations set excluded_from_evidence_at = now(), exclusion_reason = $2 where id = $1`,
  [c.id, v.reason])

// ⭐ PROVE THE EFFECT AND PROVE THE NON-EFFECT. What changed, and what deliberately did not.
const [after] = await q(
  `select excluded_from_evidence_at, exclusion_reason, incognito, archived_at, title,
          (select count(*)::int from ${S}.txn_messages m where m.conversation_id = $1) msgs
     from ${S}.txn_conversations where id = $1`, [c.id])
console.log(`\n   ✅ excluded at ${after.excluded_from_evidence_at.toISOString().slice(0, 19)}`)
console.log(`   ⛔ unchanged: ${after.msgs} messages · title intact · incognito=${after.incognito} · archived=${after.archived_at ? 'yes' : 'no'}`)
const [{ n: reachable }] = await q(
  `select count(*)::int n from ${S}.txn_conversations c
    where c.id = $1 and c.incognito = false and c.excluded_from_evidence_at is null`, [c.id])
console.log(`   ⭐ retrieval predicate now matches it: ${reachable} time(s) — 0 means she can no longer reason from it`)
console.log(`   ⛔ reverse with:  node maintenance/exclude-conversation.mjs ${PREFIX} --release --apply`)
await pg.end()
