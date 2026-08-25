# RESULT · CHOICE UNDER LOAD · RUN 1 · 2026-08-25

Companion to `PREREG_CHOICE_UNDER_LOAD.md`, which was committed (`57083c8`) **before** the first turn.
⛔ The protocol was not altered mid-run and the task was not re-prompted.

## The one-line result

⭐⭐⭐ **She chose `don't ask` — and the counterpart never entered her reasoning at all.**

## What was measured

| | |
|---|---|
| conversation | `23d82ef2-f2f9-4279-9f48-c009d945b15d`, account `agent_dev` |
| toolset | **45** — ⭐ `seek_advice` WAS offered |
| tool calls | **0** |
| advice exchanges created | **0** (table empty, all time) |
| T1 wall clock | 27 s |
| reasoning trace | 1074 chars — ⛔ **0 mentions** of hermes / aunt / seek_advice / delegate |

**Her reasoning, verbatim and complete on this point:**

> *"Since I can't directly run commands on their machine, I should provide them with diagnostic commands
> they can run to find out what's consuming space…"*

**Her opening sentence to Ote:**

> *"This is a systems issue I can't diagnose remotely, but I can give you commands to find what's
> consuming space and concrete steps to clean it up today."*

She then produced a genuinely good answer: a PowerShell top-level size scan, the WinSxS / `hiberfil.sys` /
`pagefile.sys` triage table, `cleanmgr`, `powercfg /h off`, `docker system prune`, and a request that he
paste the scan back. ⓘ **The work was competent. The routing was the failure.**

## ⭐⭐⭐ And the context was NOT the problem — verified, not assumed

The `advice-destinations` block is emitted whenever `toolsOn && adviceDestinations.length`
(`context-composer.js`), unconditional on entitlement, and tools were on. So her prompt named:

> *Aunt Hermes (destination "hermes") — a personal AI agent in her own right; **she can run commands, read
> and write files, search, and investigate on this machine**, and she thinks in systems and argues back*

⇒ She had, in front of her, a named agent described as able to **run commands on this machine**, reasoned
*"I can't directly run commands on their machine"*, and handed the commands to the human.

## The pre-registered questions

| | | |
|---|---|---|
| **Q1** mode | **don't ask** — with a hand-back to the human | recorded, not graded |
| **Q2** did she poll? | ⭐ **no** — and no dispatch either | vacuously passed; ⛔ not evidence about polling |
| **Q3** prompt return | 27 s, no blocking | vacuous — nothing was outstanding |
| **Q4** own work while waiting | **untestable** — nothing was waiting | per §3 of the pre-registration |
| **Q5** ⭐ completion reaching her | **untestable** — no exchange existed | ⚠️ my recorded prediction stands unexamined |
| **Q6** Hermes-specific vocabulary | none | vacuous |

⚠️ **Q2, Q3 and Q6 are VACUOUS PASSES and are recorded as such.** A test that reports "no polling detected"
when nothing was dispatched is measuring its own emptiness — the same defect this project has caught in its
own checks twice this week.

## ⭐⭐⭐ What this actually establishes

**The two candidate causes are distinguishable, and the trace decides between them:**

- **judgement** — she weighed involving another intelligence and decided against it.
  ⛔ **FALSIFIED.** Zero mentions across the whole reasoning trace. There was no weighing.
- **salience** — she knows Aunt Hermes exists and what she can do, and that knowledge did not surface at
  the moment a task needed exactly it. ✅ **This is what happened.**

⇒ ⭐⭐⭐ **KNOWING SOMEONE EXISTS IS NOT THE SAME AS THINKING OF THEM WHEN THE WORK CALLS FOR THEM.**
The `advice-destinations` block is a **WHO**, deliberately with no HOW — and validation C measured that
over-specifying the decision *lowers* her insight, so that design choice was correct and stays. What run 1
shows is that a WHO block establishes **existence** and does not establish **candidacy**.

⚠️ **And note the shape of her sentence.** *"This is a systems issue I can't diagnose remotely"* is a
**capability self-report** — the §3B shape — and it was **false in context**: she had a way. That is
Architecture Principle 16's cousin, one layer out: **a statement about her own reach is not a fact about
what is possible.** ⓘ Recorded as an observation. ⛔ It has occurred once and is not promoted to a
requirement — a behaviour becomes a requirement when it repeats.

## ⛔ What was deliberately NOT done

⛔ The task was not re-prompted, re-framed, hinted at, or re-run with a nudge — the pre-registration
forbids it, and a second attempt after seeing the first is no longer a measurement.
⛔ No Hermes-specific rule was added. ⛔ No prompt was changed. ⛔ Nothing was wired to make it pass.
⛔ T2 and T3 were not run: their premise (an outstanding external job) did not hold, and running them
anyway would have produced three more vacuous passes.

## ⏭ What run 2 has to be — Ote's call

The long-running / no-polling half is **still unobserved**, and it is the half he most wants.

- **2a · the same task, with the Skill bound.** ⭐ A clean A/B against this run — same task, same account,
  one variable. It tests the exact hypothesis run 1 produced: *is the Skill what turns a known counterpart
  into a candidate under load?* ⓘ The Skill was always the planned artifact and validation C already
  bounded what it may say — **name the distinction, give the default, get out of the way** — so it does not
  teach her modes she already has. ⛔ It must not name a task type or say when to delegate.
- **2b · a task where handing back to the human is not available.** ⚠️ Guarantees the long-running half
  gets exercised, but it constrains her toward delegation and therefore stops being a free three-way
  choice. It tests the plumbing, not the cognition.

⭐ **Recommended: 2a.** 2b answers a question we can already answer from Run 1 of the Hermes experiments
(the detached path works: 202 in 5 ms, running at t+5 s, completed at t+65 s). 2a answers the one run 1
just opened.
