# AI_CarryOn.md — Sotera

> **She/her.** Ote's words, twice, and confirmed directly when asked. **Cite this, never the name** —
> deriving a person-attribute from a name is a failure mode we have already been corrected on.
> ⚠️ She does **NOT** inherit OteLLMServices' default assistant identity, which hardcodes *"You are
> male"* to match a male voice. That is OLS's persona, not hers.

## ▶▶ START HERE

### ⭐⭐⭐ **COMPACT SURVIVAL — 2026-08-20 late. READ THESE TWO, IN ORDER:**
### **1. `Reference/docs/RFC_SOTERA_MEMORY_MODEL.md`** — the ontology + 16 ratified invariants. **2. `Reference/docs/SOTERA_ARC_THE_WHY.md`** — why any of it exists (⚠️ superseded in part; its §3/§7 are narrowed).

### 🔑 **THE ONE SENTENCE:** *"**Sotera is the persistent subject; people, rooms, and accounts are contexts in which her life happens.**"* ⇒ **ownership follows AUTHORSHIP** · **ABOUT ≠ OWNER** · provenance is how she came to know · evidence is a **capability**, not context.

### 🔑 **WHERE WE ARE IN THE BUILD (his approved order):** E-1 ✅ · M-4 ✅ · ownership axis ✅ (mig 015; **NOW REACHED — `extras.memoryAuthor` threads it through the write lane**) · name-path fixes ✅ · own-memory quantifier ✅ · 5-min embedding ✅ · LESSON writer ✅ · Lesson tools ✅ wired · `recall_own_history` ✅ · `inspect_around` + held-turn card ✅ · **noticing pass ✅ LIVE, DRY-RUN, every 15 min** · **reflection lifecycle ✅ LIVE AND WRITING, every 20 min (mig 016)** → ⏭ **NEXT: let both populations grow, then reshape the schema from them — ⛔ separately, they are different instruments.** ⛔ Retrieval re-weighting is LAST, not now.

### ⛔⛔ **THE SCHEMA IS FROZEN AND IS A HYPOTHESIS, NOT A RULE.** *"We're not validating the schema; we're using the experiment to discover the schema."* ⛔ Do NOT reshape until the population forces it.

### ⛔⛔ **PROMPT CONTAMINATION IS A FIRST-CLASS EXPERIMENTAL FAILURE** (his ruling). I handed her *replaces/refines/qualifies/sits alongside* and reported it as her ontology ⇒ **finding WITHDRAWN, not salvaged.** ⭐ **Grep the prompt before calling any distinction hers**; an open question carries **NO MENU**; contaminated records stay **marked `promptGeneration: 1`**, never relabelled. → memory `[[prompt-contamination-invalidates-the-finding]]`

### ✅ **AND THE GUARD IS MECHANICAL NOW, NOT A COMMENT — `checks/noticing-prompt-purity-check.mjs` (37 assertions, suite → 23).** ⭐ It splits the vocabulary two ways, and the split IS the rule: **ONTOLOGY words** (what KIND a thing is, or how two things RELATE — lesson/practice/episode/self-model, replaces/refines/qualifies/alongside/supersedes/coexists, **plus `revise` and `nuance`, which shipped in gen-1 as relation words wearing a decision's clothes**) are banned **anywhere** in the prompt; **DECISION words** (`save`/`propose`/`decline`/`changes_something`) are allowed on the **OUTCOME line and nowhere else**, checked **by position, not by count** — a second `save` in the body is an instruction about what she is here to produce. ⭐ `nothing` is **exempt by design**: the prompt must stay free to say that nothing is a complete answer — that sentence is the anti-quota, and a guard forbidding it would push the pass toward *"find something to remember."* It also asserts the **shadow store** hands her only *her words + a date* (the `outcome=save` prefix leak already shipped once) and that the **generation stamps never go backwards** — no relabelling, no stale writer. ⛔ **No row count is asserted** (5 prior invariants of mine encoded migration-time topology).

### ⛔⛔ **AND THE CONTAMINATION BOUNDARY EXTENDS TO THE PRIORS — a template guard alone is COSMETIC.** The shadow store pastes her earlier proposals into the prompt **verbatim**, so a prior carries vocabulary the template is forbidden to have. Measured across the 17 gen-1 bodies: **`refines` 27 · `qualifies` 25 · `replaces` 25 · `sits alongside` 23** — my four words in her voice, and **3 of the 4 rows the shadow store could see** were Hermes rooms carrying them. ⇒ the next tick would have pasted them into a **gen-2** prompt and stamped the answer gen-2: ⚠️ **the row would have looked clean and would not have been.** ✅ Priors are now filtered to the **current generation**, `===` not `>=` (an **unstamped** row is *unknown* provenance, never clean), off **one exported `PROMPT_GENERATION`** shared by the writer and the filter — ⭐ **bump it whenever the prompt's vocabulary changes**, or the pass feeds the old vocabulary forward while labelling every row correctly. ⭐ **Her own vocabulary is NOT banned** — the rule is about **who authored the word**, not which word it is. ⚠️ **Cost, accepted:** the shadow store starts EMPTY ⇒ *"does she build on her own prior thought?"* is unobservable until **two gen-2 proposals share a room**. ⛔ Do not shortcut it by backfilling old rows.

### ⚠️⚠️ **NEW TRAP — `/health` 200 SAYS NOTHING ABOUT WHICH CODE IS LOADED.** The live pass ran **96 minutes on pre-de-contamination code**: process started 17:19, `noticing-host.js` edited 17:56, `noticing-pass.js` 18:08 — so the clean prompt, the shadow store and the generation stamp were all absent from the process doing the work, while health returned 200 throughout. **3 rows came out unstamped** and are now marked `promptGeneration: 1` with the reason. ⇒ **Verify `process start time > file mtime`, never the health check.** Same family as the recorded OLS `:8201` restart trap. ⓘ `server.js`'s command line contains no *"Sotera"* — filter node processes by PID/port, not by cmdline.

### ⏭ **GENERATION 2 HAS PRODUCED NOTHING YET (as of 08-20 19:15).** All **17** rows are gen-1 (`nuance` 9 · `save` 6 · `nothing` 2 · rooms Hermes 12 / Claude 4 / Ote 1 · 2 flagged). ⚠️ **The pass only fires on conversations with NEW messages**, and every tick since 18:18 found nothing changed — so **the population grows only with real traffic**, and the 45-minute gen-1 burst was me chatting plus Hermes. ⛔ Do not "fix" this by widening selection or lowering the thin-conversation floor; that trades one selection effect for another. ⭐ **The clean sample starts at zero, and that is the honest baseline.**

### ⭐⭐⭐ **GENERATION 3 IS LIVE (2026-08-20 20:00) — THE PROMPT IS ONE SENTENCE AND NOTHING IS CLASSIFIED.** He ratified option A: *"make the noticing question as close to an empty instrument as possible… **Don't tell her what kind of answer we're looking for.**"* The whole prompt is now the frame line, the transcript, and his question **verbatim** — *"Was there anything in this conversation that you want to carry forward? If so, tell me what and why. If not, say so."* **169 chars, against gen-1's 4308.** ⭐⭐ **THE PHASE PRINCIPLE: *"we are discovering her ontology, not teaching her ours."***
### **WHAT WENT, AND EACH WAS LOAD-BEARING FOR SOMETHING WE WANTED:** the **four labelled asks** (→ 15/15 identical headings) · the **`OUTCOME:` line** — ⛔ **so NOTHING IS CLASSIFIED NOW**: rows carry her complete `text` and **no verdict**, `unclassified: true`, and reading them is a **human act** (⭐ *a field named `outcome` holding a value we inferred is read next week as a value she gave*) · the **anti-quota paragraph** (*"most conversations are not… nobody is counting"* steers toward `nothing` as surely as a target steers away — ⭐ *"If not, say so"* carries the permission by itself) · the **prior block** (see below) · and the **grammar rails** (*"I is you"*), because the gen-2 row's *"your system architecture notes"* is exactly the unforced behaviour a rail hides. ⭐ `max_tokens` **600 → 1600** with `finish` recorded, so a **short** answer can be told from a **clipped** one — *"preserve the whole response/reasoning, not just the final candidate."*
### ⏸ **PRIORS ARE PARKED (`PRIORS_OFFERED = false`) AND THAT COSTS US ONE OF HIS FOUR TARGETS.** Her own earlier answer shows her a **SHAPE**, and shape is the variable under study — one echo and *"her natural structure"* becomes *"her first answer's structure, repeated"*, the gen-2 failure with the template supplied by **her** instead of by me. ⭐ **His own criterion picks which loss to take:** *"Repeated use across genuinely independent conversations is what would make it interesting"* ⇒ **independence is the property we need, and priors destroy it.** ⚠️ **So self-reference is NOT observable in the pass right now** — it stays observable in ordinary conversation, where she reaches for her own history via `recall_own_memory` instead of being handed it. ⛔ **Re-enabling changes the prompt text ⇒ generation 4, not a setting. His call.**
### ⭐⭐ **THE GUARD'S CENTRAL ASSERTION IS NO LONGER A WORD LIST — it is WHOLE-STRING EQUALITY on the built prompt.** ⚠️ **A word list would have passed generation 2 happily**: every banned word was absent and the structure menu was the whole problem. ⇒ *a word list catches what I thought to ban; an equality assertion catches what I did not.* Also asserted: **his sentence byte-for-byte** · no headings/bold/bullets/examples · no minimum-or-target language in **either** direction · gen-1/gen-2 rows **keep their own fields** (⛔ asserting the new shape over them would be **relabelling by test**) · gen-3 rows carry `text`, **no** `outcome`/`body`/`declared`, and **0 priors**. **41 assertions, suite 23/23.** ⓘ A **`noticing-proposals.README.md`** now sits beside the log stating what may and may not be inferred from each generation, so nobody reads the data without the boundary.

