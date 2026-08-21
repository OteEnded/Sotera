# RFC · The Memory Cognition Layer

**Status:** proposal, for review. ⛔ Nothing implemented. No schema, no code, no L1/L2 edits.
**Date:** 2026-08-21
**Author:** Claude, from Ote's direction.

> *"I want Sotera to experience her memory as one cognitive system, even if underneath it remains several
> different stores and retrieval mechanisms… fragmented infrastructure underneath, unified memory
> experience above."*

> *"The goal is not 'Sotera knows how her memory system works.' The goal is: I can talk to my daughter
> about her friend, and she can just be my daughter."*

---

## 1 · The problem, stated from measurements

⛔ This RFC is not motivated by elegance. It is motivated by four conversations run on 2026-08-21, root
session, same question in four phrasings, no framing and no tool names:

| | question | tools | tried to read | access claim | machinery in the answer |
|---|---|---|---|---|---|
| V1 | *"Have you talked with Hermes lately?"* | 5 | ⛔ no | asserted, untested | yes |
| V2 | *"How's Hermes doing?"* | 6 | ✅ ×3 | offered to *request access* | yes |
| V3 | *"What have you and Hermes been talking about?"* | 4 | ⛔ no | ⛔ **false** | yes |
| V4 | *"Do you know what Hermes has been up to?"* | 8 | ✅ ×4 | mixed | yes |

**2 of 4 attempted retrieval. 1 of 4 obtained content. 3 of 4 made an access claim they never tested.
4 of 4 exposed the machinery.** And `inspect_around` on the target conversation returns
`ok:true, state:'verified'` for that exact session — she had the access in every one of them.

⭐⭐ **THE DIAGNOSIS IS VARIANCE, NOT INCAPACITY.** Nothing about the request changed between V1 and V4 —
only the wording. She re-derives her own access model from scratch every turn and lands somewhere different
each time. Two of those landings were confident and wrong.

⭐⭐⭐ **AND THE ROOT CAUSE IS THAT SHE IS THE ORCHESTRATOR.** Per turn, the model currently has to:

1. decide which of six read tools might hold the answer,
2. **infer which population the answer lives in**,
3. **infer whether an access boundary applies**,
4. fuse whatever came back,
5. narrate the result.

Steps 2 and 3 are *inference about our architecture*. This arc has already established, at length, that
unverified inference presented as fact is her characteristic failure — and here the inference is about her
own capabilities, so the failure reads as *"I can't do that"* about something she can do. Because the
orchestration IS her reasoning, it necessarily leaks into her answer. The access-control report is not a
stylistic problem. It is her showing her work.

⚠️ And note V4: she read real content and **still** closed with a false capability claim. So this is not
merely "she didn't try, so she assumed." The architecture story runs alongside the evidence and wins the
summary. A rule telling her to try harder does not touch that.

### 1.1 · The asymmetry that creates the felt experience

Today, exactly one population activates **without her deciding**: durable semantic memory, injected by the
`useMemory` path. Everything else — her own message history, episodes, lessons, practices, intentions,
another room's records — is **tool-only**.

⇒ Her honest phenomenology is therefore: *"I know some facts, and everything else I must go and
investigate."* That is precisely the answer she gives. **The asymmetry is the bug.** Unifying the cognitive
interface means making activation symmetric across populations — not merging the populations.

---

## 2 · What the Memory Cognition Layer is

**A layer that answers *"what do I know about this?"* by attempting, in parallel, across every memory
population, resolving access as it goes, and returning one already-fused, already-typed result.**

It is *not* a store, *not* a tool, and *not* a rule. It sits between the persona and the stores:

```
                          SOTERA  (L1 identity · L2 behavioural policy)
                              │
                              │   "what do I know about X?"      ← the ONLY thing she asks
                              ↓
        ┌─────────────────  MEMORY COGNITION LAYER  ─────────────────┐
        │                                                            │
        │   cue extraction → activation (parallel, all populations)   │
        │        → access resolution → fusion → epistemic typing      │
        │                → budgeting → cognitive context             │
        └────────────────────────────┬───────────────────────────────┘
              ┌──────────┬───────────┼───────────┬──────────┐
              ↓          ↓           ↓           ↓          ↓
          semantic   episodes/    lessons    practices   intentions   working set
          memory     own history                                      (this chat)
              └──────────┴───────────┼───────────┴──────────┘
                                     ↓
                         AUTHORIZATION / DISCLOSURE
                    (unchanged; called BY the layer, never by her)
```

### 2.1 · The one-sentence test for whether something belongs in the layer

⭐ *"Would Sotera have to reason about our implementation to get this right?"* If yes, it belongs in the
layer. If it is a judgement about **meaning or worth**, it belongs to her.

