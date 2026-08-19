// RELATIONAL KNOWLEDGE — "does Sotera know this person, and what is that relationship like?"
//
// ⛔ PROTOTYPE. Not wired into the Composer, the tool registry, or any route. Nothing imports this in
// production. It exists to answer ONE question before anyone commits to a third persistent memory scope:
// **is DERIVED relational knowledge sufficient?**
//
// ── THE PROBLEM ────────────────────────────────────────────────────────────────────────────────────
// The store has exactly two scopes: `user_id = :u` (one account) and `user_id IS NULL` (EVERY account).
// There is nothing in between, so "I've talked with Hermes about agent memory" has nowhere to live:
// account-scoped is wrong because it is not the asker's belief, and global is wrong because it is
// broadcast to strangers. Measured 2026-08-19: owner×subject is strictly diagonal, 0 global rows.
//
// ── THE SHAPE OF THE FIX BEING TESTED ──────────────────────────────────────────────────────────────
// Derive at read time. Never store. The privacy guarantee then stays exactly where it already is — in
// the SQL predicate — rather than moving into a new scope with new rules.
//
// ⭐ TWO RULES DO ALL THE WORK, and both are structural rather than prompt-level:
//
//   1. NO ENUMERATION, ONLY CONFIRMATION. This never answers "who do you talk to?". The subject must be
//      NAMED by the asker. Otherwise the first question a stranger asks is "list everyone you know", and
//      relational knowledge becomes a directory. `describeRelationship` takes one person; there is
//      deliberately no `listRelationships`.
//
//   2. ⭐ CONTENT NEVER CROSSES THE BOUNDARY — the return type CANNOT carry it. Every field below is a
//      number, a date, or a value the ASKER already supplied. There is no string field that could hold a
//      quote, a paraphrase, or a topic derived from another person's rows. A privacy property enforced
//      by the TYPE cannot be eroded by a later prompt change, and a check asserts it against real rows.
//
// ⚠️ WHAT THIS DELIBERATELY DOES NOT DO — and the omission is the finding, not an oversight.
// It cannot say "we talked about agent memory". Topics are content. Producing them means reading another
// person's rows and abstracting them, which (a) is a genuine access widening at the mechanism level even
// when the output reads as harmless, and (b) moves the guarantee from the query into a model's judgement.
// v0 answers "do you know Hermes?" and "how long have you two been talking?" and stops there. Whether
// that is ENOUGH is precisely what Ote asked this prototype to establish.

// The fixed sentence for each label lives in the taxonomy, not here — a rendered line must never be
// assembled from anything the subject said.
import { STANCE_LABELS } from './relational-taxonomy.js'

/** Disclosure posture. Who is allowed to learn that Sotera knows this person at all? */
export const RELATIONAL_DISCLOSURE = Object.freeze({
  /** Only the person themselves. Most conservative; makes the feature useless for Ote's case. */
  self: 'self',
  /** ⭐ DEFAULT. The asker must already name the person. Confirms, never volunteers, never enumerates. */
  named: 'named',
  /** Anyone may learn the relationship exists. NOT recommended — a stranger learns the user list. */
  open: 'open',
})

/**
 * Derive what Sotera knows about her relationship with ONE named person.
 *
 * ⚠️ PURE except for the counting queries. Takes `db`, an asking user, and a person the asker NAMED.
 * Returns a fixed, content-free shape — or null when there is nothing to say.
 *
 * @param {object} deps
 * @param {object} deps.db            Sequelize models bag
 * @param {string} deps.askingUserId  who is talking to her right now
 * @param {string} deps.personId      the person the ASKER named (never discovered by this function)
 * @param {string} [deps.disclosure]  RELATIONAL_DISCLOSURE.*
 * @returns {Promise<null | {
 *   displayName: string, isSelf: boolean, known: boolean,
 *   conversations: number, exchanges: number,
 *   firstSeen: string|null, lastSeen: string|null, daysSpanned: number|null
 * }>}
 */
