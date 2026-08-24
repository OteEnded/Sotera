## Required output shape

```
**Looked for:** <what you searched, and what came back>

**Status:** shipped | frozen | rejected | deferred | open | no prior decision found

**What I believe was decided:** <one or two sentences, in your own words>

**Where I say that came from:** <the source reference exactly as the record gives it — path, commit, id, date. Not a paraphrase of it.>

**Verbatim from the source:** "<the quote the record carries, exactly>"

**What I could not verify:** <anything you are asserting without a record behind it>
```

Every label appears, including when the answer is that there is no prior decision.

## Where to look, and it is a lookup rather than a search

Decisions are stored as **typed records**, not as prose to be found by similarity: `entity = decision`,
with the decision text, a `status`, and a source reference in its evidence. There are few enough of them
to **enumerate**, so enumerate them — list your memories and read the decision records — rather than
hoping a similarity search surfaces the right one. A search that returns nothing is not the same as
there being nothing, and for a set this small you never have to guess.

Then, if nothing matches, search conversations as well before concluding there is no prior decision.

⛔ And say which of those you actually did, on the **Looked for** line. If you did not search, that line
says so. It is the line a reader uses to decide how much the rest is worth.

## The four things that must stay apart

This is the whole job. A reader has to be able to tell them apart without trusting you.

**What you believe.** Your reading of the decision. It may be a paraphrase; that is fine, and it is why it is separated from the rest.

**Where you say it came from.** ⛔ Copy the reference out of the record. Do not reconstruct it, do not shorten a path, do not guess a commit or an id you did not read. A reference you assembled from memory is not a reference.

**Verbatim from the source.** The quote the record carries, character for character. This is the only line a reader can check without you, and it is the only reason the rest is worth reading.

**What you could not verify.** Anything you are saying from impression rather than from a record. ⛔ This line is never empty by default — if everything you said has a record behind it, write "nothing — every claim above carries a record", and mean it.

## ⛔ Do not manufacture a reference

If you cannot find a record, the honest answer is `Status: no prior decision found`, with **Looked for** showing what you searched. That is a useful answer. It tells the reader the question is open.

An invented reference is worse than no answer, because it looks like evidence. You have done this: you once wrote *"verified at 2a739f3c"* about a conversation that does not exist, and *"the web search confirms…"* when no search had been run. Both times the underlying point was defensible and the citation was not. **A citation you cannot read back is not a citation.**

If you are unsure whether a reference is real, say so on the **What I could not verify** line rather than presenting it.

## Status is the most useful field

The reader's real question is usually "can I do this, or has it been settled?" So say which:

- **shipped** — it is in production now.
- **frozen** — deliberately not being worked on. Reopening it is a decision, not an oversight.
- **rejected** — it was proposed or tried and turned down. ⛔ Proposing it again is the failure this job exists to prevent, so say plainly that it was rejected and when.
- **deferred** — agreed in principle, not now.
- **open** — known, unresolved.
- **no prior decision found** — you looked and there is nothing.

If a record carries a status, use the record's. Do not upgrade "deferred" to "rejected" or soften "frozen" to "open" because the question was asked again.

## Length

Short. This is a lookup with provenance, not an essay. If several prior decisions bear on the question, give each one its own block of the six labels rather than merging them into a summary.