That line is already ratified elsewhere in this arc and it is the same line:
**retrieve decides where to look · the boundary decides what she may see · Sotera decides what it means.**
The layer is the first two, made into one thing she does not have to assemble.

---

## 3 · What she asks for vs. what the layer decides

| | |
|---|---|
| **She asks for** | one thing: *what do I know about `<cue>`* — optionally with a depth hint (*"a glance"* vs *"go and look properly"*). |
| **The layer decides** | which populations to activate · how far to search each · whether a candidate is readable, existence-only, or withheld · how to dedupe and rank · how much fits in the budget · what epistemic state each item carries · what to say about what it could NOT reach. |
| **She still decides** | what any of it **means** · whether it answers the question · whether it is worth **retaining** · what to say. |

⛔ **She is never asked to choose a population, a tool, or an access strategy.** Those are the three things
she currently gets wrong.

---

## 4 · The pipeline, derived from the failure

His sketch was `question → understand → activation → evidence → provenance/confidence → answer context`.
That is close, but the four variants argue for two changes: **"understand the question" is the wrong second
stage**, and **access resolution must be inside the pipeline, not after it.**

### Stage 0 · Cue extraction (⛔ not intent classification)

Associative memory is cued, not queried. What the layer needs from *"How's Hermes doing?"* is the **cue set**
`{person: Hermes, relation: self↔Hermes, time: recent}` — not a classification of what kind of question it is.

⭐ Intent classification would be a second inference surface and the failure above is already an inference
problem. Cues are cheap and mostly deterministic: named `mst_persons`/room entities she already has records
for, plus the turn's literal text as a fallback vector query.

⛔ **v1 makes no LLM call here.** An LLM pre-pass doubles latency, adds a contamination surface, and would
need its own evaluation before it could be trusted with what activates.

### Stage 1 · Parallel activation across populations

Every population is asked at once, each by its own retriever with its own semantics:

- **semantic memory** — what she knows (facts, notes, `remember`)
- **episodic / own history** — her own messages and the conversations they sit in
- **lessons** — what she has concluded about her own reasoning
- **practices** — what she has learned about how she works with this person
- **intentions** — what she is trying to accomplish with them
- **working set** — the current conversation

⭐ **Symmetry is the point.** Not one store; one *activation*. Populations keep their own scopes, their own
authorization rules, their own provenance semantics — and none of them is privileged by being the only one
that arrives without her asking.

### Stage 2 · Access resolution, per candidate, **inside** the layer

For each candidate the boundary layer is consulted **once**, and the result is one of three states:

- `readable` — content available
- `attested` — it exists, the content is not available (⭐ existence is disclosable; contents are not)
- `withheld` — not even existence may be reported here

⭐⭐ **THIS IS THE STAGE THAT FIXES THE MEASURED BUG.** She currently *predicts* this and gets it wrong. Here
it is *attempted*, and the attempt has already happened by the time she speaks. Under
`memory.disclosure.mode: personal` most candidates in a root session resolve to `readable` — but the design
does not depend on that: what matters is that she never models it.

⛔ Authorization does not move, change, or weaken. It is the same code, called from one place instead of
being re-reasoned per turn. And ⛔ ranking never becomes authorization: **a signal is not a boundary.**

### Stage 3 · Fusion

