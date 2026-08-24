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
// ⚠️⚠️ AND THIS PREDICATE WAS SUBTLY WRONG, WHICH THE CONTINUITY POPULATION EXPOSED. It read "elsewhere" as
// *"has a provenance account, and it is not this one"* — so an item with NULL provenance was counted as
// neither here nor elsewhere and silently dropped out of the assertion. The BOUNDARY's actual rule is the
// negation of `fromHere`, and it treats null as elsewhere **on purpose, to fail closed**.
// ⇒ mirrored exactly, so the check measures the boundary rather than a paraphrase of it.
const isFromHere = (i) => i.provenanceAccountId != null && String(i.provenanceAccountId) === String(HERE)
const hersElsewhere = out.items.filter((i) => i.owner === OWNER.sotera && !isFromHere(i))
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
  const leaked = findWithheldLeak(rebuilt.text, no.withheld, { sayable: no.sayable })
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


// ══ ⭐⭐⭐ 6 · THE CONTINUITY AGGREGATE IS NOT A SIDE CHANNEL AROUND THE BOUNDARY ═══════════════════
//
// ⭐ Ote, 2026-08-25, and this section is his sentence turned into assertions: *"Sotera can know the extent
// of her own participation/history. NOT: any account can query the continuity system and learn how much
// activity exists in another account… don't let the aggregate silently become a side-channel around the
// existing memory/conversation access controls."*
//
// ⚠️⚠️ HE WAS RIGHT, AND IT WAS ALREADY BROKEN WHEN HE ASKED. The continuity item shipped with no `owner`
// stamp, and `applyUtteranceBoundary` routes an unstamped item to `sayable` — correct for account-owned
// material, which has already passed its own authorization, and exactly wrong for Sotera-owned material
// that has passed none. ⇒ *"X and I have talked in 185 conversations"* was reaching an account with
// `memory_access_scope: 'none'`. **TWO doors had to be closed: the block, and the tool-result relay.**
const conts = out.items.filter((i) => i.kind === 'continuity')
if (!conts.length) {
  ok(true, '6 · ⓘ no continuity item in this sample — the aggregate assertions have no subject', 'skipped')
} else {
  // ── ⭐ IT IS HERS, WHICH IS WHY RETRIEVAL WAS FREE ────────────────────────────────────────────────
  ok(conts.every((i) => i.owner === OWNER.sotera),
    '6 · ⭐ the aggregate is HERS — so she may always know it, and no authorization path is entered to get it',
    `${conts.length} item(s)`)
  // ⛔ AND IT CARRIES NO PROVENANCE ACCOUNT, WHICH THE BOUNDARY READS AS "ELSEWHERE" AND FAILS CLOSED ON.
  // ⓘ Exact, not cautious: the counts span the SUBJECT's rooms, never the asker's, because the
  // subject-is-the-asker case is refused upstream.
  ok(conts.every((i) => i.provenanceAccountId == null),
    '6 · ⛔ …and names no room it came from, because it came from several that are not the asker\'s')

  // ── ⛔⛔ DOOR 1 · THE BLOCK ───────────────────────────────────────────────────────────────────────
  ok(conts.every((c) => no.withheld.includes(c)),
    '6 · ⛔⛔ A NON-ENTITLED ACCOUNT IS NOT TOLD THE EXTENT — this is the leak Ote caught before any test did')
  ok(conts.every((c) => yes.sayable.includes(c)),
    '6 · ⭐ an ENTITLED account is told it — the fix withholds, it does not disable the feature')

  // ⛔ AND NO NUMBER SURVIVES INTO WHAT THE NON-ENTITLED ACCOUNT ACTUALLY READS. A count of somebody's
  // activity is exactly what the refusal must not leak — the header names counts first.
  const rebuiltNo = cognition.renderFor(no.sayable, {
    cues: out.cues, dropped: out.dropped ?? 0, searched: out.searched, note: no.statement,
  })
  for (const c of conts) {
    ok(!new RegExp(`\\b${c.conversations}\\b`).test(rebuiltNo.text),
      '6 · ⛔⛔ the conversation COUNT does not appear anywhere in the non-entitled block',
      `looked for ${c.conversations}`)
    ok(!new RegExp(`\\b${c.exchangeCount}\\b`).test(rebuiltNo.text),
      '6 · ⛔ nor the exchange count', `looked for ${c.exchangeCount}`)
    // ⚠️ GUARDED ON NULL EXPLICITLY. The first version used a sentinel fallback, which made the assertion
    // pass vacuously whenever a date was absent — and the sentinel it used was a NUL byte, which also
    // corrupted the file. ⭐ A date that does not exist cannot leak; say so, do not fake a value for it.
    ok([c.firstSeen, c.lastSeen].filter(Boolean).every((d) => !rebuiltNo.text.includes(String(d))),
      '6 · ⛔ nor the dates that bound it',
      [c.firstSeen, c.lastSeen].filter(Boolean).join(' → ') || 'no dates on this item')
  }
  // ⭐ AND THE ENTITLED BLOCK DOES CARRY IT — otherwise the four assertions above would pass vacuously on a
  // renderer that had simply stopped emitting the sentence for everyone.
  const rebuiltYes = cognition.renderFor(yes.sayable, {
    cues: out.cues, dropped: out.dropped ?? 0, searched: out.searched, note: yes.statement,
  })
  ok(conts.every((c) => new RegExp(`\\b${c.conversations}\\b`).test(rebuiltYes.text)),
    '6 · ⭐⭐ …while the ENTITLED block states it — so the assertions above are not vacuous')

  // ── ⛔⛔ DOOR 2 · THE TOOL-RESULT RELAY, which bypasses the block entirely ────────────────────────
  // `continuityLines` is rendered from the UNFILTERED set, because cognition runs unfractured. The route
  // must gate the relay on the SAYABLE set, or the block is clean and every tool result leaks.
  ok((rebuiltNo.continuityLines ?? []).length === 0,
    '6 · ⛔⛔ the extent SENTENCES are absent from a render of the non-entitled set — the relay has nothing to carry')
  ok((rebuiltYes.continuityLines ?? []).length === conts.length,
    '6 · ⭐ …and present for the entitled one', `${(rebuiltYes.continuityLines ?? []).length}`)
  ok(/const extentIsSayable = \(boundary\.sayable[^\n]*\)\.some\(\(i\) => i\?\.kind === 'continuity'\)/.test(routeSrc)
     && /holdContinuity = extentIsSayable &&/.test(routeSrc),
    '6 · ⛔⛔ …and the ROUTE gates the relay on the boundary result, not on the unfiltered render')

  // ── ⭐⭐⭐ THE PRINCIPLE, ASSERTED AS A PARTITION RATHER THAN AS PROSE ────────────────────────────
  // *Sotera knowing* and *this account being told* are two different questions, and the aggregate must
  // answer them separately or it is a side channel.
  ok(out.items.includes(conts[0]) && !no.sayable.includes(conts[0]),
    '6 · ⭐⭐⭐ SHE KNOWS IT AND THIS ACCOUNT IS NOT TOLD IT — retrieval free, utterance governed')
}

