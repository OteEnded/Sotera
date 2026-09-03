// ⭐⭐⭐ STEP 0 · THE BEFORE SNAPSHOT — read-only. ⛔ WRITES NOTHING.
//
//   node test/maintenance/bind-canary-0-before.mjs
//
// The first governed bind is an act on the LIVE corpus, and the first bind is a ONE-WAY DOOR (the slot
// becomes governed and can be repointed but never unbound). So the complete prior state is captured to a
// file BEFORE anything is declared — Ote: *"record the complete before/after state"*.
//
// ⛔ It writes no row of its own. The only file it touches is the snapshot.
import { writeFileSync, mkdirSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const SLOT_ENTITY = 'user'
const SLOT_LABEL = 'build tag for this cycle'
const ROOM = 'agent_dev'

const schema = devSchema()
const c = devPg()
await c.connect()
const S = `"${schema}"`
const q = async (sql, p = []) => (await c.query(sql, p)).rows

const [room] = await q(`SELECT id::text, username FROM ${S}."mst_users" WHERE username = $1`, [ROOM])
if (!room) throw new Error('agent_dev not found — ⛔ this act must never run against root')

const slots = await q(
  `SELECT s.id::text, s.namespace, s.entity, s.canonical_label, s.question_id::text,
          s.user_id::text, s.persona, s.write_count, s.last_write, s.created_at, s.updated_at
     FROM ${S}."mst_slots" s
    WHERE s.entity = $1 AND s.canonical_label = $2 AND s.user_id = $3::uuid`,
  [SLOT_ENTITY, SLOT_LABEL, room.id])

if (slots.length !== 1) {
  throw new Error(`expected exactly ONE slot for ${SLOT_ENTITY}/${SLOT_LABEL} in ${ROOM}, found ${slots.length}`)
}
const slot = slots[0]

const rows = await q(
  `SELECT id::text, value, kind, namespace, entity, attribute, provenance, author, scope,
          supersedes_id::text, question_id_at_admission::text,
          invalid_at, expired_at, created_at, updated_at, source_message_id::text
     FROM ${S}."txn_memories" WHERE slot_id = $1::uuid ORDER BY created_at`, [slot.id])

// ⭐ SIBLINGS — the blast-radius control. Every other slot in the same room, fingerprinted, so "no sibling
// slot changed" is asserted against a recorded prior state rather than assumed.
const siblings = await q(
  `SELECT id::text, entity, canonical_label, namespace, question_id::text, write_count, updated_at
     FROM ${S}."mst_slots" WHERE user_id = $1::uuid AND id <> $2::uuid ORDER BY id`, [room.id, slot.id])

const [totals] = await q(
  `SELECT (SELECT count(*)::int FROM ${S}."mst_slots") AS slots,
          (SELECT count(*)::int FROM ${S}."mst_slots" WHERE question_id IS NOT NULL) AS bound_slots,
          (SELECT count(*)::int FROM ${S}."mst_slot_questions") AS questions,
          (SELECT count(*)::int FROM ${S}."log_slot_bindings") AS bindings,
          (SELECT count(*)::int FROM ${S}."txn_memories") AS memories,
          (SELECT count(*)::int FROM ${S}."txn_memories" WHERE question_id_at_admission IS NOT NULL) AS pinned,
          (SELECT count(*)::int FROM ${S}."txn_memories"
            WHERE invalid_at IS NULL AND expired_at IS NULL) AS live_memories`)

const [ns] = await q(
  `SELECT namespace_key, owner_kind, owner, permitted_writers, slot_governed, read_default
     FROM ${S}."mst_namespace_declarations" WHERE namespace_key = $1`, [slot.namespace])

const snap = {
  captured_at: new Date().toISOString(),
  room: { id: room.id, username: room.username },
  slot, namespace_declaration: ns ?? null, rows, totals, siblings,
}

mkdirSync(new URL('../results/', import.meta.url), { recursive: true })
const out = new URL('../results/canary-bind-before.json', import.meta.url)
writeFileSync(out, JSON.stringify(snap, null, 2), 'utf8')

const live = rows.filter((r) => !r.invalid_at && !r.expired_at)
console.log('── BEFORE ─────────────────────────────────────────────────────────────')
console.log(`slot         ${slot.id}`)
console.log(`address      ${slot.namespace} · ${slot.entity} / ${slot.canonical_label}   (room ${room.username})`)
console.log(`question_id  ${slot.question_id ?? 'NULL  ⇒ UNBOUND, so this is a FIRST-BIND'}`)
console.log(`namespace    declared=${!!ns} slot_governed=${ns?.slot_governed}`)
console.log(`rows         ${rows.length} total · ${live.length} live`)
for (const r of rows) {
  console.log(`  ${r.id}  live=${!r.invalid_at && !r.expired_at}  pin=${r.question_id_at_admission ?? 'NULL'}  value=${JSON.stringify(r.value)}`)
}
console.log(`siblings     ${siblings.length} other slots in this room (fingerprinted)`)
console.log(`totals       ${JSON.stringify(totals)}`)
console.log(`snapshot  →  ${out.pathname}`)
await c.end()
