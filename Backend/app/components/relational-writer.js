// SUBJECT-SIDE RELATIONAL WRITER — prototype.
//
// ⛔ NOT WIRED, and ⛔ **STRUCTURALLY UNABLE TO PERSIST** (see `persistRelationalRecords`).
//
// ── WHERE THIS RUNS, AND WHY IT MATTERS MORE THAN WHAT IT DOES ─────────────────────────────────────
// It runs INSIDE THE SUBJECT'S OWN SCOPE — over Hermes's conversations, while operating as Hermes's
// side of the system — where reading his rows is already legitimate and needs no widening at all.
//
//   ⛔ It is NEVER triggered by another person asking a question.
//
// That is the load-bearing decision. If Ote's turn could cause Hermes's rows to be read — even only to
// summarise them — then a cross-boundary read would exist, and every later guarantee would reduce to
// trusting whatever runs there. Instead, nothing ever crosses the boundary except an artifact that was
// already abstract before it existed.
//
// ── THE CONTRACT (RFC_RELATIONAL_KNOWLEDGE_LIFECYCLE §②) ───────────────────────────────────────────
//  1. SCOPE-BOUND      — takes `subjectUserId` and has no parameter for anyone else.
//  2. SINGLE OUTPUT    — returns `RelationalRecord[]` and nothing else. Never a string, never a summary,
//                        never a status message that could carry an excerpt.
//  3. CONVERGENT       — same window in, same records out; the store dedupes on (subject, tier, label).
//  4. ONE WRITER       — ⛔ UNRESOLVED. See below. This module does not resolve it and must not.
//  5. FAILS CLOSED     — any error, any unparseable model output, any unknown label ⇒ that conversation
//                        contributes NOTHING. A partial abstraction is a leak with a bug attached.
//
// ── ✅ B16 RESOLVED (2026-08-19) — see the lane note below `DERIVER_VERSION` ────────────────────────
// The earlier revision blocked persistence outright because the one-writer question was open. It is now
// answered: relational records ride the SAME per-scope write lane as every other writer, and the lease
// is that lane rather than a token. No second writer was introduced, and no new authority exists.

import { validateRelationalRecord, STANCE_LABELS, STANCE_LABEL_KEYS, FREQUENCY_FLOOR, TAXONOMY_VERSION } from './relational-taxonomy.js'
import { buildMemoryV2, DEFAULT_PERSONA } from './memory-v2-host.js'

export const DERIVER_VERSION = 'stance-writer-0.1'

// ── ⭐ B16 / ONE WRITER: RESOLVED, AND WITHOUT A NEW AUTHORITY ──────────────────────────────────────
//
// The single-writer architecture already existed; it just had no relational door. `@ote/memory`'s
// `memory-v2-service.js` keeps `WRITE_LANES` — a MODULE-LEVEL map keyed by `(persona, userId)` — and
// every writer in a scope appends to that one promise chain via `mem.enqueue`. It is module-level on
// purpose, and the comment there records why: while the queue was a per-instance closure, the model's
// tool service and the automatic capture path each got their own chain, and a reproduction wrote two
// live rows to an IDENTICAL slot key. **Keying the lane by scope is what makes "one writer" true.**
//
// So relational records do NOT get a writer. They get a **commit function on the existing lane**:
//
//   ordinary tool writes ─┐
//   automatic capture    ─┼─→  WRITE_LANES[(persona,userId)]  ─→  serialized, FIFO, per scope
//   relational records   ─┘
//
// ⭐ AND THE LEASE IS NOT A TOKEN — IT IS THE LANE ITSELF, ALREADY BOUND TO A SCOPE.
// A token can be forged, copied, or passed to the wrong call. A lane obtained from
// `buildMemoryV2({ userId: subjectUserId })` cannot: holding it IS proof you are operating in that
// subject's scope, because that is the only way to construct it. This makes the "no cross-account
// parameter" rule structural rather than a code-review habit — there is no way to *ask* to write into
// someone else's scope, only to already be in one.
//
// ⚠️ WHAT IS STILL NOT DONE, on purpose: nothing schedules this. No cron entry, no per-turn hook, no
// background fork. Reflection stays off. The writer runs only when something calls it explicitly.

/**
 * Mint a write lease for ONE subject. ⭐ There is no `otherUserId` parameter and cannot be one: the lease
 * carries the lane for `subjectUserId`, and `persistRelationalRecords` refuses records about anyone else.
 *
 * @returns {Promise<null | {enqueue: Function, subjectUserId: string, subjectPersonId: string}>}
 */
