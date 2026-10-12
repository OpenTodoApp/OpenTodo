# Design: settings sections

## Context

`web/src/app/SettingsView.tsx` renders every Settings panel in one column at `/settings`: about 25 panels, each a self-contained component with its own heading, Help link (`HelpHeading screen="settings/..."`), data loading and offline handling. Visibility rules live in two places: `SettingsView` (demo mode hides account and server panels behind one note; `user.role === 'owner'` gates SSO and backups) and the panels themselves (`AdministrationSections` returns nothing for members, `LinkedAccountsPanel`, `SecurityPanel` and `BackupsPanel` hide when unavailable). The router (`web/src/app/router.ts`) is a tiny history-based parser; `/settings/import` is already a separate route for the import screen.

## Goals / Non-goals

Goals: shorter pages that are easy to scan, stable addresses for each group, the same behaviour for every individual setting, and accessible navigation on phones and desktops. Non-goals: new settings, search, server changes, moving Import.

## Decisions

### D1. Sections and what goes where

| Section | Route | Panels (component) |
|---|---|---|
| Account | `/settings/account` | profile line; Password (`PasswordSection`); Two-factor (`TwoFactorPanel`, incl. the owner's policy); Security / passkeys (`SecurityPanel`); Recent activity and, for the owner, the audit log (`SecuritySettings`); Linked accounts (`LinkedAccountsPanel`); End-to-end encryption (`EncryptionPanel`); Session / sign out |
| General | `/settings/general` | Calendar (`CalendarSettingsSection`); Start view; Keyboard (Vim); Quick add (`QuickAddSettingsSection`); Voice capture (`VoiceSettingsSection`); Projects (auto-archive and archived projects) |
| Notifications | `/settings/notifications` | `NotificationsSettings` |
| Data | `/settings/data` | Your data (export, import link, sync status); Backups (`BackupsPanel`, owner only) |
| Capture | `/settings/capture` | Capture (bookmarklet, extension pointer); Email to task (`EmailInboxPanel`) |
| Integrations | `/settings/integrations` | Calendar apps (`CaldavPanel`); Webhooks (`WebhooksPanel`); API tokens (`TokensSection`) |
| AI | `/settings/ai` | Assistant (`AssistantSettings`, lazy chunk); AI assistants (`AssistantsPanel`) |
| Administration | `/settings/admin` | Users and Members (`AdministrationSections`); Single sign-on (`SsoPanel`, owner only) |

The activity and audit panels (`SecuritySettings`) go to **Account**, not Data: "Recent activity" lists the account's own sign-ins and token changes and sat right under the passkeys panel, which it extends; the owner's audit log is security information of the same kind. Keeping the component whole avoids splitting one panel across two pages. Notifications stays a section of its own: it is one panel today but is the one people look for most, and reminders, mentions and push will grow there.

The section list, labels, one-line descriptions, which roles see a section and which features the demo refuses in it live in one table, `web/src/app/settingsSections.ts`, so the overview, the navigation, the router and the tests share it.

### D2. Routes

`Route` gains an optional `section` on `{ view: 'settings' }`. `parseRoute('/settings/<id>')` returns the section for a known id, `{ view: 'import' }` for `import` (unchanged), and the overview for anything else; `routePath` writes `/settings` or `/settings/<id>`. A section the viewer's role does not see (Administration for a member) also renders the overview; the address is left as it is, so the router stays free of user state. Browser back/forward work with no extra code because every section is a history entry.

### D3. Overview and layout

- **Overview (`/settings`), all widths**: `h1` "Settings", the profile line and "Help and guides" link, then a list of section links (each a full-width row ≥ 44 px with the section name and a one-line description), then the AGPL / no-telemetry footer. The wide-screen overview is this short list rather than the first section: it keeps one meaning for `/settings` at every width, tells a newcomer what exists, and avoids loading Account panels (passkeys, two-factor, activity requests) for someone heading elsewhere.
- **Section page, from `md` (768 px)**: a two-column layout, a `nav aria-label="Settings sections"` list on the left (overview link plus every visible section, `aria-current="page"` on the current one) and the section content on the right.
- **Section page, below `md`**: no side list; the page starts with a "← Settings" back link to the overview.
- Headings: the section name is the page's only `h1`; panels keep their `h2` (via `HelpHeading`) and `h3`, so the outline is unchanged inside a section. On every Settings navigation focus moves to the `h1` (`tabIndex={-1}`), so screen reader and keyboard users land on the new content; the side list and back link are plain links and keep working with Tab and Enter.

### D4. Roles

Panels keep their own checks. `settingsSections.ts` adds one rule: Administration is visible when `isAdministrator(user)` (owner or admin), the same test `AdministrationSections` already applies; single sign-on and backups keep the `user.role === 'owner'` test at their call sites. No role sees a panel it did not see before.

### D5. Demo instance

Before, the demo replaced the account and server panels with one "Demo instance" note listing every refused feature. Now each section lists its own refused features (`demo` in the section table) and shows the same note text (`DEMO_RESTRICTED_NOTE` wording, `data-testid="demo-restricted"`) naming them, in place of the panels. Account still shows the profile, recent activity and sign out; General is unaffected; Data keeps the export with Import disabled and its note; Capture keeps the bookmarklet and names email to task. Notifications, Integrations, AI and Administration are entirely refused and show only the note. `DEMO_RESTRICTED_FEATURES` stays exported as the full list (union of the section lists plus import and sharing changes).

### D6. Token list between AI and Integrations

`AssistantsPanel` can create an MCP token; before, it bumped a `reloadKey` so `TokensSection` further down the page refreshed. The two are now on different pages, and `TokensSection` loads its list when it mounts, which happens every time the Integrations section opens, so a token created in AI appears there with no shared state. The `reloadKey` prop stays on `TokensSection` (harmless, used by tests).

### D7. Help and wording

Every `HelpHeading screen="settings/..."` id stays, so the docs check (`screens` front matter) and contextual help are unchanged. `docs/settings.md` is reorganised by section, with the `screens` anchors pointing at the new headings. "Settings → X" in the guides, README and UI/server messages becomes "Settings → Section → X" where the path changed.

## Data model impact

None. No op fields, API routes, migrations or stored preferences change. The section is part of the URL only.

## Size impact

No new dependency. Main chunk `index-*.js` before: 907.72 kB (gzip 266.35 kB); after: see the task 4.3 note below. CSS before 71.68 kB (gzip 12.46 kB). No effect on container image size or server memory.

## Risks / Trade-offs

- People used to scrolling one page now take one more tap. Mitigated by the descriptions on the overview, the side list on wide screens and unchanged Help links.
- Links or bookmarks to `/settings` still work (overview); there were no older section anchors to preserve.
- The layout check and docs screenshots must visit section pages; both scripts are updated in this change.
