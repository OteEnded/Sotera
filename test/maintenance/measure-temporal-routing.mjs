// ⭐⭐⭐ ② · MEASURE THE ROUTING — which questions actually reach which READ tool. ⛔ READ-ONLY.
//
//   node test/maintenance/measure-temporal-routing.mjs
//
// Ote, 2026-09-05: *"I want actual examples from the corpus, not a regex designed around this one
// sentence."* ⇒ this starts from BEHAVIOUR, not from a pattern: every read-tool call she made in chat is
// joined to the user turn that immediately preceded it, so the question shapes are hers and the routing
// is what she actually did. Only then does it look for conversation-history-shaped questions that went
// somewhere else.
//
// ⛔ Ote's rooms only. Harness rooms (`zz_`), probe conversations and evidence-excluded conversations are
// out — a fresh harness conversation is not a fresh corpus (memory: harness-runs-become-retrieval-leads).
import { devPg, devSchema } from '../harness.mjs'

const S = `"${devSchema()}"`
const OTE = '69499bed-ab95-41f9-ac28-e0617b33b09d'
const pg = devPg(); await pg.connect()
const q = async (s, p = []) => (await pg.query(s, p)).rows
const line = (t) => console.log(`\n${'═'.repeat(100)}\n${t}\n${'═'.repeat(100)}`)
const clip = (s, n = 150) => JSON.stringify(String(s ?? '').replace(/\s+/g, ' ').slice(0, n))

// The population: Ote's real conversations.
const SCOPE = `c.user_id = '${OTE}'::uuid AND c.excluded_from_evidence_at IS NULL
  AND coalesce((c.settings->>'probe')::boolean, false) = false AND coalesce(c.title, '') NOT LIKE 'zz_%'`

line('0 · THE POPULATION')
console.table(await q(`
  SELECT count(DISTINCT c.id)::int AS conversations, count(m.id)::int AS user_turns,
         count(m.id) FILTER (WHERE m.content LIKE '%?%' OR m.content ~ '(ไหม|มั้ย|อะไร|หรอ|เหรอ|ยังไง|เมื่อไหร่)')::int AS question_shaped
    FROM ${S}."txn_conversations" c JOIN ${S}."txn_messages" m ON m.conversation_id = c.id AND m.role = 'user'
   WHERE ${SCOPE}`))

// ══ 1 · BEHAVIOUR FIRST — every chat read-tool call, joined to the user turn just before it ═══════
line('1 · ⭐⭐⭐ WHAT SHE ACTUALLY ROUTED WHERE — read-tool call → the user turn immediately before it')
const READ_TOOLS = ['recall_memory', 'list_memories', 'retrieve_conversations', 'search_conversations', 'recall_own_history']
const calls = await q(`
  SELECT t.tool, t.arg_keys, to_char(t.created_at AT TIME ZONE 'Asia/Bangkok','MM-DD HH24:MI') AS at,
         (SELECT m.content FROM ${S}."txn_messages" m
           WHERE m.conversation_id = t.conversation_id AND m.role = 'user' AND m.created_at <= t.created_at
           ORDER BY m.created_at DESC LIMIT 1) AS user_turn
    FROM ${S}."log_tool_calls" t JOIN ${S}."txn_conversations" c ON c.id = t.conversation_id
   WHERE t.origin = 'chat' AND t.tool = ANY($1::text[]) AND ${SCOPE}
   ORDER BY t.tool, t.created_at`, [READ_TOOLS])
const byTool = new Map()
for (const r of calls) { if (!byTool.has(r.tool)) byTool.set(r.tool, []); byTool.get(r.tool).push(r) }
for (const tool of READ_TOOLS) {
  const rows = byTool.get(tool) ?? []
  console.log(`\n── ${tool} · ${rows.length} chat calls in Ote's rooms`)
  // ⓘ Every distinct preceding turn, so the shapes are the corpus's and not a sample I chose.
  const seen = new Set()
  for (const r of rows) {
    const key = String(r.user_turn ?? '').slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`   ${r.at}  ${JSON.stringify(r.arg_keys).padEnd(22)} ← ${clip(r.user_turn)}`)
  }
}

// ══ 2 · THE OTHER DIRECTION — conversation-history-shaped questions, and where they went ═══════════
line('2 · ⭐⭐ QUESTIONS ABOUT WHAT WAS SAID/DISCUSSED — and which tool (if any) the reply used')
// ⚠️ A DELIBERATELY WIDE NET, NOT A CLASSIFIER: any question-shaped user turn that mentions talking,
// discussing, saying, telling, mentioning, a conversation, or a relative day. Over-inclusive on purpose —
// the point is to READ them, not to route on them.
const cand = await q(`
  WITH u AS (
    SELECT m.id, m.conversation_id, m.created_at, m.content,
           lead(m.id) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS next_id
      FROM ${S}."txn_conversations" c JOIN ${S}."txn_messages" m ON m.conversation_id = c.id
     WHERE ${SCOPE})
  SELECT to_char(u.created_at AT TIME ZONE 'Asia/Bangkok','MM-DD HH24:MI') AS at, u.content,
         a.role AS next_role,
         (SELECT array_agg(DISTINCT x->>'name') FROM jsonb_array_elements(coalesce(a.tool_calls,'[]'::jsonb)) x) AS reply_tools
    FROM u LEFT JOIN ${S}."txn_messages" a ON a.id = u.next_id
   WHERE (u.content LIKE '%?%' OR u.content ~ '(ไหม|มั้ย|อะไร|หรอ|เหรอ|เมื่อไหร่)')
     AND u.content ~* '(talk|talked|discuss|said|say |told|tell me|mention|conversation|chat|yesterday|today|last time|earlier|this week|last week|เมื่อวาน|วันนี้|คุยกัน|พูดถึง|เคยบอก)'
   ORDER BY u.created_at`)
console.log(`candidates: ${cand.length}\n`)
for (const r of cand) {
  const tools = (r.reply_tools ?? []).filter(Boolean)
  console.log(`   ${r.at}  → ${tools.length ? tools.join(',') : '(no tool)'}`.padEnd(58) + ` ${clip(r.content, 130)}`)
}

// ══ 3 · THE SHAPE OF THE PRECEDING TURN, PER TOOL ══════════════════════════════════════════════════
line('3 · ⓘ per tool: is the preceding turn even a question? (⛔ a count, so the reading above can be checked)')
console.table(await q(`
  WITH x AS (
    SELECT t.tool,
           (SELECT m.content FROM ${S}."txn_messages" m
             WHERE m.conversation_id = t.conversation_id AND m.role = 'user' AND m.created_at <= t.created_at
             ORDER BY m.created_at DESC LIMIT 1) AS u
      FROM ${S}."log_tool_calls" t JOIN ${S}."txn_conversations" c ON c.id = t.conversation_id
     WHERE t.origin = 'chat' AND t.tool = ANY($1::text[]) AND ${SCOPE})
  SELECT tool, count(*)::int AS calls,
         count(*) FILTER (WHERE u LIKE '%?%' OR u ~ '(ไหม|มั้ย|อะไร|หรอ|เหรอ)')::int AS after_a_question,
         count(*) FILTER (WHERE u ~* '(yesterday|today|last time|earlier|this week|เมื่อวาน|วันนี้)')::int AS after_a_relative_day_word,
         count(*) FILTER (WHERE u ~* '\\bmy\\b')::int AS after_my
    FROM x GROUP BY 1 ORDER BY 2 DESC`, [READ_TOOLS]))

await pg.end()
console.log('\n⛔ READ-ONLY. Nothing was written.')
process.exit(0)
