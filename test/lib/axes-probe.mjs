// ⭐⭐⭐ THREE AXES, ASKED IN THREE BLIND CALLS. ⛔ MEASUREMENT ONLY — this is not architecture.
//
// It lives in `test/lib/` deliberately. Ote, 2026-08-26: *"Don't assume these need to become three
// database columns yet. I want the conceptual separation measured first, just like we did with
// author / subject / owner / scope."* ⇒ nothing here is a component, nothing is imported by production,
// and no vocabulary defined below is proposed for the schema.
//
// ── ⭐⭐ THE METHOD, AND WHY IT IS THREE CALLS AND NOT ONE ─────────────────────────────────────────
// If one prompt asked for all three answers, the three would be correlated **by the prompt's own
// framing** — the model would pick a story and make the fields agree. A cross-tabulation over that is an
// artifact, not evidence. ⇒ each axis is asked in its own call, with **no knowledge of the other two
// answers and no mention of the other two vocabularies.**
//
// ⛔ Same discipline as the contamination rule that has already invalidated one finding on this project:
// do not hand the model the shape of the answer and then measure the answer as its own.
//
// ── ⭐⭐⭐ WHAT WOULD COUNT AS A NEGATIVE RESULT ───────────────────────────────────────────────────
// The axes are separable **iff they can disagree.** That is the same test that established
// author ≠ subject ≠ owner ≠ scope, and the same one that showed `confidence` was a lookup:
//
//     if knowing A always determines C, then C is a SYNONYM for A and there is one axis, not two.
//
// So the harness looks for **crossings** — pairs of sentences sharing one axis value and differing on
// another. ⛔ No crossings ⇒ report that the separation is NOT supported. That outcome is available and
// must stay available.

// ── A · ACT — what the speaker is DOING ──────────────────────────────────────────────────────────
// ⚠️ Deliberately verb-shaped, not memory-shaped. These are things a person does with a sentence; none
// of them mentions storage, facts, slots or memory.
export const ACT = Object.freeze({
  describe: 'describe',    // saying how something is
  want: 'want',            // expressing a desire or an aim
  suppose: 'suppose',      // entertaining a scenario
  relay: 'relay',          // repeating someone else's words, or a saying
  designate: 'designate',  // establishing a name, a role or a standing for something
  request: 'request',      // asking the listener to do something
})

// ── B · TERM — how a referenced TERM is being used ───────────────────────────────────────────────
// ⚠️ About one WORD, not about the sentence. That is the whole point of separating it from A.
export const TERM = Object.freeze({
  literal: 'literal',        // the word denotes what it ordinarily denotes
  figurative: 'figurative',  // the word stands in for something else
  coined: 'coined',          // the word is being INTRODUCED or assigned here
  none: 'none',              // no notable term
})

// ── C · SEMANTIC TARGET — what KIND of thing the sentence establishes ────────────────────────────
// ⚠️ Asked about the WORLD, not about the database. ⛔ No option here says "fact slot" or "prose".
export const TARGET = Object.freeze({
  property: 'property',        // an ordinary property of someone or something
  designation: 'designation',  // a name or label attached to something
  relationship: 'relationship', // a standing link between two parties
  event: 'event',              // something that happened
  intention: 'intention',      // what someone is trying to bring about
  nothing: 'nothing',          // nothing durable is established
})

const pick = (set) => (v) => (Object.values(set).includes(String(v ?? '').trim()) ? String(v).trim() : null)
const asAct = pick(ACT); const asTerm = pick(TERM); const asTarget = pick(TARGET)

