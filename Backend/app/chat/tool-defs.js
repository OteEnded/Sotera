// Tool-definition assembly — the ONE place a turn's toolset is built.
//
// ⭐⭐⭐ S1 · WHY THIS IS A MODULE AND NOT TWO CODE PATHS.
//
// ⛔⛔ THE DEFECT IT CLOSES. A Skill declares `allowed_tools`. It was honoured when the Skill was
// BOUND to the conversation and silently IGNORED when the model TRIGGERED one with `use_skill` — and
// self-triggering is the mode we actually use, so the field was a decoration on the path that matters.
//
// ⚠️ AND OUR OWN DESIGN NOTE HAD THE CAUSE WRONG. `DESIGN_SOTERA_SKILL_CONTRACT.md` §4 said the fix was
// *"a filter, not a redesign — the loop already rebuilds toolDefs per round."* It does not. The list was
// built ONCE, inline in the route, before the round loop; the loop only READS it (`tools: toolDefs` on
// every `streamChat`). So there was no second assembly for an activated Skill's allowlist to apply in —
// which is why the cheap fix would have had to be a SECOND COPY of the whole chain.
//
// ⭐ Ote, 2026-08-24: *"hoist tool-definition assembly into one shared function… don't create a
// second/reimplemented filtering chain."* ⇒ nine ordered steps, one argument that varies (the Skill in
// force), and both callers use it. A second copy is exactly the failure family this repo has recorded
// thirteen times — an explicit list silently dropping what it was not told about — and here it would
// leak in the other direction too: a tool added to the route's chain and not to the trigger site's copy
// would vanish the moment a Skill activated.
//
// ⭐ PURE ON PURPOSE. No fastify, no request, no db — every dependency arrives as an argument, so the
// enforcement can be pinned by a unit test instead of inferred from a live turn. Same reasoning as
// `withProviderOptions` in chat-runtime: a transformation that decides what the model can DO is worth
// pinning directly.
//
// ── THE ORDER MATTERS, and this is what it is ────────────────────────────────────────────────────
//   ①  base            the Skill's allowlist, or every installed tool
//   ②  one-shot narrow  a caller's `allowedTools` for this send — narrows, never widens
//   ③  headless gate    interactive tools are ABSENT when no human is watching
//   ④  read_skill_file  the active Skill's own bundled files
//   ⑤  list_decisions   the project-decision lookup
//   ⑥  use_skill        activation (+ its own reader) while skills are still triggerable
//   ⑦  set_display_name interactive only
//   ⑧  remember_person  interactive only
//   ⑧b seek_advice      reaching another intelligence (only when a destination is configured)
//   ⑨  memory gate      the master memory switch, then empty → undefined
// ⭐ Steps ④–⑧ are INFRA and land AFTER ①–③ on purpose: a Skill's allowlist governs capability tools,
// never the platform's own hands. A Skill with an empty allowlist can still read its own files.

import { toolDefinitions, memoryToolNames } from '../components/runtime.js'
import { INTERACTIVE_TOOL_NAMES } from '../interaction/index.js'

// The write half of memory. Lives here because step ⑨ is the only place that decides whether the MODEL
// drives memory writes this turn; the route imports it back for the end-of-turn "did she actually write"
// check, so there is still one definition.
export const MEMORY_WRITE_TOOLS = new Set(['remember', 'remember_fact'])

/**
 * Build one turn's tool definitions.
 *
 * @param {object}   o
 * @param {object?}  o.skill                 the Skill in force — BOUND before the loop, or the one the
 *                                           model just activated. null = no Skill.
 *                                           ⭐ `skill.tools` is already OpenAI-shaped and already filtered
 *                                           to installed components by the SDK's resolveSkill, and
 *                                           `allowedComponents === null` resolves to EVERY tool — which is
 *                                           why a Skill declaring no restriction is unaffected by all of this.
 * @param {boolean}  o.toolsOn               the conversation's Tools switch
 * @param {boolean}  o.interactiveTurn       is a human on the other end of this turn?
 * @param {Array}    o.invocableSkills       skills the model may still activate (empty once one is bound)
 * @param {string[]?} o.oneShotAllowedTools  a caller's per-send narrowing (scheduled runs)
 * @param {boolean}  o.useMemory             the master memory switch
 * @param {string[]} [o.adviceDestinations]   destinations she may reach; empty = no `seek_advice` tool
 * @param {'none'|'bound'|'triggered'} [o.path]  which assembly this is — the ONLY thing the caller knows
 *                                           that this function cannot work out for itself.
 * @returns {{ defs: Array|undefined, modelCanWriteMemory: boolean, trace: object|null }}
 *   ⭐ `trace` is built HERE rather than at the call sites: a two-line summary duplicated across two
 *   callers is the same drift risk as the filter chain was, and this one would drift silently because a
 *   wrong count still looks like a number.
 */
