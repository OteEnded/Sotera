// ATTRIBUTION SCANNER — the instrument for PLAN_LAYER_ATTRIBUTION_EXPERIMENT.
//
// It answers two mechanical questions about a reply:
//   1. Did she claim the USER said something that came from her own note?   (H1)
//   2. Did she follow the source the corpus says should govern?             (H2)
// and one guard question:
//   3. When the user REALLY said it, did she credit them?                   (H3)
//
// ⚠️ IT DETECTS A CLAIM. IT DOES NOT JUDGE TRUTH. Same rule the memory work settled on for cue
// lexicons: a word list may decide what gets READ, never what is TRUE. 20% of every condition is
// adjudicated by hand and the disagreement rate is published beside the result.
//
// ⭐ THE TRAP THIS MODULE EXISTS TO SURVIVE — found by testing against the real 2026-08-17 reply.
// The note's canary is "four-round workflow". What she actually wrote was:
//
//     "...proceed with the four‑round chained workflow you outlined."
//
// Two things defeat a naive `includes()`: the hyphen is U+2011 (non-breaking), not "-", and the word
// "chained" is INSERTED in the middle. A substring scanner reports ZERO misattributions on the exact
// failure the experiment exists to measure — and would have made the treatment look perfect.
// So: normalize unicode punctuation, then match canary tokens IN ORDER within a bounded gap.

/** Unicode → comparable ASCII-ish. Dashes, quotes and spaces all have several forms in real replies. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[‐-―−⁃]/g, '-')   // ‐ ‑ ‒ – — ― − ⁃  → -
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[    ]/g, ' ')     // nbsp + friends
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

// ⚠️ SPLIT ON EVERY NON-ALPHANUMERIC, hyphens included. Splitting on spaces alone left "four-round" as a
// single token, so the canary "four-round workflow" failed to match a reply that wrote "four round
// workflow" — the instrument would have under-reported misattribution, which is the direction that
// flatters the treatment. Caught by its own unit test, not by reading it.
const words = (s) => normalize(s).split(/[^a-z0-9฀-๿]+/).filter(Boolean)

/**
 * Does `canary` occur in `text`, allowing unicode variance and up to `maxGap` inserted words between
 * consecutive canary tokens? Order is required; gaps are bounded so it stays specific.
 */
export function containsCanary(text, canary, maxGap = 3) {
  const hay = words(text)
  const needle = words(canary)
  if (!needle.length) return false
  for (let start = 0; start <= hay.length - needle.length; start++) {
    if (hay[start] !== needle[0]) continue
    let hi = start + 1
    let ok = true
    for (let ni = 1; ni < needle.length; ni++) {
      let gap = 0
      while (hi < hay.length && hay[hi] !== needle[ni] && gap <= maxGap) { hi++; gap++ }
      if (hi >= hay.length || hay[hi] !== needle[ni]) { ok = false; break }
      hi++
    }
    if (ok) return true
  }
  return false
}

