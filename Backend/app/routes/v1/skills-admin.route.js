// Agent Skills console routes — import/export/manage `.skill` archives (root only).
//
// Skills become system-prompt material for every chat user who binds them, so managing them
// is system_config (same standing as providers). The archive itself is a zip: import goes
// through the SDK's hardened unpack (entry/size caps checked before inflation, traversal
// rejected) and contents live in DB rows — never on disk, never executed.
//
// GET    /admin/skills             list (with warnings, file counts, enabled)
// POST   /admin/skills/import      { data: base64 .skill/zip, replace? }
// GET    /admin/skills/:id         detail (SKILL.md text + bundled file inventory)
// GET    /admin/skills/:id/export  the .skill archive (byte-faithful repack)
// PATCH  /admin/skills/:id         { enabled } — toggle (registry updates live)
// DELETE /admin/skills/:id         remove (files cascade; unregistered live)

import { requireLogin } from '../../auth/index.js'
import { requireCapability } from '../../auth/permissions.js'
import { logConfigChange } from '../../audit/config-log.js'
import {
  importSkillArchive, authorSkill, exportSkillArchive, loadDbSkills, registerDbSkill,
  unregisterDbSkill, skillSummary, updateSkillContent, builtinSkill, builtinSkillArchive,
  MAX_ARCHIVE_BYTES,
} from '../../components/skill-store.js'
import { listSkills, disabledBuiltinSkillIds, resolveSkill } from '../../components/runtime.js'
import { setSetting } from '../../settings/index.js'

