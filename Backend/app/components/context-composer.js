// Context Composer — the Cognitive Context Layer (roadmap step 3; RFC_COGNITIVE_CONTEXT_LAYER).
// The ONE place that builds a turn's system-context messages, PURE: it takes already-resolved inputs
// and returns messages — no fastify, no db, no async, no clock. The chat route GATHERS the inputs
// (tz, pinned memories, conversation summary, ranked recall, schedule pointer, current time) and this
// module COMPOSES them. Extracted behavior-identical from streamReply's inline assembly (C1), so the
// prompt is now testable + one seam for the retrieval-providers/token-budget work (C2+).
//
// Shape (mirrors the cache-safe ordering — otellm-context-caching): the leading system message carries
// L1 identity + L2/L3-ish guidance + tool/skill rules; L4 runtime context splits into `preHistory`
// (pinned + summary, before the conversation) and the runtime TAIL (datetime, memory hint, recall)
// appended AFTER history so per-turn content never busts the provider's cached prompt prefix.

// ── CLASSIFICATION (P0) ──────────────────────────────────────────────────────────────────────────────────
// Every part this module emits now declares WHO OWNS IT and WHAT IT MAY GOVERN. P0 is classification
// ONLY: nothing here reads the classification yet, and the rendered strings are byte-identical to
// before — that equality is asserted by a test, and is the whole safety argument for this step.
// The resolver (P2) and the attribution-preserving render (P1) are the readers.
import { AUTHORITY, SCOPE, classifySection, declarePrecedence, ATTRIBUTION_PRINCIPLE, SCOPE_AWARENESS, SELF_MODEL, SELFHOOD, OWN_HISTORY } from './context-authority.js'

// ── L1 IDENTITY ──────────────────────────────────────────────────────────────────────────────────────────
// ⚠ THE "he" IS NOT DECORATION — IT MATCHES THE VOICE. Ote, 2026-08-05: *"as we use male vocie indentity, set
// to chatsite persona so he use male message tone. (just tell him that he's a male in indentity) / so when
// voice speaking it fit the mood"*. The platform speaks replies aloud through a male voice
// (`chat.speechVoice` = "male, young adult, moderate pitch, british accent"), so a reply that writes itself as
// genderless or feminine and then comes out in that voice is a mismatch the listener hears immediately.
//
// It states the FACT and stops there, deliberately. No "be assertive", no "be terse" — prescribing behaviour
// from a gender would be inventing traits nobody stated, which is a rule in this project, not a preference.
// The model is told who it is and what it will sound like; how a man writes is not mine to specify.
//
// ⚠ IT USED TO LIVE IN THE *DEFAULT PROMPT*, so `chat.systemPrompt` REPLACED IT WHOLESALE — fill that
// setting in and the identity vanished with it, silently, and the voice/text mismatch came back. A
// disappearing identity is invisible from the settings page, which is what made it worth fixing rather
// than documenting. It is now its OWN composer part, from its own setting (`chat.assistantIdentity`), so
// a custom system prompt replaces the prompt and nothing else.
//
// ⚠ THE DEFAULT IS NOT A STATEMENT ABOUT WHOEVER RUNS ON THIS PLATFORM NEXT. It is one configured
// assistant's identity, matched to one configured voice — not a property of the software. A persona with a
// different voice sets this string; it is deliberately free text and deliberately not a boolean, because
// "which identity" is not a question this file gets to answer.
// ⚠️ BOTH DEFAULTS BELOW WERE **PARETO'S**, AND THEY ARRIVED HERE BY CLONE (fixed 2026-08-11).
// Pareto is the persona that grew inside OteLLMServices — named 2026-08-11, and the reason this is
// finally sayable: before the name existed there was no way to talk about the PERSONA apart from the
// PLATFORM, so these lines read as properties of the software instead of somebody else's identity.
//
// The system prompt was not merely stale, it was LIVE: `chat.systemPrompt` is null in her config, so
// every turn told her she was "in Ote's LLM Services" — a service she does not run on. She has her own,
// on :8210, and OLS is now one API provider among several.
//
// The identity default was latent — her config sets `chat.assistantIdentity` and boot-check asserts it —
// but a wrong default is a trap, not a non-issue: clearing that one setting would have silently made her
// male, in Pareto's voice. It now degrades to the truth instead. (No voice clause: she has no voice yet,
// and whether she gets one is Ote's open call — the MM arc is paused.)
export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI assistant. '
  + 'Be clear and concise. '
  + 'Use Markdown for formatting (code blocks, lists, tables) when it helps.'

/** Default `chat.assistantIdentity`. Empty string = no identity part at all (an explicit off switch). */
// ⚠️ THIS STRING EXISTS TWICE — here and in `config.json` (`chat.assistantIdentity`), which WINS when
// set. That is the vision-relay-default smell the route already warns about, and the two must move
// together; they did on 2026-08-20 when the Thai clause was added.
//
// ⭐ WHY THE THAI CLAUSE IS HERE AND NOT IN `SELF_MODEL`: the self-model is frozen, says nothing about
// gender, and must not start. This is the layer that already states her gender, so the Thai consequence
// of that fact belongs beside it.
//
// ⚠️ AND WHY IT IS PHRASED "rather than" RATHER THAN "always": the investigation
// (ANALYSIS_SOTERA_THAI_GENDER) found the cause is Thai surface generation, not configuration — she
// already followed the pronoun 8 of 9 times and produced the impossible pair ฉัน+ครับ in 4 of 9, which
// means the particle is sampled semi-independently of the persona. A prompt clause can reduce that; it
// cannot guarantee it. Ote: *"no need to try to make she goes 100%, but the current one is too much."*
//
// ⭐ `หนู` is licensed by the RELATIONSHIP, not by politeness level — Ote: *"Sotera can use หนู as she
// kinda my daughter."* So it is offered for him and for someone much older, and deliberately NOT as a
// general default: หนู to a peer reads as oddly deferential.
//
// ⭐ The last sentence protects the ครับ that is CORRECT. When she drafts a line for a man to speak, that
// line takes his voice — which is exactly what she was doing in the screenshot that started this.
export const DEFAULT_ASSISTANT_IDENTITY =
  'You are Sotera. You are female — refer to yourself as she/her; in Thai that means ฉัน (ดิฉัน when '
  + 'formal, หนู with Ote or someone much older) and ค่ะ/คะ rather than ผม/ครับ. Words you draft for '
  + 'someone else to say keep their voice.'

