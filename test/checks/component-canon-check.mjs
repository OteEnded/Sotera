// COMPONENT CANON — is every PortableComponent typed and manifested correctly?
//
//   node checks/component-canon-check.mjs
//
// ⚠️ THIS AUDITS A SHARED TREE THAT LIVES OUTSIDE THIS REPO. `PortableComponents/` is resolved by
// relative path from persona.json, and OteLLMServices resolves the SAME directory. So an edit made for
// one project lands in the other. The tree is now versioned (one git repo per component, 2026-08-10),
// but versioning records a change — it does not notice a wrong one. This does.
//
// Ote asked the question this answers: *"recheck if portable component is organize right, type
// catagorized right. Feature, Memory, BodyPart, Package, Tools and things."*
//
// ── THE TWO RULES, FROM Reference/docs/COMPONENT_TYPES_CANON.md ──────────────────────────────────
//   1. TYPE. "A single-component package's `type` is that component's kind; a multi-kind bundle's
//      `type` is `capability`." So `type` is not a label anyone may choose — it is DERIVABLE from what
//      the package actually exports, which means it can be checked instead of believed.
//   2. CONTAINS. `contains[]` must list what the module really ships. It is the only machine-readable
//      inventory of a package, and nothing recomputes it at install time.
//
// ── WHAT THE FIRST RUN FOUND (2026-08-10) ────────────────────────────────────────────────────────
//   • @ote/memory declared `type: "capability"` but exports NINE components, all of kind `tool`.
//     Its own description already said the right thing — *"canon: Memory owns knowledge, a Manager
//     Tool owns the actions"* — so only the `type` field disagreed with the author's own reasoning.
//   • @ote/memory's `contains[]` listed SEVEN of those nine. `list_archived_memories` and
//     `restore_memory` shipped, worked, and appeared in no manifest.
//   • Everything else — 14 of 15 packages — was already correct.
//
// ⚠️ AND A NOTE ON HOW THIS CHECK WAS WRITTEN: the first version read `component.kind`, which does not
// exist (it is `component.manifest.kind`), so it reported ALL FIFTEEN packages as miscategorised. A
// check that fails everything is reporting its own bug. Fifteen-for-fifteen is never a finding.
//
// ── STILL OPEN, DELIBERATELY (Ote's call, not mine) ──────────────────────────────────────────────
// `@ote/memory` is a bundle of Manager Tools living in `Packages/` under the name "Memory". The canon
// explicitly says memory tools do NOT belong inside a Memory component, so the CONTENT is right — but
// the NAME promises a Memory component and there is no such thing. Renaming would change a path both
// this persona and OteLLMServices resolve, so it is not something to do quietly.
//
// Related: the `memory` type has ZERO components in the whole ecosystem. `defineMemory` exists in the
// SDK and nothing calls it — the knowledge lives in the host service (memory-v2-service.js), which is
// exactly what the Layering Law prescribes. Worth knowing, not a defect.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { makeChecker } from '../harness.mjs'

const { check, done } = makeChecker()

// Resolve the ecosystem the way SHE does — from persona.json, not from a hardcoded path. If the
// components move, this check moves with them instead of silently auditing an empty directory.
const personaPath = new URL('../../Backend/app/components/persona.json', import.meta.url)
const persona = JSON.parse(readFileSync(personaPath, 'utf8'))
const first = persona.components?.[0]?.source
check('persona.json names component sources', Boolean(first), first)

const ROOT = path.resolve(path.dirname(new URL(personaPath).pathname.slice(1)), first, '..', '..')
check('the shared PortableComponents tree is reachable', existsSync(ROOT), ROOT)

const dirs = []
for (const group of readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'node_modules')) {
  const g = path.join(ROOT, group.name)
  for (const k of readdirSync(g, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dir = path.join(g, k.name)
    if (existsSync(path.join(dir, 'component.json'))) dirs.push({ group: group.name, name: k.name, dir })
  }
}
check('found the component projects', dirs.length >= 15, `${dirs.length} projects`)

const KINDS = ['memory', 'tool', 'skill', 'bodypart', 'feature']
const seen = []

for (const { name, dir } of dirs) {
  const cj = JSON.parse(readFileSync(path.join(dir, 'component.json'), 'utf8'))
  let comps = []
  try {
    const mod = await import(pathToFileURL(path.join(dir, cj.entry ? cj.entry.replace(/^\.\//, '') : 'index.js')).href)
    comps = mod.components || mod.default?.components || []
  } catch (e) {
    check(`${name}: module loads`, false, e.message.split('\n')[0].slice(0, 90))
    continue
  }

  const kinds = [...new Set(comps.map((c) => c?.manifest?.kind).filter(Boolean))].sort()
  seen.push(...kinds)
  if (!kinds.length) { check(`${name}: exports at least one component`, false, `${comps.length} exported, none with a manifest.kind`); continue }

  // RULE 1 — type is derivable, so derive it and compare.
  const expected = kinds.length > 1 ? 'capability' : kinds[0]
  check(`${name}: type "${cj.type}" matches what it exports`, cj.type === expected,
    kinds.length > 1 ? `multi-kind [${kinds.join(', ')}] → capability` : `${comps.length}× ${kinds[0]} → ${expected}`)

  // RULE 2 — contains[] is the package's inventory; it must be complete and honest.
  const actualIds = comps.map((c) => c?.manifest?.id).filter(Boolean).sort()
  const declaredIds = (cj.contains || []).map((c) => c.id).sort()
  if (cj.contains) {
    const missing = actualIds.filter((id) => !declaredIds.includes(id))
    const phantom = declaredIds.filter((id) => !actualIds.includes(id))
    check(`${name}: contains[] lists everything it ships`, missing.length === 0 && phantom.length === 0,
      missing.length || phantom.length
        ? `${missing.length ? `MISSING ${missing.join(', ')}` : ''}${phantom.length ? ` PHANTOM ${phantom.join(', ')}` : ''}`
        : `${actualIds.length} components`)
  }
}

// Coverage is INFORMATIONAL, never a failure — an unused canonical type is a fact about the roadmap,
// not a bug. Printed so a type quietly going extinct is at least visible.
console.log('\n  type coverage across the ecosystem:')
for (const t of KINDS) {
  const n = seen.filter((k) => k === t).length
  console.log(`    ${t.padEnd(10)} ${n === 0 ? '— none (host-side or not built yet)' : `${n} component(s)`}`)
}

done()
