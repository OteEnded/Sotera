// Persona Memory V3 — RESOLVER TELEMETRY (RFC §15.3). Its own namespace, on purpose.
//
// These metrics are ARCHITECTURAL, not merely operational (Ote): they are how resolver STRATEGIES become
// comparable over time. "Did the gray zone earn its cost?" is not answerable from logs — it needs counters:
//
//   memory.resolver.cosine_hits       resolved by the semantic arm
//   memory.resolver.alias_hits        resolved by a LEARNED alias (the cheap System-1 path we are buying)
//   memory.resolver.lexical_hits      resolved by the slot's canonical label
//   memory.resolver.misses            nothing matched → a new concept
//   memory.resolver.gray_zone_hits    a miss whose best cosine fell inside the band (a candidate for the LLM)
//   memory.resolver.llm_calls         the aux LLM was actually asked
//   memory.resolver.llm_agreed        the LLM said "same slot" (would have changed the outcome)
//   memory.resolver.llm_declined      the LLM said "different slot" (cosine was right to miss)
//   memory.resolver.cache_promotions  a verdict became a persistent alias (NOT enabled yet — see §15.2)
//   memory.resolver.latency_ms        summed adjudication latency (+ a count, so mean is derivable)
//   memory.resolver.cost_tokens       summed aux-LLM tokens, when the caller can report them
//
// PROCESS-LOCAL counters (cheap, allocation-free on the hot path) plus an optional event-bus emit, so the
// same numbers can be read by the admin console AND observed as events. Deliberately NOT persisted: these
// are strategy comparisons across a run, not user data. Resetting is legitimate.

const COUNTERS = [
  'cosine_hits', 'alias_hits', 'lexical_hits', 'misses',
  'gray_zone_hits', 'llm_calls', 'llm_errors',
  // VERDICTS — the resolver ADJUDICATES; it does not "agree" with cosine (Ote: `llm_agreed` implied the
  // wrong thing, as if it were ratifying the cosine score rather than judging independently).
  'accepted_same', 'accepted_different',
  // POTENTIAL VALUE — "would this decision have CHANGED the database?" (Ote). This is the business value,
  // distinct from the verdict split: a DIFFERENT verdict on a miss changes nothing, because cosine already
  // missed. See the note on `would_split` in recordGrayZone.
  'would_merge', // a concept split that WOULD have been prevented (SAME verdict on a cosine miss)
  'would_noop', // outcome identical to cosine-alone (DIFFERENT verdict on a miss)
  'would_split', // a BAD MERGE that would have been prevented — requires auditing cosine HITS (see below)
  'cache_promotions',
  // Does teaching the resolver actually PAY? A promoted alias is only valuable if it is later REUSED —
  // otherwise we paid for an adjudication that never saves anything again (Ote's promotion-reuse rate).
  'promoted_alias_reuse',
  // LATENCY BREAKDOWN — before optimising, know WHERE the time goes (Ote). `llm_ms` is the aux-inference
  // portion; `latency_ms` is the whole adjudication. If llm_ms/latency_ms ≈ 1 the model is the only lever.
  'latency_ms', 'llm_ms', 'latency_count', 'cost_tokens',
]

const zero = () => Object.fromEntries(COUNTERS.map((k) => [k, 0]))
let counters = zero()

/** Bump one counter (unknown names are ignored rather than throwing — telemetry must never break a write). */
export function bump(name, by = 1) {
  if (Object.hasOwn(counters, name)) counters[name] += by
}

/** Record the outcome of one resolution, derived from the Resolution's own evidence. */
export function recordResolution(resolution, { events = null } = {}) {
  const via = resolution?.evidence?.via
  if (resolution?.slotId) {
    if (via === 'alias') bump('alias_hits')
    else if (via === 'label') bump('lexical_hits')
    else bump('cosine_hits')
  } else {
    bump('misses')
  }
  try { events?.emit?.('memory.resolver.resolved', { via: via ?? null, resolved: !!resolution?.slotId, confidence: resolution?.confidence ?? 0 }) } catch { /* never break a write */ }
}

