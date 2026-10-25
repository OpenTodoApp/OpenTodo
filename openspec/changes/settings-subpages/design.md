# Design

## Context

Settings has twelve sections in four groups (`web/src/app/settingsSections.ts`), one page each, a search index (`settingsIndex.ts`) shared with the command palette, and the Precision layout: a 228 px navigation pane and a flat page from 1024 px, the list then the page below it. Several pages hold unrelated cards one after another and run three to six screens long (table below). This change adds one level: a long section becomes an overview of sub-pages.

## Decisions

### D1. Sub-pages are data in the section table

`SettingsSection.pages` lists `{id, label, icon, visible?, demo?, help?, anchors?}`. One table drives the overview rows, the routes, the demo note, the Help link and the search. `visiblePages(user, section)` filters by role and hosted mode; a section whose viewer sees one page only (an admin's People) has no overview and renders that page as itself, so nobody gets a list of one row. The cards of each page live in `settingsPages.tsx` (`PAGES['<section>/<page>']`), which keeps `SettingsView.tsx` to the layout.

The route is `{view: 'settings', section, page?}` at `/settings/<section>/<page>`. The router checks only the shape of a page id; the screen checks it against the table and replaces an unknown or hidden one with the overview.

Split per section (owner, every feature on):

| Section | Pages |
|---|---|
| Account | Profile (profile, how you work), Security (password, two-factor, passkeys, linked accounts, sign out), Recent activity, End-to-end encryption |
| Appearance | Theme and density, Sidebar |
| General | Start view and briefing, Keyboard, Focus timer, Maps |
| Language and region (new) | Language, Date and time, Calendar grid |
| Notifications | Push notifications, Delivery channels, Weekly digest |
| Capture | Quick add, Voice capture, Bookmarklet and extension, Email to task |
| Integrations | Calendar apps (CalDAV), Calendar feeds, Issues, Webhooks, API tokens, Assistant, AI assistants (MCP) |
| People | Users and invitations, Access policies (two-factor policy, project invite links), Single sign-on |
| Server | Backups, Attachments, Outgoing email, Branding, Maps, Automations, Speech to text, Audit log; hosted: Download your data, Branding, Maps, Automations, Audit log |

Workspaces, About and Data stay one page; they fit.

Decisions worth the owner's look:
- **Recent activity is its own page**, not part of Security: it is a log that grows, and Security already fills a phone screen with the sign-out row.
- **Sign out of this device sits on Security** (the owner's list put "sessions" there), below the disabled group on a demo so it keeps working.
- **General became an overview too.** After moving the language, date and calendar cards out, General was still 1.9 screens on a laptop and 3 on a phone because of the Focus timer card.
- **Language and region is an overview of three pages** (Language, Date and time, Calendar grid) rather than one page: as one page it was 1.9 phone screens.
- **Maps, Automations and Speech to text are separate Server pages**, each a one-switch page, so their state reads on the overview ("Maps · On").

### D2. The overview row carries the state in a word

`settingsStatus.ts` maps `<section>/<page>` to a loader that asks the server once (`On`/`Off`, a count, `None`, `Two-factor off`, the profile name, the language's own name). Loaders run together under the page's pending gate (`settingsPending`), so the rows appear at once instead of shifting as answers arrive. Offline, refused (403, the demo) or failing loaders show nothing. Pages whose state lives in a hook rather than the server (appearance mode, maps on this device) show no state rather than duplicating that logic.

Rows are the flat hairline rows of a settings card (`divide-y border-y border-soft`), 44 px tall, icon, name, state in `text-meta text-muted`, chevron; inside a `nav` landmark named after the section. No new surface or token.

### D3. Search lands on the setting and tints it

Index entries gain `page`. `entryRoute(user, entry)` resolves the route for the viewer (dropping the page when the section has no overview for them); `openSetting` hands the anchor over out of band and navigates. On arrival the element scrolls into view, takes focus and gets `data-settings-highlight="on"`: the accent-soft background (on its card when the anchor is a card heading), switched off after 1.6 s with a background-colour transition of `--duration-emphasis`. It is a colour change only, so it holds under reduced motion and stays inside the motion budget. Focus waits until the pending gate reveals the page (an invisible element cannot take focus).

### D4. Old addresses and anchors

`LEGACY_SETTINGS_IDS` points the earlier ids at sub-pages (`security` → `account/security`, `ai` → `integrations/assistant`, `backups` → `server/backups`, `access` → `people/access-policies`, `activity` → `account/activity`, `encryption` → `account/encryption`). A hash of an earlier page (`/settings/integrations#webhooks`, `/settings/general#date-time-heading`, `/settings/account#security`) is resolved by `anchorTarget`: a page id, a page's earlier wrapper ids (`anchors`), then the index's anchors, preferring the same section. The address is replaced in place, so Back still leaves Settings. The single sign-on link flow now returns to `/settings/account/security`; the old `/settings/security` still works. In-app links (the two-factor policy pointer, the assistant's encryption hint and set-up link, the Data page's backups link, the email screens, the Android reminder test notification) point at the sub-pages.

### D5. Navigation per width

From 1024 px: the breadcrumb gains the section as a link ("Settings › Integrations › Webhooks"), the pane marks the section with `aria-current="true"` on a sub-page (`"page"` on the section itself), and the page head shows the page's name without a lead line. Below 1024 px every level is a page, like Workspaces' list and detail: the section list, the overview (Back to Settings), the sub-page (Back to the section, also from 768 to 1023 px where the header has its own row; below 768 px the shell's phone bar carries it). Going back to an overview focuses the row of the page just left.

### D6. Measuring

`scripts/ux-audit/settings-heights.mjs` starts a throwaway server with every owner feature preset by environment variables (CalDAV, calendar feeds, maps, private webhook targets, SMTP, speech to text, single sign-on, email to task), seeds the audit's account, turns on issues, channels and automations, then follows the section list and every overview row at 1280×800 and 390×844 and prints the scroll height of each page. A page that fits shows the viewport height (1.0).

Before (0.12.0 plus this branch's first commit, owner, every feature on):

| Page | 1280×800 | 390×844 |
|---|---|---|
| Account | 2,035 px (2.5) | 2,960 px (3.5) |
| Appearance | 1,257 px (1.6) | 1,931 px (2.3) |
| General | 2,448 px (3.1) | 3,955 px (4.7) |
| Notifications | 1,236 px (1.5) | 1,663 px (2.0) |
| Capture | 1,398 px (1.8) | 2,038 px (2.4) |
| About | 845 px (1.1) | 1,244 px (1.5) |
| Integrations | 3,895 px (4.9) | 5,654 px (6.7) |
| Data | 798 px (1.0) | 1,160 px (1.4) |
| People | 1,354 px (1.7) | 1,974 px (2.3) |
| Server | 3,760 px (4.7) | 5,028 px (6.0) |

After: every overview fits one screen (1.0 at both sizes), and every sub-page is within about 1.5 screens (the longest regular ones: Account → Security 1.57 and General → Focus timer 1.59 on a phone, Appearance → Sidebar 1.48, About 1.47), except the exceptions below. The full table is in the pull request.

Accepted exceptions: the **audit log** (1.9 / 2.1 screens with the seeded events) and **recent activity** are lists of records that grow, like a task list; the owner's **Assistant** and **AI assistants (MCP)** pages (1.3–1.5 on a laptop, 1.8 on a phone) are one feature's set-up each (provider form; endpoint, token and client snippet), and splitting them would separate steps that belong together.

## Interface budget

Chrome above the first row is unchanged (one header row; the overview has no tabs or toolbar). No new shortcut; `/` keeps focusing search. One scroll region per page as before. Sidebar destinations unchanged.

## Data model, size and dependencies

No op, field, API route or environment variable. No dependency. The web bundle grows by the page table and the status loaders (a few kilobytes before compression); runtime memory is unchanged. The server changes one redirect address.

## Risks

- A bookmark to an anchor that never existed in the index lands on the section (or its overview), not a page. Every wrapper and card heading id of the earlier pages is covered.
- Status loaders add up to seven requests when an overview opens; they are small reads and run in parallel once per visit.
