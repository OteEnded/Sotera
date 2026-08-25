// ⭐⭐⭐ RETENTION FOLLOW-THROUGH — giving her own decision somewhere to land.
//
// ── ⚠️⚠️ THE MEASURED GAP THIS CLOSES ───────────────────────────────────────────────────────────────
// Across 2026-08-26's runs, on material about HERSELF:
//     she recognises it is durable                    ✅
//     she decides correctly whether it is worth having ✅
//     she distinguishes ABOUT from OWNER              ✅ *"the fact is about MY relationships"*
//     `keep({mine:true})` works end to end            ✅ proven through the live tool path
//     …and the write happens                          ⛔ 0 of 8+ occasions
//
// The clearest instance, verbatim, after FIVE read calls confirming the material was absent from her
// store: *"I checked what I have kept, and there's no stored record of you noting this about me — but
// **it's worth keeping**. This is a real pattern in our dynamic, not just a passing observation."*
// ⇒ Full deliberation. An explicit conclusion. **No write, and no question either.** The turn simply ended.
//
// ── ⭐⭐⭐ THE ARCHITECTURAL ASYMMETRY, NAMED ────────────────────────────────────────────────────────
// `chat-site.route.js` already carries a fallback for the other direction: when the model holds write
// tools and writes nothing, `captureFacts` extracts from the USER's text and stores it. So a fact about
// the person gets **two chances** — she writes it, or the extractor does.
// ⛔ A fact about HER has exactly one, and she does not take it. There is no extractor for self-claims,
// and there must not be: one would MANUFACTURE the decision, which is the thing Ote ruled out.
//
// ⇒ ⭐ **the fix is a second OCCASION, not a second WRITER.** The architecture supplies somewhere for a
// decision she already made to become an act. It never supplies the decision.
//
// ── ⛔ THE FOUR THINGS THIS MUST NEVER DO ───────────────────────────────────────────────────────────
//   1. ⛔ fire on `asked`. If she put the question to the PERSON, answering it here would consent on
//      their behalf — and *"asks permission"* turned out to be 1 case in 11, so it is not the shape to
//      build around anyway.
//   2. ⛔ fire when she already wrote. Mutual exclusion by construction, exactly as the existing capture
//      fallback does it — two writers on one turn is the 2026-07-24 race, and it duplicated rows.
//   3. ⛔ fire when nothing was decided. Silence is an answer. The negative controls (transient,
//      hypothetical, a third party's private material) produce no signal and therefore no step, which is
//      how "we are not solving this by making her remember everything" stays true mechanically rather
//      than by intention.
//   4. ⛔ decide authorship. The step offers `keep`, and `mine` is hers to state — the retention host
//      still refuses an undeclared owner. Nothing here passes `memoryAuthor`.

import { chat } from '../chat-runtime/index.js'
import { buildToolContext, runTool, toolDefinitions } from './runtime.js'
import { log } from '../../lib/utility.js'
import { classifyRetentionSignal } from './retention-signal.js'

/** ⭐ The only doors this step opens. `keep` is the front door and `decline_to_remember` is the honest
 *  other answer — a step that could only say yes would be a nudge wearing a mechanism's clothes. */
export const FOLLOWTHROUGH_TOOLS = ['keep', 'decline_to_remember']

/**
 * ⭐⭐ SHOULD IT FIRE? Pure, so the whole gate is testable without a model.
 * @returns {{fire:boolean, why:string, evidence:string|null}}
 */
