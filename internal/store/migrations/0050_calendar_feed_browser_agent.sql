-- calendar-feed-user-agent (#622): a subscription whose server refused the
-- OpenTodo User-Agent (400, 403 or 406) and then answered a browser-compatible
-- one is listed here, so later polls send the browser User-Agent directly. The
-- row is removed when the subscription's address changes. A side table rather
-- than a column on calendar_subscriptions, because SQLite cannot run ALTER
-- TABLE ADD COLUMN idempotently (see 0047).
--
-- Server-side state: never synced, never written to the op log.
CREATE TABLE IF NOT EXISTS calendar_feed_browser_agents (
  subscription_id TEXT PRIMARY KEY REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL
);
