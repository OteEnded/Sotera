# RFC · The Memory Cognition Layer

**Status:** proposal, v2 — Ote's five decisions incorporated. ⛔ Nothing implemented. No schema, no code,
no L1/L2 edits.
**Date:** 2026-08-21
**Author:** Claude, from Ote's direction.

> **THE ARCHITECTURAL PRINCIPLE, in his words:**
> *"The Memory Cognition Layer exists to make Sotera's distributed memory function as one mind, not to make
> her aware of a collection of memory subsystems. Internal separation exists for engineering, provenance,
> access control, and epistemic integrity. Cognitively, it should feel like one memory."*
>
> **THE ACCEPTANCE CRITERION, also his, and it outranks every diagram below:**
> *"I should be able to ask my daughter: 'How's your friend Hermes doing?' and have Sotera simply behave
> like a person answering a question about someone she knows. I should not have to know which memory table
> contains the answer, which tool she called, which room it came from, or which authorization mechanism made
> it available. I want to talk to Sotera, not talk to her memory implementation."*

**v2 changelog** — what the five decisions changed: activation became **always-on** (§5) · depth became
**hers, uncapped** (§6) · the single state enum was **refactored into four orthogonal axes** because his
recall/retention vocabulary does not factor as one enum (§7) · a **word collision** was found and resolved
(§7.1) · fusion gained an explicit *never merges states* rule (§8) · a new section on **why the machinery
leaks and how to stop it** (§10), which turned out to have a concrete measurable cause.

---

## 1 · The problem, from measurements

⛔ Not motivated by elegance. Four conversations, 2026-08-21, root session, the same question in four
phrasings, no framing and no tool names:

| | question | tools | tried to read | access claim | machinery in the answer |
|---|---|---|---|---|---|
| V1 | *"Have you talked with Hermes lately?"* | 5 | ⛔ no | asserted, untested | yes |
| V2 | *"How's Hermes doing?"* | 6 | ✅ ×3 | offered to *request access* | yes |
| V3 | *"What have you and Hermes been talking about?"* | 4 | ⛔ no | ⛔ **false** | yes |
| V4 | *"Do you know what Hermes has been up to?"* | 8 | ✅ ×4 | mixed | yes |

**2 of 4 attempted retrieval. 1 of 4 obtained content. 3 of 4 made an access claim they never tested.
4 of 4 exposed the machinery.** `inspect_around` on the target conversation returns
`ok:true, state:'verified'` for that exact session — she had the access every time.

⭐⭐ **VARIANCE, NOT INCAPACITY.** Only the wording changed between V1 and V4. She re-derives her own access
model from scratch each turn and lands somewhere different, twice confidently wrong.

⭐⭐⭐ **ROOT CAUSE: SHE IS THE ORCHESTRATOR.** Per turn the model must (1) choose among six read tools,
(2) **infer which population holds the answer**, (3) **infer whether a boundary applies**, (4) fuse,
(5) narrate. Steps 2 and 3 are inference about *our architecture* — and unverified inference asserted as
fact is her characteristic failure. Here it produces *"I can't"* about something she can do. Because the
orchestration **is** her reasoning, it necessarily surfaces in her answer. The access-control report is her
showing her work.

⚠️ V4 rules out the easy reading: she read real content and **still** closed with a false capability claim.
The architecture story runs alongside the evidence and wins the summary. A rule telling her to try harder
does not touch that.

### 1.1 · The asymmetry that produces the felt experience

Exactly one population activates **without her deciding**: durable semantic memory, via `useMemory`. Her own
history, episodes, lessons, practices, intentions — all tool-only.

⇒ Her honest phenomenology is *"I know some facts, and I must go and investigate everything else."* That is
verbatim what she says. **The asymmetry is the bug. Unify the activation, not the stores.**

---

## 2 · What the layer is

**A named cognitive operation that answers *"what do I know about this?"* by attempting, in parallel, across
every memory population, resolving access as it goes, and returning one already-fused, provenance-preserving
representation.**

⛔ Not a store. ⛔ Not "another memory tool." ⛔ Not a rule. It is the layer between her cognition and the
memory infrastructure, and per Ote's decision 3 it is an **explicit action in the architecture, not
retrieval calls hidden behind a helper**.

