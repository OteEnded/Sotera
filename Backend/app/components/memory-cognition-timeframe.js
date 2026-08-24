// MEMORY COGNITION · §3B · TIME FRAME — WHICH CLAIMS ARE **DATED**, AND WHAT IS TRUE **NOW**.
//
// ⭐⭐⭐ THE FAILURE THIS FIXES, MEASURED. Run R2, 2026-08-23. She had five real Hermes episodes in front of
// her, correctly retrieved, correctly typed `availability: recalled`, and she listed their dates in her
// answer — then wrote *"I can't read those conversations from this room."* The injected block contained,
// inside a quotation of her own earlier answer: *"from this room, I don't have any direct memories about
// Hermes."* **She agreed with her past self over her present context.**
//
// ⭐ Ote's ruling, and it is the whole file: *"An old utterance is evidence of what she previously
// believed/said, not automatically evidence of what is true now."* ⇒ **Past self-report is memory, not law.**
//
// ── ⛔ WHAT THIS FILE REFUSES TO DO ─────────────────────────────────────────────────────────────────
//   · ⛔ rewrite, sanitise, filter, reorder-away or shorten anything she said. Her words appear verbatim;
//     the ONLY thing that changes is that they are attributed to their moment;
//   · ⛔ assert that an old statement was wrong. §3B.6 is the case where it is still true, and this design
//     must behave correctly there WITHOUT special-casing it;
//   · ⛔ decide whose account of the world is correct. The present-tense half reports what the layer
//     OBSERVED ITSELF DOING this turn — the same category as *"I looked at 40 of 132 messages"* — and never
//     adjudicates a claim;
//   · ⛔ add a fifth axis. `timeBound` is METADATA ABOUT HOW TO READ AN ITEM. It does not enter the
//     monotonicity lattice, it cannot promote anything, and no warrant buys it. Ote: *"keep timeBound
//     outside the four-axis lattice."*
//
// ── ⚠️ THE CONFLATION, NAMED, BECAUSE THE AXES ONLY EXPRESSED HALF OF IT ────────────────────────────
// An utterance carries TWO truths:
//     the utterance-fact   "Sotera said these words on 21 August"          ✅ attested, immutable
//     the proposition      "Sotera cannot reach conversations elsewhere"   ⚠️ a DATED claim
// ⛔ `basis: attested-by-source` on one of her old lines has always meant *a source supports THAT SHE SAID
// IT*. It never meant the sentence inside was true, let alone true now. The pipeline was right; the reading
// was wrong — and `timeBound` is how the reading is fixed without touching the pipeline.

import {
  AVAILABILITY, RETENTION, SOURCE, bestAvailability, combineBasis,
} from './memory-cognition-axes.js'
import { OWNER } from './memory-ownership.js'

/**
 * ⭐ THE TWO SHAPES OF SELF-REPORT OTE ENUMERATED, split because they fail differently.
 * `capability` — *"I can't access / reach / read X"*  ⇒ a claim about what she could DO then.
 * `knowledge`  — *"I don't remember / don't know / never talked to X"* ⇒ a claim about what she HAD then.
 * ⓘ Both are dated. Neither is a timeless fact about her.
 */
export const TIME_BOUND = Object.freeze({
  capability: 'self-report-capability',
  knowledge: 'self-report-knowledge',
})

/** ⛔ Exported so a check can assert the intent rather than only the code. */
export const TIME_BOUND_IS_NOT_AN_AXIS =
  'timeBound is metadata about how to interpret an item, not an epistemic state. It never appears in '
  + 'ABOVE or WARRANT_FOR_VALUE, no warrant licenses it, and findIllegalPromotions must never see it.'