export async function createRelationalWriteLease({ fastify, subjectUserId, persona = DEFAULT_PERSONA } = {}) {
  if (!fastify?.db || !subjectUserId) return null
  const seq = fastify.db.txn_memories.sequelize
  const { schema } = fastify.db.txn_memories.getTableName()
  if (!schema) throw new Error('relational-writer: no project schema configured — refusing to guess one')
  const [row] = await seq.query(
    `SELECT person_id::text AS pid FROM "${schema}"."mst_users" WHERE id = :subjectUserId`,
    { replacements: { subjectUserId }, type: seq.QueryTypes.SELECT },
  )
  if (!row?.pid) return null // a subject with no person row has no relationship to record
  // ⭐ THE SAME LANE every other writer in this scope uses. Not a new queue, not a new authority.
  const mem = buildMemoryV2(fastify, { userId: subjectUserId, persona })
  if (typeof mem?.enqueue !== 'function') throw new Error('relational-writer: memory service exposes no write lane — refusing to write off-lane')
  return { enqueue: mem.enqueue, subjectUserId, subjectPersonId: row.pid }
}

/**
 * The abstraction prompt. ⭐ It receives ONE conversation and may reply with NOTHING BUT LABELS.
 * Note what it never asks for: topics, summaries, facts about the person, or free text of any kind.
 * The question is only ever *"what did SOTERA do differently here?"*
 */
function buildPrompt(transcript) {
  return [
    'Below is one conversation between Sotera (the assistant) and a person.',
    '',
    'Your ONLY task: decide which of the following statements describe how SOTERA HERSELF worked in this',
    'conversation. These are facts about Sotera\'s own practice, NOT about the person she was talking to.',
    '',
    ...STANCE_LABEL_KEYS.map((k) => `  ${k} = "${STANCE_LABELS[k]}"`),
    '',
    'Reply with ONLY a JSON array of matching label strings, e.g. ["i-keep-answers-short"].',
    'Reply with [] if none clearly apply. Do not explain. Do not add labels that are not in the list.',
    'Never describe the person, what they said, their work, or their circumstances.',
    '',
    '--- conversation ---',
    transcript,
  ].join('\n')
}

async function askModel(prompt, { model, endpoint, timeoutMs }) {
  // ⭐ TEMPERATURE 0. This is a CLASSIFICATION against a closed set, not generation — sampling buys
  // nothing and costs stability. Measured 2026-08-19 at default temperature: two runs over the SAME
  // seven conversations produced one record and then none, because labels hovered on either side of the
  // frequency floor. The store's convergence guarantee is about writes; it says nothing about whether
  // the DERIVER is stable, and those are different properties that "idempotent" quietly conflates.
  const r = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, messages: [{ role: 'user', content: prompt }], stream: false, think: false,
      options: { temperature: 0, top_p: 1, seed: 1 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`model ${r.status}`)
  return (await r.json()).message?.content ?? ''
}

/**
 * ⭐ FAILS CLOSED. Parse the model's reply into known labels, or into nothing at all.
 * Anything unexpected — prose, a code fence with commentary, an unknown label, a non-array — yields [].
 * PURE, so the failure behaviour is testable without a model.
 */
export function parseLabels(reply) {
  const m = String(reply ?? '').match(/\[[^\]]*\]/)
  if (!m) return []
  let arr
  try { arr = JSON.parse(m[0]) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const known = arr.filter((x) => typeof x === 'string' && STANCE_LABEL_KEYS.includes(x))
  // ⚠️ If the model invented ANY label, treat the whole reply as untrusted rather than keeping the
  // "good" half. A model that fabricated one item is not a reliable source for the others.
  if (known.length !== arr.length) return []
  return [...new Set(known)]
}

/**
 * Derive tier-C stance records for ONE subject, from that subject's OWN conversations.
 *
 * @param {object} deps
 * @param {object} deps.db              Sequelize models bag
 * @param {string} deps.subjectUserId   ⭐ the SUBJECT's account. There is deliberately no other user param.
 * @param {object} [deps.model]         { model, endpoint, timeoutMs }
 * @param {number} [deps.maxConversations]
 * @returns {Promise<{records: Array, scanned: number, contributed: number, skipped: number}>}
 */
