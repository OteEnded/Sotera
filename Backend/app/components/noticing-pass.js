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

// ⭐ ONE CONSTANT, TWO USES: the generation stamped onto every row written, and the generation a prior must
// carry to be shown back to her. Those two must never diverge — if the writer said 3 while the prior filter
// still said 2, the pass would quietly feed the previous generation's vocabulary into the new one and every
// row would still look correctly labelled. **Bump this whenever the prompt's vocabulary changes.**
//   1 — supplied the relation words, a routing menu, and `revise|nuance` as declared outcomes.
//   2 — no ontology vocabulary; decisions only; priors offered from the log. ⛔ Died of the STRUCTURE menu:
//       its four enumerated asks came back as headings in 15 of 15 non-empty rows across both generations.
//   3 — ⭐ **one open question and nothing else.** No slots, no OUTCOME line, no priors, no classification.
//       Her complete text is stored verbatim and a human reads it.
const PROMPT_GENERATION = 3

// ⛔ Parked at generation 3 — see the call site for the reasoning. Turning this on changes the prompt text,
// which makes it generation 4, not a configuration change.
const PRIORS_OFFERED = false

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

// ── ⏸⏸ THE SHADOW STORE — **PARKED AT GENERATION 3, NOT DELETED** ────────────────────────────────────
// `PRIORS_OFFERED = false`, so none of the machinery below runs today. It is kept, with its reasoning and
// its two hard-won corrections, because the decision to re-enable it is Ote's and the apparatus should be
// waiting when he makes it. ⚠️ Re-enabling changes the prompt text ⇒ **generation 4, not a setting.**
// Everything from here to `noticeAll` is the record of why it exists and what it already got wrong twice.
//
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
// ── ⛔⛔ AND THE GENERATION BOUNDARY APPLIES TO THE PRIORS, OR THE GUARD IS COSMETIC ──────────────────
// The purity check asserts the prompt TEMPLATE carries no ontology vocabulary. The priors are pasted into
// that template verbatim, so a prior can carry vocabulary the template is forbidden to have — and the
// gen-1 bodies are full of it: measured across the 17 gen-1 rows, **`refines` 27 · `qualifies` 25 ·
// `replaces` 25 · `sits alongside` 23**. Those are MY four words in her voice, which is the withdrawn
// finding's exact mechanism, now counted.
//
// ⇒ Offering a gen-1 body back would re-inject the contaminated vocabulary into a **generation-2** prompt
// and stamp the answer `promptGeneration: 2`. The row would look clean and would not be. So priors are
// filtered to the CURRENT generation: her own words come back to her, but only the ones she produced under
// a prompt that did not feed them to her.
//
// ⚠️ THE COST IS REAL AND IS ACCEPTED. The shadow store therefore starts EMPTY, so *"does she build on her
// own prior thought?"* stays unobservable until at least two gen-2 proposals exist in the same room. That
// delay is the price of a boundary that means something. ⛔ Do not shortcut it by backfilling old rows.
//
// ⭐ NOTE WHAT IS **NOT** BANNED HERE: her own vocabulary, whatever it is. If a gen-2 proposal of hers says
// "replaces" with nobody having offered the word, that is a finding, and showing it back to her is the
// experiment rather than a leak. The rule is about WHO AUTHORED the word, not which word it is.
//
// ⚠️ EXPORTED FOR THE PURITY CHECK, not for callers. `noticing-prompt-purity-check.mjs` asserts that what
// this returns carries her words and a date and nothing of ours — an assertion that cannot be written
// against a private function, and the leak it guards (`outcome=save` stapled to her past thought) already
// shipped once.
export function priorProposalsFor(records, conversationUserId, limit = 6, generation = PROMPT_GENERATION) {
  return records
    // ⚠️ `=== generation`, not `>=`. An unstamped row (the stale-code failure produced three) has an
    // UNKNOWN generation, and an unknown provenance must not be treated as a clean one.
    .filter((r) => r.promptGeneration === generation
      && r.userId === conversationUserId && r.outcome !== 'nothing' && r.body)
    .slice(-limit)
    // ⚠️⚠️ HER OWN WORDS AND A DATE. NOTHING ELSE.
    // The first version prefixed each prior with `outcome=save` / `outcome=nuance` — **our machine
    // vocabulary, tagged onto her own past thought.** Ote caught it: *"I want her own history visible, but
    // I don't want to teach her that 'memory proposal' is the category she is supposed to produce."*
    // A label like that does exactly that: it tells her these are entries of a type, which invites her to
    // produce more entries of that type. ⛔ So the tag is gone. She sees what she said, and when.
    //
    // ⭐ The distinction worth keeping straight: DECISION words (save / decline / revise) are about what to
    // DO and the pass needs one parseable signal. ONTOLOGY words (self / lesson / practice / experience)
    // are about what KIND of thing it is — and those have never been introduced and must not be.
    .map((r) => ({
      abstraction: `${r.at?.slice(0, 10) ?? 'earlier'} — ${String(r.body).replace(/\s+/g, ' ').slice(0, 400)}`,
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

  const tally = { scanned: 0, asked: 0, thin: 0, unchanged: 0, flagged: 0, unclassified: 0, probe: 0, byOutcome: {} }
  for (const c of convos) {
    if (tally.asked >= maxConvos) break
    tally.scanned++
    // ⛔⛔ A CHECK'S FIXTURE IS NOT AN EXPERIENCE. `settings.probe` is stamped in ONE place — the test
    // harness's HTTP client — so no check can forget it. Ote: *"If a fixture conversation can enter the
    // population, that's contamination and should be treated as such rather than silently filtered after
    // the fact."* ⇒ it is COUNTED and logged, never dropped quietly.
    //
    // ⚠️ Until now only the `messages >= 4` thin gate kept fixtures out, and one was sitting at 2 messages.
    // ⛔ AND THIS IS NOT A TOPIC FILTER: a conversation of hers that is ABOUT memory stays in. Deciding
    // which of her conversations count as real life would be a worse imposition than the prompt ever was.
    if (c.settings?.probe === true) { tally.probe++; continue }
    const [top] = await db.txn_messages.findAll({
      where: { conversation_id: c.id }, attributes: ['rolling_id'],
      order: [['rolling_id', 'DESC']], limit: 1, raw: true,
    })
    const upTo = top?.rolling_id ?? 0
    if (!upTo || upTo <= (marks.get(c.id) ?? 0)) { tally.unchanged++; continue }
    try {
      // ⛔⛔ NO PRIORS AT GENERATION 3 — and this is a deliberate loss, not an oversight.
      // The shadow store exists so *"does she encounter her own prior thought and relate to it?"* is
      // observable at all, and that is one of the four things Ote named as worth watching. It is parked
      // anyway, because generation 3 exists to sample her STRUCTURE and **her own earlier answer shows her
      // a structure.** One echo and "her natural shape" becomes "her first answer's shape, repeated" —
      // the gen-2 failure with the template supplied by her instead of by me.
      //
      // ⭐ His own words settle which loss to take: *"Repeated use across genuinely independent
      // conversations is what would make it interesting."* **Independence is the property we need**, and
      // priors destroy it.
      //
      // ⏸ SO SELF-REFERENCE IS NOT OBSERVABLE IN THE PASS RIGHT NOW. That is a real gap and it is HIS to
      // close — turning priors back on changes the prompt text, which makes it generation 4, not a setting.
      // ⓘ Meanwhile it remains observable in ordinary conversation, where she reaches for her own history
      // through `recall_own_memory` rather than being handed it.
      const priors = PRIORS_OFFERED ? priorProposalsFor(records, c.user_id) : []
      const lessons = priors.length ? { recall: async () => ({ items: priors }) } : null
      const r = await noticeConversation(fastify, { conversationId: c.id, dryRun: true, lessons })
      if (r.skipped) { tally.thin++; continue }
      tally.asked++
      // ⛔ `byOutcome` stays EMPTY at generation 3 — there is no outcome to count. A tally that invented one
      // would be the classifier we just removed, wearing a metric's clothes.
      if (r.unclassified) tally.unclassified++
      else tally.byOutcome[r.outcome] = (tally.byOutcome[r.outcome] ?? 0) + 1
      if (r.needsHumanReview) tally.flagged++
      mkdirSync(OUT_DIR, { recursive: true })
      appendFileSync(OUT_FILE, `${JSON.stringify({
        at: new Date().toISOString(),
        conversationId: c.id, upTo, who: r.who, messages: r.messages, model: r.model,
        // ⭐⭐ THE CONVERSATION'S SUBJECT, RECORDED SO THE POPULATION CAN BE STRATIFIED WITHOUT ANYONE
        // CLASSIFYING ANYTHING. Measured on the first 18 rows: **8 of them came from conversations whose
        // subject is memory, rooms or retrieval** — 4 from *"Pin And Quote Four Specific Memory IDs"* and 4
        // from my own memory probes. ⚠️ That is a topic bias invisible to a prompt grep: when she produces
        // memory-flavoured output, part of the cause is that the conversation was about memory.
        // ⛔ It is recorded, NOT filtered — the title is data we already have, so this costs no judgement,
        // whereas excluding a subject would be us curating her life.
        title: c.title ?? null,
        // ⭐ WHICH PROMPT PRODUCED THIS. Generation 1 supplied the relation words, a routing menu, and
        // `revise|nuance` as declared outcomes — so gen-1 records say more about our prompt than about her.
        // Ote: *"keep the old records marked as coming from the previous prompt generation rather than
        // relabelling them. I want the history of the experiment preserved, including where we accidentally
        // taught her the vocabulary."* ⛔ Never rewrite an old row to the new vocabulary.
        promptGeneration: PROMPT_GENERATION,
        // ⭐ Recorded so the shadow store can find her earlier proposals next time, and so a reviewer can
        // see WHAT she was shown when she produced this one — a proposal that references a prior is only
        // interesting if you know the prior was in front of her.
        userId: c.user_id,
        // ⛔⛔ NO `outcome`, NO `declared`, NO `body` AT GENERATION 3. There is no OUTCOME line to read, and
        // a field named `outcome` holding a value we inferred would be read a week from now as a value she
        // gave. `unclassified: true` is the honest record: **nobody has read this yet.**
        unclassified: r.unclassified === true,
        constitutiveFlags: r.constitutiveFlags, needsHumanReview: r.needsHumanReview,
        priorLessonsOffered: r.priorLessonsOffered,
        // ⭐⭐ HER COMPLETE ANSWER, VERBATIM — Ote: *"please preserve the whole response/reasoning, not just
        // the final candidate. If she spontaneously invents a distinction like 'this isn't really a
        // lesson…', that's exactly the evidence we're looking for."* ⇒ nothing is stripped, nothing is
        // summarised, no leading line is cut off, and her structure survives whatever it turns out to be.
        text: r.text,
        // ⓘ So a reviewer can tell a SHORT answer from a CLIPPED one. A truncated reply stored as complete
        // would read as her having stopped there.
        finish: r.finish, maxTokens: r.maxTokens,
        wroteNothing: true,
      })}\n`, 'utf8')
    } catch (e) {
      await log(`[noticing] ${c.id} error: ${e.message}`, import.meta.url)
    }
  }
  return tally
}

export { OUT_FILE, PROMPT_GENERATION, PRIORS_OFFERED }