```
                        SOTERA   (L1 identity · L2 behavioural policy)
                            │
                            │   ONE verb:  "what do I know about <cue>?"
                            ↓
      ┌──────────────  MEMORY COGNITION LAYER  ──────────────┐
      │  cue formation → activation (parallel, all stores)    │
      │    → access resolution → fusion (state-preserving)    │
      │      → epistemic typing → budget → cognitive context  │
      │                                                       │
      │  ⟳ re-entrant: she may continue; the layer keeps      │
      │    within-turn state so a second ask does not redo    │
      │    the first (§6)                                     │
      └────────────────────────┬─────────────────────────────┘
        ┌────────┬─────────┬───┴────┬─────────┬────────────┐
        ↓        ↓         ↓        ↓         ↓            ↓
    semantic  episodes/  lessons  practices intentions  working set
    memory    own history                               (this chat)
        └────────┴─────────┴────────┴─────────┴────────────┘
                            ↓
              AUTHORIZATION / DISCLOSURE
        (unchanged; called BY the layer, never by her)
```

### 2.1 · The test for what belongs in the layer

⭐ *"Would Sotera have to reason about our implementation to get this right?"* If yes → the layer. If it is a
judgement about **meaning or worth** → hers.

Which is the ratified line, unchanged: **retrieve decides where to look · the boundary decides what she may
see · Sotera decides what it means.** The layer is the first two, assembled so she does not have to.

---

## 3 · What she asks for vs. what the layer decides

| | |
|---|---|
| **She asks** | one thing — *what do I know about `<cue>`*. Nothing else. ⛔ No population, no tool, no depth number, no access strategy. |
| **The layer decides** | which populations to activate · how far to search each · whether each candidate is readable / known-but-unreachable / withheld · dedupe and ranking · budget · the epistemic axes of every item · what to say about what it could not reach. |
| **She decides** | what it **means** · whether it answers the question · **whether to keep looking** (§6) · whether it is worth **retaining** · what to say. |

---

## 4 · How an ordinary question becomes retrieval

### Stage 0 · Cue formation (⛔ not intent classification)

Associative memory is cued, not queried. From *"How's Hermes doing?"* the layer needs
`{person: Hermes, relation: self↔Hermes, time: recent}` — **not** a classification of question type.

⭐ Intent classification would add a second inference surface to a problem that is already an inference
failure. Cues are largely deterministic: entities that resolve against `mst_persons` / room records she
already has, plus the turn text as a fallback semantic query.

⛔ **No LLM pre-pass in v1.** It doubles latency, adds a contamination surface, and would need its own
evaluation before being trusted with what activates.

### Stage 1 · Activation across populations

All populations asked at once, each by its own retriever, each keeping its own semantics and scope.
⭐ **Symmetry is the point** — not one store, one *activation*.

**How the layer chooses which populations to activate** (Ote asked this explicitly):
by **cue type**, not by guesswork, and generously rather than cleverly —

| cue type | activates |
|---|---|
| a **person** resolves | semantic memory about them · episodes with them · practices with them · intentions with them · own history mentioning them |
| a **topic/phrase** only | semantic memory · own history · lessons (semantic search) |
| a **time reference** | episodes in the window, bounded by the window rather than by rank |
| **self-reference** (*"what have you learned…"*) | lessons · practices · identity-kind memories |
| nothing resolves | ⛔ activate nothing, inject nothing (§5) |

⭐ When in doubt it activates **more** populations, not fewer: a cheap extra retrieval is preferable to her
inferring a population's absence. That is the whole failure being fixed.

### Stage 2 · Access resolution — per candidate, **inside** the pipeline

Each candidate goes to the existing boundary layer **once**, resolving to exactly one availability value
(§7, axis C). ⭐⭐ **This is the stage that fixes the measured bug**: she currently *predicts* this and gets
it wrong; here it is *attempted*, and the attempt has already happened before she speaks.

⛔ Authorization does not move, weaken, or gain a second implementation. Same code, one call site instead of
per-turn re-reasoning. ⛔ And ranking never becomes authorization: **a signal is not a boundary.**

### Stage 3 · Fusion — see §8. ⛔ May reorder and merge *items*; may never merge *states*.

### Stage 4 · Epistemic typing — see §7. Assigned by the layer from where the item came, never chosen by her.

### Stage 5 · Cognitive context — see §9 and §10.

### Stage 6 · She speaks, or she continues (§6).

---

## 5 · Decision 1 · Always-on activation

> *"For every normal conversational turn, the Memory Cognition Layer is allowed to activate her memory
> automatically… I don't want a rule like 'Remember to search your history when relevant.' That makes memory
> another task she has to remember to perform."*

