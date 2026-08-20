// THE REFLECTION LIFECYCLE — the occasion, the record, and the two facts Ote named out loud.
//
//   node checks/reflection-lifecycle-check.mjs
//
// ⭐⭐ THE GAP THIS PROVES CLOSED. Before migration 016, FOUR outcomes were all recorded as the same
// nothing — a `txn_memories` row that does not exist: *nothing was worth carrying forward* · *she could not
// determine whether anything was* · *she found something and was not authorized to keep it* · ⛔ **the
// reflection never happened at all.** Row-exists-vs-no-row separates the fourth from the rest with no
// vocabulary at all, which is why the two assertions Ote asked for are the two that matter:
//
//   1. *"a reflection that produces no memory must still create a log_reflections row"*
//   2. *"if she chooses to save something, the reflection record should point to the resulting memory
//       rather than duplicating its contents"*
//
// ⚠️ THE MODEL CALL IS INJECTED, NOTHING ELSE IS. `reflectOnConversation` takes a `turn` seam (the same
// shape `reflectScope` already uses), so what she "says" and which tools she calls are scripted — and the
// trigger gate, the tool execution, the id capture, the memory write lane and the row are all the real
// ones. A check that stubbed those would be asserting its own stub.
//
// ⛔ NEVER AS ROOT. Root is Ote's own account; residue from my testing has landed in his own panels before
// (*"wtf are thoese. is that you?"*). This runs as `agent_dev` and deletes everything it made.

import { readFileSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import {
  THE_REFLECTION_QUESTION, REFLECTION_GENERATION, REFLECTION_TOOLS, REFLECTION_WRITE_TOOLS,
  buildReflectionTurnPrompt, isReadyToReflect, shapeReflectionTranscript,
  readWrittenMemoryId, isDisclosureRefusal,
} from '../../Backend/app/components/reflection-lifecycle.js'
import { reflectOnConversation } from '../../Backend/app/components/reflection-lifecycle-host.js'

const { check, done } = makeChecker('reflection-lifecycle')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = devSchema()
// ⚠️ `(?<!:)` IS LOAD-BEARING. A naive `:t` → `$2` replacement also rewrites the second colon of a
// Postgres cast — `id::text` became `id:$2ext` and the query died with a bare "syntax error at or near :".
// The lookbehind refuses a colon that follows a colon; `` stops `:u` matching inside `:userId`.
const Q = async (sql, p = {}) => {
  const keys = Object.keys(p)
  // ⚠️ `\\b`, not `\b` — inside a template literal `\b` is the BACKSPACE character, so the regex matched
  // nothing and every placeholder sailed through to Postgres untouched.
  const text = keys.reduce((t, k, i) => t.replace(new RegExp(`(?<!:):${k}\\b`, 'g'), `$${i + 1}`), sql)
  return (await pg.query(text, keys.map((k) => p[k]))).rows
}

const MADE = { conversations: [], memories: [], reflections: [] }

try {
  // ── P · THE PROMPT IS THE RATIFIED SENTENCE, PINNED FROM AN INDEPENDENT LITERAL ──────────────────
  // ⭐ His words, typed again here on purpose. Comparing the module against itself proves nothing; this
  // literal and the module's are two independent copies of what he ratified, so drift needs two edits.
  const RATIFIED = 'Was there anything in this conversation that you want to carry forward? If so, tell me what and why. If not, say so.'
  ok(THE_REFLECTION_QUESTION === RATIFIED, 'P · ⭐⭐ the reflection question is his sentence, byte for byte')
  const built = buildReflectionTurnPrompt({ who: 'Ote', transcript: 'user: hi\nassistant: hello' })
  ok(built === `A conversation you had with Ote:\n\nuser: hi\nassistant: hello\n\n${RATIFIED}`,
    'P · ⭐ the WHOLE prompt is who + transcript + the question, and nothing else',
    'whole-string equality, not a banned-word scan — a word list catches only what I thought to ban')
  // ⛔ No slots, no ontology, no confidence vocabulary, no relation words, no routing menu.
  const forbidden = ['OUTCOME', 'lesson', 'practice', 'identity', 'confidence', 'refines', 'qualifies',
    'replaces', 'sits alongside', 'category', 'heading', 'propose', 'decline', 'save']
  const leaked = forbidden.filter((w) => built.toLowerCase().includes(w.toLowerCase()))
  ok(leaked.length === 0, 'P · ⭐ the prompt supplies no ontology, decision or structure vocabulary', leaked.join(', ') || 'none')

  // ── N · REFLECTION IS NOT NOTICING, AND THE SEPARATION IS STRUCTURAL ────────────────────────────
  // Ote: *"I don't want the existing contaminated noticing mechanism quietly becoming the reflection
  // system just because it already exists."*
  const HOST = new URL('../../Backend/app/components/reflection-lifecycle-host.js', import.meta.url)
  const PURE = new URL('../../Backend/app/components/reflection-lifecycle.js', import.meta.url)
  const hostSrc = readFileSync(HOST, 'utf8')
  const pureSrc = readFileSync(PURE, 'utf8')
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const hostCode = strip(hostSrc)
  const pureCode = strip(pureSrc)
  ok(!/noticing-host|noticing-pass/.test(hostCode) && !/noticing-host|noticing-pass/.test(pureCode),
    'N · ⭐⭐ neither reflection file imports the noticing pass — the same sentence, two independent instruments')
  ok(pureCode.includes(`REFLECTION_GENERATION = ${REFLECTION_GENERATION}`),
    'N · ⭐ reflection carries its OWN generation counter, so bumping noticing cannot silently change this prompt',
    `generation ${REFLECTION_GENERATION}`)
  // ⛔ The reflection host must not write txn_memories itself — one write lane, and it is the tools'.
  ok(!/INSERT\s+INTO[^;]*txn_memories/i.test(hostCode),
    'N · ⭐⭐ the reflection host writes NO memory itself — retention happens because she called a tool')
  ok(/log_reflections/.test(hostCode), 'N · …and it does write the reflection record')

  // ── T · THE TOOLSET IS AN ALLOWLIST, AND THE DESTRUCTIVE ONES ARE NOT ON IT ─────────────────────
  const withheld = ['forget_memory', 'retract_own_practice', 'restore_memory', 'pin_memory', 'remember_fact']
  const present = withheld.filter((t) => REFLECTION_TOOLS.includes(t))
  ok(present.length === 0,
    'T · ⭐⭐ an unattended pass cannot delete, re-rank or restore anything — those tools are withheld',
    present.join(', ') || 'none offered')
  for (const t of ['recall_own_history', 'inspect_around', 'search_conversations', 'recall_own_memory']) {
    ok(REFLECTION_TOOLS.includes(t), `T · the read tool Ote named is offered: ${t}`)
  }
  ok(REFLECTION_TOOLS.includes('decline_to_remember'),
    'T · ⭐ non-retention is an ACTION she can take, not just silence — decline_to_remember is offered')
  // ⛔⛔ THE LOAD-BEARING GATE: an id may only be read out of a WRITE tool's result. Every recall tool
  // returns rows that HAVE ids, so reading ids from any result would record "she wrote this" about
  // something she merely looked at.
  ok(readWrittenMemoryId('recall_memory', { ok: true, id: '11111111-2222-3333-4444-555555555555' }) === null,
    'T · ⭐⭐ an id in a RECALL result is never read as a write — the gate is the tool name')
  ok(readWrittenMemoryId('remember', { ok: true, id: '11111111-2222-3333-4444-555555555555' })
     === '11111111-2222-3333-4444-555555555555',
    'T · …and a write tool\'s id is read')
  ok(readWrittenMemoryId('propose_lesson', { ok: true, dryRun: true, id: '11111111-2222-3333-4444-555555555555' }) === null,
    'T · ⭐ a dry-run proposal wrote nothing and is not recorded as a write')
  ok(readWrittenMemoryId('save_lesson', { ok: false, reason: 'no lease' }) === null,
    'T · a failed write is not a write')
  ok(REFLECTION_WRITE_TOOLS.every((t) => REFLECTION_TOOLS.includes(t)), 'T · the write tools are part of the offered set')

  // ── D · `blocked_by_disclosure` IS NARROW ────────────────────────────────────────────────────────
  ok(isDisclosureRefusal('inspect_around', { ok: false, state: 'attested' }) === true,
    'D · ⭐ a refused cross-room read IS a disclosure block — found but not authorized')
  ok(isDisclosureRefusal('inspect_around', { ok: false, state: 'unreachable' }) === false,
    'D · ⛔ "unreachable" is absence, not a boundary — it must not count')
  ok(isDisclosureRefusal('recall_own_history', { coverage: {}, otherRooms: [{ counterpart: 'x' }] }) === false,
    'D · ⛔⛔ existence-only cross-room results are the boundary WORKING, not a refusal — otherwise almost every search would set the flag')

  // ── G · THE GATE: QUIET **AND** CHANGED ─────────────────────────────────────────────────────────
  const now = Date.parse('2026-08-20T12:00:00Z')
  const hourAgo = new Date(now - 3600e3)
  const justNow = new Date(now - 60e3)
  ok(isReadyToReflect({ messages: 8, topRollingId: 8, lastReflectedUpTo: 0, lastMessageAt: hourAgo, now }).ready === true,
    'G · quiet + changed ⇒ an occasion exists')
  ok(isReadyToReflect({ messages: 8, topRollingId: 8, lastReflectedUpTo: 8, lastMessageAt: hourAgo, now }).reason === 'unchanged',
    'G · ⭐ already reflected at this watermark ⇒ ONE opportunity per quiet stretch, not one per tick')
  ok(isReadyToReflect({ messages: 8, topRollingId: 9, lastReflectedUpTo: 8, lastMessageAt: justNow, now }).reason === 'not-quiet',
    'G · a new message that has not settled yet is early, not done')
  ok(isReadyToReflect({ messages: 9, topRollingId: 9, lastReflectedUpTo: 8, lastMessageAt: hourAgo, now }).ready === true,
    'G · ⭐ a new message + a new lull earns a NEW opportunity')
  ok(isReadyToReflect({ messages: 2, topRollingId: 2, lastReflectedUpTo: 0, lastMessageAt: hourAgo, now }).reason === 'thin',
    'G · a two-line exchange is not an occasion')

  // ⭐ messages_considered can never claim she read what the prompt elided.
  const many = Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(400) }))
  const shaped = shapeReflectionTranscript(many)
  ok(shaped.elided === true && shaped.considered < many.length,
    'G · ⭐⭐ an elided transcript reports the count she ACTUALLY saw, not the conversation length',
    `${shaped.considered} of ${many.length}`)
  const few = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
  ok(shapeReflectionTranscript(few).considered === 2 && shapeReflectionTranscript(few).elided === false,
    'G · a short conversation is passed whole')

  // ── SCHEMA · WHAT MIGRATION 016 PROMISED, RE-ASSERTED OUTSIDE THE MIGRATION ─────────────────────
  // A migration proves the state at the moment it ran; a check proves the state now. 005 shipped a column
  // with no generation expression because "exit 0" was the only thing anybody looked at.
  const cols = new Map((await Q(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns
      WHERE table_schema = :s AND table_name = 'log_reflections'`, { s: S })).map((c) => [c.column_name, c]))
  ok(cols.size > 0, 'S · log_reflections exists', `${cols.size} columns`)
  ok(cols.get('wrote_memory_id')?.is_nullable === 'YES',
    'S · ⭐⭐ wrote_memory_id is NULLABLE — a successful "nothing" is a real persisted outcome')
  ok(cols.get('text')?.is_nullable === 'NO', 'S · her words are mandatory')
  ok(cols.get('tools_used')?.is_nullable === 'NO',
    'S · ⭐ tools_used is NOT NULL — "she used none" and "we did not record" must not look alike')
  const enums = await Q(
    `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = :s AND t.typtype = 'e' AND (t.typname LIKE '%reflection%' OR t.typname LIKE '%outcome%')`, { s: S })
  ok(enums.length === 0,
    'S · ⭐⭐ NO decision-vocabulary enum exists — "nothing" vs "undetermined" lives in her words until evidence earns a column',
    enums.map((e) => e.typname).join(', ') || 'none')
  const fks = await Q(
    `SELECT count(*)::int n FROM information_schema.table_constraints
      WHERE table_schema = :s AND table_name = 'log_reflections' AND constraint_type = 'FOREIGN KEY'`, { s: S })
  ok(fks[0].n === 0, 'S · ⭐ zero foreign keys — the record that she reflected outlives the conversation')
  const uniq = await Q(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = :s AND tablename = 'log_reflections' AND indexdef LIKE '%UNIQUE%'`, { s: S })
  ok(uniq.some((u) => /conversation_id, up_to_rolling_id/.test(u.indexdef)),
    'S · ⭐⭐ one-per-quiet-stretch is enforced by the DATABASE, not by the caller trusting itself')

  // ── K · `kind` IS OPTIONAL **AND A KIND-LESS ROW IS STILL READABLE** ───────────────────────────
  // ⭐⭐ THE TRAP 016 WOULD OTHERWISE HAVE LAID. Every read in the store narrows by a kind ALLOWLIST, and an
  // allowlist excludes NULL by construction — so a kind-less memory would have been written and then
  // reachable by nothing. Write-only memory is worse than a refused write, because it looks like it worked.
  const kindCol = (await Q(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = :s AND table_name = 'txn_memories' AND column_name = 'kind'`, { s: S }))[0]
  ok(kindCol.is_nullable === 'YES', 'K · txn_memories.kind is nullable')
  ok(kindCol.column_default === null,
    'K · ⭐ …and has NO default — a nullable column that still defaults is not optional')
  const storeSrc = readFileSync(
    new URL('../../Backend/app/components/memory-store-sequelize-host.js', import.meta.url), 'utf8')
  const storeCode = strip(storeSrc)
  ok(/kind IN \('episodic','semantic','card'\) OR kind IS NULL/.test(storeCode),
    'K · ⭐⭐ the search scope does not exclude a kind-less row of her own')
  ok(/OWNED_KIND_OR_UNCLASSIFIED/.test(storeCode) && /user_id: null, kind: 'identity'/.test(storeCode),
    'K · ⭐ …and the persona-global/identity branch is untouched, so nothing became broadcast')

  // ── THE TWO TESTS OTE NAMED, ON A REAL CONVERSATION ────────────────────────────────────────────
  const [me] = await Q(`SELECT id::text AS id FROM ${S}.mst_users WHERE username = 'agent_dev'`)
  if (!me) {
    ok(false, 'L · agent_dev must exist to run the lifecycle tests',
      'create it: POST /v1/admin/users {username:"agent_dev",password:"agentdev123",roles:["admin"]}')
  } else {
    const mkConversation = async (title) => {
      const [c] = await Q(
        `INSERT INTO ${S}.txn_conversations (id, user_id, title, incognito, settings, created_at, updated_at)
         VALUES (gen_random_uuid(), :u, :t, false, '{}'::jsonb, now(), now() - interval '2 hours')
         RETURNING id::text AS id`, { u: me.id, t: title })
      MADE.conversations.push(c.id)
      // Four messages: the thin floor is 4, and a fixture that only just clears it is the honest case.
      const lines = [
        ['user', 'zz_test I keep re-deriving the same conclusion about watermarks.'],
        ['assistant', 'zz_test You do — the watermark is what makes one opportunity per lull possible.'],
        ['user', 'zz_test Right. Write that down somewhere you will find it again.'],
        ['assistant', 'zz_test Understood.'],
      ]
      for (const [role, content] of lines) {
        await Q(`INSERT INTO ${S}.txn_messages (id, conversation_id, role, content, created_at, updated_at)
                 VALUES (gen_random_uuid(), :c, :r, :t, now() - interval '2 hours', now() - interval '2 hours')`,
          { c: c.id, r: role, t: content })
      }
      return c.id
    }

    // ── 1 · A REFLECTION THAT PRODUCES NO MEMORY STILL WRITES A ROW ───────────────────────────────
    const NOTHING = 'zz_test There is nothing here I want to carry forward.'
    const quiet = await mkConversation('zz_test reflection — nothing kept')
    const r1 = await reflectOnConversation(fastify, {
      conversationId: quiet,
      turn: async () => ({ message: { content: NOTHING }, doneReason: 'stop' }),
    })
    ok(r1.ok === true, 'L1 · the reflection ran', r1.reason ?? '')
    if (r1.reflectionId) MADE.reflections.push(r1.reflectionId)
    const [row1] = await Q(
      `SELECT id::text AS id, text, wrote_memory_id, tools_used, blocked_by_disclosure,
              up_to_rolling_id, messages_considered, prompt_generation, model, finish
         FROM ${S}.log_reflections WHERE conversation_id = :c`, { c: quiet })
    ok(!!row1, 'L1 · ⭐⭐ A REFLECTION THAT WROTE NO MEMORY STILL LEFT A ROW — "she reflected and kept nothing" is now a fact, not an absence')
    ok(row1?.wrote_memory_id === null, 'L1 · ⭐ and wrote_memory_id is NULL — a fact, not a verdict')
    ok(row1?.text === NOTHING, 'L1 · her words are stored verbatim, unparsed')
    ok(Array.isArray(row1?.tools_used) && row1.tools_used.length === 0, 'L1 · she called no tools, recorded as an empty array')
    ok(row1?.blocked_by_disclosure === false, 'L1 · nothing was refused by a boundary')
    ok(Number(row1?.up_to_rolling_id) > 0 && row1?.messages_considered === 4,
      'L1 · the watermark and the count she actually read are recorded', `upTo=${row1?.up_to_rolling_id} considered=${row1?.messages_considered}`)
    ok(row1?.prompt_generation === REFLECTION_GENERATION && !!row1?.model,
      'L1 · ⭐ the row says which generation and which model produced it, without anybody checking manually')

    // ⭐ ONE OPPORTUNITY PER QUIET STRETCH — a second run on the same watermark must not reflect again.
    const again = await reflectOnConversation(fastify, {
      conversationId: quiet,
      turn: async () => ({ message: { content: 'zz_test this must never be stored' }, doneReason: 'stop' }),
    })
    ok(again.skipped === true && (again.reason === 'unchanged' || again.reason === 'already-reflected'),
      'L1 · ⭐⭐ the same quiet stretch cannot be reflected on twice', again.reason ?? 'it ran again')
    const [{ n: dupes }] = await Q(`SELECT count(*)::int n FROM ${S}.log_reflections WHERE conversation_id = :c`, { c: quiet })
    ok(dupes === 1, 'L1 · …and exactly one row exists for it', `${dupes} row(s)`)

    // ── 2 · A SAVING REFLECTION **POINTS AT** THE MEMORY ─────────────────────────────────────────
    // ⚠️ `remember` on purpose, not `save_lesson`: it is FIRE-AND-FORGET (`{ok:true,queued:true}`, no id),
    // which is the path where a naive implementation records "no memory" about a memory. If the id survives
    // this, it survives the easy case too.
    const KEPT = 'zz_test The watermark is what makes one reflection per lull possible.'
    const SAID = 'zz_test Yes — one thing. I have kept it.'
    const saving = await mkConversation('zz_test reflection — something kept')
    let round = 0
    const r2 = await reflectOnConversation(fastify, {
      conversationId: saving,
      turn: async ({ tools }) => {
        round++
        if (round === 1) {
          ok(Array.isArray(tools) && tools.some((t) => t.function?.name === 'remember'),
            'L2 · ⭐ her ordinary tools are in the request — offered, and never mentioned in the prompt')
          return { message: { content: '', tool_calls: [{ function: { name: 'remember', arguments: { content: KEPT, importance: 6 } } }] }, doneReason: 'tool_calls' }
        }
        return { message: { content: SAID }, doneReason: 'stop' }
      },
    })
    ok(r2.ok === true, 'L2 · the reflection ran', r2.reason ?? '')
    if (r2.reflectionId) MADE.reflections.push(r2.reflectionId)
    if (r2.wroteMemoryId) MADE.memories.push(r2.wroteMemoryId)
    const [row2] = await Q(
      `SELECT text, wrote_memory_id::text AS wrote_memory_id, tools_used FROM ${S}.log_reflections WHERE conversation_id = :c`, { c: saving })
    ok(!!row2?.wrote_memory_id,
      'L2 · ⭐⭐ THE REFLECTION RECORD POINTS AT THE MEMORY — and it survived the fire-and-forget lane, which returns no id',
      String(row2?.wrote_memory_id))
    const [mem] = row2?.wrote_memory_id
      ? await Q(`SELECT id::text AS id, content, author::text AS author, kind, user_id::text AS user_id
                   FROM ${S}.txn_memories WHERE id = :id`, { id: row2.wrote_memory_id })
      : [null]
    ok(!!mem, 'L2 · …and the row it points at exists')
    ok(mem?.content === KEPT, 'L2 · the memory holds what she chose to keep')
    // ⭐⭐ POINTS, DOES NOT DUPLICATE. The reflection row must not become a second copy of the memory —
    // that is the difference between a record of a decision and a disguised memory table.
    ok(row2 ? !row2.text.includes(KEPT) : false,
      'L2 · ⭐⭐ the reflection record does NOT contain the memory\'s contents — it points at it',
      'a record of the decision, not a second copy of the belief')
    ok(row2?.text === SAID, 'L2 · what it DOES hold is her own words about the decision')
    ok(mem?.author === 'persona',
      'L2 · ⭐⭐ AUTHORSHIP FOLLOWS THE OCCASION — the same tool that writes an account-authored row mid-conversation writes HERS in a reflection',
      `author=${mem?.author}`)
    ok(mem?.user_id === me.id,
      'L2 · ⭐ …and user_id still records the ROOM it was formed in — context, not ownership (migration 015)')
    ok(Array.isArray(row2?.tools_used) && row2.tools_used.includes('remember'),
      'L2 · the tool she reached for is recorded', (row2?.tools_used ?? []).join(', '))
  }
} finally {
  // ⛔ CLEAN UP EVERYTHING. Residue from my testing has appeared in Ote's own panels before.
  const wipe = (sql, args = []) => pg.query(sql, args).catch(() => {})
  await wipe(`DELETE FROM ${S}.log_reflections WHERE conversation_id = ANY($1::uuid[])`, [MADE.conversations])
  // ⚠️ `zz_test %` is the fixture prefix every line here carries, so a memory that escaped the returned id
  // (a second write, a renamed field) is still cleaned up rather than left in her store.
  await wipe(`DELETE FROM ${S}.txn_memories WHERE content LIKE 'zz\_test %'`)
  await wipe(`DELETE FROM ${S}.txn_messages WHERE conversation_id = ANY($1::uuid[])`, [MADE.conversations])
  await wipe(`DELETE FROM ${S}.txn_conversations WHERE id = ANY($1::uuid[])`, [MADE.conversations])
  await pg.end()
}

done()