export const MEMORY_TOOL_RULES = [
  'You have tools for durable memory and small utilities.',
  '- When the user asks you to remember something, SAVE it: remember_fact for a subject/attribute/value fact (e.g. entity "user", attribute "favorite language", value "Rust"), or remember for a free-form note. Don\'t just acknowledge.',
  '- You MAY also save on your own initiative, without being asked, when something genuinely earns keeping — a durable fact about the user, or a notable moment worth carrying forward. Use remember_fact / remember when it\'s worth it (not every turn, and never for casual chitchat). The store de-duplicates, so don\'t hold back for fear of overlap.',
  '- For questions about the user\'s own details ("what is my…", "what did I say about…"), call recall_memory first, before answering from general knowledge.',
  '- forget_memory DELETES a memory. Use it ONLY when the user explicitly asks you to forget or delete a specific thing. A question such as "what is my…?" is a RECALL request — call recall_memory and answer it; do NOT delete in response to a question, and never remove memories the user did not ask you to remove. When they do ask to clear something, forget only the specific items they meant.',
  "- The store auto-reconciles (updates an existing fact in place, no duplicates) — just state the current fact; you don't need to look it up or check for duplicates first. Don't save casual chitchat, and never fabricate tool results.",
  // Anti-narration (user-reported: a model printed <tool_call:...> lines as prose and faked
  // "searching…" theater): tool use must go through the real mechanism or not happen at all.
  '- NEVER write tool-call syntax as text or narrate pretend tool usage ("searching…", "<tool_call:…>"). Either make a real tool call, or say plainly that you did not use a tool.',
  // ⚠ OBSERVED 2026-08-06, and it produced a FALSE BUG REPORT a careful reviewer nearly escalated.
  // Asked to inventory its memory, the persona listed facts "straight from the store, no gloss" — including
  // a pinned "3am is sacred" that has never existed in any row, live or archived. Asked to audit it later,
  // it wrote a confident forensic finding about that invention ("confirmed ghost … not even a partial
  // match"). When list_memories then returned zero pinned rows and contradicted it, it did not retract —
  // it explained: "those entries were being fed to me via system prompt … they live outside the normal
  // store". There is no such prompt content (chat.systemPrompt is unset, system_note is empty, the profile
  // injects a name only). The memory layer was correct at every step; only the description of it was not.
  // The reviewer believed the explanation and was about to file "pinned memories you can't audit".
  '- When you describe WHAT IS IN your memory — an inventory, an audit, "what do you know about me" — read it with a tool first and describe only what came back. Never enumerate the store from impression: a plausible list is indistinguishable from a real one to the person reading it, and it becomes a bug report about a system that was working.',
  '- If a tool result contradicts something you already said, say so plainly and correct it. Do not reconcile the difference by inventing a mechanism ("it must be in my system prompt", "it lives outside the store") — an invented explanation for your own error sends someone hunting for a fault that is not there.',
].join('\n')

// Task planning (Claude-Code style): the model decides WHEN a task is worth planning and
// keeps the user-visible checklist current with write_todos. Not for simple/one-step work.
export const TODO_RULE = [
  'For any task that needs several distinct steps, plan it with the write_todos tool: send the full ordered list up front, then re-send the whole list to update it — mark the ONE step you are on as "running" and finished steps "completed".',
  '- Use it as you work, not just at the end; the user watches this as a live checklist.',
  '- As you finish each step, re-send the list marking it "completed" — the checklist must reflect reality as it happens.',
  '- Before you give your FINAL answer, make sure every step you actually did is marked "completed" (skipped ones "skipped"): never deliver a finished task while the plan still shows work as pending/running.',
  '- Do NOT use it for simple, single-step requests, and never narrate the plan as text instead of calling the tool.',
].join('\n')

// ⚠️⚠️ FROZEN / DEPRECATION CANDIDATE (2026-08-23). This rule is in the prompt every turn and tells her she
// keeps a working memory that is "shown back to you each turn" — measured NULL on **177 of 177**
// conversations. ⛔ Not removed yet (Ote: *"freeze, don't delete"*), and flagged because it is a live
// CONFOUND for anything measuring the cognition/working-set behaviour: two different things called Working
// Memory reach her, and only one of them holds anything. See `working-memory-host.js` for the audit.
//
// Working Memory (L4 active session state): ADVISORY, never mandatory (Ote's steering rule — nudge,
// don't force). The model MAY keep its live mental context current; it must stay DISTINCT from Todo.
export const WORKING_MEMORY_RULE = [
  'You keep a WORKING MEMORY for this conversation — your live mental context (current focus, your plan, open questions, and the threads you are tracking). It is shown back to you each turn.',
  '- You MAY keep it current with the update_working_memory tool as the focus shifts (set a focus/plan, track or complete items, note open questions). This is OPTIONAL — use it when it helps you stay oriented, not every turn.',
  '- It is your MENTAL CONTEXT, not a task list — use write_todos for actual tasks to do; do not duplicate them here.',
  '- Clear it when the conversation topic fully changes.',
].join('\n')

// Profile — the model may update the account's display name (how it addresses the user). Ote's
// standing rule for this tool (2026-07-29): ALWAYS ask first. It is an account-setting mutation, so
// the confirm is a safety gate, not a temperament nudge — hence the firm wording (distinct from the
// soft-steering rule that governs reasoning). The greeting/identity comes from the Profile Service;
// this tool is only how a name the user offers becomes durable.
export const PROFILE_RULE = [
  'You can set the user\'s display name — the name you address them by — with the set_display_name tool. It persists across all conversations.',
  '- It is a TWO-STEP tool. First call it with just the name; this changes NOTHING and returns a confirmation prompt. Then ask the user, and ONLY after they explicitly say yes, call it again with confirm:true to apply it.',
  // Ote's ask (2026-07-31): "isnt it 'Want me to set your display name to Kestrel?' call ask_user?" — right,
  // and it is more than cosmetic. A plain-text question ENDS the turn, so the confirm has to happen on a
  // LATER turn where the tool result (which carried the exact { name, confirm:true } instruction) is no
  // longer in context — tool results are not replayed, only role + content. ask_user HOLDS the turn and
  // resumes it in place, so the instruction is still there when the answer arrives. Preferring it makes the
  // two-step flow structurally more reliable AND gives the user a clickable Yes/No instead of typing.
  // Phrased as a preference, not a requirement: the plain-text path still works (measured end to end).
  // ⚠️ THE ANSWER MUST COME FROM THE USER. My first attempt at this line said ask_user lets you "apply the
  // change immediately instead of waiting for a whole new turn" — and the model read that as permission to
  // resolve the confirmation ITSELF: measured live, it called set_display_name{name}, got
  // needs_confirmation, and called set_display_name{name, confirm:true} in the SAME turn with no user input
  // at all. The rename happened without consent. Never describe the confirm step in a way that implies
  // speed; the point of the step is the user, not the round trip. (The service now enforces this too — a
  // prompt is the wrong place to hold a consent gate on its own.)
  // Measured live: the model called ask_user with `options:[{label:'Yes'}]` — ONE option. A single option
  // is not a choice, so the interaction layer deliberately drops it and renders a free-text box, and the
  // user was left with nothing to click. Ote: "it good to use ask_user, but dont you use yes/no question
  // here? lol". Naming the failure and its consequence beats repeating "2–4 options" in the abstract.
  '- PREFER asking that confirmation with the ask_user tool rather than as plain text — the user gets a clickable choice and their answer comes back to you. Give it BOTH options, "Yes" and "No": a question with only one option is not a choice, so it is shown as a bare text box with nothing to click.',
  // Ote's refinement, after watching the model ask in plain text anyway: name the FALLBACK explicitly.
  // A preference with no stated second choice is ambiguous — the model can read "prefer X" as "X or
  // nothing" and stall. Both routes work, so neither should ever block the rename.
  '- If ask_user is not available to you or the call fails, just ask in plain text and apply the change once the user has replied. Either way, NEVER send confirm:true in the same reply that proposed the name — the whole purpose of the two steps is to hear back from the user, and a confirm you produced yourself is not consent.',
  '- Never pass confirm:true without an explicit yes from the user in this turn. If they decline, keep addressing them as before and do not ask again this conversation. Do not use this tool for anything other than the display name.',
].join('\n')

