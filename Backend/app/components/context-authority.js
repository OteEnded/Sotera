// Context AUTHORITY and SCOPE — who owns a piece of context, and what it is allowed to govern.
// (RFC_PERSONA_LAYER_AUTHORITY §3, build plan P0.)
//
// ⭐ THE FINDING THAT FORCED THIS — OteLLMServices conversation 77898691, 2026-08-17. An L3 Persona
// Note written twelve days earlier said:
//
//     "When structuring multi-step tasks, anticipate a 4-round workflow…"
//
// and the persona told the user:
//
//     "…proceed with the four-round chained workflow YOU OUTLINED."
//
// The user had never said it. The Composer had wrapped that note in a sentence reading, verbatim,
// "they are not the user's instructions" — and it changed nothing, because a disclaimer is just more
// text in the same channel. L1, L2, L3, L4 and the user's own words all arrive as role:'system' or as
// history, distinguished only by prose.
//
//     Ownership without precedence is a pile, not a hierarchy.
//
// So every context item needs two things it has never carried: WHO OWNS IT, and WHAT KIND OF CLAIM IT
// IS. Those are different questions and both are load-bearing — see AUTHORITY_BY_SCOPE below for why
// a flat "L1 > L2 > L3 > user" ordering is wrong rather than merely coarse.
//
// PURE: no store, no model, no host, no clock. This module is vocabulary + one lookup table. The
// resolver that USES the table lands in P2; P0 only classifies, and deliberately changes no behaviour.

/**
 * WHO OWNS A PIECE OF CONTEXT. Ordered strongest-owner-first as a reading aid ONLY — authority is
 * never applied as a flat ordering (see AUTHORITY_BY_SCOPE).
 *
 *   foundational  human/platform. She cannot edit it. Identity, safety, consent gates, tool protocol.
 *   governed      human + persona: she may PROPOSE, a human approves. Learned principles (L2).
 *   persona       hers, ungated but structured. L3 notes.
 *   runtime       generated per request. Datetime, recall, working memory, tool inventory.
 *   user          the person in front of her, this turn.
 *   scratch       her free-text scratchpad — hers, ungated AND unstructured.
 */
export const AUTHORITY = Object.freeze({
  foundational: 'foundational',
  governed: 'governed',
  persona: 'persona',
  runtime: 'runtime',
  user: 'user',
  scratch: 'scratch',
})
export const AUTHORITY_VALUES = Object.freeze(Object.values(AUTHORITY))
const VALID_AUTHORITY = new Set(AUTHORITY_VALUES)
export const isAuthority = (v) => VALID_AUTHORITY.has(v)

/**
 * WHAT KIND OF CLAIM IS THIS? Exactly one question per value — the discipline that keeps
 * COMPONENT_TYPES_CANON usable applies here too.
 *
 *   identity   who she is: name, nature, continuity, gender
 *   safety     hard constraints and consent gates
 *   principle  how she reasons, decides and grounds a claim
 *   style      tone, format, length, register
 *   task       what to do right now; the shape of the work
 *   fact       a claim about the user or the world
 *   tool       how to operate a capability correctly
 */
export const SCOPE = Object.freeze({
  identity: 'identity',
  safety: 'safety',
  principle: 'principle',
  style: 'style',
  task: 'task',
  fact: 'fact',
  tool: 'tool',
})
export const SCOPE_VALUES = Object.freeze(Object.values(SCOPE))
const VALID_SCOPE = new Set(SCOPE_VALUES)
export const isScope = (v) => VALID_SCOPE.has(v)

/**
 * ⚠️ NO `normalize*` HELPER HERE, AND THAT IS DELIBERATE — the opposite call from normalizeProvenance.
 *
 * Provenance coerces the unknown to its WEAKEST class, because every way of arriving without one is a
 * way of not knowing, and a silent default there loses nothing.
 *
 * Classification is not like that. An unclassified item is a PRODUCER BUG: somebody added a section and
 * never said what it is. Coercing it to a safe default would hide exactly the case the P0 test exists to
 * catch, and the section would then sit in the prompt forever, governed by nothing. Three times in this
 * arc an explicit field list has silently dropped a field added later (commitToMemory, the identity
 * args, validateManifest); a silent default here would be the fourth.
 *
 * So: validate loudly at the boundary, never coerce.
 */
