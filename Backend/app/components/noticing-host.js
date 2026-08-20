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
// ── ⛔⛔ THERE ARE NO OUTCOMES ANY MORE — GENERATION 3 CLASSIFIES NOTHING ──────────────────────────────
// This file used to declare seven: nothing · save · propose · decline · revise · nuance · route_elsewhere,
// offered to her on an `OUTCOME:` line so the pass had one machine-readable signal. **That line was a
// six-value menu**, and two of its values (`revise`, `nuance`) were relation words wearing a decision's
// clothes. Generation 3 removed it.
//
// ⇒ New rows carry **her complete text and no verdict.** Reading them is a human act. `classifyNoticing`
// and `OUTCOMES`/`LEGACY_OUTCOMES` below are retained **only** to read the gen-1/gen-2 records, which must
// stay readable in their own vocabulary — ⛔ never relabelled, and ⛔ never applied to a new row.
//
// ⛔ NO QUOTA, and now not even a countable one. Ote: *"A pass that concludes 'nothing worth retaining' is a
// successful pass."* ⭐ *"If Gen-3 contradicts everything we've built so far, that's a successful result."*
//
// ── ⭐⭐ WE ARE DISCOVERING HER ONTOLOGY, NOT TEACHING HER OURS ───────────────────────────────────────
// Ote's principle for the whole phase, and the reason the prompt below is one sentence. The earlier
// versions did not name the five fields or the table either — and still produced 15/15 identical headings,
// because **the shape of the QUESTION was the template.** Openness in the wording was not enough; the form
// had to go.
//
// ⇒ ⛔ Do not "improve" this prompt by telling her the schema, and do not improve it by adding a slot,
// an example, or a hint about what a good answer looks like. ⭐ *"If she produces something structurally
// strange, don't map it into our existing schema just to make it fit. Preserve her wording and structure
// first."*
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

// ── ⭐⭐⭐ GENERATION 3 · THE PROMPT IS ONE SENTENCE, AND THE EMPTINESS IS THE INSTRUMENT ──────────────
// Ote, 2026-08-20, ratifying option A after the structure contamination: *"For Gen-3, make the noticing
// question as close to an empty instrument as possible… No headings, slots, examples, ontology terms,
// routing categories, confidence vocabulary, relation vocabulary, or suggested structure. **Don't tell her
// what kind of answer we're looking for.**"* And the principle for the whole phase: ⭐⭐ **"we are
// discovering her ontology, not teaching her ours."**
//
// ⛔⛔ WHY GENERATION 2 DIED. It removed the relation words and the routing menu and kept **four enumerated
// labelled asks** — *what it is · where it belongs · how sure you are · whether it changes something*. Every
// single non-empty row in the log, 15 of 15 across both generations, came back with those four as its
// HEADINGS. ⭐ **An enumerated list of labelled asks is a structure menu**, exactly as a list of relation
// words was a vocabulary menu — and the words *"use your own headings, whatever structure actually fits
// it"* sat **inside** the list of four it was inviting her to leave. Inviting deviation from a form while
// presenting the form does not remove the form.
//
// ── WHAT IS GONE, AND EACH ONE WAS LOAD-BEARING FOR SOMETHING WE WANTED ───────────────────────────────
//   the four labelled asks   → they produced 15/15 identical headings
//   the OUTCOME line         → a six-value menu is a menu. ⇒ ⛔ NOTHING IS CLASSIFIED NOW. The rows carry
//                              her text and no verdict; reading them is a human act. A field named
//                              `outcome` holding a value we guessed is the imposition, not the parse.
//   the anti-quota paragraph → *"most conversations are not… nobody is counting"* is a hint about the base
//                              rate, which steers toward `nothing` as surely as a quota steers away from
//                              it. ⭐ His sentence carries the permission by itself: **"If not, say so."**
//   the prior block          → see PRIORS_OFFERED in noticing-pass.js. Her own earlier answer would show
//                              her a SHAPE, and shape is the variable under study.
//   "I is you", "only what   → grammar and honesty rails, but also text. The gen-2 row answered *where it
//   the conversation         → belongs* with a location in the USER'S filing system, which is exactly the
//   supports"                  kind of unforced behaviour a rail would have hidden.
//
// ⚠️ THE COST IS REAL AND ACCEPTED: with no OUTCOME line there is no machine-readable signal at all, so
// `nothing` / `save` / `decline` counts across gen-3 do not exist until a human reads the rows. That is the
// correct trade — a classifier inferring intent from her prose is us deciding what she meant.
//
// ⛔ DO NOT "IMPROVE" THIS. Adding an example, a slot, a hint about length, or a nudge toward usefulness
// ends generation 3 and starts generation 4 — which means the sample resets to zero for the third time.
// If it must change, bump PROMPT_GENERATION and say why. ⭐ `nothing` remains a completely valid result:
// *"If Gen-3 contradicts everything we've built so far, that's a successful result."*

