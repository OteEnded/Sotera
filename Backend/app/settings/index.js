// Runtime settings — two layers, same philosophy as providers:
//   config.json           = platform DEFAULTS (root's file; not a console-writable surface)
//   `settings` DB table   = values changed at runtime from the console (override by key)
//
// ⚠️ THE RULE CHANGED ON 2026-08-06 — and the distinction is narrow, so read it exactly.
// This comment used to read "never written by the console", as an absolute. Ote replaced it:
//     *"server can interact with config under specified case. not convenient read write whole thing"*
// So the platform MAY write config.json, but only through a purpose-built writer for a NAMED key,
// never as a general settings surface. The first and so far only case is
// `auth.root.userConnected` (app/config/config-writer.js), which the boot reconciler sets because the
// server is the only party that knows the row id — making a human retype it was ceremony, not safety.
//
// What has NOT changed, and is the whole point of the narrowness: config.json is still root's
// hand-maintained file. Anything a user can change from the console belongs in the `settings` table,
// not here. A writer that could set arbitrary keys would quietly turn this file into a database with
// worse concurrency, no audit trail, and root's password sitting in it. Any future case needs its own
// scoped writer and its own justification — atomic replace, backup, and a validation gate that
// refuses to touch credentials (see config-writer.js for the shape).
//
// Known keys are declared in SETTING_DEFS with their config-default resolver and a
// validator; unknown keys are rejected at the route. Values are cached in-memory
// (loaded at boot, updated on write) so reads are free on hot paths.

const MODEL_ID = /^[a-z0-9][a-z0-9_-]*\/.+$/i // "<provider>/<model>"

// Claude-facing id or trailing-* prefix pattern (e.g. "claude-sonnet-5", "claude-haiku*")
const CLAUDE_PATTERN = /^[\w.:-]{1,120}\*?$/

// { "<host>|<model>": { ctx, ... } } — per-model measured context optima, written by the
// Models-console Calibrate action (root may also edit it via the settings API).
const CAL_ENTRY_KEYS = ['ctx', 'trained', 'vramGB', 'loads', 'measuredAt', 'fitsFull', 'note']
function isCtxCalibrationMap(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const entries = Object.entries(v)
  if (entries.length > 64) return false
  return entries.every(([k, e]) => (
    typeof k === 'string' && k.length >= 1 && k.length <= 300
    && e && typeof e === 'object' && !Array.isArray(e)
    && Object.keys(e).every((p) => CAL_ENTRY_KEYS.includes(p))
    && Number.isInteger(e.ctx) && e.ctx >= 1024 && e.ctx <= 1_048_576
    && (e.trained == null || Number.isInteger(e.trained))
    && (e.vramGB == null || (typeof e.vramGB === 'number' && Number.isFinite(e.vramGB)))
    && (e.loads == null || Number.isInteger(e.loads))
    && (e.measuredAt == null || typeof e.measuredAt === 'string')
    && (e.fitsFull == null || typeof e.fitsFull === 'boolean')
    && (e.note == null || (typeof e.note === 'string' && e.note.length <= 200))
  ))
}

// { "<claude id or pattern>": "<provider>/<model>", ... } — the Anthropic-surface routing table
function isModelMap(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const entries = Object.entries(v)
  if (entries.length > 64) return false
  return entries.every(([k, val]) => CLAUDE_PATTERN.test(k) && typeof val === 'string' && MODEL_ID.test(val))
}

