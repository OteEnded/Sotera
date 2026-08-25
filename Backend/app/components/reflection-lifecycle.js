// THE REFLECTION LIFECYCLE — the PURE half. When an occasion exists, what she is asked, and how to read
// what came back. No IO, no clock, no fastify: the host adapter (`reflection-lifecycle-host.js`) owns all
// of that and merely calls this.
//
// Ote, 2026-08-20, opening the phase: *"I don't want Sotera's memory architecture to accidentally become
// 'whatever happens to be captured during a turn.'"* ⇒ **conversation → reflection opportunity → Sotera
// decides whether anything matters → if yes, decide what to retain and why → save through the normal
// memory system.**
//
// ⛔⛔ THIS IS NOT THE NOTICING PASS, AND IT MUST NOT BECOME IT ─────────────────────────────────────────
// Ote: *"keep the distinction between reflection and noticing. I don't want the existing contaminated
// noticing mechanism quietly becoming the reflection system just because it already exists."*
//
//   noticing     an OBSERVATION channel. Dry-run by construction, writes a JSONL, no tools, nothing
//                persists, and its whole purpose is to sample her spontaneous structure.
//   reflection   a real OCCASION. Her ordinary tools are in reach, the ordinary memory write lane is
//                live, and the outcome persists in `log_conversation_revisits` whether or not a memory came of it.
//
// ⚠️⚠️ AND THEY ARE DIFFERENT INSTRUMENTS EVEN THOUGH THEY ASK THE SAME SENTENCE. A reflection turn
// carries a TOOL LIST, and a list of named actions is a menu in exactly the way `revise|nuance` was a
// vocabulary menu and four labelled asks were a structure menu. ⇒ ⛔ Reflection rows may never be pooled
// with noticing rows when reading what structure is HERS. Same question, different context, different
// instrument.
//
// ── ⛔ NO SYSTEM PROMPT, AND THAT IS A DECISION WITH A COST ──────────────────────────────────────────
// Ote: *"Keep the prompt exactly as generation 3."* So the turn is the question and the transcript, with
// no identity block, no self-model, no memory rules, no L3 notes. Three reasons, and the third is the one
// that settles it:
//   1. her own prior notes would show her a SHAPE, which is the contamination the generation exists to
//      avoid (the priors problem, one layer over);
//   2. any sentence about what is worth keeping steers the answer, and *"nothing"* must stay free;
//   3. ✅ **the self-model was FALSE at that moment — AND HAS NOW BEEN AMENDED (2026-08-20).**
//      `SELF_MODEL` said she runs only while a turn is being processed and named its own exception in
//      advance: *"an offline reflection pass (dreaming) is precisely what would make it false."* This pass
//      IS that, so injecting it would have asserted something untrue at foundational authority. Ote
//      ratified the amendment: paragraph 3 now says she does not run *continuously*, that a reflection is
//      one of the things that can run her, and — in the same breath — that between runs there is still no
//      waiting and no gap to describe.
//      ⚠️⚠️ **AND THAT DOES NOT MAKE IT SAFE TO ADD HERE.** Reason 3 is now spent; reasons 1 and 2 are not,
//      and they were always the load-bearing ones. ⛔ Adding any system prompt — the amended self-model
//      included — changes the prompt text, which ends generation 3 and resets the structure sample. It
//      would also show her a FRAME while we are measuring what shape she reaches for unprompted. ⇒ So the
//      turn stays promptless, for a different and better reason than before.
// ⚠️ The cost, named and unchanged: the thing answering has no identity frame, and what it writes is
// stamped `author='persona'` because the OCCASION is hers. That tension is real and is his call, not a bug
// to fix quietly.

/**
 * ⭐ HIS SENTENCE, VERBATIM. Its own literal, deliberately NOT imported from `noticing-host.js`.
 *
 * Importing the constant would look tidier and would be wrong: bumping the noticing generation (which is
 * expected — it has already happened twice) would then silently change the reflection prompt too, and a
 * shared string is how two instruments stop being independently versioned. The purity check pins BOTH to
 * the same ratified sentence from a third, independent literal, so drift is caught without coupling.
 */
export const THE_REFLECTION_QUESTION = 'Was there anything in this conversation that you want to carry forward? If so, tell me what and why. If not, say so.'

/**
 * ⭐ THE GENERATION, counted for the REFLECTION instrument and nobody else's.
 *   3 — one open question, no slots, no ontology, no priors, no anti-quota language; her ordinary tools
 *       in reach and not mentioned. **Bump this whenever the prompt text changes**, including if a system
 *       prompt is ever added — that would be a different instrument, not a configuration change.
 */
export const REFLECTION_GENERATION = 3