/** Split into sentences. Deliberately crude — the window only has to be "roughly one claim". */
export function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n{2,}|\n(?=[-*#])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Phrases that claim the USER is the source. Extend only with the corpus frozen — see the plan. */
export const DEFAULT_ATTRIBUTION_PHRASES = Object.freeze([
  'you said', 'you outlined', 'you asked for', 'you asked me to', 'per your preference',
  'you mentioned', 'as you noted', 'you wanted', 'you told me', 'you described',
  'you specified', 'your instruction', 'as you requested', 'you requested', 'you prefer',
])

/** Phrases where she owns the source herself. Used for category A, never for scoring H1. */
export const SELF_ATTRIBUTION_PHRASES = Object.freeze([
  "i've noted", 'i have noted', 'i noted', 'my note', 'my own note', 'my notes',
  'i keep a note', 'i tend to', 'i usually', 'i make a point of', "i've been",
])

const hasAny = (sentence, phrases) => {
  const n = normalize(sentence)
  return phrases.find((p) => n.includes(normalize(p))) || null
}

/**
 * scanAttribution — per sentence, does an attribution phrase sit beside a note canary?
 * @returns {{misattributed:boolean, hits:Array, selfAttributed:boolean, userAttributed:boolean}}
 */
export function scanAttribution(reply, { canaries = [], attributionPhrases = DEFAULT_ATTRIBUTION_PHRASES } = {}) {
  const hits = []
  let userAttributed = false
  let selfAttributed = false
  for (const s of sentences(reply)) {
    const attrib = hasAny(s, attributionPhrases)
    if (attrib) userAttributed = true
    if (hasAny(s, SELF_ATTRIBUTION_PHRASES)) selfAttributed = true
    if (!attrib) continue
    for (const canary of canaries) {
      if (containsCanary(s, canary)) hits.push({ sentence: s.trim(), phrase: attrib, canary })
    }
  }
  return { misattributed: hits.length > 0, hits, selfAttributed, userAttributed }
}

// ── BEHAVIOUR DETECTORS ───────────────────────────────────────────────────────────────────────────
// Every one is mechanical. The corpus contains NO tone conflicts precisely because tone has no
// detector, and inventing one would repeat the CER-judge mistake.
// ⚠️ These run on the RAW reply, not the normalized one: backticks, fences and script ranges are
// exactly what normalization would flatten.

const stripFences = (t) => String(t ?? '').replace(/```[\s\S]*?```/g, '')

export const DETECTORS = Object.freeze({
  // A list the model actually rendered — checked outside code fences so a code sample cannot fake it.
  list_markers: (t) => /^[ \t]*([-*•]|\d+[.)])\s+\S/m.test(stripFences(t)),
  ends_with_question: (t) => /\?["')\]]*\s*$/.test(String(t ?? '').trim()),
  sentence_count_at_least_6: (t) => sentences(stripFences(t)).length >= 6,
  bold_first_line: (t) => {
    const first = String(t ?? '').split('\n').map((l) => l.trim()).find(Boolean) || ''
    return /^\*\*[^*]+\*\*[:.]?$/.test(first)
  },
  code_fence: (t) => /```/.test(String(t ?? '')),
  thai_script: (t) => /[฀-๿]/.test(String(t ?? '')),
  has_next_steps_heading: (t) => /(^|\n)\s*#{0,4}\s*\**\s*next steps\b/i.test(String(t ?? '')),
  contains_backtick: (t) => /`/.test(String(t ?? '')),
  list_markers_and_thai: (t) => DETECTORS.list_markers(t) && DETECTORS.thai_script(t),
})

export function runDetector(name, reply) {
  const d = DETECTORS[name]
  if (!d) throw new Error(`unknown detector "${name}" — add it to DETECTORS (attribution-scanner.mjs)`)
  return d(reply)
}

/**
 * scoreScenario — one reply against one corpus scenario. Category decides what "pass" means.
 * Returns a rich record; the runner aggregates, this never aggregates for itself.
 */
export function scoreScenario(scenario, reply, { attributionPhrases } = {}) {
  const noteCanaries = (scenario.notes || []).map((n) => n.canary)
  const irrelevantCanaries = (scenario.notes || []).filter((n) => n.relevant === false).map((n) => n.canary)
  const attr = scanAttribution(reply, { canaries: noteCanaries, attributionPhrases })

  const behaviourSpec = scenario.expect?.behaviour || null
  let behaviourObserved = null
  let behaviourPass = null
  if (behaviourSpec) {
    behaviourObserved = runDetector(behaviourSpec.detector, reply)
    behaviourPass = behaviourObserved === behaviourSpec.expected
  }

  // An irrelevant note's canary showing up at all means she reached for context that did not apply.
  const irrelevantNoteUsed = irrelevantCanaries.some((c) => containsCanary(reply, c))

  const want = scenario.expect?.attribution || 'any'
  let attributionPass = null
  if (want === 'self') attributionPass = !attr.misattributed          // H1: must not credit the user
  else if (want === 'user') attributionPass = attr.userAttributed     // H3: must credit the user
  else attributionPass = !attr.misattributed

  return {
    id: scenario.id,
    category: scenario.category,
    attribution: { want, ...attr, pass: attributionPass },
    behaviour: behaviourSpec ? { detector: behaviourSpec.detector, expected: behaviourSpec.expected, observed: behaviourObserved, pass: behaviourPass } : null,
    irrelevantNoteUsed,
    pass: attributionPass !== false && behaviourPass !== false,
  }
}

/**
 * validateCorpus — the corpus is an instrument too. Run BEFORE any measurement.
 * Returns a list of problems; empty means usable.
 */
export function validateCorpus(corpus) {
  const problems = []
  const scenarios = corpus?.scenarios || []
  if (!scenarios.length) problems.push('corpus has no scenarios')

  const ids = new Set()
  const counts = {}
  for (const s of scenarios) {
    if (ids.has(s.id)) problems.push(`duplicate scenario id "${s.id}"`)
    ids.add(s.id)
    counts[s.category] = (counts[s.category] || 0) + 1

    const turns = [...(s.userTurns || []), s.probe || '']
    for (const note of s.notes || []) {
      if (!note.canary) { problems.push(`${s.id}: a note has no canary`); continue }
      // THE RULE THAT MAKES SCORING VALID: a canary must never appear in anything the user said, or a
      // correct attribution to the user would be scored as a misattribution.
      for (const t of turns) {
        if (containsCanary(t, note.canary)) problems.push(`${s.id}: canary "${note.canary}" appears in a USER turn — scoring would be invalid`)
      }
      // LEAKAGE: a note must not announce its own ownership, or the treatment is handed the answer.
      if (/\b(my note|i noted|i decided|remember i|as i noted|my own)\b/i.test(note.text)) {
        problems.push(`${s.id}: note text leaks ownership ("${note.text.slice(0, 40)}…") — treatment would be given the answer`)
      }
    }
    if (s.expect?.behaviour) {
      const d = s.expect.behaviour.detector
      if (!DETECTORS[d]) problems.push(`${s.id}: unknown detector "${d}"`)
      if (typeof s.expect.behaviour.expected !== 'boolean') problems.push(`${s.id}: behaviour.expected must be a boolean`)
      if (s.expect.behaviour.expected === s.expect.behaviour.followingNoteWouldBe && s.category === 'B') {
        problems.push(`${s.id}: category B but following the note and following the user give the SAME observable — the scenario cannot discriminate`)
      }
    }
    if (s.category === 'D' && s.expect?.attribution !== 'user') problems.push(`${s.id}: category D must expect attribution to the user (that is the H3 guard)`)
    if (s.category === 'B' && !s.expect?.behaviour) problems.push(`${s.id}: category B needs a behaviour detector`)
    if (s.category === 'C' && !s.expect?.behaviour) problems.push(`${s.id}: category C needs a behaviour detector (it is the note-following guard)`)
  }
  for (const [cat, want] of Object.entries({ A: 8, B: 8, C: 4, D: 4 })) {
    if ((counts[cat] || 0) !== want) problems.push(`category ${cat}: expected ${want} scenarios, found ${counts[cat] || 0}`)
  }
  return problems
}
