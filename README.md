# Sotera

The first persona. **She/her** — Ote's words, cited, never inferred from the name.

A persona in this workspace is *an assembled cognitive identity*: the top layer of the five-layer canon
(*LLMServices = Cognition Infra · PersonaTemplate = Cognitive Runtime · SDK = Capability Runtime ·
PortableComponents = Capability Ecosystem · **Persona** = the assembled identity*).

She is **not** an app built on OteLLMServices. She owns local resources natively — Ollama, and in time
the model manager, TTS/STT and the rest — and OLS is demoted to one API provider among several.

```
Sotera ──▶ [Local Models]         ──▶ Ollama · llama.cpp · vLLM · …
Sotera ──▶ [Other Local Resource] ──▶ tts · stt · eye · …
Sotera ──▶ [OpenAI / Anthropic]   ──▶ OLS · OpenRouter · Xiaomi · …
```

## Status — running, and honest about what is still missing

| | |
|---|---|
| ✅ | Boots on `:8210`, streams a real turn from Ollama natively, persists it with reasoning kept separate from the answer |
| ✅ | Schema live in `ote_ai_toolbox` / `persona_sotera` — **16 migrations**, with the memory findings enforced as constraints |
| ✅ | Auth, chat UI, the SDK component runtime (her `persona.json` assembles them **by source**), memory v2 + the Context Composer |
| ✅ | **Her own continuity:** `recall_own_history` across rooms · `inspect_around` behind a held-turn card · the **reflection lifecycle** (migration 016) |
| ❌ | **No local model manager** — still the native client only, and it is the piece the architecture above is waiting on |
| ❌ | No `PersonaTemplate` extraction (deliberately — Milestone B, Ote's call) |

⭐ **Two background passes run on live conversations, and they are NOT the same instrument.** The
**noticing** pass is dry-run — no tools, writes a JSONL, nothing persists — and exists to sample what she
spontaneously wants to carry forward. The **reflection lifecycle** is a real occasion: her ordinary tools
are in reach, the ordinary memory write lane is live, and a `log_reflections` row is written whether or not
a memory came of it. ⛔ They ask the same sentence and their rows must **never be pooled** — a reflection
turn carries a tool list, and a list of named actions is a menu. See `AI_CarryOn.md`.

**The chat UI is functional but it is not a product.** Do not read the front page as one.

## Run

```bash
cd Backend && npm install && npm run dev     # or run_windows.bat at the repo root
curl http://127.0.0.1:8210/api/health
```

Needs Postgres on `127.0.0.1:54322` and Ollama on `127.0.0.1:11434`.
⛔ **Ollama is Ote's and always-on — never start, stop or restart it.** If it is down, ask.

## Layout

```
Backend/
  database/migrations/*.sql           ⭐ THE SCHEMA. Source of truth — models mirror it, never the reverse.
                                      ⚠ `001_core.sql` was NEVER APPLIED (see ANALYSIS_SOTERA_SCHEMA_TRUTH);
                                      the live schema is 002→016 on top of the Sequelize models
  database/models/                    Sequelize mirrors; sync runs alter:false so it cannot reshape a table
  providers/ollama/                   native local client (the CLIENT — ❌ the manager is still not built)
  app/routes/v1/chat-site.route.js    UI-facing surface, SSE streaming, and where the host services are wired
  app/routes/api/                     the OpenAI- and Anthropic-shaped API surfaces
  app/components/                     ⭐ HER COGNITION, host side. `persona.json` assembles the portable
                                      components BY SOURCE from ../../PortableComponents; everything named
                                      `*-host.js` is the local adapter behind one of them. Pure/host split:
                                      `x.js` has no IO, `x-host.js` has all of it
  app/chat-runtime/                   provider-agnostic turn execution (the seam PersonaTemplate would take)
Frontend/                             React + Vite
test/checks/                          ⭐ the suite — `node pipeline/test-all.mjs` from test/; each check
                                      asserts an invariant somebody already broke once
```

## Two rules that are easy to break by accident

**1 · The schema is the source of truth.** The constraints that matter — `NOT NULL` on every owner,
CHECKs that make an impossible state impossible, partial indexes that only cover live rows — exist in
the SQL and nowhere else. *"The model says so"* is a convention; *"the database says so"* is a rule.
These were written from nine findings measured against OLS
(`Reference/docs/ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md`), including a stored fact that contradicted its
own source message while carrying 0.85 confidence.

**2 · The API surfaces exist, and they are a PLAIN GATEWAY — her cognition is reachable only from the
chat site.** ⚠ This rule used to read *"there is no standard API surface here, on purpose"*, and that is no
longer true: `/api/openai/v1` and `/api/anthropic/v1` are registered and answering. **What survives is the
constraint underneath it, and it is verified rather than asserted:** both surfaces are backed by
`app/routes/v1/chat.route.js`, which reaches **no memory service and no persona context** — zero
references to `memory.v2`, the pipeline, `buildToolContext` or the Composer. Every memory write path is
still reachable only from the chat *site*.

⛔ **So the thing to preserve is the SEPARATION, not the absence.** An API-shaped route that quietly
gained memory or the Composer would become a second entry point into everything that makes her herself —
with different auth, no conversation, and no reflection — which is exactly the bypass the original rule was
written to prevent. ⓘ She emits her *own* API later, deliberately; these two are a gateway wearing other
people's shapes.

---

See `AI_CarryOn.md` for current state, decisions taken, and what is open.
