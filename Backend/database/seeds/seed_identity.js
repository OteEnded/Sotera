// Platform roles (E1). The system owner is "root" (config-defined, not a DB role).
const ROLES = ["admin", "developer", "power", "member"];

// Dev bootstrap — idempotent, never overwrites existing rows. Ensures the platform roles exist.
//
// This used to also auto-create a standing "sotera-dev" API key from a config-stored secret
// (`auth.bootstrap.soteraDevKey`). Retired 2026-08-03 (Ote: "dont use sotera key"; remove seeding
// for sotera key) — a standing credential in config.json could always come back on the next boot
// even after being deleted, which is exactly what happened (twice). Mint a real key via the
// Console (or a per-run key as agent_dev for tests) instead — nothing should depend on a
// long-lived bootstrap secret.
//
// NOTE: the system admin is the config-defined ROOT user (auth.root), so this seed does not
// create an admin/admin DB user. Real users are created by root/admin through the Console.
export default async function seedIdentity(db) {
    if (!db?.mst_roles) {
        return;
    }

    for (const name of ROLES) {
        await db.mst_roles.findOrCreate({ where: { name }, defaults: { name } });
    }
}