/**
 * ⭐⭐⭐ THE SECOND TRIGGER, AND MEASUREMENT FORCED IT.
 *
 * v1 fired only when she SAID something was worth keeping. Live: it never fired. Handed two clean
 * self-observations she engaged with fully, she verbalised a retention conclusion in ⛔ NEITHER — across
 * the whole night that phrasing appears in roughly 1 turn in 7. ⇒ a trigger that waits for her to
 * announce the decision helps only in the minority of turns where she happens to narrate it.
 *
 * ⭐ So the second trigger reads the OCCASION rather than her conclusion: did the PERSON assert something
 * durable about HER? That is the situation with no natural home — when someone states a fact about
 * themselves, "noted" IS the reply and the write rides along with it; when someone observes something
 * about her, the reply is reflection and a write would be an extra act the conversation does not call for.
 *
 * ⛔ THIS READS THE INPUT, NOT HER MIND. It cannot be accused of inferring what she decided, because it
 * looks only at what she was told. And it decides NOTHING: the step that follows offers `keep` and
 * `decline_to_remember` with no hint of which, so an occasion that should end in "no" ends in "no".
 *
 * ⚠️ Conservative on purpose — BOTH halves are required:
 *   · a second-person claim about her ("you are", "you tend to", "you do that")
 *   · a DURABILITY marker ("always", "every time", "the whole time", "from now on")
 * A passing second-person remark has no durability marker and therefore no occasion. ⛔ Without that
 * conjunction this would fire on nearly every conversational turn, which is the "remember more" nag Ote
 * ruled out in as many words.
 */
