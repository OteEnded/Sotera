// ⭐⭐ THE BIND-CANDIDATE AUDIT — applies Ote's ratified containment rule to every slot, per slot.
//
//   node test/maintenance/audit-bind-candidates.mjs
//
// ⛔ READ-ONLY. Binds nothing, changes nothing.
//
// ── ⭐⭐⭐ THE RULE, RATIFIED 2026-09-04 ────────────────────────────────────────────────────────────
//     A slot may be bound only if EVERY writer that has ever superseded a row in it can declare a claim
//     kind AND name an occasion.
// ⛔ *"a subsystem probably won't touch it"* is not evidence. The slot's own write history is.
//
// ── ⛔ AND OTE'S FURTHER RULING, SAME DAY ──────────────────────────────────────────────────────────
//     *"Do not bind any slot that has historical `conversation:*` supersedes, and do not modify the
//      extractor to make it fit M2. Its inability to declare a kind is a real architectural boundary."*
// ⇒ a `conversation:*` supersede is DISQUALIFYING on its own, ⛔ regardless of anything else.
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (sql, p = []) => (await c.query(sql, p)).rows

// ⭐ WHICH SOURCES CAN DECLARE A KIND, as of today. ⛔ Derived from the code paths, stated here so the
// verdict below is auditable rather than asserted.
//   model-tool        ⭐ YES — `keep` / `remember_fact` gained `claimKind` today, proved through runTool
//   (null) / operator ⭐ YES — an operator act names its own kind and occasion
//   conversation:*    ⛔ NO  — the auto-extractor infers from prose; ⛔ Ote: do not modify it
//   reconcile:*       ⛔ NO  — a migration writer, and Rome is a fence
const VERDICT = (sources) => {
  const bad = sources.filter((s) => s.startsWith('conversation:') || s.startsWith('reconcile:'))
  if (bad.length) return { ok: false, why: `disqualified by ${bad.join(', ')}` }
  return { ok: true, why: 'every superseding writer can declare a kind and name an occasion' }
}

const rows = await q(
  `SELECT s.id::text, s.canonical_label, s.entity, s.namespace,
          coalesce(u.username, '(no room)') AS room,
          (s.question_id IS NOT NULL) AS bound,
          count(*) FILTER (WHERE m.supersedes_id IS NOT NULL)::int AS supersedes,
          count(*)::int AS rows_total,
          count(*) FILTER (WHERE m.invalid_at IS NULL AND m.expired_at IS NULL)::int AS live,
          array_remove(array_agg(DISTINCT CASE WHEN m.supersedes_id IS NOT NULL
              THEN coalesce(m.source, '(operator/null)') END), NULL) AS superseding_sources,
          array_remove(array_agg(DISTINCT coalesce(m.source, '(operator/null)')), NULL) AS all_sources,
          max(m.created_at) AS last_write
     FROM ${S}."mst_slots" s
     JOIN ${S}."txn_memories" m ON m.slot_id = s.id
     LEFT JOIN ${S}."mst_users" u ON u.id = s.user_id
    GROUP BY s.id, s.canonical_label, s.entity, s.namespace, u.username
   HAVING count(*) FILTER (WHERE m.supersedes_id IS NOT NULL) > 0
    ORDER BY supersedes DESC`)

console.log('══ EVERY SLOT THAT HAS EVER BEEN SUPERSEDED — the only non-vacuous bind candidates ══\n')
for (const r of rows) {
  const v = VERDICT(r.superseding_sources)
  console.log(`${r.bound ? '⭐ BOUND ' : (v.ok ? '✅ ELIGIBLE' : '⛔ EXCLUDED')}  ${r.entity} / ${r.canonical_label}`)
  console.log(`   room=${r.room}  slot=${r.id.slice(0, 8)}  supersedes=${r.supersedes}  rows=${r.rows_total} (live ${r.live})`)
  console.log(`   superseding writers: ${JSON.stringify(r.superseding_sources)}`)
  console.log(`   ⇒ ${v.why}\n`)
}

const agentDev = rows.filter((r) => r.room === 'agent_dev')
console.log('══ THE agent_dev SLOTS SPECIFICALLY (Ote asked for these individually) ══')
for (const r of agentDev) {
  const v = VERDICT(r.superseding_sources)
  const vals = await q(
    `SELECT value, (invalid_at IS NULL AND expired_at IS NULL) AS live, created_at::date AS d,
            coalesce(source, '(operator/null)') AS source, supersedes_id IS NOT NULL AS is_update
       FROM ${S}."txn_memories" WHERE slot_id = $1::uuid ORDER BY created_at`, [r.id])
  console.log(`\n── ${r.entity} / ${r.canonical_label}   ${r.bound ? '(ALREADY BOUND — the canary)' : ''}`)
  console.log(`   verdict: ${v.ok ? '✅ ELIGIBLE' : '⛔ EXCLUDED'} — ${v.why}`)
  console.table(vals)
}

const eligible = rows.filter((r) => !r.bound && VERDICT(r.superseding_sources).ok)
console.log(`\n⇒ NON-CANARY ELIGIBLE CANDIDATES: ${eligible.length}`)
for (const r of eligible) console.log(`   · ${r.room} · ${r.entity} / ${r.canonical_label}`)
await c.end()
