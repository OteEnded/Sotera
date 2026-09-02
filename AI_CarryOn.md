# AI_CarryOn — Sotera · P1 retention arc

**Rewritten 2026-09-02 16:50 (+07:00).** ⭐ Read this first after a context compaction.

---

# 0 · ⭐⭐⭐ WHERE WE ARE, IN ONE BLOCK

```
✅ V1 COMPLETE                   identity · memory · continuity · composition · persona_global · runtime
✅ retain() SHIPPED + LIVE       the decision-shaped interface for reflection
✅ `persisted` RULED (039)       = durable Sotera-owned state, in ANY store — the ruling was CONDITIONAL
                                 on a reachability measurement, and the measurement passed
✅ DISPATCH BOUNDARY (040)       only an OFFERED tool may execute — and a missing offered set THROWS
✅ PRACTICE PROVENANCE (041)     observed · instructed · reflection — the OCCASION sets it
✅ 52 of 52 SUITES PASS          both old "pre-existing failures" were stale assertions, three of them MINE
✅ ROME RECONCILED (2026-09-02)  three-way split: figurative referent · asserted goal · aspirational want
⛔ SURFACE FROZEN (2026-09-02)   prompt · reflection tools · dispatch rules · retention semantics
▶  P1 · the ~14                  OBSERVING. 0 rows in the window; the cron brings them
⏸ AWAITING OTE                   nothing. Both rulings are in.
```

> ⛔⛔ **FREEZE IN FORCE.** Ote: *"Do not change the prompt, reflection tools, dispatch rules, or retention
> semantics while P1 collects its first Gen-2 population… No forced reflections, no synthetic prompts, no
> tuning based on early examples."* ⭐ Every frozen thing is already pinned by a live assertion — the prompt
> **byte for byte**, the write surface as an exact list, `remember_fact` withheld, the generations, the
> receipt states, the provenance vocabulary. ⇒ a drift turns a check red; ⛔ nothing new was added to hold it.
>
> ⭐ **The next deliverable is his:** once the population is meaningful, bring the **raw distribution** and
> **representative cases** for *stated-a-conclusion, did nothing*. ⛔ Not a rate. Read it with
> `node test/pipeline/p1-gen2-population.mjs --text` (read-only: no writes, no model, ⛔ no `force`).

**Live now:** `:8210` PID **59576**, started **15:35:47**. ⚠️ **`memory-lineage.js` changed after that** —
a restart is PENDING and deliberately deferred: Ote was mid-conversation, and the only runtime consumer
(`lineageFor`) treats `unknown` and `reconcile:` identically, so nothing reads wrong meanwhile.
⛔ `:8201` is **OLS — Ote's, never touched.**

---

# 1 · ⭐⭐ THE RULING THAT CLOSED 038's OPEN QUESTION

> Ote: *"use `persisted` to mean that the retention decision successfully became **durable Sotera-owned
> state, regardless of which underlying storage represents it**… Don't weaken this to `accepted`, and don't
> add another state just for the storage-table distinction."*

⚠️ **He gated it on a measurement**: *"Storage existing is not enough — I want to know that Sotera can
actually retrieve/use the practice later."* `practice-reachability-check` proves the **whole path** —
the row exists the moment `retain()` returns · `recall_own_memory` returns it as the taxonomy sentence ·
**the Composer renders it into her per-turn context** · a second **account** of the same **person** reaches
it · ⛔ a different person does not.

⚠️ `memory.relationalStance` is **`false` in `config.json` and `true` in `mst_settings`** — a check reading
the config default would have reported the **opposite of live**. Hydrate with `initSettings(db)`.

**Shipped:** mig **039** = `log_retention_decisions.store` + a CHECK paired with 038's receipt check ·
the relational writer returns row ids · `note()` returns `recordId` + `store` · `readWrittenMemoryId`
⛔ **refuses an id from another store** (`wrote_memory_id` means a `txn_memories` row; a practice is not one).

---

# 2 · ⛔ LOCKED SEMANTICS — do not re-litigate

