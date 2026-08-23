// L4 WORKING MEMORY IS FROZEN — and this check exists so a NEW caller cannot appear silently.
//
//   node checks/l4-frozen-check.mjs
//
// ⭐⭐ THE MEASUREMENT THAT FROZE IT: `txn_conversations.working_memory` is NULL on **every** conversation.
// The feature is on by default, its rule is in the prompt every turn (*"It is shown back to you each turn"*),
// and the `update_working_memory` tool is offered — and she has never used it.
//
// ⭐⭐⭐ AND THE REASON OUTRANKS THE COUNT: L4 asks **her** to maintain her own working set, which is the exact
// pattern the Memory Cognition arc dismantled. 0-for-N is the measurement of that.
//
// ⛔ Ote: *"Freeze L4. Do not wire C2 into it… Record it as legacy/deprecated candidate, not yet removed. If
// the dependency audit confirms it is genuinely unused, then I want a later cleanup step to remove it rather
// than leaving two concepts called Working Memory around indefinitely."*
//
// ⇒ SO THIS CHECK PINS THE DEPENDENCY SET. ⛔ It does not assert the feature is broken and does not turn it
// off. It asserts that the audit's conclusion — *nothing outside the old prompt path depends on it* — is
// still true, so the eventual cleanup stays a small, safe change instead of an archaeology project.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { readFileSync, readdirSync } from 'node:fs'

const { check, done } = makeChecker('l4-frozen')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db)
const seq = db.txn_memories.sequelize
const { schema: S } = db.txn_memories.getTableName()
const Q = (sql) => seq.query(sql, { type: seq.QueryTypes.SELECT })

// ── ⭐ 1 · THE MEASUREMENT, RE-TAKEN EVERY RUN ─────────────────────────────────────────────────────
// ⚠️ Deliberately NOT asserted as "must be zero". If she ever starts using it, that is a FINDING and the
// deprecation must be reconsidered — not a test failure to suppress. ⇒ reported, and only the direction that
// would invalidate the freeze is flagged.
const [u] = await Q(`SELECT count(*)::int total, count(working_memory)::int used FROM "${S}".txn_conversations`)
ok(true, `1 · ⓘ conversations with a non-null working_memory: ${u.used} of ${u.total}`,
  u.used === 0 ? 'never used — the freeze stands' : '⚠ SHE IS USING IT — revisit the deprecation before any cleanup')

