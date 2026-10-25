# Proposal

## Why

The Settings structure is good: four groups (You, App, Data, Server), one page per section, search with `/`. A few pages mix unrelated things and run very long, though. Measured as the owner of a local server with every owner feature on (`scripts/ux-audit/settings-heights.mjs`):

- Integrations is 3,895 px on a 1280×800 screen (4.9 screens) and 5,654 px on a 390×844 phone (6.7 screens).
- Server is 3,760 px (4.7 screens) and 5,028 px (6.0 screens).
- General is 2,448 px (3.1 screens) and 3,955 px (4.7 screens).
- Account is 2,035 px (2.5 screens) and 2,960 px (3.5 screens).
- Capture, People, Appearance and Notifications are 1.5 to 2.4 screens.

On a long page people scroll past what they came for, a search result lands in the middle of a wall of cards, and a phone shows a webhook editor below the CalDAV app passwords.

## What Changes

- **Sub-pages.** A long section becomes a short overview: one row per area with its icon, its name and its state in a word ("Webhooks · 2", "Calendar feeds · Off"), like the settings of a phone. Each row opens a sub-page with its own address, `/settings/<section>/<page>`:
  - Account → Profile, Security (password, two-factor, passkeys, linked accounts, sign out of this device), Recent activity, End-to-end encryption.
  - Appearance → Theme and density, Sidebar.
  - Notifications → Push notifications, Delivery channels, Weekly digest.
  - Capture → Quick add, Voice capture, Bookmarklet and extension, Email to task.
  - Integrations → Calendar apps (CalDAV), Calendar feeds, Issues, Webhooks, API tokens, Assistant, AI assistants (MCP).
  - People → Users and invitations, Access policies, Single sign-on.
  - Server → Backups, Attachments, Outgoing email, Branding, Maps, Automations, Speech to text, Audit log; on a hosted service Download your data, Branding, Maps, Automations and Audit log.
  - A section whose viewer sees only one of its pages (an admin's People) stays one page.
- **General splits in two.** A new section, **Language and region** (`/settings/language`), holds the language, date and time formats, the first day of the week, the start of the day and the calendar grid. General keeps the start view, the briefing, the keyboard, the focus timer and maps.
- **Search lands on the setting.** A result from the settings search or the command palette opens the sub-page that holds it, scrolls to the setting, focuses it and tints it for a moment.
- **Navigation.** From 1024 px the breadcrumb reads "Settings › Integrations › Webhooks" and the pane marks Integrations. Below 1024 px each level is its own page: the list, the overview, the sub-page, each with a back action to the level above. Going back to an overview puts focus on the row of the page just left.
- **Old addresses keep working.** `/settings/security`, `/settings/ai`, `/settings/backups` and the other earlier ids open the sub-page that now holds their content. An address with an old anchor (`/settings/integrations#webhooks`, `/settings/general#date-time-heading`) opens the sub-page or section that holds it. In-app links, the server's single sign-on return address, the Android notification and the docs point at the new addresses.
- **A measuring script** in `scripts/ux-audit/settings-heights.mjs` prints the height of every settings page at 1280×800 and 390×844, for the before-and-after table in the design.

Out of scope:
- **What any setting does.** Every card keeps its behaviour, copy entry, Help link and role checks; this change moves cards between pages.
- **New card designs.** The overview rows use the flat hairline rows of a settings card (Precision); no new surfaces.
- **Workspaces, Data and About.** They already fit within about 1.5 screens and stay one page.

This advances the "Settings regrouped into smaller sections" item of ROADMAP.md (settings-redesign) and the Precision follow-ups. No op-log, API or environment change; not **BREAKING**.
