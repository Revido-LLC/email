-- Persist the user's UI theme preference (`light` | `dark` | `system`) so the
-- choice follows them across devices instead of living only in localStorage.
-- Nullable: null means "no server preference yet" and the client keeps using its
-- local cache. Plaintext UI metadata — never message content. The existing
-- `users_self` RLS policy (FOR ALL) already scopes reads/writes to the owner.
ALTER TABLE "users" ADD COLUMN "theme" text;
