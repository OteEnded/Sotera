// ⭐⭐⭐ INDEPENDENCE IS A PROPERTY OF ROOTS, NOT OF ITEMS.
//
// PURE. No stores, no IO, no config. The caller supplies a resolver; this file supplies the judgement.
//
// ── ⭐⭐ O-2, LOCKED 2026-08-29 ────────────────────────────────────────────────────────────────────
//
//     One underlying event cannot establish a recurrence claim such as "this keeps happening".
//     Derived echoes of the same evidence must not manufacture independence.
//
//     E ──► C1                 Dreaming derives C1 from event E
//     E ──► C1 ──► C2          later, Dreaming derives C2 with C1 among its inputs
//     ⇒ C1 and C2 both ROOT AT E ⇒ ⛔ ONE piece of support, not two.
//
// ⭐ So O-2 is not a permission question. Dreaming MAY read its own prior commitments; what it may not
// do is COUNT them as independent. Self-consumption is safe iff recurrence counts ROOTS.
//
// ── ⭐⭐⭐ WHY THIS IS EVEN WELL-DEFINED ───────────────────────────────────────────────────────────
// Because DERIVATION DOES NOT TRANSITIVELY FOLLOW SUPERSESSION (locked): given `A+B→C` and later
// `A→A′`, **C remains derived from A**. If derivation followed supersession, a root could be REWRITTEN
// and independence would change RETROACTIVELY — a recurrence claim made yesterday would quietly become
// true or false today. That earlier lock is what makes root-counting mean anything.
//
// ── ⛔ IT FAILS TOWARD SHARED ROOTS, AND THAT DIRECTION IS DELIBERATE ─────────────────────────────
//   falsely MERGING two occasions  ⇒ ⚠️ a recurrence signal is LOST      — recoverable
//   falsely SPLITTING one occasion ⇒ ⛔ independence is MANUFACTURED     — the same evidence counted twice
// ⇒ when a derivation cannot be resolved, the items are treated as SHARING a root. ⭐ Losing a signal is
// recoverable; inventing one corrupts the thing recurrence exists to measure. (Same asymmetry as O1's C3.)
//
// ── ⚠️ FEASIBILITY, STATED SO NOBODY IS SURPRISED ────────────────────────────────────────────────
// ⓘ Measured 2026-08-29: `evidence.derivedFrom` is present on **4 of 115** memories, inside a column
// carrying at least THREE unrelated payload shapes with no discriminator. ⇒ root-counting is CORRECT
// and ⛔ NOT COMPUTABLE on today's data. This module is the judgement; the links are an M2 requirement.

/** ⭐ What a resolver must return for one item. `null` means "I cannot resolve this" — ⛔ never "none". */
const UNRESOLVED = Symbol('unresolved')

/**
 * ⭐⭐ The transitive roots of one item: the set of UNDERLYING EVENTS it rests on.
 *
 * @param {string} id
 * @param {(id: string) => ({rootEvent?: string|null, derivedFrom?: string[]}|null)} resolve
 *   Returns `{rootEvent}` for a leaf (an actual event — a message, a conversation), `{derivedFrom: [...]}`
 *   for a derived item, or `null` when the derivation cannot be resolved.
 * @returns {{roots: Set<string>, unresolved: boolean, depth: number}}
 */
export function rootsOf(id, resolve, { maxDepth = 64 } = {}) {
  const roots = new Set()
  let unresolved = false
  let depth = 0
  // ── ⛔⛔ A CYCLE AND A DIAMOND ARE NOT THE SAME THING, AND ONE GLOBAL SEEN-SET CANNOT TELL THEM APART.
  //
  // ⚠️ MEASURED BY THE TEST THAT CAUGHT IT: the first version used a single `seen` set, so `A→B→A`
  // terminated quietly with `roots: ∅, unresolved: false` — **a false CLEAN**. "I walked it and found no
  // roots" and "I could not walk it" would then read the same, and downstream that is the difference
  // between refusing a recurrence claim and asserting one. ⛔ Exactly the collapse this module exists to
  // prevent, in its own implementation.
  //
  // ⇒ TWO SETS, because they answer two questions:
  //   `onPath` — is this node an ancestor of itself? ⇒ a genuine CYCLE ⇒ ⛔ UNRESOLVED
  //   `done`   — has this node already been accounted for? ⇒ a DIAMOND (two parents, one grandparent),
  //              which is legitimate and must NOT be reported as unresolved.
  const done = new Set()
  const walk = (cur, onPath, d) => {
    if (d > depth) depth = d
    if (onPath.has(cur)) { unresolved = true; return } // ⛔ cycle
    if (done.has(cur)) return // ⭐ diamond — already counted, ⛔ not a fault
    if (d >= maxDepth) { unresolved = true; return }
    const node = resolve(cur)
    if (node == null) { unresolved = true; done.add(cur); return }
    if (node.rootEvent) { roots.add(node.rootEvent); done.add(cur); return }
    const parents = Array.isArray(node.derivedFrom) ? node.derivedFrom : []
    // ⛔ A DERIVED ITEM WITH NO PARENTS IS NOT A ROOT — it is an item whose derivation was never
    // recorded. Treating it as a root would let an unrecorded lineage read as independent evidence.
    if (!parents.length) { unresolved = true; done.add(cur); return }
    onPath.add(cur)
    for (const p of parents) walk(p, onPath, d + 1)
    onPath.delete(cur)
    done.add(cur)
  }
  walk(id, new Set(), 0)
  return { roots, unresolved, depth }
}

