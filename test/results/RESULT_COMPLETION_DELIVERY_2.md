# RESULT · COMPLETION DELIVERY · RUN 2 · 2026-08-25 — ⛔ NOT COMPLETED, AND THE REASON IS INFRASTRUCTURE

Companion to `PREREG_COMPLETION_DELIVERY_2.md` (`d31be31`). ⛔ Path A still has **never** reached a natural
terminal state. Three attempts, three different infrastructure deaths — ⚠️ **none of them a fact about the
delegation architecture.**

## ⭐ THE COGNITION RESULT — clean, and separate from everything below

| | |
|---|---|
| **she chose delegate** | ⭐ unprompted, first time in four opportunities |
| **she scoped the brief herself** | `"Please scan drive D:\ …"` — one drive, top-level sizes, junctions/symlinks. ⛔ No roaming; nobody told her to scope it |
| **she did not poll** | one tool call, `seek_advice{mode:delegate}`. ⛔ No `check`, in this or any run |
| **she expected to be told** | *"I'll check back for her results in a moment — want me to just report when they're ready?"* |

⇒ ⭐⭐ **2 delegations → 2 continuation questions · 2 converses → 0.** The question is bound to the MODE.
Delegation leaves her with a question conversation does not, and it is about **being told**, not fetching.
ⓘ §19.3. The T3 datum stays separate — that was behaviour under a prompt.

## ⛔ THE INFRASTRUCTURE FAILURES — quarantined, not findings

| # | what died | evidence | effect |
|---|---|---|---|
| 1 | **Ollama runner** | `std::bad_alloc` + `GGML_ASSERT(batch.slot_batched \|\| batch.size() == 0)`. ⚠️ `/api/ps` reported `qwen3.6:35b` as **25.7 GB resident in VRAM** while `nvidia-smi` showed 840 MiB / 0 MiB — **phantom residency after a runner crash** | E1 attempt 1 died. A plain retry reloaded it |
| 2 | **the harness** | undici's 300 s default aborted a turn **after** the counterpart had answered in 17 s | killed a turn; no assistant message persisted. Raised to 30 min, overridable, ⛔ not infinite |
| 3 | **the Hermes gateway** | process gone, nothing listening on 8642, while holding a live run | ⛔ the run and its deny both lost |

⛔ **None of these is evidence about `seek_advice`.** ⚠️ #1 and #3 are the same box under memory pressure
within half an hour. ⓘ The duplicated question in the conversation is residue of #2 and is noise, not a turn
Ote took.

## ⭐⭐⭐ WHAT THE FAILURES GAVE US ANYWAY

Each death exposed a world the exchange cannot express — §21's four-world taxonomy came entirely from
things going wrong:

```
pending
├── working                    the C: run
├── finished but uncollected   e050f9ea — L1 terminal, L2 never moved (94 min)
├── waiting for input          37ba49a4 — approval.request, nobody listening
└── counterpart gone           the gateway died holding the run
```

⭐ And §20's decisive one: the approval request — **with the flagged command and the valid choices** — was
pushed onto the run's **SSE queue**, which nothing had subscribed to and the sweeper then reaped.
⇒ **Hermes asked precisely. Into a channel our binding never opened.** ⛔ Status polling can never carry an
approval, because the payload only ever exists on the stream.

## ⛔ What was NOT done

⛔ No `observe()`, ever. ⛔ No polling from Sotera. ⛔ No transcript read to supervise her — the approval
payload was left unrecovered rather than obtained by reading her session (§20.3). ⛔ No artificial approval:
the deny was operator-instructed and never landed, because the gateway was already gone. ⛔ No completion
machinery, no UI, no `unfinished()` wiring, no `updated_at` migration. ⛔ `e050f9ea` frozen throughout.

## ⏭ When resumed — and the order is ratified

1. ⭐ **Fix the LIFECYCLE MODEL first** (§21.4). ⛔ Not a notification system on a state that cannot say
   what happened.
2. Then one scoped delegation to a **natural** terminal, and only then measure **L1 → L2 → L3** separately.
3. ⛔ Still: no polling from Sotera, no transcript supervision, no artificial approval.
