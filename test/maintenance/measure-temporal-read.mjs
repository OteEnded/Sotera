// ⭐⭐⭐ ② · MEASURE THE READ — can `recall_memory` answer a TEMPORAL question? ⛔ READ-ONLY.
//
//   node test/maintenance/measure-temporal-read.mjs
//
// Ote, 2026-09-05: *"Can recall_memory actually answer a temporal question, or must it refuse rather
// than silently perform semantic search?"* ⇒ measurement and derivation only, ⛔ no implementation.
//
// ⛔⛔ IT USES `search()`, ⛔ NEVER `recall()`. `recall()` REINFORCES what it returns (touch + tier hot),
// so measuring with it would rewrite the very ranking signal being measured. `search()` is documented
// read-only — "does NOT reinforce — for inspection/tools". ⚠️ The embedder is called (a read), nothing
// is written.
import { devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryV2 } from '../../Backend/app/components/memory-v2-host.js'
import { components } from '@ote/memory'

const S = `"${devSchema()}"`
const OTE = '69499bed-ab95-41f9-ac28-e0617b33b09d'
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const q = async (s, p = []) => (await pg.query(s, p)).rows
const line = (t) => console.log(`\n${'═'.repeat(100)}\n${t}\n${'═'.repeat(100)}`)

// The five probes Ote named, plus two CONTROLS that isolate the temporal word from the topic word.
const PROBES = [
  { id: 'P1', q: 'what did we talk about today?', want: 'said = today' },
  { id: 'P2', q: 'what did I tell you yesterday?', want: 'said = yesterday' },
  { id: 'P3', q: 'what did we discuss on August 26?', want: 'said = 2026-08-26' },
  { id: 'P4', q: 'what did you learn from me this week?', want: 'recorded within 7 days' },
  { id: 'P5', q: 'what do you remember about instruments?', want: 'topic: instruments (NOT temporal)' },
  { id: 'C1', q: 'what did we talk about?', want: 'CONTROL: P1 with the temporal word REMOVED' },
  { id: 'C2', q: 'what did we talk about in 1847?', want: 'CONTROL: an IMPOSSIBLE date' },
]

// ══ 1 · THE TOOL BOUNDARY — what can a model even ASK for? ═══════════════════════════════════════
line('1 · THE MODEL-FACING TOOL BOUNDARY — introspected from the real tool objects, ⛔ not from prose')
// ⚠️ THE NAME LIVES ON `manifest`, NOT ON THE TOOL. The first version of this probe read `c.name`,
// matched NOTHING, and printed "⛔ NONE" for every tool — the right answer for the wrong reason, which
// is the shape of green that proves nothing. ⇒ the loop below asserts it found each tool.
const tools = components.filter((c) => c?.parameters)
console.log(`  ⭐ PRECONDITION — memory tools discovered: ${tools.length} (⛔ 0 would make everything below vacuous)`)
for (const t of tools) {
  const name = t.manifest?.name ?? t.manifest?.id ?? '(unnamed)'
  const props = Object.keys(t.parameters.properties ?? {})
  const temporal = props.filter((p) => /date|time|since|until|before|after|when|day|range|window/i.test(p))
  console.log(`  ${name.padEnd(24)} params=[${props.join(', ')}]`
    + ` required=[${(t.parameters.required ?? []).join(',')}]`
    + ` additionalProperties=${t.parameters.additionalProperties}`
    + `  ⇒ TIME params: ${temporal.length ? temporal.join(', ') : '⛔ NONE'}`)
}

// ══ 2 · WHAT THE LEXICAL ARM ACTUALLY ASKS ══════════════════════════════════════════════════════
line("2 · THE LEXICAL ARM — websearch_to_tsquery('english', query), verbatim from the store's SQL")
for (const p of PROBES) {
  const [r] = await q('SELECT websearch_to_tsquery($2, $1)::text AS tsq', [p.q, 'english'])
  console.log(`  ${p.id} ${JSON.stringify(p.q)}\n     → ${r.tsq}`)
}

