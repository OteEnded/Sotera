// Capability model for the platform (E1).
//
// Identity tiers:
//   - root  : config-defined system owner (superuser). user.isRoot === true.
//   - users : DB users with one+ of these roles:
//             admin, developer, power, member.
//
// Capabilities (what a user is allowed to do), and which tier/role grants each:
//   system_config -> root only            (providers, system settings, model locking)
//   manage_users  -> root, admin
//   console       -> root, admin, developer        (access the /console site)
//   chat          -> any authenticated user        (access the /chat site)
//   select_model  -> root, admin, developer, power (pick/config model in chat;
//                                                    member is locked to an assigned model)
//   own_keys      -> root, admin, developer        (mint/manage their OWN API keys —
//                                                    the developer tier's whole point)
//   context_detail-> root, admin, developer        (see the PROMPT BREAKDOWN behind a turn:
//                                                    how many tokens went to the system prompt,
//                                                    tool definitions, memory, skills, history)

export const DB_ROLES = ['admin', 'developer', 'power', 'member']

function hasRole(user, ...roles) {
  const r = user?.roles || []
  return roles.some((role) => r.includes(role))
}

const CAPABILITIES = {
  system_config: (u) => Boolean(u?.isRoot),
  manage_users: (u) => Boolean(u?.isRoot) || hasRole(u, 'admin'),
  console: (u) => Boolean(u?.isRoot) || hasRole(u, 'admin', 'developer'),
  chat: (u) => Boolean(u), // any authenticated user
  select_model: (u) => Boolean(u?.isRoot) || hasRole(u, 'admin', 'developer', 'power'),
  own_keys: (u) => Boolean(u?.isRoot) || hasRole(u, 'admin', 'developer'),
  // The prompt breakdown exposes HOW the turn was assembled — which rules are loaded, that memory
  // was recalled, how much of the window skills consume. That is operator information, not chat
  // information, so it rides the same tier as the console. Deliberately its OWN capability rather
  // than reusing `console`: the two happen to grant the same set today, but they answer different
  // questions ("may you open the console site" vs "may you see prompt internals") and one moving
  // should not silently move the other.
  context_detail: (u) => Boolean(u?.isRoot) || hasRole(u, 'admin', 'developer'),
  // ── ⭐⭐⭐ MAY THIS ACCOUNT BE GIVEN SOTERA'S OWN MEMORY? (migration 021) ─────────────────────────
  //
  // ⛔⛔ THIS IS NOT "MAY SOTERA REMEMBER". She owns that memory, and her access to it is INTRINSIC.
  // Ote, ratifying the model on 2026-08-21: *"Sotera's own access to Sotera memory is not an account-level
  // permission… The account-level capability exists for other accounts accessing Sotera's memory."* And the
  // guard he put on it: *"Don't make memory_access_scope the mechanism that lets Sotera remember herself.
  // That would accidentally make her own autobiography dependent on whichever account happens to be talking
  // to her."*
  // ⇒ ⛔ THE COGNITION LAYER MUST NEVER CONSULT THIS. If it ever appears in a retrieval, ranking or fusion
  // decision, the model has been inverted. It belongs at the UTTERANCE boundary (may this account be TOLD)
  // and at operator reads of her memory (admin surfaces, exports, API-key callers).
  //
  // ⭐ THE FIRST CAPABILITY HERE THAT IS PER-ACCOUNT RATHER THAN PER-ROLE, and that is the point: root is
  // the granting AUTHORITY, not the mechanism. Before this, the only way to have broad reach was to BE root
  // (`authorized_via = 'root_session'`), which made a standing property of a session do a grant's job.
  //
  // ⚠️ FAILS CLOSED, EXPLICITLY. A user object with no scope field — an older session, an API caller shaped
  // by a different allowlist, a mock in a test — must read as `none`. ⛔ `!== 'none'` would make every
  // missing field a grant, which is this project's most-repeated defect wearing a boolean.
  access_sotera_memory: (u) => Boolean(u?.isRoot) || u?.memoryAccessScope === 'sotera_memory',
}

export function can(user, capability) {
  if (!user) return false
  const check = CAPABILITIES[capability]
  return check ? Boolean(check(user)) : false
}

// Compute the full capability set for a user (handy for /v1/me so the frontend
// can show/hide Chat vs Console and the model picker).
export function capabilitiesFor(user) {
  const out = {}
  for (const cap of Object.keys(CAPABILITIES)) out[cap] = can(user, cap)
  return out
}

// Fastify preHandler — assumes requireLogin() ran first (request.user set).
export function requireCapability(capability) {
  return async function capabilityPreHandler(request, reply) {
    const user = request.user
    if (!user) {
      return reply.code(401).send({ error: { code: 'not_authenticated', message: 'Login required' } })
    }
    if (!can(user, capability)) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: `Capability '${capability}' required` },
      })
    }
  }
}
