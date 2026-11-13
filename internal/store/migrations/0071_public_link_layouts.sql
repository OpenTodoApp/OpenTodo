-- Public link layouts (OpenSpec change `public-link-board`): a link shows its
-- project as a list, or as a board with a column per section. Only board links
-- have a row; a link without one is a list, so links made before this change
-- keep their page. Server-side account data like public_links: never synced.
-- Idempotent, so the migration is safe to re-run when numbers are reassigned.
CREATE TABLE IF NOT EXISTS public_link_layouts (
  link_id TEXT PRIMARY KEY REFERENCES public_links(id) ON DELETE CASCADE,
  layout  TEXT NOT NULL CHECK (layout IN ('board'))
);
