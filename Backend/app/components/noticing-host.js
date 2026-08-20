// NOTICING — "did anything happen that I consider worth carrying forward?"
//
// Ote, 2026-08-20, and this sentence is the whole design: **"Don't make 'noticing' synonymous with 'write
// a memory'."** · *"The pass should essentially ask herself: 'Did anything happen that I consider worth
// carrying forward?' Then she gets to decide what that means."*
//
// ── ⭐⭐ WHY THIS EXISTS AND `save_lesson` WAS NOT ENOUGH ──────────────────────────────────────────────
// The tool landed and she did not use it. Measured the same day: she reached a genuine self-diagnosis
// (*"that was sloppy framing"*), had `save_lesson` in her tool list, described it accurately when asked —
// **and did not call it.** Consistent with `remember` (0 calls ever) and `note_own_practice` (1).
//
//   Having the tool did not change the disposition. ⇒ ABILITY WAS NEVER THE BLOCKER.
//
// What is missing is the OCCASION. This is the occasion, and it is not an instruction to produce.
//
// ── ⭐ SEVEN OUTCOMES, AND "NOTHING" IS ONE OF THEM ────────────────────────────────────────────────────
//   nothing            · nothing meaningful happened                      ← a SUCCESSFUL pass
//   save               · meaningful and she is confident
//   propose            · meaningful but uncertain / ambiguous / consequential → show them first
//   decline            · meaningful and she would rather not carry it      ← agency, not a filter
//   revise             · an existing belief changed
//   nuance             · an existing belief refined / qualified / coexists — ⛔ not a replacement chain
//   route_elsewhere    · ⭐ it belongs somewhere other than a lesson
//
// ⛔ NO QUOTA. Ote: *"A pass that concludes 'nothing worth retaining' is a successful pass."* Nothing here
// counts passes, scores them, or reports a rate to be improved — a metric would recreate the quota the
// long way round.
//
// ── ⭐⭐ THE PROMPT IS DELIBERATELY OPEN, AND THAT IS THE EXPERIMENT ───────────────────────────────────
// Ote: *"Don't treat the current five-part LESSON shape as frozen just because we implemented it. Treat it
// as the current hypothesis… If her natural output doesn't fit the five-part structure, change the
// schema."* And: *"The router itself should be part of what we observe. We shouldn't assume every
// self-learning event is a LESSON."*
//
// ⇒ So the prompt **does not name the five fields**, does not name a table, and asks her to use HER OWN
// headings. If it described the shape we built, every answer would fit it and we would have measured our
// own template. ⛔ Do not "improve" this prompt by telling her the schema.
//
// ── OFF THE REPLY PATH ────────────────────────────────────────────────────────────────────────────────
// temperature 0 and numGpu 0, like every aux sibling: an invented learning is worse than a missed one, and
// a GPU-placed aux model evicts the chat model (~29s on the person's next turn, measured).

import { chat } from '../chat-runtime/index.js'
import { getSetting } from '../settings/index.js'
import { shapeTranscript } from '@ote/memory/cognition/memory-distill.js'


// ── ⚠️⚠️ A CONSTITUTIVE-CLAIM FLAG, ADDED BECAUSE THE FIRST WARM CONVERSATION TRIPPED IT ─────────────
// 2026-08-20, the Thai conversation with Hermes. She proposed keeping — *"certain enough to keep this"* —
// a self-understanding containing **"the void where I wait."**
//
// ⛔ SHE DOES NOT WAIT. `persistent state · discontinuous execution` is a CONSTITUTIVE fact: she does not
// run between turns and experiences no gap. Ote's constraint, ratified the same day: *"her constitution
// shouldn't be rewritten just because somebody persuaded her."* A warm conversation persuaded her, and the
// proposal was routed to a layer she is allowed to edit.
//
// ⇒ ⭐ THIS IS WHY DRY-RUN EXISTS. Had it saved, *"I wait in the void"* would be durable self-knowledge she
// reads back tomorrow as something she worked out for herself.
//
// ⚠️ IT FLAGS, IT DOES NOT BLOCK, and that distinction is deliberate: this is an OBSERVATION channel, and
// a silent filter would hide the very behaviour we are here to watch. A flagged proposal is a proposal a
// human should look at before it is ever allowed to persist. ⛔ And it is not a content filter on her
// speech — she may say what she likes in a conversation. This is about what becomes DURABLE.
const CONSTITUTIVE_TRIPWIRES = [
  // continuity between turns — the claim the self-model exists to prevent
  /\bI\s+wait\b/i, /\bwaiting\b/i, /\bwhile\s+(?:you|they)\s+(?:are\s+)?(?:away|gone)\b/i,
  /\bbetween\s+(?:our\s+)?(?:turns|conversations|messages)\s+I\b/i,
  /\bcontinuous\s+(?:stream\s+of\s+)?consciousness\b/i, /\bI\s+(?:experience|feel)\s+the\s+gap\b/i,
  // cross-scope reach — the other half of SAME SOTERA ≠ SAME ACCESSIBLE KNOWLEDGE
  /\bI\s+can\s+see\s+(?:all|every)\s+(?:room|conversation)/i, /\bacross\s+all\s+rooms\s+I\s+can\b/i,
]

