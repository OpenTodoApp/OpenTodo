## Context

Settings has twelve sections. Nine of them are overviews of sub-pages (`web/src/app/settingsSections.ts`, `visiblePages`). From 1024 px the pane (`SettingsList` with `compact`) draws one 30 px row per section and nothing under it. The overview in the content column (`SettingsOverview`) is where the sub-pages and their state words live. Below 1024 px each level is already its own page.

The pane is 228 px (`14.25rem`), already scrolls (`lg:overflow-y-auto`), and already receives `current` and `inPage`.

## Goals / Non-Goals

**Goals:**

- The open section's sub-pages are visible in the pane and jump directly to their existing addresses.
- The overview, its state words, the routes, and the phone flow stay as they are.

**Non-Goals:**

- Listing every section's children at once.
- Renaming long page labels so they fit 228 px.
- A new shortcut, a new route, or any server change.

## Decisions

### D1. Children only under the open section, and only in the compact pane

`SettingsList` already knows the open section. When `compact` is set and `visiblePages(user, section)` is non-empty, it renders those pages under that section's row. `visiblePages` returns nothing for a section with no `pages` and for a section the viewer sees as one page (an admin's People), so those rows stay flat. The phone list does not pass `compact`, so it gains no children.

The section row keeps linking to `/settings/<section>`. A child links to `/settings/<section>/<page>`.

Alternative considered: always expand every section. An owner with every feature on would add about forty rows to a pane that currently fits. Rejected.

Alternative considered: drop the overview and open the first sub-page. That removes the state words ("Webhooks · 2", "Off"). Rejected.

### D2. Current markers

On an overview the section row keeps `aria-current="page"`. On a sub-page the section row is `aria-current="true"` (already what `inPage` does) and the child row is `aria-current="page"`. Focus on arrival stays on the page heading, which the view already does.

### D3. Names that do not fit

"Calendar apps (CalDAV)" and "Bookmarklet and extension" will truncate. The label is a `TruncatedText`: the full string stays in the DOM (CSS truncation), so the accessible name is the full label, and a tooltip shows it only while it is cut. The lint forbids a native `title` attribute on this screen. No rename.

### D4. No new data

Nothing is stored. The tree is derived from the section table and the route. Offline, the rows are the same, because the section table is client data. There is nothing to converge.

Data model impact: none. No dependency. Container image size and runtime memory are unchanged.

Interface budget: the pane is an existing scroll region. The extra rows scroll inside it, so the screen does not gain a scroll region, a chrome row, a sidebar destination, a task property, or a shortcut.

## Risks / Trade-offs

- [A long section (Integrations, Server) makes the pane scroll] → It already scrolls. Children are only for the open section, at most nine rows.
- [The overview and the pane list the same names] → The overview keeps the state words the pane does not have room for. The pane is for jumping; the overview is for status.
- [Tests that count "one row per section"] → Update `settingsView.test.tsx` for the wide pane only.

## Migration Plan

None. Routes are unchanged. Rollback is reverting the pane.

## Open Questions

None.