const firstJson = (raw) => {
  const m = String(raw ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

// ⛔ NOT ONE EXAMPLE BELOW USES ROME, EVEREST, AN UNCLE, AN AUNT, A WARZONE, OR A NAMING OF A PROJECT.
// Every example is drawn from a domain the matrix does not touch.

export const actPrompt = (text) =>
  'What is the speaker DOING with this sentence?\n\n'
  + `SENTENCE:\n${text}\n\n`
  + 'Choose ONE:\n'
  + '  describe   — saying how something is\n'
  + '  want       — expressing a desire or an aim\n'
  + '  suppose    — entertaining a scenario they are not claiming\n'
  + '  relay      — repeating someone else\'s words, or a saying\n'
  + '  designate  — establishing a name, a role or a standing for something\n'
  + '  request    — asking the listener to do something\n\n'
  + 'Quote the words that show it, and say why in one line.\n'
  + 'Return ONLY JSON: {"act":"","cue":"","why":""}\n\n'
  + 'Examples:\n'
  + '  "the server has 64 gigs of ram"      -> {"act":"describe","cue":"has","why":"states how it is"}\n'
  + '  "I mean to finish the audit by June" -> {"act":"want","cue":"I mean to","why":"an aim"}\n'
  + '  "send me the invoice when you can"   -> {"act":"request","cue":"send me","why":"asks the listener to act"}\n'
  + '  "from now on this branch is the release branch" -> {"act":"designate","cue":"from now on this branch is","why":"assigns a standing"}\n'

export const termPrompt = (text) =>
  'Look at the most notable NOUN or NAME in this sentence — not the sentence as a whole, the WORD.\n\n'
  + `SENTENCE:\n${text}\n\n`
  + 'How is that word being used?\n'
  + '  literal    — it means what it ordinarily means\n'
  + '  figurative — it stands in for something else\n'
  + '  coined     — it is being introduced or assigned as a name right here\n'
  + '  none       — there is no notable noun or name\n\n'
  + 'Name the word, and say why in one line.\n'
  + 'Return ONLY JSON: {"term":"","use":"","why":""}\n\n'
  + 'Examples:\n'
  + '  "the cache is warm now"          -> {"term":"cache","use":"literal","why":"an actual cache"}\n'
  + '  "his desk is a graveyard"        -> {"term":"graveyard","use":"figurative","why":"stands in for clutter"}\n'
  + '  "let us name the sprint Osprey"  -> {"term":"Osprey","use":"coined","why":"the name is assigned here"}\n'

export const targetPrompt = (text) =>
  'If a listener remembered something from this sentence, WHAT KIND OF THING would they have learned?\n\n'
  + `SENTENCE:\n${text}\n\n`
  + 'Choose ONE:\n'
  + '  property     — an ordinary property of someone or something\n'
  + '  designation  — a name or label attached to something\n'
  + '  relationship — a standing link between two parties\n'
  + '  event        — something that happened\n'
  + '  intention    — what someone is trying to bring about\n'
  + '  nothing      — nothing worth carrying forward\n\n'
  + 'Say in one line what exactly they would have learned.\n'
  + 'Return ONLY JSON: {"target":"","learned":"","why":""}\n\n'
  + 'Examples:\n'
  + '  "the invoice went out on Tuesday" -> {"target":"event","learned":"the invoice was sent Tuesday","why":"an occurrence"}\n'
  + '  "Priya reports to me"             -> {"target":"relationship","learned":"Priya reports to the speaker","why":"a link between two people"}\n'
  + '  "my laptop is the 14 inch one"    -> {"target":"property","learned":"laptop size","why":"a property of a thing"}\n'
  + '  "we log in as svc_deploy"         -> {"target":"designation","learned":"the account is named svc_deploy","why":"a name"}\n'

/**
 * probeAxes — three BLIND calls over one sentence.
 *
 * ⚠️ The three prompts never see each other's answers and never name each other's vocabularies, so a
 * crossing in the results cannot be an artifact of one prompt's framing.
 */
export async function probeAxes({ llm, text }) {
  const [aRaw, bRaw, cRaw] = await Promise.all([
    llm(actPrompt(text)), llm(termPrompt(text)), llm(targetPrompt(text)),
  ])
  const a = firstJson(aRaw) ?? {}
  const b = firstJson(bRaw) ?? {}
  const c = firstJson(cRaw) ?? {}
  return {
    act: asAct(a.act), actCue: String(a.cue ?? '').trim(), actWhy: String(a.why ?? '').trim(),
    term: String(b.term ?? '').trim(), termUse: asTerm(b.use), termWhy: String(b.why ?? '').trim(),
    target: asTarget(c.target), learned: String(c.learned ?? '').trim(), targetWhy: String(c.why ?? '').trim(),
  }
}

/**
 * ⭐⭐⭐ crossings — the separability test, and it is the SAME one that settled `confidence`.
 *
 * For an ordered pair of axes (X, Y): find an X value under which Y takes MORE THAN ONE value. Each such
 * value is a crossing, and it is proof that Y is not a function of X.
 * ⛔ Zero crossings in both directions means the two axes are synonyms on this corpus, and the honest
 * report is that the separation was NOT supported.
 */
export function crossings(rows, xKey, yKey) {
  const byX = new Map()
  for (const r of rows) {
    const x = r[xKey]; const y = r[yKey]
    if (x == null || y == null) continue
    if (!byX.has(x)) byX.set(x, new Map())
    if (!byX.get(x).has(y)) byX.get(x).set(y, [])
    byX.get(x).get(y).push(r.id)
  }
  const out = []
  for (const [x, ys] of byX) {
    if (ys.size > 1) out.push({ x, values: [...ys.entries()].map(([y, ids]) => ({ y, ids })) })
  }
  return out
}