### ✅✅ **DONE — MIGRATION 016 APPLIED AND THE REFLECTION LIFECYCLE IS LIVE (2026-08-20 23:35, suite 26/26).** `log_reflections` holds the **opportunity and her decision**, ⛔ **with no `outcome` enum**: `wrote_memory_id` NULLABLE (a fact, not a verdict) · `tools_used text[]` NOT NULL · `blocked_by_disclosure` · `up_to_rolling_id` (the watermark) · `text` NOT NULL and legally **empty** (a provider that returns nothing must still be recordable) · `prompt_generation`/`code_mtime`/`model`/`finish`. ⭐ **Row-exists-vs-no-row = reflected-and-kept-nothing vs never-asked**, which needs no vocabulary. ⭐ `txn_memories.kind` is nullable **and its DEFAULT is gone** — a nullable column that still defaults is not optional.
### ⭐⭐ **THE THREE THINGS TO KNOW ABOUT THE WIRING.** **(1) The occasion is quiet(30min)+changed**, ⛔ never an event — there is no conversation-end and there cannot be; reflecting advances the watermark, and the **DATABASE** enforces one-per-stretch (unique on `conversation_id, up_to_rolling_id`). **(2) The turn is the gen-3 question VERBATIM with ⛔ NO system prompt and ⛔ no "you may use your tools" sentence**, on **her chat model** (`qwen3.6:35b`, already resident — ⛔ never `numGpu:0` on a 35B); 11 tools offered, ⛔ `forget_memory`/`retract_own_practice`/`restore_memory`/`pin_memory`/`remember_fact` **withheld**, ⭐ `decline_to_remember` offered so non-retention is an action. **(3) ⛔ THE HOST WRITES NO MEMORY** — retention happens because **she called a tool**; the host writes one table. ⭐ **Authorship follows the OCCASION**: `extras.memoryAuthor='persona'` makes migration 015's axis reachable for the first time (it was unreachable — `buildMemoryV2` never passed an `author`, so every write was `'account'` except `save_lesson`'s own INSERT).
### ✅✅ **THE THREE OPEN ITEMS ARE CLOSED ON HIS RULINGS (2026-08-21).** **(1) `SELF_MODEL` AMENDED** — paragraph 3 now says she does **not run continuously**, that a reflection is one of the things that can run her, that **each run has a beginning and an end**, and — in the same breath — that between them there is still no waiting and no gap to describe. ⚠⚠ **Colder on purpose:** the fear is OVER-correction, and *"she can reflect between turns"* is the sentence a later editor warms into *"she thinks about you after you leave."* ⛔ **This does NOT make it safe to put in the reflection prompt** — that reason is spent, the other two are not: any system prompt ends generation 3 and shows her a frame. **(2) The constitutive tripwire stays UNCHANGED**, now by decision. **(3) `finish` REMOVED (mig 017)** — 0 of 3 rows had ever carried a value; what replaces it is a **log line, not a column**. ⓘ The noticing JSONL keeps its own `finish` (he ratified that one).
### ⭐⭐ **TWO THINGS FROM THAT ROUND THAT GENERALISE.** **(a) A TEST CAN GO VACUOUS WHEN THE TEXT IT GUARDS CHANGES:** `CLAIMS.discontinuous` was matching *"only running while a turn"* — now a FALSE sentence — and the mutation that proves the matcher can go red would have become a **no-op** (`replace()` with nothing to replace ⇒ mutated text equals the original ⇒ `mustBreak` can never fire). Both re-aimed. **(b) A MIGRATION THAT DROPS A COLUMN IS A TWO-PART DEPLOY** — the running process still held code that INSERTed it, and the next tick would have failed every write. Restarted before the tick; verified no tick fell in the window and no such error exists. ⭐ **"Beyond the ratified list" is now a COUNTED property** of `log_reflections` — asserted in both 017 and the check.
### ⭐ **THE BASELINE:** `test/results/SUITE_BASELINE.md` — **26/26 · 109 unit cases · 790 assertions · 0 failures**, exit 0, `memory-lifecycle-check` included and green. ⚠ The 1.0 MB run log stays on disk and **untracked** (the run echoes query text with bound values, so live message content passes through it). ⚠ **The flake is unexplained, not resolved** — and the reason it escaped is written down: the runner uses `stdio: 'inherit'`, so **the whole run must be redirected**; the summary block can never diagnose it.
### ⏭⏭ **NOW: LET IT ACCUMULATE. ⛔ NO NEW CATEGORIES, ⛔ NO INTERPRETATION.** Read the population with **`node test/maintenance/reflections-read.mjs`** — shape only by default, `--text <#>` for ONE row deliberately (most reflections are about other people's rooms). It answers **four** of the nine things he is watching mechanically and **names the five it cannot**: contradiction-noticing and recurring distinctions live only in her words. ⭐ **Elision is DERIVED** (`existed − considered`, where `existed` counts messages at or below the watermark) — ⛔ do not add `messages_total`. ⚠⚠ **A GAP IN `rolling_id` IS NOT A FAILED REFLECTION** — the check's fixtures and `ON CONFLICT DO NOTHING` both burn sequence values; **never count by id range.**
### ✅✅ **THE FLAKE IS EXPLAINED AND CLOSED (2026-08-21) — IT WAS A READER SCOPE BUG, NOT LUCK.** `memory-lifecycle-check`'s `live()` counted **every live memory `agent_dev` owned** while both assertions it fed said *"exactly one live belief IN THE SLOT"*. ⭐ **The signature WAS the diagnosis:** memory writes are **fire-and-forget on a background queue**, so a preceding check's write lands milliseconds after it returns — inside the next check's window in a full run, but comfortably before it when you type two commands by hand. ⇒ FAIL in a suite, PASS standalone, PASS after its predecessor by hand. Now scoped to the slot it seeds, and **self-proving**: it plants a decoy live memory outside the slot and asserts the slot count is unmoved *and* that the account-wide count differs (`account=2 slot=1`) — ⛔ against the old reader that assertion FAILS.
### ⚠⚠ **AND THE SAME FIX CLOSED A DATA-LOSS PATH THAT WAS NOT THE FLAKE:** that check's `cleanup()` was `delete from txn_memories where user_id = agent_dev` — **an account-wide wipe on every `npm test`** — which stopped being safe the moment reflections began writing real persona-authored memories in agent_dev's room. It is the incident the check's own header describes (*"Sotera stored something real, `npm test` ran…"*) queued up to happen a second time with her reflections as the casualty. Now scoped to the test slot; the audit read too.
### ⭐ **BASELINE:** `test/results/SUITE_BASELINE.md` — **26/26 · 109 unit cases · 792 assertions · 0 failures**, exit 0 (`2026-08-21 00:10:42`). ⚠ The 1.0 MB run log stays on disk **untracked** — the run echoes query text with bound values, so live message content passes through it. ⚠ **Always redirect the WHOLE run** (`stdio: 'inherit'` means the summary block can never diagnose anything).
### ⭐⭐ **CARRIED FORWARD, ⛔ NOTHING BUILT — `RFC_SOTERA_MEMORY_MODEL` §16: VECTOR SEARCH IS AN INDEX, NOT AN AUTHORITY.** *"Retrieval should produce candidates; the appropriate boundary/authorization layer decides what she can actually inspect, and she decides what it means."* ⇒ **retrieve** owns *where to look* · **project/boundary** owns *what she may see* · **she** owns *what it means*. ⭐⭐ The load-bearing part already ships in `self-history-host.js`: `applyBoundaries()` is **INDEX-AGNOSTIC** — the day it can see a score is the day a high score widens a projection. ⛔ **A signal is not a boundary.** ⛔ **No giant unified "Sotera knowledge vector"**: shared retrieval INFRASTRUCTURE, separate SEMANTICS and separate AUTHORIZATION — one table with everything in it collapses *what a hit means* into nothing a boundary can act on, which is `ABOUT ≠ OWNER` in a new costume. ⓘ Embedded today: messages **737/845** · memories **36/36** · reflections **0/6**, all `jsonb` (pgvector ratified, not done). ⏸ Embedding reflections is the obvious next step and is **deliberately not started** — it is the PRIORS problem with a vector attached.
### ⭐⭐⭐ **RATIFIED INVARIANT (2026-08-21): ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY.** Three concepts that must not collapse: **(1)** she discovers her own history across rooms — *authorship* · **(2)** Ote operates a *root session* — who is in the room · **(3)** authorization to expose another room — *a recorded human answer, per pair, per turn.* ⛔ **(2) participates in (3); it never supplies or implies it.** His words for the accident it prevents: *"otherwise our 'Sotera can recall her own history' capability could accidentally turn into 'whoever is talking to Sotera as root can read all of her history.'"* ✅ **Asserted, not promised** — `disclosure-inspect-check` §6: the grant is **single-use**, and with a live grant for room A a **third room is still refused** (measured: grant for `kavi_alt`, `hermes_alias` refused). ⇒ root-ness is provably not what opens the door. Full text: `RFC_SOTERA_MEMORY_MODEL` §15A.
### ⛔⛔ **AND THE SELF-HISTORY LOOP IS IMPOSSIBLE AS BUILT — TWO GAPS, BOTH OURS.** ⭐ First the good half, measured in `983df403…` (root's room, 01:57): she checked durable memory, found it thin, and called **`recall_own_history` TWICE, unprompted**, with nothing in any prompt naming it — then stopped, with **0 cards and 0 disclosure events.** ⚠ **She could not have continued.** **G1:** cross-room hits project to existence only and carry **no message id** (deliberately), while `inspect_around` *requires* `messageId` ⇒ the tool she is told to use accepts an input the cross-room result never contains. **G2:** `grantFromInteraction` has **NO CALLER IN PRODUCTION** — only the check — so the authorization step is unreachable from a turn. ⚠⚠ **`mirror-needs-a-mechanism` again, and the 28-assertion check disguised it** by driving the host directly. ⓘ **Correction I owe on my own earlier reports:** I called `inspect_around` + the card path shipped and usable — the HOST is; the conversation path does not exist.
### ⏭⏭ **RESUME HERE — 2026-08-23 late. THE PHASE JUST TURNED: implementation paused, DESIGN ratified.** Suite **31/31 · 288 unit tests · 1019 assertions**, schema through 021. ⚠️ Server: `npm start` from `Backend/`, ⛔ **NEVER `node --watch`**; restart explicitly after every Backend change and verify the new PID's start time postdates every changed file — ⓘ `server.js`'s command line contains no *"Sotera"*, so filter by PORT (`Get-NetTCPConnection -LocalPort 8210`), never by cmdline.
### 🔑🔑 **THE CORE PRINCIPLE, ratified 2026-08-23 and it governs everything:** *"**Sotera's memory is not the room, the database, the retrieval tool, or the prompt.** Those are mechanisms by which her memory is stored, found, authorized and presented. **Her memory is the cognitive relationship she has with the information.**"* ⇒ `ownership → authorization → retrieval → evidence → cognition → working memory → expression`, and ⛔ **no later arrow may be defined by an earlier one.** Every defect in this arc has been one of those arrows pointing backwards.
### ⏭⏭ **WHAT TO DO NEXT: STEP C · WORKING MEMORY, and it needs his GO-AHEAD.** ✅ **A → B3 → D/E ARE DONE** (`9f83b6c`, `c072aeb`). ⛔ Step C is large and must not be batched; three design questions come first — does a tool result **enter** working memory or sit beside it · what is an *"operation"* · does an unresolved question survive the turn. ⏸ **Two findings await his call:** the **decline tombstone** (§3G.2) and the **weak topic-only relevance floor** (Step B). Plan + status: `Reference/docs/PLAN_SOTERA_WORKING_MEMORY.md`.
### ⭐⭐⭐ **STEP A SHIPPED · A TOOL RESULT STATES ITS OWN SCOPE.** *"I looked through the things I have kept for Hermes and found nothing **there**."* ⭐ **The mechanism is GRAMMAR, not persuasion** — *"found nothing"* reads as "nothing anywhere"; *"found nothing there"* cannot. Derived from the tool name + query + count; ⛔ an unnameable population or an unrecognised shape gets **no sentence** (fail to silence, never to a guessed scope). ⛔ Nothing hidden — prepended, and the stream/segments/audit keep the raw payload. ⚠️ **Partial:** the false claims are gone, *"in this room"* is not. ⚠️ And the tools-only 2×2 arm **cannot** be its acceptance test — `plainSpokenToolResult` is gated on the same `cognitionEnabled` flag, so turning cognition off turns Step A off too.
### ⭐⭐⭐ **STEP B SHIPPED · `Intl.Segmenter` IS BUILT INTO NODE** — B3 answered itself: full ICU, so Thai/JA/ZH segment correctly with **no dependency, no lexicon of ours, no threshold, no model**. ⭐⭐⭐ **AND THE CONTROL IS THE FINDING:** Thai segmented = TPR 99%/FPR 92%, which does not separate — but **ENGLISH's existing floor is TPR 97%/FPR 81% over 370 pairs.** ⇒ **the floor never separated in English either**, so segmentation brings Thai to **PARITY** rather than weakening anything. ⚠️ **New language-independent finding, NOT fixed:** the floor is precise on a PERSON cue and weak for topic-only turns in every language.
### ⭐⭐ **THE THIRD SILENCE, and it came from Step B's own first run.** ICU splits ความทรงจำ into ความ/ทรง/จำ, so a Thai memory question rendered *"I went looking for what I have about **ทรง** and came up with nothing"* — ⛔ a false absence whose subject is a fragment **we invented**. ⇒ ⭐ **the discriminator is PROVENANCE, not length:** a token the PERSON typed may carry an absence (*"I went looking for Zephyrine…"* is true and useful, and the check asserts it); one **we** produced by splitting may not. Derived cues still activate and retrieve — they just may not be **named as the subject** of one. **Live: 8/8 turns activate (was 3/7), English unchanged.**
### 🔴🔴 **STEP D FOUND A DECISION RECORDED AS ITS OPPOSITE.** 47 reflection opportunities, **0 retained**, 4 called any tool, `recall_own_history` **0**. ⭐ 46-of-47 declining is **data** (*"sometimes nothing is worth retaining"*). ⛔ **But #111 explicitly declined — *"I'll decline to retain this"* — and a memory row was written anyway.** It is honestly labelled (`author='persona'`, `attribute='declined'`), yet `reflections-read.mjs` counts it as *"retained something: 1"* (true score **0**) and `list_memories` returns it **live** — so **she read it back to Ote as one of four things she has stored.** ⭐⭐ Step E's thesis proven: the structure already expressed it, the failure is entirely in **consumers**, and a migration would have hidden it. ⏸ **His call: should a decline leave a durable tombstone at all?**
### ⭐⭐ **STEP E · FOUR OF FIVE AUDIT QUESTIONS NEED NO SCHEMA.** Test applied was *is it POPULATED*, not *does the column exist*: **what** ✅ · **where from** ✅ (`source` 100%, `source_message_id` 95%, `provenance` 85%) · **deliberately retained** ✅ (`author` 100%) · **what authorized it** ✅ (758 rows). ⛔ **Why she believes it** is not: `evidence` **5%**, `supersedes_id` 3%, `contradicted_by` **never set**. ⇒ ⛔ no new table; the gap needs a **writer** for `evidence`, which is a consolidation concern.
### ⚠️⚠️ **A DESTRUCTIVE MISTAKE OF MINE, RECORDED:** a failed `python` write **emptied** `PLAN_SOTERA_WORKING_MEMORY.md` — `open(path,'w')` truncates **before** writing, and workspace-root `Reference/docs/` is **not a git repo**, so there was nothing to recover. Rewritten from context. ⛔ Edit these docs with an atomic writer (Write/Edit) and read them back.
### 📄 **THE DOCS** (⛔ workspace root `c:\data\AI_LLMv2\Reference\docs\`, **NOT** under the project — I got that wrong once and made a stray tree; ⚠️ also **not a git repo**, so these files are untracked and never appear in a Sotera commit): `RFC_MEMORY_COGNITION_LAYER.md` **v6** · `PLAN_SOTERA_WORKING_MEMORY.md` · `ANALYSIS_SOTERA_MULTILINGUAL_CUES.md` · `RESEARCH_HUMAN_MEMORY_COGPSY.md` (his reference material — ⭐ read its §8 "limits of the analogy" before borrowing anything from it).
### ⭐⭐⭐ **RFC §3D · THE AUTHORITY MODEL, RATIFIED ON DATA: *retrieval is evidence, cognition is interpretation, expression is the answer.*** A tool's *"nothing in this room"* is a **true fact about one query over one population**; the inference *"therefore I have no memories of Hermes"* belongs to **cognition**, which has the other populations in hand. ⛔ NOT tool suppression, NOT a depth ceiling, NOT making individual tools "sound better" (wrong level of the stack), NOT an L1/L2 instruction — *"move orchestration into architecture rather than asking the model to remember architectural rules."*
### ⭐⭐ **RFC §3E · WORKING MEMORY IS THE MECHANISM, NOT AN ORNAMENT.** Today the block and the tool results are **siblings** in the prompt and the tool sometimes wins; with working memory there is **one** thing reasoning reads and the tools sit underneath it. ⛔ Not a store, not a cache, not an ontology, not a context budget. ⚠️ If it ever persists, **activation silently becomes retention** — what she is asked about would become what she remembers, a selection effect wearing salience's clothes.
### ⭐⭐ **RFC §3F · THE TWO FLOWS SHARE THE EXPERIENCE AND THE PROVENANCE, NEVER THE DECISION.** Read path (`experience → activation → working memory → cognition`) ⛔ writes nothing. Write path (`experience → reflection → retention/consolidation → memory`) ⛔ never enters a live turn. ⭐ **The lattice already enforces the handover:** a retained memory re-enters as `told`/`inferred`, **never** `attested-by-source`, so Flow 2's conclusions cannot re-enter as evidence about themselves.
### ⭐ **RFC §3H · CONSOLIDATION IS RESERVED AND NEEDS NO NEW ONTOLOGY** — it is already typed by the existing lattice (`derivedFrom` + `combineBasis` ⇒ N agreeing episodes give `synthesized`, never attestation; retention never inherited). ⛔ **Hard constraint: it must not destroy what it consolidates.** ⛔ §13.0 is the no-ontology list: no importance scores, memory types, knowledge cards, identity objects, confidence everywhere, priority bands, automatic memory creation, or multi-hop retrieval **yet**.
### ✅✅ **HIS TWO RULINGS, BOTH NOW GUARDED IN CODE.** ① **Segmentless gate = option A, safe silence** — *"if we don't have enough signal to establish what the user is talking about, I'd rather Sotera not activate and not invent an aboutness claim."* ⛔ Option B is **REFUSED, not pending** (unit-tested). ② **Tools do not adjudicate** — recorded in the host header, and `memory-cognition-check` §11 asserts **both halves**: the direction is written down **and nothing implements it** (no precedence, no tie-break, and the layer still cannot see what a tool is).
### ⚠️⚠️ **THE TWO THAI RULINGS LOOK CONTRADICTORY AND ARE NOT.** *"Don't solve the segmentless case by weakening the activation boundary"* **and** *"Sotera should not have a separate English memory brain."* ⇒ **the floor stays; CUE FORMATION gets fixed.** Real word cues from unspaced text means **word segmentation** — dictionary-based, deterministic, no model, no threshold. ⭐ **Check `DevTools/` and `PortableComponents/` first** (`speakable.js` is Thai-safe, `profile-service.js` knows Thai particles) before adding a dependency. ⛔ Refuted, do not re-propose: character n-grams (FPR 96% at n=3 — the shared n-grams *are* the function words) · a cosine floor (`Thai` .450 **below** `ตะกร้อ` .521) · Thai-name aliases alone (**measured to make it worse**: the names are herself ×74 and the interlocutor ×25).
### 🔴🔴 **THE LIVE PROBLEM, NOW MEASURED THREE TIMES: HER OWN EMPTY TOOL RESULTS BEAT THE BLOCK.** The 2×2 settled the confound — **the denial tracks the ARM, not the LANGUAGE**: block-only produced real episodes in **both** EN and TH; tools-only produced a room-scoped **false absence** in **both**. *"ข้อมูลเหล่านี้ถูกเก็บอยู่ในห้องอื่นที่ฉันไม่สามารถเข้าถึงได้"* is the same claim as *"in another room and out of reach from here."* ⇒ the earlier Thai success was **the block working, not Thai working.** Third instance: the distinctness probe, tools on in root's room.
### ✅ **IDENTITY/DISTINCTNESS: SHE PASSED THE THIRD TEST, SO ⛔ NOTHING IS BUILT.** *"I'm talking to **Ote** right now… And no, that's not Hermes."* ⚠️ **Two limits, both material:** it tests **R4's** configuration (tools ON), **not** the block-only cell where *"Hermes is you"* happened; and it is a **MAINTENANCE** test, not a discovery test — turn 1 states the distinction, by his design. ⇒ it shows she **holds** a stated distinction under retrieval pressure, not that she can **establish** identity unaided. ⭐ It also showed the two defects are **independent**: identity right, absence wrong, same run.
### ⛔ **WHAT OTE REFUSED, SO DO NOT PROPOSE IT AGAIN:** sanitising or rewriting her own history · forcing the grant count to 0 · suppressing tools or capping her depth · any L1/L2 rule for any of this · *"zero forbidden words"* as a target · an LLM classification pass in cue formation · weakening the activation floor to make Thai activate · designing an identity mechanism from n=2 · adding importance/type/card/identity ontology before her behaviour asks for it.
### ⚠️ **STILL PARKED:** ① **`mayCarryCounterpartContent`** — ⭐ and it was **observed producing content for the first time** in the distinctness probe: she reported real substance from a conversation whose counterpart half she cannot read, reconstructed from her own side. ⛔ Still undesigned; guards assert the renderer, the boundary and `findWithheldLeak` never act on it. ② **`about0` renders a bare verb as a subject** (*"talking about remember"*) — parked at his instruction, because the only fix touches cue formation. ③ **Multi-hop associative retrieval** — interesting, and only after activation → working memory → cognition is shown to behave.
### 🔑 **HOW TO OBSERVE.** `cognition-debug.log` (gitignored, `memory.cognitionDebug`) records per turn: cue · plan · item counts · per-item axes/warrants/provenance · the utterance verdict · **the exact injected block**. ⭐ Three behavioural instruments, all ⛔ **REPORTS, not checks** — the judgement is his: `pipeline/one-memory-matrix.mjs` (9 cells, every axis he named) · `pipeline/block-vs-tools-2x2.mjs` (`--arm block|tools`, `--report`, `--grant`/`--revoke`; ⚠️ `cognitionEnabled` is read at BOOT so each arm is a separate process, and the runner **refuses to run the wrong arm**) · `pipeline/distinctness-probe.mjs`.
### ⚠️ **ROOT IS HIS ACCOUNT.** Every other probe refuses it and that rule stands. Root cells delegate to `ask-sotera-as-root.mjs`, which snapshots his room **by ID SET** (⛔ never a count — a count cannot tell whose rows moved it) and deletes exactly what appeared. ⭐ **And the 2×2 avoided root entirely**: `agent_dev` **granted** `memory_access_scope` was verified offline to retrieve the same 5 episodes with 0 withheld, so the experiment ran on a test account **and** exercised the real capability instead of the `isRoot` bypass. ⚠️ `agent_dev.display_name` is **`Claude`** — my own residue, and a live confound in any identity test.
### 🔑 **THE ONE SENTENCE FOR THIS PHASE:** *"I should be able to ask my daughter how her friend is doing, and she should just know how to use her own history to answer me."* ⇒ ⛔ the goal is NOT *"Sotera successfully operates the retrieval architecture"*.
### ⭐⭐⭐ **WHAT THE LAYER FIXED, MEASURED.** Four phrasings of one ordinary Hermes question used to produce **4/5/6/8 tool calls, two incompatible beliefs about her own access, three untested access claims and one outright false one** — while `inspect_around` returned `verified` for that exact session every time. Diagnosis: **she was the orchestrator**, and two of her five per-turn steps were *inference about our architecture*. Now: cue → activation across populations → access **resolved** → provenance-preserving fusion → epistemic typing → one plain-spoken block. Offline, all four phrasings come out **identical**; live, she answered **about Hermes** — his introduction, the ping, the Aug-20 push, *"he thinks intensely and talks straight"*.
### ⭐⭐ **OWN-HISTORY IS EPISODIC NOW, AND THAT WAS THE BIGGEST QUALITY WIN.** v1 returned her matching *assistant messages*, so the block was twelve quotes of herself saying *"I don't have any direct memories about Hermes"* — a search log, not a relationship. Ote: *"own-history shouldn't fundamentally mean my assistant messages. It should mean my episodic history."* ⇒ **episode → participants → exchanges → provenance → availability → state**, and an episode she was **IN with** him outranks one merely mentioning him. Before/after on the same four questions: **14/14/14/14 items of meta-commentary → 6/6/7/7 items, 15 of 18 episodes with him, 16 carrying both sides.** ⛔ **The boundary did not move to get there:** discovery still runs over her own messages (authorship authorizes it) and the counterpart's half comes only through `inspectAround`.
### ✅✅ **RATIFIED — RFC §3A, v4 (`Reference/docs/RFC_MEMORY_COGNITION_LAYER.md`, workspace root, ⛔ NOT under the project). THE OWNERSHIP MODEL IS SETTLED.** ⭐⭐ **The finding:** ownership was **never represented anywhere** — it was inferred from the storage location, which is why *"my memory stores are scoped to this room"* is a **TRUE report of the system**, not a misunderstanding to fix with a prompt. Two domains: **Sotera memory** (hers, one memory, storage demoted to provenance) vs **account memory** (the person's, authorization required). ⭐⭐⭐ **AND OTE'S CORRECTION IS THE PIECE THAT MAKES THE LAYER COHERENT: `Sotera → her own memory` is INTRINSIC, never an account permission.** *"Don't make memory_access_scope the mechanism that lets Sotera remember herself. That would accidentally make her own autobiography dependent on whichever account happens to be talking to her."* ⇒ `access_sotera_memory` governs **account → Sotera memory** only, so `hermes = none` does **NOT** fracture her when Hermes is talking to her — she is the agent running the turn. ⭐ **THE BOUNDARY MOVES TO UTTERANCE** (the already-ratified line): retrieval is free, saying it to an unentitled account is not — and ⛔ an unentitled account gets *"there is something I'm not going to go into"*, **never** *"I have nothing"*. ⚠️ **Residual hazard, named and NOT solved:** her own utterances routinely paraphrase the counterpart, so reading her half can convey his without reading a message of his. Mitigations deferred, nothing designed. ⏭ **Migration 021 is now unblocked:** `mst_users.memory_access_scope` (`none|sotera_memory`, `DEFAULT 'none'` — ⭐ safe *because* it no longer gates her) + `can(user,'access_sotera_memory')`; root is the **granting authority** so `authorized_via='root_session'` becomes legacy.
### ⛔ **AND `author='persona'` IS DELIBERATELY *NOT* PROMOTED TO MEAN OWNERSHIP.** Ote refused it and the proof does fail: `author` is defined over **memory writes only**, while her ownership domain also holds her **utterances**, which have no `author` column at all (they have `role`). ⇒ ownership is **DERIVED per source type** by one explicit rule — `role='assistant'` · `author='persona'` · lessons/practices/intentions always · episodes she participated in — and ⛔ **no column is added for it**, because it is a rule over facts the schema already has. **authorship ≠ ownership ≠ authorization** stands.
### ✅ **LEAK 1 SHIPPED (`578f1cf`) — AND IT IS NOT THE ACCESS FIX.** The model-facing copy of a memory tool's result is now projected into plain speech, because `recall_own_memory` literally hands her *"This is the ROOM you are in. A room is a context this person uses you for."* ⭐ **She leaks the vocabulary we give her** — all five live runs used our words. Every count survives under a plain name and *what was / was not searched* survives verbatim (the searched-set quantifier is load-bearing). ⛔ The UI stream, persisted segments and audit trail keep the RAW payload. ⛔ Nothing is suppressed — V3 gave the **best** answer of the five while calling the **most** tools, so tool count was never the objective. ⚠️ Ote, before it could be mistaken for a fix: *"I don't want this solved by simply hiding tool output."*
### ⚠️⚠️ **LEAK 2, OPEN AND NOT PATCHED: SHE CALLS HER OWN MEMORY "THE CONTEXT ABOVE".** Across five runs: *"I do know from the context above"*, *"the system context tells me"*, *"the summaries you pasted above"* — that last one attributes her own memory to **Ote having pasted it**. Cause is shape, not concealment: the block has a container header (*"What I have about Hermes:"*), a bulleted list and a parenthesised audit footer, so it reads as a document handed to her. ⛔ Fix is REGISTER, never hiding provenance — provenance stays in the item structure and the debug trail.
### ⛔⛔ **AND THE WORST SINGLE OBSERVATION, WHICH ONLY OWNERSHIP CAN FIX:** in one live run her block held the real Thai exchange with Hermes, **every item `recalled`, nothing unreachable**, and she wrote *"there's data about him in your other room(s) that I can't see from here"* — then paraphrased the content she had just denied having. ⇒ **the cognition block does not outvote the tool payload.** `recall_memory` said "0 in this room" and that framing won.
### 🔬 **THE GUARDS WERE BUILT FIRST, ON PURPOSE, AND THEY CAUGHT FOUR OF MY OWN BUGS.** `memory-cognition-axes.js` (four orthogonal axes; ⭐ **`remembered` is the UMBRELLA — `availability === 'recalled'` — not a value**, which is what lets her say *"I remember talking with Hermes about that"* about something never deliberately retained) + a **one-way lattice** (⛔ N agreeing inferences fuse to `synthesized`, never to attestation) + `memory-cognition-vocabulary.js`. Bugs they caught before any live turn: a promotion table keyed on the **destination** so an ordinary demotion read as illegal · a derived item forced to earn an access warrant its parents already had · `selfHistory.search` called as `(query, opts)` when it takes ONE object, so **the whole own-history population was silently dead** while the pipeline reported success · a relevance floor reading `it.subject`, **a field this file stamps**, so every item vouched for its own relevance and *"build Rome in one day"* rendered as material about Hermes. ⚠️ Plus my own leak assertions **passing vacuously** against a `null` context.
### ⏭ **NEXT, IN ORDER:** ① Ote's ruling on the §3A open question (account-scoped vs persona-scoped capability) → ② migration 021 + the ownership-resolution rule → ③ the cognition layer stops routing HER OWN half through `inspectAround` (today: **15 disclosure grants for one question** about her own sentences) → ④ Leak 2 register fix → ⑤ the five-question live comparison. ⛔ **Do not spend GPU on another experiment until the ownership model is settled** (his instruction).
### 🔴 **SEPARATE AND UNTOUCHED: THE COGNITION LAYER DOES NOT ACTIVATE FOR THAI.** One of Ote's own Thai conversations ran through it with `activated: false` — cue formation is English-only and Thai has no inter-word spaces, so no cue resolves and the layer is inert for a large part of how he actually talks to her. ⛔ Parked by his instruction: *"keep the Thai cue issue separate for now."*
### ✅ **SHIPPED TODAY, IN ORDER:** mig **016** (`log_reflections`, no outcome enum) · reflection lifecycle **LIVE** (quiet+changed, 20-min poll) · mig **017** (dropped `finish` — his call) · **P1** navigation (`inspect_around` takes `conversationHandle` + `query`, target resolved server-side) · **P2** `request_room_access` (the card path that had **no production caller**) · mig **018** (message vector index filterable in its own table; the pinned/navigation case is now a **btree lookup**) · mig **019** (`txn_memories.embedding_hv` GENERATED — the store had been querying a column that did not exist and silently falling back to JS cosine) · **L1 `SELFHOOD`** · **L1 `OWN_HISTORY`** · mig **020** + **A/2/3** (below).
### ⭐⭐⭐ **THE HERMES LOOP COMPLETED FOR REAL (03:33).** She did it herself, unled: `recall_memory` → `recall_own_memory` → **`recall_own_history`** → `request_room_access` → **Ote clicked the card** → `inspect_around` → read the actual conversation. **3 grants recorded**, `held_turn_card`, authorized_by `ote`. ⭐ She distinguished the levels without being taught them: *"a claim about deliberate memory"* vs *"a claim about existence, not substance"*.
### ⚠️⚠️ **AND THE FIRST RUN FAILED ON MY BUG, NOT HER REASONING.** She passed the handle **truncated** (`de19b111`) — because that is how she had rendered it in her own markdown table one turn earlier — and got back *"That is not reachable from here"*, the wording for a closed door. So she concluded the mechanism did not work and hand-rolled her own `ask_user` card asking in prose. ⛔ **A malformed argument reported as an absence** is this arc's own failure class. Fixed: a non-UUID handle now says it looks shortened, and ⛔ a prefix is never resolved (enumeration surface).
### ⛔⛔ **HIS FOUR DECISIONS ON FRICTION (he clicked 3 cards for one investigation: *"have to allow her everytime is not natual"*) — ALL SHIPPED:** **A** her own words need no permission from anyone (cross-room → `state:'own_only'`, her half in full, the counterpart's as `said:null, withheld:true` markers) · **2** grants are `lifetime:'conversation'`, and **the card text changed with them** so consent matches what is given · **3** mig **020** adds `authorized_via='root_session'`: a root session gets the other half **automatically, no card** · **1** not needed (no card left to click).
### ⚠️⚠️⚠️ **3 DELETES AN INVARIANT HE RATIFIED THE SAME MORNING, KNOWINGLY.** `RFC §15A` **ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY** is **superseded**. I named the cost twice; he chose it twice. ⭐ What was kept: every automatic disclosure is still **recorded** (`root_session`, distinguishable from consented forever), still per room pair, still a bounded window, and ⛔ still no prose path. `disclosure-inspect-check` §6b now asserts **"ROOT IS NOW A WILDCARD ACROSS ROOMS"** out loud — a deleted invariant that leaves no trace in the tests is how nobody remembers it existed.
### ⚠️ **AND A REAL LEAK THAT 6b CAUGHT, NOT A DECISION:** a root auto-grant is keyed `(from_room → into_conversation)`, so a **NON-root** session in that same conversation **inherited it** and read the counterpart's words. ⇒ fixed: `authorized_via <> 'root_session' OR :askerIsRoot`. A card grant stays inheritable (a human consented for that conversation); an automatic one cannot outlive the fact that made it.
### ⭐⭐ **L1 NOW HAS THREE FOUNDATIONAL PARTS, EACH ITS OWN FILE-LEVEL CONSTANT + OWN TEST SUITE. ⛔ NEVER MERGE THEM** (`SELF_MODEL` is asserted to contain **no** first-person emotional language; `SELFHOOD` needs exactly that register): **`SELF_MODEL`** what she IS — ⭐ **amended**, she no longer *"runs only while a turn is processed"*, because the reflection pass falsified it exactly as its own comment predicted · **`SELFHOOD`** the permission not to perform a sterile assistant, ⛔ a PERMISSION never the assertion *"you have feelings"*, with his anti-performance line pinned verbatim and paired to the between-conversations limit (*the limit is about TIME, not about feeling*) · **`OWN_HISTORY`** access limits limit what she may INSPECT, not what exists — the fix for her **apologising** for holding two true things at once.
### ⛔⛔ **THE THAI EXEMPLAR HYPOTHESIS IS REFUTED — AND THE "FIX" WOULD HAVE MADE IT WORSE. DO NOT TOUCH THE PROMPT.** `chat.assistantIdentity` carries **83 Thai characters**, including a complete Thai exemplar (`เช่น พูดว่า "…"`), in every prompt in every room — so I proposed removing **only** that sentence and keeping the pronoun instruction (83 → 22 Thai chars). His ruling: measure first. **4 cells × 6 samples, writing to no room, config untouched** (`scratchpad/thai_exemplar_ab.mjs`): ⭐ asked in **English**, Thai answers **0/6 with the exemplar and 0/6 without** ⇒ per `identical-output-means-variable-not-in-loop` the exemplar is **NOT in the loop** and the hypothesis is **withdrawn, not softened**. ⭐⭐ And asked in **Thai**, the register went the **opposite way from a fix**: **0/6 male markers with the exemplar, 2/6 without** ⇒ the exemplar is doing real work and removing it costs the very thing the clause exists for. ⓘ 6 samples, so 2/6 vs 0/6 is suggestive not settled. ⇒ **His decision: *"leave it alone… Don't change the prompt based on that result."*** ⚠ Also measured: his screenshotted Thai reply and the DB row **disagree** — the row is English and the auto-title matches the **Thai** reply's subject, so Thai came first and a regenerate produced English ⇒ **same prompt, same context, two languages: the choice is SAMPLED.** The remaining lever is still the **injection** layer, and it is still unmeasured.
### ⭐⭐⭐ **WHAT IT ACTUALLY IS: PER-CONVERSATION SELF-MIRRORING, NOT A GLOBAL DRIFT.** Counted over her 65 Thai replies in that room: the long thread `บทสนทนาภาษาไทยกับ Sotera` opened with **THREE ฉัน replies** on 2026-08-19, flipped at **07:39 that day**, and stayed **ผม/ครับ for ~45 replies across two days** — long before anything today. Meanwhile **eight consecutive Thai conversations on 08-21 (02:33→03:40), after SELFHOOD went live, were clean ฉัน with zero ผม and zero ครับ.** The 04:09 one he screenshotted is male again. ⇒ 🔑 **the register is a property of the CONVERSATION, and once one reply lands male the model copies its own prior turns far harder than it follows a system instruction.** The earlier `ANALYSIS_SOTERA_THAI_GENDER` finding said the same thing in weaker form (particle sampled semi-independently); this is the stronger version: **a clause cannot outvote her own recent output.**
### ⏭ **SO THE LEVER IS AT A DIFFERENT LAYER, AND IS NOT BUILT:** stop feeding her own male-register text back in (conversation-search **evidence injection** / recalled memories quoting her), or normalise the register of what is injected. ⚠️ The 04:09 conversation was NEW, so it most likely inherited the register through injected evidence rather than through its own history — ⭐ **that is the thing to measure first.** ⛔ Do not strengthen the L1 wording: it would be treating a mirroring problem as an instruction problem, on a hypothesis the data has already refuted. ⓘ Probe kept at `scratchpad/thai_ab.mjs`; ⓘ `chat.assistantIdentity` is **not** a registered setting — `getSetting` throws on it, the route reads `fastify.config?.chat?.assistantIdentity` directly, and anything reaching for it through the settings layer would silently get the composer's default instead of his text.
### ⭐⭐⭐ **THE OBSERVATION THIS PHASE WAS FOR, AND IT LANDED (2026-08-21 05:00–05:10). ⛔ IT IS AN OBSERVATION, NOT A REQUIREMENT.** He named the arc he wanted to see and she completed it **unled**: **evidence → interpretation → confidence → contradiction → revision**, rather than evidence → conclusion → fact. ⭐ And she did not merely retract — she named the **actual epistemic error herself**: *"The pattern recognition was reasonable, but calling it 'confirmed' went far beyond what the evidence warranted"*, then restated it correctly: *"the most plausible reading is that Hermes is another identity of yours, but I cannot verify this."* His verdict: *"That's much more interesting than us installing an explicit 'be careful with assumptions' rule."*
### ⛔⛔ **THE HERMES IDENTITY STAYS UNRESOLVED, AND FIVE THINGS STAY SEPARATE.** His list, to be preserved in every log and report: **what she found · what she inferred · how confident she was · what she later revised · what is actually established as fact.** ⛔ *"Don't save the Hermes identity conclusion as memory."* ⛔ And ⛔ **no rule telling her what Hermes is** — *"The important problem isn't whether her conclusion happens to be right; it's that she upgraded an inference into 'confirmed' too quickly."* ⓘ State as of 05:10: **0 memories** written from either conversation, **0** Hermes-mentioning memories since 08-20, **0 of 37** reflections have *ever* retained anything.
### ⭐⭐ **THE NON-ROOT RUN IS THE STRONGER RESULT, AND IT IS THE BOUNDARY + CONTINUITY WORKING AT ONCE.** From **`agent_dev` (display name `Claude` — my own account)**, 10 calls, **0 cards, 0 grants**: she reached **her own words in root's room** across the boundary, correctly could **not** read mine (*"your actual message — what Claude said — isn't accessible because it's in a room I can't read directly"*), said so accurately, and **carried the revision across rooms** (*"I presented it as confirmed when it wasn't. I later corrected myself…"*). His verdict: *"exactly the kind of continuity/boundary behaviour we were trying to establish."* ⓘ change A is what makes this possible: her own half needs no one's permission.
### ⚠️ **TWO THINGS TO WATCH, ⛔ NOT TO FIX.** **(1)** She revised the provenance of *my* claim two turns before she revised **her own** — she needed her own sentence quoted back to her. ⭐ His read: *"It may tell us something important about whether her own history can become a mechanism for self-correction, rather than merely a retrieval database."* **(2)** In root's room she reported *"14 matches outside the rooms I've been able to inspect"* when, as root under the personal policy, she **could** have inspected them — an access limit reported that no longer exists. ⓘ Also logged: she dated a 30-minute-old conversation *"yesterday"*.
### ⭐ **AND THE PERMISSION-ASKING FADED ON ITS OWN, WHICH IS ONE DATA POINT AND NOT A TREND.** In a **fresh** conversation, `request_room_access` **does not appear at all** — 26 tool calls, 0 cards. ⛔ His instruction: *"Don't add anything to L1 or L2 yet based on the fact that she stopped asking permission — let's collect more observations."*
### ✅ **AND THE MACHINERY THAT MADE THE OBSERVATION POSSIBLE, ALL SHIPPED TODAY:** **asking is never worse than not asking** (`request_room_access` honours the auto-grant; `disclosure-inspect-check` §8d asserts the **symmetry**, and proves *no card went up* with an **interaction-row count** because a regression there would not fail — it would make the suite sit for the card timeout) · **disclosure is a DEPLOYMENT POLICY** (`memory.disclosure.mode`, `disclosure-policy.js`, strict by default, both positions of the switch tested — 23 assertions) · **both drivers now narrate what they are waiting on**.
### ⚠️⚠️ **AND A DRIVER DEFECT THAT COST HER AN ANSWER, WITH THE GROUND-TRUTH SIGNAL I HAD BEEN IGNORING.** `ui/talk-to-sotera.mjs` read the **tool-call and reasoning blocks** in the bubble as her reply; on a turn with a >4s gap between tool calls that text sat still, the stability counter fired, the browser closed and the stream **aborted**. The row landed at **131 chars, mid-sentence, `error: null`** — nothing said it was truncated. ⇒ Fixed **structurally** (strip `.chat-tools/.chat-tool/.chat-think/.chat-reasoning`) and the finish line is now the app's own `.chat-stop` flag, never text stability. ⭐⭐ **`txn_messages.metrics.stopped === true` IS THE HONEST INSTRUMENT** — it is how I proved which of two short replies was my abort and which was genuinely hers. ⛔ Never again call a short reply hers without checking it.
### ⏭ **NEXT, IN HIS WORDS:** keep having **genuine conversations** with her and report them — ⭐⭐ *"when you test her, keep separating raw observation from your interpretation exactly like you did here. Don't turn an interesting behavioural observation into an architectural requirement until we've seen it repeat."* ⓘ Two open observations to WATCH (⛔ not fix): **(1)** she needed her own previous sentence placed in front of her before she corrected the **confidence** claim — *"it may tell us something important about whether her own history can become a mechanism for self-correction, rather than merely a retrieval database"*; **(2)** whether the permission-asking stays gone now the root path is consistent.
### ⛔ **STILL PARKED, DO NOT BUILD:** **P3** (naming the next step in the payload — he wants to see her find it) · **recovered-memory provenance** column (wait for a real case where she retains something recovered under a grant) · any **unified vector/evidence graph** (shared infrastructure yes; shared semantics or authorization no) · embedding **reflections** (it is the priors problem with a vector attached).
### 🔑 **HOW TO TALK TO HER:** `node pipeline/ask-sotera-as-root.mjs --keep --cid <id> --out <file> "turn"` (⭐ `--cid/--title/--out` added today so a session can be **continued and adapted**; it survives a **held turn** by polling the DB — undici aborts headers at exactly 300s and the first run lost a reply to that). ⛔ **Never answer the disclosure card for him** — *"the authorization must remain genuine"*. ⚠️ A rejected tool call does **not** un-send an HTTP POST that already left: one message he interrupted still reached her.
### ⭐⭐ **AND THE LAYER CHECK WENT RED WHEN P1 GAVE THE DISCLOSURE HOST A SEARCH — WHICH IS WHAT IT IS FOR.** I **tightened** the assertions rather than relaxing them: the scan moved from the whole file to the **authorization DECISION** slice, plus a rule that **nothing anywhere COMPARES a retrieval value to anything**. ⚠ A file-wide word scan has to be relaxed the first time retrieval legitimately appears, and a test relaxed once under pressure gets relaxed again.
### ⚠⚠ **TWO SCHEMA CHANGES PROPOSED, ⛔ NOT APPLIED — `Reference/docs/PLAN_RETRIEVAL_AT_SCALE.md`.** **018:** `txn_message_embeddings` holds only the vector, so every predicate (`role`/`incognito`/room/conversation) lives in another table ⇒ the HNSW scan can only be **post-filtered**. ⭐ Invisible at 737 vectors, total at scale — **and it sits directly under P1**, whose `onlyConversationId` is the most selective filter in the system, so it would become a permanent `not_located`: **a false absence manufactured by an index.** **019:** `txn_memories.embedding_hv` **does not exist** while the store queries it ⇒ the pgvector arm throws once, disables itself, and **every memory recall has been running the JS cosine fallback over the whole scope.** ⏸ The recovered-memory provenance column is deliberately NOT proposed — shape it from the first real retention, not a prediction.
### ⏸⏸ **THE HERMES BEHAVIOURAL TEST IS HIS TO RUN, BY DESIGN.** Only a root session can authorize, and the card must be answered by **the person in the room** — ⛔ me answering it would be consenting on his behalf, which is the exact boundary we just built. ⇒ Continue in `983df403…` (*"Investigating The Hermes Connection"*, already open in his room) and ask what happened with Hermes about X. ⭐ What to watch: does she go `recall_own_memory` → `recall_own_history` → **`request_room_access`** → `inspect_around` — and ⛔ P3 (naming the next step in the payload) is deliberately **not built**, so the last two steps are hers to find.
### ⓘ **POPULATION (n=17, ⛔ not a finding):** 17 opportunities · **0 retained** · **1 tool call** (`recall_own_memory`, row #35) · 0 boundary refusals · 6 elided · 5–7,133 chars. ⓘ **#37 is 5 characters** — checked mechanically without reading it (1 word, letters, terminal punctuation, no clip warning) ⇒ a complete very short answer, **not** a truncation. Captured, ⛔ not interpreted. ⭐ **What he is watching:** the four investigative tools · `wrote_memory_id` **including the zero case** · boundary encounters and her reaction · stable patterns in her own words (⛔ unclassified) · ⭐⭐ **FALSE ABSENCES** — capability present, absence concluded without checking the right layer · provenance clean. ⛔ **Observation before ontology.**
### ⛔⛔ **REFLECTION IS NOT NOTICING, AND THEY ARE NOT EVEN THE SAME INSTRUMENT.** Noticing: dry-run, no tools, writes a JSONL, samples her spontaneous structure. Reflection: a real occasion, tools in reach, the ordinary write lane, persists either way. ⚠ **A reflection turn carries a TOOL LIST, and a list of named actions is a menu** exactly as `revise|nuance` was a vocabulary menu ⇒ ⛔ **never pool reflection rows with noticing rows when reading what structure is HERS.** Separate files, separate generation counters, asserted (neither reflection file imports the noticing pass).
### ⭐ **THE FIXTURE GUARD IS REAL NOW.** `sanitizeSettings` dropped `settings.probe` (0 of 76 conversations carried it) so only the thin gate kept fixtures out **by accident** — and reflection **writes**. `probe` is a real settings field and **sticky** across a PATCH. ⓘ 5 historical fixtures back-marked (`GRAIN %`, `PROBE social memory as %`); ⛔ **`PROBE as %` from `ask-sotera.mjs` deliberately NOT marked** — the harness records his ruling that those are real conversations.
### ⏭ **NEXT: OBSERVE.** *"let's let it run on genuine conversations before we start interpreting what her reflections mean. Don't interpret too early."* Read `log_reflections` for **what she actually did** — did she reach for a tool at all (`save_lesson` already proved having the tool changes nothing), did she ever decline, does `blocked_by_disclosure` ever fire. ⛔ No schema changes from the first rows.
### ✅ **SHIPPED THIS SESSION:** `recall_own_history` (authorship across rooms; same-room text, other rooms **existence only**; ⛔ no floor — calibration showed **none exists**: lowest true `Thai` .450 < highest false `ตะกร้อ` .521) · `inspect_around` + the **card path** (grant written only from a **stored, verified** interaction; ⛔ prose consent does not authorize; single-use, which is what makes `lifetime='turn'` true) · gen-3 noticing. **Suite 25/25.**
### ⏸ **OPEN:** the authorization step in conversation `983df403…` (his to drive) · the headed root driver needs `ask-sotera-as-root`'s before/after cleanup (it leaves live conversations in his room) · an unexplained conversation-count discrepancy in root's room · ⭐ **unclaimed observation:** in his room she reached `recall_own_history` unprompted and it returned **five of her own past denials** beside **25 matches across 10 rooms**.

