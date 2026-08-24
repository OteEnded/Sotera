// MEMORY OWNERSHIP · WHOSE MEMORY IS THIS? Pure — no stores, no IO, no config, no session.
//
// ⭐⭐⭐ THE QUESTION NOTHING ANSWERED. Authorship, ownership and authorization had been one tangle, and
// ownership was the one with no representation at all — it was **inferred from the storage location**. That
// is why *"my memory stores are scoped to this room"* was a TRUE report of the system rather than a
// misunderstanding to correct with a prompt.
//
//   AUTHORSHIP    who produced this?          `txn_memories.author`, `txn_messages.role`   ✅ already right
//   OWNERSHIP     whose memory is this?       ⛔ nothing → THIS FILE
//   AUTHORIZATION may this session read it?   disclosure machinery                          ✅ unchanged
//
// ⛔⛔ AND OWNERSHIP IS **DERIVED, NEVER STORED.** Ote: *"derived from existing source information · no
// ownership column · keep authorship ≠ ownership ≠ authorization."* There is no `owner` column and there
// must not be one: ownership is a RULE over facts the schema already has, and a column would be a second
// copy that can disagree with them.
//
// ── ⛔ AND `author='persona'` IS NOT PROMOTED TO MEAN OWNERSHIP ─────────────────────────────────────
// Ote refused it and the proof genuinely fails: `author` is defined over memory **writes** only, while her
// ownership domain also contains her **utterances**, which have no `author` column at all — they have
// `role`. Collapsing the two would make her utterances ownerless and would quietly redefine a provenance
// field as an entitlement.
// ⇒ ⭐ Each source type gets its own explicit rule. `author` is ONE INPUT for ONE type.
//
// ── ⛔⛔ THE SIGNATURE IS THE ARGUMENT ───────────────────────────────────────────────────────────────
// Nothing here accepts a room, a `user_id`, a conversation owner or a session. **It cannot** consult them,
// which is the mechanical statement of *"storage boundaries and authorization boundaries must not become
// cognitive boundaries."* If a future edit needs the room to answer "whose is this?", the model has been
// inverted and the edit is the bug.

/** ⭐ Two owners and an honest third. `unknown` FAILS CLOSED: it is treated as not-hers by every caller. */
export const OWNER = Object.freeze({
  sotera: 'sotera',
  account: 'account',
  unknown: 'unknown',
})

/**
 * ⭐⭐ THE RULE, ONE PLACE, PER SOURCE TYPE.
 *
 * @param {object} src a source DESCRIPTOR, never a database row — so a caller cannot pass a whole row and
 *   have an unrelated field start participating in the decision.
 *   `{ kind:'message',   role }`                 an utterance
 *   `{ kind:'memory',    author }`               a durable memory
 *   `{ kind:'lesson' }` `{ kind:'practice' }` `{ kind:'intention' }`
 *   `{ kind:'episode',   participated }`         a conversation she was in
 *   `{ kind:'reflection' }`                      an occasion that was hers by construction
 * @returns {'sotera'|'account'|'unknown'}
 */