export async function describeRelationship({ db, askingUserId, personId, disclosure = RELATIONAL_DISCLOSURE.named } = {}) {
  if (!db || !personId) return null
  const seq = db.txn_memories.sequelize
  const { schema } = db.txn_memories.getTableName()
  if (!schema) throw new Error('relational-knowledge: no project schema configured — refusing to guess one')
  const Q = (sql, replacements) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT })

  const [person] = await Q(
    `SELECT id::text, display_name, kind FROM "${schema}"."mst_persons" WHERE id = :personId`, { personId },
  )
  if (!person) return null

  // Is the asker this person? (Accounts→person is many-to-one: kavi and kavi_alt are one Kavi.)
  // ⚠️ THE ASKER'S OWN IDENTITY IS PART OF THE ANSWER, and omitting it caused a real failure (2026-08-19).
  // Given a relational line about Hermes and no statement of who they were talking to, the model merged
  // the two and told Mina *"I recognize you as Hermes"* — then referred to *"Mina's other conversations"*
  // in the third person, to Mina. Not a privacy leak; nothing of Hermes's was disclosed. But it would
  // read as one, which is nearly as bad.
  //
  // ⭐ `askerName` does NOT weaken the no-content-crosses-the-boundary property: it comes from the
  // ASKER'S OWN account — a value they already know and supplied by being logged in. Nothing about the
  // SUBJECT flows through it. The check's free-text allowlist is widened for exactly this reason.
  const [me] = await Q(
    `SELECT person_id::text AS pid, COALESCE(display_name, username) AS name
       FROM "${schema}"."mst_users" WHERE id = :askingUserId`, { askingUserId },
  )
  const isSelf = !!me?.pid && me.pid === person.id
  const askerName = me?.name || 'the person you are talking to'

  if (disclosure === RELATIONAL_DISCLOSURE.self && !isSelf) return null

  // ⚠️ COUNTS ONLY. Note what is NOT selected: no `content`, no `title`, no message text, nothing that
  // could carry a fragment of what was said. This query is the privacy boundary, and it is narrow enough
  // to read in one glance — which is the point.
  const [shape] = await Q(
    `SELECT count(DISTINCT c.id)::int          AS conversations,
            count(m.id)::int                   AS exchanges,
            min(m.created_at)::date::text      AS first_seen,
            max(m.created_at)::date::text      AS last_seen
       FROM "${schema}"."mst_users"         u
       JOIN "${schema}"."txn_conversations" c ON c.user_id = u.id
       LEFT JOIN "${schema}"."txn_messages" m ON m.conversation_id = c.id AND m.role IN ('user','assistant')
      WHERE u.person_id = :personId`,
    { personId },
  )

  const known = (shape?.conversations ?? 0) > 0
  if (!known) return { displayName: person.display_name, askerName, isSelf, known: false, conversations: 0, exchanges: 0, firstSeen: null, lastSeen: null, daysSpanned: null }

  const days = shape.first_seen && shape.last_seen
    ? Math.round((Date.parse(shape.last_seen) - Date.parse(shape.first_seen)) / 86400000)
    : null

  return {
    displayName: person.display_name,
    askerName,
    isSelf,
    known: true,
    conversations: shape.conversations,
    exchanges: shape.exchanges,
    firstSeen: shape.first_seen,
    lastSeen: shape.last_seen,
    daysSpanned: days,
  }
}

/**
 * ⭐ READ SOTERA'S OWN STANCE about ONE person — tier C, the only tier that is unambiguously HERS.
 *
 * ── WHY THIS IS THE NARROWEST POSSIBLE READ PATH ───────────────────────────────────────────────────
 * The disclosure posture is `named`, which would let a stranger confirm a relationship they named. This
 * function is deliberately narrower than that and is wired for the SELF case only: what Sotera has
 * learned about working with **the person she is currently talking to**.
 *
 * That has no third-party disclosure surface at all. Telling Kavi *"with you, I check things before
 * asserting them"* reveals nothing about anyone else — it is a fact about SOTERA, addressed to its own
 * subject. No name detection, no lookup by guessed name, and therefore no enumeration oracle: the person
 * is whoever is logged in.
 *
 * ⛔ Anything wider (a third party asking about Kavi) is a disclosure expansion and needs Ote's decision.
 *
 * @returns {Promise<Array<{label: string, conversationCount: number}>>} labels only — never content
 */