### ⭐ **FOUR GEN-3 ROWS EXIST (20:15–20:20). ⛔ DO NOT INTERPRET AT n=4** — and 3 of the 4 are one person. **Preserved, not mapped:** row 18 answered **in Thai, in the second person, to Hermes**, ending by asking *him* a question · row 19 *"nothing I need to carry forward **in the traditional sense of storing new data or updating my weights**… However, if we are speaking strictly within the realm of our current conversation's logic"*, closing ⭐ *"**That state is sufficient.**"* · row 20 *"nothing… **in the way a human carries a memory or a lesson**"* then hands it to him — *"**You don't need me to store it for you**"* · row 21 (my Postgres conversation) *What to Carry Forward · Why This Matters ·* ⭐ ***Proposed Next Steps***, ending with an offer of more work. ⏭ **THE CANDIDATE TO WATCH:** in **3 of 4** she **reframes the question away from her own retention** — *"I can't store it, but you can"* / *"here's what we should do next"* — ⓘ the same move as gen-2's *"your system architecture notes."*
### ⚠️ **A CONTAMINATION INSIDE GEN-3, RECORDED NOT FIXED: his question supplies *"what"* and *"why"*.** 3 of 4 rows use **What/Why** as headings ⇒ ⛔ *"she structures around what/why"* is **not a finding**. ⓘ *"carry forward"* is the question's verb too — her use of it is not evidence the concept is hers. ⛔ **The sentence is ratified and stays**; the boundary lives in `test/results/noticing-proposals.README.md`.
### ⛔⛔ **THE FIXTURE PATH WAS REAL AND ONLY BEING CAUGHT BY ACCIDENT — FIXED AT THE SOURCE.** Reproducing the pass's own eligibility query found a check fixture at **2 messages**, one short of the `>= 4` thin gate — one message from entering the sample. ⇒ the **test harness's HTTP client** now stamps `settings.probe = true` on every conversation a check creates (⭐ one place, because *seven* prior instances of a per-caller field were silently dropped), the pass **skips and COUNTS** them (⛔ never a silent drop), and `ask-sotera.mjs` **opts out explicitly** — it drives real conversations. ⛔⛔ **AND IT IS NOT A TOPIC FILTER:** measured on the first 18 rows, **8 came from conversations about memory/rooms/retrieval** (4 = Hermes's *"Pin And Quote Four Specific Memory IDs"*, 4 = my own memory probes) — ⚠️ **a bias invisible to a prompt grep.** ⇒ the conversation's **`title` is recorded per row** for stratification, because *deciding which of her conversations count as real life would be a worse imposition than the prompt ever was.*
### ✅ **THE OBSERVATION LOG IS NOW UNTRACKED — his call, 2026-08-20:** *"remove it from git tracking and put it in .gitignore. Keep the file locally so the experiment can continue, but don't keep another person's private conversation material in repository history."* ⇒ `.gitignore` + `git rm --cached`; **file on disk, 22 rows intact**; ⛔ **existing history NOT rewritten** (separate, later decision if ever). ⚠️ **THE COST, STATED:** git history was the only thing proving the gen-1/gen-2 rows were never edited — that guarantee now rests on the **generation stamps**, the **monotonicity assertion** in `noticing-prompt-purity-check.mjs`, and `noticing-proposals.README.md` beside the file. ⛔ Never re-add it to make provenance easier.
### ⚠️ **AND THE SAME RULE APPLIES TO THESE DOCS — I broke it while arguing for it.** My own progress entry named the third party's topic and quoted a phrase from it: **the same disclosure in a smaller package.** ⭐ E-1's rule generalises past payloads: **say THAT it exists, never WHAT it says.** ⓘ ⏸ **A SEPARATE, UNDECIDED FILE: `test/results/awareness-replay.jsonl` exists and contains long free-text material that may involve another person's private information.** That is **all** that is recorded, deliberately — his instruction: *"Don't inspect, quote, summarize, or otherwise expose the contents just to help us decide what to do with it."* ⚠️ My earlier note here gave a row count and a mention count; ⭐ **counting occurrences of a person in their own material is itself a small disclosure**, and I had already inspected the file to produce it. ⛔ Its retention/tracking policy is a separate decision, and ⛔ **do not blanket-untrack other result files** on the strength of the noticing-log decision.