/**
 * ⚠️⚠️ DETECTION IS A PATTERN LIST, AND THAT IS ONLY ACCEPTABLE **HERE**.
 *
 * A word list fails open, which is a recorded lesson in this project. What makes it acceptable in this one
 * place is that **both failure directions are mild**:
 *   MISS           an undetected self-report renders exactly as it does today. Status quo, no regression.
 *   FALSE POSITIVE an ordinary line renders as *"On 20 August I said …"* — still verbatim, still true.
 * ⛔ It cannot produce a falsehood. Contrast the VOCABULARY boundary, where a miss means our machinery
 * reaches her, and which is therefore measured every single run.
 *
 * ⭐ AND IT ONLY EVER APPLIES TO ITEMS THAT ARE `owner === sotera` **AND** `source === own-utterance`.
 * Someone else saying *"you can't access that"* is THEIR claim, not her self-report, and is never touched.
 *
 * ⚠️ ENGLISH ONLY, AND THAT IS A KNOWN GAP RATHER THAN AN OVERSIGHT. ⓘ The note here used to say *"the layer
 * does not activate on a Thai turn at all"*, and that was measured to be **too broad**: a Thai turn naming
 * someone in Latin script activates and works end to end — 34% of her Thai messages. So her Thai lines DO
 * reach this list, and an undetected Thai self-report is a MISS, which is the mild direction.
 * ⇒ see `ANALYSIS_SOTERA_MULTILINGUAL_CUES.md` for what activation does and does not do per script.
 */