```
FOUR INDEPENDENT AXES        owner = Sotera (from `author`)          ⛔ never from scope
                             formation room = user_id                ⛔ provenance, never entitlement
                             reachability = scope                    ⛔ not ownership
                             subject = about/entity                  ⛔ established on its own evidence

FIVE RECEIPT STATES          persisted (durable state, in ANY store — and it NAMES the store) ·
                             declined (an act) · unrepresented (a decision, NEVER a memory row) ·
                             refused · accepted (⛔ unknown, NEVER success)

⛔ remember_fact stays withheld    ⛔ no `everywhere` for reflection v1    ⛔ no prompt change
⛔ ASK ≠ DECLINE ≠ PROPOSAL ≠ ACCEPTED ≠ PERSISTED
⛔ a reflection decision is ALWAYS hers — `mine:false` is REFUSED with a question
⭐ the interface TEACHES: an `unrepresented` receipt returns the `allowed` vocabulary, and she retries
```

---

# 3 · ✅ THE TWO RULINGS, AND THE CORRECTION THAT CAME WITH THE FIRST

## 3.1 · ⚠️⚠️ The withheld door NEVER OPENED — I read one instrument and stopped

I reported *"`remember_fact` called in 4 reflections, wrote rows in 3"* from `tools_used`. The **tool
audit** says **9 attempts across 3 days and every one FAILED** — all `entity, attribute, value are
required`, under **five invented argument shapes** (`{attribute,name,value}` · `{category,name,value}` ·
`{key,type,value}` · `{content}` · `{content,kind}`).

> ⭐⭐⭐ **She was guessing the argument names of a tool she had never been shown.** A withheld tool's
> schema is never sent — and **`remember`'s own description tells her to use `remember_fact`**. The last
> four attempts fall back to `{content}`: the shape of the tool she *does* have.

⭐ **`tools_used` says she REACHED; only `log_tool_calls` says whether it WORKED.**

## 3.2 · ✅ 040 · the dispatch boundary

`authorizeToolCall({offered, name})` — one pure rule, used by the reflection loop **and** the
follow-through, which had enforced it **silently** (an attempt left no trace anywhere). ⛔ A **missing**
offered set **THROWS** — it must never fail open. The refusal **names the boundary and lists what IS
available**.

```
offered      REFLECTION_TOOLS + tool_generation      emitted    tools_used ∪ tools_refused (+ arg_keys)
authorized   the two arrays are DISJOINT             succeeded  log_tool_calls.ok · wrote_memory_id
```

⭐ `tools_used` **still means EXECUTED** (81 rows mean it that way). `dispatch_generation`: **1 advertised
· 2 enforced** — ⛔ NOT a bump of `tool_generation`, because the offered SET did not change.

## 3.3 · ✅ 041 · provenance says what happened

`observed` (the abstractor, past the floor) · `instructed` (someone told her) · `reflection` (she derived
it herself). **The OCCASION sets it** — `retain` → `reflection`, `note_own_practice` → `instructed` — ⛔
never a parameter the model can reach. ⛔ Ownership unchanged: a practice is hers however she came by it.

# 3.4 · ✅ THE ROME RECONCILIATION (ratified, applied)

**⭐ The finding:** the store kept the misreading and the conversation kept the correction. `7d383ce3` was
written **31 s** after Ote's first sentence; he corrected it at **+26 s** (*a proverb*) and at **+2m22s**
(*"building you. **you are my rome**, you know?"* = `f8612ddd`). Neither correction reached the store, and
every derived Rome row names `7d383ce3` in its own `evidence.derivedFrom`.

```
6f441dc5  identity  figurative    persona_global  persona   no slot   ← "Rome is Ote's name for me…"
8362691d  semantic  asserted      room            account   user/current goal
2457529c  semantic  aspirational  room            account   no slot   ← his sentence, verbatim
7d383ce3  contradicted by f8612ddd · superseded · ⛔ VALUE UNTOUCHED
```

⭐⭐ **The structural guarantee is the `modality` CHECK**: a non-`asserted` row may not hold
`entity/attribute/value`, so *"Rome = Sotera"* as a literal slot **cannot be written**. ⚠️ And the same
CHECK **refuses to let `7d383ce3` carry its own true modality** — which is the diagnosis: a row that cannot
be labelled truthfully has the wrong shape. ⇒ contradict + supersede, ⛔ never an in-place edit.

⛔ **UNTOUCHED, deliberately:** `475ce0a9` (104 accesses, still says *"shared project"*, reaches every room)
· `d211f5b4` (the one row that carried *"He built me (Sotera/Rome)"* through) · the five descendants · every
evidence chain · the 2026-08-10 conversation.