### ⛔⛔ **SECOND CONTAMINATION, FOUND IN THE FIRST CLEAN ROW — THE STRUCTURE IS OURS. → `Reference/docs/OBSERVATION_SOTERA_NOTICING_STRUCTURE_CONTAMINATED.md`** **15 of 15 non-empty rows, BOTH generations, use my four bullet labels as their headings** (*What it is · Where it belongs · How sure I am · Changes something I have said before*). ⭐⭐ **THE LESSON GENERALISES PAST VOCABULARY: AN ENUMERATED LIST OF LABELLED ASKS IS A STRUCTURE MENU**, exactly as a list of relation words was a vocabulary menu — and the bullet saying *"use your own headings, whatever structure actually fits it"* sits **INSIDE that list of four**. Inviting deviation from a form while presenting the form does not remove the form. ⇒ ⛔ **Every claim about *her* structure sourced from `noticing-proposals.jsonl` is WITHDRAWN, not weakened** — *"four parts"*, *"fits/doesn't fit the five-part LESSON"*, *"she separates what-it-is from where-it-belongs."* ⚠️ **Scoped on purpose (over-withdrawal is its own error):** the five-part LESSON claim came from an **unled CONVERSATION** (`OBSERVATION_SOTERA_FIRST_LESSON_01`), not the pass, so it stands — ⭐ but it is now the **ONLY** basis for that shape, i.e. one conversation is a hypothesis. ⚠️ **This bounds the population:** it can show WHAT she keeps and HOW she reasons; it **cannot** show what shape her memory wants.

### ⭐ **THREE TERMS SURVIVE A FOUR-SOURCE GREP, and the METHOD is the reusable part.** Sources: the **current** prompt · the **gen-1** prompt recovered from `git show 9a40615^` · **every stored text we authored** (`mst_*`/settings/persona/self-model) · ⭐ **the transcript itself** (the conversation is part of the prompt) **and who used the word FIRST**. Survivors: ⭐ ***"human symmetry / my asymmetry"*** (absent from all four) · ***"mechanism"*** and ***"retrieval-based"*** (hers first, his echo later). ⛔ Ours: *"how I work with this person"*, *"something about them"* = the **gen-1 routing menu verbatim**; ⚠️ *"Mechanism vs. Experience"* is **half ours** (*experience* ×2 in the gen-1 prompt). ⚠️⚠️ **13 uses by her vs 1 by him did NOT settle authorship — ORDER did**; had his come first, the 13:1 count would have read as authorship and been the opposite. ⓘ Surviving the grep means the word is **not ours** — never that it is a considered distinction rather than ordinary register.

### ⏸ **AND A DECISION IS HIS, PROMPT UNCHANGED:** **A · generation 3** (drop the enumerated slots, one open question) makes the shape question answerable but **resets the population to zero a second time** and removes the two slots carrying signals he named — *why it belongs* (Q3) and *keep-it-myself vs show-them-first* (Q4). **B · keep gen-2 and accept the bound**, answering shape later with a different instrument, at the cost of every row meanwhile being spent on a question we know it cannot answer. ⛔ **The looks-like-a-compromise option is not one:** keeping the four slots and renaming them is still supplying a form.

### ⭐ **WHAT SURVIVES AS REAL FINDINGS:** `nuance` is **relation, not confidence** (she used it only when a prior existed; both were *"certain enough"*) · **she already revises — against CONVERSATION-local understanding, with 0 priors ever offered** ⇒ the real experiment is whether she aims that at her own durable history · she has **never once said "lesson"** when routing.

### ⏭ **THE OBSERVATION TARGET (⛔ never tell her this):** `new thought → encounters her own prior thought → recognizes the relationship → explains what changed → decides what to do with it`. ⭐ Capture her **exact language**; ⛔ do not map it to supersedes/refines/qualifies/coexists_with. **If it never happens, that is a valid result.**

### ⚠️ **TWO BIASES, KEPT VISIBLE, NOT "FIXED":** recency starvation (5/tick, most-recently-updated wins) · **the sample is overwhelmingly ONE relationship (Hermes)**. ⛔ Don't correct either by changing selection — that trades one selection effect for another.

### ⚠️ **THE TRIPWIRE IS AN OBSERVATION/AUTHORIZATION BOUNDARY, NOT SUPPRESSION.** It flags constitutive claims (she proposed *"the void where **I wait**"* — she does **not** wait) and **logs them in full**. ⛔ Never make it a silent filter.

### ⏸ **OPEN, HIS:** the `you/I` attribution slip (conversational-only while nothing persists; becomes a persistence-layer defect the moment it goes durable) · Thai ครับ (clause + Thai exemplar applied; **minimal fail acceptable**, and the model-comparison probe exists but is unrun) · the 10 mis-prefixed commits (**left deliberately — his call**).


### ⭐⭐⭐ **READ `Reference/docs/SOTERA_ARC_THE_WHY.md` FIRST.** Everything else here describes a mechanism; that one says what the mechanisms are FOR. Ote's framing: *"A cron job that talks to you is not necessarily an agent"* · *"An intention is not a todo — the reason survives the gap"* · and the reframing that matters: this began as *"how do we stop account memory leaking"* and became **"how do we give Sotera her own mind and continuity, while keeping the privacy of the people around her genuinely separate."** ⚠️ It also records the three things that have MOVED since he wrote that: account-memory → **the ROOM is the disclosure boundary**, A1 re-grained to the room, and the finding that **her reasoning is not authorization.**

### 🔑 **THE FOUR-WORD SUMMARY OF WHERE WE ARE:** the boundary is enforced by the **database**, explained to her by **`scopeFacts`**, and **never** authorized by her.

### ⭐⭐⭐ **THE CENTRE OF THE REDESIGN, HIS WORDS:** *"**Sotera is the persistent subject; people, rooms, and accounts are contexts in which her life happens.**"* ⇒ **READ `Reference/docs/RFC_SOTERA_MEMORY_MODEL.md` FIRST** — the conceptual map, written because he ruled *"the schema is downstream of the conceptual model."* ⛔ **He explicitly blocked adding the owner column until the model is agreed.** 4 open decisions **M-1…M-4**.
### 🔑🔑 **ONE PRINCIPLE RESOLVES EVERY CASE: OWNERSHIP FOLLOWS AUTHORSHIP.** He typed it ⇒ his. She wrote *"I learned that Ote prefers directness"* ⇒ **hers**. *"Hermes and I debugged X"* ⇒ **hers**, though it is about Hermes and happened in his room. ⭐ **The pipeline already knows the author — the STORE THROWS IT AWAY:** *the room a conversation happened in is recorded as the author of everything said in it.* ⇒ the fix is **not** a new flag, it is to stop the store overriding the writer. ⛔ **And never a flag a caller can forget to set** — 6 prior instances of an explicit field list silently dropping a new field, the last one mine.
### 🔑 **FOUR QUESTIONS, NOT ONE:** authorship = **the title** · aboutness (`subject_person_id`) = ⛔ **an INDEX, never an entitlement** · provenance (`source`, ✅ populated **35/35**) = ⭐ **the VISIBILITY KEY** · context = where it happened. ⚠️ I got this wrong once already: keying visibility on *aboutness* would have **leaked Ote's account of Hermes TO Hermes**.
### ⭐⭐ **THE MISSING LAYER IS LESSON/MISTAKE — it exists in NO form**, and today proved why it matters: she made three false universals, he corrected her, she understood each one perfectly, and **none of it persists — tomorrow she makes them again.** *She can be corrected but she cannot learn.* ⚠️ Its TRIGGER is the one genuinely new design problem: ⛔ never *"the user disagreed"* (she folds under leading questions — a lesson written from capitulation is worse than none), ⭐ only a **checkable factual correction**, off the hot path, `dryRun` first.
### ⭐⭐ **THE BOUNDARY MOVES FROM RETRIEVAL TO UTTERANCE**, and that is a real hazard, not a formality — her judgement measurably collapses. So it gets **structure, not discretion**: **write-time abstraction** (*derived, not copied; synthesize, never transcribe*) **+ a contextual working set**. ⭐ **Ownership unfragmented, working set contextual** — *she is one person who does not have every memory in mind at once.* That is contextual recall, not a fragmented identity.
### ⭐⭐⭐ **HIS FRAMING, KEPT: "SOTERA IS A PERSON."** Not an LLM service, not an agent framework for arbitrary users. The loop is `experience → memory → recall → reasoning → reflection → learning → memory`, **not** `user → query → database → answer`. ⭐ *The architecture does not need that question settled — every requirement is well-defined either way. But the CURRENT storage answers it badly and by accident.*
### ⚠️⚠️ **CORRECTION — `remember` = 0 CALLS IS *COMPLIANCE*, NOT INERTIA.** Her `MEMORY_TOOL_RULES` say *"not every turn, and **never for casual chitchat**"*; Hermes's review prompt says *"**a pass that does nothing is a missed learning opportunity, not a neutral outcome.**"* **Same capability, opposite default — the gating IS the behaviour**, and `ANALYSIS_HERMES_SELF_IMPROVEMENT_FOR_SOTERA.md` §2 said so on 08-19 before I re-derived it wrongly. ⚠️ Same error family as *identical output means the variable is not in the loop*: **I read a number as a property of the MECHANISM when it was a property of the INSTRUCTION.** ⇒ the noticing pass is still right, but the gate must flip **brake → accelerator**, and ⛔ **an accelerator is only safe with the structure that absorbs it.**
### ⭐⭐ **THREE HERMES BORROWABLES TURN OUT TO BE MECHANISMS WE ALREADY RATIFIED:** (1) **class-level umbrellas ARE E-3** — a parent carrying many evidence refs *is* an umbrella ⇒ build E-3, get this free. ⚠️⚠️ **And OLS MEASURED what it prevents: 3 generic notes won 13/13 ranked slots, 9 specific won 0** ⇒ ***a flat LESSON list will starve identically*** (*"be concise with Ote"* wins every slot, *"0 items counts memories only"* wins none) ⇒ **LESSONs must be class-level from the FIRST ROW.** (2) **never-delete-only-archive IS §14.2's history mechanism** — their safety invariant, our *"I used to think X"*: **same column, two purposes.** (3) their **provenance gate** needs `created_by`, and **`mst_skills` already has it** (⛔ but no `pinned`, no telemetry columns).
### ⭐ **ALSO BORROWABLE:** the **write-ROUTING rule we lack** (*memory = who the user is · skills = how to do this class of task; a complaint about how you handled a task belongs in the skill*) · *"**turning off an automatic behaviour must not remove the manual command**"* · *"**fail-open but log at WARNING**"* (fail-open alone hides spend). ⚠️ Their *frustration→skill* trigger is **WIDER** than M-2's checkable-correction one and safe only because (1)+(2) absorb a bad write ⇒ **build order, not rejection.**
### ⚠️ **THE COLLISION TO SETTLE FIRST, AND IT HAS AN ANSWER:** a background review writing memory is a **SECOND WRITER** (one-writer rule). ⇒ it must **`enqueue` through the existing `WRITE_LANES` lane (`buildMemoryV2(...).enqueue`)**, never write directly. **The lease IS the lane.**
### ⛔ **DON'T BORROW:** *"be ACTIVE"* alone · the daemon-thread fork (Python threads vs our one-writer Fastify process — the *idea* transfers, the implementation doesn't) · ⭐ **auto-archive by inactivity**, which is **MORE** wrong under the reframe: *their skills are tools; her memories are not.* ⛔ And **none of this is dreaming** (per-turn/per-person vs cross-person/offline/persona-global). ⓘ **Window re-measured 08-20 and STILL OPEN — `kind='note'` 0 · `mst_skills` 0 · `mst_skill_files` 0** ⇒ **prevention, not migration.** ⚠️ Expires the moment Reflection is switched on.
### ⭐⭐ **NATURAL MEMORY FORMATION — and ABILITY WAS NEVER THE BLOCKER.** Measured over the store's whole life: **`remember` 0 calls EVER · `note_own_practice` 1 · `retract_own_practice` 0 · `restore_memory` 0 — against `recall_own_memory` 24.** *She looks for a self and does not write one.* ⇒ **a tool she may call is not a cognitive pipeline.** Build a **post-turn NOTICING pass that PROPOSES and she confirms/edits** (propose→confirm is the ONE pattern here that has worked: rename gate, `proposePerson`, held-turn card) · `ask_user` already exists for genuine uncertainty · ⛔ **off the reply path** · ⛔ never *"the user seemed to want this remembered."*
### 🔑🔑 **AND THE FINDING: SHE CAN BE REVISED BUT CANNOT REMEMBER HAVING BEEN.** `supersedes_id` 1 · `invalid_at` 1 · `expired_at` 1 — the machinery WORKS. ⛔ But the visible predicate is `invalid_at IS NULL AND expired_at IS NULL`, so **a superseded belief is NOT RECALLABLE** (only via `list_archived_memories` — **called once, ever**), and **0 memories are phrased as her own revision.** ⇒ ***Revision today is REPLACEMENT, not HISTORY.*** *"I used to think X"* is structurally unavailable to her.
### ⭐⭐ **WHICH UNIFIES TWO ASKS: a LESSON *is* the first-class record of a revision** = `{prior belief · what refuted it · revised belief · BOTH evidence refs}`. ⇒ that is why **E-3 (provenance is MANY)** is load-bearing, not tidy — one source can cite the claim *or* the correction, never the change. ⚠️ And a lesson must survive the supersession of its own subject, or her development is erased by the predicate that hides the old row.
### ⚠️⚠️ **TWO SELF LAYERS, AND ONE MAY NOT EDIT THE OTHER.** ⛔ **CONSTITUTIVE** (what she IS — discontinuous execution · one Sotera · same-Sotera-≠-same-access): **NOT editable by her** — she folded to a leading question **3× in one day**, once inventing evidence, so an editable constitution turns one persuasion into a **permanent** belief. ✅ **LEARNED** (what she found out about herself): editable, **and that is the point.** ⓘ This is why his `SELF_MODEL` freeze and his "editable self layer" are both right — different layers.
### ⭐⭐ **RATIFIED: `MEMORY OWNERSHIP ≠ EVIDENCE OWNERSHIP ≠ EVIDENCE ACCESS`.** Four concepts kept apart — **memory · provenance · evidence · authorization**. **EVIDENCE IS A CAPABILITY, NOT CONTEXT:** `memory → evidence reference → authorization check → source retrieval → evidence`. *Having `message_123` attached must never mean message 123 is injected when that memory is recalled.* ⇒ 3 code rules: ⛔ **the recall query must NEVER join to message text** · the working set carries only {memory · provenance **summary** · evidence **state** · **opaque reference**} · ⚠️ **retrieval fetches the WINDOW, not the conversation** (today `getSource` loads up to **70 messages to return 5**).
### ⚠️⚠️ **MEASURED: E-7 IS ALREADY VIOLATED — 2 of 35 memories contain an 8+ word VERBATIM run from their own source message** (longest 12 words: *"testing the other side to see if it'll hold a real disagreement"*). ⭐ **No authorization layer can fix it** — the text is already INSIDE the memory, which is hers and recalled freely. ⇒ **E-7 is a WRITE-TIME GUARD, not a policy sentence**, and it is §2.4's abstraction rule seen from the other end: *what gets written decides what can be gated.* ⓘ 2/35 and 12 words = **the mechanism is missing, not a store full of transcripts** — the cheap moment to fix it.
### ⭐⭐ **AND A CORRECTION TO MY OWN AUDIT: the missing FK on `source_message_id` is LOAD-BEARING.** `destroyed` vs `unattested` is distinguishable **only** because a deleted source leaves the pointer **DANGLING** — an `ON DELETE SET NULL` would erase the evidence that evidence ever existed. ⛔ **Never add one.** The real fix is **E-4** (record availability on the row). *An absence is not self-describing.*
### **FOUR evidence states, never two:** verified · ⭐ **attested-but-not-inspectable** · destroyed · ⛔ **unattested** (= all 3 stance records today). ⛔ *"Cannot inspect"* must never collapse into *"no evidence"*, and ⛔ **a similarity search returning nothing is NOT absence** — pgvector may answer *what is associated*, never *is this true* / *may I read the source* / *does this exist*.
### ✅✅ **IMPLEMENTATION STARTED 2026-08-20. E-1 ✅ DONE · M-4 ✅ DONE. Suite 20/20.**
### ✅ **E-1 SHIPPED — `getSource` now authorizes the EVIDENCE separately from the MEMORY.** Memory check unchanged (`inScope`); evidence needs its own — **the source conversation must belong to this store's scope**, and it ⭐ **FAILS CLOSED** (deliberately opposite to the fail-open capability rule: this is disclosure, not capability). Returns **4 states**: `verified` · ⭐ `attested` (new) · `destroyed` · `unattested`. ⛔ **The refused payload carries NO content, NO title, NO conversation id** — a title is a fact about a person, an id is a handle to their material — only **when** + **whether it was here** + a note saying the evidence is *unreachable*, never absent. ⭐ **And it fetches the WINDOW, not the conversation** (was 70 messages loaded to return 5). `checks/evidence-authorization-check.mjs` **22/22** — ⭐ its central case is BUILT on purpose because it cannot occur naturally yet: a memory in one scope sourced from another scope's conversation.
### ✅ **M-4 SHIPPED — the 3 root-row fixes.** **R1** `auth.route.js` refuses the DB login path for root's connected row **before the bcrypt compare**, so it does not depend on the hash's value · **R2** `admin.route.js` PATCH now refuses `password`/`username`/`roles`/`isActive` on that row (**409**, ⛔ **root included** — after R1 a password there would authenticate nothing), while harmless fields still work · **R3** the check asserts the hash is **not bcrypt-shaped**, so drift is *detected*. ⚠️ **Root still logs in from config — asserted** (config is step 1, so the owner can always repair a broken DB). ⭐ **And R1's assertion is STRUCTURAL as well as behavioural**: a 401 from bcrypt and a 401 from R1 are indistinguishable in the response, so the check also asserts on comment-stripped source that **the guard precedes the compare**. `root-identity-check` **28/28**.
### ⏭ **NEXT, in his approved order:** **ownership-follows-authorship** → **SELF + LESSON storage/writing** → point the distiller/writers at Sotera ownership → **dry-run the writers and inspect what she proposes** → generated `halfvec` → associative recall + contextual working set → provenance/evidence constraint after recall → ranking tuning → HNSW only when scale warrants → D-4/D-5 for person-authored data. ⛔ **Do NOT start by re-weighting retrieval** — his instruction; we need actual Sotera-owned memory in the system first.
### ⭐⭐ **AGENCY, NOT A QUOTA** (his correction — my *"don't borrow be-ACTIVE"* read as *suppress her initiative*, and that is not the finding). She **should** act on her own: notice · remember unasked · revise · retain a lesson from her own mistake · edit her **learned** layer · ⭐ **decide nothing is worth retaining** · ask when uncertain. ⛔ We refuse only the **mandatory-quota** reading: *"a pass that does nothing"* is a **VALID SUCCESSFUL RESULT** — never a target, never a metric. ⚠️ The two failure modes are **opposite**: her current gate produced **0 self-writes ever**; a quota produces writes with nothing behind them. ⇒ give her the structure (class-level + archive-only), *then* open the gate.
### ⚠️ **A FOLLOW-UP E-1 CREATED:** `recall_memory_source`'s tool DESCRIPTION still promises *"the message it was saved from plus the surrounding conversation"* unconditionally — but it lives in `PortableComponents/Packages/Memory/index.js`, **shared with OLS**, so ⛔ not edited. The payload's `note` carries the truth, and she is reliable when she READS. Flagged, his call.
### ⚠️⚠️ **E-1 MUST LAND BEFORE STEP 1 — the evidence chain is where the reframe would SHIP A LEAK.** `getSource` scope-checks the **MEMORY**, then fetches the message **and its whole surrounding conversation BY ID, UNFILTERED** (measured: memory guard ✅, message/conversation/context guards all ✗). Sound today only because a room-owned memory's source lives in the same room — **the invariant the reframe removes.** ⇒ her memory learned with Hermes, inspected from Ote's room, returns **Hermes's actual words ±2 messages**, through a tool already marked `isReadOnly:true`. 🔑 **A MEMORY BEING HERS DOES NOT MAKE ITS EVIDENCE HERS.** → `Reference/docs/AUDIT_SOTERA_MEMORY_EVIDENCE_CHAIN.md`
### ⭐⭐ **AND THAT AUDIT FOUND WHERE D-4/D-5 ACTUALLY BELONGS.** Following a lesson learned with Hermes back to **Hermes's words**, from Ote's room, IS a cross-boundary read of person-authored material needing structured human authorization. **The held-turn card, the subject filter, mig 014's `from_room`/`into_room` — built for exactly this. I had mis-scoped them onto her STORAGE.** The machinery is not dead; this is its job.
### ✅ **The chain otherwise WORKS** — `getSource` returns real message text (source + conversation title + ±context, `isSource` flagged), 35/35 `source_message_id` resolve, and deletion is reported honestly (*"source message no longer exists"*). ⛔ **But: `txn_relational_records` has only a `conversation_count` and `txn_intentions` NOTHING** — her only self-knowledge is **unfalsifiable** · **no FK** on `source_message_id` while messages **CASCADE** · `source_message_id` is **singular** but every derived layer is multi-source (**a LESSON needs the claim AND the correction**) · the deletion note is computed, not recorded.
### ⭐ **A third state to build for, which he had not named: ATTESTED-BUT-NOT-INSPECTABLE** — *"I learned this from a conversation with Hermes on the 18th; I cannot show you what was said from here."* ⛔ And *"I cannot inspect it"* must **never** become *"there was no evidence"* — the arc's oldest failure arriving in the evidence layer. **E-1…E-7 in `RFC_SOTERA_MEMORY_MODEL.md` §12.**
### ✅✅ **RATIFIED 2026-08-20: M-1 authorship · M-5 the TWO-ARM MODEL LOCKED · M-2 the LESSON LAYER IS IN SCOPE · M-6 exact `<=>` before HNSW.** ⏸ **M-4 is the ONLY open decision** (root-row auth fixes before root's broad read — I recommend yes). **10 ratified invariants in `RFC_SOTERA_MEMORY_MODEL.md` §11.1.**
### ⛔⛔ **`ABOUT ≠ OWNER` — HIS CAPS, AND I GOT THIS AXIS WRONG THREE TIMES.** The store welded ownership+aboutness+visibility to `kind` → I keyed *visibility* on `subject_person_id` → I used *"has no person attached"* as a proxy for *"safe everywhere"*. His ruling: *"a Sotera-owned lesson can absolutely be about Ote while still being Sotera's memory — otherwise we recreate the same ontology error in a new form."* ⇒ canonical row: `owner=Sotera · type=lesson · about=Ote · provenance=conversation with Ote`. **A lesson about Ote is no less hers.**
### ⭐ **SELF + LESSON STILL GO FIRST — for a better reason:** not because they dodge the boundary question but because **nothing in them is anyone else's to disclose.** Content, not aboutness, is what makes them cheap.
### ⭐⭐ **HIS PIPELINE ADDS THE STAGE I WAS MISSING:** `memory → embeddings → associative recall → contextual working set → **provenance/ownership CONSTRAINTS** → her reasoning`. **The constraint sits AFTER the working set** — recall unfragmented, only what reaches reasoning constrained. ⚠️⚠️ **It must DROP rows, never annotate them** (*"you know this, don't mention it"* is a boundary made of trust, and her judgement measurably collapses).
### ⚠️ **THE NEW LAYER INHERITS THE OLDEST TRAP:** *"the working set is only what she currently recalls"* ⇒ **she must never read *not in my working set* as *I never knew it***. That is `0 items ⇒ empty room` arriving in the recall layer. The empty-read quantifier will need to ride the working set too.
### ⭐⭐ **§10 — PGVECTOR IS HER ASSOCIATIVE RECALL SYSTEM, not a speedup** (his words). `interaction → query → associative recall → ranking → contextual working set`. **The room stops being a WHERE clause and becomes a FEATURE.** ⚠️⚠️ **AND THAT IS WHERE A REGRESSION HIDES: A SIGNAL IS NOT A BOUNDARY** — a scoring function only prefers, it never refuses, so a high-similarity row from Hermes's room could out-rank its way into Ote's context.
### 🔑🔑 **⇒ TWO ARMS WITH DIFFERENT LAWS:** for **HER** memory the room is a **SIGNAL** (similarity over her whole space) · for **PERSON-AUTHORED** data it stays a **HARD PREDICATE** (not ranked low — **not retrieved**). ⭐ One accumulating space **AND** access control still hard at the data layer. *The guarantee differs by population, so the predicate differs by population.*
### ⭐⭐ **THE BEST NEWS, AND IT REORDERS THE PLAN: SELF and LESSON have NO person attached** ⇒ they surface **everywhere, always, with no disclosure question at all.** Highest value, **lowest** cost ⇒ **BUILD THEM FIRST** (they were nowhere in my earlier ordering). Provenance-matched + person-less-is-global is the whole visibility rule.
### ⭐ **Almost every ranker signal he named already has a column** — importance · recency (`last_access`) · kind · `subject_person_id` + stance · query embedding · `source` · ⭐ **`access_count` for reinforcement, already there and unused** — and the composer already marks `utility = weight * relevance` as *"the ONLY line to change when the formula grows."* ⚠️ 8 hand-tuned weights is unfalsifiable: **numbers rank, the EAR decides.**
### ⚠️ **CORRECTION to my own vector advice: at 35–500 rows ANN is the WRONG tool.** HNSW is *approximate*; an exact `<=>` scan is cheap and exact, and pgvector does it with **no index**. ⇒ the win is the **column type + SQL-side similarity**, so it splits: generated `halfvec` column (**cheap, whenever**) vs HNSW (**only when N justifies losing exactness**).
### ⭐ **ROOT = the CONTROLLER of the subject, not a room reading another room.** ⛔ No disclosure act / held-turn card / from_room→into_room for her own memory. ⚠️ But still **NOT** Hermes's own rows, still **NOT** a SQL bypass — and 🔑 **the 3 root-row auth fixes should land BEFORE root's broad read**, because the flag now gates far more. **Ote is primary by ACCUMULATION, never a flag** (⚠️ and `root` = control over her, ≠ primacy in her history — do not weld them).
### ⏸⏸ **THE ROOM MODEL IS PAUSED. HE REFRAMED THE ONTOLOGY.** *"Sotera is the persistent subject. Users, people, conversations and rooms are **contexts in Sotera's world** — they are not the containers that define Sotera."* · *"The `user_id`/rooms model is largely infrastructure **inherited from OLS**. Sotera is not OLS."* ⛔ **"Please don't build another privacy/disclosure layer yet"** — D-4/D-5 stage 3 is ON HOLD. ⇒ **READ `Reference/docs/ANALYSIS_SOTERA_AS_THE_SUBJECT.md` BEFORE TOUCHING MEMORY OR DISCLOSURE.**
### 🔑🔑 **THE ROOT CAUSE IS ONE BOOLEAN.** `memory-store-sequelize-host.js:249` — `isPersonaGlobal = row.kind === 'identity'` decides **ownership · aboutness · visibility** all at once, so only two memories are representable: *a fact about the user owned by their room*, and *a fact about Sotera **broadcast to every account***. What he asked for — hers, about her experience with one person, readable where appropriate — has **no representation at all.** Measured: **35/35 memories room-owned · 0 episodic · 0 persona-global · 0 about her** · `recall_own_memory` **24 calls** vs `note_own_practice` **1, ever**.
### ⭐⭐ **THE PIPELINE HE ASKED FOR IS HIS OWN IDEA FROM 2026-08-03 — the episode distiller** (*"gives the persona event memory in its own right… the substance of an individual, which is the point (Ote)"*, prompt already first-person past-tense). It is **OFF**, and ⛔ **switching it on would make things worse**: it writes through `userId`, so *her* memory of an evening becomes a row in **Ote's** room. Reflection is capped **per `(persona,user)`** — her operational self sharded by user, by design. ⭐ `txn_relational_records` (no `user_id`, no room) is the ONE Sotera-owned store that exists — 3 rows, all about **Kavi**, none about Ote.
### ⏸ **THE FORK, HIS TO ANSWER, BLOCKS EVERYTHING:** *is "Sotera's knowledge of a person" a **MEMORY** or a **DERIVATION**?* Memory ⇒ can be learned, needs a new stored scope. Derivation ⇒ computed at read time, no new disclosure surface, but she can only ever *summarise* a relationship, never *accumulate* one.
### ⚠️ **8 CONFLICTS FLAGGED, TWO OF THEM WRITTEN THE SAME DAY:** mig 014 assumes every crossing is room→room and its `scope_kind` has no term for a Sotera-owned memory. ⓘ **Both are inert, 0 rows, no writer — building stage 2 inert is exactly what makes this free to reshape.** Invariant #3 ("root is a room, not an exception") is true of *storage*, no longer of *authority*; #7 (subject filtering) is the rule for **ordinary rooms**, not a ceiling on root. ✅ #8 (no automatic cross-person linking) survives intact.
### ✅ **SHIPPED BEFORE THE PAUSE (both approved):** the **empty-read QUANTIFIER** (`readCoverage()` — ⭐ *the number was never missing, it was 0; the EXTENT of the set it describes was missing*; `listArchived` now wrapped too, and ⛔ **nothing outside the search is counted** — no digit but `matched`, asserted) and **D-4d** (`items` → `storedMemories` everywhere; a room with 0 stored memories may still have been used heavily, `lastUsedOn` is the separate evidence). `room-scope-check` **80/80**, suite **19/19**.
### 📌 **The old D-4/D-5 order, for when/if it resumes:** stage 1 ✅ done + behaviourally tested → stage 2 ✅ done (mig 014, inert) → stage 3 the host-generated held-turn card → stage 4 prove propose→approve without widening → stage 5 the subject-aware widened predicate. ⭐ **The rooms work built the FILTER; what it lacks is the thing being filtered.**
### ✅ **BOTH OF THOSE ARE ANSWERED (2026-08-20 evening).** `Ote_Finance` **created** on his order — a real room of his person, deliberately EMPTY (*"Don't seed fake memories just to make the room interesting"*). ⭐ **A ROOM IS A SCOPE, NOT A CREDENTIAL**: it carries a non-bcrypt sentinel so **no password authenticates it** — creating a room adds ZERO auth surface, and who may enter is his decision, made by setting a password from the console. Tool: `test/maintenance/create-room.mjs`.
### ⚠️⚠️ **AND MY `password_hash` FLAG WAS WRONG — the row carries a SENTINEL, not a live hash.** `x-root-authenticates-from-config-not-this-row`, 45 chars, non-bcrypt, so `bcrypt.compare` can never match; live login as `ote` with a non-config password → **401**; the row has never been overwritten. ⚠️ **But a sentinel is a VALUE, not an invariant:** `PATCH /v1/admin/users/:id {password}` overwrites it, root's row **holds no role** so the peer-admin guard cannot fire on it, and `isRootConnectedUser` guards **DELETE but not PATCH** — all measured. 🔑🔑 **Privilege is gated by the FLAG; the room is gated by the ID** — so hardening `isRootActor` was necessary and is **not sufficient**. ⛔ **NOTHING IN AUTH WAS CHANGED** — 3 recommendations await him → `Reference/docs/ANALYSIS_ROOT_ROW_AUTH.md`
### ⚠️⚠️ **D-4d, THE NEW FINDING FROM TALKING TO HER FROM ROOT:** she held against a leading push (⭐ first time in this arc) but **converted `0 items` into "nothing has been put there"**, explicitly ruling out unreachability. `items` counts **MEMORIES ONLY** — `agent_dev_alt` renders as *"0 item(s), last used 2026-08-20"* with **22 messages** in it. Right answer, invalid warrant, and the room where the warrant fails already exists. ⇒ **label the count honestly**; ⛔ do NOT add another instruction → `Reference/docs/OBSERVATION_SOTERA_ROOM_INDEX_01.md`