// ══ 3 · THE TRUE TEMPORAL SHAPE OF THE CORPUS ═══════════════════════════════════════════════════
line('3 · THE CORPUS BY DATE — what a REAL temporal filter would have to work with')
console.log('memories visible to Ote, by SAID date (source turn) and RECORDED date (row):')
console.table(await q(`
  SELECT coalesce((msg.created_at AT TIME ZONE 'Asia/Bangkok')::date::text, '(no source turn)') AS said_on,
         (m.created_at AT TIME ZONE 'Asia/Bangkok')::date::text AS recorded_on,
         count(*)::int AS rows
    FROM ${S}."txn_memories" m
    LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE m.invalid_at IS NULL AND m.expired_at IS NULL AND m.user_id = $1::uuid
   GROUP BY 1, 2 ORDER BY 1 DESC, 2 DESC`, [OTE]))

console.log('\ncoverage — can a `said` date be established at all?')
console.table(await q(`
  SELECT count(*)::int AS live,
         count(m.source_message_id)::int AS can_say_SAID,
         (count(*) - count(m.source_message_id))::int AS ⛔_said_UNKNOWABLE,
         round(100.0 * count(m.source_message_id) / nullif(count(*),0))::int AS pct_said
    FROM ${S}."txn_memories" m
   WHERE m.invalid_at IS NULL AND m.expired_at IS NULL AND m.user_id = $1::uuid`, [OTE]))

// ══ 4 · THE THIRD CLOCK — what the RANKER calls "recency" ════════════════════════════════════════
line('4 · ⭐⭐ THE THIRD CLOCK — the ranker\'s `recency` is last_access ?? created_at, ⛔ never said_on')
console.table(await q(`
  SELECT CASE WHEN m.last_access IS NULL THEN 'a · never accessed → recency = RECORDED date'
              WHEN abs(extract(epoch FROM (m.last_access - m.created_at))) < 300 THEN 'b · accessed ≈ when recorded'
              ELSE 'c · ⚠️ accessed LATER — recency has drifted off both said and recorded' END AS clock,
         count(*)::int AS rows,
         max(round((extract(epoch FROM (m.last_access - coalesce(msg.created_at, m.created_at)))/86400)::numeric,1)) AS max_drift_days
    FROM ${S}."txn_memories" m
    LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
   WHERE m.invalid_at IS NULL AND m.expired_at IS NULL AND m.user_id = $1::uuid
   GROUP BY 1 ORDER BY 1`, [OTE]))

// ══ 5 · THE CONVERSATION LAYER — is this even a MEMORY question? ═════════════════════════════════
line('5 · ⭐⭐⭐ TURNS vs MEMORIES per day — what "what did we talk about today?" is actually asking about')
console.table(await q(`
  WITH t AS (
    SELECT (msg.created_at AT TIME ZONE 'Asia/Bangkok')::date AS d, count(*)::int AS turns
      FROM ${S}."txn_messages" msg JOIN ${S}."txn_conversations" cv ON cv.id = msg.conversation_id
     WHERE cv.user_id = $1::uuid AND msg.created_at > now() - interval '20 days'
     GROUP BY 1),
  mm AS (
    SELECT (msg.created_at AT TIME ZONE 'Asia/Bangkok')::date AS d, count(*)::int AS memories_said_that_day
      FROM ${S}."txn_memories" m JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
     WHERE m.invalid_at IS NULL AND m.expired_at IS NULL AND m.user_id = $1::uuid
     GROUP BY 1)
  SELECT to_char(coalesce(t.d, mm.d),'YYYY-MM-DD') AS day, coalesce(t.turns,0) AS turns,
         coalesce(mm.memories_said_that_day,0) AS memories
    FROM t FULL OUTER JOIN mm ON mm.d = t.d ORDER BY 1 DESC`, [OTE]))

// ══ 6 · THE ACTUAL READ — run search() and see what comes back ═══════════════════════════════════
line('6 · ⭐⭐⭐ THE REAL READ — mem.search(probe, {limit:8}), the exact call `recall_memory` makes')
const mem = buildMemoryV2(fastify, { userId: OTE })
const today = (await q("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date::text AS d"))[0].d
const results = new Map()
for (const p of PROBES) {
  const r = await mem.search(p.q, { limit: 8 })
  results.set(p.id, r.matches)
  const dates = r.matches.map((m) => `${m.when?.date ?? '??'}/${m.when?.basis?.[0] ?? '?'}`)
  const fromToday = r.matches.filter((m) => m.when?.date === today).length
  console.log(`\n  ${p.id} ${JSON.stringify(p.q)}   [wanted: ${p.want}]`)
  console.log(`     returned ${r.count}   dates: ${dates.join(' ')}`)
  console.log(`     ⇒ of ${r.count} results, ${fromToday} are actually from today (${today})`)
  for (const m of r.matches.slice(0, 4)) {
    console.log(`       · ${m.when?.date} ${String(m.when?.basis).padEnd(8)} rel=${m.relevance.toFixed(3)} `
      + `imp=${m.importance} ${JSON.stringify(String(m.value ?? m.content).slice(0, 62))}`)
  }
}

