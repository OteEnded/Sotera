# AI_CarryOn — Sotera · P1 retention arc

**Rewritten 2026-09-02 15:08 (+07:00).** ⭐ Read this first after a context compaction.

---

# 0 · ⭐⭐⭐ WHERE WE ARE, IN ONE BLOCK

```
✅ V1 COMPLETE                   identity · memory · continuity · composition · persona_global · runtime
✅ retain() SHIPPED + LIVE       the decision-shaped interface for reflection
✅ `persisted` RULED (039)       = durable Sotera-owned state, in ANY store — the ruling was CONDITIONAL
                                 on a reachability measurement, and the measurement passed
✅ 51 of 51 SUITES PASS          both "pre-existing failures" were stale assertions, three of them MINE
▶  P1 · the ~14                  OPEN as measurement + design. ⛔ cannot be answered yet: 0 gen-2 reflections
⏸ AWAITING OTE                   two findings, neither ruled (§3)
```

**Live now:** `:8210` PID **61760**, started **15:03:44**, fresher than every module.
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

# 3 · ⏸ THE TWO THINGS WAITING ON OTE

| ⚠️⚠️ **`remember_fact` — WITHHELD — WAS CALLED** | **4 reflections, 3 separate days, all prompt gen 3.** `toolDefinitions(REFLECTION_TOOLS)` filters the **offer**; `runTool(call.name, …)` filters **nothing**. ⭐ Advertisement is not authorization, and it is **not theoretical**. ⛔ I did not touch dispatch: enforcing the offered set is a behaviour change, and doing it mid-investigation would move the thing being measured |
| --- | --- |
| ⚠️ **provenance of a retained practice** | `note()` hard-codes `origin:'instructed'` → rendered as *"this person told you about your practice directly."* **False** for a practice she concluded in a reflection, and it spends the audit the frequency floor rests on. The enum is `('observed','instructed')` and a reflection-derived practice is **neither**. ⛔ Not fixed — a third origin is a vocabulary decision. Pinned by `F1`/`F2` as a characterisation so the day it changes, they turn red |

---

# 4 · ▶ P1 · THE ~14 — open, and the first answer is "not yet"

> Ote: *"investigate why Reflection recognizes retention but sometimes doesn't invoke `retain()`. Keep the
> investigation forward-only."*

```
81 reflections · tool_generation 1 → 81 · tool_generation 2 → 0 · log_retention_decisions → 0 rows
```

⛔ **Every reflection that exists met the OLD surface**, and pooling the two would measure the surface
changing, not her. ⓘ Gen-2 rows accumulate on their own — reflection is a **20-minute cron** (quiet ≥30 min,
≥4 messages, one per watermark). ⭐ **Nothing needs forcing.**

**What the old corpus DID settle** — ⛔ **the output budget is not the mechanism**: the reflections that
ACTED are the **longer** ones (2,052 vs 1,146 avg chars). Truncation is closed before the measurement starts.

**Three blind spots, named:** ⛔ a recognised-but-not-invoked decision leaves **no row anywhere** but the
prose · acting through a **withheld door** leaves no decision row and scores as "did not invoke" ·
`wrote_memory_id` keeps only `written[0]`. ⇒ **measure with BOTH ledgers** (`tools_used` ∪
`log_retention_decisions`) — costs nothing, changes no behaviour.

⭐ **The procedure is PRE-REGISTERED** in `INVESTIGATION_SOTERA_P1_RECOGNISED_BUT_NOT_INVOKED.md`, written
before any gen-2 data exists so it cannot be tuned to a result. ⛔ No keyword classifier. ⛔ *"Asked the
person"* is its own category, never a loss.

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
