# Proposal: settings-foundation

## Why

An audit of all 54 settings pages, at 1280 px and 390 px, found them hard to scan and without depth. Their content is fine, but the shared pieces they are built from flatten everything:
- **Weak section headings.** A section heading is small grey metadata text, weaker than the rows under it, so nothing on a page groups anything.
- **Repeated titles.** About 30 of 41 sub-pages repeat their title as their first heading.
- **No lead line on sub-pages.** On the desktop pane, only section pages get one. Sub-pages show a bare title, so nothing says what a page is for or whom it affects.
- **Unclear scope.** Server-wide pages look like personal ones. The only hint is the "Server" group label in the navigation.
- **States look like values.** Settings that leave people stuck read like plain grey values. Examples: no backup has ever run, no outgoing email so nobody can reset a password, two-factor off.
- **Hand-built forms.** Radios and number fields are built by hand in about 20 places. Saving works three different ways.
- **Wrapping switches on phones.** Every switch wraps under its label, roughly doubling page length.

Fixing these shared pieces improves every page at once, without moving any of them. That is the first of three steps (foundation, patterns, architecture).

## What Changes

- **Settings page head.** Every page and sub-page starts with a lead line that says what it is for and who it applies to: your account, this device, or everyone on this server. It may also show a status and the page's primary action. The lead line appears on phones too, where today the title lives only in the bar.
- **Headings that carry the page.** A section heading outranks the rows under it. A page with one section shows no section heading, and that section's line becomes the page's lead line, so no page repeats its own title.
- **Status tones.**
  - **Rows:** states use the existing status dot tones (ok, warning, danger, off). A state that leaves people stuck uses the warning tone.
  - **Overview pages:** a row whose sub-page has such a state shows it in the same tone.
- **New primitives in `web/src/ui`:**
  - `RadioGroup` (radio cards and a compact list form).
  - `NumberInput`, with a unit after the value, a range, and an optional "No limit" choice.

  Both get stories. Settings stop hand-building radios and number fields.
- **Phone rows.** Below 640 px a row whose control is a switch keeps the switch on its label's line. Other controls still stack under the label.
- **One save rule.**
  - A single control (switch, select, segmented control, radio group) saves when it changes, and shows its result in place.
  - A form of several fields shows a save bar while it has unsaved changes. The bar holds Save and Discard, and leaving with unsaved changes asks first.
  - A failed save restores the previous value and says why.

Nothing is **BREAKING**: no environment variable, route, op or stored setting changes.

### Out of scope

- **Moving, merging or renaming pages,** and moving owner switches out of personal pages: `settings-architecture`.
- **New shared patterns:** connection card, collection list, danger zone and advanced disclosure: `settings-patterns`.
- **Copy rewrites** beyond the lead lines this change needs.

### Roadmap

Advances **Design refresh** with a new step: *Settings structure* (`settings-foundation`, then `settings-patterns` and `settings-architecture`).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `settings-navigation`:
  - **Section page layout:** the page head's lead line and scope also appear on sub-pages and phones.
  - **Panel cards and rows:** a switch stays beside its label on phones; status tones.
  - **Card tiers:** heading weight; no heading on a one-section page.
  - **Settings sub-pages:** overview states in tones.
  - **Added:** settings save behaviour.
- `design-system`:
  - **Settings section and row patterns:** heading rank; the one-section rule; the switch row on phones.
  - **Form controls:** radio group and number input join the shared style.
  - **Added:** requirements for the radio group and the number input.

## Impact

- **`web/src/ui`:**
  - `patterns/SettingsSection.tsx`: heading style, the single-section mode, the switch row on phones.
  - `StatusIndicator`: used in rows and overviews.
  - New: `RadioGroup.tsx`, `NumberInput.tsx` and a save-bar pattern, each with stories and tests.
- **`web/src/app`:**
  - `SettingsView.tsx`: the page head with lead line and scope, on every page and on phones.
  - `settingsSections.ts`: a scope and lead line per page, through the settings copy table.
  - The overview: states in tones.
  - About 15 panels that hand-build radios or number fields, or save in their own way. Among them: Quick add, AI assistants (MCP), OAuth clients, API tokens, Backups, Restore, Attachments, Focus timer, Default reminders, Closed list, Audit settings, Branding, Workspaces.
- **Tests:**
  - The settings anatomy test learns the new rules (heading rank, no duplicate title, lead line present).
  - `scripts/ux-audit/settings-heights.mjs` should report shorter phone pages.
- **Screenshot baselines:** most settings stories change once.
- **Docs:** `docs/design-system.md` (the settings anatomy) and `docs/interface-guide.md` (the save rule).
- **No server, API, op-log or dependency change.** The bundle grows only by the two primitives and the save bar.