/**
 * ⭐ Are two items independent evidence? Only if their root sets are DISJOINT and both fully resolved.
 * @returns {{independent: boolean, why: string, shared: string[]}}
 */
export function areIndependent(aId, bId, resolve, opts = {}) {
  if (aId === bId) return { independent: false, why: 'the same item is not two pieces of support', shared: [] }
  const a = rootsOf(aId, resolve, opts)
  const b = rootsOf(bId, resolve, opts)
  // ⛔ FAIL TOWARD SHARED. An unresolved chain is not a disjoint one.
  if (a.unresolved || b.unresolved) {
    return { independent: false, why: 'a derivation chain could not be resolved — treated as sharing a root', shared: [] }
  }
  if (!a.roots.size || !b.roots.size) {
    return { independent: false, why: 'an item with no resolvable root event is not independent evidence', shared: [] }
  }
  const shared = [...a.roots].filter((r) => b.roots.has(r))
  return shared.length
    ? { independent: false, why: `they share ${shared.length} root event(s)`, shared }
    : { independent: true, why: 'their root sets are disjoint', shared: [] }
}

/**
 * ⭐⭐ How many INDEPENDENT pieces of support are in this set? Items sharing any root collapse into one.
 *
 * ⛔ This is the number a recurrence claim must be tested against — ⛔ never `items.length`, which is
 * exactly how one event echoing through successive passes becomes "this keeps happening".
 *
 * @returns {{count: number, groups: string[][], unresolved: string[]}}
 */
export function independentSupportCount(ids = [], resolve, opts = {}) {
  const unresolved = []
  const rootsById = new Map()
  for (const id of ids) {
    const r = rootsOf(id, resolve, opts)
    // ⛔ An unresolved item is kept and counted as its OWN group only if it resolved cleanly; otherwise
    // it is reported and ⛔ excluded from the count. It cannot be asserted independent, and silently
    // dropping it would understate what was examined.
    if (r.unresolved || !r.roots.size) { unresolved.push(id); continue }
    rootsById.set(id, r.roots)
  }
  // Union-find over shared roots, by hand — the sets are small and a dependency is not worth it.
  const groups = []
  for (const [id, roots] of rootsById) {
    const hit = groups.filter((g) => [...roots].some((r) => g.roots.has(r)))
    if (!hit.length) { groups.push({ ids: [id], roots: new Set(roots) }); continue }
    const merged = hit[0]
    merged.ids.push(id)
    for (const r of roots) merged.roots.add(r)
    // ⭐ Two groups can become one when a later item bridges them — merge, don't just append.
    for (const other of hit.slice(1)) {
      merged.ids.push(...other.ids)
      for (const r of other.roots) merged.roots.add(r)
      groups.splice(groups.indexOf(other), 1)
    }
  }
  return { count: groups.length, groups: groups.map((g) => g.ids), unresolved }
}

/**
 * ⭐⭐⭐ May a recurrence claim be made from this support set?
 * ⛔ `minIndependent` defaults to 2 because "this keeps happening" is a claim about MORE THAN ONE
 * occasion, and one event echoing is the failure O-2 names.
 */
export function mayClaimRecurrence(ids = [], resolve, { minIndependent = 2, ...opts } = {}) {
  const { count, groups, unresolved } = independentSupportCount(ids, resolve, opts)
  if (unresolved.length) {
    return { ok: false, why: `${unresolved.length} item(s) have an unresolvable derivation — treated as sharing a root`, count, groups, unresolved }
  }
  return count >= minIndependent
    ? { ok: true, why: `${count} independent root groups`, count, groups, unresolved }
    : { ok: false, why: `only ${count} independent root group — one event cannot establish recurrence`, count, groups, unresolved }
}

/** ⛔ Exported so a check can assert the INTENT, not merely the counting. */
export const INDEPENDENCE_IS_A_PROPERTY_OF_ROOTS =
  'Two pieces of support are independent only if the transitive closure of their derivation is disjoint '
  + 'at the level of underlying events. Dreaming may read its own prior commitments; it may not count '
  + 'them as independent. An unresolved chain is treated as sharing a root, because falsely merging loses '
  + 'a signal while falsely splitting manufactures one.'

export { UNRESOLVED }
