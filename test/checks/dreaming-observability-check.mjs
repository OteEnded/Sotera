// ⭐⭐⭐⭐ DREAMING RUN OBSERVABILITY (054) — the run record is JOINABLE, MEASURABLE, and STILL NOT MEMORY.
//
//   node test/checks/dreaming-observability-check.mjs
//
// ── WHAT THIS EXISTS FOR ───────────────────────────────────────────────────────────────────────────
// Ote, 2026-09-18: *"Today's real run already demonstrated why this matters: the ownership refusal and
// successful retry happened five seconds apart, but both retention rows currently have revisit_id = NULL,
// forcing us to reconstruct the relationship from timestamps."*
//
//     Dream Run ──┬── reflection output          log_conversation_revisits   (+ 054's runtime columns)
//                 ├── tool calls (refusal/retry) log_tool_calls.revisit_id   ⭐ NEW COLUMN
//                 ├── retention decisions        log_retention_decisions.revisit_id  ⓘ existed, unwritten
//                 └── resulting memory           txn_memories
//
// ── ⛔⛔ WHAT THIS CHECK DOES AND DOES NOT PROVE ────────────────────────────────────────────────────
//   ✅ PROVES  a run's tool calls and retention decisions are reachable from the RUN ID alone — ⛔ no
//              timestamp reconstruction — and that the runtime numbers survive the write.
//   ✅ PROVES  the derived termination classification cannot be stored without naming its authority.
//   ✅ PROVES  no retrieval/cognition/composer path reads a `log_` table.
//   ⛔ DOES NOT PROVE the provider's own numbers are correct. The turn is injected, so A/B verify the
//              PERSISTENCE PATH; the adapter→usage mapping is pinned separately in group B by source
//              anchor (`prompt_eval_count` → `promptTokens`), because a stub that reports its own numbers
//              would otherwise be asserting itself.
//
// ⛔ Runs as agent_dev. Every fixture is removed at the end.
import { readFileSync, existsSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('dreaming-observability')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const MARK = 'zz_dreamobs_'
const MADE = { conversations: [] }
let fastify = null

// ⭐ A SOURCE READER THAT CANNOT GO VACUOUS: a missing file is a hard failure, never "no hits found".
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
function source(rel) {
  const p = ROOT + rel
  if (!existsSync(p)) throw new Error(`source anchor missing: ${rel} — a rename must FAIL this check, not pass it`)
  return readFileSync(p, 'utf8')
}

try {
  const { loadConfig, setDB } = await import('../../Backend/lib/utility.js')
  const { initDB } = await import('../../Backend/database/index.js')
  const { initSettings } = await import('../../Backend/app/settings/index.js')
  const config = loadConfig()
  const db = await initDB(); setDB(db); await initSettings(db)
  const log = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, child() { return this } }
  fastify = { db, log, config }
  db.sequelize.options.logging = false

  const { initRetention } = await import('../../Backend/app/components/retention-host.js')
  const { initLesson } = await import('../../Backend/app/components/lesson-host.js')
  const { initOwnMemory } = await import('../../Backend/app/components/own-memory-host.js')
  const { initToolLog } = await import('../../Backend/app/audit/tool-log.js')
  const { attachToolAudit } = await import('../../Backend/app/components/runtime.js')
  initRetention(); initLesson(); initOwnMemory(); initToolLog(fastify, attachToolAudit)

  const { reflectOnConversation } = await import('../../Backend/app/components/reflection-lifecycle-host.js')
  const { REVISIT_RECORD_LIFETIME } = await import('../../Backend/app/components/reflection-lifecycle.js')

  const agent = await one(`select id::text, username from ${S}.mst_users where username='agent_dev'`)
  check('A0 · agent_dev resolves — ⛔ this check never runs as root', Boolean(agent?.id))

  const mkConversation = async (title) => {
    const c = await one(
      `insert into ${S}.txn_conversations (id, user_id, title, incognito, settings, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, false, '{}'::jsonb, now(), now() - interval '2 hours')
       returning id::text as id`, [agent.id, title])
    MADE.conversations.push(c.id)
    for (const [role, content] of [
      ['user', `${MARK}you checked twice before saying it was not there.`],
      ['assistant', `${MARK}Once was not enough the last few times.`],
      ['user', `${MARK}worth keeping hold of.`],
      ['assistant', `${MARK}Agreed.`],
    ]) {
      await pg.query(
        `insert into ${S}.txn_messages (id, conversation_id, role, content, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, now() - interval '2 hours', now() - interval '2 hours')`,
        [c.id, role, content])
    }
    return c.id
  }

  // ══ A · ⭐⭐⭐ CORRELATION — THE WHOLE LIFECYCLE IS REACHABLE FROM THE RUN ID ALONE ════════════════
  //
  // ⭐ The scripted pass reproduces TODAY'S REAL SHAPE: a refused tool (`remember_fact`, which reflection
  // is never offered) followed five seconds later by a successful `retain`. That pair is exactly the one
  // Ote had to reconstruct from timestamps.
  const convoA = await mkConversation(`${MARK}correlation`)
  let roundsA = 0
  const resA = await reflectOnConversation(fastify, {
    triggerSource: 'check', conversationId: convoA, force: true,
    turn: async () => {
      roundsA += 1
      if (roundsA === 1) {
        return {
          message: {
            content: '',
            tool_calls: [
              // ⛔ NOT OFFERED ⇒ the dispatch boundary refuses it and the ATTEMPT is audited.
              { function: { name: 'remember_fact', arguments: { fact: `${MARK}refused attempt` } } },
              { function: { name: 'retain', arguments: { content: `${MARK}I check twice before calling something absent`, kind: 'note', mine: true } } },
            ],
          },
          doneReason: 'tool_calls', doneReasonSource: 'derived',
          promptTokens: 1234, completionTokens: 56,
        }
      }
      return { message: { content: `${MARK}done.` }, doneReason: 'stop', doneReasonSource: 'derived', promptTokens: 1500, completionTokens: 40 }
    },
  })
  check('A1 · the reflection completed', resA?.ok === true, resA?.reason ?? '')
  const runA = await one(
    `select id::text as id, tools_used, tools_refused, wrote_memory_id::text as wrote,
            num_ctx, max_tokens, prompt_tokens, completion_tokens, completion_tokens_total, rounds,
            termination_observed, termination_source
       from ${S}.log_conversation_revisits where conversation_id=$1`, [convoA])
  check('A2 · a run row exists and both doors were exercised (one refused, one executed)',
    Boolean(runA?.id) && (runA?.tools_refused ?? []).includes('remember_fact') && (runA?.tools_used ?? []).includes('retain'),
    `used=${(runA?.tools_used ?? []).join(',')} refused=${(runA?.tools_refused ?? []).join(',')}`)

  const decA = await q(
    `select state, revisit_id::text as revisit_id, act_kind::text as act_kind, act_id
       from ${S}.log_retention_decisions where revisit_id=$1::uuid order by created_at`, [runA?.id])
  check('A3 · ⭐⭐⭐ RETENTION DECISIONS ARE REACHABLE BY `revisit_id` ALONE — ⛔ no timestamp window',
    decA.length >= 1 && decA.every((d) => d.revisit_id === runA.id),
    `${decA.length} decision(s): ${decA.map((d) => d.state).join(',') || 'none'}`)
  check('A4 · ⭐ the typed column AGREES with the generic act pair it was derived from',
    decA.length >= 1 && decA.every((d) => d.act_kind === 'revisit' && String(d.act_id) === String(d.revisit_id)))

  const callsA = await q(
    `select tool, ok, revisit_id::text as revisit_id from ${S}.log_tool_calls where revisit_id=$1::uuid order by created_at`, [runA?.id])
  check('A5 · ⭐⭐⭐ TOOL CALLS ARE REACHABLE BY `revisit_id` ALONE — the new column carries them',
    callsA.length >= 2 && callsA.every((c) => c.revisit_id === runA.id),
    callsA.map((c) => `${c.tool}:${c.ok ? 'ok' : 'refused'}`).join(' ') || 'none')
  check('A6 · ⭐⭐ …INCLUDING THE REFUSAL. ⛔ A correlation that only kept successes would lose the exact '
    + 'pair Ote had to reconstruct by hand',
    callsA.some((c) => c.tool === 'remember_fact' && c.ok === false)
    && callsA.some((c) => c.tool === 'retain' && c.ok === true))
  check('A7 · ⭐ …and the resulting memory still hangs off the run',
    Boolean(runA?.wrote) && Boolean(await one(`select 1 from ${S}.txn_memories where id=$1`, [runA.wrote])))

  // ⛔ THE NEGATIVE HALF: an ordinary turn must NOT acquire a revisit id. A column that is always
  // populated correlates nothing.
  const strayCalls = await one(
    `select count(*)::int n from ${S}.log_tool_calls
      where revisit_id is not null and (origin is distinct from 'reflection')`)
  check('A8 · ⛔⛔ NON-REFLECTION CALLS CARRY NO RUN ID — the column means something because it is often NULL',
    Number(strayCalls?.n ?? -1) === 0, `${strayCalls?.n} stray row(s)`)

  // ══ B · ⭐⭐ RUNTIME MEASUREMENTS — the numbers already in hand, written down ══════════════════════
  check('B1 · ⭐ the REQUESTED runtime landed on the row (num_ctx · max_tokens · rounds)',
    Number(runA?.num_ctx) > 0 && Number(runA?.max_tokens) > 0 && Number(runA?.rounds) === roundsA,
    `num_ctx=${runA?.num_ctx} max_tokens=${runA?.max_tokens} rounds=${runA?.rounds}/${roundsA}`)
  check('B2 · ⭐⭐ `prompt_tokens`/`completion_tokens` are the FINAL ROUND — the one the text and the '
    + 'termination both come from, so the three agree with each other',
    Number(runA?.prompt_tokens) === 1500 && Number(runA?.completion_tokens) === 40,
    `prompt=${runA?.prompt_tokens} completion=${runA?.completion_tokens}`)
  check('B3 · ⭐⭐ `completion_tokens_total` is the WHOLE PASS — a different number the moment she uses a tool',
    Number(runA?.completion_tokens_total) === 96 && Number(runA?.completion_tokens_total) !== Number(runA?.completion_tokens),
    `total=${runA?.completion_tokens_total} (56+40) vs final=${runA?.completion_tokens}`)
  // ⭐ THE ANCHOR THAT KEEPS A/B FROM ASSERTING THEIR OWN STUB: the live path reads the provider's usage,
  // and the ollama adapter maps ollama's own counters onto it.
  const hostSrc = source('Backend/app/components/reflection-lifecycle-host.js')
  check('B4 · ⭐⭐⭐ THE LIVE PATH READS THE PROVIDER, ⛔ not the stub — `res.usage.promptTokens` at the call site',
    /promptTokens:\s*res\?\.usage\?\.promptTokens/.test(hostSrc) && /completionTokens:\s*used/.test(hostSrc))
  check('B5 · ⭐ …and the adapter maps ollama’s own counters onto that shape',
    /promptTokens:\s*response\.prompt_eval_count/.test(source('Backend/providers/ollama/index.js')))

  // ══ C · ⭐⭐⭐ THE TERMINATION PAIR — a classification may never travel without its authority ═══════
  check('C1 · ⭐⭐ the pass recorded a termination AND named who says so',
    runA?.termination_observed === 'stop' && runA?.termination_source === 'derived',
    `${runA?.termination_observed}/${runA?.termination_source}`)
  check('C2 · ⛔⛔ AND IT IS NOT LABELLED `provider` — `chat()` discards done_reason, so we never had their word',
    runA?.termination_source !== 'provider')

  // ⭐ A REAL NEGATIVE PROOF, crossing persistence and rolled back: the database itself refuses a word
  // without an authority. ⛔ Prose in a migration is not a guarantee.
  let refusedUnpaired = false
  try {
    await pg.query('begin')
    await pg.query(
      `update ${S}.log_conversation_revisits set termination_observed='length', termination_source=null where id=$1::uuid`, [runA.id])
  } catch { refusedUnpaired = true } finally { await pg.query('rollback') }
  check('C3 · ⭐⭐⭐ THE DATABASE REFUSES AN UNQUALIFIED TERMINATION — 017 removed `finish` for exactly '
    + 'this reason, and 054 may not reintroduce it',
    refusedUnpaired)

  let refusedBogus = false
  try {
    await pg.query('begin')
    await pg.query(
      `update ${S}.log_conversation_revisits set termination_observed='length', termination_source='ollama' where id=$1::uuid`, [runA.id])
  } catch { refusedBogus = true } finally { await pg.query('rollback') }
  check('C4 · ⛔ …and refuses an authority that is not one of derived/provider/loop', refusedBogus)

  // ══ D · ⛔⛔⛔ THE LOGGING BOUNDARY — Dreaming run logs are OBSERVABILITY, ⛔ NEVER MEMORY ═════════
  //
  // Ote: *"Add a regression assertion if practical that no retrieval/cognition/composer path consumes
  // log_* tables as memory."*
  // ⚠️ THE SCAN'S FAILURE MODE IS OVER-DETECTION, ⛔ NEVER UNDER-DETECTION: it strips only `//` and ` *`
  // lines, so an unusual block-comment style produces a FALSE ALARM a human resolves — it can never let a
  // real read through silently. That direction is chosen on purpose.
  const BOUNDARY_FILES = [
    'Backend/app/components/context-composer.js',
    'Backend/app/components/context-authority.js',
    'Backend/app/components/conversation-retrieval.js',
    'Backend/app/components/memory-cognition-host.js',
    'Backend/app/components/memory-cognition-projection.js',
    'Backend/app/components/memory-v2-host.js',
    '../../PortableComponents/Packages/Memory/cognition/memory-v2-service.js',
    '../../PortableComponents/Packages/Memory/cognition/memory-rank.js',
    '../../PortableComponents/Packages/Memory/cognition/memory-pipeline.js',
  ]
  check('D0 · ⭐ the boundary list is DECLARED and non-empty — ⛔ a scan with no targets proves nothing',
    BOUNDARY_FILES.length >= 9)
  const codeOnly = (text) => text.split('\n')
    .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') })
  const offenders = []
  for (const rel of BOUNDARY_FILES) {
    // ⛔ `source()` throws on a missing path, so a renamed module FAILS this check instead of passing it.
    const hits = codeOnly(source(rel)).filter((l) => /\blog_[a-z_]+/.test(l))
    if (hits.length) offenders.push(`${rel}: ${hits[0].trim().slice(0, 60)}`)
  }
  check('D1 · ⭐⭐⭐ NO RETRIEVAL / COGNITION / COMPOSER PATH READS A `log_` TABLE — run history is not '
    + 'a memory source and 054 opened no path to make it one',
    offenders.length === 0, offenders.join(' | '))

  // ⛔ THE PAYLOAD BOUNDARY, held in the SCHEMA rather than in the writer's good behaviour.
  const toolCols = (await q(
    `select column_name from information_schema.columns
      where table_schema=$1 and table_name='log_tool_calls'`, [S])).map((r) => r.column_name)
  check('D2 · ⛔⛔ `log_tool_calls` STILL HAS NO COLUMN FOR AN ARGUMENT VALUE OR A TOOL RESULT — '
    + 'arg KEYS and byte counts only, and 054 did not widen it',
    toolCols.includes('arg_keys') && toolCols.includes('arg_bytes')
    && !toolCols.some((c) => /result|payload|arg_values|response|output|content/.test(c)),
    toolCols.join(','))
  check('D3 · ⭐ …and the only thing 054 added to it is the correlation id', toolCols.includes('revisit_id'))

  // ⛔ NO `run_events` TABLE. Ote: *"do not create run_events at this stage."*
  const runEvents = await one(
    `select count(*)::int n from information_schema.tables where table_schema=$1 and table_name like '%run_events%'`, [S])
  check('D4 · ⛔⛔ NO `run_events` TABLE WAS CREATED — the existing tables already carry the lifecycle',
    Number(runEvents?.n) === 0)

  // ══ E · ⭐⭐⭐ THE LIFETIME IS A DECLARED DECISION, ⛔ NOT AN ACCIDENTAL PROPERTY ══════════════════
  check('E1 · ⭐⭐ the ruling EXISTS as a constant, not only as prose in a migration',
    REVISIT_RECORD_LIFETIME?.table === 'log_conversation_revisits'
    && REVISIT_RECORD_LIFETIME?.keep === 'forever' && REVISIT_RECORD_LIFETIME?.prune === null,
    JSON.stringify({ keep: REVISIT_RECORD_LIFETIME?.keep, prune: REVISIT_RECORD_LIFETIME?.prune }))
  check('E2 · ⭐ …and it carries its REASON and the thing that VOIDS it — a bare ‘forever’ teaches a '
    + 'later reader nothing about when they may change it',
    typeof REVISIT_RECORD_LIFETIME?.because === 'string' && REVISIT_RECORD_LIFETIME.because.length > 30
    && /payload/.test(REVISIT_RECORD_LIFETIME?.voidedBy ?? ''))
  check('E3 · ⭐ …and the affordability is a MEASUREMENT, not an assumption',
    Number(REVISIT_RECORD_LIFETIME?.measuredAt?.rows) > 0
    && Number(REVISIT_RECORD_LIFETIME?.measuredAt?.avgTextChars) > 0)

  // ⛔ ENFORCED, NOT ASSERTED. ⚠️ AND THE EXCLUSION LADDER IS STATED, because the first version of this
  // scan swept `Backend/` whole and found a real hit that is NOT a pruner: migration 027 ends its own
  // `DO $$` self-test by deleting the fixture rows it just inserted to prove the outcome CHECK. ⭐ A scan
  // that quietly dropped `.sql` to go green would be tuning the instrument to the answer.
  //   ① E4 scans `Backend/app` — THE RUNTIME. A time-based pruner would live here, and only here.
  //   ② E5 scans everything else and holds an ALLOWLIST OF EXACTLY ONE known file, so a NEW migration
  //      that deletes run records fails this check and forces the ruling to be re-taken.
  const { execSync } = await import('node:child_process')
  const grepDeletes = (pathspec) => {
    try {
      return execSync(
        // ⚠️ `.*`, ⛔ NOT `[^\n]*`. execSync shells out through cmd.exe on Windows, where `^` is the
        // ESCAPE CHARACTER — the pattern reached git as `delete +from[^` and it died with *"Invalid
        // regular expression"*, which execSync surfaces as a non-zero exit, which this function treats
        // as "no matches". ⭐⭐ A BROKEN GREP AND A CLEAN REPO ARE THE SAME GREEN LINE, which is exactly
        // why E4a exists and exactly what it caught. git grep is line-based, so `.*` cannot over-reach.
        // ⛔ And no quotes around the pathspec: cmd.exe does not strip them, so git looked for a file
        // literally named `'Backend/app'`.
        `git grep -n -i -E "delete +from.*log_conversation_revisits" -- ${pathspec}`,
        { cwd: ROOT, encoding: 'utf8' }).trim()
    } catch { return '' } // git grep exits 1 when there are no matches — that is the passing case
  }
  // ⭐ A POSITIVE CONTROL FIRST: if the grep itself is broken, every assertion below passes vacuously.
  const controlHit = grepDeletes('Backend/database/migrations/027_revisit_preempted.sql')
  check('E4a · ⭐⭐ THE SCAN CAN ACTUALLY FIND A DELETE — ⛔ without this, E4/E5 are two green lines that '
    + 'prove the grep is spelled wrong',
    controlHit.includes('log_conversation_revisits'), controlHit.split('\n')[0]?.slice(0, 80) ?? 'FOUND NOTHING')

  const runtimeDeleters = grepDeletes('Backend/app')
  check('E4 · ⭐⭐⭐ NOTHING IN THE RUNTIME (`Backend/app`) DELETES A DREAM RUN RECORD — the permanence is '
    + 'a property a check defends, ⛔ not a habit that could lapse',
    runtimeDeleters === '', runtimeDeleters.split('\n')[0] ?? '')

  const ALLOWED_DELETERS = ['Backend/database/migrations/027_revisit_preempted.sql']
  const otherDeleters = grepDeletes('Backend')
    .split('\n').filter(Boolean)
    .map((l) => l.split(':')[0])
    .filter((f) => !f.startsWith('Backend/app/') && !ALLOWED_DELETERS.includes(f))
  check('E5 · ⛔⛔ AND NO NEW FILE HAS LEARNED TO — 027’s self-test teardown is the ONE allowed hit, '
    + 'named rather than hidden by a narrower pattern',
    otherDeleters.length === 0, [...new Set(otherDeleters)].join(' | '))
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  const wipe = async (sql, p = []) => { try { await pg.query(sql, p) } catch { /* none */ } }
  await wipe(`delete from ${S}.txn_memories where content like $1 or attribute like $1`, [`${MARK}%`])
  await wipe(`delete from ${S}.log_retention_decisions where content like $1`, [`${MARK}%`])
  if (MADE.conversations.length) {
    await wipe(`delete from ${S}.log_tool_calls where conversation_id = any($1::uuid[])`, [MADE.conversations])
    await wipe(`delete from ${S}.log_conversation_revisits where conversation_id = any($1::uuid[])`, [MADE.conversations])
    await wipe(`delete from ${S}.txn_messages where conversation_id = any($1::uuid[])`, [MADE.conversations])
    await wipe(`delete from ${S}.txn_conversations where id = any($1::uuid[])`, [MADE.conversations])
  }
  try { await fastify?.db?.sequelize?.close?.() } catch { /* closed */ }
  await pg.end()
  done()
}
