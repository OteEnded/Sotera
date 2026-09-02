// ⭐⭐⭐ THE MANUAL REFLECTION TRIGGER — the real Gen-2 path, NOW. ⛔ DEV-ONLY, and dev-only BY SHAPE.
//
//   node test/pipeline/reflect-now.mjs --list                  what is eligible apart from the quiet timer
//   node test/pipeline/reflect-now.mjs --conversation <uuid>   run one, for real
//
// ── ⭐ WHAT MAKES IT DEV-ONLY ───────────────────────────────────────────────────────────────────
// It is a SCRIPT, not a route. There is no endpoint, no auth surface, nothing the server exposes and
// nothing a request can reach. ⛔ An admin route would have been a production surface with a permission
// check to get wrong; an operator at a shell is the whole authorization model here.
//
// ── ⛔⛔ WHAT IT BYPASSES — EXACTLY ONE THING ────────────────────────────────────────────────────
// Ote: *"The trigger should bypass only the scheduler eligibility/timing, not any Reflection behavior or
// safety boundary."*
//
//   ✅ BYPASSED   the QUIET TIMER (≥30 min since the last message) and the idle gate — i.e. `force: true`
//   ⛔ NOT bypassed  the prompt (generation 3, byte for byte)
//   ⛔ NOT bypassed  the offered tools — exactly [retain, decline_to_remember] at tool generation 2
//   ⛔ NOT bypassed  dispatch authorization — an unoffered call is still refused before it runs
//   ⛔ NOT bypassed  `nothing-new` — there must be REAL unreviewed material, so the watermark is real
//   ⛔ NOT bypassed  the watermark claim — one completed reflection per (conversation, watermark)
//   ⛔ NOT bypassed  the retention host, its gates, the store gates, disclosure, ownership
//   ⛔ NOT bypassed  `memory.reflectionEnabled` — that is a BEHAVIOUR switch, not a timing rule
//   ⛔ NOT bypassed  archived / non-evidential conversations
//
// ── ⛔⛔⛔ IT DOES NOT PASS A `turn` ─────────────────────────────────────────────────────────────
// `reflectOnConversation` accepts an injected `turn` so deterministic checks can drive it. ⚠️ THIS SCRIPT
// MUST NEVER USE IT. Ote: *"do not inject a retention decision or otherwise influence what she decides."*
// An injected turn IS the model's answer, so passing one would make the observation worthless — it would
// be measuring me. The real provider is called, and what she does with it is hers.
//
// ── ⭐ AND EVERY ROW SAYS A PERSON ASKED ────────────────────────────────────────────────────────
// `triggerSource: 'manual'` (042). ⛔ Manual runs are NOT in the P1 population: the instrument is
// identical, but a person chose the moment, and that is a different kind of observation.
//
// ⚠️ ONE HONEST DIFFERENCE FROM THE CRON, STATED RATHER THAN HIDDEN: this runs in its own process, so the
// live server's steering registry is not visible and `preemptedNow()` cannot see an in-flight chat turn.
// ⇒ the script checks for a recent turn ITSELF and refuses, rather than quietly losing the protection.

import { devPg, devSchema } from '../harness.mjs'

const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const argOf = (flag) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : null
}
const LIST = process.argv.includes('--list')
const CONVO = argOf('--conversation')

