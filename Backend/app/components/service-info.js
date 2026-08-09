// Host implementation of the `serviceInfo` service that @ote/tool-service-overview consumes.
// The tool is portable (owns no data); the HOST knows its config and the assembled runtime, so it
// provides the overview. Built per request (needs the caller's turn context).
//
// ── WHAT THIS TOOL IS FOR (revised 2026-08-01, Ote: "give it some info it should have, remove
//    something it shouldnt, like database and else") ──
// It answers "what am I, right now?" for the MODEL. That scopes it hard, and the previous version failed
// the scope in both directions:
//
// REMOVED, and why each one had to go:
//  · db counts (memories / conversations / messages / users) — these were UNSCOPED, platform-wide
//    `.count()` calls, so any user could ask the assistant for an overview and learn how many accounts and
//    messages exist across everyone. A tenancy leak dressed as diagnostics, and of no use to the model.
//  · configuredProviders — leaked the whole infra list (openrouter, deepseek, zai, …) to any caller.
//  · the `tools` array — the model already HAS its tool definitions in the prompt; echoing 23 names back
//    tells it nothing it does not know. Measured the same day: tool definitions are ~95% of the prompt
//    (7266 tokens with tools on vs 363 off), so re-listing them is pure waste on top of the expensive part.
//  · defaultModel — the platform default is not this turn's model, and mixing the two is exactly how the
//    model misidentified itself before (`currentModel` was added for that reason).
//  · caller.userId — a raw UUID is useless to a model and puts an identifier in the transcript; the
//    Composer already states who the user is, by name.
//
// ADDED — what it actually needs to know about ITSELF this turn. Ote asked the assistant "recheck if you
// are really run on cpu" and it had no way to answer: placement was simply not in the overview. Now it is,
// along with the rest of the turn's shape (window, tools/memory/reasoning, its own capabilities).
export function createServiceInfoService({
  config, runtime, personaName, serviceNames = [], currentModel = null, turn = {},
}) {
  const KINDS = ['tool', 'memory', 'feature', 'bodypart', 'skill']
  return {
    async overview() {
      const byKind = {}
      for (const k of KINDS) {
        const n = runtime.registry.count(k)
        if (n) byKind[k] = n
      }
      return {
        persona: {
          name: personaName || null,
          components: runtime.registry.count(),
          byKind,
          skills: runtime.registry.getByKind('skill').map((s) => s.manifest.id),
          services: [...serviceNames].sort(),
        },
        // THIS TURN — the honest self-description. `model` is what is answering right now (not the
        // platform default); `placement` is 'cpu' when the request carries num_gpu:0, which is the only
        // truthful answer to "are you running on CPU?".
        runtime: {
          model: currentModel,
          placement: turn.placement ?? null,        // 'cpu' | 'gpu' | 'remote' | null
          contextWindow: turn.contextWindow ?? null, // the window this turn actually gets
          toolsEnabled: turn.toolsEnabled ?? null,
          memoryEnabled: turn.memoryEnabled ?? null,
          reasoningEnabled: turn.reasoningEnabled ?? null,
          capabilities: turn.capabilities ?? null,   // this model's own caps (chat/vision/tools/thinking)
        },
        limits: { maxToolCalls: config?.chat?.tools?.maxCalls ?? null },
      }
    },
  }
}