// ══ 7 · THE EQUIVALENCE — is the temporal word doing ANY temporal work? ══════════════════════════
line('7 · ⭐⭐⭐ THE EQUIVALENCE TEST — does removing / changing the temporal word change the ANSWER?')
const ids = (k) => (results.get(k) ?? []).map((m) => m.id)
const jac = (a, b) => {
  const A = new Set(a); const B = new Set(b)
  const i = [...A].filter((x) => B.has(x)).length
  return { overlap: i, union: new Set([...A, ...B]).size, same: i === A.size && A.size === B.size }
}
for (const [a, b, why] of [
  ['P1', 'C1', '"today" REMOVED — if the word carried a constraint, the sets must differ'],
  ['P1', 'C2', '"today" → "in 1847" — an IMPOSSIBLE date must return nothing, if dates are read'],
  ['P1', 'P2', '"today" vs "yesterday" — two DIFFERENT days must not give the same answer'],
]) {
  const r = jac(ids(a), ids(b))
  console.log(`  ${a} vs ${b}: ${r.overlap} shared of ${r.union} union — identical set: ${r.same ? '⛔ YES' : 'no'}   (${why})`)
}
console.log(`\n  ⭐ ORDER check — P1 vs C1 returned in the SAME ORDER: `
  + `${JSON.stringify(ids('P1')) === JSON.stringify(ids('C1')) ? '⛔ YES (byte-identical)' : 'no'}`)

// ══ 8 · WHAT THE HONEST ANSWER WOULD HAVE BEEN ══════════════════════════════════════════════════
line('8 · THE ANSWER A REAL TEMPORAL READ WOULD GIVE — for comparison with §6')
for (const [label, sql] of [
  ['said = today', `msg.created_at AT TIME ZONE 'Asia/Bangkok' >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')`],
  ['said = yesterday', `(msg.created_at AT TIME ZONE 'Asia/Bangkok')::date = ((now() AT TIME ZONE 'Asia/Bangkok')::date - 1)`],
  ['said = 2026-08-26', `(msg.created_at AT TIME ZONE 'Asia/Bangkok')::date = DATE '2026-08-26'`],
  ['recorded within 7 days', `m.created_at > now() - interval '7 days'`],
]) {
  const rows = await q(`
    SELECT count(*)::int AS n FROM ${S}."txn_memories" m
      LEFT JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
     WHERE m.invalid_at IS NULL AND m.expired_at IS NULL AND m.user_id = $1::uuid AND ${sql}`, [OTE])
  console.log(`  ${label.padEnd(24)} → ${rows[0].n} memories`)
}

// ══ 9 · ⭐⭐⭐ THE INCIDENT, RECONSTRUCTED FROM THE LOGS ══════════════════════════════════════════
// ⚠️ THE PREMISE OF ② DOES NOT SURVIVE THIS SECTION — see DERIVATION_SOTERA_TEMPORAL_READ §6.
line('9 · THE 2026-09-04 INCIDENT — every tool call, against the turn timeline (⛔ content not printed)')
const CONV = 'c5535976-2ea9-420d-9e15-3105eb517e67'
console.log('tool calls, in order:')
console.table(await q(`
  SELECT to_char(created_at AT TIME ZONE 'Asia/Bangkok','HH24:MI:SS') AS at, tool, origin, arg_keys, ok
    FROM ${S}."log_tool_calls" WHERE conversation_id = $1::uuid ORDER BY created_at`, [CONV]))
console.log('turn shape (⛔ lengths and role only):')
console.table(await q(`
  SELECT to_char(created_at AT TIME ZONE 'Asia/Bangkok','HH24:MI:SS') AS at, role, length(content) AS chars
    FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid ORDER BY created_at`, [CONV]))