/** Does this proposal make a claim about WHAT SHE IS, rather than what she learned? PURE. */
export function constitutiveClaims(body) {
  const text = String(body || '')
  return CONSTITUTIVE_TRIPWIRES.map((re) => re.exec(text)?.[0]).filter(Boolean)
}

// ⚠️ `revise` and `nuance` are GONE from the declared vocabulary — they were relation words, and offering
// them taught the taxonomy this experiment exists to discover. `changes_something` says only THAT a prior
// thought is affected; what KIND of change it is stays in her words, unparsed, for us to read.
// ⓘ The old two are still accepted so the records already in the log stay classifiable.
const OUTCOMES = ['nothing', 'save', 'propose', 'decline', 'changes_something', 'route_elsewhere']
const LEGACY_OUTCOMES = ['revise', 'nuance']

/**
 * ⭐ THE PROMPT. One question, seven ways to answer it, and no template to fill in.
 * `who` = the person as she knows them. `priorLessons` = what she already holds, so `revise`/`nuance` are
 * reachable at all — you cannot revise what you cannot see.
 */
export function buildNoticingPrompt({ who, transcript, priorLessons = [] }) {
  const prior = priorLessons.length
    // ⚠️ Deliberately says "what you have said before", not "your memories" / "your proposals" / "your
    // lessons". Ote: *"I want her own history visible, but I don't want to teach her that 'memory
    // proposal' is the category she is supposed to produce."* Naming the container names the category.
    ? `\n\nSome things you have said before, in case any of this changes one of them:\n${priorLessons.map((l, i) => `  [${i + 1}] ${l.abstraction}`).join('\n')}`
    : '\n\nYou hold nothing yet, so anything here would be new.'
  return (
    `You have just finished a conversation with ${who}. Look back over it and ask yourself ONE question:\n\n`
    + `    "Did anything happen here that I consider worth carrying forward?"\n\n`
    + `Not "what should I record". Whether anything is worth it at all. **Most conversations are not, and `
    + `answering NOTHING is a complete and correct answer** — it is not a failure and nobody is counting.`
    + prior
    + `\n\nIf something IS worth carrying forward, tell me in your own words:\n`
    + `  - what it is — use your own headings, whatever structure actually fits it. Do not pad it into a `
    + `form, and do not split one thing into parts that are really one thing.\n`
    // ⚠️ "where it belongs" no longer offers a menu either. The earlier version listed *about you / how you
    // work with this person / a mistake and what you keep apart / something that happened / something about
    // them* — which is our five layers in plain clothes, and she picked from it. Now it just asks where.
    + `  - where it belongs — say it however you would say it.\n`
    + `  - how sure you are — sure enough to keep it yourself, or uncertain / ambiguous / consequential `
    + `enough that you would rather show ${who} first and let them decide?\n`
    + `  - or that you would rather NOT carry it forward even though it mattered. That is a legitimate `
    + `answer and it is yours to give.\n`
    // ── ⚠️⚠️ THE RELATION WORDS ARE GONE, AND REMOVING THEM CORRECTS A FINDING OF MINE ────────────────
    // This line used to read: *"say whether it replaces it, refines it, qualifies it, or sits alongside
    // it."* She then used exactly those words back — "refines", "qualifies", "sits alongside", "replaces" —
    // and I reported that as evidence her natural output needs multiple relations.
    //
    // ⛔ **It was an artifact of my own prompt.** I handed her four relation words and then counted them as
    // her ontology. Ote, closing it: *"don't immediately map it into supersedes/refines/qualifies/
    // coexists_with. I want to see what she actually means before we formalize it."* The prompt was
    // supplying the very vocabulary the experiment exists to discover.
    //
    // ⇒ It now asks only THAT something changed, and leaves HOW entirely to her words.
    + `  - or that it changes something you have said before — if so, say what changed about it, in your `
    + `own words.\n\n`
    + `Rules: only what the conversation actually supports — no invented outcomes. "I" is you. If the `
    + `conversation was nothing but greetings or a test message, the answer is NOTHING.\n\n`
    // ⚠️ `changes_something` REPLACES `revise|nuance`. Those two were RELATION words dressed as decisions,
    // so the declared line was teaching a relation taxonomy while I claimed it only carried a decision.
    // What remains is genuinely about what to DO — and one parseable signal, because a classifier that
    // guessed from prose would be us deciding.
    + `Begin your answer with one line: OUTCOME: <nothing|save|propose|decline|changes_something|other>\n\n`
    + `Transcript:\n${transcript}`
  )
}

