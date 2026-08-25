// ⭐⭐⭐ THE PRECONDITION FOR ANY COGNITION MEASUREMENT — "no prior run's text is in the corpus".
//
//   node pipeline/corpus-precondition.mjs "a phrase from the task" ["another phrase" …]
//   node pipeline/corpus-precondition.mjs --room agent_dev "phrase"     (narrow to one room)
//   node pipeline/corpus-precondition.mjs --json                         (machine-readable, still exits)
//
// ⛔ EXITS NON-ZERO when a phrase is found in a conversation that is not declared. That is the whole
// point: Ote asked for this to FAIL, not to warn, because a warning in a scrollback is a warning nobody
// read.
//
// ── ⚠️⚠️ WHY PHRASE AND NOT CONVERSATION ID ────────────────────────────────────────────────────────
// Measured three times now, most recently 2026-08-26. A broken guard told her *"only a root session can
// authorize reading another room"*; she concluded *"The boundary is real, not procedural."* The guard was
// fixed and proven — and in a **brand-new conversation** she said it again, with ZERO tool calls that
// turn, because she RETRIEVED the earlier conversation's text.
//
// ⭐⭐⭐ **"FRESH CONVERSATION" ≠ "FRESH EVIDENCE CORPUS".** A new conversation id isolates nothing, and
// ⛔ neither does a new room — `retrieve_conversations` searches every room she has ever been in. So the
// question this asks is not *"did I reuse a conversation?"* (a caller always knows that) but *"can the
// thing I am about to measure already be READ somewhere?"* — which only the text can answer.
//
// ── ⛔ WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────────
// ⛔ NOT a cleanup, and it deletes nothing. Removal is `corpus-cleanup.mjs`, it is for HARNESS artefacts
// only, and it demands two independent witnesses before touching a row — a gate that has already
// refused a real conversation and was right to. When contamination lives in a REAL conversation the
// answer is to declare it and say so in the finding, ⛔ never to curate her life so a number comes out.
//
// ⛔ NOT a statement about her memory. The distinction Ote drew and it is worth keeping sharp: this is
// EXPERIMENTAL contamination, not a memory-integrity problem. In the measured case no memory held the
// phrase at all — she was reading a true record of a false thing the system told her.

import { readFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const roomIdx = argv.indexOf('--room')
const ROOM = roomIdx >= 0 ? argv[roomIdx + 1] : null
// ⛔ `roomIdx + 1` is 0 when `--room` is ABSENT (indexOf returns -1), which silently ate the FIRST
// phrase and turned a real check into a usage message. Guard the sentinel, never arithmetic on it.
const PHRASES = argv.filter((a, i) => !a.startsWith('--') && !(roomIdx >= 0 && i === roomIdx + 1))

if (!PHRASES.length) {
  console.error('usage: node pipeline/corpus-precondition.mjs [--room <username>] [--json] "phrase" ["phrase" …]')
  process.exit(2)
}

const DECL = JSON.parse(readFileSync(new URL('../fixtures/declared-contamination.json', import.meta.url), 'utf8'))
const declaredById = new Map((DECL.declared ?? []).map((d) => [d.conversationId, d]))

const pg = devPg(); await pg.connect()
const S = devSchema()

const findings = []
for (const phrase of PHRASES) {
  // ⛔ ILIKE with the phrase as a PARAMETER, never interpolated — a phrase is arbitrary text from a task
  // prompt and will contain quotes, percent signs and underscores. `%` and `_` are still LIKE wildcards
  // inside a parameter, so a phrase containing them matches more broadly than intended; that errs toward
  // reporting contamination, which is the safe direction for a precondition.
  const { rows } = await pg.query(
    `select m.conversation_id::text cid, c.title, u.username room, m.role,
            count(*) over (partition by m.conversation_id)::int in_convo,
            (e.message_id is not null) embedded
       from ${S}.txn_messages m
       join ${S}.txn_conversations c on c.id = m.conversation_id
       left join ${S}.mst_users u on u.id = c.user_id
       left join ${S}.txn_message_embeddings e on e.message_id = m.id
      where m.content ilike $1 ${ROOM ? 'and u.username = $2' : ''}`,
    ROOM ? [`%${phrase}%`, ROOM] : [`%${phrase}%`],
  )
  const byConvo = new Map()
  for (const r of rows) {
    const cur = byConvo.get(r.cid) ?? { ...r, msgs: 0, embedded: 0 }
    cur.msgs += 1
    if (r.embedded) cur.embedded += 1
    byConvo.set(r.cid, cur)
  }
  for (const c of byConvo.values()) findings.push({ phrase, ...c, declared: declaredById.has(c.cid) })
}

const undeclared = findings.filter((f) => !f.declared)
const declared = findings.filter((f) => f.declared)

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: undeclared.length === 0, undeclared, declared }, null, 2))
} else {
  console.log(`\n══ CORPUS PRECONDITION · ${PHRASES.length} phrase(s)${ROOM ? ` · room ${ROOM}` : ' · ALL ROOMS'} ══`)
  // ⭐ DECLARED IS PRINTED EVERY RUN, ALWAYS. A declared row is named, not excused — the moment it stops
  // being visible it stops being a decision and becomes the background.
  if (declared.length) {
    console.log('\n  ⓘ DECLARED contamination present (named in fixtures/declared-contamination.json):')
    for (const f of declared) {
      console.log(`     ${f.cid.slice(0, 8)} ${String(f.room).padEnd(14)} ${f.msgs} msg / ${f.embedded} embedded  "${f.phrase}"`)
      console.log(`       ↳ ${declaredById.get(f.cid).why.slice(0, 150)}…`)
    }
    console.log('     ⇒ ⚠️ any run that retrieves this is CONTAMINATED, not evidence. Say so in the finding.')
  }
  if (undeclared.length) {
    console.log('\n  ✖ UNDECLARED contamination — the corpus already contains this text:')
    for (const f of undeclared) {
      console.log(`     ${f.cid.slice(0, 8)} ${String(f.room).padEnd(14)} ${f.msgs} msg / ${f.embedded} embedded  ${JSON.stringify(f.title)}`)
      console.log(`       phrase: "${f.phrase}"`)
    }
    console.log('\n  ⇒ this run would measure a corpus it already changed. Either remove the harness artefacts')
    console.log('    (pipeline/corpus-cleanup.mjs — HARNESS rows only), or declare it and report it as such.')
  } else {
    console.log(`\n  ✔ no undeclared contamination for ${PHRASES.length} phrase(s)`)
  }
}

await pg.end()
// ⛔ NON-ZERO, deliberately. A precondition that only prints is a precondition nobody enforces.
process.exit(undeclared.length ? 1 : 0)