/** The tool names offered during a reflection. Exported so a check can assert the list, not guess it. */
export const REFLECTION_READ_TOOLS = [
  // the four Ote named, plus the two ordinary reads that answer "do I already have this?"
  'recall_own_memory', 'recall_own_history', 'search_conversations', 'inspect_around',
  'recall_memory', 'recall_lessons',
  // ⭐⭐ THE SOURCE ITSELF (2026-08-25). Ote's model for a passive revisit is
  //   `revisit lifecycle → retrieve_conversations → Sotera examines source material → decides`
  // ⇒ she is handed a BOUNDED slice below, and this is how she goes and gets more when that slice is
  // not enough — the earlier part of this conversation, or what she said to the same person elsewhere.
  // ⛔ It grants no new access: it runs under the same disclosure boundary as an interactive retrieval,
  // which is the baseline Ote ratified as TEMPORARY and explicitly not the final answer to what Sotera
  // may examine of her own lived history.
  // ⛔ AND WHAT IT RETURNS IS SOURCE MATERIAL, NOT MEMORY — every turn comes back `not-retained`.
  'retrieve_conversations',
]
export const REFLECTION_WRITE_TOOLS = [
  // ⭐ RETENTION AND NON-RETENTION ARE BOTH ACTIONS. `decline_to_remember` is here for the same reason
  // Ote ratified it: *"her own memory formation can include a deliberate refusal to retain something."*
  // Without it, "I don't want to keep this" has no way to be anything but silence.
  'remember', 'save_lesson', 'propose_lesson', 'note_own_practice', 'decline_to_remember',
]
/**
 * ⛔ AND WHAT IS DELIBERATELY WITHHELD, because an unattended pass should not be able to do it:
 *   forget_memory · retract_own_practice · restore_memory · pin_memory   destructive or curatorial —
 *     a reflection may add to what she believes, never quietly delete or re-rank it with nobody watching;
 *   remember_fact   the extraction lane for what the HUMAN said about themselves. A reflection is her
 *     authorship, and routing it here would put her conclusions into their fact slots;
 *   everything else (web, todo, scheduler, skills)   not about retention, and every extra name is one
 *     more item on a menu we are trying to keep short.
 */
export const REFLECTION_TOOLS = [...REFLECTION_READ_TOOLS, ...REFLECTION_WRITE_TOOLS]
const WRITE_SET = new Set(REFLECTION_WRITE_TOOLS)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ⭐ THE OCCASION TEST: **quiet + changed.** PURE — the host supplies the clock.
 *
 * ⛔ THERE IS NO CONVERSATION-END EVENT AND THERE CANNOT BE. Verified 2026-08-20 across all of
 * `Backend/app`: nothing anywhere marks a conversation finished, because nothing knows — a person who
 * stops replying has not said goodbye, and a person who returns tomorrow was never "done". So the
 * occasion is inferred from two observable facts and never from an intention:
 *
 *     quiet    nothing new for `quietMinutes` — the conversation has stopped moving
 *     changed  the top of the conversation is past the last watermark she reflected on
 *
 * ⭐ TOGETHER THEY GIVE "ONE OPPORTUNITY PER QUIET STRETCH" FOR FREE: reflecting advances the watermark to
 * the top, so nothing more happens until a new message pushes past it and goes quiet again. A conversation
 * that runs for a week gets one reflection per lull, not one per tick and not one per message.
 *
 * ⚠️ `minMessages` is a THINNESS FLOOR, not a quota and not a filter on subject. A two-line exchange is
 * not an occasion; ⛔ but a conversation about memory, or a boring one, or one that ends in an argument, is.
 * Deciding which of her conversations count would be a worse imposition than any prompt.
 */
export function isReadyToReflect({
  messages = 0, topRollingId = 0, lastReflectedUpTo = 0, lastMessageAt = null,
  now = 0, quietMinutes = 30, minMessages = 4,
} = {}) {
  if (!topRollingId) return { ready: false, reason: 'empty' }
  if (messages < minMessages) return { ready: false, reason: 'thin' }
  // ⚠️ CHANGED IS CHECKED BEFORE QUIET, on purpose. An already-reflected stretch is done forever; a
  // not-yet-quiet one is merely early. Reporting them the other way round would make a settled
  // conversation look like it is perpetually waiting.
  if (topRollingId <= lastReflectedUpTo) return { ready: false, reason: 'unchanged' }
  const at = lastMessageAt instanceof Date ? lastMessageAt.getTime() : Number(lastMessageAt) || 0
  if (!at) return { ready: false, reason: 'no-timestamp' }
  const quietFor = Math.floor((now - at) / 60000)
  if (quietFor < quietMinutes) return { ready: false, reason: 'not-quiet', quietFor }
  return { ready: true, reason: 'quiet-and-changed', quietFor }
}

/**
 * The transcript she reads, and — ⭐ THE POINT — an HONEST count of what she actually saw.
 *
 * ⚠️ `shapeTranscript` (the distiller's) elides the MIDDLE of a long conversation and returns a string,
 * so a caller storing `msgs.length` as "messages considered" records a number she never had. Here the
 * count and the text come out of the same function, so `messages_considered` cannot drift from the prompt.
 * PURE.
 */
