// Agent Skills store — DB ↔ runtime bridge for imported .skill archives.
//
// The SDK owns the FORMAT (parse/validate/pack/unpack — agent-skills.js); this module owns
// the chat site's STORAGE and LIFECYCLE: import an uploaded archive into mst_skills/mst_skill_files
// (contents live in DB like chat uploads — never on disk, never executed), register enabled
// skills into the live component runtime (so the existing skill executor + /chat/skills just
// see them), and repack byte-faithful `.skill` exports that upload cleanly to claude.ai /
// Claude Code / Cowork.
//
// Tool-name translation: a skill's allowed-tools speak Claude's tool names; TOOL_MAP turns
// the ones we can honor into component ids. Unmapped names are recorded (shown as warnings),
// not fatal — the skill still runs with whatever subset exists here. A skill that declares
// NO allowed-tools is unconstrained (all installed tools), per the spec default.

import {
  unpackSkillArchive, parseAgentSkill, packSkillArchive, agentSkillToComponent,
  mapAllowedTools, buildSkillMd, SkillFormatError, KINDS,
} from '@ote/components-sdk'
import { runtime } from './runtime.js'

// Claude tool name → our component id(s). Names not listed here don't exist on this
// platform (Bash/Read/Write/Edit/... need a device; PersonaTemplate hosts can extend this).
// read_skill_file is NOT mapped — the executor injects it for every skill with bundled files.
export const TOOL_MAP = {
  WebSearch: 'search_web',
  WebFetch: 'fetch_url_content',
}

// Import hardening caps (the .skill is a zip: same guard family as the xlsx upload path).
const ARCHIVE_CAPS = { maxEntries: 256, maxEntryBytes: 8 * 1024 * 1024, maxTotalBytes: 24 * 1024 * 1024 }
export const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024 // compressed upload cap (≈11MB as base64)

export const skillRegistryId = (slug) => `skill.${slug}`

/** Read-tool clip: bundled reference files can be big; keep a single read context-sane. */
export const SKILL_FILE_READ_MAX_CHARS = 64 * 1024

function componentFromRow(row, fileMetas) {
  // Rebuild the parsed shape from stored columns (no re-parse of SKILL.md needed).
  const parsed = {
    name: row.slug,
    description: row.description,
    license: row.license,
    compatibility: row.compatibility,
    metadata: row.metadata,
    allowedTools: Array.isArray(row.allowed_tools) ? row.allowed_tools : [],
    extensions: row.extensions || {},
    body: row.prompt,
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    files: fileMetas
      .filter((f) => f.path !== 'SKILL.md')
      .map((f) => ({ path: f.path, size: f.size, binary: f.is_binary, text: null, data: null })),
  }
  return agentSkillToComponent(parsed, { toolMap: TOOL_MAP })
}

/**
 * (Re-)register one DB skill into the live runtime. A registry collision with a PERSONA
 * component skill (skill.research & co) is skipped with a warning — code skills win; the
 * import path refuses such slugs up front, so this only triggers on later persona changes.
 * @returns {boolean} true when registered.
 */
export function registerDbSkill(row, fileMetas, logger) {
  const id = skillRegistryId(row.slug)
  const existing = runtime.registry.get(id)
  if (existing && existing.origin !== 'agent-skill') {
    logger?.warn?.(`[skills] DB skill "${row.slug}" shadows persona component "${id}" — skipped`)
    return false
  }
  if (existing) runtime.registry.unregister(id)
  runtime.registry.register(componentFromRow(row, fileMetas))
  return true
}

/** Drop a DB skill from the live runtime (disable/delete). Persona skills are never touched. */
export function unregisterDbSkill(slug) {
  const id = skillRegistryId(slug)
  const existing = runtime.registry.get(id)
  if (existing && existing.origin === 'agent-skill') runtime.registry.unregister(id)
}

/** Boot-time load: register every enabled DB skill. Never throws — a bad row logs and skips. */
export async function loadDbSkills(fastify) {
  const rows = await fastify.db.mst_skills.findAll({ where: { enabled: true } })
  let loaded = 0
  for (const row of rows) {
    try {
      const fileMetas = await fastify.db.mst_skill_files.findAll({
        where: { skill_id: row.id },
        attributes: ['path', 'size', 'is_binary'],
      })
      if (registerDbSkill(row, fileMetas, fastify.log)) loaded += 1
    } catch (e) {
      fastify.log?.error?.(`[skills] failed to load DB skill "${row.slug}": ${e.message}`)
    }
  }
  if (rows.length) fastify.log?.info?.(`[skills] registered ${loaded}/${rows.length} DB skills`)
  return loaded
}

/**
 * Import a `.skill`/zip buffer: unpack (hardened) → store via importSkillFiles.
 * @returns {{ skill: object } | { error: { code: string, message: string } }}
 */