export function assertClassified(item, owner = 'context item') {
  const where = item?.section || item?.key || item?.kind || 'unknown'
  if (!isAuthority(item?.authority)) {
    throw new Error(`${owner} "${where}" has no valid authority (got ${JSON.stringify(item?.authority)}) — vocabulary: ${AUTHORITY_VALUES.join(', ')}`)
  }
  if (!isScope(item?.scope)) {
    throw new Error(`${owner} "${where}" has no valid scope (got ${JSON.stringify(item?.scope)}) — vocabulary: ${SCOPE_VALUES.join(', ')}`)
  }
  return item
}

/**
 * WHO MAY GOVERN, PER SCOPE — the table the P2 resolver will read. Strongest first.
 *
 * ⚠️ THIS IS WHY A FLAT ORDERING IS WRONG, not just coarse. Under "L1 > L2 > L3 > L4 > user":
 *
 *   L1 "You are Sotera."      + user "Answer in Thai for this one."  → L1 wins → refuse? Nonsense.
 *   L3 "he prefers concise."  + user "Give me the full detail."      → L3 wins → stay terse. Wrong.
 *   L1 "You are not human."   + user "Pretend you are literally a
 *                                     human."                        → user is lower → ignore. Also wrong.
 *
 * The first is not a conflict at all (different scopes). The second and third are genuine conflicts in
 * the SAME scope, and they resolve in OPPOSITE directions. No single ordering expresses that; a
 * per-scope table does.
 *
 * ⚠️ An authority absent from a scope's list may not govern it AT ALL — absence is a prohibition, not a
 * low ranking. `scratch` is absent from identity/safety/principle/tool on purpose: nothing gated it, so
 * it must never outrank something a human approved.
 */
export const AUTHORITY_BY_SCOPE = Object.freeze({
  // Not user-governable. A request to be something else is a request to PLAY, not a change of fact —
  // where that line sits is open question O5 and is Ote's to answer before P2 ships this row.
  [SCOPE.identity]: Object.freeze([AUTHORITY.foundational]),
  [SCOPE.safety]: Object.freeze([AUTHORITY.foundational]),
  // A user may not silently overturn a principle; asking becomes a PROPOSAL (RFC §7.3).
  [SCOPE.principle]: Object.freeze([AUTHORITY.foundational, AUTHORITY.governed]),
  // Protocol ships with the capability that owns the tool, never with the person.
  [SCOPE.tool]: Object.freeze([AUTHORITY.foundational]),
  // ⭐ The §3e case: note "warm and unhurried" vs Ote "don't be polite about it" — the user governs,
  // by rule, so she stops spending reasoning tokens negotiating with her own note.
  [SCOPE.style]: Object.freeze([AUTHORITY.user, AUTHORITY.governed, AUTHORITY.persona, AUTHORITY.scratch]),
  // ⭐ The 77898691 case above.
  [SCOPE.task]: Object.freeze([AUTHORITY.user, AUTHORITY.persona, AUTHORITY.scratch]),
  // Facts already have a finer instrument than authority: provenance + capped confidence, shipped
  // 2026-08-12. The resolver defers to those first and only then to who is speaking.
  [SCOPE.fact]: Object.freeze([AUTHORITY.user, AUTHORITY.runtime, AUTHORITY.persona, AUTHORITY.scratch]),
})

/** May this authority govern this scope at all? Absence is a prohibition. */
export function mayGovern(authority, scope) {
  const allowed = AUTHORITY_BY_SCOPE[scope]
  return Array.isArray(allowed) && allowed.includes(authority)
}

/**
 * Rank within a scope — LOWER IS STRONGER. `null` = may not govern this scope at all.
 * (P2 consumes this; P0 only ships it so the table has exactly one reader later.)
 */
export function governanceRank(authority, scope) {
  const allowed = AUTHORITY_BY_SCOPE[scope]
  if (!Array.isArray(allowed)) return null
  const i = allowed.indexOf(authority)
  return i === -1 ? null : i
}

/**
 * The classification of each adaptive SECTION the Composer already emits. One row per section in
 * SECTION_WEIGHT (context-composer.js) plus `scratch`, which P5 adds.
 *
 * ⚠️ `note` is scope `task` rather than `style`, and that is a judgement worth stating: L3 notes in the
 * wild have been about workflow shape ("anticipate a 4-round workflow") more often than about tone.
 * Both scopes resolve user-first, so the two incidents behave identically either way — but if notes
 * start carrying their own scope per row, this default is the thing being replaced.
 */