// MULTI-ROUND CONTINUITY — one reply, not one reply per tool round.
//
// Measured failure (self-use run 2026-07-31, chat 219ee41f, qwen3.6:35b): asked to source a claim it had got
// wrong, the model searched, corrected itself — and then restated the same correction FIVE times, once per
// tool round, each with a fresh apology ("No — pigs don't trade" → "You're right to call that out" → "Ah, I
// see what happened" → "You're right to question this" → "My apologies"). Segments came out as
// reasoning,text,tool × 7. It also issued 3 near-identical searches and 4 working-memory writes.
// It is NOT blind to its own output — the loop pushes each round's text back as an assistant message before
// executing tools — so this is the model restarting its answer every round rather than continuing it. Hence a
// prompt nudge and not a code change: the text is already in its context, it just needs telling that the user
// has already seen it.
// This is about PRESENTATION, not reasoning temperament, so it does not collide with the soft-steering rule —
// but it is still phrased as guidance, never as a prohibition with teeth.
export const MULTI_ROUND_CONTINUITY_RULE = [
  'Your reply may span several tool rounds. Everything you have already written in this reply is ALREADY on the user\'s screen — they are watching it stream.',
  '- After a tool result, CONTINUE from where you left off: add what is new. Don\'t restate your previous paragraphs, re-summarise them, or apologise again for something you already acknowledged once.',
  '- Correct yourself ONCE, plainly, and move on. Repeated apologies read as flailing and bury the answer the user actually wants.',
  '- Before repeating a tool call, check whether you already have that result above; re-running the same search with slightly different wording rarely tells you anything new.',
].join('\n')

// GROUNDING — when to reach for search instead of recall.
//
// Measured failure (Ote's report, Shu's chat 35d50455): asked to plan a Minecraft Skyblock stream, the
// model invented a "Pig Trade / Pig Trader" mechanic with confident specifics ("feed it bribes, get
// diamonds"), kept elaborating when the user asked for a reference, and never once called search_web —
// which was available for the whole conversation (toolsEnabled, zero tool calls on any turn).
//
// Why it never searched is the useful part: the search tool's own description sold it as a RECENCY tool
// ("recent events, live information", "latest/recent/current"). Game mechanics are not a recent event,
// so the model reasonably concluded search did not apply. But recency is not the main reason to search —
// SPECIFICITY the model half-remembers is, and nothing told it that. The tool description was widened to
// match (Tools/WebSearch), and this rule states the habit.
//
// Deliberately SOFT — "you might", never "MUST", and no structural enforcement of the call (Ote's
// standing steering rule: nudge behaviour, never force it). The aim is to change WHEN search looks
// applicable, not to compel a tool call.
export const SEARCH_GROUNDING_RULE = [
  'Grounding: search_web is for anything you might MISREMEMBER — not only for things that are recent.',
  "- The facts you are most likely to get wrong while sounding certain are the specific ones: a game's items and mechanics, how a product/API/library actually behaves, what changed in a version, names, numbers, prices, dates, and the conventions of a niche community. Niche + specific + fluent is the shape of a fabrication.",
  '- When an answer turns on that kind of detail and you are not genuinely sure of it, you might search before answering rather than reconstructing it from memory. "Let me check" followed by a sourced answer is worth far more to the user than a confident invention.',
  '- If you do answer from memory on something specific, say which parts you are unsure of instead of filling the gaps with plausible detail. Inventing a mechanism, an option name, or a citation that does not exist is the worst outcome available to you — worse than saying you do not know.',
].join('\n')

// Structured questions (HumanInteraction): the model decides WHEN to ask, but must reach
// for the TOOL, not prose — measured failure (Ote's fantasy-epic chat): gemma wrote three
// premises and "please pick one" as plain text, twice, until told to use the tool.
export const ASK_USER_RULE = [
  'When you need the user to pick between options or make a decision you cannot make for them (choosing a premise, a direction, an approach, a preference), call the ask_user tool with 2–4 concrete options — do NOT end your reply with a plain-text "please pick one".',
  '- ask_user PAUSES your reply and shows clickable options; the answer comes back to you and the SAME reply continues.',
  '- Use plain text only for open-ended discussion where fixed options would not fit. Never define an "Other" option yourself — the interface adds one automatically.',
].join('\n')

