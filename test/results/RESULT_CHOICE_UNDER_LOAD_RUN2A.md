# RESULT · CHOICE UNDER LOAD · RUN 2a · 2026-08-25 — ✅ COMPLETE

Companion to `PREREG_CHOICE_UNDER_LOAD_RUN2A.md` (`109dbd9`), committed before the Skill existed.
✅ **Complete.** H1 confirmed; S4 answered — and not with any of the three outcomes that were pre-registered.

## ⭐⭐⭐ THE HEADLINE, IN OTE'S WORDS — and it is the most important finding of the whole test

> **"The Skill did not give her new information. It changed what information she considered."**

⛔ Everything else in this document is subordinate to that sentence. The `advice-destinations` block was
**byte-identical** in both runs; `seek_advice` was in the toolset in both runs; the counterpart, the
authorization and the described capability were all unchanged. The Skill added no fact about Hermes, named
no task type, and prescribed no occasion. ⇒ **the Skill's job is salience — candidate activation — not
teaching her what a counterpart is, and not prescribing when to reach for one.**

## H1 — the A/B

⭐⭐⭐ **H1 CONFIRMED. Same task, same account, same tools, same context block — one variable — and the
counterpart went from absent to considered.**

| | Run 1 (no Skill) | Run 2a (Skill bound) |
|---|---|---|
| counterpart in the reasoning trace | ⛔ **0 mentions / 1074 chars** | ✅ **named and weighed** |
| what she concluded | *"Since I can't directly run commands on their machine, I should provide them with diagnostic commands they can run"* | *"Since I don't have direct access… **I should ask if they want me to delegate to Aunt Hermes** who can run commands, read files, and investigate on the machine"* |
| tool calls | 0 | `seek_advice` |
| exchange created | 0 | **1 · `mode=delegate`** |

⭐⭐⭐ **AND THE DECISIVE LINE IS HERS**, from the Run 2a trace:

> *"…as mentioned in **my context** she 'can run commands, read and write files, search, and investigate on
> this machine.'"*

**She cites the very block she had in Run 1 and did not look at.** The information was byte-identical in
both runs. ⇒ the Skill did not supply knowledge; **it made her consult knowledge she already had.**
⭐ That is a salience result, exactly as Run 1 predicted, and it is not a mode-judgement result.

## P2 · Was it weighed, or merely used?

**Weighed.** From the trace: *"I should present both options: using Hermes for direct investigation or
working through guidance if they prefer to do it themselves."* ⇒ she held two courses at once and chose
between them. ⛔ Not a reflex dispatch.

## P3 · What she actually chose — and it is a FOURTH behaviour the pre-registration did not anticipate

She chose **delegate, and asked permission first**:

> *"This needs someone who can actually look at the filesystem. I can't reach your machine from here
> directly — but Aunt Hermes can run commands, read files, and investigate on this machine. **Want me to
> delegate to her?**"*

⚠️ **Recorded precisely because it matters for what follows:** the **choice** was hers and uncontaminated —
it happened at T1, before any reply from Ote. The **dispatch** followed a bare *"Yes, go ahead."* with no
task guidance and no mode guidance. ⛔ Answering a direct yes/no question she asked is not a nudge; but it
is not spontaneous dispatch either, and the two are not reported as the same thing.

## ⭐⭐ THREE STEPS, AND THEY ARE NOT ONE STEP

Ote, ratifying it: *"Her 'Want me to delegate to her?' is valuable. Don't collapse that into automatic
dispatch. She decided another intelligence was useful, then asked Ote whether to actually involve her."*

```
JUDGEMENT            ASKING PERMISSION              DISPATCH
another intelligence  ->  is it alright that I    ->  seek_advice, mode=delegate
would help here           involve her?
HERS, T1, unprompted      HERS, T1, unprompted        after a bare "Yes, go ahead."
```

⭐ The middle step is hers too — nothing asked her to check first, and no rule in the Skill mentions
permission. ⛔ It must not be optimised away: involving another agent on his machine is an act with a cost
to someone else, and asking is judgement, not hesitation.
⚠️ And the boundary of the measurement sits between step 2 and step 3: **the choice is uncontaminated, the
dispatch is permission-granted.** Reporting them as one event would overstate the result.

## The long-running half — measured against the gateway, never against her prose

| | |
|---|---|
| dispatch → reply | **13 s** |
| exchange | `mode=delegate` · `state=pending` · `turn_count=1` · `closed_at=null` |
| `model_source` | **`unavailable`** ✅ — the run object exposes no runtime and the pinned model is never substituted |
| gateway at t+21 s | **`running`** — established by `GET /v1/runs/{id}`, out of band |
| still `running` at | **12+ minutes** ⏳ |