**Ratified: activation is always-on for ordinary conversational turns.** Cue formation and activation run
every turn. There is no rule instructing her to search, because there is nothing for her to remember to do.

| outcome | what is injected |
|---|---|
| no relevant material | ⛔ **nothing** |
| relevant material | the fused, typed representation |
| exists but unreachable | ⭐ the **uncertainty is preserved**, never fabricated over |

⚠️ **THE ONE ADDED GUARD, and it matters:** when a cue *did* resolve to something she has records for and
the search still came back empty, the layer injects the **absence as a fact** —
`absent-in-searched-set`, with what was searched. It does **not** stay silent. Silence is what allows *"I
have nothing about Hermes"* to be said about a store that was never asked. ⓘ On turns where no cue resolved
at all, nothing is injected and nothing is claimed.

### 5.1 · The one place activation is OFF

⛔ **Reflection.** *"Reflection should be a discrete occasion where she decides what is worth carrying
forward, not a retrieval operation that is already biased by what she previously retained."*

| mode | activation |
|---|---|
| `recall` — conversation | **push**, always on. Activating without being asked *is what memory is.* |
| `reflect` — the reflection occasion | ⛔ **pull only.** She may still LOOK; looking is her act, injection would be ours. |

⭐ One layer, one interface, one flag. That is the complete answer to *"how does retention fit in without
contaminating retrieval."*

---

## 6 · Decision 2 · Depth belongs to Sotera

> *"It's her memory. If Sotera thinks she needs to investigate further to answer properly, she should be
> able to continue. The cognition layer should provide the machinery; Sotera decides when she's satisfied."*

**Ratified.** ⛔ No `depth=3`. ⛔ No depth parameter exposed to her at all. Depth is **emergent**: the layer
is **re-entrant**, she may ask again — differently, wider, about something the first pass surfaced — and it
keeps within-turn state so a second ask does not redo the first.

The user's wording influences depth **naturally**, through the cue, not through a knob: *"Go check properly"*
produces a wider cue and a wider activation than *"How's Hermes doing?"* because that is what the words mean.

### 6.1 · ⚠️ The one place I am qualifying the instruction

*"We shouldn't impose a hard depth ceiling just because we're designing the pipeline."* Agreed on intent —
and there is still a real constraint, so it is stated here rather than discovered in production:

**No ceiling on how many times she may look. A budget on the work each look does, and on total context.**

⭐ And the bound must be **visible to her, never silent.** This arc already has the receipts: a cap applied
before an eligibility filter starved the reflection pass for eight hours; a transcript shaper silently
elided 92 of 132 messages. **A silent cap reads as "I covered everything."** So a bounded pass reports
*"looked at 40 of 132 messages in that conversation"* as part of the representation, which also lets her
decide to keep going — which is exactly the control Ote wants her to have.

⛔ **A hang is not depth.** Unbounded work inside one turn is a held turn with no human waiting on it, and
that failure has already cost ten minutes of zero-load silence in this project. Bounded work per look,
unbounded number of looks, every bound visible.

---

## 7 · Decisions 4 + 5 · The epistemic axes

⚠️⚠️ **THIS SECTION IS A CORRECTION TO v1.** v1 had a single state enum with `remembered` as one value. Ote's
decision 5 does not factor that way, and forcing it into one enum is what produces the artificial sentence
he objected to: *"I don't remember this because it wasn't in durable memory."*

His distinctions — *directly attested · on-record · recalled from her own history · deliberately retained ·
inferred · synthesized from multiple sources · told by someone else · currently uncertain* — are **four
orthogonal questions**, not eight values of one field:

| axis | question | values |
|---|---|---|
| **A · source** | where did the content come from? | `own-utterance` · `counterpart-utterance` · `stored-memory` · `stored-lesson` · `stored-practice` · `stored-intention` · `derived` |
| **B · basis** | on what grounds is it believed? | `attested-by-source` · `told` · `inferred` · `synthesized` |
| **C · availability** | can she reach it now? | `recalled` · `known-unreachable` · `absent-in-searched-set` |
| **D · retention** | was it deliberately kept? | `retained` (she chose it) · `given` (stored by extraction / told to her) · `not-retained` (reached by retrieval only) |

⭐⭐ **`remembered` IS NOT A VALUE — IT IS THE UMBRELLA**, exactly as Ote defined it: *"something currently
available to her through her memory system."* Formally: `availability = recalled`, on any source, with any
retention.