const SETTING_DEFS = {
  'console.keyRevealSeconds': {
    fromConfig: (c) => c?.console?.keyRevealSeconds ?? 60,
    validate: (v) => Number.isInteger(v) && v >= 5 && v <= 3600,
    describe: 'Seconds the just-minted raw API key stays visible before auto-hiding (5–3600)',
  },
  // ---- chat platform defaults (config.json chat.* = the file defaults) ----
  'chat.defaultModel': {
    fromConfig: (c) => c?.chat?.defaultModel ?? null,
    validate: (v) => typeof v === 'string' && MODEL_ID.test(v),
    describe: 'Model every chat starts on (and the fixed model for member-role users)',
  },
  'chat.summaryModel': {
    fromConfig: (c) => c?.chat?.context?.summaryModel ?? '',
    validate: (v) => v === '' || (typeof v === 'string' && MODEL_ID.test(v)),
    describe: "Model for rolling summaries / background compaction; empty = use the conversation's own model",
  },
  'chat.titleModel': {
    fromConfig: (c) => c?.chat?.context?.titleModel ?? '',
    validate: (v) => v === '' || v === '@chat' || (typeof v === 'string' && MODEL_ID.test(v)),
    describe: "Model that names conversations; empty = fall back to the summary model, then the conversation's own model; '@chat' = use the conversation's OWN model (no model swap — avoids an Ollama load/unload just to title)",
  },
  'chat.scheduleAssistModel': {
    fromConfig: (c) => c?.chat?.scheduleAssistModel ?? '',
    validate: (v) => v === '' || (typeof v === 'string' && MODEL_ID.test(v)),
    describe: 'Model that interprets "describe it" schedule prompts (create/edit by prompt); empty = the model picked in the schedule form',
  },
  // ── THE VOICE (MM Arc · Audio phase, Voice v1 — 2026-08-04) ────────────────────────────────────
  // Engine selection was a measurement, not an opinion: 11 configurations benched in AI_LLMv2/VoiceModels
  // on identical text. Ote picked OmniVoice for this, while saying "i still kinda want vox abit" — so the
  // engine is NOT a setting here. It is chosen when the sidecar starts, and switching is an operations
  // move (run the other engine's sidecar, point this URL at it) rather than a code or schema change.
  'chat.speechSidecarUrl': {
    fromConfig: (c) => c?.chat?.speech?.sidecarUrl ?? '',
    validate: (v) => v === '' || (typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v) && v.length <= 300),
    describe: "Base URL of the local VOICE SIDECAR that renders a reply as speech, e.g. 'http://127.0.0.1:8310'. EMPTY (the default) = the Voice is OFF and the 🔊 control never appears. Deliberately NOT a model id and deliberately NOT OpenAI-compatible: the engines are Python + CUDA with conflicting dependency trees, so they run as a separate process speaking our own contract (POST /speak -> audio/wav, plus /health and /voices). Start it with: VoiceModels/engines/omnivoice/.venv/Scripts/python.exe sidecar/serve.py --engine omnivoice --port 8310 --idle-unload 300. Point it somewhere else to change engine — no redeploy. Speaking is USER-TRIGGERED per reply, never automatic, and runs entirely on this machine (no text leaves the box).",
  },
  'chat.speechVoice': {
    fromConfig: (c) => c?.chat?.speech?.voice ?? '',
    validate: (v) => typeof v === 'string' && v.length <= 200,
    describe: "Which voice the sidecar should use; empty = the sidecar's own default. The SHAPE is engine-specific, which is why this is free text rather than an enum: OmniVoice takes a validated ATTRIBUTE STRING ('male, young adult, british accent' — gender x age x pitch x accent x whisper, and an unsupported value raises rather than being ignored), while Qwen3-TTS and VoxCPM2 take a speaker NAME ('aiden'). GET <sidecar>/voices lists what the running engine accepts. Ote's picks are male: OmniVoice 'male, young adult, british accent', Qwen/VoxCPM2 'aiden'.",
  },
  'chat.speechSampleRate': {
    fromConfig: (c) => c?.chat?.speech?.sampleRate ?? 24000,
    validate: (v) => Number.isInteger(v) && v >= 8000 && v <= 48000,
    describe: "Output sample rate for speech. 24000 is the default and Ote's call ('24 kHz acceptable') — it HALVES storage against 48 kHz with no measurable quality cost: VoxCPM2 renders 48 kHz but only 0.00024% of its energy sits above 12 kHz, i.e. the band a 24 kHz file cannot carry is empty in its own output (measured, VoiceModels/round2/bandwidth). At 24 kHz PCM16 a ~43s reply is ~2.0 MB; at 48 kHz it is ~4.1 MB for the same audible content. The sidecar resamples, so this works whatever the engine renders natively.",
  },
  // ── CLIP CACHE EVICTION (Ote, 2026-08-04: *"if 1 gb, del old, if older than xx del, and LRU on
  //    last-played"*, and *"try to not hard code tho, so it easier to make it use congif value or setting"*).
  //    Both are settings for exactly that reason; 0 disables either rule independently.
  'chat.speechCacheMaxMB': {
    fromConfig: (c) => c?.chat?.speech?.cacheMaxMB ?? 1024,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 1_000_000,
    describe: "Disk budget for rendered speech clips, in MB (0 = no cap). Sweeps evict the LEAST RECENTLY PLAYED first, so a clip you keep replaying survives. ⚠ Eviction is not free: no local engine exposes a seed, so a re-render is a DIFFERENT TAKE rather than the same clip — deleting one means an old reply sounds slightly different the next time its 🔊 is pressed. That argues for a generous cap over an eager TTL. At ~470 KB per clip, 1024 MB is roughly 2,000 clips (Ote's number).",
  },
  'chat.speechCacheTtlDays': {
    fromConfig: (c) => c?.chat?.speech?.cacheTtlDays ?? 15,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 3650,
    describe: "Delete a clip nobody has PLAYED for this many days (0 = never). ⚠ Measured from LAST PLAYED, not from creation, and that is load-bearing: from creation, a clip replayed every week would still die on day 15 — LRU would be keeping it while the TTL killed it, and the two rules would fight. From last-played it means 'nobody has listened to this in N days', which is what was asked for. Last-played is the clip file's mtime, touched on every cache hit (one syscall, no JSON rewrite).",
  },
  'chat.speechChunkChars': {
    fromConfig: (c) => c?.chat?.speech?.chunkChars ?? 600,
    validate: (v) => Number.isInteger(v) && v >= 120 && v <= 4000,
    describe: "Target characters per spoken chunk. Chunk-and-play renders a reply piece by piece and starts playing the first while the rest render, so this trades FIRST SOUND against FLOW: every boundary is an independent render, and the engine restarts its prosody there (a falling sentence-final intonation mid-paragraph). Measured on OmniVoice at ~14 ms/char: 220 chars = first sound ~2.5 s but 8 resets on a 1645-char reply; 600 chars = ~8 s and 2 resets. Raised to 600 on Ote's call — *\"bigger chuck size limit is fine. >5s is acceptable\"*. Cuts always land on SENTENCE ends (Thai: politeness particles), never mid-clause; the ceiling scales with this value. True streaming would remove resets entirely, but only VoxCPM2 generates incrementally.",
  },
  'chat.speechMaxChars': {
    fromConfig: (c) => c?.chat?.speech?.maxChars ?? 1200,
    validate: (v) => Number.isInteger(v) && v >= 200 && v <= 20000,
    describe: 'Longest text one press will speak; anything beyond is trimmed at a sentence boundary and the response says it was clipped. MEASURED on OmniVoice: 1200 characters is ~30s of rendering for ~70s of audio, while 3000 is ~82s of rendering for ~176s of audio — nobody listens to three minutes of a chat reply, and the wait dominates the value. Lowered from 4000 to 1200 on 2026-08-04 after Ote reported long messages taking too long. Raise it if you want whole essays read; the clip notice tells the user when it bit.',
  },
  'chat.visionRelayModel': {
    fromConfig: (c) => c?.chat?.visionRelay?.model ?? 'ollama/qwen3.5:9b',
    validate: (v) => typeof v === 'string' && MODEL_ID.test(v),
    describe: "Vision model that describes images for models that cannot see (platform default). ⚠️ This model is the platform's EYE — a wrong description is cached on the message row and replayed forever, so it must be a model that reliably sees. It was gemma4:e4b until 2026-08-03, changed after e4b was measured BLIND here (denies the image, or confabulates a plausible wrong description — 'a dark abstract background' for a photo of a PSU box). Two independent reasons: Ollama's E2B/E4B image inputs are broken on Windows (ollama#16874/#16597, fix PR #16879 open), and e4b is separately reported as too hallucination-prone for document/OCR work. Measured here on a real photo with visible text: qwen3.5:9b 14.3s/1413 chars, gemma4:26b 20.5s/1213, qwen3.6:35b 29.9s/1467 — all correct, so the smallest+fastest wins. Verify a candidate before trusting it: POST /admin/models/verify {caps:['vision']}.",
  },
  'chat.visionRelayNumCtx': {
    fromConfig: (c) => c?.chat?.visionRelay?.numCtx ?? 8192,
    validate: (v) => Number.isInteger(v) && v >= 1024 && v <= 131072,
    describe: "Context window for a vision-relay describe call. A describe is ONE image plus two short prompts, so the chat model's full window is pure VRAM pressure — measured identical speed at 8192 (5-13s) while leaving the card room. This matters because the relay loads a SECOND model beside the chat model: on 2026-08-03 the runner aborted (0xc0000409 / CUDA init) after hours of model churn while the chat model held 131k, and the user's reply became 'you didn't attach an image'.",
  },
  'chat.visionRelayDevice': {
    fromConfig: (c) => c?.chat?.visionRelay?.device ?? 'gpu',
    validate: (v) => v === 'cpu' || v === 'gpu',
    describe: "Where the vision-relay describer runs. 'gpu' (default) is ~10x faster — measured 5-13s vs 63-71s for the same model+image on CPU — and is correct while the card has room. 'cpu' = num_gpu:0, zero VRAM, never competes with the chat model: the escape hatch if relay calls start crashing the runner or evicting your chat model. (Every other aux path — embed/extract/resolve/reflect/consolidate — defaults to CPU; the relay does not, because it sits IN the user's turn and a minute of silence per image is not off the hot path.)",
  },
  'memory.embeddingModel': {
    fromConfig: (c) => c?.memory?.embeddingModel ?? 'ollama/qwen3-embedding:4b',
    validate: (v) => typeof v === 'string' && MODEL_ID.test(v),
    describe: 'Embedding model persona memory (v2) uses for semantic recall (provider/model). Default qwen3-embedding:4b (native 2560-dim); 8b is the upgrade if recall proves weak. Must stay consistent — changing it invalidates existing memory vectors until re-embedded.',
  },
  'memory.embeddingDims': {
    fromConfig: (c) => c?.memory?.embeddingDims ?? 2048,
    validate: (v) => Number.isInteger(v) && v >= 64 && v <= 8192,
    describe: 'Dimensions kept from the memory embedding via Matryoshka truncation (+renormalize). 2048 now (pgvector-friendly via halfvec); raise toward the native dim if recall needs more fidelity. Must stay consistent — changing it invalidates existing memory vectors.',
  },
  'memory.embeddingNumCtx': {
    fromConfig: (c) => c?.memory?.embeddingNumCtx ?? 2048,
    validate: (v) => Number.isInteger(v) && v >= 128 && v <= 32768,
    describe: "num_ctx cap for the embedding model on memory embeds. The embedder's DEFAULT window is huge (qwen3-embedding:4b loads ~10GB VRAM, evicting the chat model → reload thrash); memory inputs are short, so a small cap (default 2048 ≈ ~3-4GB) lets it coexist with the chat model. Inputs longer than this are truncated (fine for semantic recall).",
  },
  'memory.messageEmbeddingNumCtx': {
    fromConfig: (c) => c?.memory?.messageEmbeddingNumCtx ?? 8192,
    validate: (v) => Number.isInteger(v) && v >= 512 && v <= 32768,
    describe: "num_ctx for embedding whole MESSAGES into Conversation Search's dense arm — separate from memory.embeddingNumCtx, which is sized for memory content. ⚠️ MEASURED 2026-08-03: memories max out at 312 chars (~78 tokens, 26x headroom under 2048), but messages do not — of 645 embed-eligible messages 21 were TRUNCATED, the longest being 87,400 chars (~21,850 tokens). One knob was serving two workloads with wildly different appetites, sized for the small one, and the clipping is SILENT: a truncated embedding still returns a perfectly valid-looking vector, so the dense arm was matching on the first ~8k chars of long messages with nothing reporting a problem. 8192 covers all but the extreme tail; raising it costs VRAM/RAM on the embedder only while a backfill runs.",
  },
  'memory.embeddingKeepAlive': {
    fromConfig: (c) => c?.memory?.embeddingKeepAlive ?? '30m',
    validate: (v) => typeof v === 'string' && /^(-?\d+)([smh])?$/.test(v),
    describe: 'Ollama keep_alive for the embedding model — keeps the small embedder resident so recall/capture never reload it (~5-7s each). "-1" = never unload, "30m" = 30 minutes, "0" = unload immediately.',
  },
  'memory.embeddingDevice': {
    fromConfig: (c) => c?.memory?.embeddingDevice ?? 'cpu',
    validate: (v) => v === 'cpu' || v === 'gpu',
    describe: "Where the memory embedding model runs (Ollama-kind). 'cpu' = num_gpu:0 → 0 VRAM, so the WHOLE GPU stays free for the chat model's context (the 4B embedder runs on CPU in ~1-2s, and memory writes are async/off the turn's critical path, so the cost is hidden). 'gpu' = resident on GPU (~4GB VRAM, sub-100ms). Default 'cpu' — favors max chat context; flip to 'gpu' if recall latency matters more than context headroom.",
  },
  'memory.extractModel': {
    fromConfig: (c) => c?.memory?.extractModel ?? 'ollama/gemma4:e4b',
    validate: (v) => typeof v === 'string' && MODEL_ID.test(v),
    describe: 'Model that extracts durable facts from a turn for memory (Phase 2b reconcile). Runs off the hot path (fire-and-forget). A small/fast model is fine; it loads alongside the chat model (VRAM/latency tradeoff).',
  },
  'files.scanner': {
    fromConfig: (c) => c?.files?.scanner ?? 'off',
    validate: (v) => typeof v === 'string' && /^[a-z0-9-]{1,32}$/.test(v),
    describe: "Malware scanner for uploaded files, run on the decoded buffer BEFORE any parser touches it (app/files/scan.js). 'off' (default) is a genuine no-op — not a scanner that always returns clean, because then \"disabled\" and \"scanned, nothing found\" would look identical in the logs. Uploaded bytes are never written to disk or executed and only extracted TEXT is persisted, so this does not defend against a virus RUNNING here; it stops the platform acting as a carrier. Selecting a name with no registered implementation fails CLOSED (see files.scanFailClosed) rather than pretending to scan. 'clamav' is a documented slot, not yet implemented.",
  },
  'files.scanFailClosed': {
    fromConfig: (c) => c?.files?.scanFailClosed ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'When a scanner IS configured but unreachable or erroring, reject the upload (true, default) or let it through unscanned (false). True is the security-correct choice: if you asked for scanning, "could not scan" means "not allowed", otherwise a scanner outage silently becomes an unscanned-upload window. Set false only when availability genuinely matters more than assurance.',
  },
  'memory.extractDevice': {
    fromConfig: (c) => c?.memory?.extractDevice ?? 'cpu',
    validate: (v) => v === 'cpu' || v === 'gpu',
    describe: "Where the fact-extraction model runs (Ollama-kind) — same lever and same measured reasoning as memory.embeddingDevice/resolverDevice. 'cpu' = num_gpu:0 → 0 VRAM, so an aux call can never evict the chat model. MEASURED on 2x16GB: a GPU-placed aux model does not fit beside a 26.5GB chat model, so Ollama evicts it and the user's NEXT turn pays ~29s. Extraction is fire-and-forget off the hot path, so its own latency is invisible while that stall is not. Matters more since fallback-only capture made this fire on ordinary turns. 'gpu' only when the chat model is small enough to co-reside.",
  },
  'memory.extractKeepAlive': {
    fromConfig: (c) => c?.memory?.extractKeepAlive ?? '5m',
    validate: (v) => typeof v === 'string' && /^(-?\d+)([smh])?$/.test(v),
    describe: 'Ollama keep_alive for the extraction model. 5m covers a burst of captures within one conversation without holding RAM all afternoon. On CPU this is a RAM budget, not a VRAM one: measured on a 32GB box, three aux models at 30m came to 18.5GB resident (95% used), which is why this is 5m and not 30m. ⚠️ THAT CEILING IS GONE — 64GB since 2026-08-05, where the same fleet leaves 27.2GB free — so residency is no longer the binding constraint here. And the cost depends on WHICH model memory.extractModel names, not on the default: gemma4:e4b is ~9.4GB resident and 13.2s cold, qwen3.5:9b is ~6.1GB and 4.8s. Read the live value before quoting a cost. "-1" = never unload, "0" = unload immediately.',
  },
  'memory.extractEnabled': {
    fromConfig: (c) => c?.memory?.extractEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'When on, each captured turn is distilled into atomic facts (update-not-append) via memory.extractModel. Off = raw episodic capture only (no per-turn extraction LLM call).',
  },
  'memory.consolidateEnabled': {
    fromConfig: (c) => c?.memory?.consolidateEnabled ?? false,
    validate: (v) => typeof v === 'boolean',
    describe: 'When on, the daily maintenance pass runs Phase-3 consolidation: cluster each scope\'s episodic memories and merge topic clusters into living Knowledge Cards (kind=card), archiving the originals (soft). OFF by default — opt in once comfortable; a manual admin trigger (POST /admin/memories/consolidate) lets you try it first.',
  },
  'memory.consolidateModel': {
    fromConfig: (c) => c?.memory?.consolidateModel ?? 'ollama/gemma4:e4b',
    validate: (v) => typeof v === 'string' && MODEL_ID.test(v),
    describe: 'Model that induces Knowledge Cards from clustered episodic memories (Phase 3 consolidation). Runs off the hot path (scheduled/manual). A small/fast model is fine.',
  },
  'memory.consolidateDevice': {
    fromConfig: (c) => c?.memory?.consolidateDevice ?? 'cpu',
    validate: (v) => v === 'cpu' || v === 'gpu',
    describe: "Where the Knowledge-Card consolidation model runs (Ollama-kind) — the same lever and the same measured reasoning as memory.extractDevice / resolverDevice / embeddingDevice. ⚠️ ADDED 2026-08-03: consolidation was the ONLY aux path with no device control and the only one left on GPU, so `POST /admin/memories/consolidate` would evict the chat model and make the user's next turn pay ~29s to reload it. Inert while memory.consolidateEnabled is false, but the manual trigger works regardless. Default 'cpu' (num_gpu:0, 0 VRAM) to match every other aux path; 'gpu' only when the chat model is small enough to co-reside.",
  },
  'memory.consolidateMinSize': {
    fromConfig: (c) => c?.memory?.consolidateMinSize ?? 4,
    validate: (v) => Number.isInteger(v) && v >= 2 && v <= 50,
    describe: 'Minimum related episodic memories in a topic cluster before it is consolidated into a Knowledge Card. Lower = more aggressive summarization; higher = only strong topics.',
  },
  'memory.consolidateThreshold': {
    fromConfig: (c) => c?.memory?.consolidateThreshold ?? 0.55,
    validate: (v) => typeof v === 'number' && v >= 0.3 && v <= 0.95,
    describe: "Cosine similarity threshold for grouping episodic memories into a topic cluster before consolidation into a Knowledge Card. Measured on real (non-paraphrastic) memories: same-topic pairs sit ~0.51-0.72 (mins can dip to ~0.51-0.60), different topics stay <0.40 — so the old 0.82 clustered NOTHING (consolidation never fired), and 0.6 can leave a borderline same-topic member as a singleton. 0.55 groups same-topic reliably while staying well above the ~0.40 cross-topic ceiling; lower = more aggressive (risk of merging topics), higher = under-consolidates. Precise tuning belongs to the Card Eval harness.",
  },
  'memory.auxNumCtx': {
    fromConfig: (c) => c?.memory?.auxNumCtx ?? 8192,
    validate: (v) => Number.isInteger(v) && v >= 512 && v <= 131072,
    describe: "num_ctx cap for the memory AUX LLMs (extract · consolidate · reflect) — like memory.embeddingNumCtx but for the generative side. Their inputs are small (one turn / one cluster), but at their full trained window they load large and compete for VRAM with the chat model. ⚠️ MEASURED 2026-08-03 over 543 real user messages: avg 97 chars, p95 349, p99 1058, LARGEST EVER 5,823 (~1,456 tokens). Nothing has ever come close to overflowing 8192 — the window is roughly 5x oversized, and the KV cache is RAM you are paying for. 4096 still leaves 2.6x headroom over the largest input on record. (An earlier version of this note claimed these are NOT run on CPU; that predated memory.extractDevice and is wrong — extract and reflect both run on CPU today, only consolidate does not.)",
  },
  'memory.embedMessagesEnabled': {
    fromConfig: (c) => c?.memory?.embedMessagesEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: "When on, the daily maintenance pass incrementally embeds new user/assistant messages (≥50 chars) into txn_message_embeddings so Conversation Search's dense arm (CS2 hybrid) stays fresh without a manual backfill. Off the hot path, bounded per pass, resumable. Uses the SAME embedder as memory (memory.embeddingDevice/KeepAlive — CPU by default, so no VRAM cost). Turn OFF if you don't use Conversation Search: hybrid search then silently degrades to lexical-only for un-embedded messages.",
  },
  'memory.conversationContextEnabled': {
    fromConfig: (c) => c?.memory?.conversationContextEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: "PASSIVE Conversation Search (CS3): when on, each turn retrieves a FEW hybrid-matched excerpts from the user's earlier conversations and offers them to the Context Composer as scored evidence candidates (section 'conversation', low weight) — the model gets relevant past context without having to call the search_conversations tool. Conservative by design (see memory.conversationContextMax); framed as EVIDENCE, not knowledge, and never THIS chat's history. Gated by the conversation's memory master switch and NEVER runs for incognito chats. Off = tool-only retrieval (the search_conversations tool still works).",
  },
  'memory.conversationContextMax': {
    fromConfig: (c) => c?.memory?.conversationContextMax ?? 2,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 6,
    describe: 'Max passive Conversation-Search evidence excerpts offered to the Composer per turn (CS3). Kept small on purpose — this is a gentle nudge of relevant past context, not a history dump; the Composer still budgets them against everything else and may keep fewer. 2 by default.',
  },
  'memory.personaNotesEnabled': {
    fromConfig: (c) => c?.memory?.personaNotesEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: "L3 Persona Notes (Reflection): when on, the persona's own kept operational notes (kind='note' memories — 'what have I learned that helps me work with this user?') are offered to the Context Composer as scored candidates and, when kept, injected before history. Read-path master switch — inert until the Reflection Feature (R2) writes notes. Gated by the conversation's memory master switch too, so memory-off / incognito chats show no notes. Off = the L3 layer is never injected.",
  },
  'memory.personaNotesMax': {
    fromConfig: (c) => c?.memory?.personaNotesMax ?? 5,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 20,
    describe: 'Max L3 Persona Notes offered to the Composer per turn. Small — L3 is a handful of sticky notes, not a knowledge base; the Composer still budgets them against everything else. 5 by default.',
  },
  'memory.auditRetentionDays': {
    fromConfig: (c) => c?.memory?.auditRetentionDays ?? 365,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 3650,
    describe: "How long memory-audit entries (log_memory_changes) are kept. 0 = FOREVER. ⚠️ Deliberately separate from logs.retentionDays and much longer: this table answers \"where did my belief go?\", and the loss that created it went unnoticed for two days — at a 30-day window any belief lost 31 days ago becomes unexplainable again. The rows are tiny and rare (only transitions that REMOVE or REPLACE a belief, never ordinary captures), so the storage pressure behind aggressive request-log pruning does not apply. Note that after a HARD delete the audit entry is the only surviving copy of what was destroyed, so shortening this discards evidence, not noise.",
  },

  // ── Memory DECAY (nightly archive/demote) ────────────────────────────────────────────────────────
  // These were defaults baked into memoryDecayPlan's signature with nothing passing them — load-bearing
  // constants with no knob, and no record when the pass removed something. Both fixed 2026-08-03.
  'memory.decayEnabled': {
    fromConfig: (c) => c?.memory?.decayEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Nightly memory decay: soft-archive never-recalled old noise and demote idle memories to the cold tier. Off = memories are only ever removed deliberately (by you or the model). Every archive it performs is recorded in the memory audit trail with the rule that took it, and is restorable — decay is soft, never a hard delete.',
  },
  'memory.decayArchiveDays': {
    fromConfig: (c) => c?.memory?.decayArchiveDays ?? 30,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 3650,
    describe: 'How old (days since creation) a memory must be before the nightly pass may archive it. Only ever applies to memories that were NEVER recalled (access_count 0), are not pinned, and are at or below memory.decayImportanceMax. 30 by default.',
  },
  'memory.decayColdDays': {
    fromConfig: (c) => c?.memory?.decayColdDays ?? 14,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 3650,
    describe: 'How long (days) a memory can go unrecalled before it is demoted to the cold tier. Tiering ONLY — a cold memory is still believed and still recallable, it just ranks lower. Nothing is removed by this. 14 by default.',
  },
  'memory.decayImportanceMax': {
    fromConfig: (c) => c?.memory?.decayImportanceMax ?? 3,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 10,
    describe: "Highest importance the nightly archive rule may touch. ⚠️ At the default 3, EXTRACTED FACTS ARE EFFECTIVELY IMMUNE — the extractor scores facts 6-8, so decay can only reach episodic prose and unscored rows. That is intentional (facts should not rot silently), which makes raising this far more consequential than it looks: at 6 the pass starts archiving real, merely-unused facts. 0 = only unscored memories.",
  },

  // ── Memory V3: the RESOLVER CHAIN (RFC_MEMORY_SLOT_RESOLVER §15) ──────────────────────────────────
  'memory.resolverModel': {
    fromConfig: (c) => c?.memory?.resolverModel ?? c?.memory?.extractModel ?? 'ollama/gemma4:e4b',
    validate: (v) => typeof v === 'string' && MODEL_ID.test(v),
    describe: "Model the SLOT RESOLVER uses to adjudicate ambiguous concept matches (the gray zone). Deliberately SEPARATE from memory.extractModel: extraction PARSES observations out of text, the resolver ADJUDICATES whether two phrasings mean the same property — different responsibilities that may want different models later. Defaults to memory.extractModel. Answers are one word, so the call is tiny (max_tokens 8).",
  },
  // ⚠️ 5m, NOT 30m. CPU placement means keep_alive holds SYSTEM RAM, and 30m across three aux models measured
  // 18.5GB resident on a 32GB box — 95% used, 1.7GB free, which is worse than the GPU eviction it was avoiding
  // (at that level the OS pages and everything slows, chat included). The original 30m assumed residency was
  // free because it was not VRAM; it is not free, it is just a different budget. The resolver fires only on
  // gray-zone hits, minutes or hours apart, so a long window rarely coalesces anything — it only holds memory.
  //
  // ⚠️ BOTH HALVES OF THAT REASONING HAVE SINCE EXPIRED — re-checked 2026-08-06. Keep 5m, but do not cite it:
  //   1. The 32GB ceiling is gone. 64GB since 2026-08-05, and the same aux fleet that left 4.9GB free now
  //      leaves 27.2GB. Residency is still a budget; it is no longer the binding one.
  //   2. "hits are hours apart, so a long window coalesces nothing" assumed the resolver has its OWN runner.
  //      resolverModel DEFAULTS TO extractModel, and both were ollama/qwen3.5:9b when this was checked — ONE
  //      shared runner, so the frequently-firing extractor keeps it warm for the rare resolver at no extra
  //      cost, and this setting is close to inert. It only bites when the two point at DIFFERENT models.
  // Which is the reason this note exists at all: a comment that justifies a number from measured hardware is
  // only true for that hardware and that configuration. Read the LIVE settings before quoting either premise.
  'memory.resolverKeepAlive': {
    fromConfig: (c) => c?.memory?.resolverKeepAlive ?? '5m',
    validate: (v) => typeof v === 'string' && /^(-?\d+)([smh])?$/.test(v),
    describe: 'Ollama keep_alive for the resolver model — keeps the adjudicator loaded so a burst of gray-zone cases pays the load ONCE (measured: 12s cold, then ~0.7-3s warm). "-1" = never unload, "30m" = 30 minutes, "0" = unload immediately. Only safe to hold indefinitely alongside a large chat model when resolverDevice is "cpu" (see below) — on GPU, keeping the adjudicator resident is what EVICTS the chat model.',
  },
  'memory.resolverDevice': {
    fromConfig: (c) => c?.memory?.resolverDevice ?? 'cpu',
    validate: (v) => v === 'cpu' || v === 'gpu',
    describe: "Where the gray-zone adjudicator runs (Ollama-kind) — the SAME lever as memory.embeddingDevice, and for the same reason. MEASURED on 2x16GB with a 26.5GB chat model resident: 'gpu' answers in ~391ms warm but the adjudicator's 5.6GB does NOT fit, so Ollama EVICTS the chat model — and the user's next turn pays ~29s to reload it. 'cpu' (num_gpu:0) answers in ~0.7-3s at 0 VRAM with the chat model untouched. Adjudication is fire-and-forget on a serial background queue, so its own latency is NOT on the user's turn while the eviction it causes IS. Default 'cpu': trade invisible latency for visible stalls, never the reverse. 'gpu' is right only when the chat model is small enough to co-reside.",
  },
  'memory.resolver.grayZoneMode': {
    fromConfig: (c) => c?.memory?.resolver?.grayZoneMode ?? 'off',
    validate: (v) => ['off', 'shadow', 'on'].includes(v),
    describe: "Gray-zone adjudication mode. Cosine ranges OVERLAP (a genuinely SAME slot measured 0.744 while genuinely DIFFERENT slots measured 0.856), so no threshold separates them — but the ambiguous BAND is narrow, and that is where one aux-LLM call is affordable. 'off' (default) = never call the LLM; resolution is pure cosine/alias/lexical, zero added cost. 'shadow' = adjudicate inside the band, LOG + COUNT the verdict, but return the cosine result UNCHANGED (no behaviour change) so you can measure fire-rate/agree-rate/cost/latency on real traffic first. 'on' = the verdict is authoritative. Alias cache promotion is NOT enabled in any mode yet. Read memory.resolver.* telemetry (GET /v1/admin/memories/resolver-telemetry) before flipping to 'on'.",
  },
  'memory.resolver.slotSemThreshold': {
    fromConfig: (c) => c?.memory?.resolver?.slotSemThreshold ?? 0.85,
    validate: (v) => typeof v === 'number' && v > 0 && v <= 1,
    describe: "Cosine at or above which the SEMANTIC arm resolves a slot BY ITSELF, with no adjudication. This is the knob that decides how much of the gray band the cheap arm keeps for itself: the gray-zone LLM only runs when cosine FAILED to resolve, so anything at or above this number never reaches the adjudicator. ⚠️ RAISED FROM 0.80 TO 0.85 (2026-08-03) after three real bad merges on root's memory landed at 0.82/0.84/0.84 — all auto-resolved by cosine, none ever shown to the qualified adjudicator, and one of them silently displaced 'user's role: root of Ote's LLM Services platform' (importance 10, recalled 109×). The measured different-slot high is 0.856 ('favorite word' vs 'favorite letter'), so 0.80 was demonstrably inside the region where cosine cannot tell concepts apart. At 0.85 the 0.80-0.85 slice now goes to the adjudicator instead (measured 0 false merges) at the cost of more aux calls. Set it back to 0.80 to restore the old cheap-but-wrong behaviour; only meaningful while grayZoneMode is not 'off' — with the chain off, this is simply the merge threshold and a HIGH value is the safe one.",
  },
  'memory.resolver.grayZone.min': {
    fromConfig: (c) => c?.memory?.resolver?.grayZone?.min ?? 0.70,
    validate: (v) => typeof v === 'number' && v > 0 && v <= 1,
    describe: "Lower bound of the gray band. Below this, a cosine miss is trusted as a genuinely NEW concept and no LLM is asked. Default 0.70 sits just under the measured same-slot low (0.744 — the real 'favorite drink' vs 'coffee order' failure). A DEFAULT, not a constant: re-measure when the embedder changes (the coffee scenario in the memory eval prints the live number).",
  },
  'memory.resolver.grayZone.max': {
    fromConfig: (c) => c?.memory?.resolver?.grayZone?.max ?? 0.85,
    validate: (v) => typeof v === 'number' && v > 0 && v <= 1,
    describe: "Upper bound of the gray band — above it, a cosine miss is treated as a genuinely new concept and no LLM is asked. Keeping it just above the measured different-slot high (0.856) means adjacent-but-distinct slots get adjudicated rather than silently rejected. ⚠️ Read together with memory.resolver.slotSemThreshold: the adjudicator only sees scores where cosine FAILED to resolve, so the band that actually reaches the LLM is [min, slotSemThreshold). While slotSemThreshold sat at 0.80 this ceiling was largely dead space, which is how three bad merges at 0.82-0.84 were decided by cosine with the adjudicator enabled and never consulted. A DEFAULT, not a constant.",
  },
  'memory.resolver.tieThreshold': {
    fromConfig: (c) => c?.memory?.resolver?.tieThreshold ?? 0.02,
    validate: (v) => typeof v === 'number' && v >= 0 && v <= 0.5,
    describe: 'Near-tie epsilon: when two candidate slots score within this of each other the match is ambiguous even if the best score is outside the gray band. Reserved for the multi-candidate case; the single-nearest path does not use it yet.',
  },
  'memory.reflectMode': {
    fromConfig: (c) => c?.memory?.reflectMode ?? 'off',
    validate: (v) => ['off', 'shadow', 'on'].includes(v),
    describe: "Reflection (L3 Persona Notes) mode for the daily maintenance pass. 'off' (default) = no reflection. 'shadow' = run the pass but WRITE NOTHING — just log the notes it WOULD propose (per scope), so you can inspect quality over a period before trusting it. 'on' = distil + WRITE notes to L3. Reflection distils STABLE OPERATIONAL notes ('how to work well with this user') from grounded signals (semantic facts + Knowledge Cards). Makes LLM calls (loads memory.reflectModel), so it rides only the scheduled daily tick. A manual trigger (POST /admin/memories/reflect, ?dryRun=true) works regardless of mode. Reflection OWNS reinterpretation; Cards own consolidation — they never merge.",
  },
  'memory.reflectModel': {
    fromConfig: (c) => c?.memory?.reflectModel ?? 'ollama/gemma4:e4b',
    validate: (v) => typeof v === 'string' && MODEL_ID.test(v),
    describe: 'Model that distils L3 Persona Notes from grounded signals (Reflection, R2). Runs off the hot path (scheduled/manual). A small/fast model is fine; falls back to memory.consolidateModel then gemma4:e4b.',
  },
  'memory.reflectMaxNotes': {
    fromConfig: (c) => c?.memory?.reflectMaxNotes ?? 20,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 100,
    describe: 'Hard cap on active L3 Persona Notes kept per (persona,user) scope. After each Reflection pass the lowest-priority notes beyond this cap are soft-forgotten (they also ride the normal nightly memory decay). Keeps L3 a bounded set of sticky notes, not an ever-growing pile. 20 by default.',
  },
  'memory.reflectMinSignals': {
    fromConfig: (c) => c?.memory?.reflectMinSignals ?? 4,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
    describe: 'Minimum grounded signals (semantic facts + cards) a scope must have before Reflection runs for it — avoids fabricating operational notes from almost nothing. 4 by default.',
  },
  'memory.episodeDistillEnabled': {
    fromConfig: (c) => c?.memory?.episodeDistillEnabled ?? false,
    validate: (v) => typeof v === 'boolean',
    describe: "When on, the daily maintenance pass runs the EPISODE DISTILLER: each conversation that saw new messages is distilled (one aux-LLM call) into a 1-2 sentence event memory from the persona's perspective (kind=episodic) — 'Ote and I opened the audio arc and found the encoder regression', not the transcript of doing it. Episodes are what Knowledge Cards consolidate (memory.consolidateEnabled) and give the persona 'remember when we…' event memory in their own right. Idempotent via a per-conversation watermark on the row's source tag, so re-runs never distill the same messages twice. OFF by default — seed + inspect via the manual trigger (POST /admin/memories/distill, ?dryRun=true) before enabling. Runs BEFORE consolidation in the tick so tonight's episodes can feed tonight's Cards.",
  },
  'memory.distillModel': {
    fromConfig: (c) => c?.memory?.distillModel ?? '',
    validate: (v) => v === '' || (typeof v === 'string' && MODEL_ID.test(v)),
    describe: "Model the episode distiller uses (nightly, off the hot path, CPU-placed like every aux sibling). Empty (default) = follow memory.extractModel — the distiller rides the same resident aux model as extraction, so it costs no extra RAM. ⚠️ The follow must happen at READ time, in the host: a config-default chain here cannot see extractModel's DB override (found live: extraction ran qwen while the distiller silently defaulted to gemma).",
  },
  'memory.distillMinMessages': {
    fromConfig: (c) => c?.memory?.distillMinMessages ?? 4,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 100,
    describe: "Minimum NEW messages (since the conversation's episode watermark) before the distiller considers a conversation — below this there was no event, just a ping. 4 by default (matches the probe).",
  },
  'memory.workingMemoryEnabled': {
    fromConfig: (c) => c?.memory?.workingMemoryEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: "L4 Working Memory (step 6): when on, the assistant's live per-conversation working set (focus, plan, open questions, active/completed threads — stored on the conversation) is offered to the Context Composer as a scored candidate and, when kept, injected after history. The model maintains it via the update_working_memory tool; the route also lightly auto-seeds a provisional focus from the latest user INTENT. Conversation-local + ephemeral (cleared when the chat goes cold) — orthogonal to the memory master switch / incognito, like the Todo rail. Off = the working-memory block is never injected and the rule/tool guidance is not shown.",
  },
  'memory.composerTelemetry': {
    fromConfig: (c) => c?.memory?.composerTelemetry ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: "When on, each assistant turn stores a compact record of the Context Composer's selection on the message (metrics.context): which providers contributed vs were dropped, each candidate's utility + token cost, and the budget. Enables measuring provider contribution / drop rates and tuning the SECTION_WEIGHT utility weights from REAL usage (aggregate with test/checks/composer-metrics.mjs). Small per-turn overhead; turn off once weights are settled.",
  },
  'memory.workingMemoryIdleDays': {
    fromConfig: (c) => c?.memory?.workingMemoryIdleDays ?? 3,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 90,
    describe: 'Idle-decay window for L4 Working Memory: the daily maintenance pass CLEARS the working set of any conversation with no message in this many days (decay simply clears — it never feeds Reflection or durable memory). Working memory is meant to be short-lived active context. 3 days by default.',
  },
  'chat.toolsEnabled': {
    fromConfig: (c) => c?.chat?.tools?.enabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Whether chat replies may use the installed tools (agent loop)',
  },
  'chat.toolsMaxCalls': {
    fromConfig: (c) => c?.chat?.tools?.maxCalls ?? 8,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 32,
    describe: 'Max tool rounds per reply before the loop stops (1–32)',
  },
  'chat.backgroundGeneration': {
    fromConfig: (c) => c?.chat?.backgroundGeneration ?? false,
    validate: (v) => typeof v === 'boolean',
    describe: 'PLATFORM DEFAULT for leaving a generating chat: OFF = cancel it and save the partial (one at a time); ON = keep it running in the background and allow generating in other chats. Users can override this for their own account (Options → Chat).',
  },
  'chat.backgroundMaxConcurrent': {
    fromConfig: (c) => c?.chat?.backgroundMaxConcurrent ?? 2,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 20,
    describe: 'Max replies one user may have generating at the same time (1–20; root exempt). The composer blocks further sends until one finishes.',
  },
  // Steering: let a user send a mid-generation message the in-flight reply reacts to.
  // B2 (immediate): the running round is cut on arrival — the partial answer is kept
  // as a visible step and the reply continues reacting to the steer. Default OFF.
  'chat.steerEnabled': {
    fromConfig: (c) => c?.chat?.steerEnabled ?? false,
    validate: (v) => typeof v === 'boolean',
    describe: 'Allow "steering" — a message sent while a reply is generating. The in-flight reply is interrupted immediately (its partial text is kept) and continues reacting to the steer; Stop still cancels outright. Off by default.',
  },
  'chat.maxSteersPerReply': {
    fromConfig: (c) => c?.chat?.maxSteersPerReply ?? 5,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 20,
    describe: 'How many times a user may steer a single reply (1–20). Bounds the continuation the steers can drive.',
  },
  // Ollama context window LIMIT — LOCAL models silently truncate at the server's default
  // (measured: 32k on this box) while the models are trained for far more (gemma4:e4b
  // 128k, 26b 256k), so every Ollama request carries an explicit num_ctx on every surface
  // (chat site + OpenAI/Anthropic APIs), clamped per model to its trained maximum.
  // This value is a LIMIT, not the window itself: 0 (the default) = no limit — each model
  // runs at its own maximum (the measured auto-optimize cap when calibrated + lever on,
  // else its trained max). Set a value to cap ALL models at once.
  'providers.ollamaNumCtxLimit': {
    fromConfig: (c) => c?.providers?.ollamaNumCtxLimit ?? c?.providers?.ollamaNumCtx ?? 0,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 1_048_576,
    describe: 'Upper LIMIT on the context window (num_ctx) of every Ollama request; each model still clamps to its trained max and the auto-optimize cap. 0 = no limit — every model runs at its own maximum.',
  },
  // Auto-optimize lever: when ON, each request's num_ctx is capped at that model's
  // MEASURED optimum — the largest window that still fits fully in VRAM (zero CPU spill,
  // which is the performance cliff: qwen3.6:27b measured 21 tok/s with no spill, 13 at
  // 2.7GB spill, 4 at 16GB). Optima come from the Models-console "Calibrate" action;
  // uncalibrated models behave as before. A root value LOWER than the optimum is used
  // as-is — auto only ever downsizes, never raises. num_ctx=0 stays 0 (server default).
  'providers.ollamaAutoCtx': {
    fromConfig: (c) => c?.providers?.ollamaAutoCtx ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Auto-optimize the Ollama context window: cap num_ctx at each model\'s measured VRAM-fit optimum (from Models-page calibration). Only downsizes an oversized providers.ollamaNumCtxLimit — a lower limit is used as-is.',
  },
  // Headroom knob: auto-optimize caps at THIS percent of the measured optimum, so the
  // KV cache doesn't eat every last VRAM byte and other GPU work (vision relay, embeddings,
  // desktop compositing) still has room. Applied at request time — changing it never
  // requires re-calibration. 100 = use the full measured optimum.
  'providers.ollamaCtxOptimalPct': {
    fromConfig: (c) => c?.providers?.ollamaCtxOptimalPct ?? 90,
    validate: (v) => Number.isInteger(v) && v >= 10 && v <= 100,
    describe: 'Percent of the measured context optimum auto-optimize actually uses (10–100). Below 100 leaves VRAM headroom for other GPU tasks; e.g. 90 runs qwen3.6:27b at ~88k instead of its full 98k optimum. Models whose full trained window fits in VRAM are not scaled — their limit is the model, not the GPU.',
  },
  // Anthropic prompt caching: auto-mark cache_control breakpoints on CONVERSATION requests
  // to anthropic-kind providers (system block + last message — the standard chat pattern).
  // The next turn extends the exact prefix, so the whole history reads at 0.1× input price;
  // writes cost 1.25×, which is why one-shot API calls are never marked (pure surcharge).
  'providers.anthropicCacheControl': {
    fromConfig: (c) => c?.providers?.anthropicCacheControl ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Auto-mark Anthropic prompt-caching breakpoints (cache_control) on chat conversations relayed to anthropic-kind providers — history reads at 0.1× input price from turn 2. One-shot API calls are never marked.',
  },
  // Platform embeddings cache: same text + model = same vector (deterministic), so repeats
  // are answered from the DB with NO provider call — the one provider-agnostic cache.
  'embeddings.cacheEnabled': {
    fromConfig: (c) => c?.embeddings?.cacheEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Answer repeated embeddings inputs from the platform cache (exact-match per provider+model+text) instead of re-calling the provider. Deterministic — same input always yields the same vector.',
  },
  // Measured per-model optima keyed "<host>|<model>". Written by calibration; kept as a
  // setting so it persists, survives restarts, and root can inspect/correct it by hand.
  'providers.ollamaCtxOptimized': {
    fromConfig: (c) => c?.providers?.ollamaCtxOptimized ?? {},
    validate: isCtxCalibrationMap,
    describe: 'Measured context optima per Ollama model ({ "<host>|<model>": { ctx, trained, vramGB, measuredAt, fitsFull } }) — the cap providers.ollamaAutoCtx enforces. Filled by the Models-page Calibrate action.',
  },
  // ROOT'S MANUAL per-model ctx cap, keyed "<host>|<model>" (Ote, 2026-08-02). Calibration answers
  // "what is the largest window that fits in VRAM"; this answers "what window do I actually want for
  // THIS model", which is a judgement, not a measurement — you might accept some spill on a model you
  // use for long documents, or hold a model well below its optimum because you run it alongside others.
  //
  // It REPLACES the auto-optimize cap rather than being min'd with it, so root can go ABOVE the measured
  // optimum deliberately (the console shows the recommendation next to the input, and warns when the
  // manual value exceeds it — past the optimum the model spills to system RAM and gets much slower).
  // It is still clamped by the model's TRAINED max, which is physics, not policy.
  'providers.ollamaCtxManual': {
    fromConfig: (c) => c?.providers?.ollamaCtxManual ?? {},
    validate: (v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false
      const e = Object.entries(v)
      if (e.length > 64) return false
      return e.every(([k, n]) => typeof k === 'string' && k.length >= 1 && k.length <= 300
        && Number.isInteger(n) && n >= 1024 && n <= 1_048_576)
    },
    describe: 'Manual per-model context cap ({ "<host>|<model>": tokens }) set by root on the Models page. Overrides the measured optimum for that model (still clamped to the trained max). Empty/absent = use the calibrated value. Setting it ABOVE the optimum is allowed and will spill to system RAM.',
  },
  // APPEND-ONLY calibration history. The map above holds only the CURRENT value and overwrites it on
  // every run, so measuring destroys the previous measurement — which is exactly why a 35% drop in
  // qwen3.6:35b (112,640 → 73,728, 2026-08-01) could not be explained: there was nothing to diff. Each
  // entry carries provenance (ollama version, GPU driver, card count) plus the delta against the last
  // successful run for that model, so a future drift question is answerable from the system rather than
  // from a chat log. Bounded at 300 entries.
  'providers.ollamaCtxHistory': {
    fromConfig: (c) => c?.providers?.ollamaCtxHistory ?? [],
    validate: (v) => Array.isArray(v) && v.length <= 300 && v.every((e) => e && typeof e === 'object' && typeof e.key === 'string'),
    describe: 'Append-only log of every context calibration ({ key, model, ctx, vramGB, loads, measuredAt, ollamaVersion, gpuDriver, gpuCount, delta } per entry). Read-only history for auditing drift — the live optima live in providers.ollamaCtxOptimized. NOTE: Ollama does not expose OLLAMA_KV_CACHE_TYPE / OLLAMA_FLASH_ATTENTION over its API, so those are recorded as null with configNotExposed:true rather than guessed.',
  },
  // Skill trigger (model-invoked skills, the claude.ai pattern): when a conversation has NO
  // bound skill, the system prompt carries a compact catalog (each skill's name+description —
  // the description IS the trigger) and the model may activate one mid-turn via the use_skill
  // tool. Its instructions arrive as the tool result; bundled files stay on demand. A skill
  // whose frontmatter says disable-model-invocation stays out of the catalog. Costs ~100
  // prompt tokens per installed skill per turn.
  'chat.skillTriggerEnabled': {
    fromConfig: (c) => c?.chat?.skillTriggerEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Let the model activate installed Skills on its own (use_skill tool + a skill catalog in the system prompt) when no skill is bound to the conversation',
  },
  // Skill BINDING (user-chosen skills): the ⚙ panel's Skill picker binds a conversation to a
  // skill; OFF hides the picker and the server ignores any bound skill at turn time (the
  // binding stays stored, so flipping back ON restores it). Independent of the trigger above.
  'chat.skillBindingEnabled': {
    fromConfig: (c) => c?.chat?.skillBindingEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Let users bind a conversation to a Skill via the chat ⚙ panel (OFF hides the picker and ignores existing bindings at turn time — nothing is deleted)',
  },
  // Built-in persona component skills root has switched off (registry ids, e.g.
  // "skill.research"). DB skills have their own enabled column; code skills need this
  // because their definition lives in the persona, not a row the console can flip.
  'chat.disabledBuiltinSkills': {
    fromConfig: (c) => c?.chat?.disabledBuiltinSkills ?? [],
    validate: (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.length > 0 && s.length <= 200) && new Set(v).size === v.length,
    describe: 'Built-in persona component skills root has disabled (registry ids) — hidden from the chat picker, slash and trigger surfaces; existing bindings fall back to plain turns',
  },
  // Schedules (Milestone ②, proactive personas): how many scheduled jobs one user may own.
  // 0 disables user scheduling entirely (runtime-internal component triggers are unaffected).
  'chat.maxSchedulesPerUser': {
    fromConfig: (c) => c?.chat?.maxSchedulesPerUser ?? 10,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
    describe: 'Scheduled jobs one user may own (tiers per chat.scheduleRoles). 0 disables user scheduling',
  },
  // WHICH role tiers may create schedules (root always can). Replaces the old hardcoded
  // select_model gate so root decides per tier — including letting members schedule, or
  // locking scheduling down to admins only. Empty array = root only.
  'chat.scheduleRoles': {
    fromConfig: (c) => c?.chat?.scheduleRoles ?? ['admin', 'developer', 'power'],
    validate: (v) => Array.isArray(v) && v.every((r) => ['admin', 'developer', 'power', 'member'].includes(r)) && new Set(v).size === v.length,
    describe: 'Role tiers allowed to create schedules (root always can; empty = root only)',
  },
  // WHICH tiers may use task planning (Todo). Planning is behavior, not a privilege, so
  // the default is EVERY chat tier; narrow it only if a tier shouldn't see the checklist.
  'chat.todoRoles': {
    fromConfig: (c) => c?.chat?.todoRoles ?? ['admin', 'developer', 'power', 'member'],
    validate: (v) => Array.isArray(v) && v.every((r) => ['admin', 'developer', 'power', 'member'].includes(r)) && new Set(v).size === v.length,
    describe: 'Role tiers whose model may use Todo task planning (root always can)',
  },
  // How long an ask_user question HOLDS the turn before it gives up (HumanInteraction, D3):
  // expiry = an honest "no answer" tool result and the model proceeds with judgment.
  'chat.interactionTimeoutSeconds': {
    fromConfig: (c) => c?.chat?.interactionTimeoutSeconds ?? 300,
    validate: (v) => Number.isInteger(v) && v >= 10 && v <= 3600,
    describe: 'Seconds an ask_user question waits for the human before the turn continues without an answer (10–3600)',
  },
  // Time-to-first-token watchdog (Ote's report: Ollama sometimes wedges loading a model —
  // the turn hangs forever). 0 = off. Generous default: a cold 26b load takes a while.
  'chat.firstTokenTimeoutSeconds': {
    fromConfig: (c) => c?.chat?.firstTokenTimeoutSeconds ?? 180,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 1800,
    describe: 'Seconds to wait for a reply\'s FIRST token before giving up on the turn (0 = never; slow generation after the first token is never cut)',
  },
  // Repetition-collapse guard (Ote's report: a small model looping "floating islands and…"
  // into a wall of |||| for thousands of tokens). Cuts the reply and says so honestly.
  'chat.degenerationGuard': {
    fromConfig: (c) => c?.chat?.degenerationGuard ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Cut a reply mid-stream when the model collapses into a repetition loop (the cut is visibly marked, never silent)',
  },
  // Marathon mode (Ote's ask, born from "write a whole book"): when a reply ends with an
  // UNFINISHED working plan (Todo), the platform auto-continues the conversation for up
  // to N rounds. Platform switch here; each conversation still opts in via ⚙.
  'chat.marathonEnabled': {
    fromConfig: (c) => c?.chat?.marathonEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Allow Marathon mode platform-wide (auto-continue a reply while its Todo plan is unfinished; each conversation still opts in via ⚙)',
  },
  'chat.marathonMaxRounds': {
    fromConfig: (c) => c?.chat?.marathonMaxRounds ?? 6,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 20,
    describe: 'Most auto-continue rounds one Marathon may run after the initiating reply (1–20); it also stops on plan completion, no progress, or any error',
  },
  // Floor between skill-turn fires — protects the GPU box from an accidental
  // "every 30s" research loop. Component-internal triggers (heartbeat-class) are exempt.
  'chat.scheduleMinIntervalMinutes': {
    fromConfig: (c) => c?.chat?.scheduleMinIntervalMinutes ?? 5,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 1440,
    describe: 'Minimum minutes between scheduled skill-turn fires (1–1440); creation rejects tighter schedules',
  },
  // Composer slash commands: today `/skill-name message` runs one message as a skill; kept a
  // SEPARATE lever from binding because the / composer surface may grow non-skill commands.
  'chat.slashCommandsEnabled': {
    fromConfig: (c) => c?.chat?.slashCommandsEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Enable composer slash commands (typing "/" in chat — currently /skill-name to run one message as a skill); OFF hides the suggestions and the server ignores slash invocations',
  },
  // Platform defaults for the ⚙ model options a fresh conversation starts with (and the
  // fixed options member-role users always get). Partial object — absent keys keep the
  // built-in defaults (thinking on/low, stream on, memory on, tools on, sampling auto).
  'chat.defaultOptions': {
    fromConfig: (c) => c?.chat?.defaultOptions ?? {},
    validate: (v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false
      const KEYS = ['thinkingEnabled', 'thinkingEffort', 'stream', 'useMemory', 'toolsEnabled', 'temperature', 'top_p', 'max_tokens', 'customInstructions']
      if (!Object.keys(v).every((k) => KEYS.includes(k))) return false
      const boolOk = (x) => x === undefined || typeof x === 'boolean'
      const numOk = (x, min, max) => x === undefined || x === null || (typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max)
      return boolOk(v.thinkingEnabled) && boolOk(v.stream) && boolOk(v.useMemory) && boolOk(v.toolsEnabled)
        && (v.thinkingEffort === undefined || v.thinkingEffort === null || ['low', 'medium', 'high'].includes(v.thinkingEffort))
        && numOk(v.temperature, 0, 2) && numOk(v.top_p, 0, 1)
        && (v.max_tokens === undefined || v.max_tokens === null || (Number.isInteger(v.max_tokens) && v.max_tokens > 0 && v.max_tokens <= 1_000_000))
        && (v.customInstructions === undefined || (typeof v.customInstructions === 'string' && v.customInstructions.length <= 2000))
    },
    describe: 'Platform defaults for the ⚙ model options of NEW chats (thinking on/off + effort, stream, memory, tools, sampling, custom instructions); existing conversations keep their own settings',
  },
  // Which roles may set their OWN default model (Options → Chat) instead of following the
  // platform default. member is excluded by design (fixed model) and root always follows
  // the platform default it controls. Changing chat.defaultModel WIPES personal defaults.
  'chat.personalDefaultModelRoles': {
    fromConfig: (c) => c?.chat?.personalDefaultModelRoles ?? [],
    validate: (v) => Array.isArray(v) && v.every((r) => ['admin', 'developer', 'power'].includes(r)) && new Set(v).size === v.length,
    describe: 'Roles allowed to set a personal default model for their new chats (any of admin/developer/power; empty = locked to the platform default)',
  },
  // ---- Anthropic API surface (Claude Code / Claude desktop app as clients) ----
  'api.anthropic.modelMap': {
    fromConfig: (c) => c?.api?.anthropic?.modelMap ?? {},
    validate: isModelMap,
    describe: 'Routes claude-* ids to platform models (exact id or trailing-* pattern; first match wins). Exact entries are advertised to Claude clients by GET /api/anthropic/v1/models.',
  },
  'api.anthropic.defaultModel': {
    fromConfig: (c) => c?.api?.anthropic?.defaultModel ?? '',
    validate: (v) => v === '' || (typeof v === 'string' && MODEL_ID.test(v)),
    describe: 'Fallback platform model for ids the map does not match; empty = the chat default model',
  },
  'api.anthropic.advertisedModels': {
    fromConfig: (c) => c?.api?.anthropic?.advertisedModels ?? [],
    validate: (v) => Array.isArray(v) && v.length <= 32 && v.every((x) => typeof x === 'string' && /^[\w.:-]{1,120}$/.test(x)),
    describe: 'Overrides which claude-facing ids the models list advertises; empty = derive from the map',
  },
  // ---- self-service accounts (registration + free member->power upgrade) ----
  'auth.registrationEnabled': {
    fromConfig: (c) => c?.auth?.registrationEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Allow visitors to create their own account (starts as member)',
  },
  'auth.selfUpgradeEnabled': {
    fromConfig: (c) => c?.auth?.selfUpgradeEnabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Members may upgrade themselves to power for free (first-phase promo)',
  },
  // ---- security: login/reveal failure rate limits (in-memory counters) ----
  'security.loginMaxAttempts': {
    fromConfig: (c) => c?.security?.loginMaxAttempts ?? 8,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 100,
    describe: 'Failed logins per identifier before lockout',
  },
  'security.loginIpMaxAttempts': {
    fromConfig: (c) => c?.security?.loginIpMaxAttempts ?? 30,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 1000,
    describe: 'Failed logins per IP (across identifiers) before lockout',
  },
  'security.revealMaxAttempts': {
    fromConfig: (c) => c?.security?.revealMaxAttempts ?? 8,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 100,
    describe: 'Failed key-reveal credential checks before lockout',
  },
  'security.rateWindowMinutes': {
    fromConfig: (c) => c?.security?.rateWindowMinutes ?? 15,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 1440,
    describe: 'Sliding window (and lockout duration) for the failure counters, in minutes',
  },
  // Applies to SELF-SERVICE password surfaces (registration + change-password);
  // admin-set passwords are not restricted.
  'security.passwordMinLength': {
    fromConfig: (c) => c?.security?.passwordMinLength ?? 8,
    validate: (v) => Number.isInteger(v) && v >= 4 && v <= 128,
    describe: 'Minimum password length for self-service registration and password changes (4–128)',
  },
  // ---- per-user token limits (metered over usage_logs; prompt+completion tokens) ----
  // Base daily cap + monthly cap are 0 = uncapped; per-user overrides (console Users
  // page) win over these defaults. Root is never limited. Feedback rewards grant
  // +N tokens/day boosts that stack on the daily cap for one month.
  'limits.enabled': {
    fromConfig: (c) => c?.limits?.enabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Enforce per-user token limits on every chat/API surface (root is never limited)',
  },
  'limits.defaultDailyTokens': {
    fromConfig: (c) => c?.limits?.defaultDailyTokens ?? 888_000,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 1_000_000_000_000,
    describe: 'Default tokens (prompt+completion) each user may spend per day; 0 = uncapped',
  },
  'limits.defaultMonthlyTokens': {
    fromConfig: (c) => c?.limits?.defaultMonthlyTokens ?? 0,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 1_000_000_000_000,
    describe: 'Default tokens each user may spend per calendar month; 0 = uncapped (boosts do not raise this)',
  },
  'limits.rewardTier1Tokens': {
    fromConfig: (c) => c?.limits?.rewardTier1Tokens ?? 50_000,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 1_000_000_000_000,
    describe: 'Tier 1 (minor) feedback reward: extra tokens/day for one month',
  },
  'limits.rewardTier2Tokens': {
    fromConfig: (c) => c?.limits?.rewardTier2Tokens ?? 500_000,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 1_000_000_000_000,
    describe: 'Tier 2 feedback reward: extra tokens/day for one month',
  },
  'limits.rewardTier3Tokens': {
    fromConfig: (c) => c?.limits?.rewardTier3Tokens ?? 1_000_000,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 1_000_000_000_000,
    describe: 'Tier 3 (big feature/fix) feedback reward: extra tokens/day for one month',
  },
  // Off (default) = an admin resolving their OWN feedback cannot attach a reward (the
  // no-self-dealing rule; another admin or root must grant it). On = self-reward allowed —
  // for small teams where the admins ARE the main testers. Root can always reward anyone.
  'limits.allowSelfReward': {
    fromConfig: (c) => c?.limits?.allowSelfReward ?? false,
    validate: (v) => typeof v === 'boolean',
    describe: 'Allow admins to reward their OWN feedback when resolving it (off = another admin or root must grant it)',
  },
  // Debug-log retention (log_requests + log_messages — the request logger writes every
  // request, so this is the biggest table in the schema; measured 132k rows before the
  // first prune). 0 = keep forever. No cold storage: these are debug logs, not records.
  'logs.retentionDays': {
    fromConfig: (c) => c?.logs?.retentionDays ?? 14,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 365,
    describe: 'Days to keep server debug logs (log_requests/log_messages) before the daily prune (0 = keep forever)',
  },
  // Usage log retention. 0 = keep forever (no pruning).
  'usage.retentionDays': {
    fromConfig: (c) => c?.usage?.retentionDays ?? 0,
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 3650,
    describe: 'Days to keep usage rows in the live table; 0 keeps them forever',
  },
  // When pruning, first dump the expiring rows to cold storage (gzipped NDJSON files).
  'usage.coldStorage.enabled': {
    fromConfig: (c) => c?.usage?.coldStorage?.enabled ?? true,
    validate: (v) => typeof v === 'boolean',
    describe: 'Dump pruned usage rows to cold storage before deleting (vs. delete outright)',
  },
  // Directory for the dumps, relative to Backend/ (absolute paths also accepted).
  'usage.coldStorage.directory': {
    fromConfig: (c) => c?.usage?.coldStorage?.directory ?? './cold-storage/usage',
    validate: (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 500,
    describe: 'Where usage dumps are written (gzipped NDJSON, one file per pruned month)',
  },
}

