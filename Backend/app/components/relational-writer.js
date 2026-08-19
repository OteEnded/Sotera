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
// ── ⚠️ WHAT REMAINS BLOCKED, EXPLICITLY ────────────────────────────────────────────────────────────
// Ote: *"The one-writer/B16 issue is still unresolved. Do not silently solve that by introducing a
// second writer."* So `persistRelationalRecords` REQUIRES a lease that no code can currently mint —
// `ONE_WRITER_LEASE` is `null` and there is no issuer. The persist path is written so the eventual
// architecture has something to plug into, and it **throws** if called today. That is deliberate: a
// prototype that could write would BE the second writer, whatever its comments said.

import { validateRelationalRecord, STANCE_LABELS, STANCE_LABEL_KEYS, FREQUENCY_FLOOR, TAXONOMY_VERSION } from './relational-taxonomy.js'

export const DERIVER_VERSION = 'stance-writer-0.1'

/** ⛔ No issuer exists. The one-writer architecture will mint these; until then, nothing can persist. */
export const ONE_WRITER_LEASE = null

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
  const r = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false, think: false }),
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
  db, subjectUserId,
  model = { model: 'qwen3.6:35b', endpoint: 'http://127.0.0.1:11434/api/chat', timeoutMs: 180000 },
  maxConversations = 25,
} = {}) {
  if (!db || !subjectUserId) return { records: [], scanned: 0, contributed: 0, skipped: 0 }
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
  let contributed = 0, skipped = 0
  let windowStart = null, windowEnd = null

  for (const c of convs) {
    let labels = []
    try {
      const msgs = await Q(
        `SELECT role, content, created_at::date::text AS d FROM "${schema}"."txn_messages"
          WHERE conversation_id = :cid AND role IN ('user','assistant') ORDER BY created_at LIMIT 60`, { cid: c.id })
      if (!msgs.length) { skipped++; continue }
      for (const m of msgs) {
        if (!windowStart || m.d < windowStart) windowStart = m.d
        if (!windowEnd || m.d > windowEnd) windowEnd = m.d
      }
      const transcript = msgs.map((m) => `${m.role}: ${String(m.content).slice(0, 1200)}`).join('\n')
      labels = parseLabels(await askModel(buildPrompt(transcript), model))
    } catch {
      // ⭐ FAIL CLOSED, per conversation. One bad conversation contributes nothing and does not abort
      // the pass; it also never contributes a partial result.
      skipped++
      continue
    }
    if (!labels.length) { skipped++; continue }
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
  return { records, scanned: convs.length, contributed, skipped }
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
export async function persistRelationalRecords({ db, records, lease } = {}) {
  if (lease !== ONE_WRITER_LEASE || lease === null) {
    throw new Error(
      'relational-writer: persistence is BLOCKED — the one-writer architecture (B16) is unresolved and '
      + 'no lease issuer exists. abstractStance() returns records for inspection; nothing may write them yet.',
    )
  }
  void db; void records
  throw new Error('unreachable: no lease can currently be minted')
}

export const __internals = { buildPrompt, DERIVER_VERSION, TAXONOMY_VERSION }