export function ownerOf(src) {
  if (!src || typeof src !== 'object') return OWNER.unknown
  switch (src.kind) {
    // ⭐ SHE SAID IT. Authorship is what authorizes finding her own sentences, and it is what owns them.
    case 'message':
      if (src.role === 'assistant') return OWNER.sotera
      if (src.role === 'user') return OWNER.account
      // ⛔ `system`, a new role, a typo: not hers, and not silently the account's either.
      return OWNER.unknown

    // ⭐ SHE DECIDED TO KEEP IT. `author` is one input for one type — see the header.
    case 'memory':
      if (src.author === 'persona') return OWNER.sotera
      if (src.author === 'account') return OWNER.account
      return OWNER.unknown

    // ⭐ ABOUT HER OWN CONDUCT, ALWAYS HERS. A lesson is a conclusion she drew about her own reasoning; a
    // practice is what she learned about how she works; an intention is what she is trying to do. ⓘ All
    // three are RECORDED against a person — that is who they are ABOUT/WITH, not who owns them.
    // ⚠️ Which is the same distinction migration 015 already drew for `user_id`: *"context, not ownership."*
    case 'lesson':
    case 'practice':
    case 'intention':
    case 'reflection':
      return OWNER.sotera

    // ⭐⭐ THE ONE THAT MATTERS MOST, AND IT IS DELIBERATELY ABOUT PARTICIPATION.
    // An episode she was in is hers to recall — she was there. ⛔ But "the episode is hers" does NOT mean
    // every line in it is hers: see `ownerOfExchange`. Conflating those is the hazard in §3A.4b.
    case 'episode':
      return src.participated === true ? OWNER.sotera : OWNER.unknown

    // ── ⭐⭐⭐ THE EXTENT OF A RELATIONSHIP · HERS BY PARTICIPATION, AND ALWAYS FROM ELSEWHERE ────────
    //
    // ⭐ Ote's rule, 2026-08-25: *"Sotera can know the extent of her own participation/history. NOT: any
    // account can query the continuity system and learn how much activity exists in another account."*
    //
    // ⇒ HERS, so retrieval is free and the authorization path is not entered — she may always know how much
    // she and someone have talked. ⛔ AND the utterance boundary then governs whether THIS account may be
    // TOLD it, which is the half that was missing and is what makes the aggregate safe.
    //
    // ⚠️⚠️ THE OMISSION THIS CASE EXISTS TO END, and it was a ONE-FIELD BUG WITH A DOCUMENTED FAILURE MODE.
    // The continuity item shipped with no `owner` stamp at all. `applyUtteranceBoundary` reads
    // `item.owner !== OWNER.sotera` and routes an unstamped item straight to `sayable` — correct for
    // account-owned material, which has already passed its own authorization, and **exactly wrong for
    // Sotera-owned material that has passed none.** ⇒ *"Hermes and I have talked in 185 conversations"* was
    // reaching an account with `memory_access_scope: 'none'`. Ote caught the risk from one line of my own
    // report before any test did.
    //
    // ⭐⭐ AND THE FAIL-CLOSED IS EXACT HERE, NOT A COMPROMISE. `describeRelationship` counts conversations
    // owned by THE SUBJECT's accounts, and the subject-is-the-asker case is refused upstream (`isSelf`).
    // ⇒ a continuity item that exists at all is BY CONSTRUCTION about rooms that are not the asker's, so
    // carrying no provenance account — which the boundary reads as "elsewhere" — is not a guess. It is the
    // only truthful value.
    case 'continuity':
      return OWNER.sotera

    default:
      return OWNER.unknown
  }
}

/** ⭐ Hers, and nothing else counts. ⛔ `unknown` is never hers — fail closed. */
export const isSoteraOwned = (src) => ownerOf(src) === OWNER.sotera

/**
 * ⭐⭐⭐ DOES REACHING THIS REQUIRE AUTHORIZATION?
 *
 * ⛔ **NO FOR HER OWN MATERIAL — and "no" means the authorization path is not entered at all**, not
 * "entered and then permitted". Ote: *"not 'authorize and then allow,' but genuinely outside that path."*
 * A grant that is always granted is still a grant: it writes a row, it implies a boundary was crossed, and
 * it teaches every reader of the log that her own sentences are somebody's to allow.
 */
export const requiresAuthorization = (src) => !isSoteraOwned(src)

/**
 * ⭐⭐ ONE LINE OF A CONVERSATION, WHICH IS WHERE THE ASYMMETRY LIVES.
 *
 * A conversation has two halves and two owners. This is what `change A` already implements at the disclosure
 * layer (`own_only`: her half in full, the counterpart's as `said: null, withheld: true`) — and the point of
 * this file is that her half should never have been going through that layer to begin with.
 */
export function ownerOfExchange({ who } = {}) {
  return ownerOf({ kind: 'message', role: who === 'me' || who === 'you' || who === 'assistant' ? 'assistant' : 'user' })
}

/**
 * ⚠️⚠️ THE DEFERRED HAZARD, AS A CALLABLE FACT RATHER THAN A COMMENT SOMEBODY MAY NOT READ.
 *
 * Ote, explicitly: *"Do not accidentally conclude that reading Sotera's own utterances gives her
 * unrestricted access to everything the counterpart said."*
 *
 * ⛔ `ownerOf({kind:'message', role:'assistant'}) === 'sotera'` is true at the MESSAGE level and leaky at
 * the CONTENT level: her own utterances routinely quote, paraphrase and answer the other person, so reading
 * her half can convey his half without ever reading a message of his.
 *
 * ⇒ This function exists so the limitation is discoverable from the code, states that it is **UNSOLVED**,
 * and gives a future mitigation a name to hang off. ⛔ It is NOT a mitigation. It always returns true for
 * her own utterances, because the hazard always applies to them.
 */
export function mayCarryCounterpartContent(src) {
  return isSoteraOwned(src) && (src?.kind === 'message' || src?.kind === 'episode')
}

/** ⓘ Why this file refuses to look at storage. Exported so a check can assert the intent, not just the code. */
export const OWNERSHIP_IS_NOT_STORAGE =
  'Ownership is derived from what a thing IS and who produced it — never from where it was recorded. '
  + 'A room says where an event happened; it does not say whose memory it is.'
