// What the EYE saw — the shape of `txn_messages.image_descriptions`, and the one place that knows
// both shapes exist.
//
// Descriptions used to be bare strings: `["a brass clock on a workbench", …]`, index-aligned with
// `images`. That was fine until 2026-08-03, when the platform's default describer (gemma4:e4b) turned
// out to be BLIND — and a cached description could not be attributed to the model that produced it,
// so there was no way to tell a good description from a confabulated one after the fact. New entries
// are objects: `{ text, model, at }`.
//
// LEGACY STRINGS ARE NOT MIGRATED. There are real rows from before the change, a description is
// evidence of what a model said at a moment, and rewriting evidence to fit a newer schema is exactly
// the thing this subsystem must not do — an un-attributed description is honestly un-attributed, and
// `model: null` says so. Every reader goes through here, so the polymorphism stays in ONE file.

/** The live description entries on a message row (never null; missing/garbage → []). */
export function descriptionsOf(row) {
  const raw = row?.image_descriptions
  return Array.isArray(raw) ? raw : []
}

/** The prose a description carries, whatever shape it is stored in. '' when there is none. */
export function descriptionText(entry) {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object' && typeof entry.text === 'string') return entry.text
  return ''
}

/** Which model produced it — null for legacy rows written before attribution existed. */
export function descriptionModel(entry) {
  if (entry && typeof entry === 'object' && typeof entry.model === 'string' && entry.model) return entry.model
  return null
}

/**
 * Client-facing view: one entry per DESCRIBED image, index-aligned with `images`, or undefined when
 * nothing has been described (so the field is simply absent rather than an empty array the UI has to
 * special-case). Kept deliberately small — the raw row shape is not the wire shape.
 */
export function describedImagesView(row) {
  const entries = descriptionsOf(row)
  if (!entries.length) return undefined
  return entries.map((e) => ({ text: descriptionText(e), model: descriptionModel(e), at: (e && typeof e === 'object' && e.at) || null }))
}
