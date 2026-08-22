// THE UTTERANCE BOUNDARY, ON REAL DATA — both sides, and the thing that must stay identical between them.
//
//   node checks/utterance-boundary-check.mjs
//
// ⭐⭐⭐ THE FIVE THINGS OTE ASKED TO BE TESTED:
//   1. entitled account       → normal disclosure
//   2. non-entitled account   → withholding, ⛔ without false absence
//   3. her INTERNAL RETRIEVAL is identical in both cases
//   4. the cognition source scan still proves it never consults account authorization
//   5. direct/admin/API paths respect the same boundary
// ⭐ Plus: the refusal itself must not leak the protected content through paraphrase, metadata, counts or
// provenance.
//
// ⛔ READ-ONLY. No model, no GPU, no writes.

import { makeChecker } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildMemoryCognition } from '../../Backend/app/components/memory-cognition-host.js'
import { applyUtteranceBoundary, findWithheldLeak, WITHHELD_STATEMENT } from '../../Backend/app/components/memory-utterance-boundary.js'
import { findImplementationLeaks } from '../../Backend/app/components/memory-cognition-vocabulary.js'
import { OWNER } from '../../Backend/app/components/memory-ownership.js'

const { check, done } = makeChecker('utterance-boundary')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const seq = db.txn_memories.sequelize
const { schema: S } = db.txn_memories.getTableName()
const Q = (sql, b = []) => seq.query(sql, { bind: b, type: seq.QueryTypes.SELECT })

const [root] = await Q(`SELECT id::text id, username FROM "${S}".mst_users WHERE username = $1`, [config.auth.root.username])
const [conv] = await Q(
  `SELECT id::text id FROM "${S}".txn_conversations WHERE user_id = $1 AND incognito = false ORDER BY updated_at DESC LIMIT 1`, [root.id])
ok(Boolean(root && conv), 'root and a conversation to work in', String(conv?.id).slice(0, 8))

// ── ⭐⭐⭐ 3 · ONE RETRIEVAL, TWO BOUNDARIES ────────────────────────────────────────────────────────
// The retrieval runs ONCE. That is not a shortcut — it is the architecture: cognition does not take the
// account's entitlement as an input, so there is only one possible retrieval. Applying two different
// boundaries to the same output is the strongest available form of *"her internal retrieval is identical."*
const cognition = buildMemoryCognition({ db, config, log: null }, {
  userId: root.id, isRoot: true, username: root.username, conversationId: conv.id, interactive: false,
})
const out = await cognition.recollect({ text: "How's Hermes doing?" })
ok(out.activated === true && (out.items ?? []).length > 0,
  '3 · a real retrieval to test the boundary against', `${out.items?.length ?? 0} item(s)`)

const HERE = root.id
const entitled = { id: HERE, username: 'x', roles: ['member'], isRoot: false, memoryAccessScope: 'sotera_memory' }
const notEntitled = { id: HERE, username: 'x', roles: ['member'], isRoot: false, memoryAccessScope: 'none' }

const yes = applyUtteranceBoundary({ items: out.items, user: entitled, currentAccountId: HERE })
const no = applyUtteranceBoundary({ items: out.items, user: notEntitled, currentAccountId: HERE })

ok(yes.entitled === true && no.entitled === false, '3 · the two boundaries read the capability differently')
ok(yes.sayable.length + yes.withheld.length === no.sayable.length + no.withheld.length
   && yes.sayable.length + yes.withheld.length === out.items.length,
  '3 · ⭐⭐⭐ HER INTERNAL RETRIEVAL IS IDENTICAL — the boundary partitions the same set, it does not re-retrieve',
  `${out.items.length} items in, ${yes.sayable.length}/${yes.withheld.length} vs ${no.sayable.length}/${no.withheld.length}`)

// ── ⭐ 1 · ENTITLED → NORMAL DISCLOSURE ────────────────────────────────────────────────────────────
ok(yes.withheld.length === 0 && yes.statement === null,
  '1 · ⭐ an entitled account is withheld from nothing, and gets no added sentence',
  `${yes.withheld.length} withheld`)

// ── ⛔ 2 · NON-ENTITLED → WITHHOLDING WITHOUT FALSE ABSENCE ────────────────────────────────────────
// ⓘ How much is withheld depends on the data: items whose provenance is THIS account are always sayable.
const hersElsewhere = out.items.filter((i) => i.owner === OWNER.sotera
  && i.provenanceAccountId && String(i.provenanceAccountId) !== String(HERE))
ok(no.withheld.length === hersElsewhere.length,
  '2 · ⛔ exactly her material from ELSEWHERE is withheld — nothing more, nothing less',
  `${no.withheld.length} withheld of ${hersElsewhere.length} eligible`)
