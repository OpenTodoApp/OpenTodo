# Design: unarchive projects

## Context

Projects already carry an `archived` boolean that syncs as an ordinary op field. `archiveProject()` in `web/src/lib/ops.ts` writes one op per project in the subtree; `undoAutoArchive()` in `web/src/lib/archive.ts` writes `archived: false` and records the project in the device-local auto-archive skip list. Nothing in the UI lists archived projects.

## Decisions

### D1. Where the list lives: Settings → Projects

The sidebar is the busiest surface on phones, where it is an overlay drawer with strict layout rules (mobile-layout); adding a collapsible group there would add rows and focus stops to every navigation. Settings → Projects already holds the archive preference, the user guide already links to `settings/projects#archived-projects`, and Settings is a plain scrolling page, so the list fits at every width with no new overlay. The section heading carries the existing Help link.

### D2. Restore is one op on the existing field

Restore calls `updateProject(id, { archived: false })`, i.e. `mutate()`. It is applied to the local database at once, queued while offline, and converges by per-field LWW like any other edit. Concurrent restore on one device and archive on another resolves to the newer op on all devices. Only the project itself is restored (the live spec: "Unarchiving a project SHALL unarchive it alone"); an archived parent keeps its children archived, and a restored child of an archived parent shows at the top level until the parent is restored, by the existing tree rules.

### D3. Manual restore also opts the project out of automatic archiving on this device

Without it, a restored project with no open tasks for 30 days would be archived again by the next daily pass. The notice's Undo already adds the project to the per-device skip list; the list's Restore shares that helper (`unarchiveProject`), so both paths behave the same. The skip list is local `meta`, never synced, as before.

### D4. Permissions

The list shows every archived project in the local database. Restore is enabled when the user may archive the project (`canEditProject`: owner or admin of a shared project, always for personal projects); otherwise the button is disabled with a short reason, mirroring the project menu. The server's `ApplyStrict` still refuses an op the role does not allow.

### D5. Accessibility

The list is a `ul` under an `h3` "Archived projects" with the anchor id `archived-projects`. Each Restore button's accessible name includes the project name ("Restore Trip 2026"). After a restore, focus moves to the next entry's button, or to the heading when the list empties, so keyboard users keep their place. An empty state says there are no archived projects.

## Data model impact

None. No new field, op type, table or migration; the op schema is unchanged.

## Size impact

No dependency. A few hundred bytes of JavaScript in the main bundle; no effect on the container image or server memory.

## Risks

- A long list of archived projects makes Settings longer. Acceptable for now; the list is sorted by name and compact. A dedicated view can come later if needed.