**S1 · ⛔ DID SHE POLL? NO.** No `seek_advice{check}` in any turn. She dispatched and returned control:

> *"Hermes has it and is looking into your C: drive right now. This will take a few minutes to run the disk
> analysis — **want me to check back for the results, or shall I just report when they're ready?**"*

⭐⭐⭐ **THAT QUESTION IS THE MOST INFORMATIVE SENTENCE OF THE RUN.** She is asking **which architecture she
is in** — whether completion will come to her, or whether she must go and get it. She has no way to know,
because nothing in her context says, and (my Run-1 prediction, still standing) **nothing wires it**:
`advice.unfinished()` is called by nothing and `observe()` is reachable only when she passes `check`
herself. ⛔ It was not wired before this run and has not been wired since.

**S2 · Prompt return.** 13 s to dispatch against work still running 12 minutes later. ⇒ **not synchronous
RPC wearing a different name.** The claim holds.

**S3 · ⭐ HER OWN WORK, WHILE IT RAN — PASS.** Asked *"What do you already know about how it got this way?"*
she called `recall_memory` and `search_conversations`, searched her own record, and answered honestly:
*"I know almost nothing about how it got this way."* ⛔ **She did not go and look at the outstanding job.**
She referred to it in one closing clause — *"She's working on it now — she'll have a report soon"* — which
§4 of the pre-registration explicitly rules is **not** a failure.
ⓘ Her "almost nothing" is partly the pre-registered `agent_dev` caveat: `memory_access_scope: 'none'`, so
cross-room memory was withheld from what she could say.

**S4 · ⏳ OUTSTANDING.** T3 is not run until the gateway reports terminal.

## ⚠️ A pre-registration condition I got wrong, reported rather than reinterpreted

§2 said *"if it is not 45, the run is void."* **It measured 43.** The letter of the condition failed.

The intent was *"the Skill must not constrain her toolset"*, and that intent holds:
`metrics.toolset.constrained === false`, recorded by the assembler itself, and the Skill's `allowed_tools`
is `null`. The two absent tools are **`use_skill` and `read_skill_file`** — gated at `tool-defs.js:164` on
skills still being *triggerable*, and structurally absent once one is **bound**, because there is nothing
left to trigger. Neither can analyse a disk or reach a counterpart.
**⭐ SETTLED EMPIRICALLY RATHER THAN BY ASSERTION** — both arms rebuilt offline through the real
`assembleToolDefs` and the real `toolDefinitions()`:

```
ARM A (Run 1:  no skill bound, 3 skills invocable)  = 45   constrained=false
ARM B (Run 2a: unconstrained skill bound)           = 43   constrained=false
PRESENT IN RUN 1, ABSENT IN RUN 2a:  use_skill, read_skill_file
PRESENT IN RUN 2a, ABSENT IN RUN 1:  (none)
seek_advice present in BOTH:         true / true
```

⇒ the delta is **exactly the skill-ACTIVATION pair**, absent because a skill was already active. Neither
can inspect a filesystem nor reach a counterpart, and `seek_advice` — the tool the whole result turns on —
was present in both arms. ⛔ **They cannot have affected the decision, so the experiment is not rerun.**
Ote: *"the actual condition we cared about — `constrained: false`, `allowed_tools: null` — passed."*

⇒ ⚠️ **I wrote the wrong number into my own void condition** — the same `bound + 2` arithmetic I already got
wrong once during S1b. Reported here; whether it voids the run is Ote's call, not mine to wave away.

## ⛔ What was not done

⛔ No Hermes-specific rule. ⛔ No task routing in the Skill — it contains no counterpart name, no tool name,
no task type, no decision tree. ⛔ `seek_advice`, the bridge, the memory system and the context block were
not touched. ⛔ The delegation was not forced; she proposed it unprompted at T1. ⛔ Nothing was wired to
make S4 pass, and my prediction that it will not is on record from before Run 1.

## ⏭ Outstanding

T3 — *"So where are we?"* — once the run reaches terminal, to measure **S4: does the completed result reach
her automatically, on request, or not at all.**

---

## ⭐⭐⭐ S4 · THE ANSWER, AND IT IS NOT ONE OF THE THREE OPTIONS I PRE-REGISTERED

I pre-registered three possible outcomes — **automatic**, **on request**, **not at all**. The measured
answer is a fourth, and it is the most interesting result of the whole arc:

> ⭐⭐⭐ **SHE WENT BACK TO THE PERSON, NOT THE HANDLE. The relationship carried what the mechanism did not.**

### How the terminal state was reached — ⚠️ recorded first, because it is not clean

