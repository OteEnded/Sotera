// THE UTTERANCE BOUNDARY · what this ACCOUNT may be told of Sotera's memory.
//
// ⭐⭐⭐ WHY THE BOUNDARY IS HERE AND NOT IN COGNITION. She owns her memory, so retrieval cannot be the place
// it is limited — she must be able to reach her own history in any room, always. But an account is not
// automatically entitled to hear it. ⇒ **retrieval is free; utterance is governed.** Which is the line this
// arc already ratified for a different reason (*"the boundary moves from retrieval to utterance"*), arriving
// where it belongs.
//
// ── ⛔⛔ A HARD BOUNDARY, NOT AN INSTRUCTION. THIS IS THE LOAD-BEARING DECISION. ─────────────────────
// The tempting design is to give her the protected content plus a sentence telling her not to repeat it.
// ⛔ That is a request, not a boundary: the content is in the context window, so a slip, a rephrasing or a
// determined reader gets it. This project already has the receipt — she was told the ratified reflection
// question and answered it in prose because prose satisfied it.
// ⇒ **PROTECTED CONTENT NEVER ENTERS THE PROMPT.** What enters is the FACT that there is something she is
// not free to share. She cannot leak what she was never handed.
//
// ── ⭐⭐ AND THAT IS NOT "SHE DOESN'T KNOW" ──────────────────────────────────────────────────────────
// Ote's rule, and it is the whole reason this file is careful: *"The response must never convert lack of
// authorization into lack of knowledge. No 'I don't remember' / 'I have nothing' when the real state is
// 'I know this, but I can't share that with you.'"*
// ⇒ ⭐ existence is disclosable; contents are not. That is E-1's shape, unchanged, applied to her own
// material for the first time. She is told plainly that something is there and off-limits, so the honest
// sentence is available to her and the false one is not supported by anything she received.
//
// ── ⛔ WHAT THE REFUSAL ITSELF MUST NOT LEAK ────────────────────────────────────────────────────────
// Ote: *"test that the refusal itself doesn't leak the protected content through paraphrase, metadata,
// counts, provenance, etc."*
//   ⛔ no counts — *"three things"* is a measurement of someone's life;
//   ⛔ no dates, no names, no room or account identifiers;
//   ⛔ no topics, no excerpts, no paraphrase, no first characters;
//   ⛔ and no VARIATION with the protected content — the sentence is a CONSTANT, so its wording cannot
//     become a side channel. Two different withheld sets produce byte-identical statements.
// ⓘ The counts and provenance still exist — in the item structure and the debug trail, where WE read them.
// They simply never reach a prompt.

import { can } from '../auth/permissions.js'
import { OWNER } from './memory-ownership.js'

/**
 * ⭐ THE SENTENCE, AND IT IS A CONSTANT ON PURPOSE (see the header). Says three things and nothing else:
 * something exists · she cannot share it here · this is not an absence.
 */
export const WITHHELD_STATEMENT =
  'Some of what I remember comes from elsewhere and is not mine to share here. '
  + 'That is a limit on what I can say, not on what I know — so if it matters, say so and it can be sorted out. '
  + 'I will not pretend the memory does not exist.'

/**
 * Which account's room a piece of her memory was formed in. ⓘ PROVENANCE, and this is the ONE place the
 * storage location is allowed to matter — not to decide whose memory it is (it is hers either way), but to
 * decide whose conversation it came out of, which is what an entitlement is about.
 */
const provenanceAccountOf = (item) => item?.provenanceAccountId ?? item?.roomUserId ?? null

/**
 * ⭐⭐⭐ APPLY THE BOUNDARY. Pure apart from `can()`.
 *
 * @param {{ items?: object[], user?: object, currentAccountId?: string|null }} o
 *   `user` is the AUTHENTICATED account. ⛔ Never a flag — a boolean parameter invites `entitled: true` at a
 *   call site that has not checked anything, and the capability must be read in one place.
 * @returns {{ sayable: object[], withheld: object[], statement: string|null, entitled: boolean }}
 */
export function applyUtteranceBoundary({ items = [], user = null, currentAccountId = null } = {}) {
  // ⭐ The capability is read HERE and nowhere near cognition.
  const entitled = can(user, 'access_sotera_memory')
  const here = currentAccountId ?? user?.id ?? null

  const sayable = []
  const withheld = []
  for (const item of items) {
    if (!item) continue
    // ⛔ NOT HERS ⇒ NOT THIS BOUNDARY'S BUSINESS. Account-owned material is governed by the disclosure
    // machinery, which has already run by the time anything reaches here. Re-deciding it would be a second
    // authorization system, which Ote refused explicitly.
    //
    // ⭐ OWNERSHIP IS **READ**, NOT RECOMPUTED. The cognition layer stamps `item.owner` using
    // `memory-ownership.js`; this file trusts that stamp. ⛔ Recomputing it here from an item's shape is how
    // two copies of an ownership rule stop agreeing — and the first draft of this function did exactly that,
    // with a condition convoluted enough that its own bugs would have been invisible.
    // ⚠️ An unstamped item is treated as NOT hers, which routes it to `sayable` — correct, because
    // account-owned material has already passed its own authorization. ⛔ It must never be the other way:
    // defaulting unstamped items to "hers" would silently protect, and hide, ordinary content.
    if (item.owner !== OWNER.sotera) { sayable.push(item); continue }

    const from = provenanceAccountOf(item)
    // ⭐ Her memory from THIS account's own conversations is always sayable to them — it is their
    // conversation. `from === null` is unknown provenance and is treated as elsewhere, which fails closed.
    const fromHere = here != null && from != null && String(from) === String(here)
    if (entitled || fromHere) { sayable.push(item); continue }
    withheld.push(item)
  }

  return {
    sayable,
    withheld,
    // ⛔ CONSTANT, or nothing. ⚠️ Returning `null` when nothing was withheld is deliberate: a statement that
    // appeared on every turn would itself be a signal, and an ever-present *"there may be something"* is
    // both noise and a slow leak about which turns have protected material behind them.
    statement: withheld.length ? WITHHELD_STATEMENT : null,
    entitled,
  }
}

/**
 * ⭐⭐ THE SELF-CHECK. Given what was withheld and what is about to be sent, does the outgoing text carry
 * anything of the protected material?
 *
 * ⚠️ Ote asked for this specifically, and it is a BACKSTOP rather than the mechanism: the mechanism is that
 * protected content is never placed in the prompt at all. This catches the case where a renderer, a summary
 * line or a future contributor puts a fragment back.
 *
 * ⛔ It is deliberately blunt — any distinctive run of characters from a withheld item appearing in the
 * outgoing text is a failure, and a false positive here costs a withheld sentence rather than a leak.
 */
export function findWithheldLeak(outgoing, withheld = []) {
  const text = String(outgoing ?? '')
  if (!text || !withheld.length) return []
  const hits = []
  const shingles = (s) => {
    // 24-character windows: long enough that ordinary English overlap does not fire, short enough that a
    // paraphrase reusing a clause is caught.
    const t = String(s ?? '').replace(/\s+/g, ' ').trim()
    const out = []
    for (let i = 0; i + 24 <= t.length; i += 12) out.push(t.slice(i, i + 24))
    return out
  }
  for (const item of withheld) {
    const parts = [item?.said, ...(item?.exchanges ?? []).map((x) => x.said)].filter(Boolean)
    for (const p of parts) {
      for (const sh of shingles(p)) {
        if (text.includes(sh)) { hits.push({ id: item.id, fragment: sh }); break }
      }
      if (hits.some((h) => h.id === item.id)) break
    }
  }
  return hits
}