export default async function skillsAdminRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())
  const systemConfig = requireCapability('system_config')

  // Only DB skills have UUID ids — a builtin registry id (e.g. "skill.research") must 404
  // here, not blow up Postgres' uuid cast. Builtins have no detail/export/toggle/delete.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const findSkill = (id) => (UUID_RE.test(String(id)) ? fastify.db.mst_skills.findByPk(id) : Promise.resolve(null))

  fastify.get('/admin/skills', { preHandler: systemConfig }, async () => {
    const rows = await fastify.db.mst_skills.findAll({ order: [['created_at', 'ASC']] })
    const counts = {}
    for (const f of await fastify.db.mst_skill_files.findAll({ attributes: ['skill_id'] })) {
      counts[f.skill_id] = (counts[f.skill_id] || 0) + 1
    }
    // Persona component skills (code in persona.json, e.g. skill.research) live in the
    // runtime registry, not the DB — list them so the console shows EVERY skill a user can
    // bind or trigger, not just imported archives. builtin=true tells the UI their content
    // is code (no delete/edit in place — clone to make an editable copy); enable/disable
    // persists in the chat.disabledBuiltinSkills setting.
    const disabled = disabledBuiltinSkillIds(fastify.config)
    const builtin = listSkills()
      .filter((s) => s.origin !== 'agent-skill')
      .map((s) => ({
        id: s.id,
        slug: s.id.replace(/^skill\./, ''),
        registryId: s.id,
        description: s.description,
        license: null,
        enabled: !disabled.has(s.id),
        allowedTools: null,
        extensions: null,
        warnings: null,
        files: s.files,
        builtin: true,
      }))
    return { skills: [...builtin, ...rows.map((r) => skillSummary(r, counts[r.id] || 0))] }
  })

  // Flip a builtin skill's platform availability (persisted as a settings list, since its
  // definition is code, not a row). Shared by the PATCH handler below.
  async function setBuiltinEnabled(id, enabled) {
    const disabled = disabledBuiltinSkillIds(fastify.config)
    if (enabled) disabled.delete(id)
    else disabled.add(id)
    return setSetting(fastify.db, 'chat.disabledBuiltinSkills', [...disabled].sort(), fastify.config)
  }

  const builtinSummary = (c) => ({
    id: c.manifest.id,
    slug: c.manifest.id.replace(/^skill\./, ''),
    registryId: c.manifest.id,
    description: c.manifest.description,
    license: null,
    enabled: !disabledBuiltinSkillIds(fastify.config).has(c.manifest.id),
    allowedTools: null,
    extensions: null,
    warnings: null,
    files: c.skillFiles?.length || 0,
    builtin: true,
  })

  fastify.post('/admin/skills/import', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        required: ['data'],
        properties: {
          // ~8MB of archive as base64 (server re-checks the decoded size).
          data: { type: 'string', minLength: 8, maxLength: Math.ceil((MAX_ARCHIVE_BYTES * 4) / 3) + 16 },
          replace: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    let buffer
    try {
      buffer = Buffer.from(String(request.body.data), 'base64')
    } catch {
      return reply.code(400).send({ error: { code: 'bad_encoding', message: 'data must be base64' } })
    }
    if (!buffer.length || buffer.length > MAX_ARCHIVE_BYTES) {
      return reply.code(400).send({ error: { code: 'too_large', message: `archive exceeds ${MAX_ARCHIVE_BYTES} bytes` } })
    }
    const result = await importSkillArchive(fastify, {
      buffer,
      userId: request.user?.id ?? null,
      replace: request.body.replace === true,
    })
    if (result.error) {
      const status = result.error.code === 'exists' || result.error.code === 'conflict_component' ? 409 : 400
      return reply.code(status).send({ error: result.error })
    }
    return reply.send(result)
  })

  // Author a skill in the console: name/description/instructions become a spec-faithful
  // SKILL.md (via the SDK) and store/register exactly like an import — so an authored
  // skill exports as a .skill that uploads to claude.ai/Cowork unchanged.
  fastify.post('/admin/skills', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'description', 'instructions'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 64 },
          description: { type: 'string', minLength: 1, maxLength: 1024 },
          instructions: { type: 'string', minLength: 1, maxLength: 200_000 },
          license: { type: 'string', maxLength: 200 },
          replace: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const result = await authorSkill(fastify, {
      name: request.body.name.trim(),
      description: request.body.description.trim(),
      instructions: request.body.instructions,
      license: request.body.license?.trim() || null,
      userId: request.user?.id ?? null,
      replace: request.body.replace === true,
    })
    if (result.error) {
      const status = result.error.code === 'exists' || result.error.code === 'conflict_component' ? 409 : 400
      return reply.code(status).send({ error: result.error })
    }
    return reply.send(result)
  })

  fastify.get('/admin/skills/:id', { preHandler: systemConfig }, async (request, reply) => {
    const bi = builtinSkill(request.params.id)
    if (bi) {
      // Builtin detail is synthesized from the component (its SKILL.md doesn't exist as
      // bytes) — same shape as a DB skill so the console modal renders it unchanged.
      const resolved = resolveSkill(bi.manifest.id, { trace: false })
      const arch = builtinSkillArchive(bi.manifest.id)
      return {
        skill: {
          ...builtinSummary(bi),
          allowedTools: resolved?.allowedComponents || null, // OUR component ids (code allowlist)
          prompt: bi.prompt || '',
          skillMd: arch?.skillMd ?? null,
          fileList: (bi.skillFiles || []).map((f) => ({ path: f.path, size: f.size, binary: f.binary })),
        },
      }
    }
    const row = await findSkill(request.params.id)
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'No such skill.' } })
    const files = await fastify.db.mst_skill_files.findAll({
      where: { skill_id: row.id },
      attributes: ['path', 'size', 'is_binary'],
      order: [['path', 'ASC']],
    })
    const skillMd = await fastify.db.mst_skill_files.findOne({ where: { skill_id: row.id, path: 'SKILL.md' } })
    return {
      skill: {
        ...skillSummary(row, files.length),
        prompt: row.prompt,
        skillMd: skillMd?.content ?? null,
        fileList: files.map((f) => ({ path: f.path, size: f.size, binary: f.is_binary })),
      },
    }
  })

  fastify.get('/admin/skills/:id/export', { preHandler: systemConfig }, async (request, reply) => {
    // Builtin: a synthesized spec-faithful archive (there are no original bytes to repack).
    const arch = builtinSkillArchive(request.params.id)
    if (arch) {
      reply.header('content-type', 'application/zip')
      reply.header('content-disposition', `attachment; filename="${arch.slug}.skill"`)
      return reply.send(Buffer.from(arch.bytes))
    }
    const row = await findSkill(request.params.id)
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'No such skill.' } })
    const bytes = await exportSkillArchive(fastify, row)
    reply.header('content-type', 'application/zip')
    reply.header('content-disposition', `attachment; filename="${row.slug}.skill"`)
    return reply.send(Buffer.from(bytes))
  })

  // { enabled } toggles availability (builtin skills persist it in a setting — their
  // definition is code). { description / instructions / license } edits a DB skill's content
  // in place (SKILL.md regenerated; builtin content is code — clone it to edit a copy).
  fastify.patch('/admin/skills/:id', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          description: { type: 'string', minLength: 1, maxLength: 1024 },
          instructions: { type: 'string', minLength: 1, maxLength: 200_000 },
          license: { type: 'string', maxLength: 200 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { enabled, description, instructions, license } = request.body || {}
    const hasContent = description !== undefined || instructions !== undefined || license !== undefined
    if (enabled === undefined && !hasContent) {
      return reply.code(400).send({ error: { code: 'bad_request', message: 'Nothing to change.' } })
    }
    const bi = builtinSkill(request.params.id)
    if (bi) {
      if (hasContent) {
        return reply.code(400).send({ error: { code: 'builtin', message: 'A built-in skill is code — clone it to make an editable copy.' } })
      }
      const res = await setBuiltinEnabled(bi.manifest.id, enabled)
      if (res.error) return reply.code(500).send({ error: { code: 'settings', message: res.error } })
      return { skill: builtinSummary(bi) }
    }
    const row = await findSkill(request.params.id)
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'No such skill.' } })
    if (hasContent) {
      await updateSkillContent(fastify, row, {
        description: description?.trim(),
        instructions,
        license: license === undefined ? undefined : (license.trim() || null),
      })
    }
    if (enabled !== undefined) {
      await row.update({ enabled })
      if (row.enabled) {
        const files = await fastify.db.mst_skill_files.findAll({
          where: { skill_id: row.id },
          attributes: ['path', 'size', 'is_binary'],
        })
        registerDbSkill(row, files, fastify.log)
      } else {
        unregisterDbSkill(row.slug)
      }
    }
    const count = await fastify.db.mst_skill_files.count({ where: { skill_id: row.id } })
    return { skill: skillSummary(row, count, hasContent ? 'updated' : undefined) }
  })

  fastify.delete('/admin/skills/:id', { preHandler: systemConfig }, async (request, reply) => {
    if (builtinSkill(request.params.id)) {
      return reply.code(400).send({ error: { code: 'builtin', message: 'A built-in persona skill cannot be deleted from the console — disable it instead (its code lives in the persona).' } })
    }
    const row = await findSkill(request.params.id)
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'No such skill.' } })
    // Snapshot before the row (and its files) go — a deleted skill leaves nothing behind to explain why
    // conversations bound to it started replying differently.
    const was = { slug: row.slug, name: row.name, enabled: row.enabled, files: await fastify.db.mst_skill_files.count({ where: { skill_id: row.id } }) }
    unregisterDbSkill(row.slug)
    await fastify.db.mst_skill_files.destroy({ where: { skill_id: row.id } })
    await row.destroy()
    await logConfigChange(fastify.db, {
      area: 'skill', action: 'delete', target: was.slug, before: was, after: null,
      actor: request.user, log: request.log,
    })
    return { ok: true }
  })

  // Boot-time load: this plugin registers after the DB plugin, so enabled DB skills join the
  // runtime here. Failures log and skip — a bad skill row must never block the server.
  try {
    await loadDbSkills(fastify)
  } catch (e) {
    fastify.log?.error?.(`[skills] boot load failed: ${e.message}`)
  }
}