// ── ⛔⛔ 2 · THE DEPENDENCY SET HAS NOT GROWN ──────────────────────────────────────────────────────
// ⭐ The audit found exactly one reader (the prompt path) and two writers (the tool's host service, and the
// cron decay that nulls idle rows). A third reader appearing is the thing that would make cleanup expensive.
const APP = '../../Backend/app'
const files = []
const walk = (dir) => {
  for (const e of readdirSync(new URL(`${dir}/`, import.meta.url), { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}/${e.name}`)
    else if (e.name.endsWith('.js')) files.push(`${dir}/${e.name}`)
  }
}
walk(APP)

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
// ⛔ CODE ONLY. Several files legitimately DISCUSS L4 in comments — including the freeze notice itself — and
// a scan that punished a file for documenting the deprecation would be backwards.
// ⚠️ NARROWED, and my first version was wrong in an instructive way: it matched `WorkingMemory` broadly and
// therefore flagged **the cognitive hold's own module** (`createWorkingMemory`) as a new L4 dependency. ⛔ A
// name-shaped scan cannot tell two same-named concepts apart — which is the whole reason the new one was
// named `cognitiveHold` in the route. ⇒ match L4's ACTUAL identifiers, never the shared word.
const L4_IDENTIFIERS = /working_memory|normalizeWorkingMemory|renderWorkingMemory|decayWorkingMemory|initWorkingMemory|WORKING_MEMORY_RULE|workingMemoryEnabled|workingMemoryBlock|'workingMemory'/
const touching = files.filter((f) => L4_IDENTIFIERS.test(strip(readFileSync(new URL(f, import.meta.url), 'utf8'))))

const EXPECTED = [
  `${APP}/components/context-composer.js`,     // the rule text
  `${APP}/components/runtime.js`,              // hostProvides declaration
  `${APP}/components/working-memory-host.js`,  // the feature itself
  `${APP}/plugins/cron.js`,                    // decayWorkingMemory — nulls idle rows
  `${APP}/routes/v1/chat-site.route.js`,       // the prompt path (the ONLY reader)
  `${APP}/settings/index.js`,                  // the setting
].sort()
const found = [...touching].sort()
const surprises = found.filter((f) => !EXPECTED.includes(f))
ok(surprises.length === 0,
  '2 · ⛔⛔ no NEW file references L4 — the dependency set is unchanged since the audit',
  surprises.length ? `NEW: ${surprises.join(', ')}` : `${found.length} known sites`)
const gone = EXPECTED.filter((f) => !found.includes(f))
ok(true, '2 · ⓘ audit sites that no longer reference it (cleanup progress)', gone.join(', ') || 'none yet')

// ── ⛔ 3 · C2 IS NOT WIRED INTO IT, AND THE TWO CONCEPTS DO NOT TOUCH ─────────────────────────────
const wmHost = strip(readFileSync(new URL(`${APP}/components/working-memory-host.js`, import.meta.url), 'utf8'))
ok(!/cognitiveHold|createWorkingMemory|memory-working-memory|memory-cognition/.test(wmHost),
  '3 · ⛔⛔ L4 knows nothing about the cognitive hold — Ote: "do not wire C2 into it"')
const hold = strip(readFileSync(new URL(`${APP}/components/memory-working-memory.js`, import.meta.url), 'utf8'))
ok(!/working_memory|renderWorkingMemory|normalizeWorkingMemory|txn_conversations/.test(hold),
  '3 · ⛔ …and the cognitive hold knows nothing about L4 — neither may inherit the other\'s semantics')

// ── ⭐ 4 · THE FREEZE IS WRITTEN WHERE SOMEBODY WOULD LOOK ────────────────────────────────────────
// ⚠️ Comments, deliberately: a deprecation nobody can see is a deprecation that gets extended by the next
// person to open the file.
const raw = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
ok(/FROZEN 2026-08-23 · DEPRECATION CANDIDATE/.test(raw(`${APP}/components/working-memory-host.js`)),
  '4 · ⭐ the feature file says it is frozen, at the top')
ok(/FROZEN \/ DEPRECATION CANDIDATE/.test(raw(`${APP}/settings/index.js`)),
  '4 · ⭐ …and so does the setting a reader would flip')
ok(/FROZEN \/ DEPRECATION CANDIDATE/.test(raw(`${APP}/components/context-composer.js`)),
  '4 · ⭐ …and the rule that reaches her every turn')
ok(/l4-frozen-check/.test(raw(`${APP}/components/working-memory-host.js`)),
  '4 · …and it points at this check, so the audit and its guard are findable from each other')

// ── ⚠️ 5 · THE CONFOUND, RECORDED RATHER THAN FIXED ──────────────────────────────────────────────
// ⛔ NOT flipped. "Freeze" means stop changing it, not turn it off, and turning it off is a behaviour change
// that is Ote's to make. ⚠️ But it must be RECORDED, because it is a live confound for anything measuring the
// cognition/working-set behaviour: two different things called Working Memory reach her every turn, and only
// one of them ever holds anything.
const enabled = config?.memory?.workingMemoryEnabled !== false
ok(true, `5 · ⚠️ L4 is currently ${enabled ? 'ENABLED (default)' : 'disabled'} — a recorded CONFOUND for A/C2 measurement`,
  enabled ? 'her prompt carries the L4 rule AND the cognition block every turn' : 'off, so no confound')

await seq.close().catch(() => {})
done()
