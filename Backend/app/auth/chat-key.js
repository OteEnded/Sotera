// System "chat" API keys — per-user usage attribution for the chat SITE.
//
// The chat site authenticates with a login session, not an API key. To make chat-site
// usage show up in the same per-key usage accounting as the API surfaces, every user is
// coupled with ONE system key (api_keys.kind = 'chat'):
//   - auto-created the first time the user touches the chat site
//   - expires (CHAT_KEY_TTL_MS) but auto-renews whenever the user opens the chat site
//     and no active chat key exists (a DB partial unique index enforces 1 per user)
//   - listed in the console like any key, and READ-ONLY there EXCEPT `is_active`, which is the
//     per-user CHAT KILL SWITCH: chat-site.route.js refuses model-calling endpoints with
//     403 chat_disabled while it is off, and browsing existing history stays allowed
//   - its raw secret is never revealed to anyone, so it cannot be used to call the API —
//     it exists purely to attribute chat-site usage.
// Root gets one too. ⚠ IT USED TO BE KEYED ON owner_user_id = NULL, because root had no users row —
// that stopped being true on 2026-08-06 and left root with TWO rows. See the reconciliation below.

import crypto from 'node:crypto'
import { sha256 } from './index.js'
import { isRootConnectedUser } from './root-identity.js'

export const CHAT_KEY_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days, then renewed on next chat-site open
const CHAT_KEY_SCOPES = ['chat', 'streaming']
const CHAT_KEY_DESCRIPTION = 'System key — attributes chat-site usage for this user. Auto-renews when the user opens the chat site.'

function chatKeyName(user) {
  return `chat-${user?.username || 'root'}`
}

// Find-or-create the user's chat key; renew it if expired/disabled. Returns the row
// (or null on failure — callers must treat this as best-effort and never block chat).
export async function ensureChatApiKey(db, user, config = null) {
  if (!db?.mst_api_keys) return null
  const ownerId = user?.id ?? null

  let key = await db.mst_api_keys.findOne({ where: { owner_user_id: ownerId, kind: 'chat' } })

  // ⚠ ROOT'S DUPLICATE CHAT KEY — THE KILL SWITCH SILENTLY DID NOTHING FOR ROOT. Found 2026-08-09.
  //
  // Root's chat key was keyed on `owner_user_id = NULL`, because root had no users row. On 2026-08-06 root
  // GAINED one — so this function began resolving `ownerId` to a real id and MINTED A SECOND ROW, while the
  // console still finds root's key the old way (`kind === 'chat' && !owner`, i.e. the NULL one). Admin
  // disabled one row; the gate in chat-site.route.js read the other. The toggle reported success and
  // changed nothing. Measured: two rows both named `chat-w`, both active.
  //
  // ⚠ THIS IS THE THIRD INSTANCE OF ONE BUG, and that is the reason this comment is long. The API-key
  // standing gate (81c6cd5) and now this both broke the same way: A RULE THAT LIVED IN A DATA SHAPE
  // (`owner_user_id === null` MEANS root) DISAPPEARED WHEN THE SHAPE MOVED. Anywhere else that still infers
  // root-ness from a NULL owner is the next one — ask `isRootConnectedUser`, never the column.
  //
  // Self-healing rather than a migration script, on the store-converges principle: the next chat-site open
  // reconciles it, and a box that missed the fix repairs itself instead of needing someone to remember.
  if (config && ownerId) {
    let isRoot = false
    try { isRoot = isRootConnectedUser(config, ownerId) } catch { isRoot = false }
    if (isRoot) {
      const legacy = await db.mst_api_keys.findOne({ where: { owner_user_id: null, kind: 'chat' } })
      if (legacy && !key) {
        // ADOPT: one row, its id and its usage history preserved. Nothing is orphaned.
        await legacy.update({ owner_user_id: ownerId })
        key = legacy
      } else if (legacy && key) {
        // BOTH exist — today's state. The LEGACY row is the one an admin has been looking at and toggling,
        // so its `is_active` is the one that carries ADMIN INTENT. Honour it on the surviving row before
        // dropping the duplicate, or reconciling would quietly undo a disable someone meant.
        if (legacy.is_active === false && key.is_active !== false) await key.update({ is_active: false })
        await legacy.destroy()
      }
    }
  }

  if (!key) {
    // The raw secret is discarded immediately — only the hash is stored, nothing is shown.
    const raw = `sk_${chatKeyName(user)}_${crypto.randomBytes(24).toString('hex')}`
    try {
      key = await db.mst_api_keys.create({
        owner_user_id: ownerId,
        kind: 'chat',
        key_hash: sha256(raw),
        key_prefix: raw.slice(0, raw.lastIndexOf('_') + 1),
        name: chatKeyName(user),
        description: CHAT_KEY_DESCRIPTION,
        is_active: true,
        expires_at: new Date(Date.now() + CHAT_KEY_TTL_MS),
      })
      for (const scope of CHAT_KEY_SCOPES) {
        await db.mst_api_key_scopes.findOrCreate({
          where: { api_key_id: key.id, scope },
          defaults: { api_key_id: key.id, scope },
        })
      }
    } catch {
      // Unique-index race (e.g. /chat/models and /chat/conversations firing together on
      // open): the other request won — use its row.
      key = await db.mst_api_keys.findOne({ where: { owner_user_id: ownerId, kind: 'chat' } })
      if (!key) return null
    }
  }

  // Root can DISABLE a chat key (per-user chat kill switch): an inactive key is
  // returned AS-IS — never silently re-enabled. Recovery is a root enable or /renew.
  if (!key.is_active) return key

  const patch = {}
  const expired = key.expires_at && new Date(key.expires_at).getTime() < Date.now()
  if (expired) {
    patch.expires_at = new Date(Date.now() + CHAT_KEY_TTL_MS)
  }
  // Track username renames so the key stays recognizable in lists.
  if (key.name !== chatKeyName(user)) patch.name = chatKeyName(user)
  if (Object.keys(patch).length) await key.update(patch)

  return key
}

// Force-renew (root action): rotate the secret, fresh TTL, re-enable. The raw is
// discarded like at creation — chat keys exist purely for usage attribution.
export async function renewChatApiKey(key) {
  const raw = `sk_${key.name || 'chat'}_${crypto.randomBytes(24).toString('hex')}`
  await key.update({
    key_hash: sha256(raw),
    key_prefix: raw.slice(0, raw.lastIndexOf('_') + 1),
    is_active: true,
    expires_at: new Date(Date.now() + CHAT_KEY_TTL_MS),
  })
  return key
}