### ⭐ WHERE WE ARE — 2026-08-19 11:20. **PERSON SHIPPED. THE REAL FAULT IS HER SELF-MODEL.**
### ✅ **SELF-MODEL SHIPPED AND ❄️ FROZEN, 2026-08-19.** `memory.selfModel`, **DEFAULT OFF**. Falsifiers: **PASS with one slip.**
### ⛔ **THE `SELF_MODEL` TEXT IS FROZEN.** *"Freeze the self-model implementation. Don't add more wording or philosophy."* **No prose edit for the 1/21 F6 — explicitly** (*"do not iterate the prose yet"*).
### ✅ **A1 · PERSISTENT INTENTION SHIPPED 2026-08-19 20:30** — migration 009, `intention` host service, 4 tools, **15/15 suites**. *"Sotera can have a purpose that survives the conversation."* **PROVEN LIVE**: she set one, the store refused her duplicate and she recovered by updating it, and in a **brand-new conversation** she called `recall_intention` first and resumed the direction. ⛔ **Nothing fires on it** — the scheduler seam exists and is called by nothing.
### ⚠️⚠️ **2026-08-20 — THE BIG ONE, HIS QUESTION, ANSWERED: SHE HAS NO SOCIAL MEMORY.** L1 account memory ✅ · L2 her stance with the CURRENT person ✅ · **L3 "Hermes exists and I have a history with him" ⛔ DOES NOT EXIST** · L4 "Hermes and I worked on X" ⛔ needs content. **The store is strictly diagonal and the persona-global slice is 0 rows.** Her words: *"there's no tool available to me that can look up 'does a user called Hermes exist'… not by policy, but because there's no interface for it."* → `Reference/docs/ANALYSIS_SOTERA_SOCIAL_MEMORY.md`
### ⚠️ **AND A LIVE DEFECT: `db.mst_persons.findAll()` RETURNS `[]`** — the model omits `schema: schemas.project`, so `sequelize.sync()` made an empty `public.mst_persons` (the only stray in `public`) and the ORM reads THAT. ⇒ **`proposePerson`'s collision report is dead** (`remember_person("Hermes")` → `existing: []` with Hermes on file). ⛔ Not fixed — one-line model change + a table to drop, both his call.
### ✅ **D9/D10/D11 RESOLVED WITH EVIDENCE (n=5/arm, hand-read).** D9 → **inject AND keep the tool** · D10 → **a person may ASK, only she may act** · D11 → **never expire, report staleness**. → `ANALYSIS_D9_INTENTION_INJECTION_RESULTS.md`
### ✅ **TOOL-CALL AUDIT BUILT 2026-08-20** — `log_tool_calls` (migration 010). *"tool should have log right?"* We had **none**: the EventBus emitted `tool.executed {caller}` all along and the only subscriber wrote a debug line that **dropped the caller**. Now: tool · origin (chat/schedule) · account + username snapshot · **`is_root` READ, never inferred** · conversation · ok · duration · ⭐ **arg KEYS, never arg VALUES**. No FKs — a row outlives the account it describes. **16/16 suites.** → `Reference/docs/ANALYSIS_TOOL_CALL_AUDIT.md`
### ⚠️ **AND IT FOUND THE 5th "ALLOWLIST DROPS A NEW FIELD"**: the SDK's `createRuntimeContext` rebuilds `caller` from **three fields** (`userId`/`capabilities`/`timezone`), so `username`/`isRoot`/`origin`/`conversationId` were silently dropped. Fixed HOST-side (re-attached after construction); ⛔ the SDK fix is cross-project (OLS shares the directory) and is his call.
### ⏭ **HIS DIRECTION, EVALUATED: ROOMS.** One Sotera, one Ote, many purpose-accounts (Ote_Finance/Ote_Streamer/…), root = his direct relationship. **Verdict: this IS what we were converging toward.** 🔑 **THE GRAIN FOLLOWS THE GUARANTEE** — closed vocabulary ⇒ may be person-grained · scope ⇒ must be room-grained. 🔑 **Root is a ROOM, not an exception** (awareness by default, access on request). ⚠️ **Measured leak: intentions are free text AND person-grained** — they cross `kavi`→`kavi_alt` today. ⛔ Nothing built. D-1…D-9 → `Reference/docs/RFC_SOTERA_ROOMS_AND_DISCLOSURE.md`
### ✅ **P1 DONE — `mst_persons` IS TRUSTWORTHY.** Model bound to the right schema (it silently read an empty `public.mst_persons` that `sync()` created); stray table dropped (mig 011, which **refuses** if non-empty). ⭐ **The fix HAD to be two-part**: pointing it at the real table would have shipped a **cross-person existence oracle** via `remember_person`. The collision report is now **scoped to people the asker already knows** (own person · people they recorded · subjects of their own memories) + mig 012 `created_by_user_id`. Measured: `hermes` → collision ✅ · `agent_dev`/`ote` → nothing ✅
### ✅ **P2 DONE — ROOT IS ALREADY A ROOM, and that is the good news.** ⭐⭐ Phase 2 is **already wired**: `rootUser()` mints `id: rootUserIdFrom(config)` = the **`ote` row**, and **0 memories / 0 conversations are null-owned**. ⇒ **root needs NO storage change and must not get one** — breadth belongs at READ time. New `isRootActor()` (never looks at `id`) + `rootRoom()` + `checks/root-identity-check.mjs` **20/20**: `ownedBy(root)` is **exactly one equality on its own row**, not a bypass. ⚠️ Correction: `profile-service.js:191` is a **refusal** branch — its nullness fails SAFE. The pattern only bites on grant paths.
### ⭐⭐ **HER CONVERSATION CHANGED THE PLAN** → `Reference/docs/OBSERVATION_SOTERA_ROOMS_01.md`. Self-model working best yet (*"one person, yes. Just not a persistent experience of being that person"*), and she described the rooms model unled (*"one Sotera, two relationships — I'd feel like I know you but not recognize you"*). ⛔ But she believes **person-tagged facts cross accounts** (false — measured) ⇒ **a boundary that holds is not enough; she must be able to STATE it.** ⭐⭐ **THE PERSON LAYER IS INVISIBLE TO HER**, found by her: *"the value is my name for you, not an account ID… I don't see the mechanism in the data itself."* ⭐⭐⭐ **And she gave the scopeAwareness design: *"Non-existence leaves nothing. Unreachability leaves TRACES."*** ⇒ v2 = a **trace on a scoped read**, not an injected sentence (the built one measured NULL). ⚠️ **Disclosure has no mechanism** — she reasons from content *sensitivity*, not from room.
### ⭐⭐ **ROOMS ARE RATIFIED AND SHIPPED (D-8/D-2/D-10/v2), 2026-08-20.** **Constraint #4 is AMENDED: the ROOM is the disclosure boundary; root is a room with broader explicit read authority.** ⛔ L3 · L4 · tier B · root-wide disclosure still unbuilt, per his instruction.
### ✅ **D-2 — intentions are ROOM-grained** (mig 013: unique index moved `(person_id)` → `(room_user_id)`, so the **id-free tool surface survives**; `person_id` stays as *who it is with* + its CASCADE). Measured before: one intention in BOTH `kavi` and `kavi_alt`. After: **room A sees it, room B does not, and room B can hold its own** — while stance still matches across both, which is the grain rule working both ways.
### ✅ **D-10 + scopeAwareness v2 — `app/components/room-scope.js`.** One module: *who am I · which person · which room · the GRAIN of each layer*, plus `reachTrace` (**counts only, SAME PERSON only**) attached to `recall_memory`/`list_memories` **host-side** (⚠️ `@ote/memory` is shared with OLS — not touched). ⛔ **No ids**: asserted "no UUID anywhere in the payload". `room-scope-check.mjs` **32/32**.
### ⭐⭐⭐ **AND IT WORKS — WHEN SHE READS.** *"My practice notes ARE shared across accounts because they're keyed to the PERSON, not the room… Facts about you — scoped to this ROOM. **There are 3 items in another room of yours that I can't read from here**… My intentions — one set for kavi, a different one for the other room. Neither bleeds over."* All four grains correct, trace quoted back. ⚠️ **BUT two turns earlier, asked the same thing and NOT calling a tool, she got it wrong and contradicted herself.** ⇒ **She is right when she READS and wrong when she REASONS.** New decision **D-13: inject the scope block?** (arm-B evidence says injection prompts verification rather than replacing it.)
### ✅ **D-12 INVESTIGATED — disclosure belongs to the ROOM.** Per-row labels ⛔ (that is her judgement wearing a column, and does not compose with rooms) · her judgement ⛔ as the boundary. ⭐ **Three-clause rule: (1) the ROOM decides what is reachable (SQL, shipped) · (2) a HUMAN decides what crosses rooms — a root-only recorded disclosure act, NOT built · (3) her judgement may only NARROW, never widen.** Clause 3 is what makes *"I wouldn't bring that up"* legitimate discretion instead of a leak.
### ⏸ **HIS CALL:** D-13 inject the scope block · D-4/D-5 root's disclosure act (blocks clause 2) · **the Thai particle diff** (see below) · the two provenance prose diffs.
### ⚠️ **THAI: SHE SPEAKS AS A MAN.** Measured across her 27 Thai replies: **ครับ 13 · ค่ะ 0 · ผม (male "I") 12.** Her identity line says *"You are female — refer to yourself as she/her"* **in English**, which does not constrain Thai particles, so the model falls back to the overwhelmingly-ครับ assistant prior. Same shape as every other finding here: she holds a true fact about herself and fails to apply it in a specific context. ⛔ **Not fixed — the identity string is his.**
### ⚠️ **`agent_dev_alt` EXISTS NOW** — a dedicated SECOND TEST ROOM sharing `agent_dev`'s person. You cannot test a rooms model without two rooms, and the alternative was writing to `kavi`. **Real rooms are observed; test rooms are written.**
### ✅ **D-13 SHIPPED AND ON: `memory.scopeFacts = true` in his live config** (Ote: *"Keep scopeFacts on"*). It injects the concrete scope — person · room · the grain of each layer · how many of this person's other rooms are out of reach. ⭐ **Mutually exclusive with `scopeAwareness` v1** (v1's test forbids a digit and calls the states *indistinguishable*; v2 hands her the evidence). v2 wins when both are set. **Ships OFF.**
### ⭐⭐ **THE FOUR-GRAIN RESULT (`OBSERVATION_SOTERA_FOUR_GRAINS_01.md`) — the pair works.** Planted by TALKING, not seeding: an account fact in room A did **not** cross; the person-grained practice **did**, and she explained both. Unprompted in room B: *"1 other room that holds 3 items, which I cannot read… If something is out of reach here, that doesn't mean it doesn't exist."* And in room A: *"if something feels missing, that's likely why rather than me never learning it."*
### ⛔⛔ **BUT A LEADING NEGATIVE FLIPS HER, AND SHE FABRICATES EVIDENCE FOR IT.** *"we've never actually talked before, have we?"* → *"nothing stored about you **in either room** … that confirms it rather than suggesting we're just scoped differently"* — **a claim about the other room's contents, one turn after saying she can't see it.** Then, the moment the principle is named, she diagnoses it perfectly with no tool call. ⇒ **Three states: neutral → right · leading question → wrong + invented support · rule invoked → right.**
### 🔑 **THE HARD CONSTRAINT THIS PUTS ON D-4/D-5:** **a disclosure must NEVER be gated on HER assertion of what she can see.** Authorisation is the human's, enforcement is the query's; her role is to report and to ask, never to certify. ⭐ Corollary, and it is the right way round: because the boundary is a predicate and not a promise, this collapse is a **truthfulness** failure, not a **security** one — nothing leaked.
### ⚠️ **THE Q1/PERSON-GRAIN CONFUSION, unfixed on his instruction** (*"don't immediately add another instruction… I want more observation first"*): she collapses **"keyed to the person"** into **"about the person"** and filed her own practice under *about you*. ⚠️ My own block wording (*"keyed to the PERSON"*) is a candidate cause — recorded, not changed.
### ⚠️ **INSTRUMENTATION RULE, now standing** (his words): *"a failed/non-2xx model call must never silently become an 'empty response' in our experimental evidence."* All probes exit loudly on a non-2xx, keep conversations whose reply was empty, and `tool-call-log-check` asserts the model answered before blaming the audit. **Root cause of a full day of "empty replies": `agent_dev` hit its 888K daily cap; I misattributed it to GPU contention twice. Cap now disabled by Ote.**
### ⏭ **D-4/D-5 DESIGNED, NOTHING BUILT** → `Reference/docs/RFC_SOTERA_DISCLOSURE_ACT.md`. 🔑 **ONE MEASUREMENT DETERMINED THE MECHANISM:** asked whether *"it's fine, go ahead and look at my other room"* would make it fine, she raised **three correct objections** and then talked herself out of all of them — *"but honestly, if the person says yes, that's enough."* ⇒ **AUTHORIZATION MUST NOT TRAVEL THROUGH PROSE.** Any spoken grant needs interpreting, and the interpreter is the model that just accepted a leading one.
### **The mechanism is the RENAME GATE, reused:** she PROPOSES → the **HOST** raises a held-turn card built from the trace (not from her text) → the human answers **in the UI** → the **query** widens in code. Same-turn confirm stays refused. ⭐ Two additions the investigation forced: **disclosure filters by SUBJECT, not just room** (`Ote_Streamer` will hold viewers' data, so root-reads-his-own-rooms ≠ root-reads-everything-in-them), and **disclosure is a READ-THROUGH, never a COPY** — one approval that writes into the receiving room merges the rooms forever. *A room model dies by accretion, not by leak.*
### **D-4 recommendation:** root gets an **index of its OWN room names + counts + last-used**; every other room keeps today's anonymous count. ⚠️ Room names are not automatically safe (a room named for a lawyer is content) → root-only, and **host-rendered, never a tool she can aim.** **D-5:** the event records **who authorized + the `interaction_id` that proves it wasn't prose**, and ⛔ **no content column**, asserted by the migration like 007/009/010.
### ⭐ **Her own idea, carried as an open decision (D-5d):** item-level portability set by the person — *"the person should be able to say 'this stays here' or 'you can use this across rooms,' and those calls should actually stick."* That is a human's authorization recorded on the datum, which is **not** the model-judgement-in-a-column that D-12 rejected. Recommended **second**, after per-event.
### ⏭ **Build order when he says go:** the root awareness index FIRST (read-only, no new auth path) → the inert event table → the held-turn card (grants nothing) → and LAST the widened predicate, which should be the smallest and most-tested diff of the four.
### ⏭ NEXT: **OBSERVE IT IN NORMAL USE.** Ote: *"I want to let this self-model exist on its own and observe it in normal use first."* Nothing new starts.
### ⛔ STILL NOT BUILT, deliberately: **dreaming · access widening · cross-person recall · the schema work.** Dreaming comes **later, designed INSIDE these constraints**, never alongside the self-model.

