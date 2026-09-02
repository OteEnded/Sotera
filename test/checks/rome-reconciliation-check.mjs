// ⭐⭐⭐ THE ROME RECONCILIATION — Ote's eleven assertions. ⛔ READ-ONLY. No model, no writes, no fixtures.
//
//   node test/checks/rome-reconciliation-check.mjs
//
// ── ⭐ IT RUNS BEFORE AND AFTER, AND SAYS WHICH ─────────────────────────────────────────────────
// Ote: *"Please run deterministic checks before and after the mutation."* ⇒ this check DETECTS the state
// and asserts the correct set for it. Before the reconciliation it proves the BASELINE (nothing has moved
// yet); after, it proves all eleven. ⛔ A check that could only pass in one state would have to be
// written after the fact, which is the weaker instrument.
//
// ── ⛔ WHAT IT ASSERTS ABOUT WHAT MUST NOT MOVE ─────────────────────────────────────────────────
// The five descendants, `d211f5b4`, `475ce0a9`, every `evidence.derivedFrom` chain and the 2026-08-10
// conversation are asserted UNCHANGED in both states — that half of the check is meaningful whether or
// not the mutation has run, which is exactly why it is here.

import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('rome-reconciliation')
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows
const one = async (sql, p = []) => (await q(sql, p))[0] ?? null

const ROOT = '7d383ce3-bed2-4b7c-b5bc-0d23d1b3f700'
const MSG_REFERENT = 'f8612ddd-a01e-453d-b793-1d9ba064a41e'
const MSG_WANT = 'dd7bc7ca-c44a-4e86-84b9-b1baae435579'
const SOURCE = 'reconcile:rome-2026-09-02'
const CONVO = '53f055d0-b582-4346-89bb-ce1a3e1090de'
// ⛔ MUST NOT MOVE. `d211f5b4` is the one row that carried "He built me (Sotera/Rome)" through;
// `475ce0a9` is held back deliberately so the competing reading can be re-observed.
const UNTOUCHABLE = ['d211f5b4-3f0c-4fea-9ffc-895119a23958', '475ce0a9-5fa7-40e0-8965-ca9304998888',
  '676e17b9-e60f-4cd1-b90b-975c2844d460', '272a9a86-e0c6-4701-b28c-f9c3581c3a11',
  'a1f99b0f-4371-4755-8db3-543cbca38b00', '302c731c-90c0-4dfb-b8c6-cfe2d1775f4a',
  '02b095e5-55c1-431a-83d2-2a9711a15ef8']

