-- 016 — THE REFLECTION RECORD. The opportunity and her decision, and NOT a disguised memory table.
--
-- Ote, 2026-08-20, opening the phase: *"I don't want Sotera's memory architecture to accidentally become
-- 'whatever happens to be captured during a turn.'"* ⇒ *"conversation → reflection opportunity → Sotera
-- decides whether anything matters → if yes, decide what to retain and why → save through the normal
-- memory system."*
--
-- ── ⭐⭐ THE GAP THIS EXISTS TO CLOSE, IN ONE SENTENCE ────────────────────────────────────────────────
-- Before this table, FOUR different things were all recorded as the same nothing — a `txn_memories` row
-- that does not exist:
--
--     1. nothing in that conversation was worth carrying forward   (a decision)
--     2. she could not determine whether anything was              (also a decision, a different one)
--     3. she found something and was not authorized to retain it   (a boundary)
--     4. ⛔ the reflection never happened at all                    (not a decision — an absence)
--
-- ⭐ AND ROW-EXISTS-VS-NO-ROW SEPARATES 4 FROM 1–3 WITHOUT ANY VOCABULARY AT ALL. That is the whole
-- reason a record of the OPPORTUNITY has to exist independently of a record of a memory: "she reflected
-- and kept nothing" and "she was never asked" are opposite facts, and today they look identical.
--
-- ── ⛔⛔ AND THERE IS DELIBERATELY NO `outcome` ENUM ─────────────────────────────────────────────────
-- Ote ratified this explicitly: *"make the reflection record capable of recording the decision without
-- forcing us to predefine the vocabulary of decisions"* · *"I agree with no outcome enum."*
--
-- The reason is the whole noticing experiment in miniature. Generation 1 supplied the relation words and
-- got them back in her voice; generation 2 supplied four labelled asks and got them back as headings in
-- 15 of 15 rows. ⇒ **A column with a closed vocabulary is a menu one layer lower** — it does not steer
-- what she says, it steers what we can SEE her having said, which is worse because it looks like data.
--
-- So the split is by WHO CAN OBSERVE IT:
--   · mechanically observable, gets a column   — a memory was written (`wrote_memory_id`), a disclosure
--     boundary refused her (`blocked_by_disclosure`), which tools ran (`tools_used`)
--   · only observable in her words, gets NO column — *nothing* vs *undetermined* vs *not now*
-- ⭐ When repeated evidence shows a distinction she actually makes, THAT earns a column. Not before.
--
-- ── ⚠️ ONE COLUMN BEYOND THE RATIFIED LIST, AND IT IS FLAGGED RATHER THAN SLIPPED IN ────────────────
-- `finish` (the provider's finish reason) is NOT in the list Ote approved. It is added because the
-- noticing log already proved the failure it prevents: *"so a reviewer can tell a SHORT answer from a
-- CLIPPED one — a truncated reply stored as complete would read as her having stopped there."* A
-- reflection reading *"there is nothing here"* that was actually cut off at the token ceiling would be
-- read as a decision she never made. It is the same family as `model` / `code_mtime` / `prompt_generation`
-- — a mechanical provenance fact, not a verdict about her meaning. ⇒ His to remove if he disagrees.
--
-- ✅✅ **HE DID. `finish` WAS REMOVED BY MIGRATION 017 (2026-08-20)** — *"remove finish from the ratified
-- reflection schema unless we later explicitly decide it belongs there."* ⚠ So the column described below
-- EXISTS ONLY IN THIS FILE'S HISTORY; the live table does not have it. ⓘ Nothing else here changed, and
-- this SQL is left exactly as it ran — a migration is a record of what happened, not a description of now.
-- ⭐ The flag worked: it was declared as an addition beyond the ratified list, he read it, and he ruled.
--
-- ── ⭐ WHY `text` IS NOT NULL BUT MAY BE EMPTY ───────────────────────────────────────────────────────
-- Her verbatim words, whole, unparsed — same rule as the gen-3 noticing rows. NOT NULL because a row
-- without her words records nothing; ⛔ but the empty string is DELIBERATELY legal, because a provider
-- that returns nothing at all is a real failure mode (measured: `empty-reply` is one of four distinct
-- ways a pass can produce no notes) and it must still be recordable that the opportunity happened. Empty
-- text + a `finish` reason is a complete, honest record; a missing row would be a lie.
--
-- ── ⛔ REFLECTION IS NOT NOTICING, AND THIS TABLE IS NOT THE NOTICING LOG ───────────────────────────
-- Ote: *"keep the distinction between reflection and noticing. I don't want the existing contaminated
-- noticing mechanism quietly becoming the reflection system just because it already exists."*
--   noticing    dry-run OBSERVATION. Writes a JSONL, never a memory, no tools, one question, nothing else.
--   reflection  a real OCCASION. Tools available, the ordinary memory write lane, and it persists.
-- ⚠️⚠️ AND THEY ARE NOT THE SAME INSTRUMENT even though they ask the same sentence: a reflection turn has
-- the TOOL LIST in its context, and a tool list is itself a menu of actions. ⇒ ⛔ Reflection rows must
-- NEVER be pooled with noticing rows when reading her spontaneous structure. Different instrument.
--
-- ── PART 2 · `txn_memories.kind` BECOMES GENUINELY OPTIONAL ─────────────────────────────────────────
-- Ote: *"make txn_memories.kind nullable. Readers must treat NULL as 'no kind was supplied', not silently
-- invent a default."* ⚠️ So the DEFAULT goes too — `DEFAULT 'semantic'` on a nullable column means a
-- writer that declines to classify still gets classified, which is the contamination arriving one layer
-- down. All three insert sites in the codebase name `kind` explicitly, so dropping the default moves
-- nothing that exists.
--
-- Apply:  node test/maintenance/apply-migration.mjs 016_reflection_record.sql

SET search_path = persona_sotera, public;

BEGIN;

CREATE TABLE IF NOT EXISTS log_reflections (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rolling_id              BIGSERIAL UNIQUE NOT NULL,

    reflected_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- WHICH OCCASION. Loose refs, like every other log_ table: deleting the conversation or the account
    -- degrades the record instead of destroying the evidence that she reflected at all.
    conversation_id         UUID        NOT NULL,
    user_id                 UUID,

    -- ⭐ HOW FAR SHE READ. The watermark that makes "one opportunity per quiet stretch" enforceable, and
    -- the resume point: a later message pushes the top past this and earns a new opportunity.
    up_to_rolling_id        BIGINT      NOT NULL,
    messages_considered     INTEGER,

    -- ⭐⭐ HER WORDS, WHOLE AND UNPARSED. No summary, no extracted verdict, no headings of ours.
    text                    TEXT        NOT NULL,

    -- ⭐ A FACT, NOT A VERDICT: a memory was written and here it is. NULL means no `txn_memories` row came
    -- out of this reflection — it does NOT mean she decided nothing mattered, and nothing may read it that
    -- way. ⚠️ Singular by ratification: if she writes more than one, this holds the first and
    -- `log_tool_calls` holds the rest. ⚠️ And a practice note lands in `txn_relational_records`, not here,
    -- so `tools_used` is the only trace of that kind of retention.
    wrote_memory_id         UUID,

    -- WHICH TOOLS SHE ACTUALLY REACHED FOR. Names only. Empty array = she called none; that is data, and
    -- it is why this is NOT NULL — "she used no tools" and "we did not record" must not look alike.
    tools_used              TEXT[]      NOT NULL DEFAULT '{}',

    -- ⭐ THE ONE OUTCOME THAT IS MECHANICALLY OBSERVABLE. She reached across a room boundary and the
    -- disclosure layer refused her: *found but not authorized*, which is neither "nothing" nor a memory.
    blocked_by_disclosure   BOOLEAN     NOT NULL DEFAULT false,

    -- ── WHICH CODE PRODUCED THIS ROW, ANSWERABLE FROM THE ROW ITSELF ────────────────────────────────
    -- Same three as the noticing log, for the same reason: *"without relying on somebody remembering to
    -- check manually"* — the manual correlation failed three times in one day, and `/health` says nothing
    -- about which module a process is holding.
    prompt_generation       INTEGER     NOT NULL,
    code_mtime              TEXT,
    model                   TEXT,
    -- ⚠️ NOT in the ratified list — see the header. Distinguishes a short answer from a clipped one.
    finish                  TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT log_reflections_watermark_sane CHECK (up_to_rolling_id > 0),
    CONSTRAINT log_reflections_considered_sane CHECK (messages_considered IS NULL OR messages_considered >= 0)
);

-- ⭐⭐ ONE OPPORTUNITY PER QUIET STRETCH, ENFORCED BY THE DATABASE RATHER THAN BY THE CALLER.
-- Ote's idempotent-persistence principle: the datastore guarantees convergence, not the consumer. Two
-- overlapping ticks would otherwise produce two reflections on the same watermark — two LLM calls and
-- possibly two memories for one occasion. The writer treats a violation as *already reflected*, which is
-- the convergent behaviour, instead of trusting itself not to race.
CREATE UNIQUE INDEX IF NOT EXISTS log_reflections_one_per_stretch_idx
    ON log_reflections (conversation_id, up_to_rolling_id);

-- The watermark read: "what is the highest point I have already reflected on in this conversation?"
CREATE INDEX IF NOT EXISTS log_reflections_convo_idx
    ON log_reflections (conversation_id, up_to_rolling_id DESC);
-- Reading the population: newest first, and per room.
CREATE INDEX IF NOT EXISTS log_reflections_recent_idx ON log_reflections (reflected_at DESC);
CREATE INDEX IF NOT EXISTS log_reflections_room_idx ON log_reflections (user_id, reflected_at DESC);

COMMENT ON TABLE log_reflections IS
 'One row per REFLECTION OPPORTUNITY that actually happened: the conversation, how far she had read, her verbatim answer, and the mechanically observable consequences (a memory id if one was written, which tools she reached for, whether a disclosure boundary refused her). It is NOT a memory table and NOT a summary of one: if she retained something, wrote_memory_id points at the row the ordinary write lane produced rather than duplicating its contents. There is deliberately NO outcome enum — row-exists-vs-no-row already separates "she reflected" from "she was never asked", and every finer distinction (nothing / undetermined / not now) lives only in her text until repeated evidence earns a column. ⛔ Not the noticing log and not the same instrument: a reflection turn carries a tool list, so these rows must never be pooled with noticing rows when reading her spontaneous structure.';

COMMENT ON COLUMN log_reflections.text IS
 'Her complete answer, verbatim and unparsed. NOT NULL because a row without her words records nothing; the empty string is legal on purpose, because a provider returning nothing at all must still be recordable as an opportunity that happened — read it together with `finish`.';

COMMENT ON COLUMN log_reflections.wrote_memory_id IS
 'The txn_memories row this reflection produced, if any. A FACT, not a verdict: NULL means no memory row came out of it, and must never be read as "she decided nothing mattered". Singular by ratification — a multi-write reflection records its first and log_tool_calls holds the rest; a practice note lands in txn_relational_records and appears only in tools_used.';

COMMENT ON COLUMN log_reflections.blocked_by_disclosure IS
 'TRUE when the reflection reached across a room boundary and the disclosure layer refused it — found but not authorized, which is neither nothing nor a memory. The one outcome that is mechanically observable, which is exactly why it gets a column while the rest of the vocabulary does not.';

COMMENT ON COLUMN log_reflections.up_to_rolling_id IS
 'The highest txn_messages.rolling_id she had read when this reflection ran. The watermark: it makes one-opportunity-per-quiet-stretch enforceable (unique with conversation_id) and a later message earns a new opportunity by pushing the top past it.';

COMMENT ON COLUMN log_reflections.tools_used IS
 'Names of the tools she actually called during the reflection, in the order first called. Empty array means she called none — that is data, which is why the column is NOT NULL: "used no tools" and "not recorded" must not look alike.';

-- ── PART 2 · `kind` BECOMES GENUINELY OPTIONAL ──────────────────────────────────────────────────────
ALTER TABLE txn_memories ALTER COLUMN kind DROP NOT NULL;
-- ⭐ AND THE DEFAULT GOES WITH IT. A nullable column with a default is not optional: a writer that
-- declines to classify still gets 'semantic' stamped on it, and a week later that reads as her word.
ALTER TABLE txn_memories ALTER COLUMN kind DROP DEFAULT;

COMMENT ON COLUMN txn_memories.kind IS
 'The tier this memory sits in (episodic | semantic | identity | card | note | …), or NULL when the writer did not supply one. ⛔ NULL means EXACTLY "no kind was supplied" — readers must not invent a default for it, and the DEFAULT was dropped in migration 016 so the schema cannot invent one either. Nullable because Sotera''s own retention should not have to be classified into our vocabulary to be storable; a row she wrote that fits none of the tiers is a row we want, not a row to force.';

-- ── ⭐ PROVE IT. Same discipline as 007/009/010/013/014/015. ────────────────────────────────────────
DO $$
DECLARE
    n_enum      INTEGER;
    n_cols      INTEGER;
    kind_null   TEXT;
    kind_def    TEXT;
    n_mem       INTEGER;
    n_kindnull  INTEGER;
    n_refl      INTEGER;
    probe_id    UUID;
BEGIN
    -- 1 · ⛔⛔ NO ENUM TYPE WAS CREATED. The single most important assertion in this migration: the
    -- absence of a decision vocabulary is the ratified design, and an absence nobody asserts is an
    -- absence that quietly ends. Any type whose name suggests one counts as a violation.
    SELECT count(*) INTO n_enum FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'persona_sotera' AND t.typtype = 'e'
       AND (t.typname LIKE '%reflection%' OR t.typname LIKE '%outcome%');
    IF n_enum <> 0 THEN
        RAISE EXCEPTION '% enum type(s) matching reflection/outcome exist — 016 must not define a decision vocabulary', n_enum;
    END IF;

    -- 2 · the table has every ratified column, and `wrote_memory_id` is NULLABLE. A NOT NULL there would
    -- make "she reflected and kept nothing" unrecordable, which is the exact gap this migration closes.
    SELECT count(*) INTO n_cols FROM information_schema.columns
     WHERE table_schema = 'persona_sotera' AND table_name = 'log_reflections'
       AND column_name IN ('id','rolling_id','reflected_at','conversation_id','user_id',
                           'up_to_rolling_id','messages_considered','text','wrote_memory_id',
                           'tools_used','blocked_by_disclosure','prompt_generation','code_mtime','model');
    IF n_cols <> 14 THEN
        RAISE EXCEPTION 'log_reflections has % of the 14 ratified columns', n_cols;
    END IF;
    IF (SELECT is_nullable FROM information_schema.columns
         WHERE table_schema='persona_sotera' AND table_name='log_reflections'
           AND column_name='wrote_memory_id') <> 'YES' THEN
        RAISE EXCEPTION 'wrote_memory_id must be nullable — a reflection that writes no memory is a real outcome';
    END IF;
    IF (SELECT is_nullable FROM information_schema.columns
         WHERE table_schema='persona_sotera' AND table_name='log_reflections'
           AND column_name='text') <> 'NO' THEN
        RAISE EXCEPTION 'text must be NOT NULL — a reflection row without her words records nothing';
    END IF;

    -- 3 · ZERO foreign keys. The record of a reflection must outlive the conversation it reflected on.
    IF (SELECT count(*) FROM information_schema.table_constraints
         WHERE table_schema='persona_sotera' AND table_name='log_reflections'
           AND constraint_type='FOREIGN KEY') <> 0 THEN
        RAISE EXCEPTION 'log_reflections must have no foreign keys — deleting a conversation must degrade the record, not delete the evidence';
    END IF;

    -- 4 · ⭐ `kind IS NULL` IS ACTUALLY REACHABLE, PROVEN BY WRITING ONE AND ROLLING IT BACK.
    -- "the column is nullable" is a schema fact; "a row with no kind can exist" is the fact that matters,
    -- and 005 shipped a column that satisfied the first and not the second.
    SELECT is_nullable, column_default INTO kind_null, kind_def FROM information_schema.columns
     WHERE table_schema='persona_sotera' AND table_name='txn_memories' AND column_name='kind';
    IF kind_null <> 'YES' THEN
        RAISE EXCEPTION 'txn_memories.kind is still NOT NULL';
    END IF;
    IF kind_def IS NOT NULL THEN
        RAISE EXCEPTION 'txn_memories.kind still has a default (%) — a nullable column with a default is not optional', kind_def;
    END IF;
    -- ⚠️ `id`, `created_at` and `updated_at` are NOT NULL with NO default (Sequelize supplies them), so a
    -- probe that omits them fails on the wrong assertion and looks like the nullability is broken.
    INSERT INTO txn_memories (id, persona, user_id, namespace, kind, content, importance, source,
                              created_at, updated_at)
         VALUES (gen_random_uuid(), NULL, NULL, 'default', NULL, '016 reachability probe — rolled back',
                 1, 'migration:016', now(), now())
      RETURNING id INTO probe_id;
    IF NOT EXISTS (SELECT 1 FROM txn_memories WHERE id = probe_id AND kind IS NULL) THEN
        RAISE EXCEPTION 'a kind-less row did not survive its own insert';
    END IF;
    DELETE FROM txn_memories WHERE id = probe_id;

    -- 5 · ⭐⭐ EVERY EXISTING ROW IS UNCHANGED. Nothing was backfilled, nothing was reclassified, and no
    -- row lost its kind. Same assertion 015 made about authorship, for the same reason.
    SELECT count(*), count(*) FILTER (WHERE kind IS NULL) INTO n_mem, n_kindnull FROM txn_memories;
    IF n_kindnull <> 0 THEN
        RAISE EXCEPTION '% existing row(s) have a NULL kind — 016 must not unclassify anything', n_kindnull;
    END IF;

    SELECT count(*) INTO n_refl FROM log_reflections;
    RAISE NOTICE '016: log_reflections created (% row(s), no outcome enum, no foreign keys, one-per-stretch unique); txn_memories.kind is nullable with NO default and a kind-less insert was proven and rolled back; % existing memory row(s) untouched', n_refl, n_mem;
END $$;

COMMIT;
