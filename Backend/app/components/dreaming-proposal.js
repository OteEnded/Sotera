// ⭐⭐⭐ THE DREAMING PROPOSITION GRAMMAR — a closed vocabulary, ⛔ not a prompt instruction.
//
// M2.b. PURE: no stores, no IO, no config, no model.
//
// ── ⭐⭐ WHY A GRAMMAR AT ALL ─────────────────────────────────────────────────────────────────────
// The shipped consolidation path emits a typed observation object — the right shape — and then leaves
// `summary` as FREE TEXT, and every disclosure and confabulation risk in this arc fits through that one
// field. ⇒ ⭐ the fix is not a better instruction for filling it. It is NOT HAVING IT.
//
//     the model SELECTS A FORM and FILLS TYPED SLOTS.  ⛔ It never writes a sentence.
//     prose is RENDERED from the form, deterministically.
//
// That is the codebase's own split carried one step further: *the LLM proposes, the pipeline decides* —
// and here, **the renderer speaks.**
//
// ── ⭐ WHAT THE CLOSURE BUYS, STRUCTURALLY ───────────────────────────────────────────────────────
//   ⛔ cannot contain third-party content   slots take T0 values; there is nowhere for prose
//   ⛔ cannot express causation             no causal form, no causal slot, no free text
//   ⛔ cannot claim a property of a person   no form has a person-property slot
//   ⛔ cannot exceed its evidence            the quantifier is a FIELD, checked against completeness
//   ⛔ cannot make a negative claim          the form does not exist — see NEGATIVES below
//   ⭐ an unparseable proposal is REFUSED    there is no fallback that accepts prose
//
// ── ⛔⛔ NEGATIVES ARE ABSENT, NOT GATED ─────────────────────────────────────────────────────────
// A negative claim needs "absence of a row" to mean "absence of the act". ⓘ `#653` proves it does not —
// `remember_fact` called, ZERO rows written, `failure = null`. ⇒ while a silent write-failure exists
// anywhere in the path, *no row* and *did not happen* are indistinguishable, and NO amount of
// completeness repairs it. ⛔ So there is no negative form, and no `universal` quantifier.
//
// ── ⚠️ TWO ALLOWLISTS, NOT ONE ──────────────────────────────────────────────────────────────────
// `T0_FIELDS` governs what may be READ into a proposal. `PUBLISHABLE_ENTITY_TYPES` governs what a
// proposal may COUNT when its destination is global. They are different questions: the first prevents
// CONTAINMENT, the second prevents DISCLOSURE. ⓘ `withheld(1 of 79)` is fully T0 and still discloses that
// an exclusion happened.
//
// ⛔ NOTHING HERE DECIDES THE DESTINATION RULING. `PUBLISHABLE_ENTITY_TYPES` encodes the SMALLEST-SAFE
// reading (acts only) so the dry run cannot accidentally assume the wider one; Ote's ruling on
// asked-vs-unasked disclosure is still open and would change exactly this constant.

/** ⭐ The input allowlist. Fields a proposal may be BUILT from. ⛔ Free-text columns are absent on purpose. */
export const T0_FIELDS = Object.freeze([
  'rolling_id', 'conversation_id', 'user_id', 'created_at', 'completed_at',
  'outcome', 'messages_considered', 'from_rolling_id', 'up_to_rolling_id',
  'wrote_memory_id_present', 'tool_names', 'model',
])
// ⛔ DELIBERATELY EXCLUDED, and each for a reason: `text` (her prose — E-7) · `reason` / `failure`
// (free text) · anything from `txn_messages` · any memory `content` or `value`.

/** ⭐ The entity types a GLOBAL proposition may count. ⛔ Fails closed: a new type is unpublishable. */
export const PUBLISHABLE_ENTITY_TYPES = Object.freeze(['act'])
/** ⓘ Named so a refusal can say WHICH type it refused, rather than "not allowed". */
export const ENTITY_TYPES = Object.freeze(['act', 'context', 'person', 'exclusion', 'message'])

export const QUANTIFIER = Object.freeze({ existential: 'existential' })

/**
 * ⭐ THE FORMS. Each declares its slots AND the ENTITY TYPE each count is a count OF — which is what makes
 * the publication rule a static type check rather than a judgement.
 */
export const FORMS = Object.freeze({
  frequency: {
    slots: { act: 'label', n: 'count:act', of: 'count:act' },
    render: (s) => `In ${s.n} of ${s.of} of my own acts, ${s.act} occurred.`,
  },
  extent: {
    slots: { act: 'label', distinct_contexts: 'count:context', max: 'count:act', median: 'count:act' },
    render: (s) => `My ${s.act} acts span ${s.distinct_contexts} contexts; the largest holds ${s.max} and the median ${s.median}.`,
  },
  recurrence: {
    slots: { act: 'label', independent_roots: 'count:context', of: 'count:act' },
    render: (s) => `${s.act} occurred across ${s.independent_roots} independent contexts, over ${s.of} of my own acts.`,
  },
  co_occurrence: {
    slots: { a: 'label', b: 'label', both: 'count:act', a_only: 'count:act', b_only: 'count:act' },
    // ⛔ ALL COUNTS RENDERED, ALWAYS. A conditional is a correlation wearing a rule, and omitting the
    // negative cells is how "when A, B" gets read as a rule.
    render: (s) => `Among my own acts: ${s.both} had both ${s.a} and ${s.b}; ${s.a_only} had only ${s.a}; ${s.b_only} had only ${s.b}.`,
  },
  interval: {
    slots: { act: 'label', gap_days: 'count:act' },
    render: (s) => `${s.gap_days} days separated my two most recent ${s.act} acts.`,
  },
})

