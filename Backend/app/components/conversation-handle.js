// ⭐⭐⭐ THE CONVERSATION HANDLE — ONE SCHEME, OWNED BY NEITHER SIDE THAT USES IT.
//
// ── ⚠️⚠️ WHY THIS FILE EXISTS: TWO SCHEMES, MEASURED 2026-08-26 ──────────────────────────────────────
// `handleFor` and `resolveHandle` lived inside `conversation-retrieval.js`, so the retrieval tool could
// mint a handle AND take it back, while `disclosure-host.js` — the door those handles are FOR — had its
// own idea of what a handle is: a full uuid, nothing else. Round-tripped against the real row:
//
//     handleFor(cid)                   -> "7198c1b0de"   (10 chars, what she is handed)
//     resolveHandle(db, "7198c1b0de")  -> { id: "7198c1b0-2674-…" }        ✅ retrieval takes it
//     locateConversation("7198c1b0de") -> { malformed: true, … }           ⛔ disclosure refuses it
//     locateConversation(<full uuid>)  -> { found: true, counterpart: … }  ✅ same conversation
//
// ⇒ **one tool emitted an identifier its sibling could not consume**, and she was left holding the only
// value the system would give her and being told it was the wrong one. In her words: *"Every retrieval
// call consistently returned the handle as `7198c1b0de`, yet the system keeps rejecting it as too short."*
// Her reasoning was correct end to end. The disagreement was ours.
//
// ⭐⭐ AND THE REFUSAL WAS UNFOLLOWABLE, WHICH IS THE PART THAT MATTERS. It read *"Use the complete value
// exactly as recall_own_history gave it to you, not the abbreviated form you may have written out."* —
// but her value came from `retrieve_conversations`, and it WAS complete. An instruction she cannot obey
// teaches her that the door is shut. ⇒ ⭐ **a refusal that is WRONG is worse than one that is
// inconvenient**, the same lesson the 028 request-path guard taught the night before.
//
// ── ⭐ THE RULE THIS ENCODES ─────────────────────────────────────────────────────────────────────────
// **An identifier's scheme belongs to neither the producer nor the consumer.** Left inside one of them it
// is that one's private convention, and the other is free to disagree without anything failing loudly.
// Here there is one definition, and both doors import it — so a change to the scheme cannot reach only
// half the system.
// ⛔ It is NOT a security boundary and does not pretend to be one — authorization is `decideAccess`'s
// job, and every door still asks it. This is legibility.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(s) {
  return UUID_RE.test(String(s || '').trim())
}

/**
 * ⭐⭐ 8 HEX OF THE ID + 2 CHECK CHARS, AND THE CHECKSUM IS THE WHOLE POINT.
 *
 * ⚠️⚠️ MEASURED COST OF NOT HAVING IT, 2026-08-21: she rendered a handle abbreviated to eight characters
 * in her own table one turn earlier, passed that back, and got `unreachable` three times — the message
 * for a BOUNDARY. So she concluded the mechanism was broken, stopped using it, and hand-rolled a
 * permission card in prose instead. ⇒ **a truncated handle must be reported as TRUNCATED, never as
 * absent**, because the two states lead her to opposite and equally confident conclusions.
 * ⭐ Short enough that she is not tempted to abbreviate it, and any abbreviation now fails the checksum
 * instead of silently addressing nothing.
 */
export function handleFor(conversationId) {
  const id = String(conversationId || '').toLowerCase()
  if (!UUID_RE.test(id)) return null
  const hex = id.replace(/-/g, '')
  let sum = 0
  for (let i = 0; i < hex.length; i += 1) sum = (sum * 31 + parseInt(hex[i], 16)) % 251
  return `${hex.slice(0, 8)}${sum.toString(16).padStart(2, '0')}`
}

/**
 * ⭐ THREE OUTCOMES, NEVER TWO. `{ id }` resolved · `{ malformed, why }` she mistyped it · `{ ambiguous }`.
 * ⛔ "Not found" is deliberately absent here — that is the STORE's answer, not the parser's, and
 * conflating a bad argument with a closed door is the recorded failure above.
 * ⓘ A full uuid is still accepted, because `inspect_around` speaks uuids and she may carry one across.
 *
 * ⛔⛔ AND IT STILL DOES NOT ACCEPT A PREFIX. `de19b111` remains malformed. Resolving a bare prefix by
 * matching would be an enumeration surface across every room; the checksum is what separates "the whole
 * short handle, as issued" from "the first few characters, as abbreviated".
 */
export async function resolveHandle(db, raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return { malformed: true, why: 'no conversation handle was given' }
  if (UUID_RE.test(s)) return { id: s }
  if (!/^[0-9a-f]{10}$/.test(s)) {
    return {
      malformed: true,
      why: `"${raw}" is not a conversation handle. A handle is exactly 10 characters — copy it whole from `
        + 'the result you got it from, and do not shorten it for readability.',
    }
  }
  const prefix = s.slice(0, 8)
  // ⚠️ RAW SQL WITH AN EXPLICIT `::text` CAST, NOT `Op.iLike`. Postgres has no `uuid ~~* unknown`
  // operator, so the sequelize form throws `SequelizeDatabaseError` rather than matching nothing — and a
  // thrown query inside a resolver reads to the caller as "that handle does not exist", which is the one
  // conclusion this function exists to prevent. Caught by the round-trip probe, not by reasoning.
  // ⛔ `prefix` is 8 hex characters, already validated by the pattern above, so it cannot carry a wildcard.
  const seq = db.txn_conversations.sequelize
  const { schema } = db.txn_conversations.getTableName()
  const rows = await seq.query(
    `SELECT id::text AS id FROM "${schema}"."txn_conversations" WHERE id::text LIKE :p LIMIT 4`,
    { replacements: { p: `${prefix}%` }, type: seq.QueryTypes.SELECT },
  )
  const matches = rows.filter((r) => handleFor(r.id) === s)
  // ⛔ A PREFIX THAT MATCHES BUT WHOSE CHECKSUM DOES NOT IS A TYPO, NOT AN ABSENCE.
  if (!matches.length && rows.length) {
    return { malformed: true, why: `"${raw}" looks like a handle but its check characters do not match — it was probably retyped or truncated.` }
  }
  if (matches.length > 1) return { ambiguous: true, why: 'that handle matches more than one conversation' }
  return matches.length ? { id: matches[0].id } : {}
}
