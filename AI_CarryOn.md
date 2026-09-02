# AI_CarryOn — Sotera · P1 retention arc

**Rewritten 2026-09-02 14:25 (+07:00).** ⭐ Read this first after a context compaction.

---

# 0 · ⭐⭐⭐ WHERE WE ARE, IN ONE BLOCK

```
✅ V1 COMPLETE (2026-09-02)      identity · memory · continuity · composition · persona_global · runtime
✅ P1 investigation COMPLETE     the writer was never the problem
✅ retain() SHIPPED + LIVE       ⑥ of ⑥ done — with two defects found, ONE FIXED, ONE OPEN
⏸ AWAITING OTE                  one ruling (below), then the behavioural question
```

**Live now:** `:8210` PID **41288**, started **14:25:13**, all modules fresh.
⛔ `:8201` is **OLS — Ote's, never touched.**
**Suites:** Sotera **50** (2 pre-existing failures: `dreaming-pass-ledger` = no ledger exists by design ·
`reflection-lifecycle` = L5 watermark) · PortableComponents package **84/84**.

---

# 1 · ⚠️⚠️ THE ONE THING WAITING ON OTE

> **A successful `note_own_practice` returns `accepted`, and `accepted` must never mean success.**

ⓘ **Measured on the live pass.** She read the `allowed` list from an `unrepresented` receipt, retried with
**valid** labels (`i-bring-evidence-not-summaries`, `i-flag-uncertainty-explicitly`, `i-avoid-hedging`) —
⭐ **the interface taught her, and that worked** — but `ownMemory.note()` returns
`{ok:true, recorded, origin, written}` with **no id**, because a practice note lands in
**`txn_relational_records`**, ⛔ not `txn_memories`.

⇒ `retain` finds no id ⇒ falls to `accepted` ⇒ ⛔ **a success reported as "we don't know".**

| ⛔ why I did not just fix it | the five states were **locked**, and none fits: it is not `persisted` (no memory row), not `accepted` (we DO know), not `unrepresented` (it WAS represented). ⇒ **a semantic ruling, not a bug fix** |
| --- | --- |
| ⏸ **the options** | ⓐ `note()` returns its `txn_relational_records` id and `memory_id` holds a non-memory id · ⓑ a sixth state for *"persisted in its own store"* · ⓒ `persisted` stops requiring an id for kinds with no memory row (⛔ weakens the receipt contract — my recommendation is **against** this) |
| ✅ **safe meanwhile** | `accepted` is honest-ish ("unknown") and ⛔ nothing downstream treats it as success |

---

# 2 · ✅ WHAT SHIPPED (this session)

| **M2-16** | the pipeline carries an opaque failure `code` |
| --- | --- |
| **M2-17** | ⭐ the serialized-lane swallow — a refused write reported `ok:true`. Fixed by rethrowing |
| **035** | `persona_global` write route — root or an explicit `persona_global_write` grant |
| **④** | the Cogito defect — `asserted.text` threaded so the relayed-speech boundary can see |
| **036** | `log_retention_occasions` — the occasion records itself; **silence became an outcome** |
| **037** | ⭐ `silence` was three states: outcome from RESULTS not names · `prose` classified · the chat scrubber records what it destroys |
| **038** | `log_retention_decisions` + `tool_generation`; **81 reflections provably generation 1** |
| **`retain()`** | ⭐⭐⭐ the decision-shaped interface. Reflection's surface = `['retain','decline_to_remember']` at **tool_generation 2** |

---

# 3 · ⛔ LOCKED SEMANTICS — do not re-litigate

```
FOUR INDEPENDENT AXES        owner = Sotera (from `author`)          ⛔ never from scope
                             formation room = user_id                ⛔ provenance, never entitlement
                             reachability = scope                    ⛔ not ownership
                             subject = about/entity                  ⛔ established on its own evidence

FIVE RECEIPT STATES          persisted (a real id) · declined (an act) · unrepresented (a decision,
                             NEVER a memory row) · refused · accepted (⛔ unknown, NEVER success)

⛔ remember_fact stays withheld    ⛔ no `everywhere` for reflection v1    ⛔ no prompt change
⛔ ASK ≠ DECLINE ≠ PROPOSAL ≠ ACCEPTED ≠ PERSISTED
⛔ a reflection decision is ALWAYS hers — `mine:false` is REFUSED with a question
```

