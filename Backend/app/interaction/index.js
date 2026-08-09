// HumanInteraction — the host half of the human-driven Feature (FEATURE_HUMANINTERACTION_RFC),
// assembled per the canon layering law: Feature → Host Service → Store → DB.
//   • Capability    @ote/human-interaction — ships the Feature (protocol + validation,
//                   portable) and its private ask_user Tool (the model's voice, requests only)
//   • Host Service  ./service.js — lifecycle + held-turn pause/resume + validation + push
//   • Store         ./store.js   — raw InteractionSessions persistence
// This index is just WIRING + the public entry: it registers the late-bound host services
// the model's tool binds to and re-exports the operations the chat routes call.

import { registerHostService } from '../components/runtime.js'
import { createInteractionService, sweepZombieInteractions } from './service.js'

// public operations (the chat routes import these from here)
export {
  getPendingInteraction, answerInteraction, hasLiveWaiter,
  normalizeQuestions, formatAnswers,
} from './service.js'

// The interactive tools — filtered OUT of a turn's tool definitions when no human is on
// the other end (scheduled runs, digests, internal side-calls). The service also guards
// (belt + suspenders), but absent-from-the-toolset is the honest headless behavior (RFC:
// requiresHuman → the tool is simply unavailable).
export const INTERACTIVE_TOOL_NAMES = new Set(['ask_user'])

let initialized = false

export function initInteraction(fastify) {
  if (initialized) return
  initialized = true
  // rows stuck 'pending' from a previous process can never resolve (their held turn died
  // with it) — sweep them so no renderer draws a zombie card. Fire-and-forget at boot.
  sweepZombieInteractions(fastify).catch(() => {})
  // the model's voice (ask_user), bound per request to the caller + convo + the
  // interactive-or-not fact only the route knows
  registerHostService('interaction', ({ fastify: f, user, extras }) =>
    createInteractionService({
      fastify: f,
      user,
      conversationId: extras?.conversationId ?? null,
      interactive: extras?.interactive === true,
    }))
  // what feature.human-interaction's snapshot() reads (diagnostics only)
  registerHostService('interactionStore', () => ({
    pendingCount: () => null, // cheap; a live count query isn't worth it for a diagnostic
  }))
}
