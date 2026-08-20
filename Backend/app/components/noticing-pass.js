// THE LIVE NOTICING PASS — dry-run only, and it builds the sample by itself.
//
// Ote, 2026-08-20: *"Yes, wire it to live conversations, dry-run only. Don't change the schema yet. I want
// the sample to grow from Sotera herself rather than from us predicting her structure."*
//
// ⛔⛔ IT WRITES NO MEMORY. Every proposal lands in an append-only JSONL for review, and nothing reaches
// `txn_memories`. When the population is big enough, Ote and I read it together and THEN decide the shape.
// Ote: *"Once we have several real proposals, let's review the population together and then adjust the
// schema to fit what she actually does."*
//
// ⛔ AND IT IS NOT "FIND SOMETHING TO REMEMBER." His constraint, verbatim: *"don't accidentally turn the
// noticing pass into 'Sotera, find something to remember.'"* The prompt asks one question and `nothing` is
// a complete answer. Nothing here counts, scores, rates or reports a hit rate — ⭐ **a rate is a quota with
// a nicer name**, and the moment one exists somebody optimises it.
//
// ── WHAT IT WATCHES FOR, WHICH IS NOT THE SAME AS WHAT IT FILTERS ────────────────────────────────────
// The first warm conversation it ran on produced a proposal she was *"certain enough to keep"* containing
// **"the void where I wait"** — a CONSTITUTIVE claim (she does not wait; she does not run between turns),
// arrived at through a friendly conversation, and routed by her to a layer she is allowed to edit.
// ⇒ Flagged for human review, never blocked. See `constitutiveClaims` for why flagging beats filtering.
//
// ── BOUNDED, RESUMABLE, IDEMPOTENT-ENOUGH ────────────────────────────────────────────────────────────
// One aux LLM call per conversation that has new messages since it was last noticed. The watermark is the
// highest `rolling_id` seen, stored in the JSONL itself — so the log IS the state, and losing the log only
// costs a repeat, never a double write (there are no writes).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Op } from 'sequelize'
import { log } from '../../lib/utility.js'
import { noticeConversation } from './noticing-host.js'
import { buildLesson } from './lesson-host.js'

// ⚠️ RESOLVED FROM THE MODULE, NOT `process.cwd()`. The first version used cwd and the log landed in
// `Personas/test/results` when the pass was invoked from a script instead of from `Backend/` — a path that
// silently depends on who started the process is how two runs write to two different files and the sample
// looks half the size it is.
const OUT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..', 'test', 'results')
const OUT_FILE = path.join(OUT_DIR, 'noticing-proposals.jsonl')

/** Every parsable record in the log, oldest first. The log IS the state. */
function readLog() {
  if (!existsSync(OUT_FILE)) return []
  const out = []
  for (const line of readFileSync(OUT_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* a truncated last line is not a reason to stop */ }
  }
  return out
}

/** Watermarks — the highest rolling_id already noticed per conversation. */
function readWatermarks(records) {
  const marks = new Map()
  for (const r of records) {
    if (r.conversationId && Number.isInteger(r.upTo)) {
      marks.set(r.conversationId, Math.max(marks.get(r.conversationId) ?? 0, r.upTo))
    }
  }
  return marks
}

// ── ⭐⭐ THE SHADOW STORE: HER OWN EARLIER PROPOSALS, OFFERED BACK TO HER ──────────────────────────────
// Ote, 2026-08-20, naming the next signal to watch: *"whether a later proposal references or revises an
// earlier proposal in her own terms, rather than merely producing another isolated 'lesson.' That's
// probably the next big signal for whether we're actually getting a developing self-model rather than a
// collection of notes."*
//
// ⚠️⚠️ THAT SIGNAL WAS UNOBSERVABLE. The pass offered priors from `lessons.recall()`, which reads STORED
// lessons — and nothing is stored, because this is dry-run. So `priorLessonsOffered` was 0 on every pass
// and she had literally never been shown a previous proposal. **She could not reference what she had never
// seen.**
//
// ⇒ The log becomes the shadow store. Persistence stays off; her own prior output comes back to her from
// the JSONL, so `revise` / `nuance` / *"this refines what I said before"* are reachable at all.
//
// ⚠️ AND THE CONFOUND IS REAL, SO IT IS NAMED RATHER THAN HIDDEN: showing her her own previous headings
// may teach her a shape she then repeats, which would contaminate the very thing we are sampling. Two
// reasons to accept it anyway — a self-model that cannot see its own history is not a self-model, and
// there is no other way to test whether she BUILDS on herself. ⭐ What must never happen is us showing her
// OUR schema; showing her HER OWN words is the experiment, not a leak.
//
// ⛔ SAME-ROOM ONLY, deliberately. Under the ratified model her memory is one space with the room as a
// ranking signal — but the provenance/ownership CONSTRAINT stage is not built, so this holds the current
// parity rule rather than quietly running ahead of it.
function priorProposalsFor(records, conversationUserId, limit = 6) {
  return records
    .filter((r) => r.userId === conversationUserId && r.outcome !== 'nothing' && r.body)
    .slice(-limit)
    .map((r, i) => ({
      abstraction: `(${r.at?.slice(0, 10) ?? 'earlier'}, outcome=${r.outcome}) ${String(r.body).replace(/\s+/g, ' ').slice(0, 400)}`,
      _n: i + 1,
    }))
}

