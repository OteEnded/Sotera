// ⭐⭐⭐ M2 · THE SEMANTIC RED-PROOF REGISTER — the LOCKED M2 rulings, made executable.
//
//   node test/checks/dreaming-m2-semantics-check.mjs
//
// ⭐⭐ A CHARACTERIZATION REGISTER, ⛔ NOT A PERMANENTLY-RED WISHLIST. Six M2 items are locked as WORDS
// and none of them has a schema, a module or a test. This file holds the executable form of those words
// AND asserts, as the current state, which are NOT BUILT — with the reason.
//
// ⇒ ⭐ it is GREEN today and goes RED the moment any of three things happens:
//   ① one of these is BUILT without activating its red-proofs here (the assertion of absence fails)
//   ② one is built and the SEMANTICS are wrong (the substantive red-proofs fire)
//   ③ a shipped DIVERGENCE from a locked ruling is silently fixed, or silently widened
//
// ⛔ A file that is simply red forever teaches everyone to ignore red. ⓘ Same discipline as
// `dreaming-baseline-check`: *"where current behaviour departs from the locked contract, this file
// asserts the DEPARTURE, with the reason, so that fixing it later shows up as a deliberate visible
// change rather than a green test that quietly moved."*
//
// ⭐ The run prints, at the end, exactly what M2 must still build. ⓘ The plan's rule stands:
// *"every locked clause gets a test, and a clause with no test is not implemented."*
//
// ── ⛔ WHAT THIS TOUCHES ─────────────────────────────────────────────────────────────────────────
//   ✅ read-only against production, ⛔ except one isolated schema it creates and drops
//   ⛔ NO model call · ⛔ NO reasoner · ⛔ NO run against the natural corpus
//   ⛔ NOTHING it does can enter P1's measurement population
//   ⓘ Ote, 2026-09-02: *"M2 design / semantic contract / red-proof work: GO. M2 live execution against
//     the natural corpus: NOT YET."*
//
// ── ⚠️⚠️ A NUMBERING COLLISION, RECORDED SO IT IS NOT REPEATED ──────────────────────────────────
// `M2-7` was used in conversation for the COEXISTENCE question. In the contract `M2-7` is already
// **LOCKED** and means something else entirely — *ordinary claim + separate warrant, no Dreaming-specific
// memory vocabulary*. ⛔ Nothing is renumbered here. The coexistence question is **M2-12**, the next free
// identifier, and it is a RULING QUESTION rather than an assertion — so it appears at the bottom as
// measured EVIDENCE for that ruling, ⛔ never as a pass/fail on a decision Ote has not made.

import { readFileSync, existsSync } from 'node:fs'
import { makeChecker, devPg, devSchema } from '../harness.mjs'

const { check, done } = makeChecker('dreaming-m2-semantics')
const pg = devPg(); await pg.connect()
const query = async (sql, p) => pg.query(sql, p)
const one = async (sql, p) => (await query(sql, p)).rows[0] ?? null
const PROD = devSchema()
const S = `"${PROD}"`

const COMPONENTS = new URL('../../Backend/app/components/', import.meta.url)
const src = (n) => (existsSync(new URL(n, COMPONENTS)) ? readFileSync(new URL(n, COMPONENTS), 'utf8') : null)
const codeOnly = (t) => String(t ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[^\n]*?\/\/.*$/gm, (l) => l.slice(0, l.indexOf('//')))
/** ⭐ Load something that may not exist yet; its absence is a NAMED red, ⛔ never an empty log. */
const tryImport = async (n) => { try { return await import(new URL(n, COMPONENTS)) } catch { return null } }
const hasTable = async (t) => Boolean(await one(
  `select 1 from information_schema.tables where table_schema=$1 and table_name=$2`, [PROD, t]))
const cols = async (t) => (await query(
  `select column_name from information_schema.columns where table_schema=$1 and table_name=$2`,
  [PROD, t])).rows.map((r) => r.column_name)