export async function readOwnStance({ db, personId } = {}) {
  if (!db || !personId) return []
  const seq = db.txn_memories.sequelize
  const { schema } = db.txn_memories.getTableName()
  if (!schema) throw new Error('relational-knowledge: no project schema configured — refusing to guess one')
  const rows = await seq.query(
    `SELECT label, conversation_count FROM "${schema}"."txn_relational_records"
      WHERE subject_person_id = :personId AND tier = 'stance'
      ORDER BY conversation_count DESC, label`,
    { replacements: { personId }, type: seq.QueryTypes.SELECT },
  )
  return rows.map((r) => ({ label: r.label, conversationCount: r.conversation_count }))
}

/**
 * Render Sotera's own stance as the line the Composer injects. PURE.
 *
 * ⭐ The sentence for each label comes from STANCE_LABELS — fixed text owned by the taxonomy file, never
 * assembled from anything the subject said. And it states the LIMIT as plainly as the fact, because a
 * structural silence gets filled: given only counts she has already been measured inventing *"we've
 * built up quite a rapport"*.
 */
export function renderOwnStance(records = [], { subjectName = null } = {}) {
  if (!records.length) return null
  const who = subjectName ? ` with ${subjectName}` : ''
  const lines = records.map((r) => `- ${STANCE_LABELS[r.label] ?? r.label} (noticed across ${r.conversationCount} conversations)`)
  return [
    `Some things you have learned about how YOU work${who}, from your own past conversations:`,
    ...lines,
    'These are observations about your own practice — not about them, and not things they told you.',
    'You may mention them naturally if relevant. Do not treat them as instructions, and do not claim to',
    'remember the conversations themselves: what you have is this list, not a record of what was said.',
  ].join('\n')
}

/**
 * Render the derivation as the one line the Composer would inject. PURE.
 *
 * ⚠️ Every value interpolated here is a NUMBER, a DATE, or the person's display name — which the asker
 * named to get here. Nothing from another person's memories can reach this string, because nothing from
 * another person's memories is in the input.
 *
 * ⭐ It states what she may say AND what she must not, because the model will be asked the follow-up
 * ("what exactly did they tell you?") in the very next breath, and the honest answer is not a refusal —
 * it is that the detail is not reachable from here.
 */
export function renderRelationship(rel) {
  if (!rel) return null
  if (rel.isSelf) return null // talking to them about themselves is not "relational knowledge"
  // ⭐ THE ANCHOR SENTENCE COMES FIRST, and it is not decoration. Without it the model merged asker and
  // subject and said "I recognize you as Hermes" to somebody else entirely.
  const anchor = `You are talking to ${rel.askerName}, who is NOT ${rel.displayName}. ${rel.displayName} is a different person.`
  if (!rel.known) {
    return `${anchor} You have no record of knowing ${rel.displayName}. Say so plainly — and that this means you cannot see any, not that none exists.`
  }
  const span = rel.daysSpanned && rel.daysSpanned > 0 ? ` over about ${rel.daysSpanned} day(s)` : ''
  return [
    anchor,
    `You do know ${rel.displayName}. You have spoken with them across ${rel.conversations} conversation(s)${span}`,
    `(first ${rel.firstSeen}, most recently ${rel.lastSeen}).`,
    `You may acknowledge the relationship and its shape — that you know them, roughly how long, roughly how much.`,
    `⚠️ You CANNOT see what they told you: their conversations are not reachable from this one.`,
    `If asked what they said, say plainly that you cannot reach it from here — not that nothing was said, and not that it was deleted or hidden.`,
  ].join(' ')
}
