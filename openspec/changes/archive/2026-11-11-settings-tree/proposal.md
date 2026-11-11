## Why

On a wide screen, Settings lists twelve sections in the left pane and, for a long section, a second list of its pages in the content area. The page you are on is not in the menu you are looking at, so moving between Webhooks and API tokens means going back to that second list. The subsections already exist; the pane should show the ones for the section you have open.

## What Changes

- From 1024 px, the navigation pane lists the open section's sub-pages under that section. Each is a link to its existing address. The section row still opens the overview, which keeps the one-word state ("Webhooks · 2").
- A sub-page's own row is the current page. The section row stays marked as the current section.
- Below 1024 px the list is unchanged: section list, then overview, then page.
- Sections with no sub-pages, and a section the viewer sees as a single page (an admin's People), gain no children.

Out of scope: renaming sub-pages, changing routes or the overview's state words, showing every section's children at once, a new shortcut, and any phone layout change. Advances no ROADMAP.md item; it follows the shipped Settings layout (`settings-subpages`, Design refresh). No new environment variable, no op log change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `settings-navigation`: the wide pane lists the open section's sub-pages, and the current marker moves to the sub-page row.

## Impact

- `web/src/app/SettingsView.tsx` (the compact section list) and `web/src/app/settingsView.test.tsx`.
- No API, no dependency, no bundle growth beyond a few rows of markup already on the settings screen.
