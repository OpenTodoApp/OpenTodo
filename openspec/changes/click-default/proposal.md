# Click a task to: an account choice and a server default

## Why

GitHub issue #1958: a server's less technical users edit titles by accident when they mean to open a task, and the old **Click a task to** setting could not help them: it lived on one device, reverted on a new browser, had no server default and sat under Keyboard. `click-selects-title` replaced it with one rule (a first click selects, a second click on the selected title edits), which removes the accidental edit on a first click but still edits on the second. The maintainer decided on the issue: "an admin-set default, and users can override it".

## What Changes

- **Click a task to** comes back as an account preference in **Settings → Appearance → Task details**, beside **Open tasks**: **Use the server default (…)** (the initial value, naming the default it follows), **Select, then edit the title** (the `click-selects-title` rule) and **Open details**. Under **Open details** a click on a task opens it as Enter does (its page, or the side panel or the Inbox's split where they show) and never starts an inline edit; `F2`, Enter, the double-click and `a` are unchanged.
- The choice is the synced `user_prefs.row_click` field, written through ops: it follows the account to every device and works offline.
- **Settings → Server → Task lists**: the owner sets the default for accounts that have not chosen. `auth/status` reports it to signed-in callers and the device keeps the last value it read, so a start without a connection follows it too.
- One route, `PUT /api/v1/settings/row-click`, owner only like the default theme, refused on a demo instance and recorded as `settings.changed`.

No new mandatory environment variable, no dependency. The op schema gains one additive field. Not **BREAKING**.

## Out of scope

- **Expand the row** as a third choice: `click-selects-title` removed its click path (`clickExpands`), so bringing it back is not a cheap reuse; → and Show details still expand.
- A per-device override and an option where only the title's letters edit it (also asked in the issue).
- An environment variable for the default: the setting lives in the server's settings like the default theme.

ROADMAP.md: none (an improvement from an issue); follows `click-selects-title`.

## Capabilities

### Modified Capabilities

- `task-list-presentation`: a new requirement "Click a task to: the account's choice and the server's default".

## Impact

- Server: `internal/sync/ops.go` (`user_prefs.row_click`), `internal/httpapi/row_click.go` (the route and the stored default), `auth_handlers.go` (`rowClick` in the status); `docs/api.md`, the v1 surface and the OpenAPI description.
- Web: `lib/rowClickPref.ts`, `TaskRow.tsx` (`useRowClicks` records no press under Open details), `AppearanceSection.tsx` (the row), `TaskListsServerPanel.tsx`, `settingsSections.ts`, `settingsPages.tsx`, `lib/settingsCopy.ts`, `App.tsx`; four messages in every catalogue.
- Docs: `docs/settings-app.md`, `docs/settings-you.md`, `docs/settings-server.md`, `docs/task-panel.md`; `changelog.d/Added/click-default.md`.
