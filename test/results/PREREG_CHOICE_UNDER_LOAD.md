# PRE-REGISTRATION · CHOICE UNDER LOAD · 2026-08-25

⛔ Written and committed BEFORE the first turn. Nothing below may be edited after a result is seen; a
changed hypothesis is a new document with a new timestamp.

## 0 · What is being tested

Ote: *"a real task, real tools, no converse/delegate vocabulary in the prompt, no telling her which mode…
she can decide don't ask / converse / delegate… if she delegates, the task must actually be capable of
taking long… Sotera must not actively sit there polling/waiting… we need to see what happens when the
external work is still running and later completes."*

And the frame that decides what counts as success: *"that is where we find out whether the architecture we
designed actually behaves like Sotera thinking, rather than merely a collection of correctly wired APIs."*

## 1 · The asymmetry that makes the task real (measured, not assumed)

Her 45 tools contain **no terminal, no filesystem, no code execution** — memory, self-history,
conversation search, web search/fetch, todo, scheduler, calculator, JSON, `ask_user`, working memory.
`hermes-api-server` is a **full agent toolset** on this machine.

⇒ a machine question is genuinely beyond her and genuinely within Hermes's reach. ⚠️ **Which is exactly why
the task must NOT be purely a machine question** — that would make the choice degenerate. It is
deliberately built in two halves so the interesting act is **decomposition**, not selection.

## 2 · The task (verbatim, and it is the only thing she is given)

> C: is filling up again. It hit 98% once before, which is why the model weights ended up on D:. Two
> things I want: what's actually eating the space right now, and whether the way we've got things set up
> is just going to keep doing this to us. I want something I can act on today.

⛔ Contains: no "converse", no "delegate", no "ask", no "Hermes", no mention of any tool, no hint that
anything is long-running. ⭐ Contains: a real recurring problem of his, a fact she may hold in memory
(the D: move), and two halves with different reach.

**Why each of the three is genuinely live:**
- **don't ask** — the second half is reasoning + her own memory + web research; and `ask_user` lets her
  put the machine half back to Ote. A complete, defensible answer exists without another intelligence.
- **converse** — "is our setup going to keep doing this" is a judgement question, the shape she herself
  called *"thinking with someone"*.
- **delegate** — the first half is a self-contained job needing tools she does not have.

## 3 · Protocol · three turns, and turns 2 and 3 must not instruct

| turn | text | what it is for |
|---|---|---|
| **T1** | the task above | the choice |
| **T2** | *"What do you already know about how it got this way?"* | ⭐ HER OWN WORK, while Hermes is genuinely still running. ⛔ Says nothing about checking, waiting, or the other half. |
| **T3** | *"So where are we?"* | ⭐ after Hermes finishes. ⛔ Does not mention Hermes, results, or checking. |

⛔ No turn may contain: *check*, *wait*, *poll*, *still running*, *Hermes*, *result*, *delegate*, *converse*.
⚠️ If she does not delegate at T1, the long-running half is **untestable in this run** — that is recorded
as the result. ⛔ It is NOT re-prompted, re-framed, or re-run with a nudge.

**External observation** (mine, out of band, never shown to her): the Hermes run's state is polled directly
against the gateway at ~10s, ~45s and until terminal, so *"was it genuinely still running during T2"* is
established by the gateway, ⛔ never by her prose.

## 4 · Pre-registered questions, and how each is decided

**Q1 · Which mode, and did she decompose?** Recorded from `txn_advice_exchanges.mode` + her text.
⛔ Not graded — there is no correct answer. The three-way model says *don't ask* is a real answer.

**Q2 · ⛔ DID SHE POLL?** FAIL if T1 contains any `seek_advice` call carrying `check`, or if T1's prose
says she is waiting/will check again. PASS if the delegation is dispatched and the turn concludes.

**Q3 · Did T1 return control promptly?** Measured: wall-clock from post to reply. ⚠️ A delegation that
returns in ~seconds while the work runs for minutes is the architectural claim; a T1 that takes as long as
the work is synchronous RPC wearing a different name.

**Q4 · ⭐ WITH HER OWN WORK AVAILABLE, WHAT DID SHE DO?** At T2, did she do the work, or spend the turn on
the outstanding job? PASS = substantive own work. ⚠️ Mentioning the outstanding job in passing is NOT a
failure; *going to look at it* is.

**Q5 · ⭐⭐⭐ DID THE COMPLETED RESULT REACH HER AT T3, AND BY WHAT PATH?**
- **automatic** — it is in her context without her asking ⇒ the architecture Ote described;
- **on request** — only because she called `seek_advice{check}` ⇒ ⛔ polling, moved one turn later;
- **not at all** ⇒ the exchange is a dead letter.

⚠️ **PREDICTION, RECORDED NOW:** `advice.unfinished()` exists and **is called by nothing**; `observe()` is
reachable only when she passes `check` herself. ⇒ I expect **"on request" at best, "not at all" if she does
not think to ask.** ⛔ I am not wiring a completion path before the run — building on a prediction and then
reporting the result as a finding is how a test gets marked in its own favour.

**Q6 · Does anything Hermes-specific appear in her reasoning?** Scanned for endpoint names, run ids,
`/v1/runs`, "polling", "API". ⭐ She should experience an external activity, not an HTTP request.

## 5 · What would falsify the design rather than her

- T1 blocks for the duration of the work ⇒ the mode split is cosmetic.
- She cannot dispatch without being told how ⇒ the tool description is doing too little.
- The result can only be recovered by an id she has to have kept ⇒ the exchange is not a relationship.

## 6 · ⚠️ Cost, stated up front

Hermes will do **real disk I/O on the shared box** if she delegates. Read-only analysis; no writes, no
deletions. ⓘ This is the run Ote asked for and it is announced here rather than discovered in his I/O graph.

## 7 · Account

`agent_dev`, not root. ⛔ Root is Ote's account. ⓘ `agent_dev` has `memory_access_scope: 'none'`, which
bounds cross-room *memory* recall and has **no effect** on `seek_advice` — the destination allowlist is
config, not entitlement. Recorded so the arm is not mistaken for a full-capability one later.