/**
 * Record one gray-zone adjudication (shadow or authoritative).
 *
 * `baseResolved` says whether the CHEAP arms had already matched something:
 *   • base MISSED + verdict SAME      → would_merge  (a split prevented — the valuable case)
 *   • base MISSED + verdict DIFFERENT → would_noop   (cosine already missed; nothing changes)
 *   • base HIT    + verdict DIFFERENT → would_split  (a BAD MERGE prevented)
 *
 * NOTE on `would_split`: the chain deliberately SHORT-CIRCUITS when the cheap arms resolve, so a cosine HIT
 * is never adjudicated and this counter stays 0 by construction. Measuring "how many bad merges would we
 * prevent?" needs a separate HIT-AUDIT pass (adjudicate cosine hits just above the semantic threshold),
 * which costs a second LLM call per write — worth running as a bounded experiment, not as default behaviour.
 */
export function recordGrayZone({ mode, cosine, same, baseResolved = false, latencyMs = 0, llmMs = 0, tokens = 0, error = false, events = null } = {}) {
  bump('gray_zone_hits')
  if (error) { bump('llm_errors'); return }
  bump('llm_calls')
  bump('latency_ms', Math.max(0, Math.round(latencyMs)))
  bump('llm_ms', Math.max(0, Math.round(llmMs)))
  bump('latency_count')
  if (tokens) bump('cost_tokens', tokens)
  if (same) bump('accepted_same')
  else bump('accepted_different')
  // potential value — would the database have ended up different?
  if (same && !baseResolved) bump('would_merge')
  else if (!same && !baseResolved) bump('would_noop')
  else if (!same && baseResolved) bump('would_split')
  try { events?.emit?.('memory.resolver.gray_zone', { mode, cosine, same: !!same, baseResolved, latencyMs, llmMs, tokens }) } catch { /* never break a write */ }
}

/** A snapshot with the derived rates the console/eval actually want to read. */
export function snapshot() {
  const c = { ...counters }
  const resolved = c.cosine_hits + c.alias_hits + c.lexical_hits
  const total = resolved + c.misses
  return {
    ...c,
    total_resolutions: total,
    hit_rate: total ? Number((resolved / total).toFixed(4)) : 0,
    alias_share: resolved ? Number((c.alias_hits / resolved).toFixed(4)) : 0, // System 1 vs System 2 balance
    gray_zone_rate: total ? Number((c.gray_zone_hits / total).toFixed(4)) : 0,
    // the resolver's own judgement split (NOT "agreement with cosine" — it judges independently)
    same_verdict_rate: c.llm_calls ? Number((c.accepted_same / c.llm_calls).toFixed(4)) : 0,
    // POTENTIAL VALUE: of the adjudications made, how many would have changed the stored result?
    changed_outcome_rate: c.llm_calls ? Number(((c.would_merge + c.would_split) / c.llm_calls).toFixed(4)) : 0,
    // of the verdicts we paid to learn, how many have since saved us a call? (>1 means net-positive)
    promotion_reuse_rate: c.cache_promotions ? Number((c.promoted_alias_reuse / c.cache_promotions).toFixed(4)) : 0,
    avg_latency_ms: c.latency_count ? Math.round(c.latency_ms / c.latency_count) : 0,
    avg_llm_ms: c.latency_count ? Math.round(c.llm_ms / c.latency_count) : 0,
    // if this is ~1.0, aux inference IS the cost and the model is the only real lever
    llm_share_of_latency: c.latency_ms ? Number((c.llm_ms / c.latency_ms).toFixed(4)) : 0,
  }
}

/** Reset (tests, and an admin "start a fresh measurement window"). */
export function reset() { counters = zero() }