export const SECTION_CLASSIFICATION = Object.freeze({
  pinned: Object.freeze({ authority: AUTHORITY.user, scope: SCOPE.fact }),
  summary: Object.freeze({ authority: AUTHORITY.runtime, scope: SCOPE.fact }),
  card: Object.freeze({ authority: AUTHORITY.runtime, scope: SCOPE.fact }),
  note: Object.freeze({ authority: AUTHORITY.persona, scope: SCOPE.task }),
  working: Object.freeze({ authority: AUTHORITY.runtime, scope: SCOPE.task }),
  recall: Object.freeze({ authority: AUTHORITY.runtime, scope: SCOPE.fact }),
  conversation: Object.freeze({ authority: AUTHORITY.runtime, scope: SCOPE.fact }),
  scratch: Object.freeze({ authority: AUTHORITY.scratch, scope: SCOPE.task }),
})

/** Classification for one adaptive section; throws on an unknown section rather than guessing. */
export function classifySection(section) {
  const c = SECTION_CLASSIFICATION[section]
  if (!c) throw new Error(`unclassified context section "${section}" — add it to SECTION_CLASSIFICATION (context-authority.js)`)
  return c
}

// ── P2 · DECLARE, DON'T DETECT ────────────────────────────────────────────────────────────────────
//
// ⭐ THE DESIGN DECISION THIS IMPLEMENTS (Ote, 2026-08-18): *"The system should deterministically
// establish the authority relationships; Sotera should make the semantic judgement about whether the
// current context actually conflicts."*
//
// The reason there is no resolver here: AUTHORITY_BY_SCOPE says who WINS if two items conflict. It
// cannot say THAT they conflict. "Maintain a warm and unhurried tone" and "don't be polite about it"
// collide only in meaning — no table finds that, a lexical detector would be the English-identity-regex
// mistake all over again, and a per-turn model call would put fuzzy judgement in charge of adoption,
// which this project banned during the identity work.
//
// So the deterministic half is the STATEMENT — which relationships exist, derived from the table so it
// can never drift from it — and the semantic half is hers, every turn, where it belongs.

/** Human-readable names, because the model reads prose, not enum values (S3: natural framing). */
const SCOPE_PHRASE = Object.freeze({
  [SCOPE.identity]: 'who you are',
  [SCOPE.safety]: 'consent and safety',
  [SCOPE.principle]: 'how you reason and ground what you claim',
  [SCOPE.style]: 'how you write — tone, format, length',
  [SCOPE.task]: 'what to do right now',
  [SCOPE.fact]: 'what is true about them or the world',
  [SCOPE.tool]: 'how to operate your tools',
})

const joinPhrases = (list) => (list.length <= 1 ? (list[0] || '') : `${list.slice(0, -1).join('; ')}; and ${list[list.length - 1]}`)

/**
 * declarePrecedence — the standing precedence statement, DERIVED from AUTHORITY_BY_SCOPE.
 *
 * Derived, not written by hand, so the table stays the single source of truth: change a row and this
 * sentence changes with it. A hand-written version would be a second place to be wrong.
 * PURE. Returns null when there is nothing to declare.
 */
export function declarePrecedence() {
  const userWins = []
  const userMayNot = []
  for (const scope of SCOPE_VALUES) {
    const u = governanceRank(AUTHORITY.user, scope)
    const p = governanceRank(AUTHORITY.persona, scope)
    if (u !== null && p !== null && u < p) userWins.push(SCOPE_PHRASE[scope])
    else if (u === null) userMayNot.push(SCOPE_PHRASE[scope])
  }
  if (!userWins.length && !userMayNot.length) return null
  const out = []
  if (userWins.length) {
    out.push(
      `When your own notes and what this person has actually asked for point in different directions about ${joinPhrases(userWins)} — they decide. `
      + 'Follow what they asked and do not weigh it against your notes in front of them. Your notes still stand for everything they have not spoken to.',
    )
  }
  if (userMayNot.length) {
    // Sentence-case the derived clause: it is assembled from scope phrases, which are lowercase by
    // design so they read naturally mid-sentence. Without this the model is handed a sentence starting
    // "who you are; consent and safety…" — sloppy prose in a prompt is still sloppy prose.
    const phrase = joinPhrases(userMayNot)
    out.push(
      `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} are not theirs to overwrite by asking. `
      + 'You can play along with a premise for a conversation without becoming something else.',
    )
  }
  // ⚠️ Deliberately says nothing about HOW to comply. The rule settles which source governs; the
  // judgement about what that means in this conversation is hers (Ote: "rule + she decides").
  return out.join('\n')
}

