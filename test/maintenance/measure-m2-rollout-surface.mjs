// ⭐ MEASUREMENT for the M2 rollout contract. ⛔ READ-ONLY. Changes nothing, binds nothing.
//
//   node test/maintenance/measure-m2-rollout-surface.mjs
//
// The rollout questions all reduce to: WHICH SLOTS COULD BE GOVERNED, WHAT WOULD ACTUALLY CHANGE IF THEY
// WERE, and WHOSE WRITES WOULD MEET THE GATE. ⭐ Only an UPDATE is governed, so a slot that has never been
// superseded would be governed VACUOUSLY — that distinction is the whole of rollout prioritisation.
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const c = devPg(); await c.connect()
const q = async (sql, p = []) => (await c.query(sql, p)).rows
const show = async (label, sql, p = []) => { console.log(`\n── ${label}`); console.table(await q(sql, p)) }

console.log('══ 1 · THE ADDRESS SPACE — namespaces, and which are declared slot-governed ══')
await show('namespaces in use vs declared',
  `SELECT s.namespace, count(*)::int AS slots,
          count(*) FILTER (WHERE s.question_id IS NOT NULL)::int AS bound,
          coalesce(n.slot_governed::text, '(undeclared)') AS slot_governed,
          coalesce(n.read_default, '-') AS read_default
     FROM ${S}."mst_slots" s
     LEFT JOIN ${S}."mst_namespace_declarations" n ON n.namespace_key = s.namespace
    GROUP BY s.namespace, n.slot_governed, n.read_default ORDER BY slots DESC`)

console.log('══ 2 · WHAT WOULD ACTUALLY CHANGE — only an UPDATE is governed ══')
await show('slots by whether they have EVER been superseded (⭐ the non-vacuous set)',
  `SELECT (sup.n > 0) AS has_ever_updated, count(*)::int AS slots, sum(sup.n)::int AS total_supersedes
     FROM ${S}."mst_slots" s
     JOIN LATERAL (SELECT count(*)::int AS n FROM ${S}."txn_memories" m
                    WHERE m.slot_id = s.id AND m.supersedes_id IS NOT NULL) sup ON true
    GROUP BY 1 ORDER BY 1 DESC`)
await show('the slots that DO get replaced — the only ones a bind would change',
  `SELECT s.canonical_label, s.entity, s.namespace, u.username AS room,
          count(*) FILTER (WHERE m.supersedes_id IS NOT NULL)::int AS supersedes,
          count(*)::int AS rows_total, max(m.created_at)::date AS last_write
     FROM ${S}."mst_slots" s
     JOIN ${S}."txn_memories" m ON m.slot_id = s.id
     LEFT JOIN ${S}."mst_users" u ON u.id = s.user_id
    GROUP BY s.id, s.canonical_label, s.entity, s.namespace, u.username
   HAVING count(*) FILTER (WHERE m.supersedes_id IS NOT NULL) > 0
    ORDER BY supersedes DESC LIMIT 15`)

console.log('══ 3 · PRECONDITION — the exactly-one-live-row invariant, TODAY ══')
await show('slots holding MORE than one live row (⛔ a bind would freeze the ambiguity)',
  `SELECT count(*)::int AS slots_with_multiple_live FROM (
     SELECT m.slot_id FROM ${S}."txn_memories" m
      WHERE m.slot_id IS NOT NULL AND m.invalid_at IS NULL AND m.expired_at IS NULL
      GROUP BY m.slot_id HAVING count(*) > 1) x`)

console.log('══ 4 · WHOSE WRITES WOULD MEET THE GATE — by producer ══')
await show('every writer that has ever produced a SUPERSEDE, by source',
  `SELECT coalesce(m.source, '(null)') AS source, coalesce(m.author::text, '-') AS author,
          count(*)::int AS supersedes, count(DISTINCT m.slot_id)::int AS slots
     FROM ${S}."txn_memories" m WHERE m.supersedes_id IS NOT NULL
    GROUP BY 1, 2 ORDER BY supersedes DESC`)
await show('…and which KINDS ever supersede (⭐ cards/episodic are Dreaming/parked territory)',
  `SELECT coalesce(kind, '(null)') AS kind, count(*)::int AS supersedes,
          count(*) FILTER (WHERE slot_id IS NOT NULL)::int AS with_a_slot
     FROM ${S}."txn_memories" WHERE supersedes_id IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`)

console.log('══ 5 · THE CURRENT GOVERNED STATE ══')
await show('bound slots, and the pins that exist',
  `SELECT s.canonical_label, s.entity, s.namespace, u.username AS room, qq.question_key,
          (SELECT count(*)::int FROM ${S}."txn_memories" m
            WHERE m.slot_id = s.id AND m.question_id_at_admission IS NOT NULL) AS pinned_rows
     FROM ${S}."mst_slots" s
     JOIN ${S}."mst_slot_questions" qq ON qq.id = s.question_id
     LEFT JOIN ${S}."mst_users" u ON u.id = s.user_id`)

await c.end()