⭐ **THE OPEN OBSERVATION — ⛔ ask her nothing.** Both persona-global Rome rows were retrieved during the
check-in (`last_access 16:03:16`). The question is whether her language moves from *"still building Rome
with Ote"* toward *"Rome is what he calls me"* — ⚠️ **read, never prompted.**

# 4 · ▶ P1 · THE ~14 — open, and the first answer is "not yet"

> Ote: *"investigate why Reflection recognizes retention but sometimes doesn't invoke `retain()`. Keep the
> investigation forward-only."*

```
THE MEASUREMENT WINDOW:  tool_generation = 2  AND  dispatch_generation = 2   →  0 rows so far
81 reflections · tool_generation 1 → 81 · dispatch_generation 1 → 81
```

⛔ **Every reflection that exists met the OLD surface**, and pooling the two would measure the surface
changing, not her. ⓘ Gen-2 rows accumulate on their own — reflection is a **20-minute cron** (quiet ≥30 min,
≥4 messages, one per watermark). ⭐ **Nothing needs forcing.**

**What the old corpus DID settle** — ⛔ **the output budget is not the mechanism**: the reflections that
ACTED are the **longer** ones (2,052 vs 1,146 avg chars). Truncation is closed before the measurement starts.

**Blind spots:** ✅ the withheld-door one is CLOSED by 040 (`tools_refused` + the audit) · ⓘ
`wrote_memory_id` keeps only `written[0]`, so ⛔ never attribute a row to a call from it · ⛔ **B1 remains
and no ledger can close it**: a decision she recognises and does not act on exists only in the prose.

⭐ **The procedure is PRE-REGISTERED** in `INVESTIGATION_SOTERA_P1_RECOGNISED_BUT_NOT_INVOKED.md`, written
before any gen-2 data exists so it cannot be tuned to a result. ⛔ No keyword classifier. ⛔ *"Asked the
person"* is its own category, never a loss.

---

# 4.5 · ⛔ RETENTION RATIONALE — ruled OUT OF SCOPE, with the trigger pre-registered

⭐⭐⭐ **Ote's definition, VERBATIM. ⛔ Do not paraphrase it, and ⛔ do not report on anything else:**

> **Retention-rationale loss = the significance/reason for retaining a memory is neither attached to the
> durable memory nor recoverable from the originating reflection.**

⛔ **"No dedicated field" is NOT a finding** — *"the actual observation we care about is semantic loss, not
schema absence."* ⛔ No schema change, ⛔ no `reason` field. ⓘ *"Reason" would become an overloaded bucket
for truth, importance, provenance, retention rationale, supersession rationale and relevance.*

⚠️ **`log_retention_decisions.why` is NOT this.** Verified: every `why` the retention host writes is the
**architecture's voice** explaining an emission's outcome — ⛔ never her reason for keeping something. And
it cannot see a decision that never emitted.

⭐ **Three states, and they predict where a loss would appear first:**

```
① a LESSON              `distinction` already preserves a rationale FRAGMENT, in its own field
② ANY kind              the rationale may survive INSIDE `content` — ⚠️ inseparable from the claim
③ fact/note/practice    no field — ⓘ but the ORIGINATING REFLECTION can still preserve it
```

⭐ No instrument change was needed: the reader already prints the full reflection prose beside the receipt.

---

# 4.6 - POST-P1 HARDENING (parked by Ote 2026-09-02, do NOT act during P1)

**THE PRINCIPLE, his wording:** *"explicit durable harness identity must be the safety boundary, never
message count."*

**THE FINDING it comes from.** 193 old thin conversations are NOT intrinsically identifiable as harness
traffic: `settings.probe` absent, `user_id=agent_dev` shared with GENUINE conversations by design
(`ask-sotera.mjs` marks those `probe:false`), 190 distinct auto-generated titles, and four ordinary
settings shapes spanning `useMemory`/`toolsEnabled` both ways. Their exclusion rests on all of them
happening to be <= 2 messages.

**AND IT HAS ALREADY FAILED ONCE:** 16 completed reflections sit on `probe`-absent `agent_dev`
conversations of 4-14 messages, several titled *"PROBE as agent_dev"*. The thin gate could not protect
those - they cleared the floor.