const spec = []
try {
  // ══ M2-5 · KIND COMPATIBILITY IS A MEMORY-LAYER PRECONDITION, BINDING EVERY WRITER ═════════════
  // ✅ LOCKED: *"Make kind compatibility a memory-layer precondition, applying to EVERY writer.
  // Unknown/mismatched kind → DEFER, ⛔ never an accidental UPDATE."*
  // ⭐ So the check is NOT Dreaming's — Dreaming merely becomes subject to it.
  const kindMod = await tryImport('memory-kind-precondition.js')
  if (typeof kindMod?.checkKind === 'function') {
    check('M2-5 · ⭐⭐ a memory-layer KIND PRECONDITION module exists', true)
    const unknown = kindMod.checkKind({ slotKind: null, claimKind: 'quantity' })
    check('M2-5 · ⛔⛔ UNKNOWN kind ⇒ DEFER — ⛔ never UPDATE, never IGNORE',
      unknown?.outcome === 'DEFER', JSON.stringify(unknown))
    const mismatch = kindMod.checkKind({ slotKind: 'person-name', claimKind: 'quantity' })
    check('M2-5 · ⛔⛔ MISMATCHED kind ⇒ DEFER — the M2.d defect: a quantity became `UPDATE, supersedes` '
      + 'on user/preferred_name', mismatch?.outcome === 'DEFER', JSON.stringify(mismatch))
    const match = kindMod.checkKind({ slotKind: 'person-name', claimKind: 'person-name' })
    check('M2-5 · ⭐ a MATCHING kind passes the precondition — ⛔ a gate that refuses everything is broken',
      match?.outcome === 'ALLOW', JSON.stringify(match))
    // ⛔ IT BINDS EVERY WRITER. A precondition that only fires for Dreaming would leave the defect in
    // place for the writers that already caused it.
    const kindCode = codeOnly(src('memory-kind-precondition.js') ?? '')
    check('M2-5 · ⛔⛔ the precondition is NOT gated on Dreaming — it binds EVERY writer',
      !/dreaming/i.test(kindCode))
    check('M2-5 · ⭐ …and it runs BEFORE the conflict stage, never inside it',
      !/resolveConflict/.test(kindCode))
  } else {
    // ⓘ ASSERTED AS THE CURRENT STATE. M2-5 is locked as words and has no implementation; the four
    // red-proofs above activate the moment one exists.
    spec.push('M2-5 · a memory-layer kind precondition — unknown/mismatched ⇒ DEFER, binding EVERY writer')
    check('M2-5 · ⓘ NOT BUILT — locked as words, no module. The 4 red-proofs above activate when it exists',
      kindMod === null)
  }
  // ⓘ MEASURED, so the cost of this ruling is visible rather than surprising.
  const slotCov = await one(`select count(*)::int as total, count(slot_id)::int as with_slot from ${S}.txn_memories`)
  check('M2-5 · ⓘ slot_id coverage — under this ruling, everything without one DEFERS', true,
    `${slotCov.with_slot} of ${slotCov.total} rows carry a slot_id`)

  // ══ M2-7 · ORDINARY CLAIM + SEPARATE WARRANT · ⛔ NO DREAMING-SPECIFIC MEMORY VOCABULARY ═══════
  // ✅ LOCKED: *"Ordinary memory claim + separate warrant/provenance. ⛔ No Dreaming-specific memory
  // vocabulary."* · *"⛔ Don't put evidence/provenance into the memory's value."*
  // ⇒ the five bespoke forms GO, and `recurrence` becomes the WARRANT rather than the claim.
  const proposalSrc = src('dreaming-proposal.js')
  const proposalCode = codeOnly(proposalSrc ?? '')
  check('M2-7 · ⭐ the proposal module was found — ⛔ else these assertions are vacuous', Boolean(proposalSrc))
  // ⚠️⚠️ TWO SHIPPED DIVERGENCES FROM A LOCKED RULING — characterized, ⛔ not asserted away. M2-7 retired
  // the five bespoke forms on 2026-09-01; `dreaming-proposal.js` still exports them because the code
  // predates the ruling and nothing has been built since. ⭐ Recorded so that removing them is a
  // DELIBERATE visible change, and so nobody reads a green suite as *"M2-7 is satisfied"*.
  const resolverCode = codeOnly(src('dreaming-resolver.js') ?? '')
  // ✅ CLOSED 2026-09-03. The divergence this register characterized is gone: the forms are retired and
  // the `dreaming:<form>` minting with them. ⭐ The DELIBERATE change has its own red-proof —
  // `dreaming-m2-7-check` — as Ote required, so the removal left an artifact behind to inspect rather
  // than being a deletion nobody can review.
  check('M2-7 · ⛔⛔ the five bespoke FORMS are GONE — a locked ruling retired them',
    !/export const FORMS\s*=/.test(proposalCode))
  // ⚠️ ASKED BEHAVIOURALLY, ⛔ NOT BY REGEX — and this is the FOURTH time today a text scan matched
  // something that merely LOOKED like its target. `/dreaming:/` catches the log namespace
  // `memory.dreaming:`, which is a perfectly legitimate logger prefix and not a slot address at all.
  // ⭐ So the question is put to the code: what address does it actually mint, and does validation
  // refuse the old one?
  const proposalMod = await tryImport('dreaming-proposal.js')
  const resolverMod = await tryImport('dreaming-resolver.js')
  const minted = resolverMod?.slotAddressFor?.({ entity: 'user', attribute: 'review-style' })
  check('M2-7 · ⛔⛔ the minted address is the claim\'s OWN — ⛔ no `dreaming:<form>` is invented',
    minted?.entity === 'user' && minted?.attribute === 'review-style', JSON.stringify(minted))
  check('M2-7 · ⛔⛔ …and a `dreaming:`-prefixed address is REFUSED, so the vocabulary cannot return',
    proposalMod?.validateClaim?.({
      entity: 'user', attribute: 'dreaming:recurrence', value: 'x', kind: 'habit',
      cites: [{ root: 'r1', span: 's' }],
    })?.ok === false)
  void resolverCode
  // ⛔ AND THE STORE MUST NEVER HAVE ACCEPTED ONE. Asserted against production, not just the source.
  const dreamingSlots = await one(
    `select count(*)::int as n from ${S}.txn_memories where attribute like 'dreaming:%'`)
  check('M2-7 · ⭐⭐ NOT ONE stored row carries a Dreaming-specific attribute',
    dreamingSlots?.n === 0, `${dreamingSlots?.n} row(s)`)

  // ══ M2-9 · THE WARRANT — AN EVIDENTIAL RECEIPT, ⛔ NEVER A TRUTH SCORE ════════════════════════
  // ✅✅ LOCKED IN FULL: a SEPARATE table keyed by `memory_id` · `value_at_warrant` so a stale or orphaned
  // warrant is DETECTABLE · `pass_id` retained · warrants ACCUMULATE (they are events, ⛔ not state) ·
  // selected / verified / discarded ALL recorded · ⛔ no bare count presented as strength or confidence ·
  // ⛔⛔ verification happens BEFORE the pipeline and is NEVER used by conflict resolution.
  const warrantTable = await hasTable('log_memory_warrants') || await hasTable('txn_memory_warrants')
  if (warrantTable) {
    check('M2-9 · ⭐⭐ a SEPARATE warrant table exists — ⛔ not a fifth shape in the untyped `evidence`', true)
    const t = (await hasTable('log_memory_warrants')) ? 'log_memory_warrants' : 'txn_memory_warrants'
    const c = await cols(t)
    for (const need of ['memory_id', 'value_at_warrant', 'pass_id', 'selected', 'verified', 'discarded']) {
      check(`M2-9 · ⭐ the warrant records \`${need}\``, c.includes(need), c.join(' '))
    }
    // ⛔ A TRUTH SCORE MUST BE UNREPRESENTABLE, not merely unused. The conflation vector is a NUMBER.
    const scoreCols = c.filter((x) => /confidence|score|strength|certainty|probability/i.test(x))
    check('M2-9 · ⛔⛔⛔ the warrant has NO confidence/score/strength column — it is an EVIDENTIAL receipt, '
      + 'and a truth score must be UNREPRESENTABLE rather than merely unused',
      scoreCols.length === 0, scoreCols.join(' ') || 'none')
  } else {
    spec.push('M2-9 · a warrant table keyed by memory_id — value_at_warrant, pass_id, '
      + 'selected/verified/discarded, and ⛔ NO confidence column')
    check('M2-9 · ⓘ NOT BUILT — no warrant table. Its shape red-proofs activate when one exists',
      warrantTable === false)
  }
  // ⛔⛔ AND THE HARDEST ONE: conflict resolution must never read a warrant. ⓘ Asserted against the memory
  // layer's own conflict stage, because that is where the conflation would actually happen.
  const conflictSrc = (() => {
    const u = new URL('../../Backend/app/components/', import.meta.url)
    for (const p of ['memory-conflict.js']) {
      if (existsSync(new URL(p, u))) return readFileSync(new URL(p, u), 'utf8')
    }
    return null
  })()
  check('M2-9 · ⓘ the conflict stage lives in @ote/memory, not app/components — scanned where it is',
    conflictSrc === null, 'external package — see the resolver assertion below')
  check('M2-9 · ⛔⛔ Dreaming\'s resolver never passes a warrant into the conflict stage',
    !/resolveConflict\([^)]*warrant/i.test(resolverCode))

  // ══ M2-8 · SPAN VERIFICATION — DISCARD, RECOUNT, AND ⛔ DREAMING CANNOT CLAIM `observed` ═══════
  // ✅ APPROVED AS DIRECTION: `{value, cites:[{root, span}]}` · verify every span against THAT root's
  // bucket · discard unverifiable roots · **RECOUNT** · require ≥2 VERIFIED independent roots.
  const verifyMod = await tryImport('dreaming-verify.js')
  if (typeof verifyMod?.verifyCitations === 'function') {
    check('M2-8 · ⭐⭐ a span-verification module exists', true)
    const buckets = [
      { root: 'r1', turns: [{ excerpt: 'she asked for the numbers first, every time' }] },
      { root: 'r2', turns: [{ excerpt: 'again with the numbers before the opinion' }] },
    ]
    const good = verifyMod.verifyCitations({
      cites: [{ root: 'r1', span: 'the numbers first' }, { root: 'r2', span: 'before the opinion' }], buckets,
    })
    check('M2-8 · ⭐ two verifiable spans in two roots ⇒ 2 verified roots', good?.verifiedRoots === 2,
      JSON.stringify(good))
    const bad = verifyMod.verifyCitations({
      cites: [{ root: 'r1', span: 'the numbers first' }, { root: 'r2', span: 'a sentence nobody said' }], buckets,
    })
    check('M2-8 · ⛔⛔ an UNVERIFIABLE span DISCARDS its root and the count is RE-TAKEN — ⛔ never the '
      + 'count the model proposed', bad?.verifiedRoots === 1 && bad?.discarded?.length === 1,
      JSON.stringify(bad))
    check('M2-8 · ⭐⭐⭐ …and below 2 VERIFIED roots the claim is REFUSED — recount, then the floor',
      bad?.ok === false, JSON.stringify(bad?.why ?? bad))
    // ⛔ A span that verifies against the WRONG root must not count — the check is per-root, not global.
    const crossed = verifyMod.verifyCitations({
      cites: [{ root: 'r1', span: 'before the opinion' }], buckets,
    })
    check('M2-8 · ⛔⛔ a span verified against the WRONG root does NOT count — verification is PER-ROOT',
      crossed?.verifiedRoots === 0, JSON.stringify(crossed))
  } else {
    spec.push('M2-8 · span verification — per-root, discard unverifiable, RECOUNT, then ≥2 verified roots')
    check('M2-8 · ⓘ NOT BUILT — no verification module. Its 4 red-proofs activate when one exists',
      verifyMod === null)
  }
  check('M2-8 · ⛔⛔ Dreaming may NEVER claim provenance `observed` — it did not observe, it inferred',
    !/provenance:\s*'observed'/.test(resolverCode) && !/provenance:\s*'observed'/.test(proposalCode))

  // ══ M2-10 + M2-11 · KIND IS THE QUESTION A SLOT ASKS · THE CHECK REGISTRY FAILS CLOSED ═════════
  // ✅✅ LOCKED: two layers — a SUBJECT-FREE question DEFINITION and a ROOM-SCOPED slot INSTANCE
  // referencing it · minting ≠ declaring · immutable · unknown ⇒ DEFER permanently · ⛔ no inference,
  // ⛔ no classifier, ⛔ no backfill.
  const qDef = await hasTable('mst_slot_questions') || await hasTable('mst_questions')
  const slotCols = await cols('mst_slots')
  if (qDef) {
    check('M2-10 · ⭐⭐ a subject-free QUESTION DEFINITION table exists, separate from the slot instance', true)
    check('M2-10 · ⭐ the slot instance REFERENCES it — ⛔ it does not carry the kind itself',
      slotCols.some((c) => /question/i.test(c)), slotCols.join(' '))
  } else {
    spec.push('M2-10 · a subject-free question DEFINITION + a room-scoped slot INSTANCE referencing it')
    check('M2-10 · ⓘ NOT BUILT — no question-definition table, and mst_slots references none',
      !slotCols.some((c) => /question/i.test(c)), `mst_slots: ${slotCols.join(' ') || 'absent'}`)
  }

  const registry = await tryImport('memory-question-checks.js')
  if (typeof registry?.resolveCheck === 'function') {
    check('M2-11 · ⭐⭐ the declared-check REGISTRY exists', true)
    // ⛔⛔ HARDENING ① — THE REGISTRY MUST NOT EXPOSE PROTOTYPE PROPERTIES. `toString` and `constructor`
    // are on every plain object; a registry keyed by a plain object would resolve them as real checks.
    for (const proto of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      check(`M2-11 · ⛔⛔ \`${proto}\` does NOT resolve as a registered check — no prototype exposure`,
        registry.resolveCheck(proto) == null)
    }
    // ⛔ HARDENING ② — DEFINITIONS VALIDATED AT DECLARATION TIME.
    check('M2-11 · ⭐ a definition naming an UNREGISTERED check is refused AT DECLARATION',
      typeof registry?.validateDefinition === 'function'
      && registry.validateDefinition({ checks: ['zz_not_a_real_check'] })?.ok === false)
    check('M2-11 · ⛔ a definition whose checks are not an array of strings is refused',
      typeof registry?.validateDefinition === 'function'
      && registry.validateDefinition({ checks: 'not-an-array' })?.ok === false)
    // ⛔⛔ FAIL CLOSED — an unknown identifier is DEFER, ⛔ never silently skipped.
    check('M2-11 · ⛔⛔⛔ an UNKNOWN check identifier ⇒ DEFER — ⛔ never skipped, never ALLOW',
      typeof registry?.evaluate === 'function'
      && registry.evaluate({ checks: ['zz_unknown'], value: 'x' })?.outcome === 'DEFER')
    // ⭐ REFUSE beats DEFER — keep the actual finding rather than discarding it as unknown.
    check('M2-11 · ⭐⭐ a REAL violation beats an unrelated unknown — REFUSE wins over DEFER',
      typeof registry?.evaluate === 'function'
      && registry.evaluate({ checks: ['zz_unknown', 'nonempty'], value: '' })?.outcome === 'REFUSE')
    // ⛔ HARDENING ③ — `ran` is independent of the violation result.
    const ranClean = registry.evaluate?.({ checks: ['nonempty'], value: 'ok' })
    const ranDirty = registry.evaluate?.({ checks: ['nonempty'], value: '' })
    check('M2-11 · ⭐⭐ `ran` is INDEPENDENT of the violation result — a check that ran and passed and a '
      + 'check that ran and failed are both `ran`',
      ranClean?.ran === true && ranDirty?.ran === true,
      `clean.ran=${ranClean?.ran} dirty.ran=${ranDirty?.ran}`)
  } else {
    spec.push('M2-11 · a check registry — no prototype exposure · validated at declaration · unknown ⇒ DEFER '
      + '· REFUSE beats DEFER · `ran` independent of the violation')
    check('M2-11 · ⓘ NOT BUILT — no check registry. Its 8 red-proofs activate when one exists',
      registry === null)
  }
  // ⛔ NO CLASSIFIER, ANYWHERE. Ote: *"Do not add heuristics/classifiers to make them pass."*
  const anyDreaming = ['dreaming-proposal.js', 'dreaming-resolver.js', 'dreaming-candidate-host.js']
    .map((f) => codeOnly(src(f) ?? '')).join('\n')
  for (const f of ['classify', 'heuristic', 'inferKind', 'guessKind']) {
    check(`M2-10 · ⛔⛔ no kind inference: \`${f}\` is absent from the Dreaming path`,
      !anyDreaming.includes(f))
  }

  // ══ M2-12 · COEXISTENCE — ⛔ EVIDENCE FOR A RULING OTE HAS NOT MADE, ⛔ NOT A PASS/FAIL ════════
  // ⚠️ These assertions describe the SYSTEM AS IT IS, so the ruling can be made against measurement.
  // ⛔ None of them asserts that M2 may or may not run: that decision is his.
  const recallCode = codeOnly(src('memory-store-sequelize-host.js') ?? '')
  const visible = recallCode.slice(recallCode.indexOf('const visibleWhere'), recallCode.indexOf('const inScope'))
  check('M2-12 · ⭐ the recall scope predicate was located — ⛔ else the next findings are vacuous',
    visible.length > 100, `${visible.length} chars`)
  check('M2-12 · ⚠️⚠️ recall has NO AUTHOR FILTER ⇒ a Dreaming commitment in a live room is reachable '
    + 'on EVERY ordinary turn', !/author/.test(visible), 'no `author` term in visibleWhere')
  check('M2-12 · ⭐⭐⭐ but recall DOES filter on `persona` ⇒ a distinct persona is a STRUCTURAL isolation '
    + 'lever, not a policy promise', /persona:\s*P/.test(visible))
  check('M2-12 · ⭐ …and on room-or-persona_global reachability',
    /user_id:\s*U/.test(visible) && /persona_global/.test(visible))
  const p1 = await one(`select count(*)::int as n from ${S}.log_conversation_revisits
     where tool_generation=2 and dispatch_generation=2 and trigger_source='cron' and outcome='completed'`)
  check('M2-12 · ⓘ P1\'s live window, for the record at ruling time', Number.isInteger(p1?.n),
    `${p1?.n} Gen-2 reflections`)
  const dreamAuthored = await one(
    `select count(*)::int as n from ${S}.txn_memories where provenance = 'synthesized' and author = 'persona'`)
  check('M2-12 · ⓘ how much synthesized persona-authored material already exists', Number.isInteger(dreamAuthored?.n),
    `${dreamAuthored?.n} row(s) — the population a Dreaming commitment would join`)
  // ══ ⭐ THE SPECIFICATION, PRINTED ══════════════════════════════════════════════════════════════
  // ⛔ Not assertions — the list of what M2 must still build for the red-proofs above to activate.
  if (spec.length) {
    console.log(`\n  ⏸ M2 IS NOT BUILT — ${spec.length} locked item(s) with no implementation:`)
    for (const line of spec) console.log(`     · ${line}`)
    console.log('\n  ⛔ M2 live execution against the natural corpus is NOT authorised — M2-12 is unruled.\n')
  }
} catch (e) {
  check('the check ran to completion', false, e?.stack ?? String(e))
} finally {
  await pg.end()
  done()
}