export const SETTING_KEYS = Object.keys(SETTING_DEFS)

const cache = new Map() // key -> stored value (only keys that have a DB row)

// Load all rows into the cache. Called once at boot (db plugin); safe to re-call.
export async function initSettings(db) {
  cache.clear()
  const rows = await db.mst_settings.findAll()
  for (const row of rows) {
    if (SETTING_DEFS[row.key]) cache.set(row.key, row.value)
  }
}

// Effective value: DB override if present, else the config.json default.
export function getSetting(config, key) {
  const def = SETTING_DEFS[key]
  if (!def) throw new Error(`Unknown setting '${key}'`)
  return cache.has(key) ? cache.get(key) : def.fromConfig(config)
}

// The config.json default for a key (the baseline "Reset" reverts to).
export function configDefault(config, key) {
  const def = SETTING_DEFS[key]
  if (!def) throw new Error(`Unknown setting '${key}'`)
  return def.fromConfig(config)
}

// Is this value identical to the config.json default? (JSON compare covers the object-valued
// settings — modelMap / advertisedModels — as well as the scalar ones.)
function equalsDefault(config, key, value) {
  try { return JSON.stringify(configDefault(config, key)) === JSON.stringify(value) }
  catch { return false }
}

// All effective values (+ which layer each came from) — the console settings surface.
export function allSettings(config) {
  const out = {}
  for (const key of SETTING_KEYS) {
    out[key] = {
      value: getSetting(config, key),
      source: cache.has(key) ? 'db' : 'default',
      description: SETTING_DEFS[key].describe,
    }
  }
  return out
}

// Validate + upsert one setting. Returns { ok } or { error }.
// When `config` is passed and the value equals the config.json default, this is NOT an
// override — drop any stored row so the setting reads as 'default'. That keeps the
// console's "custom" chip honest: it means "differs from the platform default", not
// merely "was saved from the console". (Saving a whole tab no longer flips every field
// to custom — only the ones you actually changed away from the default.)
export async function setSetting(db, key, value, config = null) {
  const def = SETTING_DEFS[key]
  if (!def) return { error: `Unknown setting '${key}'` }
  if (!def.validate(value)) return { error: `Invalid value for '${key}'` }
  if (config && equalsDefault(config, key, value)) {
    await db.mst_settings.destroy({ where: { key } })
    cache.delete(key)
    return { ok: true, reverted: true }
  }
  const [row, created] = await db.mst_settings.findOrCreate({ where: { key }, defaults: { key, value } })
  if (!created) await row.update({ value })
  cache.set(key, value)
  return { ok: true }
}

// Remove the override -> setting falls back to the config default.
export async function resetSetting(db, key) {
  if (!SETTING_DEFS[key]) return { error: `Unknown setting '${key}'` }
  await db.mst_settings.destroy({ where: { key } })
  cache.delete(key)
  return { ok: true }
}
