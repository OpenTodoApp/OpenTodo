-- Public links (OpenSpec change `public-links`): a reusable, revocable link that
-- shows one project's open tasks to anyone who has it, without an account, and
-- with `tick` rights lets them complete tasks. Only a hash of the secret is
-- stored. project_id names an op-log entity, so it has no foreign key. A link is
-- active while revoked_at is null and expires_at is null or in the future.
--
-- Server-side account data: never synced, never written to the op log.
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time.
CREATE TABLE IF NOT EXISTS public_links (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  project_id   TEXT NOT NULL,
  created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rights       TEXT NOT NULL CHECK (rights IN ('view','tick')),
  name         TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER,
  revoked_at   INTEGER,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS public_links_project ON public_links(project_id);