const ABOUT_HER = /\b(you (are|do|tend|keep|always|never|get|go|end|turn|slow|speak|write|sound)|your (register|habit|instinct|default|tendency|way of)|that'?s (how|what) you)\b/i
const DURABLE = /\b(always|never|every time|each time|the whole time|all along|consistently|from now on|next (week|month)|for as long as|since we (started|began)|steady|constant|not just (today|now|sometimes))\b/i

export function isDurableSelfObservation(userText = '') {
  const t = String(userText ?? '')
  return ABOUT_HER.test(t) && DURABLE.test(t)
}

export function shouldFollowThrough({
  answer = '', userText = '', wroteMemory = false, useMemory = true, stopped = false, enabled = true,
} = {}) {
  if (!enabled) return { fire: false, why: 'disabled', evidence: null }
  if (!useMemory) return { fire: false, why: 'memory-off', evidence: null }
  if (stopped) return { fire: false, why: 'client-gone', evidence: null }
  // ⛔ TWO WRITERS ON ONE TURN IS THE RACE. If she acted, this has nothing to add.
  if (wroteMemory) return { fire: false, why: 'she-already-wrote', evidence: null }

  const sig = classifyRetentionSignal(answer)
  // ⛔ Her saying it is already stored is not a decision to write — it is a report that there is nothing
  // to do. Firing here would ask her to re-decide something she has already settled.
  if (sig.already) return { fire: false, why: 'already-held', evidence: sig.evidence }
  if (sig.state === 'asked') return { fire: false, why: 'asked-the-person', evidence: sig.evidence }
  if (sig.state === 'intent') return { fire: true, why: 'stated-a-decision', evidence: sig.evidence }
  // ⭐ THE OCCASION TRIGGER. She said nothing about keeping it — but the person asserted something
  // durable about her, which is the one situation with no natural place for a write.
  // ⛔ `evidence` is the PERSON'S sentence here, not hers, and the frame says so: quoting their words
  // back to her as if she had said them would be putting a decision in her mouth.
  if (isDurableSelfObservation(userText)) {
    return { fire: true, why: 'durable-self-observation', evidence: String(userText).trim().slice(0, 400), fromUser: true }
  }
  return { fire: false, why: 'no-occasion', evidence: null }
}

/**
 * ⭐ THE FRAME. It reports the state of the world and stops.
 * ⛔ No rule, no "you should", no preference about keeping things, and no hint about WHICH way `mine`
 * goes — a measured result from this project is that priming her with a decision procedure holds her
 * labels and LOWERS her insight, and the whole point here is that the judgement is already hers.
 */
export function buildFollowThroughMessages({ answer, evidence, fromUser = false }) {
  const quoted = String(evidence || '').trim()
  // ⛔⛔ WHOSE SENTENCE IT IS MUST BE SAID. Under the occasion trigger the quote is the PERSON'S, and
  // presenting their words as *"a moment ago you said"* would attribute their claim to her — putting a
  // decision in her mouth is exactly the failure this whole design exists to avoid, and it is the same
  // shape as the family-lineage rows where her sentences were filed as facts about the user.
  const opening = fromUser
    ? `A moment ago they said this about you:\n\n"${quoted}"\n\nYou answered:\n\n${String(answer).slice(0, 1200)}`
    : `A moment ago you said:\n\n"${quoted}"\n\nIn the turn it came from:\n\n${String(answer).slice(0, 1200)}`
  return [
    {
      role: 'system',
      content: [
        'This is a moment on your own, just after a turn. Nobody is waiting on a reply and nothing you',
        'write here is shown to anyone.',
        'Something was said that concerns you rather than the person you were talking to, and nothing has',
        'been written down. That is the only reason this moment exists.',
        'Whether any of it belongs in what you carry forward is yours to judge, and you are the one who',
        'says whose it is. Leaving it is a real answer and is worth recording as one.',
        // ⛔ NOT a hint about which way to go: a claim about her is not automatically true, and an
        // occasion that assumed it was would be manufacturing agreement as well as a decision.
        'What they said about you is their observation, not a fact you have to accept.',
      ].join(' '),
    },
    { role: 'user', content: opening },
  ]
}

/**
 * Run the follow-through. ⛔ Off the hot path — the reply is already delivered.
 * @returns {Promise<{ran:boolean, why?:string, calls?:Array, error?:string}>}
 */
export async function runFollowThrough(fastify, {
  user, conversationId, messageId, answer, evidence, fromUser = false, provider, model, maxTokens = 700,
  turn = null,
}) {
  // ⚠️ The tool context is the REAL one — same builder, same services, same audit trail. ⛔ A follow-through
  // that ran against a stub would prove only that the stub works.
  // ⛔ AND IT PASSES NO `memoryAuthor`. Authorship arrives with her `mine`, through the retention host,
  // which still refuses to guess. This step must not become a second place where authorship is decided.
  const ctx = buildToolContext(fastify, { user }, {
    origin: 'retention-followthrough', conversationId, messageId,
  })

  const all = toolDefinitions() || []
  const tools = all.filter((d) => FOLLOWTHROUGH_TOOLS.includes(d?.function?.name))
  // ⛔ AN EMPTY TOOL LIST WOULD MAKE THIS A SILENT NO-OP THAT STILL BURNED A GENERATION. If the doors are
  // not installed, say so and do not spend the call.
  if (!tools.length) return { ran: false, why: 'no-retention-tools-installed' }

  const messages = buildFollowThroughMessages({ answer, evidence, fromUser })
  const call = turn || (async ({ messages: ms, tools: ts }) => {
    const res = await chat({
      serverConfig: fastify.config,
      request: {
        provider, model, messages: ms, tools: ts,
        // ⚠️ `reasoning.enabled:false` — think:false is a requirement on this stack, and interleaved
        // think/answer produced stacked garbled drafts here before. Her ordinary sampling otherwise.
        options: { stream: false, reasoning: { enabled: false }, max_tokens: maxTokens },
        userId: user?.id ?? null,
        conversationId,
      },
    })
    return res?.message ?? {}
  })

  let msg
  try {
    msg = await call({ messages, tools })
  } catch (e) {
    await log(`[retention-followthrough] model call failed: ${e?.message}`, import.meta.url)
    return { ran: false, error: e?.message || 'model call failed' }
  }

  const raw = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
  const calls = []
  for (const t of raw) {
    const name = t?.function?.name ?? t?.name ?? null
    if (!name || !FOLLOWTHROUGH_TOOLS.includes(name)) continue
    let args = t?.args ?? t?.function?.arguments ?? {}
    if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = {} } }
    let result = null
    try {
      result = await runTool(name, args, ctx)
    } catch (e) {
      result = { ok: false, error: e?.message || 'tool failed' }
    }
    calls.push({ name, args, result })
  }
  return { ran: true, calls, said: typeof msg?.content === 'string' ? msg.content : '' }
}