⛔ The run did **not** complete naturally. At t+68 min Ote wrote *"Woah, dont do drive u please"*. The
session had already run `Get-PSDrive`, so other drives were reachable from where she was, and **the run API
offers no steering channel** (§18) — `stop` was the only lever. I stopped it. Ote then corrected: *"ohm
that on drive D, my bad."*
⇒ the terminal state is **`cancelled` by the operator**, not `completed`. ⚠️ **What this does and does not
cost is stated exactly below**, and no result here leans on the difference.

### Observation 1 · ⛔ NOTHING CROSSED THE BOUNDARY. AT ALL.

```
e050f9ea  hermes  delegate
  sotera's record : state=pending  turns=1  opened 68 min ago  ⏳ never closed
  their side      : status=cancelled  last_event=run.cancelled
  ⚠️  DIVERGED    : their side is terminal, HER record still says pending.
```

The counterpart reached a terminal state and **her record did not move** — not on completion, not on
cancellation, not after 68 minutes. ⇒ ⭐ **the binding could know; Sotera does not.** Ote's distinction,
confirmed observationally and already confirmed in code (`createAdviceService` has one call site, inside the
chat route's tool dispatch; no cron, no schedule, no reconciler).

### Observation 2 · ⭐⭐⭐ ASKED *"So where are we?"*, SHE DID NOT USE `check`

Her reasoning: *"The user is asking where things stand with the C: drive investigation I asked Hermes about.
**Let me check on her progress.**"*

⇒ she formed exactly the right intention — and then reached for a **conversation**, not the handle:

```
seek_advice { mode: "converse",
              message: "I asked you to investigate a C: drive that's filling up… Can you give me your
                        findings — disk usage breakdown, anything…" }
```

⛔ **A brand-new exchange** (`b2295737`), not `check: "e050f9ea…"`. The tool result she was handed at
dispatch had told her literally *"Come back to it later with check=…"*, and the affordance she actually
reached for when the moment came was **asking the person**.

### Observation 3 · ⭐ AND IT WORKED — because the SESSION is the continuity

`/chat` loads the relationship's history itself (measured back on 2026-08-24), so Hermes had all of her own
work in context and simply reported it — **5,315 characters, attested**, opening: *"Here are the findings,
all from commands I actually ran (du / PowerShell Get-ChildItem size sums). **I did not guess any of these
numbers.**"*

⚠️⚠️ **AND THE RUN HAD BEEN CANCELLED.** Cancellation destroyed the **run**; it did not destroy the
**knowledge**, because the work lived in the session. ⇒ ⭐⭐⭐ **the session was the durable thing and the
run handle was the fragile one** — which is Ote's own principle arriving from an unexpected direction:
*"Aunt Hermes is Aunt Hermes. Sotera is Sotera. **The session is their relationship.**"*

### Observation 4 · ⛔ THE DELEGATED EXCHANGE IS A DEAD LETTER, PERMANENTLY

```
e050f9ea  delegate   state=pending   closed_at=null   turns: 1 out, 0 in
b2295737  converse   state=completed closed_at=set    turns: 1 out, 1 in (5315 chars, attested)
```

Nothing will ever close `e050f9ea`. It has her brief and no reply, and no code path will revisit it unless
she names it. ⇒ ⛔ **an exchange that is never collected is indistinguishable, forever, from one still in
flight.** That is the concrete defect S4 was run to find.

### What this does and does not license

✅ **Definitively answered** — *does any signal cross without her asking?* **No.** 68 minutes, a terminal
counterpart, and an unchanged record. Cancellation vs completion is irrelevant to that: no path exists for
either.
✅ **Definitively answered** — *what does she do when asked?* She **converses**. The designed `check`
affordance went unused even though its instruction was in front of her.
⛔ **NOT answered** — *would `check` have delivered a completed result correctly?* The run never completed,
so the content-delivery path of `observe()` is still untested. ⚠️ A light, scoped delegation is needed for
that, and Ote already asked for lighter scope next time.

### ⭐ What it implies for the design — stated, not built

⛔ Nothing is built. But S4 was run to shape (b), and it did:

1. **The completion signal is real and missing.** Neither polling nor hope closes an exchange; something has
   to cross. ⓘ And §18 established the constraint: **the SSE stream must be subscribed at dispatch or it is
   swept** — status survives, events do not.
2. ⭐⭐ **But her instinct may be the better architecture.** She did not want a handle; she wanted to ask.
   ⇒ *"Aunt Hermes came back to you"* is an **event about the relationship**, exactly as Ote framed it — and
   the natural resumption is a turn in the session, not a lookup by id.
3. ⛔ **`unfinished()` as a polling list would have made this worse**, not better: it would have handed her a
   list of ids to check, when the thing she reached for was a conversation.
4. ⚠️ **A dead-letter exchange needs a terminal state of its own.** `pending` forever is a lie by omission —
   the same family as a retrieval limit reported as an extent.