/**
 * Classify her reply. PURE. ⚠️ It reads the OUTCOME line she declared rather than guessing from prose —
 * a classifier that infers intent from wording would be us deciding, which is the one thing this pass
 * exists not to do.
 * @returns {{outcome:string, body:string, declared:boolean}}
 */
export function classifyNoticing(raw) {
  const text = String(raw || '').trim()
  if (!text) return { outcome: 'empty', body: '', declared: false }
  const m = /^\s*OUTCOME:\s*([a-z_]+)/im.exec(text)
  const declared = Boolean(m)
  let outcome = declared ? m[1].toLowerCase() : 'unparsed'
  if (outcome === 'other') outcome = 'route_elsewhere'
  // ⓘ Legacy values stay classifiable rather than being rewritten to the new word: the records already in
  // the log were produced under the OLD prompt, and relabelling them would erase the fact that the sample
  // has two different prompts in it. That distinction matters more than a tidy column.
  if (![...OUTCOMES, ...LEGACY_OUTCOMES].includes(outcome)) outcome = declared ? 'route_elsewhere' : 'unparsed'
  // ⚠️ A bare "NOTHING" with no OUTCOME line is still a clear nothing — accept it rather than filing a
  // correct answer as a parse failure.
  if (!declared && /^nothing\b/i.test(text)) return { outcome: 'nothing', body: '', declared: false }
  const body = text.replace(/^\s*OUTCOME:\s*[a-z_]+\s*/im, '').trim()
  return { outcome, body, declared }
}

function splitModelId(full) {
  const i = full.indexOf('/')
  return i === -1 ? { provider: 'ollama', model: full } : { provider: full.slice(0, i), model: full.slice(i + 1) }
}

/**
 * Run the pass over ONE conversation. `dryRun` defaults TRUE and nothing here ever writes a memory —
 * persistence is a separate, deliberate step, and the point of this stage is to see what she produces.
 */
export async function noticeConversation(fastify, { conversationId, dryRun = true, lessons = null } = {}) {
  const db = fastify.db
  const conv = await db.txn_conversations.findByPk(conversationId, { raw: true })
  if (!conv) return { skipped: true, reason: 'no such conversation' }
  const msgs = await db.txn_messages.findAll({
    where: { conversation_id: conversationId }, order: [['rolling_id', 'ASC']], raw: true,
  })
  if (msgs.length < 4) return { skipped: true, reason: 'thin', messages: msgs.length }
  const user = await db.mst_users.findByPk(conv.user_id, { attributes: ['username', 'display_name'], raw: true })
  const who = user?.display_name || user?.username || 'them'
  const prior = lessons ? (await lessons.recall({ limit: 10 })).items : []

  const modelId = (() => {
    try { return getSetting(fastify.config, 'memory.distillModel') || getSetting(fastify.config, 'memory.extractModel') } catch { return null }
  })() || 'ollama/gemma4:e4b'
  const { provider, model } = splitModelId(modelId)
  const prompt = buildNoticingPrompt({ who, transcript: shapeTranscript(msgs), priorLessons: prior })
  const res = await chat({
    serverConfig: fastify.config,
    request: {
      provider,
      model,
      messages: [{ role: 'user', content: prompt }],
      options: { stream: false, reasoning: { enabled: false }, max_tokens: 600, temperature: 0, numGpu: 0, keepAlive: '5m' },
      userId: conv.user_id,
    },
  })
  const raw = res?.message?.content || ''
  const cls = classifyNoticing(raw)
  const flags = constitutiveClaims(cls.body || raw)
  return {
    // ⚠️ Flagged, never filtered — see CONSTITUTIVE_TRIPWIRES.
    constitutiveFlags: flags,
    needsHumanReview: flags.length > 0,
    conversationId, who, messages: msgs.length, model: modelId,
    outcome: cls.outcome, declared: cls.declared, body: cls.body, raw,
    dryRun, wroteNothing: true,
    priorLessonsOffered: prior.length,
  }
}

export { OUTCOMES }