export async function abstractStance({
  db, subjectUserId, log = null,
  model = { model: 'qwen3.6:35b', endpoint: 'http://127.0.0.1:11434/api/chat', timeoutMs: 180000 },
  maxConversations = 25,
} = {}) {
  if (!db || !subjectUserId) return { records: [], scanned: 0, contributed: 0, skipped: 0, reasons: {}, support: {} }
  const seq = db.txn_memories.sequelize
  const { schema } = db.txn_memories.getTableName()
  if (!schema) throw new Error('relational-writer: no project schema configured — refusing to guess one')
  const Q = (sql, r) => seq.query(sql, { replacements: r, type: seq.QueryTypes.SELECT })

  // ⭐ SCOPE-BOUND QUERY. Every row comes from `c.user_id = :subjectUserId`. There is no path in this
  // module that reads anyone else's conversation, and no parameter that could name one.
  const convs = await Q(
    `SELECT c.id::text FROM "${schema}"."txn_conversations" c
      WHERE c.user_id = :subjectUserId AND c.incognito = false
      ORDER BY c.updated_at DESC LIMIT :maxConversations`, { subjectUserId, maxConversations })

  const [person] = await Q(
    `SELECT person_id::text AS pid FROM "${schema}"."mst_users" WHERE id = :subjectUserId`, { subjectUserId })
  if (!person?.pid) return { records: [], scanned: 0, contributed: 0, skipped: convs.length }

  const support = new Map() // label -> count of DISTINCT conversations supporting it
  // ⭐ WHY the pass skipped things, as REASON CODES. The first version swallowed every failure with a
  // bare `catch { skipped++ }`, so a systematically broken abstractor — a dead endpoint, a model that
  // never returns valid JSON — looked exactly like "nothing worth recording". Failing closed is right;
  // failing closed SILENTLY is how you never find out.
  //
  // ⚠️ REASON CODES, NOT MESSAGES. The writer is the only component that sees both sides of the privacy
  // boundary, and its own design says it must have no output channel except the record — a LOG IS AN
  // OUTPUT CHANNEL. A raw error string can embed a model reply, and a model reply can embed the
  // conversation. So: a fixed vocabulary of causes, aggregated, with no ids and no text.
  const reasons = { empty: 0, 'model-error': 0, unparseable: 0, 'no-labels': 0 }
  let contributed = 0, skipped = 0
  let windowStart = null, windowEnd = null

  for (const c of convs) {
    let labels = []
    try {
      const msgs = await Q(
        `SELECT role, content, created_at::date::text AS d FROM "${schema}"."txn_messages"
          WHERE conversation_id = :cid AND role IN ('user','assistant') ORDER BY created_at LIMIT 60`, { cid: c.id })
      if (!msgs.length) { skipped++; reasons.empty++; continue }
      for (const m of msgs) {
        if (!windowStart || m.d < windowStart) windowStart = m.d
        if (!windowEnd || m.d > windowEnd) windowEnd = m.d
      }
      const transcript = msgs.map((m) => `${m.role}: ${String(m.content).slice(0, 1200)}`).join('\n')
      const reply = await askModel(buildPrompt(transcript), model)
      labels = parseLabels(reply)
      // Distinguish "the model answered and nothing applied" from "the model answered unusably" — the
      // first is a normal outcome, the second is a broken abstractor wearing the same face.
      if (!labels.length && !/^\s*\[\s*\]\s*$/.test(String(reply).trim())) reasons.unparseable++
    } catch {
      // ⭐ FAIL CLOSED, per conversation. One bad conversation contributes nothing and does not abort
      // the pass; it also never contributes a partial result.
      // ⚠️ The error object is deliberately NOT captured — it can embed a model reply, and a model reply
      // can embed the conversation. The cause is recorded as a code, never as a message.
      skipped++
      reasons['model-error']++
      continue
    }
    if (!labels.length) { skipped++; reasons['no-labels']++; continue }
    contributed++
    for (const l of new Set(labels)) support.set(l, (support.get(l) || 0) + 1)
  }

  // ⭐ FREQUENCY FLOOR. A label must recur across ≥ FREQUENCY_FLOOR distinct conversations. One
  // conversation can never mint durable knowledge — which is what stops a single exchange becoming a
  // lasting fact, without anyone needing to detect that it was sensitive.
  const records = []
  for (const [label, count] of support) {
    if (count < FREQUENCY_FLOOR) continue
    const candidate = {
      subjectPersonId: person.pid, tier: 'stance', label,
      conversationCount: count, windowStart, windowEnd,
    }
    const v = validateRelationalRecord(candidate)
    if (v.ok) records.push(v.record) // ⛔ invalid candidates are DROPPED, never repaired
  }
  // `support` is diagnostics for choosing the floor (open question Q1). It is LABELS AND COUNTS ONLY —
  // the same closed vocabulary, so it carries no more information than a record does.
  const summary = {
    records, scanned: convs.length, contributed, skipped, reasons,
    support: Object.fromEntries([...support].sort((a, b) => b[1] - a[1])),
  }
  // ⚠️ Structured, aggregate, content-free. `records.length` and reason COUNTS only — never a label list
  // at this level and never a message, so the operational channel cannot become a disclosure channel.
  log?.debug?.({ scanned: summary.scanned, contributed, skipped, reasons, wouldRecord: records.length }, '[relational] stance pass')
  if (reasons['model-error'] || reasons.unparseable) {
    log?.warn?.({ modelError: reasons['model-error'], unparseable: reasons.unparseable, scanned: summary.scanned },
      '[relational] abstractor failures — a silent fail-closed looks identical to "nothing worth recording"')
  }
  return summary
}