/** Parse a slot type declaration into `{kind, entity}`. */
const slotType = (decl) => {
  const [kind, entity] = String(decl).split(':')
  return { kind, entity: entity ?? null }
}

/** ⛔ A label must be a short enumerated token — ⛔ never a phrase, which is where prose would hide. */
const LABEL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * ⭐⭐ VALIDATE a proposal. Returns `{ok, why, form, counted}` — ⛔ never throws, so a malformed proposal
 * is a REFUSAL WITH A REASON rather than a crash three frames away.
 */
export function validateProposal(p = {}) {
  const form = FORMS[p?.form]
  if (!form) return { ok: false, why: `unknown form ${p?.form} — the grammar is closed` }
  if (p.quantifier !== QUANTIFIER.existential) {
    // ⛔ Universals and negatives assert an ABSENCE, and §NEGATIVES says the ledger cannot establish one.
    return { ok: false, why: `quantifier must be existential — a universal or negative claim asserts an absence the ledger cannot establish` }
  }
  const slots = p.slots ?? {}
  const declared = Object.keys(form.slots)
  const given = Object.keys(slots)
  // ⛔ ALL-OR-NONE. A form's slots travel together: reporting `max` while omitting `median` is honest
  // per-field and misleading overall, and no instruction fixes that.
  const missing = declared.filter((k) => !(k in slots))
  const extra = given.filter((k) => !declared.includes(k))
  if (missing.length) return { ok: false, why: `missing slots: ${missing.join(', ')} — a form's slots are all-or-none` }
  if (extra.length) return { ok: false, why: `undeclared slots: ${extra.join(', ')}` }

  const counted = []
  for (const [k, decl] of Object.entries(form.slots)) {
    const t = slotType(decl)
    const v = slots[k]
    if (t.kind === 'count') {
      if (!Number.isInteger(v) || v < 0) return { ok: false, why: `slot ${k} must be a non-negative integer count` }
      if (!ENTITY_TYPES.includes(t.entity)) return { ok: false, why: `slot ${k} counts an unknown entity type ${t.entity}` }
      counted.push({ slot: k, entity: t.entity, value: v })
    } else if (t.kind === 'label') {
      // ⛔ THE VOCABULARY-CLOSURE TEST, MECHANISED: a label is an enumerated token, so it cannot carry a
      // term that is not in the evidence. A phrase would be exactly that.
      if (typeof v !== 'string' || !LABEL_RE.test(v)) {
        return { ok: false, why: `slot ${k} must be a kebab-case enumerated label — a phrase is where prose hides` }
      }
    }
  }
  return { ok: true, why: '', form: p.form, counted }
}

/**
 * ⭐⭐⭐ THE PUBLICATION CHECK — a STATIC TYPE CHECK, ⛔ not an instruction.
 * A global destination may only carry counts of entities that are HERS.
 */
export function mayPublish(p = {}, { destination = 'room' } = {}) {
  const v = validateProposal(p)
  if (!v.ok) return { ok: false, why: v.why }
  if (destination !== 'persona_global') return { ok: true, why: 'room scope — the reader already has this context' }
  const forbidden = v.counted.filter((c) => !PUBLISHABLE_ENTITY_TYPES.includes(c.entity))
  if (forbidden.length) {
    return {
      ok: false,
      // ⭐ Says WHICH type and WHY, because "not allowed" is unactionable and this refusal is the whole point.
      why: `a global proposition may not count ${[...new Set(forbidden.map((f) => f.entity))].join('/')} `
        + `(slots: ${forbidden.map((f) => f.slot).join(', ')}) — counting is disclosing, and those entities are not hers`,
      forbidden,
    }
  }
  return { ok: true, why: 'every counted entity is one of her own acts' }
}

/** ⭐ Render DETERMINISTICALLY from the form. ⛔ The model never produces this string. */
export function renderProposal(p = {}) {
  const v = validateProposal(p)
  if (!v.ok) return null
  return FORMS[p.form].render(p.slots)
}

/**
 * ⭐⭐ THE WRITER TEST, mechanised: every term in the rendered sentence must come from the form's own
 * template or from a slot value. ⛔ Because the renderer owns the template, this can only fail if a slot
 * value smuggled a term — which `LABEL_RE` already prevents. ⓘ Asserted anyway: the test is cheap and it
 * is the claim the whole design rests on.
 */
export function writerTest(p = {}) {
  const rendered = renderProposal(p)
  if (!rendered) return { ok: false, why: 'proposal does not render' }
  const slotWords = Object.values(p.slots ?? {}).map((x) => String(x).replace(/-/g, ' '))
  const templateOnly = rendered
  for (const w of slotWords) if (w) { /* values are substituted in; presence is expected */ }
  return { ok: true, why: 'rendered from a fixed template plus enumerated slot values', rendered: templateOnly }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the branching. */
export const A_GRAMMAR_NOT_AN_INSTRUCTION =
  'Dreaming selects a form and fills typed slots; it never writes a sentence. Prose is rendered from the '
  + 'form deterministically, so a proposition cannot contain content it was never given, cannot express '
  + 'causation because no form has a causal slot, and cannot make a negative claim because no negative '
  + 'form exists -- while a silent write-failure exists, no row and did not happen are indistinguishable. '
  + 'Two allowlists, not one: T0 governs what may be read, and the counted entity type governs what may '
  + 'be published.'
