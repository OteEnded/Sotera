// ⭐⭐⭐ THE APPROVED REMEDIATION — retire the two relayed-speech identity rows. ⛔ NOTHING IS DELETED.
//
//   node test/maintenance/invalidate-cogito-identity-rows.mjs [--apply]
//
// ⚠️ Default is a DRY RUN. `--apply` performs the act. Ote approved it explicitly on 2026-09-04:
// *"Invalidate exactly 49111883… and f410bbfd…. Do not delete them. Do not supersede them with a guessed
// name."*
//
// ── ⭐ WHAT THIS DOES, AND WHAT IT REFUSES TO DO ─────────────────────────────────────────────────
//   ⭐ sets `invalid_at` — the store's own retire mechanism, so the rows leave every model-facing read
//   ⭐ writes EXACTLY ONE `log_memory_changes` row per memory: action `forget`, the real operator as
//     actor, a precise reason, and the complete `before` snapshot
//   ⛔ does NOT delete · ⛔ does NOT supersede with a guessed name · ⛔ touches nothing else
//
// ⓘ The rows are SLOTLESS, so there is no slot-level supersede path; `invalid_at` is the mechanism.
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { logMemoryChange, snapshot } from '../../Backend/app/audit/memory-log.js'
import { devPg, devSchema } from '../harness.mjs'

const APPLY = process.argv.includes('--apply')
const ACTOR = 'ote-operator'
const IDS = ['49111883-8a5c-4442-93ae-dbf2cf7c3391', 'f410bbfd-edcd-4a8c-9232-1c0b40c3fa4a']
const REASON = 'relayed speech: the value appears only inside a letter the account holder pasted, written '
  + 'by a third party (Cogito). The account holder never asserted it. Approved by Ote 2026-09-04; the row '
  + 'is retired, not deleted, and both source turns remain stored.'

loadConfig()
const db = await initDB(); setDB(db)
db.txn_memories.sequelize.options.logging = false
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const state = async () => q(
  `SELECT id::text, value, attribute, namespace, provenance::text AS provenance, importance,
          access_count, invalid_at, source_message_id::text AS src
     FROM ${S}."txn_memories" WHERE id = ANY($1::uuid[]) ORDER BY created_at`, [IDS])

console.log(`${APPLY ? '⭐ APPLYING' : 'ⓘ DRY RUN — pass --apply to perform the act'}\n`)
console.log('── BEFORE ─────────────────────────────────────────────────────────────')
console.table(await state())

if (!APPLY) { await pg.end(); await db.txn_memories.sequelize.close(); process.exit(0) }

for (const id of IDS) {
  // ⭐ THE SNAPSHOT IS TAKEN FIRST AND FROM THE ROW ITSELF — the audit must describe what was actually
  // there, ⛔ never what the script believed was there.
  const row = await db.txn_memories.findByPk(id)
  if (!row) { console.log(`⛔ ${id} not found — skipped`); continue }
  if (row.invalid_at) { console.log(`ⓘ ${id} already retired — skipped, ⛔ no second audit row`); continue }
  const before = snapshot(row)
  await row.update({ invalid_at: new Date() })
  await logMemoryChange(db, {
    memoryId: id, action: 'forget', actor: ACTOR, reason: REASON,
    userId: row.user_id, persona: row.persona ?? null, slotId: row.slot_id ?? null,
    before, source: row.source ?? null,
  })
  console.log(`⭐ retired ${id.slice(0, 8)} and wrote its audit row`)
}

console.log('\n── AFTER ──────────────────────────────────────────────────────────────')
console.table(await state())
const [audit] = await q(
  `SELECT count(*)::int AS n FROM ${S}."log_memory_changes" WHERE memory_id = ANY($1::uuid[])`, [IDS])
console.log(`audit rows now: ${audit.n}`)
await pg.end(); await db.txn_memories.sequelize.close()