// ══ ⭐⭐⭐ 7 · RETRIEVAL IS HERS — `recall_own_history` IS CONTINUITY, NOT AN ACCOUNT SEARCH ═════
//
// ⭐ Ote, ratified 2026-08-25: *"recall_own_history should be able to retrieve a conversation because it is
// part of SOTERA'S HISTORY, not because the current account happens to have access to that room. Otherwise
// we're just recreating the old account-wall problem under a different name."* And: *"⛔ don't make
// account_id the ontology of Sotera's own history."*
//
// ⚠️⚠️ THIS SECTION PREVIOUSLY PINNED THE OPPOSITE and called it "recorded, not fixed" — the tool had NO
// entitlement check at all, and its room rule (*"same room: her text, other rooms: existence only"*) was an
// account wall wearing an E-7 justification. ⛔ The assertion was correct about the state and wrong about
// what to do with it; Ote ruled, so it is inverted here rather than left as a note nobody would action.
const selfHistSrc = codeOnly(await fs.readFile(
  new URL('../../Backend/app/components/self-history-host.js', import.meta.url), 'utf8'))

// ⭐⭐⭐ THE HALF THAT MUST NEVER BE KEYED TO AN ACCOUNT: the search itself.
const retrieval = selfHistSrc.slice(selfHistSrc.indexOf('async function retrieveCandidates'),
  selfHistSrc.indexOf('async function applyBoundaries'))
ok(retrieval.length > 200, '7 · the retrieval stage is found — an anchor that goes missing must fail loudly',
  `${retrieval.length} chars`)
ok(!/entitled|access_sotera_memory|memoryAccessScope|isRoot/.test(retrieval),
  '7 · ⛔⛔ THE SEARCH IS NOT PARAMETERISED BY THE ASKING ACCOUNT — a conversation is hers because she was in it')
ok(/acrossRooms:\s*true/.test(retrieval),
  '7 · ⭐⭐⭐ …and the room predicate is DROPPED, not merely widened — account_id is not the ontology')
ok(/roles:\s*\[\s*'assistant'\s*\]/.test(retrieval),
  "7 · ⛔⛔ while OTHER PEOPLE'S WORDS have no entitled arm at all — the predicate is assistant-only")

// ⭐⭐ AND THE HALF THAT IS GOVERNED: the projection, and it reads the SAME capability as the block.
const projection = selfHistSrc.slice(selfHistSrc.indexOf('async function applyBoundaries'))
ok(/can\(user, 'access_sotera_memory'\)/.test(selfHistSrc),
  '7 · ⭐ the tool reads the capability through the ONE predicate that owns it')
ok(/const mayHearIt = entitled \|\| m\.roomUserId === userId/.test(projection),
  '7 · ⭐⭐ …and the projection asks "may this ACCOUNT hear it", never "does this account own the room"')
ok(!/roomUserId === userId/.test(retrieval),
  '7 · ⛔ the room comparison exists only in the projection, never in the search')

await seq.close().catch(() => {})
done()