export function assembleToolDefs({
  skill = null,
  toolsOn,
  interactiveTurn,
  invocableSkills = [],
  oneShotAllowedTools = null,
  useMemory,
  path = null,
  // ⭐ Destination names Sotera may reach (from config.advice.destinations). Empty = the tool is not
  // offered at all, which is the right behaviour: no counterpart, no capability.
  adviceDestinations = [],
}) {
  const files = skill?.skillFiles || []

  // ① A Skill constrains the tools to its allowedComponents; otherwise the full installed toolset.
  let toolDefs = toolsOn ? (skill ? skill.tools : toolDefinitions()) : undefined

  // ② One-shot tool constraint (scheduled runs): intersects with whatever the skill allows — a caller
  // can narrow the toolset for this send, never widen it. Infra tools are added AFTER, so constraining
  // never breaks skills.
  if (toolDefs && Array.isArray(oneShotAllowedTools) && oneShotAllowedTools.length) {
    const allowedOnce = new Set(oneShotAllowedTools)
    toolDefs = toolDefs.filter((d) => allowedOnce.has(d.function?.name))
  }

  // ③ Headless gate (RFC: requiresHuman): internal self-requests (scheduled runs, digests, assist
  // side-calls) have NO human watching — interactive tools like ask_user are simply ABSENT from their
  // toolset, never a hang or an error the model must dance around.
  if (toolDefs && !interactiveTurn) {
    toolDefs = toolDefs.filter((d) => !INTERACTIVE_TOOL_NAMES.has(d.function?.name))
  }

  // ④ read_skill_file: the host-side reader behind the bundled-file inventory in the system prompt.
  // Offered whenever the active skill ships files — even a skill with an empty tool allowlist gets it,
  // because reading its own material isn't a platform capability, it's part of the skill.
  if (toolsOn && files.length) {
    toolDefs = [...(toolDefs || []), {
      type: 'function',
      function: {
        name: 'read_skill_file',
        description: `Read a text file bundled with the active "${skill.name}" skill (the files listed in the system prompt).`,
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'bundled file path exactly as listed, e.g. references/guide.md' } },
          required: ['path'],
        },
      },
    }]
  }

  // ══ ⑤ ⭐⭐⭐ list_decisions — A LOOKUP, NOT A RECALL ═══════════════════════════════════════════════
  //
  // ⛔⛔ WHY A SEPARATE TOOL AND NOT BETTER RETRIEVAL. Measured, three runs: with twelve verified
  // project decisions in her own store — embedded — she answered *"no prior decision found"* about a
  // proposal that is FROZEN, and on the third run retrieved HER OWN two failed answers from minutes
  // earlier and cited them as evidence the matter was undecided. Semantic recall surfaced
  // conversational similarity and recency; it did not surface the record.
  //
  // ⭐ Ote, 2026-08-24: *"'Have we made a decision about X?' is an enumeration/lookup question, so
  // don't try to force semantic recall to solve it."* ⇒ this ENUMERATES. There are a dozen records;
  // similarity has no work to do, and a lookup cannot be outranked by a conversation that merely
  // sounds like the question.
  // ⛔ AND IT CHANGES NOTHING ABOUT RETRIEVAL. No ranking, no floor, no cue formation, no embedding.
  // Defect A and the relevance floor stay exactly where they are.
  //
  // ── THE BOUNDARIES, each deliberate (enforced at the dispatch site, not here) ───────────────────
  //   READ-ONLY        one SELECT. No write path exists there.
  //   ONE ENTITY       `entity = 'project-decision'` and nothing else, so it cannot become a general
  //                    memory reader by accident — the failure mode a broad "list rows" tool invites.
  //   OWNERSHIP        `user_id = <the caller's own room>`, the same boundary every memory read uses.
  //   PROVENANCE OUT   the source reference and the verbatim quote come back with the record, because
  //                    the whole point is that her citation can be checked rather than trusted.
  //   NO OTHER CONTENT the projection lists its fields explicitly.
  if (toolsOn) {
    toolDefs = [...(toolDefs || []), {
      type: 'function',
      function: {
        name: 'list_decisions',
        description: 'Enumerate the recorded PROJECT DECISIONS — what was decided, its status '
          + '(shipped/frozen/rejected/deferred/open), when, and the source reference it came from. '
          + 'Use this to answer whether something has already been decided, frozen or rejected. '
          + 'This is a complete list, not a search: an empty result means no decision is recorded.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'optional filter: shipped | frozen | rejected | deferred | open' },
          },
        },
      },
    }]
  }

  // ⑥ Skill trigger: use_skill (activation) + read_skill_file (the activated skill's bundled files).
  // ⓘ Gated on `invocableSkills`, which the route computes from the BOUND skill — deliberately NOT on
  // the `skill` argument. So activating a Skill mid-turn does not withdraw the activation tool, which is
  // exactly today's behaviour and not something S1 set out to change.
  if (toolsOn && invocableSkills.length) {
    toolDefs = [...(toolDefs || []), {
      type: 'function',
      function: {
        name: 'use_skill',
        description: 'Activate an installed skill (listed in the system prompt) when the task matches its description. Returns the skill\'s full instructions — follow them for the rest of this reply.',
        parameters: {
          type: 'object',
          properties: { skill: { type: 'string', enum: invocableSkills.map((s) => s.id), description: 'the skill id exactly as listed' } },
          required: ['skill'],
        },
      },
    }, {
      type: 'function',
      function: {
        name: 'read_skill_file',
        description: 'Read a text file bundled with the skill you activated via use_skill (its file list comes back with the activation).',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'bundled file path exactly as returned by use_skill' } },
          required: ['path'],
        },
      },
    }]
  }

  // ⑦ Profile: set_display_name — the model's hand on the Profile Service (how it addresses the user).
  // Platform-intrinsic account management (like use_skill/read_skill_file), not a portable capability,
  // so it's a native tool the dispatch loop handles directly. Offered only on INTERACTIVE turns —
  // there's a human to confirm with (the PROFILE_RULE requires an ask_user yes first), and a
  // scheduled/headless run has no one whose name to set.
  if (toolsOn && interactiveTurn) {
    toolDefs = [...(toolDefs || []), {
      type: 'function',
      function: {
        name: 'set_display_name',
        description: "Set the user's display name — the name you address them by, persisted across all conversations. TWO STEPS, both required: (1) call with just { name } — this changes NOTHING and returns a confirmation prompt; (2) ask the user to confirm, and ONLY after they explicitly say yes, call again with { name, confirm: true } to apply it. Never pass confirm:true without the user's explicit yes in this same turn.",
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The display name to set, e.g. "Ote".' },
            confirm: { type: 'boolean', description: 'Pass true ONLY on the second call, after the user has explicitly agreed to this exact name. Omit (or false) on the first call.' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    }]
  }

  // ⑧ People: remember_person — the model's hand on the Person Service. Same shape and same reason as
  // set_display_name above: naming a human who is NOT PRESENT TO OBJECT is exactly the act that must
  // not happen silently, so it is two-phase and the confirm gate lives in the service.
  //
  // ⭐ It exists because she kept needing it and improvising. Five times, unprompted, across two
  // people and two accounts, a belief about a third party had to be smuggled into an attribute name
  // or a value string — "user's known_others: Ote…", "User's colleague Priya taught them…" — because
  // there was no way to bring into existence a person who never logs in.
  // ⚠️ It creates a person. It does NOT link accounts, merge identities, or decide two people are the
  // same human; a name collision is REPORTED back so she can ask rather than assume.
  if (toolsOn && interactiveTurn) {
    toolDefs = [...(toolDefs || []), {
      type: 'function',
      function: {
        name: 'remember_person',
        description: "Create a record for a PERSON the user mentions who does not have an account here — a colleague, a friend, someone in a story. Once created you can use their id as `subject` on remember_fact, so a memory can be ABOUT them rather than about the user. TWO STEPS, both required: (1) call with just { name } — this creates NOTHING and tells you whether anyone of that name is already recorded; (2) ask the user, and ONLY after they answer, call again with { name, confirm: true }. If someone of that name already exists, ASK whether it is the same person — never assume two people with one name are one human. Do not use this for the user themselves (that is set_display_name).",
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The person\'s name as the user gave it, e.g. "Priya".' },
            note: { type: 'string', description: 'Optional: how they came up, e.g. "Kavi\'s colleague, mentioned 2026-08-19".' },
            confirm: { type: 'boolean', description: 'Pass true ONLY on the second call, after the user has answered. Omit on the first call.' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    }]
  }

  // ══ ⑧b ⭐⭐⭐ seek_advice — REACHING ANOTHER INTELLIGENCE ═══════════════════════════════════════════
  //
  // ⭐ ONE tool, not three. Hermes's own Footprint-Ladder reasoning applied to her toolset: she must not
  // have to manage session lifecycle, and every extra tool is schema paid for on every call.
  //
  // ⛔⛔ THE DESCRIPTION IS DELIBERATELY THIN, AND THAT IS A MEASURED CHOICE. Validation C (2026-08-24)
  // gave her the same eight scenarios with and without a decision framework. Unprimed she got 8/8 on the
  // labels and reasoned BETTER — *"I'd be outsearcing responsibility for the outcome"* — and she invented
  // the word "brief" herself. Primed, consistency held and insight fell. ⇒ Ote: *"Name the distinction,
  // give the default, then get out of the way. Don't turn the Skill into a giant decision tree."*
  // ⛔ Do not grow this description into a rubric. The words below are hers.
  //
  // ⭐ And the FIRST gate is not in here at all: *does she need another intelligence?* Offering only
  // converse/delegate measurably suppressed her *"I wouldn't involve her at all on this one"* — so the
  // description says the tool is for when she has decided to reach out, and says nothing that implies
  // reaching out is the default.
  if (toolsOn && adviceDestinations.length) {
    toolDefs = [...(toolDefs || []), {
      type: 'function',
      function: {
        name: 'seek_advice',
        description:
          'Reach another intelligence you are authorized to talk to (they are listed in your context). '
          + 'Two ways, and the difference matters: mode="converse" is thinking WITH someone — they keep the '
          + 'context of your relationship and you expect to react to what they say; mode="delegate" is '
          + 'handing over a self-contained job — they will NOT have any of your earlier conversation, only '
          + 'the brief you write, and they work on it independently. When it is ambiguous, converse. '
          + 'A delegation returns immediately with an exchange id, not an answer: come back later and call '
          + 'this with `check` set to that id to see how it is going or collect the result.',
        parameters: {
          type: 'object',
          properties: {
            destination: { type: 'string', enum: adviceDestinations, description: 'who to reach' },
            mode: { type: 'string', enum: ['converse', 'delegate'], description: 'converse = thinking with them; delegate = handing them a self-contained job' },
            message: { type: 'string', description: 'for converse: what you want to say to them, in your own voice' },
            brief: { type: 'string', description: 'for delegate: the whole task, written so someone with no other context could act on it exactly as written' },
            check: { type: 'string', description: 'instead of asking: an exchange id from an earlier delegation, to see its state or collect its result' },
          },
          additionalProperties: false,
        },
      },
    }]
  }

  // ⚠️ ONE NAME, ONE DEFINITION — a guard, not a workaround. Steps ④ and ⑥ both offer `read_skill_file`
  // and were mutually exclusive while this ran once per turn (④ needs a bound skill, ⑥ needs none). Now
  // that an ACTIVATED skill re-enters here with `invocableSkills` still populated, both can fire in the
  // same pass. A duplicate function name is a wire-protocol violation on some providers, so the first
  // wins — and the first is ④, whose description names the skill.
  if (toolDefs?.length) {
    const seen = new Set()
    toolDefs = toolDefs.filter((d) => {
      const n = d.function?.name
      if (!n || seen.has(n)) return false
      seen.add(n)
      return true
    })
  }

  // ⑨ Persona Memory v2 — `useMemory` is the MASTER memory switch. When it's OFF, strip the memory
  // tools (recall_memory / remember / … — anything consuming memory.v2) so the model can't reach
  // memory at all, matching the toggle (previously they leaked in whenever Tools was on, so the
  // model still recalled/saved with "Use memory" unchecked). When it's ON and the model HAS memory
  // write-tools, the MODEL drives writes (softly nudged in the system prompt to save proactively) —
  // so the platform does NOT also auto-capture. ONE-WRITER, and it stays: we tried relaxing this
  // (2026-07-24) to let both paths run and lean on the store's dedup, but the two writers RACE — the
  // model's remember_fact + the async captureFacts each reconcile against a store that doesn't yet
  // hold the other's write, so a fact lands twice under different phrasings ("preferred" vs
  // "favorite text editor") and the semantic slot-reconcile (which only collapses writes landing
  // against an EXISTING slot) sails past it. A real fallback would need the two paths serialized
  // through one write queue, not just dedup. Until then: one writer.
  let modelCanWriteMemory = false
  if (toolDefs?.length) {
    if (!useMemory) {
      const memNames = memoryToolNames()
      toolDefs = toolDefs.filter((d) => !memNames.has(d.function?.name))
    } else {
      modelCanWriteMemory = toolDefs.some((d) => MEMORY_WRITE_TOOLS.has(d.function?.name))
    }
    if (!toolDefs.length) toolDefs = undefined // stripped to empty → send no tools param
  }

  // ⭐ THE TRACE · what she could actually reach, recorded because the toolset is otherwise thrown away
  // the moment the request is sent. ⓘ `constrained` reads `allowedComponents` — an ARRAY means the Skill
  // declared an allowlist; `null` is the spec default and means unconstrained. So an unconstrained Skill
  // is distinguishable from no Skill at all, which is the distinction the whole of S1 turns on.
  const trace = toolsOn
    ? {
      count: toolDefs?.length ?? 0,
      path: path ?? (skill ? 'bound' : 'none'),
      skill: skill?.id ?? null,
      constrained: Array.isArray(skill?.allowedComponents),
    }
    : null

  return { defs: toolDefs, modelCanWriteMemory, trace }
}