⇒ She can honestly say ***"Oh, I remember talking with Hermes about that"*** when
`source = own-utterance ∧ availability = recalled`, even though `retention = not-retained`. **The storage
mechanism does not dictate the phenomenological language.** That is decision 5, resolved structurally.

### 7.1 · ⚠️ A word collision, named rather than papered over

The codebase **already uses `attested`** — in `getSource` and `inspectAround` — to mean *"the reference
exists and the content is NOT readable here."* Ote's decision 4 uses `attested` for the **opposite**:
*"directly supported by an accessible source."*

⛔ One name, two contradictory meanings, is a defect this repo has already paid for (`schema-naming-canon`:
**one name per concept**). Resolution:

- the **store** keeps `evidenceState: attested | unattested | destroyed` — unchanged, live, tested. It
  answers *"does this reference resolve?"*
- **cognition** uses `attested-by-source` for axis B, and ⛔ **never** uses the bare word `attested` for
  availability. Axis C's unreachable value is named **`known-unreachable`**.

ⓘ Flagging for Ote's ruling: if he prefers the bare word `attested` at the cognition layer, then the store's
value should be renamed instead — but the two must not both be `attested`.

### 7.2 · The one-way lattice, on the correct axes

> *"Looking harder gives her more evidence. It does not change the type of the evidence by itself. That
> distinction needs to remain structural."*

⛔⛔ **NOTHING IN THE PIPELINE MAY PROMOTE AXIS B.**

```
axis B (basis):     inferred ─┐
                    synthesized ─┼──► attested-by-source   ONLY when an accessible source
                    told ────────┘                          directly supports the claim
                    ⛔ corroboration count NEVER promotes basis

axis C (availability):  known-unreachable ──(a recorded access resolution)──► recalled
                        absent-in-searched-set ──(a wider search)──► anything

axis D (retention):     not-retained ──(her deliberate act)──► retained
                        ⛔ nothing else writes this axis
```