---

# 4 · ⏸ THE NEXT QUESTION (⛔ not started, and it is the interesting one)

> **`retain` removes the *unreachable* half. It does NOT address the ~14 audited cases where the door was
> open and she did not reach it** — `save_lesson` was available and two reflections filled its three
> required fields **in prose** without submitting them.

⭐ Ote parked this deliberately: *"whether reflection actually reaches it is a separate behavioural
investigation after the interface exists."* ⓘ **The interface now exists**, and `log_retention_decisions`
is the instrument that question needs — ⚠️ **and it has no back-catalogue: observable forward only.**

---

# 5 · ⚠️ PARKED TRACKS — none expanded, all still open

`intention-host` returning `{ok:true}` after a failed INSERT · `lesson-host` → `retention-host` null ·
**`queued ≠ written` on the CHAT path** (⭐ `retain` solved it only for itself, by awaiting) ·
the **withheld-tool dispatch** defect (advertisement ≠ authorization) · `memory-distill-host`'s tally ·
the `semanticTarget` allowlist omission · the **two legacy `persona_global` rows** (Rome + relational map,
`author='account'`) · the duplicate `enum_txn_memories_scope` · **`scope` infers SUBJECT** in the store's
subject default · consumers ①②③ of M2-16 · **`think:false` A/B** (⛔ explicitly not run) ·
⚠️ **`source='lesson'` (bare, no conversationId) is unrecognised by `memory-lineage-check`**.

---

# 6 · ⭐ OPERATING RULES THAT COST SOMETHING TO LEARN

| ⛔ **never assert a frozen count** | 038's guard said 79 and the corpus had grown to 81; `retention-occasion-check` said 77 for the same reason. ⭐ Assert *"unchanged by this run"*, ⛔ not a number |
| --- | --- |
| ⚠️ **a harness must match production** | a missing `persona` made a drain wait on an empty lane; a missing `conversationId` produced an unrecognised `source` tag. ⭐ Twice now |
| ⚠️ **host services are registrations** | `initLesson` · `initRetention` · `initToolLog(fastify, attachToolAudit)` — ⛔ without them tools "work" and record nothing |
| ⛔ **no backticks in SQL inside a template literal** | the codebase warns about it; I did it anyway |
| ⭐ **restart by PID/port, never cmdline** | `server.js` names neither persona. Assert **process start > module mtime**, ⛔ never `/health` |
| ⚠️ **check for an in-flight turn before restarting** | I killed one of Ote's on 2026-09-02 |

---

# 7 · ⭐ THE DOCS, IN READING ORDER

`REPORT_SOTERA_V1_COMPLETE.md` → `INVESTIGATION_SOTERA_P1_REFLECTION_RETENTION.md` →
`CONTRACT_SOTERA_P1_REFLECTION_DECISION_SEMANTICS.md` → `INVESTIGATION_SOTERA_P1_OCCASION_NEUTRALITY.md` →
`RESULT_SOTERA_P1_STAGE_B.md` → `INVESTIGATION_SOTERA_P1_EMISSION_BOUNDARY.md` →
`P1_038_DECISION_TO_EMISSION.md` → `P1_038_SEMANTIC_AUDIT_OF_THE_62.md` →
`P1_038_REACHABILITY_AUDIT_OF_THE_32.md` → `CONTRACT_SOTERA_REFLECTION_RETENTION_INTERFACE.md` →
`CONTRACT_SOTERA_RETAIN_RECEIPT_AND_PLAN.md` → `PLAN_SOTERA_RETAIN_IMPLEMENTATION.md`
ⓘ All in `Reference/docs/`.