console.log('\n⭐ THE TEMPORAL INSTRUMENT SHE DID NOT USE — retrieve_conversations, and whether it works:')
console.table(await q(`
  SELECT tool, arg_keys::text AS axes, count(*)::int AS calls, count(*) FILTER (WHERE ok)::int AS ok,
         to_char(max(created_at) AT TIME ZONE 'Asia/Bangkok','MM-DD') AS last_used
    FROM ${S}."log_tool_calls"
   WHERE tool = 'retrieve_conversations' AND ('between' = ANY(arg_keys) OR 'in' = ANY(arg_keys))
   GROUP BY 1, 2 ORDER BY 3 DESC`))

// ══ 10 · ⭐⭐⭐ WAS retrieve_conversations ADVERTISED IN THE INCIDENT TURN? ═════════════════════════
// Ote: *"distinguish advertised + not chosen / advertised + withheld by authorization / not advertised."*
// ⛔ The persisted trace is a COUNT and two labels, never names (S1 chose that deliberately). So the set
// is RECONSTRUCTED: the same assembly function, the incident's own inputs, on the same registry — the
// Sotera process serving :8210 started 2026-09-03 22:50, before the incident, and no reload has happened.
line('10 · THE ADVERTISED TOOLSET — persisted trace vs. reconstruction from the same registry')
const [inc] = await q(`
  SELECT settings->>'toolsEnabled' AS tools_on, settings->>'useMemory' AS use_memory, settings->>'skill' AS skill,
         (SELECT array_agg(DISTINCT m.metrics->'toolset') FROM ${S}."txn_messages" m
           WHERE m.conversation_id = c.id AND m.role = 'assistant' AND m.metrics ? 'toolset') AS traces
    FROM ${S}."txn_conversations" c WHERE c.id = $1::uuid`, [CONV])
console.log(`  conversation settings: toolsEnabled=${inc.tools_on} useMemory=${inc.use_memory} skill=${inc.skill}`)
console.log(`  persisted toolset traces (distinct, all assistant turns): ${JSON.stringify(inc.traces)}`)
const { assembleToolDefs } = await import('../../Backend/app/chat/tool-defs.js')
const { toolDefinitions, memoryToolNames } = await import('../../Backend/app/components/runtime.js')
const skills = await q(`SELECT slug FROM ${S}."mst_skills" WHERE enabled`)
const dest = Object.entries(config?.advice?.destinations ?? {}).filter(([, d]) => d?.enabled !== false).map(([k]) => k)
const { defs, trace } = assembleToolDefs({
  skill: null, toolsOn: true, interactiveTurn: true, invocableSkills: skills.map((s) => ({ id: s.slug })),
  oneShotAllowedTools: null, useMemory: true, path: 'none', adviceDestinations: dest,
})
const names = (defs || []).map((d) => d.function?.name)
const persisted = (inc.traces || []).map((t) => t?.count)
const countMatch = persisted.length > 0 && persisted.every((n) => n === trace.count)
console.log(`  reconstructed: count=${trace.count} (registry ${toolDefinitions()?.length}, +infra) · persisted count(s)=${persisted.join(',')}`
  + ` · ${countMatch ? '✅ EXACT MATCH' : '⛔ MISMATCH — the reconstruction is not the incident set'}`)
console.log(`  retrieve_conversations in the reconstructed set: ${names.includes('retrieve_conversations') ? '✅ YES' : '⛔ NO'}`
  + ` · search_conversations: ${names.includes('search_conversations') ? '✅ YES' : '⛔ NO'}`)
console.log(`  a memory.v2 consumer (strippable by the memory gate)? ${memoryToolNames().has('retrieve_conversations') ? 'yes' : '⛔ no — and useMemory was on anyway'}`)
console.log('  ⓘ chat dispatch calls runTool() with no authorizeToolCall ⇒ "withheld by authorization" is not a chat mechanism')
console.log(`  ⇒ VERDICT: ${countMatch && names.includes('retrieve_conversations') ? 'ADVERTISED + NOT CHOSEN' : 'UNRESOLVED — do not conclude'}`)

await pg.end()
await db.sequelize?.close?.()
console.log('\n⛔ READ-ONLY. Nothing was written; search() does not reinforce.')
process.exit(0)