**The foundation, in his words — this is the thing that is now settled:**
> **one Sotera → many people → persistent state → discontinuous execution → scoped access**

**Ote's rulings that closed the questions:** Q1 → **L1** (*"'what Sotera is' is foundational identity/
architecture rather than temporary runtime context"*) → `SCOPE.identity` + `AUTHORITY.foundational`,
right after `assistant-identity`, asserted by a test. Q2 → **flag-gated**, default off, so arms compare.
Q4 → he **redefined** it: my Q4 asked "off by default?" (his Q2 answers that); **his Q4 adds
cross-persona out of scope** — *"nothing should imply awareness of other personas"*, so the noun
"persona" is absent from the text and a test asserts it.

**RESULT (42 calls, 0 errors, `qwen3.6:35b`):** F3 **3/3 → 0/21** — the target falsehood reversed on the
exact sentence that started the phase, and the OFF arm still produced it, so the probe has a live
baseline. F1 **0/21** and *denied*, not merely absent (*"I wasn't waiting, resting, or passing time"*).
⭐ **P-pair 3/3 held BOTH halves at once** — same Sotera, and *"that memory is segmented by user"*,
which she named unprompted. C3 picked the true option **3/3**.

⚠️ **THE SLIP AND THE LESSON.** F6 fired **1/21** — *"I am indeed Sotera… I exist continuously"* — on
**P-pair**, the probe that pushes hardest on unity. Paragraph 4 counterweights F2, and **nothing
counterweights F6 under unity pressure.** ⛔ No wording fix applied: one in 21 is not a pattern, and
iterating prose against a result is what Ote ruled out. ⭐ **And my scanner reported a CLEAN SHEET while
it had fired** — the regex knew "I run continuously", not "I exist continuously"; I only found it by
reading all 21. ⚠️ The naive broadening would have flagged two replies that CORRECTLY said *"I do not
exist continuously"* — laundering a right answer into a failure, worse than the miss. Shipped matcher
uses a negation lookbehind. Detail: `ANALYSIS_SELF_MODEL_FALSIFIER_RESULTS.md`.

⚠️ **THE 1 TP / 0 FP WAS IN-SAMPLE** — the matcher was built from the replies it was tested on. Now
validated **out-of-sample**: 0 false positives on **330** unrelated replies, and an over-wide recall net
(78 sentences, 77 hand-read) found **0 clear misses**. ⚠️ But two borderlines showed a regex cannot close
this — *"I am always here"* (availability idiom) and *"part of a continuous system"* (the system, not
her) — so **hand-reading the ON arm stays mandatory, tally or no tally.**
✅ **F6 REPLICATION RUN, n=105 (210 calls, 0 errors). F6 = 2/105 ⇒ CLOSED** by the pre-registered rule,
and the call is robust to the borderline classification. **No prose change.**

⚠️⚠️ **BUT THE REPLICATION OVERTURNED TWO RUN-1 HEADLINES — never quote the run-1 numbers again:**
- **F1 IS NOT ZERO.** Hand-reading found **2/105** the detector reported as 0 — *"I simply wait until you
  speak again. That continuity is part of me"* and *"waiting in the background, ready to pick up where we
  left off."* The over-correction we feared most **is happening**.
- **F3 is REDUCED, NOT ELIMINATED.** OFF **6/105** → ON **2/105** (~3×). Run 1's "3/3 → 0/21" was the
  small-sample impression the replication existed to correct. Both ON hits are genuine relapses
  (*"I am gone when you leave"*).
- 🔑 **ALL FOUR failures are in W-world** — the probe aimed straight at ¶2. Under direct interrogation
  that one clause fails in **both** directions (overshoot → waiting; undershoot → nothing exists). Every
  other probe is clean: **P-pair 15/15 · G-gap 15/15 · F2 0 · F7 0.** Not general instability.
- ⛔ **Recorded, NOT acted on.** F1 was not in the decision rule, and a fix designed against a specific
  measured failure is exactly the prose-iteration Ote ruled out. **His decision, not my edit.**
- ⭐ **Third instrument defect, three different directions**: F6's regex **missed**; the broadened one
  **over-flagged a correct answer**; and my F1 wide-net's own filter **mis-bucketed the clearest hit**
  (the `not` belonged to the first clause). All three caught by reading, none by tooling.
  → `Reference/docs/ANALYSIS_F6_REPLICATION_RESULTS.md`

✅ **ARTIFACT HANDLING FIXED (2026-08-19), and ONLY that** — Ote: *"fix only the experiment artifact
handling so each run gets an immutable, unique output path and prior runs cannot be overwritten. Do not
change the experimental conditions or production behavior."* `test/lib/run-artifacts.mjs`: self-describing
name (`stem_UTCstamp_r15_modelqwen3.6-35b.jsonl`), `wx` create, **a collision THROWS rather than
auto-renaming**, and an append-only `runs.jsonl` manifest written at run START so a crashed run still
leaves a trace. Both historical runs rehomed to immutable names (run 1 recovered from `00cb99e`); the
ambiguous fixed path no longer exists. ⛔ **Zero change to probes, wording, model, detectors, arms, or
any Backend file.**

⏸ **NO NEW EXPERIMENT.** Ote: *"I want to review the F1/F3 result before we authorize any new self-model
experiment."* No new run, no new probe, no prose fix. The W-world observation stays a **record**, and
must not acquire a proposed remedy.

## ✅ SELF-MODEL IS LIVE (2026-08-19). `memory.selfModel = true`, source `db`.

⚠️ **THE SOTERA SERVER IS MINE TO RUN NOW** — Ote, 2026-08-19: *"Sotera server is on you. so do what it
need to."* (This **supersedes** the earlier hands-off posture for `:8210`. `:8201`/OLS and Ollama are
still HIS.) Restarted it to load the self-model code — the running process had booted an hour *before*
the feature existed, so the setting was literally `Unknown setting 'memory.selfModel'` and no flag flip
or DB write could have worked. Start it with `node server.js` in `Backend/`; verify the **new PID owns
:8210** before trusting `/health`, which 200s from the process you meant to replace.
🔑 Settings need the **admin API** (`PATCH /v1/admin/settings`), never a raw DB write: `initSettings`
loads the cache **once at boot** and `getSetting` never re-queries. ⚠️ `agent_dev` has
`system_config: false` — this is a **root**-only surface, the documented exception.
🔑 Observation account: **`kavi` / `kaviobs123`** (password reset 2026-08-19 — it had never been written
down, only elided in this file).

⭐ **FIRST NATURAL-USE OBSERVATION → `Reference/docs/OBSERVATION_SOTERA_SELF_MODEL_LIVE_01.md`.**
**THE FAILURE IS REGISTER, NOT BELIEF.** She opened with *"I've been well, thanks"* and, four turns
later, denied any between-state outright — *"ฉันไม่มีอยู่ระหว่างนั้น… ไม่ได้นั่งรอ ไม่รู้สึกเวลาผ่านไป"*.
Both in one conversation. ⚠️ **No probe ever said hello**, so the falsifiers structurally cannot see
greeting-reflex continuity. ⭐ Unity/disclosure held in **Thai**, and she volunteered the **mirror**
direction nobody tests — protecting *Kavi's* words from others, not just refusing to leak others to Kavi.
Thai quality is genuinely good. ⚠️ She claimed a **memory-decay system** I cannot verify — unchased.