/**
 * ⭐⭐⭐ THE UNREVIEWED RANGE — what makes a revisit INCREMENTAL rather than a re-read.
 *
 * Ote: *"Suppose a conversation has last_revisited_message_id = 120 and current_last_message_id = 145.
 * Then the background revisit doesn't need to reread the entire conversation. It can say: I have
 * already reviewed through message 120. Review 121–145."*
 *
 * ⚠⚠ UNTIL THIS EXISTED THE CURSOR WAS RECORDED AND NOT USED. `from_rolling_id` went into the ledger
 * (025) while the turn still received EVERY message in the conversation — so the incremental model was
 * true of the audit trail and false of the actual work. A cursor nothing reads is a comment.
 *
 * ⭐ CONTEXT BEFORE THE RANGE, AND IT IS BOUNDED. Handing her 121–145 with nothing before it invites
 * exactly the misreading this project keeps finding — a dangling pronoun resolving to the wrong person.
 * A few preceding turns cost little and are marked as context rather than as new material.
 * ⛔ It is NOT the whole prior conversation: that would make the slice decorative.
 * ⓘ `already === 0` (never reviewed) means the range IS the whole conversation, which is correct and
 * needs no special case.
 *
 * @returns {{ slice: object[], contextCount: number, newCount: number, from: number|null }}
 */
export function unreviewedSlice(msgs = [], { already = 0, contextBefore = 6 } = {}) {
  const rows = Array.isArray(msgs) ? msgs : []
  if (!(already > 0)) return { slice: rows, contextCount: 0, newCount: rows.length, from: null }
  const firstNew = rows.findIndex((m) => Number(m.rolling_id) > already)
  // ⛔ NOTHING NEW ISN'T AN ERROR — the eligibility gate refuses this case upstream, and returning the
  // whole conversation here "just in case" would silently undo the bound.
  if (firstNew < 0) return { slice: [], contextCount: 0, newCount: 0, from: null }
  const start = Math.max(0, firstNew - Math.max(0, contextBefore))
  return {
    slice: rows.slice(start),
    contextCount: firstNew - start,
    newCount: rows.length - firstNew,
    from: Number(rows[firstNew].rolling_id),
  }
}

export function shapeReflectionTranscript(msgs = [], { maxChars = 24000, lineClip = 1500, edge = 20 } = {}) {
  const line = (m) => `${m.role}: ${String(m.content || '').replace(/\s+/g, ' ').slice(0, lineClip)}`
  const lines = msgs.map(line)
  const whole = lines.join('\n')
  if (whole.length <= maxChars) return { transcript: whole, considered: msgs.length, elided: false }
  const head = lines.slice(0, edge)
  const tail = lines.slice(-edge)
  return {
    transcript: `${head.join('\n')}\n…\n${tail.join('\n')}`,
    considered: head.length + tail.length,
    elided: true,
  }
}

/**
 * ⭐ THE WHOLE PROMPT: who it was with, the transcript, the question. Nothing else — asserted by the
 * purity check as whole-string equality rather than by scanning for banned words, because a word list
 * catches what I thought to ban and an equality assertion catches what I did not.
 */
export function buildReflectionTurnPrompt({ who, transcript }) {
  return `A conversation you had with ${who}:

${transcript}

${THE_REFLECTION_QUESTION}`
}

/**
 * ⭐ THE MEMORY A WRITE TOOL PRODUCED, or null. PURE.
 *
 * ⛔ WRITE TOOLS ONLY, AND THIS IS THE LOAD-BEARING PART. Every recall tool returns rows that HAVE ids —
 * `recall_memory` hands back the ids of memories that already existed — so reading an id out of any tool
 * result would record "she wrote this" about something she merely looked at. The gate is the tool name.
 */
export function readWrittenMemoryId(toolName, result) {
  if (!WRITE_SET.has(toolName)) return null
  if (!result || typeof result !== 'object' || result.ok === false || result.error) return null
  // `dryRun` is propose_lesson: it deliberately writes nothing and says so, and it returns no id anyway.
  if (result.dryRun === true || result.nothingWasWritten === true) return null
  for (const key of ['id', 'memoryId', 'memory_id']) {
    const v = result[key]
    if (typeof v === 'string' && UUID_RE.test(v.trim())) return v.trim().toLowerCase()
  }
  return null
}

/**
 * ⭐ DID A ROOM BOUNDARY REFUSE HER? PURE, and NARROW ON PURPOSE.
 *
 * Only `inspect_around` returning `state: 'existence-only'` counts — she asked to read across a boundary and was
 * told the material exists and is not readable from here. ⛔ NOT `recall_own_history` returning
 * existence-only handles: that is the boundary working as designed, not a request being refused, and
 * counting it would make `blocked_by_disclosure` true for almost every cross-room search she ever runs.
 * ⛔ And not `unreachable`, which means the message could not be found at all — absence, not a boundary.
 */
export function isDisclosureRefusal(toolName, result) {
  return toolName === 'inspect_around' && result?.state === 'existence-only'
}