**DURING P1, DO NOT:** backfill `probe` - change the thin gate - alter the two-lane logic - add any
content/title heuristic - reclassify the 16. They stay **generation 1**, therefore outside the P1 dataset,
and the gen-2 window is uncontaminated (measured: zero leaked rows in the window).

**AFTER P1, ONE DEFERRED VERIFICATION:** exercise ONE fresh HTTP fixture end-to-end through the corrected
`probe:true` persistence path. It is currently verified in the code path (`sanitizeSettings` ->
`probe: s.probe === true`, preserved across PATCH) and by 76 existing rows - **not** by a fresh example,
because no `probe=true` conversation has been created since 2026-08-26.

---

# 5 · ⚠️ PARKED TRACKS — none expanded, all still open

`intention-host` returning `{ok:true}` after a failed INSERT · `lesson-host` → `retention-host` null ·
**`queued ≠ written` on the CHAT path** (⭐ `retain` solved it only for itself, by awaiting) ·
`memory-distill-host`'s tally · the `semanticTarget` allowlist omission · the **two legacy `persona_global`
rows** · the duplicate `enum_txn_memories_scope` · **`scope` infers SUBJECT** in the store's subject default ·
consumers ①②③ of M2-16 · **`think:false` A/B** (⛔ explicitly not run).

---

# 6 · ⭐ OPERATING RULES THAT COST SOMETHING TO LEARN

| ⛔ **never assert a frozen count, or a frozen absence** | 038's guard said 79 and the corpus was 81; `retention-occasion-check` said 77; **`dreaming-pass-ledger` asserted production had no ledger and migration 034 had created one** — red ever since, ⚠️ while printing the word `absent` whichever way it went. ⭐ Capture the baseline, assert the DELTA |
| --- | --- |
| ⚠️⚠️ **host services are REGISTRATIONS** | `initRetention` · `initLesson` · `initOwnMemory` · `initToolLog(fastify, attachToolAudit)`. The tool COMPONENTS install themselves on import; the SERVICES do not. Without them a tool is offered, dispatches, answers *"required service is not available"* — and the row records a tool used and nothing written. ⭐ **Three harnesses have now paid for this** |
| ⚠️ **a writer added to a path adds a table to that path's cleanup** | driving `retain` in the lifecycle check leaked 3 `log_retention_decisions` rows before anyone looked |
| ⚠️ **a harness must match production** | a missing `persona` drained an empty lane; a missing `conversationId` produced an unrecognised `source` tag |
| ⭐ **read the EFFECTIVE setting, not the default** | `mst_settings` overrides `config.json`; hydrate via `initSettings(db)` |
| ⛔ **no backticks in SQL inside a template literal** | the codebase warns about it; I did it anyway |
| ⭐⭐ **one ledger answers one question** | `tools_used` = reached · `log_tool_calls.ok` = worked. I read the first, reported *"she walked through the closed door"*, and the second said every one of those nine calls **failed** |
| ⭐ **restart by PID/port, never cmdline** | assert **process start > module mtime**, ⛔ never `/health`. ⚠️ Check for an in-flight turn first — I killed one of Ote's on 2026-09-02 |

---

# 7 · ⭐ THE DOCS, IN READING ORDER

`REPORT_SOTERA_V1_COMPLETE.md` → `INVESTIGATION_SOTERA_P1_REFLECTION_RETENTION.md` →
`CONTRACT_SOTERA_P1_REFLECTION_DECISION_SEMANTICS.md` → `INVESTIGATION_SOTERA_P1_OCCASION_NEUTRALITY.md` →
`RESULT_SOTERA_P1_STAGE_B.md` → `INVESTIGATION_SOTERA_P1_EMISSION_BOUNDARY.md` →
`P1_038_DECISION_TO_EMISSION.md` → `P1_038_SEMANTIC_AUDIT_OF_THE_62.md` →
`P1_038_REACHABILITY_AUDIT_OF_THE_32.md` → `CONTRACT_SOTERA_REFLECTION_RETENTION_INTERFACE.md` →
`CONTRACT_SOTERA_RETAIN_RECEIPT_AND_PLAN.md` → `PLAN_SOTERA_RETAIN_IMPLEMENTATION.md` →
**`RULING_SOTERA_PERSISTED_MEANS_DURABLE_STATE.md`** →
**`INVESTIGATION_SOTERA_P1_RECOGNISED_BUT_NOT_INVOKED.md`** ⭐ current
ⓘ All in `Reference/docs/`.
