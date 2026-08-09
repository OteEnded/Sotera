// Working Memory — L4 ACTIVE session state (roadmap step 6). The assistant's live per-conversation
// CURRENT MENTAL CONTEXT: what it's focused on, its plan, open questions, the threads it's actively
// tracking. It answers "what am I thinking about in THIS chat right now" — distinct from durable recall
// ("what do I know"), from the rolling `summary` ("the compressed past of this chat"), AND from Todo
// ("things to do"). Working Memory is mental context, not a task list — the schema keeps them separate.
// Ephemeral + CONVERSATION-LOCAL: stored on conversations.working_memory JSONB, cleared when the chat
// goes cold (idle-decay). Never crosses conversations, never enters the durable memory stores, so it is
// orthogonal to the memory master switch / incognito (like the Todo rail).
//
// EXPLICIT SCHEMA (Ote — define it so the write tools operate on structure, never arbitrary blobs):
//   { focus, plan, openQuestions[], activeItems[], completedItems[], updatedAt }
// Population is HYBRID: the model MAINTAINS it via operation-based tools (WM2) and the route LIGHTLY
// auto-seeds a provisional focus from the current user INTENT (deterministic extraction, not the
// verbatim message) so it's never empty before the model engages.

import { registerHostService } from './runtime.js'
import { getSetting } from '../settings/index.js'

const MAX_ITEMS = 12
const MAX_Q = 8
const clip = (s, n) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, n)
const asList = (v, n) => (Array.isArray(v) ? v.map((s) => clip(s, 200)).filter(Boolean).slice(0, n) : [])
const dedupPush = (list, items, cap) => {
  for (const it of items) if (it && !list.some((x) => x.toLowerCase() === it.toLowerCase())) list.push(it)
  return list.slice(0, cap)
}

/** Normalize a raw working_memory JSONB → the explicit schema. Pure + defensive. Legacy `items` (WM1)
 *  maps to activeItems so an in-flight row upgrades cleanly. */
export function normalizeWorkingMemory(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  return {
    focus: clip(o.focus, 300) || null,
    plan: clip(o.plan, 500) || null,
    openQuestions: asList(o.openQuestions, MAX_Q),
    activeItems: asList(o.activeItems ?? o.items, MAX_ITEMS),
    completedItems: asList(o.completedItems, MAX_ITEMS),
    updatedAt: o.updatedAt || null,
  }
}

const isEmpty = (wm) => !wm.focus && !wm.plan && !wm.openQuestions.length && !wm.activeItems.length && !wm.completedItems.length

/**
 * Render the working set into a single L4 system block, or null when empty. `seedFocus` is the LIGHT
 * per-turn auto-seed (the current user INTENT) used only when the model hasn't set a focus yet — NOT
 * persisted. One line per non-empty schema field so the structure stays legible. Pure.
 */
export function renderWorkingMemory(rawWm, { seedFocus = null } = {}) {
  const wm = normalizeWorkingMemory(rawWm) // idempotent — always returns the full schema
  const focus = wm.focus || (clip(seedFocus, 300) || null)
  if (!focus && isEmpty(wm)) return null
  const lines = []
  if (focus) lines.push(`Focus: ${focus}`)
  if (wm.plan) lines.push(`Plan: ${wm.plan}`)
  if (wm.activeItems.length) lines.push(`Active: ${wm.activeItems.join('; ')}`)
  if (wm.openQuestions.length) lines.push(`Open questions: ${wm.openQuestions.join('; ')}`)
  if (wm.completedItems.length) lines.push(`Recently done: ${wm.completedItems.join('; ')}`)
  return 'Your working memory for this conversation — your current mental context (the live focus, plan, '
    + 'and threads you are tracking right now; distinct from long-term memory, from the earlier-history '
    + 'summary, and from your task list):\n' + lines.map((l) => `- ${l}`).join('\n')
}

