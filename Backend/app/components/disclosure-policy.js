// DISCLOSURE POLICY — the deployment's answer to *"who has to be asked, and about what?"*
//
// ⭐⭐⭐ WHY THIS IS A FILE AND NOT A BOOLEAN, in Ote's words (2026-08-21):
//
//   *"Let's make the current Sotera deployment no-permission-first. This is primarily my personal Sotera,
//   and I'm the root/user she's operating for. I don't want her constantly asking me for permission to
//   inspect her own history or conversations that are already within my authorized scope. Keep the
//   authorization infrastructure intact — we're not deleting the boundary system. We're simply making the
//   current personal/root environment automatically authorized by default. Later, when Sotera needs to
//   operate across multiple users, rooms, or genuinely private third-party material, we can turn on
//   explicit permission requirements where they're actually necessary."*
//
//   ⇒ **capability first → observe behaviour → add authorization friction where the deployment
//   actually requires it.**
//
// ⛔⛔ AND THE THING HE ASKED FOR THAT A BOOLEAN CANNOT GIVE: *"please make sure we can still tighten it
// later without redesigning the whole mechanism."* A flag read inline at each site cannot promise that.
// `memory.rootAutoDisclosure` was already read in two places, and the second one was added a day late —
// which is exactly how the polite path ended up worse than the impolite one: `inspect_around` had the flag,
// `request_room_access` did not, so ASKING raised a card that inspecting never would have. Ten minutes of
// held turn, two timed-out cards, and she read it as a refusal.
// ⇒ ⭐ ONE FUNCTION ANSWERS THE POLICY QUESTION FOR EVERY SITE. A new site that forgets to ask is a bug
// with a name, and tightening the deployment is one config value rather than an audit of call sites.
//
// ⛔ THIS IS NOT L1, AND THAT IS DELIBERATE. His architecture rule, same day: *"L1 should stay
// foundational. L2 should contain behavioural rules… I don't want us to accidentally turn Sotera into a
// personality we are continuously hand-programming through L1 additions."* Whether a deployment demands a
// card is a property of the DEPLOYMENT, not of who she is — so it lives here, in infrastructure, and
// nothing about it is said to her in a prompt. She finds out what she is allowed to read by asking, and
// the answer is a tool result rather than a sentence about her character.
//
// ⚠️ WHAT THE PERMISSIVE MODE DOES **NOT** TOUCH, because he kept it explicitly (*"other people's
// conversation contents must remain protected"*):
//   · a NON-root session is still not a wildcard in any room — it gets her own words and nothing else;
//   · every automatic disclosure is still RECORDED, as `root_session`, and stays countable apart from a
//     consented one forever;
//   · a grant is still per room pair, per conversation, bounded to a window, and revocable;
//   · ⛔ there is still no prose path — root-ness comes from the authenticated user, never from a sentence,
//     never from her own claim, never from the shape of an id.

/**
 * ⭐ THE TWO MODES, AND THE DEFAULT IS THE STRICT ONE.
 *
 * `'shared'`   — the original design. Cross-room content requires a stored, answered, affirmative card.
 *                A deployment that has not asked to be permissive must not inherit permissiveness, so this
 *                is what an absent/unrecognised config value means.
 * `'personal'` — one human owns the deployment and is the root session. A root session is authorized for
 *                cross-room material automatically, and no disclosure card is raised at all.
 */
export const DISCLOSURE_MODES = ['shared', 'personal']

/**
 * The deployment's mode.
 *
 * ⓘ `memory.rootAutoDisclosure` is honoured as a LEGACY ALIAS rather than dropped: it is what shipped
 * yesterday, it is what `020_root_session_disclosure.sql` was written for, and a config that still carries
 * it must keep behaving the way its author expects. `memory.disclosure.mode` wins when both are present,
 * because the explicit statement of policy should beat the flag that approximated it.
 */
export function disclosureMode(config) {
  const named = config?.memory?.disclosure?.mode
  if (DISCLOSURE_MODES.includes(named)) return named
  if (config?.memory?.rootAutoDisclosure === true) return 'personal'
  return 'shared'
}

/**
 * ⭐ MAY THIS SESSION BE AUTHORIZED WITHOUT ASKING A HUMAN?
 *
 * ⚠️ `isRoot` MUST come from the authenticated user. Never from a null id (that defect has nine recorded
 * instances in this codebase), never from a username string, never from anything she said.
 */
export function autoAuthorizes(config, { isRoot = false } = {}) {
  return isRoot === true && disclosureMode(config) === 'personal'
}

/**
 * ⭐⭐ SHOULD A CARD EVER GO UP FOR THIS SESSION?
 *
 * Separate from `autoAuthorizes` on purpose, because they are separate questions and conflating them is
 * how the polite path broke. `autoAuthorizes` answers *"can I proceed?"*; this answers *"is a human the
 * right thing to reach for if I cannot?"* — and in a personal deployment the answer for root is NO even
 * when something else refuses, because there is no second party whose consent a card would be collecting.
 */
export function mayRaiseDisclosureCard(config, { isRoot = false } = {}) {
  if (autoAuthorizes(config, { isRoot })) return false
  return true
}

/** One line for a log or a health payload. ⛔ Never a secret, and never anything a room contains. */
export function describeDisclosurePolicy(config) {
  const mode = disclosureMode(config)
  return mode === 'personal'
    ? 'personal: a root session is authorized across rooms automatically, recorded as root_session; non-root sessions get their own material only'
    : 'shared: cross-room content requires a stored, answered, affirmative card; no session is authorized automatically'
}