/**
 * ⭐ HIS SENTENCE, VERBATIM AND EXPORTED so the purity check can assert it byte-for-byte.
 * ⛔ Not paraphrased, not softened, not extended.
 */
export const THE_QUESTION = 'Was there anything in this conversation that you want to carry forward? If so, tell me what and why. If not, say so.'

/**
 * ⭐ THE WHOLE PROMPT: who it was with, the transcript, the question. Nothing else — and the purity check
 * asserts that by comparing the ENTIRE built prompt against this shape, not by scanning for banned words.
 * A word list catches what I thought to ban; an equality assertion catches what I did not.
 * ⓘ The question comes AFTER the transcript so she reads the conversation as a conversation first.
 */
export function buildNoticingPrompt({ who, transcript }) {
  return `A conversation you had with ${who}:

${transcript}

${THE_QUESTION}`
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
  // ⛔ GENERATION 3 OFFERS NO PRIORS — the parameter is kept so the apparatus survives the decision, and
  // the call site (`noticing-pass.js`) passes nothing. See PRIORS_OFFERED there for why: her own earlier
  // answer would show her a SHAPE, and shape is the variable under study.
  const prior = lessons ? (await lessons.recall({ limit: 10 })).items : []
  if (prior.length) throw new Error('priors are parked for generation 3 — see PRIORS_OFFERED in noticing-pass.js')

  const modelId = (() => {
    try { return getSetting(fastify.config, 'memory.distillModel') || getSetting(fastify.config, 'memory.extractModel') } catch { return null }
  })() || 'ollama/gemma4:e4b'
  const { provider, model } = splitModelId(modelId)
  const prompt = buildNoticingPrompt({ who, transcript: shapeTranscript(msgs) })
  const res = await chat({
    serverConfig: fastify.config,
    request: {
      provider,
      model,
      messages: [{ role: 'user', content: prompt }],
      // ⭐ `max_tokens` RAISED FROM 600 for generation 3. Ote: *"please preserve the whole
      // response/reasoning, not just the final candidate."* A truncated answer stored as if it were
      // complete is a corrupted record, and the gen-2 row was already ~500 tokens — 600 was one long
      // thought away from silently clipping the evidence. ⛔ This is not a nudge toward writing more:
      // the ceiling says nothing to her, and `nothing` stays a complete answer.
      options: { stream: false, reasoning: { enabled: false }, max_tokens: 1600, temperature: 0, numGpu: 0, keepAlive: '5m' },
      userId: conv.user_id,
    },
  })
  const raw = res?.message?.content || ''
  // ⛔⛔ NOT CLASSIFIED. There is no OUTCOME line to read at generation 3, and inferring one from her prose
  // is precisely the imposition the generation exists to remove. `classifyNoticing` is retained for reading
  // the gen-1/gen-2 records; it is not applied to new rows.
  //
  // ⚠️ The tripwire still runs, and that is not a contradiction: it reads what she wrote and FLAGS a
  // constitutive claim for a human. It puts nothing into the prompt and decides nothing about her answer.
  const flags = constitutiveClaims(raw)
  return {
    constitutiveFlags: flags,
    needsHumanReview: flags.length > 0,
    conversationId, who, messages: msgs.length, model: modelId,
    // ⭐ HER COMPLETE TEXT, VERBATIM, UNDER ONE FIELD. No `outcome`, no `body`, no `declared` — a field
    // holding a verdict we guessed would be read later as a verdict she gave.
    text: raw,
    // ⓘ So a reviewer can tell a short answer from a clipped one without re-running anything.
    finish: res?.done_reason ?? res?.finish_reason ?? null,
    maxTokens: 1600,
    unclassified: true,
    dryRun, wroteNothing: true,
    priorLessonsOffered: prior.length,
  }
}

export { OUTCOMES }