/**
 * ⛔ BLOCKED BY DESIGN. Persisting relational records makes this a WRITER, and the one-writer
 * architecture (B16) is unresolved. Ote: *"Do not silently solve that by introducing a second writer.
 * Design the interface so it can plug into the eventual one-writer architecture, and document exactly
 * what remains blocked."*
 *
 * So: the signature is the one the eventual architecture will call, and it throws until that
 * architecture can issue a lease. A prototype that could write WOULD BE the second writer, whatever
 * its comments said.
 */
export async function persistRelationalRecords({ db, records = [], lease } = {}) {
  // ⭐ NO LANE, NO WRITE. This is the whole guard: you cannot persist without holding a lane that was
  // constructed inside the subject's scope. There is no token to forge and no parameter to point elsewhere.
  if (!lease || typeof lease.enqueue !== 'function' || !lease.subjectPersonId) {
    throw new Error('relational-writer: persistence requires a write lease from createRelationalWriteLease() — no off-lane writes')
  }
  if (!db) throw new Error('relational-writer: no db')

  // ⭐ SUBJECT-BOUND, ENFORCED AT THE COMMIT. A record about anyone other than the lease's subject is a
  // programming error, and it fails the WHOLE batch rather than being filtered out — silently dropping
  // the wrong-subject half would let a caller "mostly" write across scopes and never learn.
  const foreign = records.filter((r) => r?.subjectPersonId !== lease.subjectPersonId)
  if (foreign.length) throw new Error(`relational-writer: ${foreign.length} record(s) are about a different person than the lease — refusing the entire batch`)

  // Defence in depth: re-validate at the commit boundary. The abstractor already validated, but the
  // commit must not trust its caller.
  for (const r of records) {
    const v = validateRelationalRecord(r)
    if (!v.ok) throw new Error(`relational-writer: invalid record at commit — ${v.reason}`)
  }
  if (!records.length) return { written: 0, skipped: 0 }

  const seq = db.txn_memories.sequelize
  const { schema } = db.txn_memories.getTableName()

  // ⭐ ON THE LANE, AND IN ONE TRANSACTION. Serialized against every other writer in this scope by the
  // enqueue; atomic against itself by the transaction. There is no state in which half a batch landed.
  return lease.enqueue('relational.persist', async () => {
    return seq.transaction(async (tx) => {
      for (const r of records) {
        await seq.query(
          `INSERT INTO "${schema}"."txn_relational_records"
             (subject_person_id, tier, label, conversation_count, window_start, window_end, deriver_version, taxonomy_version)
           VALUES (:subjectPersonId, :tier::persona_sotera.relational_tier, :label::persona_sotera.relational_label,
                   :conversationCount, :windowStart, :windowEnd, :deriverVersion, :taxonomyVersion)
           ON CONFLICT (subject_person_id, tier, label) WHERE subject_person_id IS NOT NULL
           DO UPDATE SET conversation_count = EXCLUDED.conversation_count,
                         window_start       = LEAST(txn_relational_records.window_start, EXCLUDED.window_start),
                         window_end         = GREATEST(txn_relational_records.window_end, EXCLUDED.window_end),
                         derived_at         = now(),
                         deriver_version    = EXCLUDED.deriver_version,
                         taxonomy_version   = EXCLUDED.taxonomy_version,
                         updated_at         = now()`,
          { replacements: { ...r, deriverVersion: DERIVER_VERSION, taxonomyVersion: TAXONOMY_VERSION }, transaction: tx },
        )
      }
      return { written: records.length, skipped: 0 }
    })
  })
}

export const __internals = { buildPrompt, DERIVER_VERSION, TAXONOMY_VERSION }
