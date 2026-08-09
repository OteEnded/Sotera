// Components console routes — inventory + staged installs (root only).
//
// The persona's components are CODE, so this page deliberately does LESS than the Skills
// page: it shows what is installed (with each project's declared permissions — the point
// of manifest v2), and it can STAGE a remote component into the ComponentStore (download +
// integrity-verify + hardened unpack). Staging does NOT touch persona.json — adding a
// staged project to the persona stays a deliberate hand edit until personas are fully
// data-managed. Note: staging resolves the project, which IMPORTS its entry module —
// root installs by URL+hash on purpose; process isolation is security stage 2.
//
// GET    /admin/components                inventory (installed + staged, permissions shown)
// POST   /admin/components/install        { url, integrity } — stage a remote project
// DELETE /admin/components/staged/:dir    remove a STAGED store entry (never an installed one)

import { readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { requireLogin } from '../../auth/index.js'
import { requireCapability } from '../../auth/permissions.js'
import { install, runtime, resolverRegistry, COMPONENT_STORE_DIR } from '../../components/runtime.js'

const MARKER = '.ote-component.json'

/** Store entries (dir + marker + passport), tolerant of junk dirs. */
function scanStore() {
  let dirs
  try {
    dirs = readdirSync(COMPONENT_STORE_DIR, { withFileTypes: true })
  } catch {
    return [] // no store yet — nothing staged
  }
  const out = []
  for (const d of dirs) {
    if (!d.isDirectory() || d.name === 'node_modules') continue
    const dir = path.join(COMPONENT_STORE_DIR, d.name)
    try {
      const marker = JSON.parse(readFileSync(path.join(dir, MARKER), 'utf8'))
      let passport = null
      try {
        passport = JSON.parse(readFileSync(path.join(dir, 'component.json'), 'utf8'))
      } catch { /* marker without passport — still listed so it can be deleted */ }
      out.push({ dirName: d.name, marker, passport })
    } catch { /* not a store entry */ }
  }
  return out
}

export default async function componentsAdminRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())
  const systemConfig = requireCapability('system_config')

  fastify.get('/admin/components', { preHandler: systemConfig }, async () => {
    // Dependency resolution for the completeness view (RFC_PACKAGE_COMPONENT_DEPENDENCY):
    // per project, the SERVICE contracts its components consume (✓ provided by host/another
    // component) and the component-level deps it declares — requiresComponents (HARD) +
    // optionalComponents (SOFT). Resolved against what's actually installed + provided at
    // boot. On a running server the hard deps are all ✓ (a missing one aborts the install);
    // the live signal is any missing OPTIONAL enhancement.
    const reg = runtime.registry
    const registeredIds = new Set(reg.list().map((c) => c.manifest.id))
    const providedServices = new Set(install.provided || [])
    const kindOf = (id) => reg.get(id)?.manifest?.kind || null
    const depInfo = (p) => {
      const svc = new Map()
      for (const cid of p.components || []) {
        for (const s of (reg.get(cid)?.manifest?.requires || [])) svc.set(s, providedServices.has(s))
      }
      const services = [...svc].map(([name, ok]) => ({ name, ok }))
      const requiresComponents = (p.requiresComponents || []).map((id) => ({ id, ok: registeredIds.has(id) }))
      const optionalComponents = (p.optionalComponents || []).map((id) => ({ id, ok: registeredIds.has(id) }))
      return {
        contains: (p.components || []).map((id) => ({ id, kind: kindOf(id) })),
        services,
        requiresComponents,
        optionalComponents,
        complete: requiresComponents.every((d) => d.ok) && services.every((s) => s.ok),
      }
    }
    const installed = (install.projects || []).map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      type: p.type,
      sdk: p.sdk,
      source: p.source,
      trust: p.trust,
      permissions: p.permissions || [],
      integrity: p.integrity || null,
      components: p.components || [],
      status: 'installed',
      ...depInfo(p),
    }))
    const installedIds = new Set(installed.map((p) => p.id))
    const staged = scanStore()
      .filter((e) => !installedIds.has(e.marker?.id))
      .map((e) => ({
        id: e.marker?.id || e.dirName,
        name: e.passport?.name || e.marker?.id || e.dirName,
        version: e.marker?.version || e.passport?.version || null,
        type: e.passport?.type || null,
        sdk: e.passport?.sdk || null,
        source: e.marker?.url || null,
        trust: 'remote',
        permissions: Array.isArray(e.passport?.permissions) ? e.passport.permissions : [],
        integrity: e.marker?.integrity || null,
        components: Array.isArray(e.passport?.contains) ? e.passport.contains.map((c) => c.id) : [],
        status: 'staged',
        dirName: e.dirName,
        installedAt: e.marker?.installedAt || null,
      }))
    // The Feature-protocol seam, rendered: every installed Feature's declared event
    // vocabulary (manifest.emits) + its LIVE interaction-state snapshot. The console is
    // renderer #2 of these protocols (the first is whatever surface the state lands in —
    // e.g. the daily digest's conversation).
    return {
      storeDir: COMPONENT_STORE_DIR,
      components: [...installed, ...staged],
      features: runtime.featureProtocols(),
      // completeness summary — the one non-green state on a booted server: optional
      // component deps that aren't installed (the capability still works, minus an enhancement)
      dependencies: { optionalMissing: install.componentDeps?.optionalMissing || [] },
    }
  })

  fastify.post('/admin/components/install', {
    preHandler: systemConfig,
    schema: {
      body: {
        type: 'object',
        required: ['url', 'integrity'],
        properties: {
          url: { type: 'string', minLength: 8, maxLength: 2000, pattern: '^https?://' },
          integrity: { type: 'string', minLength: 64, maxLength: 80 }, // sha256 hex (with optional prefix)
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const resolved = await resolverRegistry.resolve({ type: 'url', url: request.body.url, integrity: request.body.integrity })
      return reply.send({
        staged: true,
        project: {
          id: resolved.id,
          name: resolved.name,
          version: resolved.version,
          sdk: resolved.sdk,
          permissions: resolved.permissions || [],
          integrity: resolved.integrity,
          components: (resolved.components || []).map((c) => ({ id: c.manifest?.id, kind: c.manifest?.kind })),
          note: 'Staged into the ComponentStore — add it to persona.json to run it (restart applies).',
        },
      })
    } catch (e) {
      return reply.code(400).send({ error: { code: 'install_failed', message: e?.message || 'install failed' } })
    }
  })

  fastify.delete('/admin/components/staged/:dir', { preHandler: systemConfig }, async (request, reply) => {
    const dirName = path.basename(String(request.params.dir || '')) // basename: no traversal
    const entry = scanStore().find((e) => e.dirName === dirName)
    if (!entry) return reply.code(404).send({ error: { code: 'not_found', message: 'No such staged component.' } })
    const installedIds = new Set((install.projects || []).map((p) => p.id))
    if (installedIds.has(entry.marker?.id)) {
      return reply.code(400).send({ error: { code: 'installed', message: 'This component is installed by the persona — remove it from persona.json first.' } })
    }
    rmSync(path.join(COMPONENT_STORE_DIR, dirName), { recursive: true, force: true })
    return { ok: true }
  })
}
