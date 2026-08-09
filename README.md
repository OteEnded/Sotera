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

## Status — early scaffold, honest about it

| | |
|---|---|
| ✅ | Boots on `:8210`, streams a real turn from Ollama natively, persists it with reasoning kept separate from the answer |
| ✅ | Schema live in `ote_ai_toolbox` / `persona_sotera`, with the memory findings enforced as constraints |
| ❌ | No memory service, no chat UI, no auth, no SDK wiring, **no local model manager** |

**The chat UI is a placeholder and says so.** Do not read the front page as a product.

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
  database/migrations/001_core.sql    ⭐ THE SCHEMA. Source of truth — models mirror it, never the reverse
  database/models/                    Sequelize mirrors; sync runs alter:false so it cannot reshape a table
  app/providers/ollama.js             native local client (the CLIENT — the manager is not built)
  app/routes/api/chat-site.route.js   UI-facing surface, SSE streaming
Frontend/                             React + Vite (placeholder page)
```

## Two rules that are easy to break by accident

**1 · The schema is the source of truth.** The constraints that matter — `NOT NULL` on every owner,
CHECKs that make an impossible state impossible, partial indexes that only cover live rows — exist in
the SQL and nowhere else. *"The model says so"* is a convention; *"the database says so"* is a rule.
These were written from nine findings measured against OLS
(`Reference/docs/ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md`), including a stored fact that contradicted its
own source message while carrying 0.85 confidence.

**2 · There is no standard API surface here, on purpose.** Memory comes from driving a UI, not from
being an API client — in OLS every memory write path is reachable only from the chat *site*. Adding an
OpenAI/Anthropic-shaped route would create a second entry point that silently bypasses everything that
makes her herself. She emits her own API later, deliberately.

---

See `AI_CarryOn.md` for current state, decisions taken, and what is open.