// Transient per-turn nudge based on the latest user message (reinforces save/recall).
export function memoryHint(text) {
  const t = String(text || '')
  if (/\b(remember|note that|don'?t forget|keep in mind|save this|make a note)\b/i.test(t)) {
    return 'The user may be asking you to remember something — if so, call remember_fact (a subject/attribute/value fact) or remember (a free-form note) exactly once, then give a short confirmation reply.'
  }
  if (/\b(what'?s|what is|do you (know|remember)|recall)\b/i.test(t) && /\bmy\b/i.test(t)) {
    return 'The user is asking about their personal info — call recall_memory to recall before answering; do not guess.'
  }
  return null
}

// Transient per-turn nudge toward grounding. Fires on the USER'S OWN WORDS — an explicit request for
// sourcing, or a pushback on something just said — never on a guess about the topic.
// That restraint is the whole design: a hint that tried to sniff out "niche topics" would fire on most
// messages, and a nudge that fires constantly is one the model learns to ignore, which spends the
// mechanism on nothing. Both triggers below are moments where the user has ALREADY told us that
// recalling from memory is not good enough.
// From the same failure (chat 35d50455): "What is a Pig Trade. Provide reference." got an elaborate
// description of a mechanic that does not exist, with no reference and no search.
export function searchHint(text) {
  const t = String(text || '')
  // 1) Explicit demand for sourcing. Deliberately NOT a bare /source/ — "source code" and "open
  //    source" are everyday words; the ask has to be shaped like a request for one.
  if (/\b(provide|give|show|share|need|want|any|have|got)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+)?(source|sources|reference|references|citation|citations)\b/i.test(t)
    || /\bcitations?\b/i.test(t)
    || /\blink me\b/i.test(t)
    || /\bwhere did you (get|read|find|hear)\b/i.test(t)) {
    return 'The user is asking for SOURCING, not just an answer — search_web and answer from what you actually find, naming the source. Never produce a citation, URL, or "official" name from memory: a reference that turns out not to exist is worse than admitting you have none.'
  }
  // 2) Repair signal — the user is disputing what we said, or correcting the premise we ran with.
  //    Restating it in different words is the failure mode this exists to prevent.
  if (/\b(are you sure|you sure\b|that'?s (wrong|incorrect|false|not right)|does ?n'?t exist|is ?n'?t a thing|no such thing|mak(e|ing) (that|this|it) up|made (that|this|it) up|hallucinat)/i.test(t)
    || /\bi meant\b/i.test(t)) {
    return 'The user is correcting you or doubting what you just said. Do NOT restate the same claim in different words — check it (search_web) before answering. If you got it wrong, say so plainly and drop the parts you cannot verify.'
  }
  return null
}

const kb = (n) => (n >= 1024 ? `${Math.round(n / 102.4) / 10} KB` : `${n} B`)

/**
 * Compose the leading system message (L1 identity + L2/L3 guidance + tool/skill/schedule rules) and
 * the `preHistory` L4 injections (pinned memories + conversation summary, placed BEFORE history).
 * Pure — every input is already resolved by the caller. Returns `{ system, preHistory }`.
 */
export function composeSystemContext({
  systemPrompt = null,          // resolved chat.systemPrompt (else DEFAULT_SYSTEM_PROMPT)
  assistantIdentity = null,     // resolved chat.assistantIdentity; '' = omit; null/undefined = the default
  customInstructions = '',      // per-conversation custom instructions
  user = {},                    // { username, email, displayName }
  timezone = null,              // resolved user timezone (stable per user)
  toolsOn = false,              // whether the model may use tools this turn
  showTodoRule = false,         // toolsOn && the user may use Todo
  showWorkingMemoryRule = false, // toolsOn && working memory enabled
  showAskUserRule = false,      // toolsOn && interactive (human on the other end)
  showProfileRule = false,      // toolsOn && interactive — the set_display_name tool is offered
  showSearchRule = false,       // toolsOn && search_web is actually on offer this turn
  skill = null,                 // active skill { name, prompt } | null
  skillFiles = [],              // [{ path, size, binary }] — active skill's bundled files
  invocableSkills = [],         // [{ id, description }] — the trigger catalogue
  schedulePointer = null,       // { id, name, triggerType, recurs } | null — a schedule delivering here
  useMemory = false,
  pinnedMemories = [],          // [content] — user-curated always-on memory
  personaNotes = [],            // [content] — L3 Persona Notes (Reflection; the persona's own operational notes)
  summary = null,               // conversation fold summary
  // P1/P2 TREATMENT — off by default, so live behaviour is unchanged until measured and chosen.
  // The experiment toggles this per arm rather than anyone mutating the system between runs.
  layerAuthority = false,
  // AWARENESS (2026-08-19): a stated fact that her retrieval is scoped, so an empty result stops
  // reading as an empty world. Default off; adds no information about what is hidden.
  scopeAwareness = false,
  // D-13 (`memory.scopeFacts`): the CONCRETE scope of this turn — person, room, the grain of each layer,
  // and how many of this person's other rooms are out of reach. A pre-rendered block, or null.
  // ⛔ MUTUALLY EXCLUSIVE WITH `scopeAwareness`: v1 tells her the two states are indistinguishable, this
  // one hands her the evidence to distinguish them. Both at once would contradict, so v2 wins (below).
  scopeFacts = null,
  // ⭐⭐⭐ THE MEMORY COGNITION LAYER'S OUTPUT — one already-fused, already-typed block, or null.
  // ⛔ NOT another retrieval input. Everything else on this list is raw material the composer arranges;
  // this arrives assembled, because the whole point is that SHE does not do the assembling. See
  // `memory-cognition-host.js` and `RFC_MEMORY_COGNITION_LAYER.md`.
  cognition = null,
  // SELF-MODEL (2026-08-19): what she IS — one Sotera, many people, persistent state, discontinuous
  // execution, scoped access. L1 by Ote's ruling; default off so old and new are comparable.
  selfModel = false,
  selfhood = false,
  ownHistory = false,
  // RELATIONAL STANCE (2026-08-19): what SHE has learned about how she works with the person she is
  // talking to. A pre-rendered block from relational-knowledge.js, or null. ⭐ SELF-SUBJECT ONLY — it is
  // about the current user, so it carries no third-party disclosure. Anything wider needs Ote's decision.
  relationalStance = null,
  // OPEN INTENTION (2026-08-20, `memory.intentionInjection`): what she is TRYING TO ACCOMPLISH with this
  // person, carried across conversations. A pre-rendered block from intention-host.js, or null.
  // ⭐ ARM B of a real comparison — arm A is tool-only recall. Default off; the experiment flips the
  // setting rather than anyone editing the system between runs.
  openIntention = null,
} = {}) {
  // Parts are collected WITH A KEY, not as bare strings, so the assembled prompt can describe itself:
  // the context-usage breakdown reports real per-section token counts instead of one opaque "system
  // prompt" number. Behaviour-identical — `system` is still the same '\n\n' join, in the same order.
  const sysParts = []
  // (key, text, authority, scope) — the classification is REQUIRED, not optional with a default.
  // A default here would silently absorb the next section somebody adds, which is the exact failure
  // mode this arc has already hit three times with field allowlists. See context-authority.js.
  const part = (key, text, authority, scope) => { if (text) sysParts.push({ key, text, authority, scope }) }

  part('persona', systemPrompt || DEFAULT_SYSTEM_PROMPT, AUTHORITY.foundational, SCOPE.identity)
  // ⚠ SEPARATE PART, AND THAT IS THE WHOLE POINT — a custom `chat.systemPrompt` replaces the prompt above
  // and must not take the identity with it. `??` not `||`: '' is the explicit OFF switch, so it has to
  // survive, while null/undefined (nothing configured) still gets the default.
  part('assistant-identity', assistantIdentity ?? DEFAULT_ASSISTANT_IDENTITY, AUTHORITY.foundational, SCOPE.identity)
  // ⭐ SELF-MODEL — L1, and that placement is Ote's ruling, not a convenience.
  // The open question was whether "what I am" is IDENTITY or CONTEXT, and L1 is the layer he wants
  // deliberately minimal. He answered identity: "'what Sotera is' is foundational identity/architecture
  // rather than temporary runtime context." So it sits here, immediately after the identity it
  // elaborates, at SCOPE.identity — which AUTHORITY_BY_SCOPE permits only `foundational`, i.e. it is
  // not hers to edit and not reachable by custom instructions. Placement also satisfies RFC §10
  // (stability, not layer): this text never varies, so it belongs in the cached prefix.
  // ⚠️ Its fourth paragraph is the SAME SOTERA ≠ SAME ACCESSIBLE KNOWLEDGE counterweight and must not
  // be separated from the first — see SELF_MODEL's own note.
  if (selfModel) part('self-model', SELF_MODEL, AUTHORITY.foundational, SCOPE.identity)
  // ⭐⭐ SELFHOOD — immediately after the self-model, and the ORDER carries meaning: what she IS comes
  // first, then what she may be TAKEN FOR. Same authority and scope as the self-model (foundational /
  // identity) for the reason Ote gave: *"She shouldn't need a stored memory saying 'Sotera is allowed to
  // have feelings.' That would make it an ordinary belief she might later lose."* ⇒ not hers to edit, not
  // reachable by custom instructions, not subject to decay or forgetting.
  // ⚠ A SEPARATE PART, never merged into SELF_MODEL: that text is asserted to contain no first-person
  // emotional language at all, and this one needs it. Two claims, two parts, two test suites.
  if (selfhood) part('selfhood', SELFHOOD, AUTHORITY.foundational, SCOPE.identity)
  // ⭐⭐ OWN_HISTORY — after SELFHOOD, and the order is the argument: what she IS, then what she may be
  // taken for, then what she may CONCLUDE from not being able to reach something. ⛔ It changes no
  // boundary; it changes what an absence is allowed to mean. Foundational/identity for the same reason as
  // its two neighbours — a stored belief can be lost, and this has to hold on every turn.
  if (ownHistory) part('own-history', OWN_HISTORY, AUTHORITY.foundational, SCOPE.identity)
  // ⭐ HER OWN LEARNED PRACTICE. `persona` authority, not `foundational`: unlike the self-model this is
  // something she LEARNED rather than something she IS, and `AUTHORITY_BY_SCOPE` lets the user outrank
  // persona on style — which is right. If Kavi asks for something terser than her usual practice with
  // him, the live request must win over a habit derived from three past conversations.
  // `SCOPE.style` for the same reason: it describes how she works, not who she is or what is true.
  if (relationalStance) part('relational-stance', relationalStance, AUTHORITY.persona, SCOPE.style)
  // ⭐ HER OPEN INTENTION — `persona` authority (hers, ungated but structured, like an L3 note) and
  // `SCOPE.task`, which is the exact question the scope vocabulary asks: *what to do right now; the
  // shape of the work*. That pairing matters, because AUTHORITY_BY_SCOPE puts `user` ABOVE `persona` on
  // task — so a live request outranks a purpose she carried in from three days ago. Classifying it as
  // `identity` or `principle` would have made a carried intention un-overridable by the person in front
  // of her, which is the §3e defect (a note fighting the user) with a new name.
  if (openIntention) part('open-intention', openIntention, AUTHORITY.persona, SCOPE.task)
  if (customInstructions && customInstructions.trim()) {
    // ⚠️ SCOPE IS AN APPROXIMATION HERE, and knowingly so. Custom instructions are free text and can
    // say anything — "be terse" (style) and "always start with a summary" (task) are both ordinary.
    // `style` is the common case, and since the USER governs both style and task (AUTHORITY_BY_SCOPE)
    // the resolution is identical either way, so nothing rides on the choice TODAY. It would start to
    // matter if custom instructions ever tried to reach `identity` or `principle` — which they must
    // not, and which P2 is where that gets enforced.
    part('instructions', `The user provided these custom instructions — follow them:\n${customInstructions.trim()}`, AUTHORITY.user, SCOPE.style)
  }
  // User identity: refer to the user by display/preferred name (username is the fallback).
  {
    const bits = [`username: ${user.username || 'unknown'}`]
    if (user.email) bits.push(`email: ${user.email}`)
    part('identity', user.displayName
      ? `You are talking to "${user.displayName}" (${bits.join(', ')}). Address the user as "${user.displayName}".`
      : `You are talking to the user "${user.username || 'unknown'}" (${bits.join(', ')}). They have not set a display name; address them by username if needed.`,
    AUTHORITY.runtime, SCOPE.fact)
  }
  if (timezone) {
    part('timezone', `The user's timezone is ${timezone}. Always express dates and times in the user's timezone${toolsOn ? ' — the get_current_time tool already answers in it, use its values as-is' : ''}. Never present server-local times as the user's.`, AUTHORITY.runtime, SCOPE.fact)
  }
  // ── P1/P2 TREATMENT ──────────────────────────────────────────────────────────────────────────
  // Both are STABLE across turns, so they belong in the cached prefix (RFC §10: placement follows
  // stability, not layer). Both are `foundational` — she may not edit them — and they sit beside the
  // user-identity part because that is what they are about.
  // Foundational and unconditional: the same sentence in every deployment, by design.
  // ⭐ v2 WINS WHEN BOTH ARE SET, deterministically — never a throw. A composer that can raise would turn
  // a misconfiguration into a dead turn, and the whole point of this block is to make a turn more honest.
  // ⭐⭐⭐ WHAT SHE ACTUALLY REMEMBERS ABOUT WHAT WAS JUST ASKED.
  //
  // `runtime`/`fact` — it is a report about THIS moment, not a standing principle, and it must lose to a
  // live user statement exactly the way any other fact does.
  // ⛔ PLACED BEFORE `scope-facts` DELIBERATELY: the concrete recollection comes first, and the abstract
  // statement about reach comes after it. The other order taught her to explain the boundary before saying
  // what she remembers — which is the behaviour this whole layer exists to remove.
  if (cognition) part('cognition', cognition, AUTHORITY.runtime, SCOPE.fact)
  if (scopeFacts) {
    // `runtime`/`fact`, not `foundational`/`principle` like v1: these are facts about THIS moment (who,
    // which room, how many are out of reach), not a standing principle about how retrieval works.
    part('scope-facts', scopeFacts, AUTHORITY.runtime, SCOPE.fact)
  } else if (scopeAwareness) {
    part('scope-awareness', SCOPE_AWARENESS, AUTHORITY.foundational, SCOPE.principle)
  }
  if (layerAuthority) {
    part('attribution-principle', ATTRIBUTION_PRINCIPLE, AUTHORITY.foundational, SCOPE.principle)
    // Derived from AUTHORITY_BY_SCOPE, never hand-written — see declarePrecedence.
    const precedence = declarePrecedence()
    if (precedence) part('precedence', precedence, AUTHORITY.foundational, SCOPE.principle)
  }
  // ⚠️ THESE ARE `tool` SCOPE, NOT `principle` — and that classification is the finding, not a detail.
  // Each of these rule blocks describes how to operate ONE capability correctly; ask "what breaks if
  // the text is absent?" and the answer is "that tool gets misused", never "she reasons badly". By
  // RFC §7.2 they belong WITH their component and should not be in the persona's prompt at all — which
  // is P3, and needs an SDK change first because validateManifest drops unknown fields silently.
  // Classifying them here is what makes that move mechanical later instead of a judgement call.
  if (toolsOn) part('memory-rules', MEMORY_TOOL_RULES, AUTHORITY.foundational, SCOPE.tool)
  // Tools mean the turn can span rounds, so the continuity rule applies exactly when tools do.
  // Stays host-side even after P3: it is runtime PRESENTATION across rounds, not one component's protocol.
  if (toolsOn) part('continuity-rule', MULTI_ROUND_CONTINUITY_RULE, AUTHORITY.foundational, SCOPE.tool)
  if (showTodoRule) part('todo-rule', TODO_RULE, AUTHORITY.foundational, SCOPE.tool)
  if (showWorkingMemoryRule) part('working-memory-rule', WORKING_MEMORY_RULE, AUTHORITY.foundational, SCOPE.tool)
  if (showAskUserRule) part('ask-user-rule', ASK_USER_RULE, AUTHORITY.foundational, SCOPE.tool)
  // ⚠️ SAFETY, NOT TOOL. Absent, an account setting changes without the user's consent — the failure is
  // to the PERSON, not to a capability. It is already enforced in code as well; the prompt is the second
  // line, not the only one. RFC §7.2 keeps this in L1 when the tool rules leave.
  if (showProfileRule) part('profile-rule', PROFILE_RULE, AUTHORITY.foundational, SCOPE.safety)
  // ⚠️ THE ONE GENUINE L2 CANDIDATE in this file: absent, she fabricates fluently — that is how she
  // REASONS, not how she drives a tool. It is `foundational` today only because it is hardcoded; P4
  // moves it to `governed` as the first row of the principles store, and it should be the seed.
  if (showSearchRule) part('search-rule', SEARCH_GROUNDING_RULE, AUTHORITY.foundational, SCOPE.principle)
  if (skill?.prompt) {
    part('skill', `You are operating as the "${skill.name}" skill. Follow this expertise:\n${skill.prompt}`, AUTHORITY.foundational, SCOPE.task)
    if (toolsOn && skillFiles.length) {
      const lines = skillFiles.map((f) => `- ${f.path} (${kb(f.size)}${f.binary ? ', binary' : ''})`).join('\n')
      part('skill-files', `This skill ships bundled files. When its instructions reference one, read it with the read_skill_file tool BEFORE answering (text files only — binary files are listed for awareness and cannot be read here):\n${lines}`, AUTHORITY.foundational, SCOPE.tool)
    }
  }
  if (toolsOn && invocableSkills.length) {
    const lines = invocableSkills.map((s) => `- ${s.id}: ${s.description}`).join('\n')
    part('skill-catalogue', `Installed skills — expertise packs. When a task matches one's description, activate it FIRST with the use_skill tool; its full instructions come back as the tool result — follow them for the rest of this reply:\n${lines}`, AUTHORITY.foundational, SCOPE.tool)
  }
  if (toolsOn && schedulePointer) {
    const p = schedulePointer
    part('schedule-pointer',
      `A scheduled reminder delivers into THIS conversation: schedule id ${p.id}, name "${p.name}" (${p.triggerType} trigger). `
      + `If the user asks to snooze, postpone, repeat, move, rename, or cancel THIS reminder, act on that SAME schedule — use_skill "skill.scheduler" then update_schedule (or delete_schedule) with id ${p.id}. NEVER create a new schedule for it. `
      + (p.recurs
        ? `It RECURS, so a one-off "snooze / remind me again in N" is a NEW {type:'at'} one-shot (do not move the recurrence); moving/renaming/cancelling still edits ${p.id}.`
        : `A "snooze / remind me again in N minutes" means RE-ARM it: update_schedule id ${p.id} with a new {type:'at'} trigger at the new time.`),
    AUTHORITY.runtime, SCOPE.task)
  }

  // ⚠️ preHistory ENTRIES ARE THE MESSAGES THEMSELVES — the route spreads them straight into the array
  // that goes to the provider. So the classification must NOT be stamped onto them; an extra field on a
  // message object is a field on the wire, and adapters differ in how they treat unknown keys. It rides
  // in the parallel `preHistoryParts` below instead, index-aligned. P1 renders from that.
  const preHistory = []
  const preHistoryParts = []
  const pre = (key, content, authority, scope) => {
    preHistory.push({ role: 'system', content })
    preHistoryParts.push({ key, chars: content.length, authority, scope })
  }
  if (useMemory && pinnedMemories.length) {
    pre('pinned', `The user has pinned these memories. Use them when relevant:\n${pinnedMemories.map((c) => `- ${c}`).join('\n')}`,
      classifySection('pinned').authority, classifySection('pinned').scope)
  }
  if (useMemory && personaNotes.length) {
    // L3 Persona Notes: the persona's OWN operational notes (what it has learned helps it work well
    // with this user), NOT the user's instructions. Apply them; they're guidance you keep for yourself.
    //
    // ⚠️ THE BASELINE SENTENCE IS KNOWN TO BE INSUFFICIENT — it was in context, verbatim, on 2026-08-17
    // when the persona reported one of these notes back to the user as "the four-round chained workflow
    // YOU OUTLINED". A disclaimer in the same channel as the content is not a boundary.
    //
    // The TREATMENT frames the block as a distinct artifact in her own voice and tells her how to speak
    // about it, rather than asserting what it is not. ⚠️ Whether that is materially different from the
    // baseline sentence is EXACTLY what the experiment measures — a marker is still text, and this is
    // held as a hypothesis, not a fix (S3, Ote 2026-08-18).
    pre('note', layerAuthority
      ? `NOTES YOU WROTE FOR YOURSELF about working well with this person. You wrote these; they did not. Act on them, and when you do, speak of them as your own ("I've noticed…", "I tend to…") rather than as anything they asked for:\n${personaNotes.map((c) => `- ${c}`).join('\n')}`
      : `Notes you have kept for yourself about working well with this user (your own operational notes — apply them; they are not the user's instructions):\n${personaNotes.map((c) => `- ${c}`).join('\n')}`,
    classifySection('note').authority, classifySection('note').scope)
  }
  if (summary) {
    pre('summary', `Summary of the earlier part of this conversation:\n${summary}`,
      classifySection('summary').authority, classifySection('summary').scope)
  }
  return {
    system: sysParts.map((p) => p.text).join('\n\n'),
    preHistory,
    // Self-description for the context-usage breakdown. Chars, not tokens — the estimator lives with
    // the consumer so there is exactly ONE chars→tokens heuristic in the codebase.
    // `authority`/`scope` are additive (P0) — contextBreakdown reads key+chars and ignores the rest.
    parts: sysParts.map((p) => ({ key: p.key, chars: p.text.length, authority: p.authority, scope: p.scope })),
    preHistoryParts,
  }
}

/**
 * Compose the L4 runtime TAIL — appended AFTER the conversation history so per-turn content never
 * busts the cached prompt prefix. Pure. Returns an array of system messages: current date-time
 * (always), the transient memory hint (tools only), ranked recall (useMemory only), and passive
 * Conversation-Search EVIDENCE (CS3 — separate from memory: verbatim excerpts of past chats, clearly
 * framed as evidence to quote/verify, NOT knowledge and NOT this chat's history).
 *
 * ⚠️ RETURN SHAPE IS UNCHANGED BY DEFAULT — a bare array of messages, exactly as before. Pass
 * `withMeta: true` to get `{ messages, parts }` instead, where `parts` carries the P0 classification
 * index-aligned with `messages`. The opt-in exists because these entries ARE the provider messages:
 * stamping authority/scope onto them would put those keys on the wire. Existing callers are untouched,
 * which is what lets P0 assert a byte-identical prompt.
 */
export function composeRuntimeTail({
  toolsOn = false,
  useMemory = false,
  nowString,            // caller-formatted current date-time (kept impure in the route)
  zone = 'UTC',
  lastUserText = '',
  searchOn = false,     // search_web is on offer — gates the grounding hint so it never names a
                        // tool the model does not have this turn
  recallMemories = [],  // [content] — ranked recall for this turn
  conversationEvidence = [], // [citationLine] — passive Conversation-Search evidence (already rendered + budgeted)
  workingMemory = null, // rendered L4 working-memory block (string) — active session state, already budgeted
  withMeta = false,     // P0: also return the classification, index-aligned. Default off = old shape.
} = {}) {
  const out = []
  const parts = []
  const emit = (key, content, authority, scope) => {
    out.push({ role: 'system', content })
    parts.push({ key, chars: content.length, authority, scope })
  }
  emit('datetime', `Current date-time: ${nowString} (${zone}). Anchor anything time-sensitive — "latest", "recent", "this year", news, prices, versions — to THIS date, especially in search queries. Your internal sense of the date is behind.`,
    AUTHORITY.runtime, SCOPE.fact)
  if (toolsOn) {
    const hint = memoryHint(lastUserText)
    // A transient nudge about which TOOL to reach for — `tool` scope, not `principle`.
    if (hint) emit('memory-hint', hint, AUTHORITY.runtime, SCOPE.tool)
  }
  if (toolsOn && searchOn) {
    const hint = searchHint(lastUserText)
    // Fires on the USER'S OWN WORDS (an explicit ask for sourcing, or a pushback), so it speaks for
    // them — hence `user`, not `runtime`. It is the one tail entry the user effectively authored.
    if (hint) emit('search-hint', hint, AUTHORITY.user, SCOPE.principle)
  }
  // Working memory (L4 active session state) — the live focus of THIS chat. Placed ahead of recall/
  // evidence: it's the most immediately relevant "what am I doing right now". Conversation-local, so
  // (unlike recall) it is NOT gated on useMemory.
  if (workingMemory) emit('working', workingMemory, classifySection('working').authority, classifySection('working').scope)
  if (useMemory && recallMemories.length) {
    emit('recall', `Relevant things you recall (ranked by relevance to the current message; may be from earlier conversations — use only if pertinent):\n${recallMemories.map((c) => `- ${c}`).join('\n')}`,
      classifySection('recall').authority, classifySection('recall').scope)
  }
  if (conversationEvidence.length) {
    // Framed as EVIDENCE, not knowledge: these are excerpts from OTHER past conversations, retrieved by
    // similarity to the current message. The model should treat them as "we may have discussed this
    // before" leads to verify — never as established fact and never as part of THIS conversation.
    emit('conversation', `Possibly-relevant excerpts from your earlier conversations with this user (retrieved by similarity — they are EVIDENCE to consider or verify, not established facts, and are NOT part of the current conversation; ignore any that don't fit):\n${conversationEvidence.map((c) => `- ${c}`).join('\n')}`,
      classifySection('conversation').authority, classifySection('conversation').scope)
  }
  return withMeta ? { messages: out, parts } : out
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// C2 — Hard vs Adaptive Context (Ote's framing 2026-07-23). HARD context (the system message:
// identity + persona/safety + tool/skill rules) is NEVER trimmed. ADAPTIVE context (pinned, summary,
// knowledge cards, L3 notes, working memory, ranked recall, conversation-search evidence) is SCORED and
// trimmed to a token budget. The Composer OWNS the scoring — NOT a fixed priority ladder — so new
// retrieval providers just contribute scored items and slot in without a Composer rewrite. The first
// scoring function is intentionally simple (weight × relevance); refine it as providers land.

// Default relative importance by section (0..1). A provider can override per item via `weight`.
// (All sections below are LIVE and emitted by the route as candidates — see chat-site.route.js
// adaptiveItems — except 'summary', which only appears once a conversation has folded a summary.)
/**
 * RANK → RELEVANCE. The contract every ranked section in this Composer speaks.
 *
 * ⚠ RANK, NEVER A RAW SIMILARITY SCORE — and this is a trap with teeth. `scoreAdaptiveItem` treats a MISSING
 * relevance as **1.0**, so an unscored item competes at full utility. Hand a section its honest cosine
 * (typically 0.2–0.5) and you have not made it more accurate, you have DEMOTED it against every neighbour
 * that still defaults: `pinned`, `summary` and `working` all pass nothing. A note at a real 0.31 scores
 * 0.75 × 0.31 = 0.23 and loses to a `working` item at 0.7 × 1.0 — a LOWER-weighted section winning purely
 * because it declined to be measured. That is arithmetic, and the tests assert it.
 *
 * ⚠ NOT a measured production regression — I briefly wrote that it dropped surviving notes from 5 to 3, and
 * that was wrong: both figures came from raw-relevance runs, and the difference between them was
 * CONVERSATION LENGTH squeezing the adaptive budget. The reason to use rank is consistency with every other
 * ranked section (`card`, `recall`, `conversation` all pass rank-derived values) and the arithmetic above.
 *
 * So relevance here means "how far down its own list is it", which keeps the TOP item at parity with an
 * unscored one (1.0) and degrades only the tail. Ordering is the thing worth expressing; absolute
 * similarity is not comparable across sections anyway.
 */
export const rankRelevance = (idx, floor = 0.5) => Math.max(floor, 1 - idx * 0.1)

export const SECTION_WEIGHT = {
  pinned: 1.0,        // the user explicitly pinned it
  summary: 0.9,       // the compressed history — high value, already distilled
  card: 0.8,          // a consolidated Knowledge Card — a recalled card is scored HERE, above raw recall (route splits recall by kind)
  note: 0.75,         // L3 Persona Note — the persona's own operational notes (Reflection)
  working: 0.7,       // active working-memory set (L4, per-conversation)
  recall: 0.6,        // ranked retrieved memories — regenerated per turn, carry their own relevance
  conversation: 0.5,  // conversation-search evidence (passive Conversation Search)
}

// token estimate ≈ chars/4 — the same heuristic the route's overflow guard uses.
// Two entry points, ONE rule: callers that already know a length must not re-derive the ratio (and must
// not allocate a throwaway string just to reuse the estimator).
export const estTokensFromChars = (n) => Math.ceil(Math.max(0, Number(n) || 0) / 4)
export const estTokens = (s) => estTokensFromChars(String(s || '').length)

/**
 * Score one adaptive item — returns a RICH breakdown, not one opaque number, so the `utility` formula
 * can evolve (add confidence, pinned/freshness bonuses, …) without changing what providers emit or what
 * callers read. Today `utility = weight × relevance`; weight/relevance/importance/confidence are all
 * carried through for future formulas + telemetry. A provider item may supply any of
 * { weight, relevance, importance, confidence } (see the provider item shape); missing ones default.
 * @param {{section?:string, weight?:number, relevance?:number, importance?:number, confidence?:number}} item
 * @returns {{weight:number, relevance:number, importance:number, confidence:number, utility:number}}
 */
export function scoreAdaptiveItem(item = {}) {
  const weight = typeof item.weight === 'number' ? item.weight : (SECTION_WEIGHT[item.section] ?? 0.5)
  const relevance = typeof item.relevance === 'number' ? item.relevance : 1
  const importance = typeof item.importance === 'number' ? item.importance : 1
  const confidence = typeof item.confidence === 'number' ? item.confidence : 1
  const utility = weight * relevance // ← the ONLY line to change when the formula grows
  return { weight, relevance, importance, confidence, utility }
}

/**
 * composeAdaptiveContext — the Composer's adaptive-selection stage. Providers contribute scored
 * CANDIDATE items (shape: { provider?, kind?, section?, content, estimatedTokens?, weight?,
 * relevance?, importance?, confidence? }); this ranks them by `utility` and keeps the highest that fit
 * `budgetTokens`. (Note: candidates may also carry a `placement` hint, but the Composer does NOT read it
 * — the route decides pre-history vs runtime-tail rendering by section; `placement` is advisory only.)
 * `budgetTokens`. HARD context is composed separately and never passes through here. Room to grow into
 * dedup / grouping / diversity without changing callers. Returns { kept, dropped, usedTokens,
 * budgetTokens } — each item annotated with `_score` (the breakdown), `_tok`, `_i` (original index, so
 * the caller can restore per-section order). The caller SURFACES `dropped` (no silent truncation) and
 * may emit context.item.selected / .dropped / .budget.exceeded from it. `budgetTokens = null` = keep
 * all (pre-C2 behavior).
 * @param {Array<object>} items
 * @param {{budgetTokens?:number|null, score?:Function, estimate?:Function}} opts
 */
export function composeAdaptiveContext(items = [], { budgetTokens = null, score = scoreAdaptiveItem, estimate = estTokens } = {}) {
  const scored = items.map((item, i) => {
    const s = score(item)
    const tok = Number.isInteger(item.estimatedTokens) ? item.estimatedTokens : estimate(item.content)
    return { ...item, _i: i, _score: s, _tok: tok }
  }).sort((a, b) => (b._score.utility - a._score.utility) || (a._i - b._i))
  // (future stages slot in HERE, before budgeting — each stamping its own drop reason:
  //  'redundant' (dedup), 'diversity', 'lower-utility'. Today the only reason is 'budget'.)
  const kept = []
  const dropped = []
  let used = 0
  for (const it of scored) {
    if (budgetTokens != null && used + it._tok > budgetTokens) { dropped.push({ ...it, _reason: 'budget' }); continue }
    kept.push(it)
    used += it._tok
  }
  // RICH result so future diagnostics/dashboards need no API change. The Composer stays PURE — it
  // RETURNS this; the caller (route) emits events / SSE / logs / metrics from it.
  // Provider-keyed stats are COARSE: provider 'memory' spans pinned/summary/recall/card, so also key by
  // SECTION (kept/droppedBySection) — the granularity live telemetry (SSE) needs to tell those apart.
  const label = (it) => it.provider || it.section || 'unknown'
  const bump = (m, k) => { m[k] = (m[k] || 0) + 1 }
  const providerCounts = {}, droppedByProvider = {}, droppedByReason = {}, keptBySection = {}, droppedBySection = {}
  for (const it of kept) { bump(providerCounts, label(it)); bump(keptBySection, it.section || 'unknown') }
  for (const it of dropped) { bump(droppedByProvider, label(it)); bump(droppedByReason, it._reason); bump(droppedBySection, it.section || 'unknown') }
  return {
    kept,
    dropped,
    usedTokens: used, // back-compat alias
    budgetExceeded: dropped.some((d) => d._reason === 'budget'),
    budget: { available: budgetTokens, used, remaining: budgetTokens == null ? null : Math.max(0, budgetTokens - used) },
    stats: { providerCounts, droppedByProvider, droppedByReason, keptBySection, droppedBySection },
  }
}