try {
  const { loadConfig, setDB } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const { initSettings } = await import('../../Backend/app/settings/index.js')
  const config = loadConfig()
  const db = await initDB(); setDB(db); await initSettings(db)
  const fastify = { db, config, log: console }

  // ⚠️⚠️ HOST SERVICES ARE REGISTRATIONS. The tool COMPONENTS install themselves when `runtime.js` is
  // imported; the SERVICES they bind to do not — and without them `retain` is offered, dispatches, and
  // answers *"required service is not available"*. That asymmetry has cost four harnesses now.
  const { initRetention } = await import('../../Backend/app/components/retention-host.js')
  const { initLesson } = await import('../../Backend/app/components/lesson-host.js')
  const { initOwnMemory } = await import('../../Backend/app/components/own-memory-host.js')
  const { initCorrections } = await import('../../Backend/app/components/corrections-host.js').catch(() => ({ initCorrections: null })) ?? {}
  const { initToolLog } = await import('../../Backend/app/audit/tool-log.js')
  const { attachToolAudit } = await import('../../Backend/app/components/runtime.js')
  initRetention(); initLesson(); initOwnMemory(); initToolLog(fastify, attachToolAudit)
  if (typeof initCorrections === 'function') initCorrections()

  const { reflectOnConversation } = await import('../../Backend/app/components/reflection-lifecycle-host.js')
  const { REFLECTION_TOOLS, REFLECTION_WRITE_TOOLS, REFLECTION_GENERATION, REFLECTION_TOOL_GENERATION } =
    await import('../../Backend/app/components/reflection-lifecycle.js')
  const { DISPATCH_GENERATION } = await import('../../Backend/app/components/tool-authorization.js')

  // ── ⛔ THE BEHAVIOUR SWITCH IS NOT A TIMING RULE ───────────────────────────────────────────────
  if (config?.memory?.reflectionEnabled !== true) {
    console.error('\n⛔ memory.reflectionEnabled is not true. This trigger bypasses TIMING, never a behaviour switch.\n')
    process.exit(2)
  }

  // ── ⚠️ THE PREEMPTION PROTECTION, REBUILT FOR A SEPARATE PROCESS ──────────────────────────────
  // The cron yields to an interactive turn through the steering registry, which lives in the SERVER's
  // process and is empty here. ⭐ So the same protection is asked of the database instead.
  const busy = await one(
    `select role, extract(epoch from (now() - created_at))::int as ago
       from ${S}.txn_messages order by created_at desc limit 1`)
  if (busy && busy.role === 'user' && busy.ago < 180) {
    console.error(`\n⛔ A user message landed ${busy.ago}s ago with no answer yet — a turn may be in flight.`)
    console.error('   ⭐ Interaction has absolute priority. Try again once it has finished.\n')
    process.exit(3)
  }

  console.log('\n⭐ MANUAL REFLECTION TRIGGER  ·  the real path, minus the quiet timer\n')
  console.log(`  prompt generation   ${REFLECTION_GENERATION}   (unchanged, byte for byte)`)
  console.log(`  tool generation     ${REFLECTION_TOOL_GENERATION}   offered: ${REFLECTION_TOOLS.length} tools`)
  console.log(`  write surface       [${REFLECTION_WRITE_TOOLS.join(', ')}]`)
  console.log(`  dispatch            generation ${DISPATCH_GENERATION} — enforced`)
  console.log(`  trigger_source      manual   ⛔ NOT part of the P1 population`)

  // ── THE CANDIDATES · real eligibility, minus only the quiet window ────────────────────────────
  // ⛔ This does NOT reimplement the gate. It narrows to conversations the cron would also consider —
  // evidential, not archived, inside the lookback — and lets `isReadyToReflect` inside
  // `reflectOnConversation` make the actual decision. Two copies of an eligibility rule is how they stop
  // agreeing, and this file already carries that lesson in its own header.
  const candidates = await q(`
    SELECT c.id::text AS id, c.title, c.updated_at::timestamptz(0)::text AS last_activity,
           (SELECT count(*)::int FROM ${S}.txn_messages m WHERE m.conversation_id = c.id) AS messages,
           coalesce((SELECT max(r.up_to_rolling_id) FROM ${S}.log_conversation_revisits r
                      WHERE r.conversation_id = c.id AND r.outcome = 'completed'), 0) AS watermark,
           (SELECT max(m.rolling_id) FROM ${S}.txn_messages m WHERE m.conversation_id = c.id) AS top
      FROM ${S}.txn_conversations c
     WHERE c.archived_at IS NULL
       AND c.updated_at > now() - interval '48 hours'
     ORDER BY c.updated_at ASC`)
  const withNew = candidates.filter((c) => Number(c.top ?? 0) > Number(c.watermark ?? 0) && Number(c.messages) >= 4)

  if (LIST || !CONVO) {
    console.log(`\n  ── eligible apart from the quiet timer: ${withNew.length} ──\n`)
    for (const c of withNew) {
      console.log(`  ${c.id}  msgs=${String(c.messages).padStart(3)}  watermark=${c.watermark}→${c.top}  ${c.last_activity}  ${String(c.title ?? '').slice(0, 40)}`)
    }
    if (!CONVO) console.log('\n  ⓘ Pass one with --conversation <uuid>. ⛔ Nothing was run.\n')
    if (!CONVO) process.exit(0)
  }

  const chosen = withNew.find((c) => c.id === CONVO)
  if (!chosen) {
    console.error(`\n⛔ ${CONVO} is not eligible (archived, outside the lookback, too thin, or nothing new since its watermark).`)
    console.error('   ⭐ The trigger bypasses the quiet TIMER only — a real conversation with real new material is required.\n')
    process.exit(4)
  }

  console.log(`\n  running on ${chosen.id}  (watermark ${chosen.watermark} → ${chosen.top})`)
  console.log('  ⛔ no injected turn — the real provider answers, and the decision is hers.\n')
  const started = Date.now()
  // ⭐⭐ `force: true` — the ONE bypass. ⛔ NO `turn`. ⭐ `triggerSource: 'manual'`.
  const r = await reflectOnConversation(fastify, {
    conversationId: chosen.id,
    force: true,
    triggerSource: 'manual',
  })
  console.log(`  → ${JSON.stringify({
    ok: r?.ok ?? false, skipped: r?.skipped ?? false, reason: r?.reason ?? null,
    toolsUsed: r?.toolsUsed ?? [], wrote: r?.wroteMemoryIds ?? [], clipped: r?.clipped ?? null,
    seconds: Math.round((Date.now() - started) / 1000),
  }, null, 2)}`)

  if (r?.reflectionId) {
    const row = await one(
      `select trigger_source, tool_generation, dispatch_generation, tools_used, tools_refused,
              wrote_memory_id::text as wrote, length(text) as chars, text
         from ${S}.log_conversation_revisits where id = $1`, [r.reflectionId])
    console.log(`\n  ── the row ──`)
    console.log(`  trigger=${row.trigger_source}  tool_gen=${row.tool_generation}  dispatch_gen=${row.dispatch_generation}`)
    console.log(`  used=[${(row.tools_used ?? []).join(' ')}]  refused=[${(row.tools_refused ?? []).join(' ')}]  wrote=${row.wrote ?? '—'}`)
    const receipts = await q(
      `select state, kind, store, why from ${S}.log_retention_decisions
        where conversation_id = $1 and created_at >= now() - interval '10 minutes' order by created_at`, [chosen.id])
    for (const d of receipts) console.log(`  receipt  ${d.state}  ${d.kind ?? '—'}  ${d.store ?? '—'}  ${String(d.why ?? '').slice(0, 70)}`)
    console.log(`\n  ── what she said (${row.chars} chars) ──\n`)
    console.log(row.text)
    console.log('')
  }
} finally {
  await pg.end()
}
