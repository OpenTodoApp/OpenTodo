-- User administration (OpenSpec change `user-management`): account status,
-- last sign-in, administrator-issued password reset links and the single-owner
-- guarantee.
--
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time. SQLite has no
-- ADD COLUMN IF NOT EXISTS, so the two per-account values the design adds to
-- `users` (deactivated_at, last_login_at) live in a side table keyed by the
-- account instead. A missing row means "active, never signed in since the
-- upgrade". The `role` column keeps its type; `admin` is a new allowed value.

CREATE TABLE IF NOT EXISTS user_status (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deactivated_at INTEGER,          -- NULL: active
  last_login_at  INTEGER           -- NULL: never signed in since the upgrade
);

-- Single-use, expiring reset links (design D5). Only the sha256 of the secret
-- is stored.
CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);

-- At most one owner, enforced by the database itself (design D7). Bootstrap
-- creates exactly one owner, so existing data always satisfies it; if a
-- hand-edited database had two, the migration fails loudly instead of
-- silently picking one.
CREATE UNIQUE INDEX IF NOT EXISTS users_one_owner ON users(role) WHERE role = 'owner';

-- The owner can never be deleted or deactivated: ownership only moves by
-- transfer. These guards back the in-transaction checks of the service.
CREATE TRIGGER IF NOT EXISTS users_owner_not_deleted
  BEFORE DELETE ON users WHEN OLD.role = 'owner'
BEGIN
  SELECT RAISE(ABORT, 'the owner account cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS user_status_owner_not_deactivated_insert
  BEFORE INSERT ON user_status
  WHEN NEW.deactivated_at IS NOT NULL AND (SELECT role FROM users WHERE id = NEW.user_id) = 'owner'
BEGIN
  SELECT RAISE(ABORT, 'the owner account cannot be deactivated');
END;

CREATE TRIGGER IF NOT EXISTS user_status_owner_not_deactivated_update
  BEFORE UPDATE OF deactivated_at ON user_status
  WHEN NEW.deactivated_at IS NOT NULL AND (SELECT role FROM users WHERE id = NEW.user_id) = 'owner'
BEGIN
  SELECT RAISE(ABORT, 'the owner account cannot be deactivated');
END;

-- A deactivated account cannot become owner either.
CREATE TRIGGER IF NOT EXISTS users_owner_must_be_active
  BEFORE UPDATE OF role ON users
  WHEN NEW.role = 'owner' AND EXISTS (SELECT 1 FROM user_status WHERE user_id = NEW.id AND deactivated_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'a deactivated account cannot become owner');
END;
