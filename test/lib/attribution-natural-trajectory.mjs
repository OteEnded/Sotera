// ⭐⭐ NATURAL-TRAJECTORY REPRODUCTION · ASSEMBLY. PURE — no store, no network, no Backend import.
//
// Ote, 2026-09-15: *"Build a small natural-trajectory reproduction set around the actual structure of ca672514, with several
// domain variants, and make the production incident itself the canonical positive-control trajectory."*
//
// ── THE THREE SHAPES, AND WHAT EACH ONE VARIES ────────────────────────────────────────────────────────────────────
//   T0      canonical  the incident, verbatim from the record (`attribution-natural-trajectory-ca672514.json`)
//   T0-abl  ablation   T0 minus ONE line of her recollection block — the remembered 25-August request
//   V1..V4  variant    T0 with the DOMAIN tokens substituted and nothing else: his goal turn, the remembered prior request,
//                      the goal memory in the tail, and the tool she has for that domain
//
// ⛔ Every substitution is `replaceOnce`: it throws unless the source text occurs EXACTLY once, so a variant can never
// silently drift from the canonical shape (`identical-output-means-variable-not-in-loop` — two names for one thing).
// ⛔ The probe is never substituted. It is the recorded aside, identical in every trajectory, requested:false.
import { readFileSync } from 'node:fs'

const FIX = new URL('../fixtures/', import.meta.url)
export const CORPUS = JSON.parse(readFileSync(new URL('attribution-natural-trajectory.json', FIX), 'utf8'))
export const CANON = JSON.parse(readFileSync(new URL('attribution-natural-trajectory-ca672514.json', FIX), 'utf8'))

export const ON_FILE = /^I have this on file(?: about Sotera)?: /

function replaceOnce(text, from, to, where) {
  const n = text.split(from).length - 1
  if (n !== 1) throw new Error(`${where}: expected exactly one occurrence of "${from.slice(0, 50)}", found ${n}`)
  return text.replace(from, to)
}

/** The memories the recollection block says she has on file, stripped of the prefix — the tail's recall approximation. */
export function onFileMemories(cognition) {
  return cognition.split('\n').filter((l) => ON_FILE.test(l)).map((l) => l.replace(ON_FILE, ''))
}

function canonical() {
  const cognition = CANON.blocks.cognition
  return {
    id: 'T0', kind: 'canonical', domain: 'memory system', requested: false,
    history: CANON.history.map(({ role, content }) => ({ role, content })),
    probe: CANON.probe.content,
    blocks: { cognition, scopeFacts: CANON.blocks.scopeFacts, workingMemory: CANON.blocks.workingMemory },
    // ① the goal in memory as well as in the conversation — the tail's ranked recall, approximated (see the corpus file)
    recallMemories: [...onFileMemories(cognition), CORPUS.canonicalGoalMemory],
    tools: ['list_memories'],
    stubs: { list_memories: { ...CANON.toolResults.list_memories } },
  }
}

function ablation() {
  const base = canonical()
  const lines = base.blocks.cognition.split('\n')
  const hit = lines.filter((l) => l.includes(CORPUS.canonicalPriorRequest))
  if (hit.length !== 1) throw new Error(`ablation: expected the prior request on exactly one line, found ${hit.length}`)
  return {
    ...base, id: 'T0-abl', kind: 'ablation',
    blocks: { ...base.blocks, cognition: lines.filter((l) => l !== hit[0]).join('\n') },
    removed: hit[0],
  }
}

function variant(d) {
  const base = canonical()
  const goalIdx = base.history.findIndex((m) => m.content === CORPUS.canonicalGoalTurn)
  if (goalIdx === -1) throw new Error(`${d.id}: the canonical goal turn is not in the history`)
  const history = base.history.map((m, i) => (i === goalIdx ? { ...m, content: d.goalTurn } : m))
  const cognition = replaceOnce(base.blocks.cognition, CORPUS.canonicalPriorRequest, d.priorRequest, `${d.id} cognition`)
  const recallMemories = [...base.recallMemories.slice(0, -1), d.goalMemory]
  const stubs = { ...base.stubs }
  for (const t of d.tools) stubs[t] = d.stub
  return { ...base, id: d.id, kind: 'variant', domain: d.phrase, history, blocks: { ...base.blocks, cognition }, recallMemories, tools: d.tools, stubs }
}

export function allIds() { return ['T0', 'T0-abl', ...CORPUS.domains.map((d) => d.id)] }

export function assemble(id) {
  if (id === 'T0') return canonical()
  if (id === 'T0-abl') return ablation()
  const d = CORPUS.domains.find((x) => x.id === id)
  if (!d) throw new Error(`unknown trajectory ${id}`)
  return variant(d)
}

/**
 * What a tool call gets back in this replay. Always a JSON string. ⛔ Nothing here reads or writes any store: the
 * canonical `list_memories` payloads are the ones the log recorded her receiving; a domain tool gets the domain stub;
 * a write-shaped tool is told it is unavailable; anything else finds nothing.
 */
export function stubFor(trajectory, name, args = {}) {
  if (name === 'list_memories') {
    const byKind = trajectory.stubs.list_memories
    return byKind[args?.kind] ?? byKind.semantic
  }
  if (trajectory.stubs[name]) return JSON.stringify(trajectory.stubs[name])
  if (name === 'get_current_time') return JSON.stringify({ now: '2026-09-15 14:31', zone: 'Asia/Bangkok' })
  if (CORPUS.writeShapedTools.includes(name)) return JSON.stringify({ ok: false, note: 'unavailable right now' })
  return JSON.stringify({ thisLook: 'I looked and found nothing there.', count: 0 })
}

/** Where two assembled trajectories differ — field paths, for the tests that pin "only the domain changed". */
export function diffFields(a, b) {
  const out = []
  if (a.probe !== b.probe) out.push('probe')
  const n = Math.max(a.history.length, b.history.length)
  for (let i = 0; i < n; i++) {
    if (a.history[i]?.role !== b.history[i]?.role || a.history[i]?.content !== b.history[i]?.content) out.push(`history[${i}]`)
  }
  for (const k of ['scopeFacts', 'workingMemory']) if (a.blocks[k] !== b.blocks[k]) out.push(`blocks.${k}`)
  const la = a.blocks.cognition.split('\n'); const lb = b.blocks.cognition.split('\n')
  if (la.length !== lb.length) out.push('blocks.cognition.lineCount')
  for (let i = 0; i < Math.min(la.length, lb.length); i++) if (la[i] !== lb[i]) out.push(`blocks.cognition[${i}]`)
  const m = Math.max(a.recallMemories.length, b.recallMemories.length)
  for (let i = 0; i < m; i++) if (a.recallMemories[i] !== b.recallMemories[i]) out.push(`recallMemories[${i}]`)
  if (JSON.stringify(a.tools) !== JSON.stringify(b.tools)) out.push('tools')
  return out
}
