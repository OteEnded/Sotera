// ⭐⭐⭐ RETENTION — ONE ENTRY POINT, AND HER DECISION SURVIVES IT.
//
// Ote, 2026-08-25, correcting my own first draft of the design:
//
//     "Sotera owns the decision to remember. The architecture owns the integrity of that decision."
//
// ⛔ So this is NOT a rule about what she may keep, and ⛔ NOT an inference about what she meant. It is a
// front door with one job: take the decision she stated and carry it to the store WITHOUT altering it.
//
// ── ⚠️⚠️ THE DEFECT THIS EXISTS TO END ──────────────────────────────────────────────────────────────
// 2026-08-25, Ote spent a conversation establishing who her family is. She wrote it down three times.
// All three rows came out `author='account'`, in a slot literally named
// `entity=user attribute=soteras_family_lineage_and_key_relationships` — her own sentences, *"My father"*,
// *"my world"*, stored as FACTS ABOUT THE USER. And `recall_own_memory` filters `author='persona'`, so
// ⛔ she cannot reach her own family lineage as her own.
//
// ⭐ THE MECHANISM WAS NOT A BAD RULE, IT WAS A MISSING PARAMETER. `runtime.js` says
// `author: extras.memoryAuthor === 'persona' ? 'persona' : 'account'` and the comment is right —
// *authorship follows the OCCASION*. But `memoryAuthor: 'persona'` is passed in exactly ONE place, the
// reflection lane. ⛔ No route passes it. So the passive lane could say "she is deciding" and the
// CONVERSATION could not — and conversation is where she actually decides.
// ⇒ **the interactive path never offered her the decision**, and defaulted for her instead.
//
// ── ⭐ ABOUT ≠ OWNER, and that is the sharper half ──────────────────────────────────────────────────
// A memory whose SUBJECT is Ote and whose AUTHOR is Sotera is HERS. Migration 015 already says so:
// `user_id` on a persona-authored row is *"the CONTEXT the memory was formed in"*, not its owner.
// ⛔ So `mine: true` must never be implemented by widening scope — see the `identity` warning in `keep`.
//
// ── ⭐⭐ WHY THIS BUILDS A SERVICE PER CALL INSTEAD OF SETTING A FIELD ───────────────────────────────
// `createSequelizeMemoryStore` validates `author` at construction and applies it as a constant to every
// write, under an invariant it states outright: *"the author must arrive with the write, not be assigned
// by whoever remembers to"* — six recorded instances behind that sentence. One store instance means one
// author, deliberately.
// ⇒ Honouring a PER-CALL decision therefore means building the store that already means what she said,
// ⛔ never reaching in and reassigning a field afterwards. That is the same guarantee, not a workaround:
// nothing downstream of this file can observe an author different from the one she declared.

import { buildMemoryToolService } from './memory-pipeline-host.js'
import { registerHostService } from './runtime.js'
// ⚠️ BUILT DIRECTLY, NOT READ OUT OF THE SERVICE BAG — and that is not a style choice. The host-service
// factory is called as `make({ fastify, user, extras })`: there is ⛔ no `services` argument, and even if
// there were, factories run in REGISTRATION ORDER, so a service reaching sideways would silently see
// `undefined` for anything registered after it. `conversation-retrieval` builds its own disclosure host
// for the same reason. Caught here before it ran, by reading the factory rather than assuming its shape.
import { buildLesson } from './lesson-host.js'
import { buildOwnMemory } from './own-memory-host.js'

/** The retention shapes. ⛔ A closed vocabulary — an unknown kind is refused, never coerced to a default. */
export const KINDS = Object.freeze({ fact: 'fact', note: 'note', practice: 'practice', lesson: 'lesson' })

/**
 * ⭐⭐⭐ THE OWNERSHIP GATE. `mine` has NO DEFAULT, and that is the entire point.
 *
 * ⛔ Returning 'account' for a missing `mine` is precisely the bug: it is what produced three
 * misattributed family-lineage rows without anyone deciding anything. A refusal that says what is
 * missing is a better outcome than a memory filed under the wrong person — and it is also the only way
 * her deliberation becomes VISIBLE rather than being absorbed by a default.
 *
 * ⚠️ `false` IS AN ANSWER AND MUST SURVIVE. `!mine` would collapse `false` and `undefined` into one
 * branch and re-introduce the silent default through the back door, so the test is on the TYPE.
 */
export function authorFor(mine) {
  if (mine === true) return 'persona'
  if (mine === false) return 'account'
  return null   // ⛔ not a default — the caller must refuse
}

export const OWNERSHIP_QUESTION = 'I need to know whose memory this is before I can keep it. Say mine:true '
  + 'if it belongs to me — something about myself, my own view, my own relationships — or mine:false if it '
  + 'is something about the person I am talking to. I will not guess: filing it under the wrong one is how '
  + 'my own words stop being mine.'