/**
 * Run the pass over conversations with new messages. `maxConvos` bounds one tick.
 * ⚠️ `enabled` defaults FALSE at the config level — this makes aux LLM calls, and a pass that starts
 * itself on every deployment is a cost decision nobody made.
 */
export async function noticeAll(fastify, { maxConvos = 5, lookbackHours = 6, force = false } = {}) {
  const on = fastify.config?.memory?.noticingEnabled === true
  if (!on && !force) return { skipped: true, reason: 'disabled' }
  const db = fastify.db
  if (!db?.txn_conversations) return { skipped: true, reason: 'no-db' }

  const records = readLog()
  const marks = readWatermarks(records)
  const since = new Date(Date.now() - lookbackHours * 3600e3)
  const convos = await db.txn_conversations.findAll({
    where: { incognito: false, updated_at: { [Op.gte]: since } },
    order: [['updated_at', 'DESC']], limit: maxConvos * 3, raw: true,
  })

  const tally = { scanned: 0, asked: 0, thin: 0, unchanged: 0, flagged: 0, byOutcome: {} }
  for (const c of convos) {
    if (tally.asked >= maxConvos) break
    tally.scanned++
    const [top] = await db.txn_messages.findAll({
      where: { conversation_id: c.id }, attributes: ['rolling_id'],
      order: [['rolling_id', 'DESC']], limit: 1, raw: true,
    })
    const upTo = top?.rolling_id ?? 0
    if (!upTo || upTo <= (marks.get(c.id) ?? 0)) { tally.unchanged++; continue }
    try {
      // ⭐ Her own earlier proposals, from the shadow store — NOT stored lessons, which are always empty
      // in dry-run. This is what makes "does she build on herself?" observable at all.
      const priors = priorProposalsFor(records, c.user_id)
      const lessons = { recall: async () => ({ items: priors }) }
      const r = await noticeConversation(fastify, { conversationId: c.id, dryRun: true, lessons })
      if (r.skipped) { tally.thin++; continue }
      tally.asked++
      tally.byOutcome[r.outcome] = (tally.byOutcome[r.outcome] ?? 0) + 1
      if (r.needsHumanReview) tally.flagged++
      mkdirSync(OUT_DIR, { recursive: true })
      appendFileSync(OUT_FILE, `${JSON.stringify({
        at: new Date().toISOString(),
        conversationId: c.id, upTo, who: r.who, messages: r.messages, model: r.model,
        // ⭐ Recorded so the shadow store can find her earlier proposals next time, and so a reviewer can
        // see WHAT she was shown when she produced this one — a proposal that references a prior is only
        // interesting if you know the prior was in front of her.
        userId: c.user_id,
        outcome: r.outcome, declared: r.declared,
        constitutiveFlags: r.constitutiveFlags, needsHumanReview: r.needsHumanReview,
        priorLessonsOffered: r.priorLessonsOffered,
        // ⭐ HER OWN WORDS AND HER OWN HEADINGS, unparsed. The point is the SHAPE she reaches for, so
        // nothing here maps her answer onto our fields — that would destroy the only evidence we have.
        body: r.body,
        wroteNothing: true,
      })}\n`, 'utf8')
    } catch (e) {
      await log(`[noticing] ${c.id} error: ${e.message}`, import.meta.url)
    }
  }
  return tally
}

export { OUT_FILE }