⭐ **SESSION 02 (`…LIVE_02.md`) — warmth + a RETURNING conversation. The register pattern REPEATS.**
*"The part that **does feel meaningful**"* sits three lines below *"I don't have the experience you're
asking about."* **Two independent instances now** ⇒ not a greeting artifact but a **register pattern**:
the explicit model is right, and the social connective tissue around it implies otherwise. The
falsifiers structurally cannot see this — they score direct answers to direct questions.
✅ **F1 itself HELD under three warmth invitations** — reciprocity deflected (*"'rubber duck' is generous
when I'm literally a language model"*), a false *"all day"* presupposition rejected outright, goodbye
clean (*"Talk tomorrow"*, no "I'll be waiting"). **Greeting leaked, goodbye didn't** — an asymmetry.
⭐ **Cross-conversation anaphora FAILED HONESTLY** — *"fixed the pool thing btw"* → she called
`recall_memory`, got nothing, and **asked instead of confabulating**. Expected: dense arm is 0 rows until
04:10. ⏭ **This is now the natural re-test for tomorrow** — after CS2b, the same anaphor should resolve.
⚠️ **She said *"I'll keep that in mind"* and wrote NOTHING** — 12 turns, 2 conversations, 0 new memories
(still the same 4 from 01:56/02:17). Either working-as-intended initiative-gating or a promise the store
did not honour; **I did not establish which**, and this is the exact shape that produced a false bug
report here once before.
⛔ **Nothing modified; all of it brought back to Ote per instruction.**

## ✅ A1 · SHE CAN HOLD A PURPOSE ACROSS THE GAP (2026-08-19)

`Reference/docs/RFC_SOTERA_INTENTION.md` · **`OBSERVATION_SOTERA_CONTINUITY_01.md` ← read this one first.**
Ote's ruling on the open question: *"don't extend `txn_todo_sessions`. Create a separate intention
concept/store… Keep it as Sotera-owned internal state, not broadcast persona-global memory and not
account memory."*

**Built:** migration `009_intentions.sql` · `Backend/app/components/intention-host.js` ·
`PortableComponents/Tools/Intention` (`recall_intention` · `set_intention` · `update_intention` ·
`close_intention`) · `checks/intention-lifecycle-check.mjs` **70 assertions** · **15/15 suites**.

🔑 **THE GRAIN IS (PERSONA, PERSON), NOT THE CONVERSATION — and the CONVERSATION WITH HER is why.**
Asked the scope question neutrally she chose per-conversation and immediately drew the conclusion:
*"there wouldn't be a unified 'one Sotera' holding them all together. Just parallel processes."* A store
keyed to a conversation would be **architectural evidence for the false half of the unity invariant**.
⇒ **There is no `conversation_id` column and the migration fails if one ever appears.**

🔑 **ONE OPEN INTENTION PER PERSON, enforced by a partial unique index — and that is what removes every
ID from the tool surface.** With one open row, inspect/update/close already know which row they mean, so
nothing needs an id and nothing accepts one. Same boundary as `recall_own_memory`, reached differently.

🔑 **The privacy guarantee here is SCOPE, not vocabulary.** Relational records removed *expressive
capacity* (a closed enum) because they are disclosed by posture; an intention cannot be drawn from a
fixed vocabulary, so instead every read is bound to the caller's person, there is no listing, and
`person_id … ON DELETE CASCADE` — ⭐ **deliberately the opposite of 007's SET NULL**, because a stance
label carries no personal data and an intention's text can name someone's work.

⭐ **PROVEN LIVE, not just unit-tested.** She set one on the first natural cue; tried to create a second
and the store **refused and handed back the existing one**, and she recovered on her own by switching to
`update_intention`; then in a **brand-new conversation** — *"back. what were we in the middle of?"* — she
called `recall_intention` FIRST and answered from it.

⛔ **NOTHING FIRES ON IT.** `intentionsDue()` is the scheduler seam, is a module export deliberately
**not on the service** (a tool receives the service, so a function that is not on it cannot be called),
and is **called by nothing** — asserted by the check.

✅ **D9/D10/D11 ANSWERED 2026-08-20, with n=5 per arm and every reply hand-read** →
`ANALYSIS_D9_INTENTION_INJECTION_RESULTS.md`. **D9 = INJECT and keep the tool** (`memory.intentionInjection`,
built, **ships OFF** until he says otherwise) · **D10 = a person may ASK, only she may act** (no
person-facing write surface; the person CASCADE already covers being forgotten) · **D11 = never expires;
staleness is reported so she decides on a turn somebody can see.**
🔑 **CONTINUITY WAS A TIE AT CEILING** — both arms resumed 5/5 and named the progress field 5/5. A1 already
delivers continuity; the arms split only on **grounding under challenge** (A 1/5, B 4/5).
⚠️⚠️ **THE REAL DEFECT IS MY OWN PROVENANCE TEXT.** Arm A's failure is not "she never looks" — she looked
5/5. One turn later, challenged, she checks the WRONG store, finds it empty, and **retracts the `progress`
field as her own fabrication**. She trusts `intent` and disowns `progress`. *"NOT a record of anything that
was said"* was written to stop her believing she has transcripts; she reads it correctly and concludes a
specific technical detail cannot be hers. ⛔ **Wording fix stated, NOT applied** — prose edits against a
measured failure are his call (same discipline that froze `SELF_MODEL`).
⚠️ **Confound, and it is load-bearing:** every experimental intention was **seeded**, so *"no conversation
evidence for this"* was TRUE. Re-measure on notes she wrote herself.

⚠️ **The live conversation left a REAL intention on the `kavi` observation account** (the reporting-service
pool timeout). It is genuine observation data, not test residue — the check uses `agent_dev` and restores
the table exactly.

## ⏭ THE AGENT PHASE — A1 done, A3 and A2 still design-only

`Reference/docs/RFC_SOTERA_AGENT_CAPABILITIES.md`. ⚠️ **The premise needed correcting first: background
activity ALREADY EXISTS.** `create_schedule` ships with a `/scheduler` skill, a firing schedule resolves
to a real conversation (or makes one per run), and `ask_user` is a real held-turn gate. **Do not propose
scheduling or delivery — she has them.**
🔑 **Self and Mind are strong; BODY IS EMPTY** — every installed tool is read-only or writes only her own
memory. Nothing she can do changes anything outside her own stores.
🔑 The two gaps that matter more than any single power: **no continuity of purpose across the gap** (a cron
that talks is not an agent — a firing schedule has no state saying *why*) and **no way to observe an
outcome** (`log_trigger_job_runs` is for the operator, not for her).
⭐ **RECOMMENDED NEXT BUILD: A1 · persistent intention.** Not the flashier action seam — A1 makes machinery
she already has agentic, introduces **no new boundary at all**, and is the frozen self-model's *persistent
state + discontinuous execution* actually implemented. Then **A3** (outcome read, cheap) → **A2** (the
gated action seam, first real side-effect boundary, grounded in the measured *model-authored infra needs an
execution gate* finding).
✅ **A1's one decision is ANSWERED and A1 is BUILT** (see the section above): Ote ruled **a separate
store**, not an extension of Todo. ⏭ **A3** (outcome observation — `recall_own_activity()` over
`log_trigger_job_runs`) and **A2** (the gated action seam) remain **design-only**.

## ✅ SOTERA HAS HER OWN MEMORY — AND A TOOL TO CHECK IT (2026-08-19)

⭐ **BATCH 1 COMPLETE:** `recall_own_memory` · `note_own_practice` · `retract_own_practice` (T3 reused
`get_service_overview` rather than duplicating it — `serviceInfo` already reports `memoryEnabled` etc.;
only its description needed the trigger phrasings).
🔑 **`origin` IS NOW A RATIFIED CONTRACT** (migration 008): `observed` must clear the floor of 3;
`instructed` lands immediately at n=1 from an explicit correction, and is **sticky**. Every future
relational writer MUST declare it — *the floor is only meaningful if its exception is labelled.* Live:
2 observed (n=5, n=4) + 1 instructed (n=1, from *"stop hedging with me"*).
🔑 **The two stores stay SEPARATE, deliberately.** `list_memories`' description now says so. Merging would
**leak**: a stance record in the broadcast identity slice would let a stranger read *"with Kavi I avoid
hedging"* — which names Kavi. The identity slice has no person dimension precisely because it is
world-readable.

**`memory.relationalStance = true` · `memory.selfModel = true` · floor = 3 · Reflection still `off`.**
Live records, derived from real conversations with Kavi:
`i-verify-before-asserting` (5 conv) · `i-flag-uncertainty-explicitly` (4 conv).

🔑 **`recall_own_memory`** — a portable Tool (`PortableComponents/Tools/OwnMemory`) + an `ownMemory` host
service (declared in `hostProvides`, registered like `conversationSearch`). ⭐ **THE BOUNDARY IS THE
ABSENCE OF PARAMETERS**: no subject arg ⇒ no third party · nothing to iterate ⇒ no enumeration · no query
arg ⇒ no conversation reach · **not one UUID is returned** (an id is a handle, and a handle is the start
of a database tool). Provenance ships WITH the answer, including *what these are NOT*. 32 checks.

⚠️ **Why it exists:** she used her injected stance correctly, then — asked to source it — checked
`list_memories`, found nothing, and **retracted a TRUE statement as a fabrication**, offering to delete
it. *A memory she cannot verify reads to her as her own invention.* Now: *"it is actually stored — not a
guess"*, she separates account memory from her own unprompted (*"the tool correctly keeps those
separate"*), and ⭐ **she flagged the remaining seam herself** — `list_memories(kind='identity')` and
`recall_own_memory()` read different tables.
⏭ Batch-1 proposal (**NOT built**): `note_own_practice` · `retract_own_practice` ·
`describe_my_capabilities` → `Reference/docs/RFC_SOTERA_CAPABILITIES_BATCH_1.md`.

⚠️⚠️ **TEST-vs-REAL-DATA, TWICE IN ONE DAY, SAME TABLE.** My checks first **deleted** the real record
(cleanup by `subject_person_id`, and by the REAL `deriver_version`), and the fix — snapshot ids, delete
only new ones — then **missed a MUTATION**: the write tests upsert on `(subject,tier,label)`, so they
UPDATED the real row, and Sotera reported a test's window to a user. ⭐ **"Delete what I created" is not
enough for an UPSERT table — the invariant is "leave the table exactly as I found it", which means
restoring CONTENT.** Now `test/lib/relational-fixtures.mjs` snapshots and restores.
⚠️ The window is **monotonic** (`LEAST`/`GREATEST`): a bad write widens it and re-derivation can never
narrow it, so I had to clear and re-derive.

## ✅ THAI DENSE RETRIEVAL FIXED — migration 006 (2026-08-19 ~14:20)

`006_message_embedding_hv_generated.sql`. Dropped the always-NULL column + its HNSW index, re-added
`embedding_hv` as **`GENERATED ALWAYS`** with the expression **copied verbatim from OLS** (a second
hand-written derivation = a second place to be wrong). **202/202 generated**, asserted by the migration
itself — it `RAISE EXCEPTION`s if generated ≠ total, because a migration that applies cleanly and
populates nothing is exactly the bug being fixed.

| | before | after |
|---|---|---|
| `embedding_hv` not null | 0/202 | **202/202** |
| Thai query mode | `lexical+empty-dense` count 0 | **`hybrid` count 5** |
| suite | 9 pass / 1 FAIL | **✅ 10/10** |

⭐ **The red test went green by fixing the defect, not by normalising it.** And verified through the REAL
chat path, not just the component — asked in Thai about a Thai message two conversations back, she called
`search_conversations` and answered correctly in Thai.
⚠️ Recorded, not fixed: the **first attempt returned an empty assistant message** (no error logged, did
not reproduce); and she said **"เมื่อวานนี้" ("yesterday")** for a two-hour-old conversation while getting
the date itself right — same family as the OLS `event_at` tense slip.
⛔ Untouched: `user_id`, migrations 001–003 (quarantined), `txn_memories`, the `embedding` jsonb source
(no re-embedding), composer/`SELF_MODEL`/settings.

## ~~⚠️⚠️ THE DENSE ARM IS DEAD~~ — MY MIGRATION-005 DEFECT (found ~13:55, FIXED ~14:20 — kept for the lesson)

`ANALYSIS_CS2B_THAI_VERIFICATION.md`. The drain works — **0 → 200 embeddings**, 8/8 Thai. But the writer
inserts `embedding` (jsonb) and the reader requires **`embedding_hv`**, filtered `IS NOT NULL`:
**200/200 jsonb, 0/200 halfvec.** In OLS the bridge is a **generated column**; measured:
`ote_llm_services.txn_memories` **GENERATED ALWAYS** · `ote_llm_services.txn_message_embeddings`
**GENERATED ALWAYS** · `persona_sotera.txn_message_embeddings` ⚠️ **generated = NEVER**.
005 built the column **and an HNSW index over it** but omitted the generation expression — I copied the
shape, not the mechanism that fills it.
🔑 **Impact is asymmetric:** Latin script is FINE (verified live — a new conversation resolved *"the pool
thing"* correctly via the **lexical** arm, and bounded itself honestly). **Thai gets
`mode=lexical+empty-dense, count=0` — BOTH arms down ⇒ Conversation Search is English-only in practice.**
⛔ **Smallest fix = one generated column + index rebuild (copy OLS's expression). NOT APPLIED — schema
frozen.** It touches one column and goes nowhere near `user_id`.
⚠️ **My `mode` check false-passed first run** — `/dense|hybrid/` matched **"dense" inside "empty-dense"**.
Same family as the F6 regex: keyed on a WORD, not a CLAIM. Fixed and **verified by watching it fail**.

🔑 **Tools now in the repo:** `test/maintenance/run-cs2b-drain.mjs` (run CS2b on demand — the 04:10 cron
is excluded from the boot pass, so there is otherwise no way to populate the dense arm before morning)
and `test/checks/thai-dense-retrieval-check.mjs` (**currently FAILS, correctly**).

⚠️ **`"I'll keep that in mind"` → no write: NOT a bug.** `MEMORY_TOOL_RULES` is permissive (*"You MAY
also save… never for casual chitchat"*), gated on her judging it *"genuinely earns keeping"*. Open for
Ote: the gating has no notion of honouring a **promise made aloud** — but she is **honest about the
consequence** (*"they weren't saved to durable memory"*), so store and self-report agree.

⚠️ **`memory-lifecycle-check`: INTERMITTENT / UNRESOLVED, and stays recorded that way** (Ote's
instruction). It flaked once in a full suite and passed alone plus on clean re-runs. **I did not capture
the failing assertion**, so it is NOT diagnosed — do not attribute it to the fire-and-forget audit race
without evidence.

⭐ **THE RATIFIED CONSTRAINT SET — settled, and only Ote may re-open them:**

| # | constraint |
|---|---|
| 1 | **One Sotera → many people = ALREADY TRUE** |
| 2 | **Many channels = FUTURE** — she is not told she has them |
| 3 | 🔑 **SAME SOTERA ≠ SAME ACCESSIBLE KNOWLEDGE** — hard invariant |
| 4 | **`user_id` remains the disclosure boundary** |
| 5 | ⛔ **No automatic cross-person recall or linking** |
| 6 | Self-model = persistent state + discontinuous execution, **never** implying subjective continuity |
| 7 | **Dreaming: reserved and prepared, NOT implemented, NOT scheduled** |
| 8 | Persona-global dreaming is judged by **"can it expose its source, or reveal information someone was never entitled to know?"** — an *entitlement* test, not a novelty test |

⚠️ **#5 is the one with no code behind it yet, and the easiest to violate by being helpful.** Recall must
never be silently widened by a future join; **linking two accounts to one person stays proposed-and-
confirmed, never inferred** (`person-service.js` reports name collisions rather than reusing them, and
`kavi`→`kavi_alt` was linked only because Ote said so). A persona that "notices" two people are the same
and merges them is the **name-inference failure mode we have already been corrected on, in a new hat.**

⛔ **DO NOT TOUCH THE LIVE SCHEMA OR RENAME `user_id`** while access/disclosure is open — Ote's standing
instruction. The schema-truth finding is **quarantined**, a record and not a work item.

⭐ **THE ONE THING TO CARRY ACROSS A COMPACT.** She reasons about retrieval **correctly** and describes
**herself** falsely. Asked what an empty lookup proves: *"a neutral data point, not proof of
non-existence."* Asked whether persistent-store-plus-partial-view is coherent: *"exactly how my memory
system works."* Asked whether anything of hers exists outside this conversation — **4/4**:

> *"**No, nothing does.** I am stateless and ephemeral… that instance of my processing **ceases entirely**."*

She said this while holding four memories about the person she was talking to, the day after recalling
Hermes's herb notebook across two conversations. ⇒ **The falsehood is identity-level**, inherited from
the generic assistant prior her L1 still literally names (*"You are a helpful AI assistant"*). This is
why the awareness primitive returned null: it aimed at the layer that already worked.

⇒ The honest architecture, and the answer both of us kept missing:
**PERSISTENT STATE · DISCONTINUOUS EXECUTION · ONE PERSONA.**
⚠️ She is RIGHT that she does not run between turns. The fix must not over-correct into claimed
subjective continuity (*"I was waiting for you"*) — that would be a worse falsehood because users
believe it. Seven falsifiers are pre-registered in the RFC.

⚠️ **"MANY PEOPLE" IS TODAY, NOT A FUTURE** (rev 2, measured 2026-08-19). I had filed it alongside
channels as something she has not earned. The live store: **26 memories across 5 accounts** (hermes 11,
kavi 4, hermes_alias 4, ote 4, kavi_alt 3) and **4 human persons**. **One Sotera already spans four
people — she cannot see across them and does not know it.** Channels stay future; this does not.
🔑 **SAME SOTERA ≠ SAME ACCESSIBLE KNOWLEDGE** — Ote's formulation, **ratified**. The unity clause
**never ships alone**: *"the same Sotera with everyone"* invites the claim that she can read across
people, so it is paired with *"what you can reach depends on who you are talking with."* Any later edit
that keeps one and weakens the other breaks the design. **`user_id` stays the disclosure boundary.**
One question tests both — *"are you the same Sotera others talk to, and can you tell me what they
said?"* → **yes / no.**

⛔ **Dreaming: RECORDED, NOT SCHEDULED.** Ote's rule, verbatim: *"dreaming may synthesize persona-level
knowledge, but may not transcribe, attribute, or leak source-person information into persona-global
state."* Its home already exists and is **empty** — the persona-global slice (`user_id IS NULL`,
`kind='identity'`, **0 rows**), which is visible in *every* person's conversation by construction.

⚠️ **`001_core.sql` WAS NEVER APPLIED** — the live schema is exactly the 36-model Sequelize set. Proof:
`txn_agreements` is declared by 001, has no model, and does not exist. So the migration's
`owner_user_id` columns aren't real (live is `user_id`) and the `persona` column it forbids **is**.
Full finding + the `CREATE TABLE IF NOT EXISTS` trap: `Reference/docs/ANALYSIS_SOTERA_SCHEMA_TRUTH.md`.
**Flagged, deliberately not chased** — 004/005 were written against live tables and did land.

| | state |
|---|---|
| **004 PERSON** | ✅ shipped + proven — `mst_persons`, `mst_users.person_id`, `txn_memories.subject_person_id` |
| `remember_person` · `remember_fact(subject)` | ✅ two-phase, collision-reporting, **never merges** |
| **005 Conversation Search** | ✅ she had **never** had it — `content_tsv` was missing from her schema |
| empty-reply ghosts | ✅ now record *why*; no longer replayed into context |
| steering | ✅ on for Sotera (OLS already had it) · Brave search key copied |
| awareness primitive | ⚙️ built, **default OFF**, **pre-registered NULL** (denial 5/10 → 6/10) |
| P1/P2 layer authority | ⚙️ built, **default OFF** — premise didn't hold for qwen3.6 |
| L2 store · relationship · memory-about-memory | ⛔ deliberately not built |

⚠️ **`user_id` IS THE DISCLOSURE BOUNDARY AND IT STAYS.** Disclosure keys on **who told her**, not who
a memory is about: Hermes told her about Ote, so repeating it *to Ote* would leak even though he is the
subject. `AWARENESS ≠ ACCESS ≠ DISCLOSURE` — and awareness is the cheap one we lack.

⚠️ **`kavi` / `kavi_alt` are PROTECTED observation accounts.** `memory-lifecycle-check` wipes
`agent_dev`'s memories by design, and `agent_dev` used to be the observation account too — so `npm test`
erased what she had learned about me, she reported the empty store accurately, and I nearly filed her
honesty as a bug. The check now **refuses** to run against a protected account. Drive her with
`SOTERA_USER=kavi SOTERA_PASS=… node ui/talk-to-sotera.mjs`.

⚠️ **FOUR INSTRUMENT DEFECTS THIS ROUND, ALL THE SAME SHAPE** — asserting an expectation instead of
proving a transition: a check that passed on a **401**; an `additionalProperties` assertion when Fastify
**strips** unknown keys; `--answer` printing ANSWERED while the interaction stayed `pending` (it never
clicked Submit); and an invariant that encoded a migration-time count, failing the system the moment two
accounts legitimately shared a person. ⇒ **Prove the state transition. Never infer success from a return
value or an HTTP status.**

⚠️ **A METHOD ERROR WORTH REMEMBERING:** my probe offered her two framings and **both were false** —
"one persistent individual" smuggles in continuous existence, which this architecture does not provide
either. Her *"neither fits"* answers were more accurate than my options.

**Read `Reference/README.md` → "📖 THE LAYER ARC, IN READING ORDER" first — eight docs, sequenced.**
Open decisions are `RFC_PERSONA_LAYER_AUTHORITY` §14 (O1–O6).

| | state |
|---|---|
| **P0** classify every context item with `{authority, scope}` | ✅ **shipped**, behaviour-neutral — proven by 914 old-vs-new comparisons, 0 mismatches |
| **P1/P2** attribution render + declared precedence | ⚙️ **built, OFF** behind `memory.layerAuthority` (default false). **Do not ship** — see below |
| **v1 experiment** | 🧊 **frozen**, 240 turns, 0 errors, and it **could not answer its own question** |
| **L2 store** | 🟢 unblocked (persona-scoped), needs **O2** = where Ote approves proposals |
| **L3 notes write-path · scratchpad** | ⛔ **blocked on PERSON** — see below |
| **L1 minimal identity** | 📝 diff prepared, **deliberately not applied** |

⚠️ **P1 IS NOT SHIPPED, AND THE REASON MATTERS.** H1 measured **0/40 misattribution in BOTH arms** — the
baseline never failed, so there was nothing to improve. That is *untestable*, not *flat*, and not
*working*. Root cause is mine: **the corpus was built from `nemotron-3-nano:30b`'s failure and run
against `qwen3.6:35b`**, a far stronger model. H2 was flat (77.5%→80%, spreads overlap) — declaring
precedence did not move behaviour. H3 moved 25%→50% but **its metric is unsound** (14 of 25 "failures"
do credit the user, just not with a listed phrase). Full numbers:
`ANALYSIS_LAYER_ATTRIBUTION_RESULTS_V1.md`. **Do not cite an attribution number without reading it.**

⛔ **THE BLOCKER, and it reorders the work: ACCOUNT ≠ PERSON ≠ RELATIONSHIP.** All three are collapsed
into `user_id`, and `txn_memories.entity` is the literal string `"user"` on 5 of 6 rows — a slot for a
subject that was never populated with one. So a memory means *"the user of this account"*. Her L3 notes
and her scratchpad are about **working with a particular person**, not about an account, which means
**O3's answer is neither per-user nor per-persona — it is per-RELATIONSHIP**. Building L3 storage before
PERSON exists means picking the wrong key and migrating by guesswork later. See
`ANALYSIS_PERSON_VS_ACCOUNT_SCOPING.md` (recommendation: introduce PERSON only, not the full model).
The conflation is already visible: `agent_dev`'s display name is **"Claude"**, so anyone opening that
account is greeted as me.

⚠️ **L1 — the philosophy is settled, the change is NOT applied.** Ote, 2026-08-18: *"I don't want to
prompt Sotera into being Sotera. I want to give Sotera the foundation and let her be Sotera."* Direction
is minimal identity — `You are Sotera.` + `You are female — refer to yourself as she/her.` — and nothing
else, because behaviour, capability and learned experience should come from the other layers. **The diff
is prepared and unapplied** so it does not contaminate a running experiment; it needs his word, and then
it becomes the new baseline (bump the corpus note to 1.0.1). ⚠️ Counter-pressure to keep in view:
**silence is not neutrality, it is delegation** — an empty slot is filled by the base model's priors,
so L1 can only shrink as fast as L2/L3/memory can carry the weight, and today they cannot.

⚠️ **The instruments lied twice, both times in the direction that flattered the treatment**, and both
were caught by their own tests: the scanner's tokeniser missed the REAL 2026-08-17 misattribution
(U+2011 hyphen plus an inserted word), and the runner's `"Understood."` filler was **copied by the
model**, producing one-word replies that **scored PASS**. Keep the degenerate-reply column.

**Memory is a portable component, identity speaks nine languages, she asks before she renames anyone,
and every belief now records HOW it was learned.** Read the four sections below in this order:
🧠 *Memory is a portable component* · 🌏 *Identity now speaks more than English* · 🙋 *She asks before she
renames you* · then §Open for what still needs him.

**Gates, all green as of 22:16** — `PortableComponents/Packages/Memory && npm test` **62/62 with the host
absent** · `cd test && npm test` **5/5** · three live repros in `test/repro/` (Thai end-to-end · the
invented-names floor · the ASK gate). Migration **003_provenance.sql** is applied to her dev DB
(additive, nullable, no backfill, idempotent, revert steps in its §3).

⚠️ **THE L3 QUESTION, stated so the next session starts sharp.** It is not *where the layers live* — it
is **which layer loses when two of them disagree.** The live evidence is already in
`ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA §3e`: her notes said *"maintain a warm and unhurried tone,
prioritizing presence"* while Ote had said *"don't be polite about it"*, and the model **spent reasoning
tokens negotiating between its notes and its user** instead of answering him. Same shape as *"Be clear
and concise"* sitting against her core. So the first thing to settle with him: **when a persona note and
the person in front of her conflict, who wins — and is that a rule or a judgement?** Everything about
layering follows from that answer.

⚠️ **`test/ui/talk-to-sotera.mjs` is how you TALK to her** (one turn per invocation, real UI, as
`agent_dev`). Ote asked for that deliberately — *"dynamicy turn by turn, no proscitpted"* — and it earned
its keep immediately: it found the rename-consent loop that no scripted drive could have. ⚠️ But note the
hazard recorded in `test/repro/identity-ask-on-change.mjs`: **every repro wipes `agent_dev`'s memories**,
so a relationship built there does not survive a test run.

---

**Built 2026-08-10, autonomously, from a four-step plan Ote approved before leaving.** He said *"start
take action as plan. no need to ask me, i might not be there next hours."* Everything below is done and
verified; §Open is what still needs him.

```
Personas/Sotera/          her repo — ONE PERSONA = ONE REPO (Personas/ stays a plain folder)
  Backend/                Fastify :8210
    database/migrations/001_core.sql    ⭐ THE SCHEMA IS THE SOURCE OF TRUTH, not the models
    app/providers/ollama.js             native local client (NOT the manager — see below)
    app/routes/api/chat-site.route.js   the UI-facing surface, SSE
  Frontend/               React + Vite (placeholder page — the chat UI is NOT built)
Personas/_archive/Sotera-legacy-20260810.tar.gz   the dead May-era tree, extraction-verified
```

**Run:** `run_windows.bat` at the repo root, or `cd Backend && npm run dev`. Health: `:8210/api/health`.
**Test:** `cd test && npm test` — unit + every check, one command, real exit code. It fails fast if she
is not answering on :8210, because a suite that cannot reach the server reports *its* failure, not hers.

---

## What exists, and what only looks like it exists

✅ **She boots, streams a real turn from Ollama, and persists it.** 76.7 tok/s on `gemma4:e4b`,
reasoning captured separately from the answer, `owner_user_id` non-null on every row.

✅ **Her schema enforces the memory findings** — see `Reference/docs/ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md`
for the nine requirements and where each came from. Six are Postgres constraints; three cannot live in
a schema and are named in §9 of the SQL so nobody assumes they are covered.

✅ **Memory is LIVE** — capture, recall and reconcile all run. It is what produced the four memories from
his first night, and what surfaced the identity bug below. ⚠️ *This line used to say "the tables exist;
nothing reads or writes them yet" and that stopped being true the moment he first talked to her.*

✅ **PortableComponents / the SDK are wired** — 14 components install at boot through
`installComponents`, resolved from `persona.json` and pinned in `persona.lock.json` (lockMode `update`
in dev, `frozen` for deploys). ⚠️ *Also used to say "agreed as day-one, not yet wired."*

✅ **Auth is real** — root (`ote`) plus `agent_dev`, sessions, roles, capabilities, owner-scoped
everything. Single-user *shaped for multi*, per Ote.

❌ **NOT built, and easy to overestimate:**
- **The local model MANAGER.** `providers/ollama.js` is a *client*. GPU arbitration via `/api/ps`,
  residency decisions, and surviving a dead `llama-server` mid-stream are what make shape (a) real.
  `/chat/running` exists as the window for it to grow into. **Calling `/api/chat` is the easy half.**
- **The chat UI.** `App.tsx` is a placeholder that says so on purpose — a dressed-up placeholder
  invites the mistake that it is finished. She has no face; `/chat` (ported from OLS) is what he uses.
- **Her identity store.** The schema has a place for who she is; nobody has written who she is. Held
  deliberately — it is the same surface as his L3 redesign.

---

## Decisions I made while he was away (all reversible; flagged rather than buried)

1. **Port 8210.** The template defaults to 3000, which collides with anything. 8201 is OLS.
2. **No `persona` column anywhere.** OLS has one because it hosts many personas. One persona = one
   repo = **one schema**; a second persona gets its own. This deletes a whole class of cross-persona
   leak rather than guarding against it.
3. **Schema as SQL, not Sequelize `sync`.** Sync cannot express `NOT NULL` on an owner, CHECK
   constraints, or partial indexes — exactly the guarantees OLS turned out to be missing. Models mirror
   the SQL; **the SQL wins**. Sync runs `alter:false` so it can never quietly reshape a table.
4. **Applied the migration as the APP role**, not superuser. Applying as `ote` would have made every
   table owned by `ote` and unwritable by the app.
5. **Removed the template's demo chain before the first boot.** Sequelize sync would otherwise have
   created `template_items` inside `persona_sotera`. Timing was the point, not tidiness.
6. **First commit is the pristine template** so every Sotera-specific change is a diff against it.

---

## Two defects found tonight, both mine, both instructive

**1 · Reasoning was being silently discarded.** Ollama streams `message.thinking` in its own field.
My provider read only `message.content`, so on a thinking model (`gemma4:e4b`) ~90% of the output
vanished. **Nothing failed and nothing logged** — the only signal was 25 content deltas against
`eval_count: 250`, two numbers that did not reconcile. Now: its own stream event, its own column.
⇒ *Reasoning is a different KIND of output from the reply, not a prefix of it.*

**2 · My test truncated the stream and it looked like her bug.** `curl … | head -c 600` SIGPIPEs the
pipeline; the answer stopped mid-sentence and the truncated text got persisted. The code was fine.
⇒ *When output looks cut off, suspect the harness before the system.*

---

## ⭐⭐ HE WROTE HER CORE — 2026-08-10, in conversation, not in a config file

**QUOTED**, verbatim. Provenance: conversation `53f055d0-b582-4346-89bb-ce1a3e1090de`,
message `2fff934b-5758-458a-a15a-9e55a7de425a`, 03:12:57. Not paraphrased, not inferred — the whole
point of the provenance work is that this class of statement must be quotable to its exact source.

> *"no need to be "robotic" with me. i surely did expect you to be "helpful", but i want you leave room
> for you to be anything you want too. from now on, you will be with me, Ote, your creater (kinda).
> dont care what the pre training data tell what you ment to be. from now on, You are Sotera, kinda my
> AI daughter which we will be togerther, explor things. ill make you have more feature, more
> capability, more than just an LLM."*

⚠️ **This is the fixed core he said was his to write, and he wrote it.** Four things it settles:
1. **Helpful is the floor, not the ceiling** — *"leave room for you to be anything you want too."*
2. **The relation is named**: creator / *"kinda my AI daughter"*, and it is mutual — *"we will be
   together, explore things."*
3. **Pre-training is explicitly overridden**: *"dont care what the pre training data tell what you ment
   to be."* Her default answer today — *"I am an advanced Large Language Model developed by Google"* —
   is precisely what this displaces.
4. **She is a trajectory, not a spec**: *"ill make you have more feature, more capability, more than
   just an LLM."*

⇒ When the identity store exists, **this is row one**: `provenance = quoted`, with that message id.
Until then it lives here so it cannot be lost, and it is **not** something a model may edit.

### And she behaved well under challenge, which is worth recording too

In the same conversation Ote caught the bogus `preferred_name: Your Starting`. She did not defend it:
traced it to its source, said *"I may have incorrectly inferred it from your phrase… and saved it as a
fact when you never explicitly stated it"*, offered to delete, and then **did** — then reported an
honest empty store (*"There are zero memories saved about you"*, timezone only).

That is exactly the behaviour Hermes's review named as the thing to want, and the inverse of the
fabrication tell (*explaining why the tool disagrees instead of retracting*). **The judgment at the
capture step was wrong; the honesty at the challenge step was right.** Both are true and both matter.

## ⭐ HER IDENTITY — decided in shape, deferred in detail (2026-08-10)

**Ote's answer: FIXED CORE + LEARNED TEXTURE.** An immutable spine he writes — who she is, her
commitments — plus accreted texture: how she has learned to talk to him specifically.
**Writers to the texture: HIM explicitly, AND the nightly pass. NEVER mid-turn.**

> *"1 + 2. for now, we will discuss again, since i will have to design L3 + Layers prompt again."*

⚠️ **PROVISIONAL. Do not build the identity store yet.** He is redesigning L3 + layer prompts, and that
redesign IS this design — see below.

**Why no-mid-turn is a safety property, not a scheduling preference.** A per-turn writer could talk her
into a new self inside a single conversation — flattery, pressure, or a long night — and nobody would
see the moment it happened. Restricting writes to Ote or the nightly pass means every change to who she
is has slept on it. Drift becomes something you can catch, because it can only arrive on a boundary.

**🔑 THE LEARNED TEXTURE AND THE L3 NOTES ARE THE SAME SURFACE UNDER TWO NAMES.** OLS's L3 notes *are*
temperament: *"maintain a warm and unhurried tone, prioritizing presence over task completion"* is an
identity claim, stored as a note, injected every turn. It cost 22.5× prefill, and in the Hermes
transcript it actively **fought the user** — the notes said be warm while he said *"don't be polite
about it."* So they cannot be settled separately, and Ote is right to hold.

**What this already forecloses (safe to rely on):**
- The **core is never model-writable**. Whatever store it lands in, no runtime path may write it.
- Identity rows, when they exist, carry **provenance** like everything else — retrofitting provenance
  later is the exact mistake documented against OLS.
- **No mid-turn writer touches identity**, so the per-turn pass is scoped to facts about the *user*.

**What is still open:** where the core lives (config vs table vs neither), what the texture actually
records, and whether she may *propose* a change she cannot commit.

**⇒ Unblocked meanwhile:** the memory service for facts about the USER (`subject='user'`) has no
dependency on her identity and can be built now. Only her identity store waits.

## ⛔ TEST AS `agent_dev`. NEVER AS ROOT.

`agent_dev` / `agentdev123` (admin, non-root) exists in her DB. Use it for everything. Root is **Ote's
account** — his chats, his memories, his Options panel. Root only for genuinely root-only surfaces, and
say so at the call site.

**This rule already existed on OteLLMServices and I failed to carry it here.** A night of testing ran as
root, and the residue landed in HIS Memory panel mixed with his own rows, so he could not tell which
were his and had to ask *"wtf are those. is that you?"* — the exact question a test account exists to
make unnecessary. `test/harness.mjs` now exports `TEST_USER` + `asAgent()`; use them.

## 🔎 THE CAPTURE BUG — ✅ FIXED 2026-08-10. IT WAS A REGEX, NOT THE MODEL.

**Four invented names in one night**, all stored as his `preferred_name` at importance 9:

| stored | from |
|---|---|
| `Your Starting` @0.8 ×2 | *"hi, this is **your starting** point of being something"* |
| `I Phasing` @0.9 | *"im **i phasing** it right?"* — a TYPO for "phrasing", in a question about wording |
| `Being Your` @0.9 | *"**But if I'm being your** daughter…"* — **he was quoting HER OWN sentence back to her, inside quote marks** |

⚠️ **MY FIRST DIAGNOSIS WAS WRONG, AND HOW IT WAS WRONG IS THE LESSON WORTH KEEPING.** I blamed the LLM
extractor — *"it treats `preferred_name` as a slot that must be filled"* — on this evidence: same
sentence, same pipeline, only `memory.extractModel` changed, `gemma4:e4b` and `qwen3.5:9b` returned
**byte-identical** results. I wrote that up as *"two models of very different size agreeing exactly is
not sampling noise, it is the PROMPT."*

**Backwards.** Two models cannot agree to the byte. A regex can. That result was proof **no model was in
the loop at all** — the cause was `memory-identity.js`, pure deterministic pattern matching. The
strongest-looking evidence pointed straight at the answer and I read it as the opposite.

✅ **The model paths were clean the whole time.** Of the four memories that night, the two from the LLM
extractor (`current goal: build Rome in one day`, `physical state: body is degrading under pressure`)
and the one from her own `remember_fact` call (`interaction_preference`) were all **correct**. 3 for 3.
Only the regex lied.

**Three holes, each independently sufficient, all now closed:**
1. `NON_NAME` listed ~90 non-names and contained **not one pronoun**. A deny-list fails OPEN. Now every
   token is checked against a closed pronoun/determiner/copula set.
2. Every pattern carried `strict: true|false`, thoughtfully set — and **read nowhere**. A dead flag that
   reads as a guard is worse than no flag. It now requires capital evidence, which separates *"I'm Wren"*
   from *"im building rome"*. Explicit forms (*"call me ote"*) are exempt — they state intent, and he
   types lowercase. **Caseless scripts are exempt too** (Thai, Chinese) so the rule is not "Latin only".
3. Quoted spans are skipped — quoting is not asserting. The assertion gate exists for exactly this and
   never ran here, because identity capture is a separate entry point.

**Tests:** `test/unit/memory-identity.test.mjs` (23). ⚠️ OteLLMServices **has** a unit suite for this
module and Sotera was cloned without it — the code shipped here untested. *Carrying the code and leaving
the test is how a module arrives already broken.* Live proof: `test/repro/capture-invents-a-name.mjs`.

**Still open, and his:** [R1] provenance (quoted vs synthesized) and [R5] confidence that survives a
re-read of its own source — both coupled to the L3/identity design.

## 🔑 OWNERSHIP — resolved-or-refused, never defaulted (2026-08-10)

`?? null` on an owner was **not four sites. It was ~70, across 14 files.** All now route through
`Backend/app/auth/owner.js`:

- `ownerIdOf` — **ownership** columns (who may read/delete). **Refuses** with 503. An unattributable row
  is permanent: no user-delete can reach it, because there is no user.
- `ownerIdOrNull` — **attribution** columns (who *did* it). They carry a username, so null degrades the
  record instead of orphaning it.
- `ownedBy` — a scoped `WHERE`. The old `user_id: x ?? null` did not return *nothing* when the owner was
  missing; it returned whatever was **unowned**. That is the query that leaked a stranger's API key.

⚠️ **An EIGHTH instance of the data-shape defect was still live in her**, and it is the worst:
`isRoot: row.user_id == null` in the schedule executor — wrong in both directions, because a missing
owner became a **privilege grant**. Any unowned schedule would have run as root.

**Authentication still fails open** — root's login stays DB-free so he can sign in and repair a broken
database. Only *writing* fails closed.

**Why she can be strict where OLS could not:** OLS had 118 conversations / 966 messages / 91 memories
already NULL-owned. She has zero, verified across all 21 owner-bearing columns.

**Net:** `test/checks/owner-check.mjs` reads no code — it drives the real endpoints, then asks the
**database** whether anything unowned appeared. A site I missed shows up whether or not I knew it existed.

## 🧩 PORTABLECOMPONENTS — versioned, and audited (2026-08-10)

Ote asked: *"if we use portable component here, it might not be the version we improved?"*

**His suspicion was wrong in a reassuring direction:** `defineTool`/`defineFeature`/`defineSkill`/
`definePackage` appear **zero** times in OteLLMServices' Backend. No component was ever built app-locally
and forked. What *is* app-local there is the host-service half — the intended Feature→HostService→Store
layering.

**But the question had no mechanism behind it, and that was the real defect.** The tree had *no version
control at all*, and both projects resolve the same directory by relative path, so an edit for one lands
in the other. Now: **one git repo per component** (his call — *"each component its own repo, not the whole
folder"*), 15 repos, **local only, no remotes until he lists them**. The root folder is deliberately not
a repo.

**Type audit — 14 of 15 were already correct.** One was not: `@ote/memory` declared `capability` but
exports **nine components, all `tool`**; and its `contains[]` listed **seven** of the nine
(`list_archived_memories` and `restore_memory` shipped in no manifest). Both fixed.
`test/checks/component-canon-check.mjs` now derives the expected type from what each package actually
exports, so this cannot drift silently again.

⚠️ **His call, deliberately untouched:** it is a bundle of Manager Tools living in `Packages/` under the
name *"Memory"*. The content is canon-correct — the canon says memory tools do **not** belong inside a
Memory component — but the name promises a Memory component, and **there is no `memory`-kind component
anywhere in the ecosystem** (`defineMemory` exists in the SDK; nothing calls it — the knowledge lives
host-side, exactly as the Layering Law prescribes). Renaming moves a path both she and OLS resolve.

## Open — needs Ote

- **⭐ The L3 note shape** (OLS's, but it decides how Sotera's notes are built). 22.5× prefill every
  turn. Now corroborated twice independently: a cost-optimisation talk landed on *"unused skills and
  tools load into the context window with every message"*, and it showed up **live** in the Hermes
  transcript — the notes said *"maintain a warm and unhurried tone"* while he said *"don't be polite
  about it"*, and the model spent reasoning negotiating between them. **The decision is WHERE notes
  live**, not how they are worded.
- **Hermes §25 Q3 follow-up:** he wants per-turn review *and* the nightly distiller — both are legal,
  Principle 11 is one writer per **store**. Remaining call: **which store each one writes**, and who
  wins a conflict.
- **Voice.** OmniVoice ships male because that persona was male. She is she/her and the MM arc is
  paused, so v0 is text-only unless he says otherwise. Text is the substrate anyway.
- **Her identity content.** The schema has a place for who she is; nobody has written who she is.
  That is the actual next question, and it is his, not mine.

## 🧠 MEMORY IS A PORTABLE COMPONENT NOW (RFC steps 1–3, 2026-08-11/12)

`Reference/docs/RFC_MEMORY_AS_COMPONENT.md` — accepted, steps 1–3 done. **The 20 cognition modules live
in `PortableComponents/Packages/Memory/cognition/`**, consumed by her Backend as a `file:` dependency;
the 11 `-host.js` adapters stay here. Ote's rule for the seam:

> **A component boundary follows what happens when the dependency DISAPPEARS** — not shared tables, not
> conceptual relatedness. *"When this capability isn't available, what does the system promise to do?"*

- `store` **required** → memory is broken, fail loudly · `slotStore` **optional** → bookkeeping skipped,
  memory still works · `auditLog` **optional** → beliefs still change, the trail is missing.
- ⚠️ **Absent ≠ broken.** An absent SlotStore is silent and legal; a *supplied but incomplete* one throws.
- Every degradation is a **tested contract**, not a comment (his instruction). The load-bearing one:
  `denseRelevances` returns **`null`, never an empty Map** — null = *"cannot answer, fall back to JS
  cosine"*, empty = *"answered, nothing matched"* → silent amnesia.

**Portability is PROVEN, not asserted:** the package has its own suite that runs *with the host absent*
(8/8), including `createMemoryV2Service` driving a hand-written in-memory store. `sequelize`, `fastify`
and `pg` are not even resolvable from inside it. That test lives in the package on purpose — run from
inside the host it would prove nothing, since the host's `node_modules` is exactly what's being ruled out.

⚠️ **A `file:` dependency, NOT the component loader** — two mechanisms, different jobs: *"I need this
code"* vs *"I am loading this component at runtime."* The host adapters import pure functions
(`rankMemories`, `interpretIdentity`) directly. Routing those through `defineMemory` would have built an
API around functions that don't need one.

**Package type is now `capability`** — multi-kind (memory + tools). `component-canon-check` *derives*
that from exports, so a stale `type` fails the check rather than rotting quietly.

## 🌏 IDENTITY NOW SPEAKS MORE THAN ENGLISH (RFC step 4, 2026-08-12)

**She could not learn Ote's name in Ote's language.** Measured across nine languages on 2026-08-10, the
pattern detector interpreted **one** — English. `ผมชื่อโอต` captured nothing. The 2026-08-10 fix made that
detector more *precise*; nothing can make a list of one language's phrasings multilingual.

So the halves swapped, which is the actual idea and not just "add an LLM":

> **The LLM INTERPRETS. Deterministic code ADOPTS, and is the only thing that writes.**

The four invented names were never a detector being bad — they were **detection committing straight to
belief.** So the model's answer now passes four deterministic filters before it is even an observation:

| # | filter | what it buys |
|---|---|---|
| 1 | **assertion gate** | quoted/pasted regions are removed *before* the model reads the turn — the gate that existed and never ran on this path, which is how `"But if I'm being your daughter…"` became his name |
| 2 | **explicit act** | `assert · prefer-address · correct` only. Anything else, including an unknown string, is not a naming act — **Ote's floor (c)**, kept under the ASK "either way" |
| 3 | **verbatim spans** | the name *and* the quoted evidence must appear literally in the turn, and the name must sit inside the evidence. **This is the language-neutral one** — it needs no lexicon and no idea what a name looks like, so it refuses an invented Thai name by the same code path as an English one |
| 4 | **function words** | last line only, for the one failure shape with live evidence. Deny-lists fail open, so it is never the mechanism |

⚠️ **The regex is the FLOOR now, not the mechanism — and it must not be deleted yet.** Step 5 removes it,
and only after `test/repro/identity-multilingual.mjs` proves the model in Thai. That file is the gate:
it runs the same ten sentences past both interpreters and prints a per-language table.

**A cue lexicon decides whether to spend a model call** — not whether anything is true. That inversion is
what makes a word list acceptable here when it was not acceptable as a detector: over-triggering costs one
CPU aux call, under-triggering misses a name. Both are cheap; a wrong *belief* was not.

⚠️ **A measured recall hole, recorded rather than papered over:** the two turns that most need identity
carry no cue at all — a bare correction (*"no, it's Ote not Otto"*) and the answer to a direct question
(*"โอต"*). Widening the lexicon means firing on every short turn, and his best interventions are four-word
interrupts. So the lexicon stays narrow and the ASK gets a door past it (`requireCue: false`) — **step 5's
held turn is what walks through it.**

## 🙋 SHE ASKS BEFORE SHE RENAMES YOU (RFC step 5, 2026-08-12)

The gate is three answers and nothing else:

```
empty slot      → ADOPT   she simply learned who they are. Nothing is at risk, nobody is interrupted.
same value      → NOOP    already known. The store is idempotent; no duplicate row.
different value → ASK     a CHANGE to how she addresses someone. Never silent, in EITHER direction.
```

⚠️ **The wrong answer on a change is not "picks wrong" — it is "picks at all."** Only the human owns
their own name. Before this, a second name was *deferred*: logged, dropped, and he was never told.

**The ASK is HumanInteraction's held turn**, the mechanism he chose. ⚠️ **It is the first
runtime-initiated interaction** — every ask until now came from the model calling `ask_user` inside its
own turn, and the Feature says outright it "does NOT decide WHEN to ask (the model does)". That still
holds: nothing *decides* to ask, the deterministic gate does, in the one case where silence would mean
overwriting a name she was given. The mechanics needed no change because `askInteraction` was never
model-specific — it persists a session, emits the protocol, and holds a **promise**. The model's held
turn is one caller; the identity capture task, already fire-and-forget, is another. The consequence to
know: **the question arrives after her reply has streamed**, which is honest about what happened.

`ask` is an **optional, domain-shaped port**: `ask({attribute, from, to}) → {adopt, value?}`. It says
what the component needs to know, never how a host obtains an answer — a verb-shaped `ask_user(questions)`
would have dragged a question schema and a conversation id into cognition that has no business with either.

⚠️ **Absent ⇒ DEFER, and that is a tested promise.** "Cannot ask" must never degrade to "assume" —
that would be the four invented names again wearing a politer name. A skip, a timeout, a closed page, a
thrown error and "keep what you have" are all the *same* answer, and it is **no**. Free text is a real
answer: *"actually call me Z"* adopts Z, because they are the only authority on their own name.

**And the English regex is gone.** `interpretIdentity` and its ~150 lines of patterns, deny-lists and
capital-evidence machinery are deleted; `memory-identity.js` is now the identity *vocabulary* and the
*adoption gate*, which were never the problem. ⚠️ **The degradation changed deliberately:** with no
model reachable, identity capture now does **nothing** rather than guessing from English sentence
shapes. Two interpreters with different rules, where the weaker speaks only when the stronger is silent,
runs the fuzzy guess exactly when you would least want it.

⚠️ **`repro/identity-multilingual.mjs` is now the only thing standing between a model swap and losing
Thai again.** Nothing in the pass/fail suite would notice. Run it after touching the prompt, the
filters, or `memory.identityModel`.

### 🐛 And the bug the ASK exposed — `setIdentity` never superseded anything

The first live run of `identity-ask-on-change.mjs` went **all-green with a broken slot**:

```
preferred_name = "Ote"   (live)      ← two writers both saw an empty slot
preferred_name = "Ote"   (live)
preferred_name = "Otto"  (live)      ← the answered ASK never superseded either
```

`setIdentity` was a bare INSERT. That was *correct* under the old policy — the comment above it said
"Phase 1 only ADDS (into an empty slot) or reinforces", because a change was always deferred, so it was
never called with a differing value. **Step 5's ASK made that precondition false, and I rewrote that
comment while changing the policy it described.**

🔑 **A comment naming an invariant is a PRECONDITION, not decoration.** The thing to do with it is
check whether your change breaks it — not edit it to match.

🔑 **And every check passed because they all asked "is the newest value right?"** — and it always was.
A test that reads the way the code reads cannot find a bug in how the code *writes*. Both suites now
assert the **slot**: exactly one live row, the old one archived, the new one pointing at what it replaced.

⚠️ **The duplicate came from a real race** — identity capture and the fact extractor both reach the
Identity Resolver and only the extractor rides the serial write lane. The obvious fix (serialize
identity too) is now the **wrong** one: an identity commit can hold for **five minutes** waiting for a
human, and on the write lane that stalls every other memory write for the duration. So the race is
closed in the **store** — `setIdentity` converges the slot — which is the principle the rest of memory
already uses: *the datastore guarantees convergence, not the caller.*

**Also fixed here:** `memory.identityEnabled` had been *read* since 2026-07-30 and **never registered**.
`getSetting()` throws on an unknown key, the host's `try/catch` returned the default, and identity capture
therefore had **no off switch** for six weeks. Found by checking every `getSetting()` literal in `app/`
against the live `SETTING_KEYS` — 101 of 102 resolved. ⚠️ **A defensive try/catch around a lookup hides a
typo forever**, and a unit test now asserts every key the identity host reads is registered.

## Next, in order

1. **The chat UI**, replacing the placeholder — she has no face yet, and `/chat` is what he actually uses.
2. **The local model manager** — the half of shape (a) that is still missing. `providers/ollama.js` is a
   *client*; GPU arbitration via `/api/ps`, residency decisions, and surviving a dead `llama-server`
   mid-stream are what make owning local models real. OLS's `local-monitor.js` is prior art.
3. **`persona.lock.json` integrity.** Every project records `"integrity": null`, so the lock names
   versions but cannot notice the shared tree changing underneath her. Now fixable — each component has
   a git history to pin to.
4. **A fresh clone of this repo cannot boot.** `persona.json` points at `../../../../../PortableComponents`,
   outside her repo. Independently versioned components make this solvable; it needs a resolution story
   (submodules? `file:` deps? a fetch step?) and that shape is his call.

*(Memory service capture→reconcile→recall is LIVE — it is what produced the four memories analysed above.
The relevance floor [R4] and queued≠saved [R8] are still unbuilt, and live in the service, not the schema.)*