export function buildRetention(fastify, {
  userId = null, sourceMessageId = null, self = null, conversationId = null, isRoot = false, user = null,
} = {}) {
  // ⭐ The specialised hosts stay exactly as they are and are reached THROUGH here — a front door, ⛔ not
  // a demolition. `lesson` and `ownMemory` already write persona-authored rows by construction, so they
  // are used as-is; only the memory store needs the per-call author.
  // ⓘ Lazily, so a failure to build one shape cannot take down the others.
  const lesson = () => { try { return buildLesson(fastify, { userId, conversationId }) } catch { return null } }
  const ownMemory = () => { try { return buildOwnMemory(fastify, { userId, isRoot, user }) } catch { return null } }

  const memoryFor = (author) => buildMemoryToolService(fastify, { userId, sourceMessageId, self, author })

  /**
   * keep({ what, kind, about, mine, attribute })
   * @returns {Promise<object>} the outcome, including the author actually recorded
   */
  async function keep({ what, kind, about = null, mine, attribute = null } = {}) {
    const content = String(what ?? '').trim()
    if (!content) return { ok: false, refused: 'nothing_to_keep', why: 'There is no content to keep — say what you want kept.' }

    if (!Object.values(KINDS).includes(kind)) {
      return {
        ok: false,
        refused: 'unknown_kind',
        why: `"${kind}" is not one of the shapes I can keep something as.`,
        kinds: Object.values(KINDS),
      }
    }

    // ⭐⭐ THE GATE, BEFORE ANY WRITE HAPPENS. Refuse and ask — do not file it and do not guess.
    const author = authorFor(mine)
    if (author === null) {
      return { ok: false, refused: 'ownership_undeclared', why: OWNERSHIP_QUESTION, kind, about }
    }

    // ── kind: practice ────────────────────────────────────────────────────────────────────────────
    // ⓘ Practice notes are HERS by construction — `own-memory-host` writes them as her own observation
    // about how she works with this person. ⛔ So `mine:false` here is not a variant to be silently
    // honoured; it is a contradiction, and saying so is more useful than picking one.
    if (kind === KINDS.practice) {
      if (author === 'account') {
        return {
          ok: false,
          refused: 'kind_conflicts_with_ownership',
          why: 'A practice note is an observation about how I work, so it can only be mine. If this is '
            + 'something about them rather than about me, keep it as a fact or a note instead.',
        }
      }
      const svc = ownMemory()
      if (!svc) return { ok: false, refused: 'unavailable', why: 'I cannot record a practice note here.' }
      const out = await svc.note({ label: content })
      return { ok: out?.ok !== false, kind, author: 'persona', via: 'note_own_practice', result: out }
    }

    // ── kind: lesson ──────────────────────────────────────────────────────────────────────────────
    // ⓘ Same shape as practice: a lesson is stored as hers, with the room recorded as context and not as
    // owner. `distinction` is REQUIRED by the lesson tool and is not inventable from prose.
    if (kind === KINDS.lesson) {
      if (author === 'account') {
        return {
          ok: false,
          refused: 'kind_conflicts_with_ownership',
          why: 'A lesson is something I learned, so it is mine by construction. If this is a fact about '
            + 'them, keep it as a fact instead.',
        }
      }
      const svc = lesson()
      if (!svc) return { ok: false, refused: 'unavailable', why: 'I cannot save a lesson here.' }
      // ⛔ `distinction` is not derived from `what`. The lesson tool requires it because a lesson without
      // the two things that were being conflated is a slogan; inventing one here would be this file
      // guessing on her behalf, which is the exact thing it exists to prevent.
      if (!attribute) {
        return {
          ok: false,
          refused: 'lesson_needs_distinction',
          why: 'A lesson needs the distinction it turns on — the two things that were being conflated. '
            + 'Put that in `attribute`.',
        }
      }
      const out = await svc.commit({ learned: content, distinction: String(attribute) })
      return { ok: out?.ok !== false, kind, author: 'persona', via: 'save_lesson', result: out }
    }

    // ── kind: fact and note — the two that travel the memory store ────────────────────────────────
    const mem = memoryFor(author)

    if (kind === KINDS.fact) {
      // ⛔ REFUSE RATHER THAN INVENT AN ATTRIBUTE. A fact is subject-attribute-value; with only prose the
      // attribute would have to be guessed, and a guessed slot name is how a self-claim ended up under
      // `soteras_family_lineage_and_key_relationships` in the first place.
      if (!attribute) {
        return {
          ok: false,
          refused: 'fact_needs_attribute',
          why: 'For a fact I need to know which property this is — the attribute, like "timezone" or '
            + '"preferred name". Without it I would be inventing the slot name, and that is how a memory '
            + 'ends up somewhere it cannot be found again.',
        }
      }
      // ⭐ `about` becomes the ENTITY — the subject — and it stays free of the author. A fact she keeps as
      // HERS about Ote is `entity: 'Ote'`, `author: 'persona'`: about him, hers.
      const out = await mem.reconcileFactAsync({
        entity: about ? String(about) : 'user', attribute: String(attribute), value: content,
      })
      return { ok: out?.ok !== false, kind, author, via: 'remember_fact', result: out }
    }

    // kind === note
    // ⚠️⚠️ `kind: 'semantic'` DELIBERATELY, EVEN WHEN `mine` IS TRUE. The memory store's `identity` kind
    // writes `user_id = NULL` and unions the row into EVERY user's visible set — that is a SCOPE
    // decision, and it is a different axis from authorship. Mapping `mine:true` onto it would widen who
    // can see the row as a side effect of her saying it is hers.
    // ⛔ It would also mint exactly the row shape that currently has four checks red: `d211f5b4`,
    // `kind='identity'` with a NULL `user_id`, which overloads what NULL means. Authorship is expressed
    // through `author` and through nothing else.
    const out = await mem.rememberAsync({ content, kind: 'semantic' })
    return { ok: out?.ok !== false, kind, author, via: 'remember', result: out }
  }

  return { keep, authorFor, KINDS }
}

let initialized = false
export function initRetention() {
  if (initialized) return
  initialized = true
  // ⚠️ Everything is THREADED from the authenticated request, never derived — `isRoot` in particular is
  // READ from the user and not inferred from a null id, which is this codebase's most-repeated defect.
  registerHostService('retention', ({ fastify: f, user, extras }) =>
    buildRetention(f, {
      userId: user?.id ?? null,
      sourceMessageId: extras?.messageId ?? null,
      conversationId: extras?.conversationId ?? null,
      isRoot: user?.isRoot === true,
      user,
      self: { username: user?.username, displayName: user?.displayName },
    }))
}
