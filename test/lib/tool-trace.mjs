// ⭐⭐⭐ READING A TOOL TRACE, WITH THE FIELD NAMES ASSERTED RATHER THAN GUESSED.
//
// ── ⚠️⚠️ WHY THIS IS A MODULE AND NOT THREE LINES INSIDE ONE PROBE ─────────────────────────────────
// During B4, three separate checks asserted against fields that do not exist, and **every one printed a
// confident wrong answer instead of erroring**:
//
//   `log_tool_calls.arguments`  — the audit table stores `arg_keys`/`arg_bytes` and NEVER the arguments
//                                 or the result. Reading it for content yields a silently EMPTY trace.
//   `window.conversationId`     — that field is on a TURN, never on a window. The check printed a flat
//                                 "✖ NO" while the target handle sat in the opened list one line above.
//   `turn.text`                 — it is `said`. The probe reported "8 turns, 7 chars".
//
// ⇒ ⭐⭐ **A reader and its assertion sharing a wrong lens looks exactly like a finding.** Ote:
// *"A check returning a confident wrong answer because it is reading a nonexistent field is exactly the
// kind of instrumentation problem we don't want contaminating this experiment."*
//
// ⛔ THE RULE THIS MODULE ENFORCES: **an absent field throws, naming the keys that ARE there.** Nothing
// here may fall back to `?? null` on a field whose absence would change a verdict — a default is how a
// shape change becomes a measurement.

/** ⛔ Absent ⇒ throw with the real key list. `??` on a verdict-bearing field is the defect. */
export function field(obj, name, where) {
  if (obj == null) throw new Error(`${where}: object is ${obj}, cannot read "${name}"`)
  if (!(name in obj)) {
    throw new Error(`${where}: no field "${name}" — keys are [${Object.keys(obj).join(', ')}]`)
  }
  return obj[name]
}

/** ⭐ The turn's text. It is `said`. ⛔ Not `text`, not `content`, not `excerpt`. */
export const saidOf = (turn) => String(field(turn, 'said', 'turn'))

/** ⭐ A window's turns. ⛔ The window itself has NO `conversationId` — the turns do. */
export const turnsOf = (win) => field(win, 'turns', 'window') ?? []

/**
 * ⚠️⚠️ THE STORED RESULT IS CLIPPED AT 4000 CHARS (`chat-site.route.js`), so a large payload will not
 * parse. ⛔ That must be REPORTED, never swallowed into an empty object — an unparsed result and a result
 * with nothing in it are different facts, and only one of them is about the model's behaviour.
 * ⓘ `selector` and `coverage` sit near the front of the JSON and survive the clip; `windows` do not.
 */
export function parseResult(raw) {
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw ?? null)
  if (s == null || s === 'null') return { state: 'absent', value: null }
  try { return { state: 'whole', value: JSON.parse(s) } } catch { /* fall through — clipped */ }
  // ⭐ Recover the head fields WITHOUT pretending the object is whole. A regex over a known-truncated
  // string is honest; `JSON.parse` on a repaired string would not be.
  const grab = (k) => {
    const m = s.match(new RegExp(`"${k}":(\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\})`))
    if (!m) return null
    try { return JSON.parse(m[1]) } catch { return null }
  }
  return { state: 'clipped', value: null, chars: s.length, selector: grab('selector'), coverage: grab('coverage') }
}

/**
 * ⭐ Every tool call in a conversation, read from the MESSAGE ROWS (which carry the call) with the audit
 * table beside them as the independent second witness.
 * ⚠️ `arguments` is NOT reliably present on the message row for this provider — the first B4 harness
 * printed `{}` for all twelve calls while the audit table held every key. ⇒ the AXIS is taken from the
 * tool's own echoed `selector`, because a tool describing what it was asked is a better witness than a
 * provider-shaped field a probe has to guess at.
 */
export function readTrace(msgs, audit = []) {
  const calls = []
  for (const m of msgs) {
    const raw = Array.isArray(m.tool_calls) ? m.tool_calls : (m.tool_calls ? [m.tool_calls] : [])
    for (const t of raw) {
      const name = t?.function?.name || t?.name
      if (!name) throw new Error(`tool_call with no name — keys are [${Object.keys(t ?? {}).join(', ')}]`)
      const parsed = parseResult(t?.result ?? t?.output ?? null)
      calls.push({
        name,
        parsed,
        // ⭐ The axis, from the tool's own reply. Null when the result was clipped BEFORE the selector,
        // which has not been observed but must not be silently reported as "no axis".
        axis: parsed.state === 'whole' ? (parsed.value?.selector ?? null) : (parsed.selector ?? null),
        coverage: parsed.state === 'whole' ? (parsed.value?.coverage ?? null) : (parsed.coverage ?? null),
      })
    }
  }
  for (const [i, a] of audit.entries()) {
    if (!calls[i]) continue
    // ⛔ The two witnesses must agree on the tool NAME. A mismatch means the orderings have diverged and
    // every `arg_keys` below is attached to the wrong call.
    const auditName = field(a, 'tool', `audit row ${i}`)
    calls[i].agrees = auditName === calls[i].name
    calls[i].argKeys = field(a, 'arg_keys', `audit row ${i}`) ?? []
    calls[i].ok = field(a, 'ok', `audit row ${i}`)
    calls[i].ms = field(a, 'duration_ms', `audit row ${i}`)
  }
  return calls
}

export const RETRIEVAL = /^(retrieve_conversations|search_conversations|recall_own_history|inspect_around)$/

/** ⭐ Did any window in this result open the given conversation, and did its turns carry `re`? */
export function windowFor(result, conversationId) {
  const wins = field(result, 'windows', 'retrieve result') ?? []
  for (const w of wins) {
    const turns = turnsOf(w)
    if (turns.some((t) => field(t, 'conversationId', 'turn') === conversationId)) {
      return { window: w, turns: turns.filter((t) => t.conversationId === conversationId) }
    }
  }
  return null
}