export async function importSkillArchive(fastify, { buffer, userId = null, replace = false }) {
  let unpacked
  try {
    unpacked = unpackSkillArchive(buffer, ARCHIVE_CAPS)
  } catch (e) {
    if (e instanceof SkillFormatError) return { error: { code: 'bad_skill', message: e.message } }
    throw e
  }
  return importSkillFiles(fastify, { files: unpacked.files, folderName: unpacked.folderName, userId, replace })
}

/**
 * Author a skill from console fields: name/description/instructions become a spec-faithful
 * SKILL.md (SDK buildSkillMd — exports round-trip to claude.ai like any import).
 */
export function authorSkill(fastify, { name, description, instructions, license = null, userId = null, replace = false }) {
  // Foreign imports are lenient; OUR authoring UI enforces the spec strictly, so what we
  // produce always re-uploads to claude.ai/Cowork clean.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name || '') || name.length > 64) {
    return { error: { code: 'bad_skill', message: 'name must be kebab-case (lowercase letters, digits, single hyphens), max 64 characters' } }
  }
  const skillMd = buildSkillMd({ name, description, license, body: instructions })
  return importSkillFiles(fastify, { files: { 'SKILL.md': skillMd }, folderName: null, userId, replace })
}

/**
 * Store + register a skill from an unpacked file map (path → bytes/text): parse (lenient)
 * → store → register. Existing slug: rejected unless `replace` (then files are swapped in
 * one transaction). The shared tail of archive imports AND console authoring.
 * @returns {{ skill: object } | { error: { code: string, message: string } }}
 */
export async function importSkillFiles(fastify, { files: rawFiles, folderName = null, userId = null, replace = false }) {
  // normalize to Buffers so size/encoding handling below has one shape
  const files = {}
  for (const [p, v] of Object.entries(rawFiles || {})) files[p] = typeof v === 'string' ? Buffer.from(v, 'utf8') : v
  let parsed
  try {
    parsed = parseAgentSkill(files, { folderName })
  } catch (e) {
    if (e instanceof SkillFormatError) return { error: { code: 'bad_skill', message: e.message } }
    throw e
  }

  const id = skillRegistryId(parsed.name)
  const registered = runtime.registry.get(id)
  if (registered && registered.origin !== 'agent-skill') {
    return { error: { code: 'conflict_component', message: `"${parsed.name}" is a built-in persona skill — pick a different name.` } }
  }
  const existing = await fastify.db.mst_skills.findOne({ where: { slug: parsed.name } })
  if (existing && !replace) {
    return { error: { code: 'exists', message: `Skill "${parsed.name}" is already installed. Re-import with replace to update it.` } }
  }

  // Portability notes: parse warnings + tools we can't honor here.
  const { unmapped } = mapAllowedTools(parsed.allowedTools, TOOL_MAP)
  const warnings = [...parsed.warnings]
  if (unmapped.length) warnings.push(`tools not available on this platform: ${unmapped.join(', ')}`)

  const values = {
    slug: parsed.name,
    description: parsed.description,
    prompt: parsed.body,
    license: parsed.license,
    compatibility: parsed.compatibility,
    metadata: parsed.metadata,
    allowed_tools: parsed.allowedTools.length ? parsed.allowedTools : null,
    extensions: Object.keys(parsed.extensions).length ? parsed.extensions : null,
    warnings: warnings.length ? warnings : null,
    enabled: true,
    created_by: userId,
  }

  // File rows: the ORIGINAL SKILL.md bytes included, so exports round-trip byte-faithfully.
  const fileRows = Object.entries(files).map(([path, data]) => {
    const meta = path === 'SKILL.md'
      ? { binary: false, text: Buffer.from(data).toString('utf8') }
      : parsed.files.find((f) => f.path === path)
    return {
      path,
      is_binary: meta.binary,
      size: data.byteLength,
      content: meta.binary ? Buffer.from(data).toString('base64') : meta.text,
    }
  })

  const row = await fastify.db.sequelize.transaction(async (transaction) => {
    let skillRow = existing
    if (skillRow) {
      await skillRow.update(values, { transaction })
      await fastify.db.mst_skill_files.destroy({ where: { skill_id: skillRow.id }, transaction })
    } else {
      skillRow = await fastify.db.mst_skills.create(values, { transaction })
    }
    await fastify.db.mst_skill_files.bulkCreate(
      fileRows.map((f) => ({ ...f, skill_id: skillRow.id })),
      { transaction },
    )
    return skillRow
  })

  registerDbSkill(row, fileRows.map((f) => ({ path: f.path, size: f.size, is_binary: f.is_binary })), fastify.log)
  return { skill: skillSummary(row, fileRows.length, replace && existing ? 'replaced' : 'imported') }
}