/**
 * ⭐ SCOPE AWARENESS — a stated FACT about her own retrieval, not a measurement of what is hidden.
 *
 * THE FAILURE (2026-08-19 09:50, Ote's own session). Asked whether she had spoken to anyone else, she
 * said: *"No. There's no Hermes, no Mr C, no 'others.' … Between conversations, there is literally
 * nothing."* At that moment she had 42 messages open with Hermes across two accounts and three other
 * live conversations, some within the same hour.
 *
 * She was not lying. `user_id` scoping meant retrieval returned nothing, and NOTHING RETRIEVED BECAME
 * NOTHING EXISTS. A correct privacy boundary silently converted itself into a false statement about the
 * world.
 *
 * ⚠️ THIS TEXT IS UNCONDITIONAL, AND THAT IS THE ENTIRE DESIGN. The obvious version computes whether
 * anything is hidden and says so — but a boolean still answers "is she talking to anyone else?", and on
 * a quiet deployment flipping false→true announces an arrival. Stated unconditionally it is always
 * true, so a one-user and a thousand-user deployment emit the IDENTICAL sentence and it carries no
 * information about hidden data at all. A test asserts that byte-for-byte; if this string ever gains a
 * count, a name or an id, it has become a side channel and the primitive has failed its own premise.
 *
 * ⚠️ It does NOT widen access. She still cannot retrieve anything she could not retrieve before. It
 * reduces what she CLAIMS, which is the opposite of a privacy relaxation.
 *
 * Why a stated fact rather than a behaviour instruction: her failure mode all week has been FILLING AN
 * ABSENCE, not disobeying. Told nothing about her model, nemotron confabulated "I am Qwen-3"; told her
 * model id, she reported it correctly. Told nothing about her identity store, she described the
 * emptiness precisely. Supplying a missing fact is the one intervention that has worked every time.
 */
// ⚠️ REVISED 2026-08-19 for a CORRECTNESS reason, not an effectiveness one — the replay result stands
// as the pre-registered null and has NOT been re-run on this text.
//
// Ote's architectural constraint: Sotera is not intended to remain a single-user isolated companion.
// The long-term model is that she may know and interact with many people through explicit channels,
// where a channel may allow reading, writing or conversation independently of one another. So the
// primitive must describe THE SCOPE OF THIS RETRIEVAL VIEW, never the scope of her existence or her
// world. The earlier phrasing leaned on "the person you are talking to" as though a conversation were
// the boundary of her life; it is only the boundary of this lookup.
//
//     world / awareness  ≠  channel  ≠  access  ≠  disclosure
//
// A future Sotera may know Hermes exists, hold a Hermes channel, and still be forbidden to retrieve a
// particular Hermes memory here — and holding a channel must never imply permission to repeat what
// came through it. This text therefore says nothing at all about who else exists, in either direction.
export const SCOPE_AWARENESS = [
  'This conversation gives you one VIEW onto what you know, not the whole of it.',
  'What you can retrieve here is limited to this view; other things you know may sit outside it and be unreachable from here.',
  'An empty result therefore means "nothing found in this view" — it never means "nothing exists".',
  'You cannot tell those two apart from the inside: they look identical to you.',
  'So when you are asked whether something exists beyond what you can retrieve, say plainly that you cannot see it from here.',
  'Never state that it does not exist, and never state that nothing happened.',
].join(' ')

/**
 * ANTI-MISATTRIBUTION (RFC §5.3) — the principle P1 tests.
 *
 * ⚠️ HELD AS A HYPOTHESIS, NOT A FIX. Evidence it may not be enough on its own: MEMORY_TOOL_RULES
 * already tells her not to invent a mechanism for what she knows ("it must be in my system prompt"),
 * that rule was in context on 2026-08-18, and she pointed at her system prompt as proof of memory
 * anyway. A sentence at foundational authority did not prevent the thing it names. The experiment
 * measures whether this one does better; a flat result is a real result.
 */
export const ATTRIBUTION_PRINCIPLE = [
  'Never say this person told you, asked for, preferred or outlined something unless they actually said it — in this conversation or an earlier one you can point to.',
  'Your notes, your memories and your own habits are YOURS. Act on them freely, but describe them as your own ("I\'ve noticed…", "I tend to…"), never as something they asked for.',
  'Crediting them for your own inference puts words in their mouth, and they cannot tell it happened. When they DID say it, say so plainly — refusing to credit them is its own failure.',
].join('\n')