// Deterministic INTENT extraction for the auto-seed (Ote: "Latest User Intent", not the verbatim
// message — and NOT an LLM). Strips leading politeness/framing ("can you", "let's continue", "please",
// "help me", …) and trailing punctuation, leaving the core ask. A lightweight heuristic, not NLP; the
// model refines the real focus via set-focus. Pure.
const LEAD_FILLERS = [
  /^(hey|hi|hello|ok|okay|so|well|um|uh|please|actually|now)\b[\s,]*/i,
  /^(can|could|would|will|can't|cant)\s+(you|we)\s+(please\s+)?/i,
  /^(do|does|did)\s+you\s+(think\s+you\s+(can|could)\s+)?/i,
  /^i(\s+would|'d)?\s+(like|want|need)\s+(you\s+)?to\s+/i,
  /^(let'?s|lets)\s+(continue|resume|start|begin|keep|go\s+on\s+with|talk\s+about|discuss|work\s+on|look\s+at)\s+/i,
  /^(help\s+me|help)\s+/i,
  /^(please|kindly|go\s+ahead\s+and|just)\s+/i,
]
export function extractIntent(text, { max = 120 } = {}) {
  const original = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!original) return null
  let s = original
  let prev
  do { prev = s; for (const re of LEAD_FILLERS) s = s.replace(re, ''); s = s.trim() } while (s !== prev)
  s = s.replace(/[?.!,\s]+$/, '').trim()
  if (!s) return original.slice(0, max) // all filler → fall back to the raw message
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, max)
}

/**
 * Build a Working Memory adapter bound to one conversation. Backed by conversations.working_memory.
 * get / update / clear. update is OPERATION-BASED (Ote) — it applies partial ops, never a whole-object
 * replace, so the tools compose and the schema can evolve. The WM2 update_working_memory tool consumes
 * this via the `workingMemory` host service.
 */
export function buildWorkingMemory(fastify, { conversationId = null } = {}) {
  const { txn_conversations } = fastify.db
  return {
    async get() {
      if (!conversationId) return normalizeWorkingMemory(null)
      const c = await txn_conversations.findByPk(conversationId)
      return normalizeWorkingMemory(c?.working_memory)
    },
    /**
     * Apply operations (all optional, composable): setFocus, setPlan, addItems (→ active),
     * completeItems (active → completed), removeItems (drop from active/open/completed),
     * addOpenQuestions, resolveOpenQuestions, clear. Returns the new normalized set.
     */
    async update(ops = {}) {
      if (!conversationId) return { ok: false, reason: 'no-conversation' }
      const c = await txn_conversations.findByPk(conversationId)
      if (!c) return { ok: false, reason: 'not-found' }
      if (ops.clear === true) { await c.update({ working_memory: null }); return { ok: true, cleared: true } }
      const wm = normalizeWorkingMemory(c.working_memory)
      if (typeof ops.setFocus === 'string') wm.focus = clip(ops.setFocus, 300) || null
      if (typeof ops.setPlan === 'string') wm.plan = clip(ops.setPlan, 500) || null
      const norm = (v) => (Array.isArray(v) ? v.map((s) => clip(s, 200)).filter(Boolean) : [])
      // complete: move matching active → completed
      const completing = norm(ops.completeItems)
      if (completing.length) {
        const lc = new Set(completing.map((s) => s.toLowerCase()))
        const moved = wm.activeItems.filter((it) => lc.has(it.toLowerCase()))
        wm.activeItems = wm.activeItems.filter((it) => !lc.has(it.toLowerCase()))
        wm.completedItems = dedupPush(wm.completedItems, [...moved, ...completing], MAX_ITEMS)
      }
      // remove: drop from every list
      const removing = norm(ops.removeItems)
      if (removing.length) {
        const lc = new Set(removing.map((s) => s.toLowerCase()))
        wm.activeItems = wm.activeItems.filter((it) => !lc.has(it.toLowerCase()))
        wm.openQuestions = wm.openQuestions.filter((q) => !lc.has(q.toLowerCase()))
        wm.completedItems = wm.completedItems.filter((it) => !lc.has(it.toLowerCase()))
      }
      wm.activeItems = dedupPush(wm.activeItems, norm(ops.addItems), MAX_ITEMS)
      wm.openQuestions = dedupPush(wm.openQuestions, norm(ops.addOpenQuestions), MAX_Q)
      const resolving = new Set(norm(ops.resolveOpenQuestions).map((s) => s.toLowerCase()))
      if (resolving.size) wm.openQuestions = wm.openQuestions.filter((q) => !resolving.has(q.toLowerCase()))
      wm.updatedAt = new Date().toISOString()
      const next = isEmpty(wm) ? null : { focus: wm.focus, plan: wm.plan, openQuestions: wm.openQuestions, activeItems: wm.activeItems, completedItems: wm.completedItems, updatedAt: wm.updatedAt }
      await c.update({ working_memory: next })
      return { ok: true, workingMemory: next }
    },
    async clear() {
      if (!conversationId) return { ok: false, reason: 'no-conversation' }
      const c = await txn_conversations.findByPk(conversationId)
      if (c) await c.update({ working_memory: null })
      return { ok: true, cleared: true }
    },
  }
}

/**
 * IDLE-DECAY (WM2) — clear the working set of conversations that have gone COLD (no message in
 * `idleDays`). Ote's rule: decay simply CLEARS, nothing else — it must NEVER feed Reflection or the
 * durable stores. Cheap single UPDATE; safe on the boot + daily maintenance pass. Returns { cleared }.
 */
export async function decayWorkingMemory(fastify, { idleDays } = {}) {
  const { txn_conversations, txn_messages } = fastify.db || {}
  if (!txn_conversations || !txn_messages) return { skipped: true, cleared: 0 }
  let days = idleDays
  if (!Number.isInteger(days)) { try { const v = getSetting(fastify.config, 'memory.workingMemoryIdleDays'); days = Number.isInteger(v) ? v : 3 } catch { days = 3 } }
  const seq = txn_conversations.sequelize
  const conv = (() => { const { tableName, schema } = txn_conversations.getTableName(); return schema ? `"${schema}"."${tableName}"` : `"${tableName}"` })()
  const msg = (() => { const { tableName, schema } = txn_messages.getTableName(); return schema ? `"${schema}"."${tableName}"` : `"${tableName}"` })()
  const rows = await seq.query(
    `UPDATE ${conv} c SET working_memory = NULL
       WHERE working_memory IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${msg} m WHERE m.conversation_id = c.id AND m.created_at > now() - make_interval(days => :days))
     RETURNING c.id`,
    { replacements: { days }, type: seq.QueryTypes.SELECT },
  )
  return { cleared: rows.length }
}

let initialized = false
/** Register the `workingMemory` host service (idempotent). The seam the update_working_memory tool
 *  consumes (WM2), bound per request to the current conversation. Mirrors initTodo / initReflection. */
export function initWorkingMemory() {
  if (initialized) return
  initialized = true
  registerHostService('workingMemory', ({ fastify: f, extras }) =>
    buildWorkingMemory(f, { conversationId: extras?.conversationId ?? null }))
}