/**
 * Edit a stored skill's content in place: description / instructions / license. The columns
 * stay the source of truth; SKILL.md is REGENERATED spec-faithfully from them (allowed-tools,
 * metadata, compatibility and extension keys are preserved), so exports keep round-tripping —
 * an edit is the one legitimate break of byte-faithfulness. Bundled files are untouched.
 */
export async function updateSkillContent(fastify, row, { description, instructions, license }) {
  const values = {
    description: description ?? row.description,
    prompt: instructions ?? row.prompt,
    license: license === undefined ? row.license : (license || null),
  }
  const skillMd = buildSkillMd({
    name: row.slug,
    description: values.description,
    license: values.license,
    allowedTools: Array.isArray(row.allowed_tools) ? row.allowed_tools : [],
    metadata: row.metadata,
    compatibility: row.compatibility,
    extensions: row.extensions || {},
    body: values.prompt,
  })
  await fastify.db.sequelize.transaction(async (transaction) => {
    await row.update(values, { transaction })
    await fastify.db.mst_skill_files.update(
      { content: skillMd, size: Buffer.byteLength(skillMd, 'utf8'), is_binary: false },
      { where: { skill_id: row.id, path: 'SKILL.md' }, transaction },
    )
  })
  const fileMetas = await fastify.db.mst_skill_files.findAll({
    where: { skill_id: row.id },
    attributes: ['path', 'size', 'is_binary'],
  })
  if (row.enabled) registerDbSkill(row, fileMetas, fastify.log) // live update in the registry
  return skillSummary(row, fileMetas.length, 'updated')
}

/** The builtin (persona component) skill behind a registry id — null for anything else. */
export function builtinSkill(id) {
  const c = runtime.registry.get(String(id || ''))
  if (!c || c.manifest.kind !== KINDS.SKILL || c.origin === 'agent-skill') return null
  return c
}

/**
 * Synthesize a spec-faithful SKILL.md + `.skill` archive for a BUILTIN persona skill (code —
 * there are no original bytes to repack). allowed-tools is omitted on purpose: the component
 * allowlist speaks OUR component ids, and a partial reverse-map would wrongly constrain the
 * export; the prompt is the substance.
 */
export function builtinSkillArchive(id) {
  const c = builtinSkill(id)
  if (!c) return null
  const slug = c.manifest.id.replace(/^skill\./, '')
  const skillMd = buildSkillMd({ name: slug, description: c.manifest.description, body: c.prompt || '' })
  return { slug, skillMd, bytes: packSkillArchive(slug, { 'SKILL.md': skillMd }) }
}

/** Repack a stored skill into `.skill` bytes (the original files, byte-faithful). */
export async function exportSkillArchive(fastify, skillRow) {
  const fileRows = await fastify.db.mst_skill_files.findAll({ where: { skill_id: skillRow.id } })
  const files = {}
  for (const f of fileRows) {
    files[f.path] = f.is_binary ? new Uint8Array(Buffer.from(f.content, 'base64')) : f.content
  }
  return packSkillArchive(skillRow.slug, files)
}

/**
 * Serve one bundled file to the read_skill_file tool. Only text files inline (a model can't
 * do anything useful with base64 fonts); binaries return their metadata + an explanation.
 */
export async function readSkillFile(fastify, slug, path) {
  const row = await fastify.db.mst_skills.findOne({ where: { slug, enabled: true } })
  if (!row) return { error: `skill "${slug}" is not installed` }
  const file = await fastify.db.mst_skill_files.findOne({ where: { skill_id: row.id, path: String(path || '') } })
  if (!file) {
    const all = await fastify.db.mst_skill_files.findAll({ where: { skill_id: row.id }, attributes: ['path'] })
    return { error: `no bundled file "${path}"`, available: all.map((f) => f.path).filter((p) => p !== 'SKILL.md') }
  }
  if (file.is_binary) {
    return { error: `"${path}" is a binary file (${file.size} bytes) — it cannot be read as text on this platform`, path, size: file.size }
  }
  const clipped = file.content.length > SKILL_FILE_READ_MAX_CHARS
  return {
    path,
    content: clipped ? file.content.slice(0, SKILL_FILE_READ_MAX_CHARS) : file.content,
    ...(clipped ? { note: `clipped to the first ${SKILL_FILE_READ_MAX_CHARS} characters (file is ${file.content.length})` } : {}),
  }
}

/** Console-facing summary of a skill row. */
export function skillSummary(row, fileCount, status) {
  return {
    id: row.id,
    slug: row.slug,
    registryId: skillRegistryId(row.slug),
    description: row.description,
    license: row.license,
    enabled: row.enabled,
    allowedTools: row.allowed_tools || null,
    extensions: row.extensions || null,
    warnings: row.warnings || null,
    files: fileCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(status ? { status } : {}),
  }
}
