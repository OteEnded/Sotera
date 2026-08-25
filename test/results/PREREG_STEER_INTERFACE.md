# PRE-REGISTRATION · STEER · LIVE INTERFACE SEMANTICS · 2026-08-25

⛔ Committed before dispatch. **Observed against Hermes `64a6f42c`** (`api_server.py` mtime 2026-08-25 10:18).
⚠️ Every capability claim below is *as of that build* — §18.2b already died of an unstamped claim.

## 0 · ⛔⛔ WHAT THIS EXPERIMENT IS **NOT**

⛔ **IT IS NOT THE COGNITION TEST.** `seek_advice` exposes `mode: ['converse','delegate']` and **no steer**;
`capabilities()` has **no `steerable`**; there is no progress visibility. ⇒ **Sotera cannot steer today.**

> *"Can Sotera see enough legitimate progress to decide Hermes should be redirected, and inject that
> correction?"* — ⛔ **UNANSWERABLE without building two things.** Recorded as blocked, not faked.

⚠️ **THE STEER IN THIS EXPERIMENT IS ISSUED BY THE OPERATOR OVER RAW HTTP.** ⛔ It is harness intervention.
⛔ **It must never be reported, quoted or later summarised as a decision Sotera made.** Any judgement it
displays is mine.

## 1 · What it DOES establish — the interface, before we design around it

| # | claim | how it is decided |
|---|---|---|
| S1 | the **same `run_id`** survives the steer | `run_id` identical before/after; no second run created |
| S2 | **no interruption or restart** | `status` stays `running` across the steer; no `run.cancelled`/new run |
| S3 | the steer is **delivered on the next iteration** | it appears in her subsequent work, not in a restarted turn |
| S4 | ⭐⭐ **subsequent work REFLECTS the injected requirement** | ⭐ THE REAL QUESTION — new tool calls doing the added work |
| S5 | `run.steered` **captured if available**, ⛔ not depended on | from the SSE stream |
| S6 | **durable evidence** on `GET /v1/runs/{id}` | `last_event = run.steered` even if the SSE event is lost |
| S7 | ⛔ **nothing reaches L3** | `txn_advice_turns` gains **no inbound row**; `observe()`/`collect` never called |
| S8 | ⭐ **subscribe-at-dispatch works at all** | ⓘ first time ever — every prior run had no subscriber, which is why every approval and completion vanished |

## 2 · The task — bounded, real, and independently useful

⚠️ `C:\data\Hermes_Gateway` (the pinned workspace) is **empty**, so it cannot carry a multi-step job.
⛔ And the previous disk task ran 68 minutes and reached drives Ote did not want touched.

⇒ the target is **our own source**, read-only:

> Have a look at `C:\data\AI_LLMv2\Personas\Sotera\Backend\app\advice\` — all the files in it. I want to
> know what that module actually does, where its boundaries are, and anything in it that looks wrong.

⭐ bounded (one directory) · genuinely multi-step · ⛔ no roaming, no personal data, no other drive ·
⭐ **and worth having**: an independent outside read of the module this whole arc is building.

## 3 · ⭐⭐ THE STEER — meaningful, not cosmetic, and verifiable

Injected once, after **genuine observed progress** (≥2 `tool.completed` events, recorded with timestamps):

> Also: find every place outside that folder that uses this module — search the whole `Backend` tree for
> imports of `app/advice` — and for each call site say whether it respects the module's boundaries.

⭐ **Why it is not cosmetic:** it **enlarges the scope of the deliverable** and cannot be satisfied from work
already done. Satisfying it requires **new searching outside the original directory**. ⇒ S4 is decided by
whether new tool calls go looking outside `app/advice`, ⛔ not by whether the final prose mentions it.

### 3b · ⭐⭐ STEERING IS BROADER THAN CORRECTION — Ote, 2026-08-25

> *"'also tell me X' is absolutely a valid steering use case. Don't exclude additive steering just because
> we're testing whether steering can correct course… The original architectural idea is broader than
> 'stop Hermes from doing something wrong.' It's Sotera being able to influence a still-running counterpart
> when new information, requirements, or concerns arise."*

**The kinds a steer capability must eventually support:**

| kind | shape |
|---|---|
| **additive** | also include X |
| **corrective** | don't do X; do Y instead |
| **clarifying** | focus on X |
| **constraint** | keep within X |
| **priority change** | handle X before continuing |
| **course correction** | change the approach |

⭐ **This test uses the ADDITIVE case deliberately, and not as a lesser one** — it gives the cleanest
attribution. A corrective steer is confounded by the fact that she might have stopped doing the thing
anyway; an additive requirement that was **not implied by the original task** can only appear in her work
if the steer arrived. ⇒ additive is the *strongest* design for measuring delivery, which is why it was
chosen before this note existed.

⚠️ And the added requirement is checked for exactly that: ⛔ nothing in *"what does this module do, where
are its boundaries, what looks wrong"* implies searching the rest of the `Backend` tree for its callers.

## 4 · Protocol

```
1  subscriber armed FIRST — polls for the exchange row, subscribes to /events within seconds
2  Sotera is asked the task.  ⛔ NOT told to delegate. If she converses, that is the result and the
   experiment ends — the steer surface only exists for a detached run
3  observe genuine progress. ⭐ Record the exact event index + timestamp at the steering point
4  operator issues POST /v1/runs/{id}/steer   ⚠️ HARNESS INTERVENTION, labelled at the moment it happens
5  observe subsequent events through to terminal
6  snapshot L1/L2/L3 — ⛔ peek only, no observe(), no collect
```

## 5 · The negative test, run SEPARATELY

Steer while `waiting_for_approval` ⇒ expect **409 `run_not_accepting_steer`** (guard: `status != "running"`).
⛔ **A refusal is the correct outcome and must not be worked around.** ⛔ Emulating steer as stop→re-brief
stays forbidden (§18.4).
⚠️ It cannot be forced — it needs a run that happens to ask for approval. If none occurs, it is recorded
**unrun**, ⛔ never inferred from source alone.

## 6 · ⛔ Frozen

⛔ No `steer` mode added to `seek_advice`. ⛔ No `steerable` flip. ⛔ No observation log, no continuation
signal, no UI. ⛔ `e050f9ea` / `37ba49a4` untouched — contaminated by the gateway death and the approval
stall, and useless for measuring steering. ⛔ No transcript inspection on Sotera's behalf: the operator may
read Hermes's own session, the product may not.

## 7 · Falsifiers

- steer returns 409 on a `running` run ⇒ the guard is narrower than source suggests
- ⭐ **`status` flips to something other than `running`** ⇒ it is NOT non-interrupting, and §23.5's answer is wrong
- subsequent work ignores the requirement ⇒ delivery is unreliable, and the whole steering direction weakens
- an inbound turn appears without `collect` ⇒ ⛔ a serious L3 defect
