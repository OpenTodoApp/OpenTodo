# Settings sections

## Why

Settings has grown to about 25 panels stacked on one long page at `/settings`. Each panel works well, but finding one means scrolling past everything else, on a phone in particular, and the guide has to describe the page "from top to bottom". The product owner asked for internal sections with their own pages, without changing what any setting does.

## What Changes

- `/settings` becomes an **overview**: the account line, a Help link, and a list of sections, each with a one-line description of what it holds, plus the AGPL / no-telemetry footer.
- Each section opens at **`/settings/<section>`**: `account`, `general`, `notifications`, `data`, `capture`, `integrations`, `ai` and `admin`. Deep links, reloads and browser back/forward work. `/settings/import` keeps opening the import screen. An unknown section, or one the user's role does not see, shows the overview.
- The existing panels move, unchanged, into those sections (Account: profile, password, two-factor, passkeys, recent activity and audit log, linked accounts, end-to-end encryption, sign out; General: calendar, start view, keyboard, quick add, voice, projects; Notifications; Data: export/import, sync status, backups; Capture: bookmarklet and email to task; Integrations: calendar apps, webhooks, API tokens; AI: the in-app assistant and AI assistants (MCP); Administration: users, members, single sign-on).
- **Wide screens** (1024 px and up) show a section list beside the section, with the current one marked. **Phones and tablets** show the list on the overview and a back link on each section page. Focus moves to the section heading on navigation.
- **Administration** appears only to the owner and admins, exactly the people who see those panels today; owner-only panels stay owner-only.
- On a **demo instance**, each section shows what still works and the existing "disabled on this demo instance" note for what it refuses; a section whose content is entirely refused shows only the note.
- Help links keep every `settings/...` screen id. The user guide and UI strings that name a place in Settings say the new path (for example "Settings → AI → AI assistants").

## Out of scope

- Changing, adding or removing any individual setting, its storage, API or permissions.
- Search across settings, or a settings command palette.
- Moving Import out of its own screen.
- Any API, op schema or migration change. The only server change is the address the single sign-on link flow returns to (`/settings/account`, where Linked accounts now lives).

## ROADMAP

No roadmap row: a usability improvement of the existing Settings screen (`web-app`), requested by the product owner.

## Impact

- **Specs:** new capability `settings-navigation`; `web-app` (Settings requirement modified).
- **Code:** `web/src/app/router.ts` (section routes), `web/src/app/SettingsView.tsx` (overview, section pages, navigation), new `web/src/app/settingsSections.ts` (section list and metadata); a few UI and server strings that name a Settings path; `internal/httpapi/oidc.go` (link flow returns to `/settings/account`); tests.
- **Docs:** `docs/settings.md` rewritten by section, "Settings → …" paths across `docs/` and `README.md`; regenerated docs site and in-app help; `scripts/e2e-layout.mjs` and `scripts/docs-screenshots.mjs` visit the section pages.
- Nothing **BREAKING**: no new environment variable, no op log change, no new dependency.