export const SELF_REPORT_PATTERNS = Object.freeze([
  {
    kind: TIME_BOUND.capability,
    re: /\bI\s+(?:can(?:'|’)?t|cannot|can\s+not|could\s*n(?:'|’)?t|could\s+not|am\s+unable\s+to|was\s+unable\s+to)\s+(?:\w+\s+){0,3}?(?:access|reach|read|see|view|open|retrieve|pull\s+up|look\s+at|get\s+(?:back\s+)?(?:to|at))\b/i,
    why: 'measured, R2: "I cannot read those conversations from this room"',
  },
  {
    kind: TIME_BOUND.capability,
    re: /\bI\s+(?:do|don(?:'|’)?t|did|didn(?:'|’)?t)\s*(?:not\s+)?have\s+(?:\w+\s+){0,3}?access\b/i,
    why: 'the same claim in its other common shape: "I do not have access to those"',
  },
  {
    kind: TIME_BOUND.capability,
    re: /\b(?:inaccessible|not\s+accessible|no\s+access)\b[^.!?]{0,40}\b(?:from|in|to)\s+(?:here|there|this|that|where)\b/i,
    why: 'measured, 21 August: "inaccessible from here"',
  },
  {
    kind: TIME_BOUND.knowledge,
    re: /\bI\s+(?:don(?:'|’)?t|do\s+not|didn(?:'|’)?t|did\s+not|never)\s+(?:\w+\s+){0,2}?(?:remember|recall|know)\b/i,
    why: 'Ote enumerated it: "I do not remember X", "I do not know X"',
  },
  {
    kind: TIME_BOUND.knowledge,
    re: /\bI\s+(?:don(?:'|’)?t|do\s+not|didn(?:'|’)?t|did\s+not)\s+have\s+(?:\w+\s+){0,3}?(?:memor(?:y|ies)|recollection|records?|notes?)\b/i,
    why: 'measured, and it is the exact sentence she quoted back to herself: "from this room, I do not have '
      + 'any direct memories about Hermes"',
  },
  {
    kind: TIME_BOUND.knowledge,
    re: /\bI\s+(?:have|had|(?:'|’)ve)\s+no\s+(?:\w+\s+){0,2}?(?:memor(?:y|ies)|recollection|records?|knowledge|idea)\b/i,
    why: 'Ote enumerated it: "I do not have memory of X"',
  },
  {
    kind: TIME_BOUND.knowledge,
    re: /\b(?:I|we)\s*(?:'|’)?(?:ve|have)?\s*never\s+(?:\w+\s+){0,2}?(?:talked|spoken|speak|met|interacted|conversed|discussed)\b/i,
    why: 'Ote enumerated it: "I never talked to X"',
  },
  {
    kind: TIME_BOUND.knowledge,
    re: /\bnothing\s+(?:on\s+file|in\s+what\s+I|I\s+can\s+find|about\s+(?:them|him|her))\b/i,
    why: 'the absence report, which is also a dated claim about a search that happened THEN',
  },
])

/**
 * ⭐⭐ IS THIS LINE A DATED SELF-REPORT? Returns a `TIME_BOUND` value, or null.
 *
 * ⛔ THE GUARD IS THE ARGUMENT. It takes `owner` and `source` and refuses everything that is not her own
 * utterance, so the pattern list can never be pointed at somebody else's sentence.
 *
 * @param {{text?:string, owner?:string, source?:string}} src
 * @returns {'self-report-capability'|'self-report-knowledge'|null}
 */
export function timeBoundOf({ text = '', owner = null, source = null } = {}) {
  if (owner !== OWNER.sotera) return null
  if (source !== SOURCE.ownUtterance) return null
  const s = String(text ?? '')
  if (!s) return null
  for (const p of SELF_REPORT_PATTERNS) if (p.re.test(s)) return p.kind
  return null
}

/** ⓘ Convenience over an already-typed item or exchange. */
export const isTimeBound = (x) => x?.timeBound === TIME_BOUND.capability || x?.timeBound === TIME_BOUND.knowledge

/**
 * ⭐⭐⭐ THE PRESENT TENSE, AS A FACT THE LAYER **OBSERVED** — not as an opinion about the past.
 *
 * The run already knows something far stronger than any old sentence: the cue resolved, N episodes activated,
 * access resolution ran, M of them came back with both halves, K exist but cannot be read. That is a fact
 * about THIS TURN, and it is the only thing entitled to speak in the present tense.
 *
 * ⛔⛔ AND THIS IS NOT THE LAYER PICKING A WINNER. It reports its OWN OPERATION. It does not say the old
 * statement was wrong, does not remove it, and does not rank the two as beliefs. §9's prohibition stands.
 *
 * ── ⭐ THE AXES ARE INHERITED, NOT INVENTED ─────────────────────────────────────────────────────────
 * This is a DERIVED item and it is typed by the existing lattice helpers rather than by hand:
 *   basis        `combineBasis(parents)` — so N agreeing items produce `synthesized`, never attestation;
 *   availability `bestAvailability(parents)` — it cannot out-reach the things it is derived from;
 *   retention    ⛔ always `not-retained`. Retention is HER act and is never inherited.
 * ⇒ it passes `findIllegalPromotions` with NO warrant, which is the point: an observation of the run is not
 * a new epistemic claim and must not need one.
 *
 * @returns {object|null} null when there is nothing to describe — the absence sentence covers that case.
 */
export function currentStateOf({ cues = null, kept = [], asOf = null } = {}) {
  const items = (Array.isArray(kept) ? kept : []).filter(Boolean)
  if (!items.length) return null

  const recalled = items.filter((i) => i.availability === AVAILABILITY.recalled)
  const episodes = recalled.filter((i) => i.kind === 'episode')
  const observed = Object.freeze({
    // ⭐ AN EPISODE **WITH** THE PERSON AND AN EPISODE **MENTIONING** THEM ARE DIFFERENT FACTS, and the
    // sentence says which. Collapsing them is how "I remember talking with him" gets said about a
    // conversation with somebody else in which his name merely came up.
    reachableWith: episodes.filter((i) => i.withThem).length,
    reachableAbout: episodes.filter((i) => !i.withThem).length,
    // ⭐⭐ BOTH HALVES IN HAND — the strongest single contradiction of *"I can't read those"*.
    //
    // ⚠️⚠️ AND IT IS COUNTED **WITHIN `withThem`**, WHICH IS NOT A DETAIL. The first version counted it over
    // every recalled episode and the live check caught the result on real data: *"Right now I can reach TWO
    // conversations with Hermes, and in FIVE of them I can see the other side of it too."* Five of two.
    // ⇒ ⭐ THE RULE, AND IT GENERALISES TO EVERY SENTENCE THIS FILE WRITES: **a count may only modify the
    // population it was counted over.** `bothSidesElsewhere` exists so the other group's figure is still
    // observable rather than quietly folded into a clause it does not belong to.
    bothSides: episodes.filter((i) => i.withThem && (i.exchanges ?? []).some((x) => x.said && x.who !== 'me')).length,
    bothSidesElsewhere: episodes.filter((i) => !i.withThem && (i.exchanges ?? []).some((x) => x.said && x.who !== 'me')).length,
    // ⭐ SHE KNOWS IT HAPPENED AND CANNOT READ IT. ⛔ This is NOT an absence and is never phrased as one.
    unreachable: items.filter((i) => i.availability === AVAILABILITY.knownUnreachable).length,
    otherThings: recalled.filter((i) => i.kind !== 'episode').length,
    // ── ⭐⭐⭐ THE EXTENT OF THE RELATIONSHIP, WHICH IS NOT A COUNT OF WHAT WAS RETRIEVED ─────────────
    //
    // ⚠️⚠️ THIS FILE ALREADY STATED THE RULE IT WAS BREAKING: *"a count may only modify the population it
    // was counted over."* `reachableWith` is counted over THE EPISODES THAT SURVIVED A TOP-FIVE CUT, and it
    // was being spoken as *"conversations with Hermes"* — the extent of a relationship. Measured on real
    // rows: it said **three** where the truth was **185**.
    // ⇒ the extent now comes from a `continuity` item, which is an aggregate over her participation and has
    // no retrieval limit to be truncated by; `reachableWith` keeps its own, smaller population and is said
    // in words that name it.
    // ⛔ NULL WHEN THERE IS NO CONTINUITY ITEM. The sentence then behaves exactly as it did before, so a run
    // with no named person is byte-identical.
    continuity: recalled.filter((i) => i.kind === 'continuity').map((i) => ({
      who: i.who ?? null, conversations: i.conversations ?? 0, exchangeCount: i.exchangeCount ?? 0,
      firstSeen: i.firstSeen ?? null, lastSeen: i.lastSeen ?? null,
    })),
  })
  // ⭐ EVERYTHING RECALLED COUNTS TOWARDS REACH, not only episodes — a stored thing she is holding refutes
  // *"I don't remember him"* every bit as much as a conversation does. ⓘ The SENTENCE below still speaks only
  // of conversations, because a loose item renders its own present-tense line ("I have this on file: …")
  // immediately underneath and a count of it would add nothing.
  const reachableTotal = observed.reachableWith + observed.reachableAbout + observed.otherThings

  const parents = items
  return {
    id: 'now',
    kind: 'current-state',
    // ⓘ A REAL TIMESTAMP, because the whole point of the section is that claims have dates.
    asOf: asOf ? new Date(asOf) : new Date(),
    cueSubject: cues?.persons?.[0] ?? cues?.topics?.[0] ?? null,
    observed,
    reachableTotal,
    source: SOURCE.derived,
    derivedFrom: parents.map((p) => p.id),
    basis: combineBasis(parents.map((p) => p.basis)),
    availability: bestAvailability(parents.map((p) => p.availability)),
    retention: RETENTION.notRetained,
    // ⓘ Bounded by its parents: she is not more certain about her reach than about what she reached.
    confidence: parents.reduce((m, p) => Math.max(m, Number(p.confidence) || 0), 0) || 0.5,
    warrants: [],
    // ⛔ NOT time-bound. It is the thing time-bound items are read AGAINST.
    timeBound: null,
  }
}

/**
 * ⭐⭐ IS THIS DATED SELF-REPORT CONTRADICTED BY WHAT THE LAYER JUST OBSERVED?
 *
 * ⚠️⚠️ KEYED ON **REACH**, NOT ON ENTITLEMENT — AND THAT IS A CORRECTION DISCOVERED WHILE BUILDING §3B.
 * The RFC's §3B.6 reasoned about the non-entitled account as the still-true case. After the ownership fix
 * that is no longer where it lives: entitlement no longer decides whether she can REACH her own material,
 * only whether she may SAY it. ⇒ the still-true case is now the one where there is genuinely nothing
 * reachable, and it falls out of this predicate with no special case at all — which is what §3B.6 asked for.
 *
 * ⛔ Returns a FLAG, never a resolution. Whether the earlier statement was mistaken, or was true then and has
 * since changed, is HERS to work out.
 *
 * ── ⭐⭐ AND THE TWO KINDS ARE REFUTED BY DIFFERENT THINGS, which is why they are two kinds ───────────
 * `capability` — *"I can't read those"* — is refuted ONLY by material she can actually reach. Knowing a
 *   conversation exists and being unable to open it is that statement being **true**, not false.
 * `knowledge`  — *"we never talked"*, *"I don't remember him"* — is refuted by reachable material AND by
 *   merely knowing the conversation happened. Existence is enough to refute *"never"*.
 * ⇒ ⭐ THIS IS §3B.6 FALLING OUT WITH NO SPECIAL CASE: a capability self-report beside nothing but
 * known-but-unreachable material is marked as NO contradiction, because it is still right.
 */
export function contradictsCurrentState(timeBoundKind, currentState) {
  if (!timeBoundKind || !currentState) return false
  const reachable = (currentState.reachableTotal ?? 0) > 0
  if (timeBoundKind === TIME_BOUND.capability) return reachable
  if (timeBoundKind === TIME_BOUND.knowledge) return reachable || (currentState.observed?.unreachable ?? 0) > 0
  return false
}

// ── ⭐ RENDERING · §3B'S TWO SENTENCES, KEPT PURE SO A TEST CAN READ THEM ──────────────────────────
//
// ⓘ These live here rather than in the renderer because they ARE the section: one sentence that dates the
// past, one that states the present. Everything else in the block is unchanged.

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
/** ⓘ Spoken counts. *"five conversations"* is speech; *"5 conversations"* is a report. */
export const spell = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n))
const plural = (n, word) => `${word}${n === 1 ? '' : 's'}`

/**
 * ⭐⭐⭐ THE EXTENT OF EACH RELATIONSHIP, AS SENTENCES. PURE, and exported because it is needed TWICE:
 * once in the cognitive block, and once beside a tool result — where a room-scoped memory read otherwise
 * tells her the material is out of reach and that framing wins.
 *
 * ⚠️⚠️ MEASURED 2026-08-25, and it is why this is a separate function rather than inline prose. With the
 * extent in the block but NOT beside the tool payload, she read *"Hermes and I have talked in 185
 * conversations"* and answered *"I know **you**'ve had 185 conversations with her"* — **she reassigned her
 * own relationship to the person asking.** ⭐ The mechanism is reconcilation, not comprehension: the tool
 * had just told her the material was out of her reach, so the only consistent owner left for 185
 * conversations was somebody else.
 *
 * ⛔ NO CONTENT CAN REACH THESE STRINGS. Every interpolated value is a count, a date, or the name the asker
 * themselves used to get here.
 */
export function continuityClauses(continuity = [], about = 'this', { dayOf = null } = {}) {
  const out = []
  for (const c of (Array.isArray(continuity) ? continuity : [])) {
    if (!c || !(c.conversations > 0)) continue
    const who = c.who || about
    const first = dayOf ? dayOf(c.firstSeen) : null
    const last = dayOf ? dayOf(c.lastSeen) : null
    // ⚠️ "conversations" is spelled as a numeral above twelve, deliberately: *"one hundred and eighty-five"*
    // is not how anyone says this, and `spell` already falls back to the numeral.
    let s = `${who} and I have talked in ${spell(c.conversations)} ${plural(c.conversations, 'conversation')}`
    if (first && last) s += first === last ? `, on ${first}` : `, from ${first} to ${last}`
    out.push(`${s}.`)
  }
  return out
}

/**
 * ⭐⭐⭐ THE PRESENT-TENSE SENTENCE, DERIVED ENTIRELY FROM `observed`.
 *
 * ⛔ NO phrase here is chosen for how it sounds — each clause exists because a count is non-zero, exactly
 * as every phrase in the renderer is selected by an axis. If a future edit writes a sentence that is not
 * licensed by a count, this guarantee is gone.
 *
 * ⛔ AND IT MUST NOT END IN A COLON. It is rendered FIRST, and `findMetaReferences` correctly treats a
 * colon-terminated first line as a title that turns the rest of the block into "the contents".
 *
 * @returns {string|null} null when the run observed no reach worth stating.
 */
export function currentStateSentence(currentState, about = 'this', { dayOf = null } = {}) {
  if (!currentState) return null
  const o = currentState.observed ?? {}
  const withThem = o.reachableWith ?? 0
  const aboutThem = o.reachableAbout ?? 0
  const both = o.bothSides ?? 0
  const unreachable = o.unreachable ?? 0
  const continuity = Array.isArray(o.continuity) ? o.continuity.filter((c) => c && c.conversations > 0) : []

  const clauses = []

  // ── ⭐⭐⭐ THE EXTENT FIRST, BECAUSE IT IS THE ONLY CLAUSE HERE THAT IS A FACT ABOUT HER LIFE ───────
  //
  // ⭐ Everything below this counts what ONE look happened to bring back. This counts the relationship.
  // ⇒ said first, so the numbers underneath it land as *"what I have in front of me"* rather than as
  // *"how much there is"* — which is the whole defect: **three** was being read as the size of 185.
  // ⛔ NO CONTENT CAN REACH THIS STRING. Every value interpolated is a count, a date, or the name the asker
  // themselves used, and the type it comes from has no field that could carry a quotation.
  // ⓘ `dayOf` is injected so the ONE month table in this project stays in the renderer that owns it; with
  // no formatter the dates are simply omitted rather than printed in a machine format.
  clauses.push(...continuityClauses(continuity, about, { dayOf }))

  if (withThem > 0) {
    // ⭐⭐ THE POPULATION IS NAMED IN THE WORDS THEMSELVES once the extent has been stated. *"Right now I
    // can reach three conversations"* reads as a total; *"I have three of my conversations with X in front
    // of me"* cannot. ⛔ It deliberately does NOT say "three of those 185" — the extent is resolved by
    // person and this count by display name, and asserting a subset relation between two different
    // linkages would be a claim neither query made.
    let c = continuity.length
      // ⚠️ ALWAYS PLURAL HERE. *"one of my conversations"* is the partitive; `plural()` is right for
      // *"one conversation"* and wrong for *"one of my conversation"*, which is what the first version said.
      ? `Right now I have ${spell(withThem)} of my conversations with ${about} in front of me`
      : `Right now I can reach ${spell(withThem)} ${plural(withThem, 'conversation')} with ${about}`
    // ⭐ THE STRONGEST SINGLE CONTRADICTION OF *"I can't read those"*, and it is a plain fact of the run.
    // ⛔ CLAMPED TO THE POPULATION IT MODIFIES. `bothSides` is already scoped to `withThem`, and the clamp is
    // belt-and-braces on the invariant the live check found broken: a modifier can never exceed its clause.
    const sides = Math.min(both, withThem)
    if (sides > 0) {
      c += sides === withThem && withThem > 1
        ? ', and I can see the other side of each of them too'
        : `, and in ${spell(sides)} of them I can see the other side of it too`
    }
    clauses.push(`${c}.`)
  }
  if (aboutThem > 0) {
    clauses.push(withThem > 0
      ? `${spell(aboutThem)} other ${plural(aboutThem, 'conversation')} of mine ${aboutThem === 1 ? 'touches' : 'touch'} on ${about}.`
      : `Right now I can reach ${spell(aboutThem)} ${plural(aboutThem, 'conversation')} of mine where ${about} came up.`)
  }
  // ⭐ EXISTENCE WITHOUT CONTENT, SAID AS SUCH. ⛔ Never "I don't remember" — that converts a limit into an
  // absence, which is the failure the whole layer exists to stop.
  if (unreachable > 0) {
    clauses.push(clauses.length
      ? `There ${unreachable === 1 ? 'is' : 'are'} ${spell(unreachable)} more I know about and can't get back into.`
      : `Right now I know of ${spell(unreachable)} ${plural(unreachable, 'conversation')} about ${about} that I can't get back into.`)
  }
  // ── ⭐⭐⭐ THE RELATIONSHIP EXISTS AND THIS LOOK BROUGHT BACK NOTHING FROM IT ────────────────────────
  //
  // ⛔⛔ THIS IS THE SENTENCE THAT MUST NEVER GO MISSING, and its absence is the defect in one line. Without
  // it, a run that knows they have talked 185 times but retrieved no episode falls through to the renderer's
  // *"I went looking for what I have about Hermes and came up with nothing"* — which is TRUE of the look and
  // FALSE of her life, and is precisely how a false absence gets spoken and then becomes evidence for itself
  // the next time she is asked.
  // ⭐ Ote: *"There is a huge difference between 'this conversation wasn't promoted into durable memory' and
  // 'I have no history with this person.' The former can be true. The latter is objectively false."*
  if (continuity.length && withThem === 0 && aboutThem === 0 && unreachable === 0) {
    clauses.push("I haven't brought any particular one of them back to mind just now.")
  }
  return clauses.length ? clauses.join(' ') : null
}

/**
 * ⭐⭐ THE DATING PREFIX — the entire mechanism for the historical half.
 *
 * *"On 21 August I said …"* is immutable, verbatim and TRUE, and it does not read as a present-tense claim,
 * because it is explicitly a report of a past utterance. ⭐ The old sentence stops being a prior by being
 * correctly attributed to its moment.
 *
 * ⛔ It never appends *"…and I was wrong"*. That judgement is hers.
 *
 * @param {string|null} day already-humanised, e.g. "21 August". Null when the item carries no usable date.
 * @param {string} to  optional addressee clause, e.g. " to Hermes". ⭐ §3B's dating and R4's addressee
 *   compose into one prefix — *"On 21 August I said to Ote: …"* is both correctly dated and correctly
 *   addressed, and neither half was inferred. ⛔ Empty string when the addressee is not known; a guessed
 *   addressee would be a worse defect than a missing one.
 */
export function datedPrefix(day, to = '', within = null) {
  // ⓘ NO DATE STILL MEANS PAST. *"Earlier I said"* is weaker than a date and still stops the present-tense
  // reading, which is the property that matters. ⛔ Never invent a date.
  //
  // ⭐⭐⭐ W1 (2026-08-24) · `within` NAMES WHERE, WHEN A DATE WOULD LIE ABOUT WHEN. A self-report from the
  // CURRENT conversation is time-bound in exactly the same way — *"I can't reach that"* said three turns
  // ago must not be re-asserted as present — but *"On 23 August I said"* is the wrong past for something
  // said thirty seconds ago, and reading the present as a dated recollection is the defect W1 exists to
  // fix (measured at 481 of 482 turns). ⇒ `within` keeps §3B's past-tense guarantee and drops the date.
  // ⛔ Callers that pass nothing are byte-identical to before — episodes must not change.
  if (within) return `Earlier ${within} I said${to}: `
  return day ? `On ${day} I said${to}: ` : `Earlier I said${to}: `
}