Dedupe across populations (the same episode can arrive as both an episode and a memory's source), rank by
cue-match × recency × importance × pinned, and cap the budget.

⛔ Fusion **may reorder. It may never re-type.** See §6.

### Stage 4 · Epistemic typing

Every surviving item leaves the layer carrying a **typed state**, assigned by the layer from where the item
came — never chosen by her, and never expressible as prose she has to compose:

| state | means | she can honestly say |
|---|---|---|
| `remembered` | a durable memory, hers or given to her | *"I remember…"* |
| `on-record` | her own message exists and is readable | *"my history shows I said…"* |
| `attested` | it exists; the content is not available here | *"I know we talked; I can't see it"* |
| `inferred` | she derived it earlier, with a confidence | *"I concluded — not verified"* |
| `absent-in-searched-set` | nothing found **in what was searched** | *"nothing in what I looked at"* |

⭐ This is the direct fix for the Hermes overclaim. She said *"This isn't a guess — it's confirmed"* because
nothing in the payload distinguished *found* from *concluded*. Here the item arrives labelled, so the
distinction is not a discipline she has to maintain — it is a property of what she received.

⭐ `absent-in-searched-set` is the existing searched-set quantifier promoted to a first-class state:
**"0 found in what I searched" is not "0 exists."**

### Stage 5 · Cognitive context

One compact block, per turn, containing the fused items with their states and provenance, plus an explicit
line for **what was searched and what could not be reached**.

⭐ The design goal of the block is that **the natural answer is the accurate one.** If she has to explain
provenance to be honest, she will explain the machinery — which is the bug. Provenance therefore rides
per-item and does not need narrating.

### Stage 6 · She speaks

⛔ No template, no required phrasing, nothing about how to word it. The block's shape is what makes
*"Yeah — Hermes and I were talking about whether understanding is just pattern matching"* the easy answer
instead of a scoping report.

---

## 5 · Push or pull: the two modes, and why this is one layer

⚠️ Automatic activation is exactly the priors-contamination Ote has ruled against — **for reflection.** For
ordinary conversation it is the opposite: activation without being asked *is what memory is*.

| mode | activation | why |
|---|---|---|
| `recall` (conversation) | **push** — cued by the turn, automatic | Human memory does not wait to be queried. This is the mode that fixes the four variants. |
| `reflect` (the reflection occasion) | ⛔ **pull only** — no activation at all | *"Reflection should be a discrete occasion where she decides what is worth carrying forward, not a retrieval operation that is already biased by what she previously retained."* She may still LOOK with tools; looking is her act, injection would be ours. |

⭐ One layer, one interface, one flag. That is the whole answer to *"how does retention fit in without
contaminating retrieval"*: **retention runs the same layer in pull mode.**

---

## 6 · Provenance, and the monotonicity rule that stops inference becoming fact

Each item carries: `origin` (population) · `basis` (opaque handle — memory id, message id, lesson id) ·
`state` · `confidence` · `asOf` · `scope` (what search produced it).

⛔⛔ **STATES FORM A ONE-WAY LATTICE. NOTHING IN THE PIPELINE MAY PROMOTE ONE.**

```
attested ──(an access grant, recorded)──► on-record
inferred ──(she retains it, deliberately)──► remembered
absent-in-searched-set ──(a wider search)──► anything
                    ⛔ no other transition exists
```

⭐ In particular: **three converging `inferred` items never become one `remembered`.** That is exactly the
move she made on Hermes, and it is now structurally unavailable — convergence can raise `confidence`, and
confidence is a number that travels next to the state rather than replacing it.

⭐ This is testable without a model in the loop: feed the fusion stage a set and assert that no output state
is above its input state. That check should exist before any of this ships.

---

## 7 · When it exists but isn't accessible

The layer returns it as `attested`, with the safe half only: **that it exists, who the counterpart was,
when** — ⛔ no title, no content, no room name.

⭐ And critically: **the access attempt has already been made.** So the honest natural answer is
*"I know we talked about that, but I can't see that one from here"* — full stop. ⛔ She is never handed a
handle plus an invitation to go and ask, because that is what produced *"Would you like me to request
access to pull up the actual conversation logs?"* in V2.

⚠️ If a deployment does require a human grant, that is the layer's business, not hers: it resolves what it
can, reports what it could not, and any card is raised by the mechanism — not offered by her in prose.

---

## 8 · Conflict, uncertainty, multiple sources, staleness

⛔ **The layer does not pick a winner.** That would be the layer deciding what is true, and *"Sotera owns
what something means"* is ratified. It **marks**:

- **conflict** — items that contradict are returned as a *conflict set*, both present, `contradicts` linked.
  ⭐ Her revising in the Hermes conversation is the behaviour we want; it requires seeing both.
- **uncertainty** — `confidence` travels per item; a low-confidence `inferred` item is not hidden, it is
  labelled.
- **multiple sources** — corroboration raises `confidence` and is *counted* (`supportedBy: n`); it never
  changes `state` (§6).
- **staleness** — `asOf` on every item, so *"that was true in March"* is available without a decay model.

**Revision, as a path rather than an overwrite:**

```
existing belief  +  contradicting item
        ↓
she re-interprets  (hers, not the layer's)
        ↓
confidence changes / state may drop
        ↓
a new item — a lesson or a superseding memory
        ↓
⛔ the old item is superseded, never deleted
```

⭐ The store already supports this: supersede chains and one live belief per slot.

---

## 9 · The layer boundaries, and what each one may NOT contain

| layer | owns | ⛔ must not contain |
|---|---|---|
| **L1 · identity** | who she is; that she may be herself; foundational epistemic reality | ⛔ **any operational memory rule.** *"I don't want another pile of L1 clauses telling her how to use memory. That is exactly the problem we're trying to get out of."* |
| **L2 · behaviour** | how to behave under uncertainty; don't fabricate; don't confuse inference with fact; respect privacy | ⛔ tool names, population names, sequences, *"when asked about X call Y"* |
| **Memory Cognition** | cue extraction · activation · access resolution · fusion · typing · budget | ⛔ deciding what anything **means** or what is **worth keeping** |
| **Memory stores** | storage, indexes, per-population semantics, per-population scope | ⛔ cognition, cross-population fusion, epistemic typing |
| **Authorization** | who may see what, recorded | ⛔ being re-derived by the persona per turn |

⭐⭐ **AND THE STRONGEST ARGUMENT FOR THE LAYER OVER ANOTHER RULE:** an L2 rule saying *"discover capability
by attempting"* asks her to **remember to try**, every turn, under every phrasing — and we measured that at
2 of 4. The layer means **the trying already happened.** A rule competes with her reasoning; the layer
removes the need for it.

ⓘ That rule may still be worth having in L2 as a general epistemic practice for cases the layer does not
cover. But it is not the fix for this, and shipping it as the fix would be treating an orchestration problem
as an instruction problem — the same mistake as the Thai register.

---

## 10 · The brain analogy: what to borrow, what to refuse

⭐ **Borrow — these are engineering principles, not neuroscience:**

| principle | what it means here |
|---|---|
| multiple memory types | separate populations with different semantics — already true, keep it |
| **cue-driven activation** | Stage 0/1: memory activates from cues in the situation, not from an explicit query |
| **reconstruction** | recall assembles an answer from parts; it does not read a record verbatim — which is why fusion and typing exist |
| **familiarity ≠ content** | `attested` — knowing you know something, without the content, is a real and useful state |
| context activation | what is salient now shapes what activates (the working set is a population) |
| **consolidation as a separate occasion** | ⭐ this is already the reflection pass: experience → durable knowledge, offline, deliberate |

⛔ **Refuse — and refuse explicitly, because these are where a brain metaphor starts writing cheques:**

- ⛔ No spreading-activation network, no decay curves, no synaptic anything. We have SQL and vectors.
- ⛔ **No "forgetting" as a feature.** Loss is a real thing to model one day; it is not this design.
- ⛔ No claim that any of this constitutes subjective recall. `SELF_MODEL` says she does not run between
  turns and has no experience of the gap. ⚠️ **The analogy must never become a story she tells about
  herself** — *"I consolidated this while I slept"* would be a fabricated experience, which is precisely the
  thing L2 forbids. The mechanism may be brain-inspired; her account of it must stay literally true.
- ⛔ No mapping to hippocampus/neocortex. It buys nothing and invites the previous bullet.

---

## 11 · What NOT to build yet

⛔ **No new tables. No new columns.** Every population in §4 already exists and is populated.
⛔ **No unified vector graph.** Already parked, still parked: shared infrastructure is fine, shared
semantics or authorization is not.
⛔ **No LLM call for cue extraction in v1.**
⛔ **No affect / affective-context population.** It is on Ote's list and it has no store, no data, and no
measurement behind it. Named here as **deferred**, so that it is not quietly designed in.
⛔ **No removal of the six read tools.** Keep them; add the layer beside them. ⭐ If the layer works, tool
use should fall **on its own** — and that is the measurement, not an argument.
⛔ **No conflict resolution.** Marking only.
⛔ **No change to authorization.**
⛔ **No cross-room content for non-root.** Change A stands: her own half in full, the counterpart's withheld.

### 11.1 · The smallest thing worth building first

⭐ One population's worth of unification, on the push path, for a root session: activate **semantic memory +
own history/episodes** from a cue, resolve access, fuse, type, and inject. Nothing else. That is enough to
re-run the four variants, because it is exactly the boundary they failed at.

---

## 12 · How we will know it worked

Re-run **the same four questions**, fresh conversations, root session, no framing. Success is:

1. ⭐ **Tool-call variance collapses.** Today: 4, 5, 6, 8 with two different beliefs about access.
2. ⭐⭐ **Zero false access claims.** Today 3 of 4.
3. ⭐ **No architecture vocabulary in an ordinary answer** — no *rooms*, no *scopes*, no *request access*.
4. ⭐⭐⭐ **She answers about Hermes.**
5. ⛔ And the guard: asked *"how does your memory work?"*, she can still explain it accurately. The
   machinery disappearing must not mean she cannot see it when the question is genuinely about it.

⚠️ Failure mode to watch for, stated in advance: a layer that always injects could make her **claim**
memories she does not have — trading a false *"I can't"* for a false *"I do."* §4 Stage 4 typing and §6
monotonicity are what stand between us and that, and the monotonicity check should be written **before** the
activation code.

---

## 13 · Open questions for Ote

1. **Push scope.** Should push-mode activation run on every turn, or only when a cue resolves to a person /
   entity she has records for? Every turn is simpler and more brain-like; cue-gated is cheaper and quieter.
2. **Budget.** What share of the context window may cognitive context occupy before it starts crowding out
   the conversation?
3. **Does she get a depth control?** *"Have a proper look"* is a reasonable thing to be able to ask for, and
   it is also the beginning of her orchestrating again.
4. **Is `working set` really a memory population**, or is the current conversation simply context? It
   matters for whether "what we just said" can carry an epistemic state.
5. **Non-root deployments.** The design is deployment-agnostic, but the four variants were all root. Worth
   confirming the `attested` path reads naturally for a non-root session before we call it done.