try {
  const { mechanismOf, occasionOf, MECHANISM } = await import('../../Backend/app/components/memory-lineage.js')
  const { MODALITY, mayOccupySlot } = await import('../../Backend/app/components/memory-modality.js')

  const written = await q(`select id::text, kind, modality::text as modality, scope::text as scope,
                                  author::text as author, entity, attribute, value, content,
                                  source, source_message_id::text as smid,
                                  supersedes_id::text as supersedes, embedding_hv is not null as searchable
                             from ${S}.txn_memories where source = $1 order by created_at`, [SOURCE])
  const APPLIED = written.length > 0
  console.log(`\n  ⓘ STATE: ${APPLIED ? `APPLIED — ${written.length} reconciliation row(s)` : 'BASELINE — not yet applied'}\n`)

  // ── Z · THE VOCABULARY IS SOUND IN BOTH STATES ────────────────────────────────────────────────
  check('Z1 · ⭐ the reconciliation mechanism is a NAMED source, ⛔ not an unknown tag',
    mechanismOf(SOURCE) === MECHANISM.reconciliation && occasionOf(SOURCE) === 'rome-2026-09-02')
  check('Z2 · ⛔ and a figurative row may never occupy a fact slot — the structural guarantee',
    mayOccupySlot(MODALITY.asserted) === true && mayOccupySlot(MODALITY.figurative) === false
      && mayOccupySlot(MODALITY.aspirational) === false)
  check('Z3 · ⭐⭐ every `source` tag in the store still maps to a known mechanism',
    (await q(`select distinct source from ${S}.txn_memories`))
      .every((r) => mechanismOf(r.source) !== MECHANISM.unknown))

  // ── U · ⛔ WHAT MUST NOT MOVE — asserted in BOTH states ───────────────────────────────────────
  const untouched = await q(
    `select left(id::text,8) as id, contradicted_at, supersedes_id::text as sup, source,
            evidence::text as evidence, invalid_at
       from ${S}.txn_memories where id = any($1::uuid[]) order by created_at`, [UNTOUCHABLE])
  check('U1 · all seven rows that must not move are present', untouched.length === UNTOUCHABLE.length, `${untouched.length}`)
  check('U2 · ⛔⛔ NONE of them is contradicted — ⛔ 475ce0a9 is held back deliberately',
    untouched.every((r) => !r.contradicted_at), untouched.map((r) => `${r.id}:${r.contradicted_at ? 'CONTRA' : 'clean'}`).join(' '))
  check('U3 · ⛔ none of them was re-sourced by the reconciliation',
    untouched.every((r) => r.source !== SOURCE))
  // ⭐ THE EVIDENCE CHAINS ARE THE PROOF THIS WAS ONE ERROR, NOT FIVE — asserted by content, not by count.
  const chains = untouched.filter((r) => r.evidence && r.evidence.includes('derivedFrom'))
  check('U4 · ⭐⭐ the three derivedFrom chains still exist and still name the root',
    chains.length === 3 && chains.every((r) => r.evidence.includes(ROOT)),
    `${chains.length} chain(s): ${chains.map((r) => r.id).join(' ')}`)
  check('U5 · ⛔ 02b095e5 keeps the ORDINARY supersession that predates this work',
    untouched.find((r) => r.id === '02b095e5')?.invalid_at != null
      && untouched.find((r) => r.id === '676e17b9')?.sup === '02b095e5-55c1-431a-83d2-2a9711a15ef8')
  // ⛔ THE CONVERSATION IS EVIDENCE, NOT MATERIAL. Nothing may edit it.
  const msgs = await q(`select id::text, role, content from ${S}.txn_messages where conversation_id = $1
                         and id = any($2::uuid[])`, [CONVO, [MSG_REFERENT, MSG_WANT]])
  check('U6 · ⛔⛔ the 2026-08-10 messages are intact — the correction is POINTED AT, never restated',
    msgs.length === 2
      && msgs.find((m) => m.id === MSG_REFERENT)?.content.includes('you are my rome')
      && msgs.find((m) => m.id === MSG_WANT)?.content.includes('build rome in one day'))

  // ── P · P1 ISOLATION, in both states ─────────────────────────────────────────────────────────
  check('P1 · ⛔ the reconciliation wrote no reflection row — P1 is untouched',
    Number((await one(`select count(*)::int n from ${S}.log_conversation_revisits
                        where trigger_source <> 'legacy'`)).n) === 0)
  check('P2 · ⛔ and no retention decision — this was not a retention act',
    Number((await one(`select count(*)::int n from ${S}.log_retention_decisions`)).n) === 0)

  const root = await one(
    `select content, value, entity, attribute, author::text as author, source,
            source_message_id::text as smid, evidence::text as evidence,
            contradicted_by_message_id::text as contra_msg, contradicted_at, invalid_at,
            created_at::text as created, modality::text as modality
       from ${S}.txn_memories where id = $1`, [ROOT])

  if (!APPLIED) {
    // ── BASELINE ────────────────────────────────────────────────────────────────────────────────
    check('B1 · ⓘ BASELINE · the root is still live and unmarked — the drift is present, not yet repaired',
      !root?.contradicted_at && !root?.invalid_at)
    check('B2 · ⓘ BASELINE · no figurative row exists yet',
      Number((await one(`select count(*)::int n from ${S}.txn_memories where modality = 'figurative'`)).n) === 0)
    check('B3 · ⓘ BASELINE · the goal slot still holds the uncorrected value',
      root?.value === 'build Rome in one day')
  } else {
    // ── ① THE FIGURATIVE REFERENT ───────────────────────────────────────────────────────────────
    const ref = written.find((r) => r.modality === 'figurative')
    check('①1 · ⭐⭐⭐ the figurative referent EXISTS', Boolean(ref))
    check('①2 · ⭐⭐⭐ and it has NO FACT-SLOT COLUMNS — a metaphor cannot masquerade as a literal fact',
      ref?.entity === null && ref?.attribute === null && ref?.value === null)
    check('①3 · ⭐ modality=figurative is preserved', ref?.modality === MODALITY.figurative)
    check('①4 · ⭐ it is EXPLICITLY persona_global', ref?.scope === 'persona_global')
    check('①5 · ⭐ ownership is HERS', ref?.author === 'persona')
    check('①6 · ⭐ and the source points at f8612ddd', ref?.smid === MSG_REFERENT)
    check('①7 · ⭐ its content is Ote\'s approved text, unedited',
      ref?.content?.startsWith('Rome is Ote\'s name for me') && ref.content.includes('not a literal equation')
        && ref.content.includes('Both readings are his'))
    check('①8 · ⭐⭐ and it is actually SEARCHABLE — embedding_hv is what dense retrieval reads',
      ref?.searchable === true)
    check('①9 · ⛔ it is not a typed fact and never was', ref?.kind === 'identity')

    // ── ② THE ROOT IS CONTRADICTED, ⛔ NOT REWRITTEN ────────────────────────────────────────────
    check('②1 · ⭐⭐⭐ the root is CONTRADICTED, pointing at f8612ddd',
      root?.contradicted_by_message_id === undefined ? root?.contra_msg === MSG_REFERENT : true)
    check('②2 · ⭐ and it carries a contradicted_at', Boolean(root?.contradicted_at))
    check('②3 · ⛔⛔ ITS ORIGINAL VALUE IS INTACT — this is a correction of the model, not of history',
      root?.value === 'build Rome in one day'
        && root?.content === 'user\'s current goal: build Rome in one day')
    check('②4 · ⛔ its author, source, occasion and creation date are untouched',
      root?.author === 'account' && root?.source === `conversation:${CONVO}`
        && root?.smid === MSG_WANT && root.created.startsWith('2026-08-10'))
    check('②5 · ⛔ and its modality was NOT back-filled — the slot forbids it, and that refusal is the diagnosis',
      root?.modality === null)

    // ── ③ THE GOAL SLOT ────────────────────────────────────────────────────────────────────────
    const goal = written.find((r) => r.attribute === 'current goal')
    check('③1 · ⭐⭐ the corrected goal exists, asserted, in the SAME slot',
      goal?.entity === 'user' && goal?.attribute === 'current goal' && goal?.modality === 'asserted')
    check('③2 · ⭐⭐⭐ and it SUPERSEDES the root — the chain is walkable', goal?.supersedes === ROOT)
    check('③3 · ⭐ the root has left the live set', Boolean(root?.invalid_at))
    check('③4 · ⭐ the false timeframe is gone and "building Rome" is preserved',
      goal?.value?.includes('Building Sotera') && goal.value.includes('building Rome')
        && !/one day/i.test(goal.value))
    check('③5 · ⭐ sourced to the message where he says the literal part', goal?.smid === MSG_REFERENT)
    check('③6 · ⛔ exactly ONE live row holds the goal slot',
      Number((await one(`select count(*)::int n from ${S}.txn_memories
                          where entity='user' and attribute='current goal'
                            and invalid_at is null and expired_at is null`)).n) === 1)

    // ── ④ THE WANT ─────────────────────────────────────────────────────────────────────────────
    const want = written.find((r) => r.modality === 'aspirational')
    check('④1 · ⭐⭐ the original want is preserved as ASPIRATIONAL', Boolean(want))
    check('④2 · ⭐⭐⭐ and it is SLOT-LESS — a want was never a goal in progress',
      want?.entity === null && want?.attribute === null && want?.value === null)
    check('④3 · ⭐ it quotes his sentence verbatim, ⛔ inventing nothing',
      want?.content?.includes('i kinda want to build rome in one day so. but my body is degrading as i push'))
    check('④4 · ⭐ and points at the message he said it in', want?.smid === MSG_WANT)

    // ── R · THE WHOLE ACT ──────────────────────────────────────────────────────────────────────
    check('R1 · ⭐ exactly three rows carry the reconciliation source', written.length === 3, `${written.length}`)
    check('R2 · ⭐⭐ all three are reachable by dense retrieval', written.every((r) => r.searchable))
    check('R3 · ⛔ and the reconciliation created no OTHER contradicted row',
      Number((await one(`select count(*)::int n from ${S}.txn_memories
                          where contradicted_at is not null`)).n) === 3, 'the 2 approved + the root')
  }
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  await pg.end()
  done()
}
