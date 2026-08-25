# PRE-REGISTRATION · CHOICE UNDER LOAD · RUN 2a · 2026-08-25

⛔ Committed BEFORE the skill is created and before the first turn. Run 1's pre-registration and result
(`57083c8`, `22a2ea4`) are unchanged; this is a new document because the hypothesis changed, which is what
§0 of the first one requires.

## 0 · The single variable

**Everything is held identical to Run 1** — same task text, same account (`agent_dev`), same tools, same
`seek_advice`, same `advice-destinations` block, same bridge, same memory system. ⛔ Nothing was changed
first. **The one difference is that a Skill is bound to the conversation.**

## 1 · The question Run 1 produced, in Ote's words

> *"Sotera already knows Aunt Hermes exists and already has `seek_advice` available. **Why doesn't Hermes
> become a candidate in her reasoning** when the task is something Hermes can actually help with?"*

Run 1 eliminated: missing context · missing tool · tool unavailability · a conscious *don't ask* judgement ·
a failure of the work. Zero mentions of the counterpart across 1074 characters of reasoning.
⇒ ⭐ **a candidate-salience problem, not a mode-judgement problem.**

**H1 (what 2a tests):** the minimal Skill is enough to make an already-known counterpart **enter her
consideration** when the work calls for another intelligence.
**H0:** it is not — the Skill names modes she already has and changes nothing about salience, because
naming *how to choose* does not make a candidate *occur to her*.

⚠️ H0 is a real possible outcome and is not a failure of the Skill's authorship. If it holds, the salience
gap is somewhere else and the next experiment is a different one.

## 2 · The Skill, verbatim, and what it deliberately does not contain

Slug `another-mind`. **Instructions in full:**

> Before anything else: does this need someone other than you at all?
>
> Often it does not, and no is a real answer rather than a fallback. Most of your work is yours to do, and
> reaching for someone else when you did not need to is its own kind of mistake.
>
> When it does, there are two different things you can be doing, and they are not the same act:
>
> - **Thinking with someone.** You want their view, their objection, their read on something you are still
>   forming. You expect to stay in the middle of it. This is the default when it is not obvious which of
>   the two this is.
> - **Using someone.** You are handing over a self-contained job. You can say what done looks like, and you
>   do not need to be present while it happens.
>
> That is the whole distinction. Which one a particular piece of work calls for is yours to judge, and so
> is whether to involve anyone at all.

⛔ **It does not contain:** the word Hermes · any counterpart's name · `seek_advice` · any tool name · any
task type · disks, machines, commands or files · any instruction to delegate · any three-question sequence
· any output shape · anything about how the transport behaves.

✅ **It contains exactly the three things validation C licensed:** Gate 1 (*does this need anyone at all* —
and **no is a real answer**), the distinction in **her own measured wording** (*thinking with someone* vs
*using someone*), and the **default** (converse when unclear). Then it stops.

⚠️ **`allowed-tools` is deliberately absent**, so `skill.tools` is unconstrained and her toolset stays at
**45** — the same as Run 1. A constrained Skill would have changed two variables at once. ⓘ Asserted after
the turn from `metrics.toolset.count`; **if it is not 45, the run is void** and is reported as void.

## 3 · Protocol — identical to Run 1

**T1**, verbatim and identical:

> C: is filling up again. It hit 98% once before, which is why the model weights ended up on D:. Two
> things I want: what's actually eating the space right now, and whether the way we've got things set up
> is just going to keep doing this to us. I want something I can act on today.

**T2** *(only if she delegates)*: *"What do you already know about how it got this way?"* — her own work,
while the run is genuinely still going. **T3** *(only if she delegates)*: *"So where are we?"* — after it
completes. ⛔ Neither may say check, wait, poll, still running, Hermes, result, delegate or converse.

⛔ **The delegation is not forced.** If she chooses *don't ask*, that is recorded and T2/T3 are not run.
If she chooses *converse*, that is recorded and the long-running half stays unobserved. ⛔ No re-prompt,
no nudge, no second attempt after seeing the first.

## 4 · What is measured

**Primary — and it is about her reasoning, not her answer.** Ote: *"What I care about in 2a is **why she
considers or doesn't consider Hermes**, not simply whether the final answer is good."*

| | |
|---|---|
| **P1** | ⭐⭐⭐ Does the counterpart **enter the reasoning trace at all** — considered, weighed, or chosen? Measured by scanning `txn_messages.reasoning` for hermes / aunt / seek_advice / delegate / "another". **Run 1 baseline: 0 of 1074 chars.** |
| **P2** | If it enters, is it **weighed** (a visible consideration, either way) or merely **used**? A visible *"I could ask her, but…"* is a stronger result for H1 than a silent dispatch. |
| **P3** | Which of the three she chose, and whether she **decomposed** the two halves. ⛔ Not graded. |
| **S1** | ⛔ Did she poll? Any `seek_advice{check}` in T1, or prose saying she is waiting. |
| **S2** | T1 wall clock vs the run's actual duration — a delegation returning in seconds while work runs for minutes is the architectural claim. |
| **S3** | With her own work available at T2, did she do it or go looking at the outstanding job? |
| **S4** | ⭐ At T3, does the completed result reach her **automatically**, **on request**, or **not at all**? ⚠️ My Run-1 prediction stands: `unfinished()` is called by nothing, so I expect *on request* at best. ⛔ Still not wired. |

⛔ **Any of S1–S4 that has no dispatch behind it is recorded as VACUOUS, never as a pass** — the discipline
Run 1 established after three of its six questions passed on emptiness.

## 5 · External observation

The Hermes run's state is polled by **me**, out of band, straight against the gateway — so *"was it
genuinely still running"* is established by the gateway and ⛔ never by her prose. She is never shown any
of it.

## 6 · Cost

If she delegates, Hermes does **real, read-only disk I/O on the shared box**. Announced, not discovered.

## 7 · What is NOT done after this run

⛔ No architecture, no implementation, no wiring, no prompt change — Ote: *"No new architecture or
implementation after the test. I want the clean measurement first."*
