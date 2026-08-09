# Backend — OteLLMServices

The Fastify backend for **OteLLMServices**: a self-hosted, multi-user **LLM gateway + chat platform**.
It fronts local and remote model providers behind standard APIs, and hosts a full chat experience
(auth, conversations, streaming, tools, memory, skills) assembled from Portable Components.

> Architecture "why" lives in `../../Reference/docs/OTELLMSERVICES_ARCHITECTURE_PRINCIPLES.md`;
> component law in `COMPONENT_TYPES_CANON.md`; the capability ecosystem in `../../PortableComponents/PLAN.md`.

## What it does

- **Multi-standard gateway** — serves `/api/openai/v1/*` (OpenAI shape) **and** `/api/anthropic/v1/*`
  (Anthropic Messages, translated), so OpenAI- and Anthropic-native clients (incl. Claude Code) both work.
- **Chat platform** — `/v1/chat/*`: conversations, SSE streaming, tool calls, memory, skills, schedules,
  working memory, the interaction/output roles (see `RFC_STREAMING_SEMANTICS.md`).
- **Auth & multi-user** — owner-bound API keys, root/admin, capability scopes (see the `otellm-security-model`).
- **Providers** — `providers/{ollama,openai-compatible,anthropic}` behind one normalized streaming contract.
- **Cognitive runtime (proto)** — Components SDK integration (`app/components/runtime.js` ← `persona.json`
  ← `../../PortableComponents`), Memory v2, Context Composer, Reflection, Working Memory, Conversation Search.
- **Serves the built frontend** from `public/dist` (Vite output); non-API routes fall back to `index.html`.

## Run

```bash
npm install
npm start          # node server.js
npm run dev        # node --watch server.js (auto-reload)
```

Listens on `app.port` (default `:8201`). The workspace launcher `../../run_OteLLMServices.bat` also
rebuilds the frontend first; `../run.bat` is a backend-only convenience start.

## Config

- Local runtime: `config.json` (gitignored) · shared example: `config.example.json`.
- Runtime settings (models, limits, memory/reflection/composer levers, provider keys, etc.) are read
  through `app/settings/`. Most behaviour is settings-driven; see `config.example.json` for the shape.
- Postgres via Sequelize (`database/`). `sync` runs with `alter:false` — schema changes are applied
  **out-of-band** (see the PROD migration checklist in `../AI_CarryOn.md`).

## Layout

- `server.js` — boot.
- `app/routes/` — HTTP surface (`v1/` chat-site + admin + memory-admin + schedules; `api/` the OpenAI/
  Anthropic gateway standards).
- `app/chat/`, `app/chat-runtime/` — the turn loop, stream guards, provider-agnostic streaming.
- `app/components/` — host services + the SDK adapter (memory-v2, context-composer, reflection,
  working-memory, conversation-search, runtime).
- `app/adapters/`, `app/api-standards/` — provider capability probing + wire-format translation.
- `providers/` — per-provider drivers. `database/` — Sequelize models + seeds.
- `public/dist/` — built frontend (gitignored; produced by `../Frontend`).

Tests + probes live in `../test` (see its README). Working notes: `../AI_CarryOn.md`, `../AI_ProgressTracking.md`.