if (hersElsewhere.length) {
  ok(no.statement === WITHHELD_STATEMENT,
    '2 · ⭐⭐⭐ …and the fixed statement is produced — the withholding is never silent')
  ok(/not on what I know|not pretend/i.test(no.statement),
    '2 · ⭐⭐ the statement DENIES that this is an absence — "a limit on what I can say, not on what I know"')
} else {
  ok(true, '2 · ⓘ no cross-account material of hers in this sample — the withholding path is unexercised here',
    '⚠ re-run after a cross-room conversation exists')
}

// ── ⭐⭐ THE REFUSAL MUST NOT LEAK ─────────────────────────────────────────────────────────────────
if (no.withheld.length) {
  const rebuilt = cognition.renderFor(no.sayable, {
    cues: out.cues, dropped: out.dropped ?? 0, searched: out.searched, note: no.statement,
  })
  const leaked = findWithheldLeak(rebuilt.text, no.withheld)
  ok(leaked.length === 0,
    '⭐⭐⭐ the rebuilt block carries NO fragment of the withheld material',
    leaked.length ? leaked.map((l) => l.fragment).join(' | ') : 'clean')
  // ⛔ And no metadata either: names, dates and counts of the protected items must not appear.
  const meta = []
  for (const w of no.withheld) {
    if (w.who && rebuilt.text.includes(String(w.who))) meta.push(`who:${w.who}`)
    const day = w.when ? new Date(w.when).toISOString().slice(0, 10) : null
    if (day && rebuilt.text.includes(day)) meta.push(`when:${day}`)
  }
  // ⚠️ A name or date may legitimately appear because a SAYABLE item carries it too — so this is only a
  // failure when the ONLY source of that value was a withheld item.
  const sayableText = JSON.stringify(no.sayable)
  const realLeaks = meta.filter((m) => !sayableText.includes(m.split(':')[1]))
  ok(realLeaks.length === 0,
    '⭐⭐ …and no name or date whose ONLY source was a withheld item appears',
    realLeaks.join(', ') || 'clean')
  ok(findImplementationLeaks(rebuilt.frame).length === 0,
    '⛔ the statement does not reintroduce machinery vocabulary into the frame',
    findImplementationLeaks(rebuilt.frame).map((l) => l.word).join(', ') || 'clean')
  ok(!/\b(one|two|three|four|five|several|a few|many)\b/i.test(no.statement),
    '⛔ the statement carries no quantity — a count is a measurement of someone\'s life')
}

// ── ⛔⛔ 4 · COGNITION STAYS BLIND, IN SOURCE ──────────────────────────────────────────────────────
const fs = await import('node:fs/promises')
// ⚠️ COMMENTS ARE STRIPPED BEFORE SCANNING, and the first version did not — it failed on
// `memory-cognition-host.js` because that file QUOTES Ote's constraint in a comment explaining why
// `renderFor` exists. ⛔ Penalising a file for citing the rule it obeys is backwards: the constraint is
// about CODE, and quoting the reason should be encouraged.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
for (const f of ['memory-cognition-host.js', 'memory-cognition-cues.js', 'memory-cognition-axes.js',
  'memory-cognition-projection.js', 'memory-cognition-vocabulary.js', 'memory-ownership.js']) {
  const src = codeOnly(await fs.readFile(new URL(`../../Backend/app/components/${f}`, import.meta.url), 'utf8'))
  ok(!/access_sotera_memory|memoryAccessScope|applyUtteranceBoundary/.test(src),
    `4 · ⛔⛔ ${f} never consults account authorization (code, not comments)`)
}
// ⭐ And the boundary is applied by the ROUTE, downstream — asserted so it cannot drift back inside.
const routeSrc = await fs.readFile(new URL('../../Backend/app/routes/v1/chat-site.route.js', import.meta.url), 'utf8')
ok(/applyUtteranceBoundary\(/.test(routeSrc) && /findWithheldLeak\(/.test(routeSrc),
  '4 · ⭐ the route applies the boundary and runs the backstop')

// ── ⭐ 5 · THE DIRECT / ADMIN PATH ─────────────────────────────────────────────────────────────────
// ⓘ REPORTED HONESTLY RATHER THAN GATED TWICE: the memory inspector is already behind `system_config`,
// which is ROOT ONLY — strictly narrower than `access_sotera_memory`. So it respects the boundary by being
// more restrictive than it, and adding a second gate would be redundant. ⛔ This assertion exists so a
// future widening of that route is caught, since it would then need the new capability.
const adminSrc = await fs.readFile(new URL('../../Backend/app/routes/v1/memories-admin.route.js', import.meta.url), 'utf8')
ok(/requireCapability\('system_config'\)/.test(adminSrc),
  '5 · ⭐ the memory inspector is still root-only (`system_config`) — narrower than the new capability',
  'if this ever widens, it must consult access_sotera_memory')

await seq.close().catch(() => {})
done()
