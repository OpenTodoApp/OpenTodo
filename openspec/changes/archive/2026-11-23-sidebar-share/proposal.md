# Share from the sidebar's project menu

## Why

#1905 (Joonas12334): the sidebar's project menu offers Pin, Duplicate, Move and the rest of the header's items, but not Share, so managing a project's members and links meant opening the project first.

## What Changes

- `useProjectMenu` builds the Share project item (Members for a role that only sees them) that the phone header already showed; the header and the sidebar menu both use it, so there is one definition.
- The sidebar's project menu, in the Projects tree and in Favourites, starts with it; it opens the same Share dialog as the header's button.
- `docs/projects.md` mentions it.

No new field, no new string, no op-log or API change, no new environment variable.