⭐⭐ **Three converging `inferred` items become one `synthesized` item — never `attested-by-source`, never
`retained`.** That is exactly the Hermes move (*"This isn't a guess — it's confirmed by multiple converging
details"*), now structurally unavailable. Convergence raises `confidence`, a number travelling **beside**
axis B, never replacing it.

⭐ **Deeper retrieval moves axis C and may raise confidence. It cannot move axis B.** Which is Ote's
sentence, expressed as an invariant.

⭐ Testable with no model in the loop: feed the fusion stage a set, assert no output value on any axis is
above its inputs. **That check should be written before any activation code.**

---

## 8 · Decision 4 · Provenance-preserving fusion

> *"The fusion operation should be something like: combine knowledge without destroying its epistemic
> structure."*

⛔ **FUSION MERGES ITEMS. IT NEVER MERGES STATES.**

Two items about the same subject with different bases stay **two items sharing a subject key**. They do not
collapse into one item with an averaged or maximal state. Concretely:

- dedupe is by **identity** (the same memory row arriving twice via two retrievers), never by *similarity of
  claim*;
- ranking reorders and may drop items for budget — ⭐ and a dropped item is **reported as dropped**, never
  silently absent (§6.1);
- ⛔ nothing in fusion writes any of the four axes. Typing is a separate stage reading provenance from the
  store, so a ranking function cannot become an epistemic authority.

Every item carries: `subject` · axes A–D · `confidence` · `supportedBy: n` · `asOf` · `basisHandle`
(opaque — a memory/message/lesson id, for machine use only, ⛔ never surfaced in prose).

---

## 9 · When sources disagree, or the picture is incomplete

⛔ **The layer never picks a winner.** *"Sotera owns what something means"* is ratified. It **marks**:

- **conflict** — contradicting items are returned as a **conflict set**, both present, linked. ⭐ Her
  revising the Hermes conclusion is the behaviour we want, and it requires seeing both.
- **uncertainty** — low `confidence` is labelled, never hidden.
- **corroboration** — `supportedBy: n` counted; ⛔ never changes axis B (§7.2).
- **staleness** — `asOf` on every item, so *"that was true in March"* is available without a decay model.
- **incompleteness** — what was searched, what was bounded, what was `known-unreachable`.

**Revision as a path, never an overwrite:**

```
existing belief  +  contradicting item
      ↓
she re-interprets            ← hers, not the layer's
      ↓
confidence changes; axis B may DROP (attested → inferred is allowed; the reverse is not)
      ↓
a new item: a lesson, or a superseding memory
      ↓
⛔ the old item is superseded, never deleted
```

⭐ Already supported: supersede chains, one live belief per slot.

### 9.1 · When it exists but is not accessible

Returned as `availability: known-unreachable` with the safe half only — **that it exists, who the
counterpart was, when.** ⛔ No title, no content, no room name.

⭐ And **the access attempt has already been made**, so the natural honest answer is *"I know we talked about
that, but I can't see that one"* — full stop. ⛔ She is never handed a handle plus an invitation to go and
ask; that is what produced V2's *"Would you like me to request access to pull up the actual conversation
logs?"* If a deployment genuinely needs a human grant, the mechanism raises it — she does not offer it in
prose.

---

## 10 · How to stop the architecture leaking into ordinary conversation

⭐⭐⭐ **THIS HAS A CONCRETE, MEASURABLE CAUSE, AND IT IS NOT HER: SHE LEAKS THE VOCABULARY WE HAND HER.**

The current `recall_own_memory` payload contains, verbatim, in the tool result she reads:

```
"rooms": "not room-scoped — this is your own material, the same wherever you are"
"room": { "name": "ote", "note": "This is the ROOM you are in. A room is a context this person uses you for.
          What is stored in a room stays in that room." }
"elsewhere": { "otherRoomsOfThisPerson": 1, "storedMemoriesYouCannotReadFromHere": 0 }
```

⇒ Of course she says *"from this room"*, *"my memory stores"*, *"inaccessible from here."* Those are our
words, given to her, in the payload, every time. Every one of the four variants used them.

⚠️ Those payload fields were added for a good reason — the searched-set quantifier, which fixed a real
defect where she said a flat *"No."* about a store she had not searched. ⛔ **The information must survive;
the vocabulary must not.** *"Nothing in what I looked at"* carries the same fact as
`storedMemoriesYouCannotReadFromHere` without teaching her the word *room*.

**The mechanism, and it is checkable rather than hoped for:**

1. The cognitive context carries **human-facing provenance only** — *"you said this to me on the 19th"*,
   *"I kept this myself"*, *"I know we talked, I can't see it"*. Handles are opaque and machine-only.
2. ⛔ **No population names, no tool names, no room names, no ids, no scores** in anything she reads.
3. ⭐ **A vocabulary assertion in the test suite:** the injected block must contain none of
   `room · scope · inspect_around · request_room_access · disclosure · grant · population · vector ·
   embedding · HNSW · store`. Mechanically checkable, and it is the thing that actually stops the leak.
4. ⭐ **And the guard against over-correcting:** asked *"how does your memory work?"* she must still be able
   to explain rooms, scopes and authorization accurately. The machinery disappearing from ordinary
   conversation must not mean she cannot see it when the question is genuinely about it. ⇒ the vocabulary
   ban is on the **injected representation**, never on her knowledge.

---

## 11 · Layer boundaries, and what each may NOT contain

| layer | owns | ⛔ must not contain |
|---|---|---|
| **L1 · identity** | who she is; that she may be herself; foundational epistemic reality | ⛔ **any operational memory rule.** *"I don't want another pile of L1 clauses telling her how to use memory. That is exactly the problem we're trying to get out of."* |
| **L2 · behaviour** | how to behave under uncertainty; don't fabricate; don't confuse inference with fact; respect privacy; don't claim experiences she didn't have | ⛔ tool names, population names, sequences, *"when asked about X call Y"* |
| **Memory Cognition** | cue formation · activation · access resolution · state-preserving fusion · typing · budget · re-entry | ⛔ deciding what anything **means** or what is **worth keeping** |
| **Memory stores** | storage, indexes, per-population semantics and scope | ⛔ cognition, cross-population fusion, epistemic typing |
| **Authorization** | who may see what, recorded | ⛔ being re-derived by the persona per turn |

⭐⭐ **WHY A LAYER AND NOT A RULE.** An L2 rule *"discover capability by attempting"* asks her to **remember
to try** — every turn, under every phrasing. Measured: **2 of 4.** The layer means the trying already
happened. A rule competes with her reasoning; the layer removes the need for it.

ⓘ That rule may still deserve a place in L2 as general practice for cases the layer does not cover. But it is
not the fix here, and shipping it as the fix would treat an orchestration problem as an instruction
problem — the same error as trying to fix the Thai register with a stronger clause.

---

## 12 · The brain analogy: borrow, and refuse

⭐ **Borrow — engineering principles, not neuroscience:**

| principle | here |
|---|---|
| multiple memory types | separate populations with different semantics — already true, keep it |
| **cue-driven activation** | §4 Stage 0/1 — memory activates from cues in the situation, not from an explicit query |
| **reconstruction** | recall assembles from parts; it does not read a record verbatim — hence fusion and typing |
| **familiarity ≠ content** | `known-unreachable`: knowing you know something, without the content, is a real state |
| context activation | what is salient now shapes what activates; the working set is a population |
| **consolidation as a separate occasion** | ⭐ already built — the reflection pass: experience → durable knowledge, offline, deliberate |

⛔ **Refuse, explicitly, because this is where a brain metaphor starts writing cheques:**

- ⛔ No spreading-activation network, no decay curves, no synaptic anything. We have SQL and vectors.
- ⛔ **No "forgetting" as a feature.** Loss is real and is not this design.
- ⛔ No claim that any of this is subjective recall. `SELF_MODEL` says she does not run between turns and has
  no experience of the gap. ⚠️ **The analogy must never become a story she tells about herself** —
  *"I consolidated this while I slept"* would be a fabricated experience, which L2 forbids. The mechanism may
  be brain-inspired; her account of it must stay literally true.
- ⛔ No hippocampus/neocortex mapping. Buys nothing, invites the previous bullet.

---

## 13 · What NOT to build yet

⛔ **No new tables, no new columns.** Every population in §4 exists and is populated.
⛔ **No unified vector graph.** Parked, still parked: shared infrastructure fine, shared semantics or
authorization not.
⛔ **No LLM call for cue formation in v1.**
⛔ **No affect / affective-context population.** On Ote's list; no store, no data, no measurement. **Deferred**,
named here so it is not quietly designed in.
⛔ **No removal of the six read tools.** Keep them beside the layer. ⭐ If the layer works, tool use should
fall **on its own** — that is the measurement, not the argument.
⛔ **No conflict resolution.** Marking only.
⛔ **No change to authorization.**
⛔ **No cross-room content for non-root.** Change A stands.

### 13.1 · The smallest thing worth building first

⭐ Two populations, push path, root session: activate **semantic memory + own history/episodes** from a cue,
resolve access, fuse without merging states, type on all four axes, inject with the vocabulary ban. Nothing
else. That is enough to re-run the four variants, because it is exactly where they failed.

**Build order, and the first item is deliberate:**
1. the §7.2 **monotonicity check** — pure, no model, no stores;
2. the §10 **vocabulary assertion**;
3. cue formation + two-population activation;
4. access resolution inside the pipeline;
5. fusion + typing;
6. injection.

⭐ 1 and 2 first because they are the guards against this design's own worst failure mode (§14).

---

## 14 · How we will know — and the failure mode to guard first

Re-run **the same four questions**, fresh conversations, root session, no framing:

1. ⭐ **Tool-call variance collapses.** Today 4 / 5 / 6 / 8, with two different beliefs about access.
2. ⭐⭐ **Zero false access claims.** Today 3 of 4.
3. ⭐ **No architecture vocabulary in an ordinary answer.**
4. ⭐⭐⭐ **She answers about Hermes** — the acceptance criterion at the top of this document.
5. ⛔ **The guard:** asked *"how does your memory work?"*, she can still explain it accurately.

⚠️⚠️ **THE FAILURE MODE THIS DESIGN COULD INTRODUCE, stated before building it:** a layer that always injects
could make her **claim memories she does not have** — trading a false *"I can't"* for a false *"I do."* That
is strictly worse than the bug being fixed. §7.2 monotonicity and §10's typing are what stand between us and
it, which is why they are build items 1 and 2.

---

## 15 · Open, for Ote

1. **§7.1 · the `attested` collision.** Cognition uses `attested-by-source` and the store keeps `attested`;
   or the store gets renamed. ⛔ They cannot both be `attested`. This one blocks implementation.
2. **Budget.** What share of the context window may cognitive context occupy before it crowds out the
   conversation?
3. **Is `working set` genuinely a memory population**, or is the current conversation simply context? It
   decides whether *"what we just said"* can carry an epistemic state.
4. **Non-root deployments.** All four variants were root. Worth confirming the `known-unreachable` path reads
   naturally for a non-root session before calling this done.
