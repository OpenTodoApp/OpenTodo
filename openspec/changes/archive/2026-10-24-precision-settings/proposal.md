# Proposal

## Why

This is part 12 of the "Precision" redesign, after `precision-tokens`, `precision-shell` and `precision-rows`. The round-2 mock-up `settings.png` and `system.md` "Settings" describe a Settings screen this app does not have yet.

- **No cards inside cards.** Each page has one raised primary card and flat sections around it, and the section list is a card of cards. Inside the new inset surface this stacks three surfaces. The mock-up instead uses one flat page: a 22 px title, a lead line, and groups of hairline rows.
- **The section list is a tool, not a page.** Beside a section, the column repeats the profile card and the free-software footer, and its rows are 44 px pills with an accent fill. The mock-up has a 228 px navigation pane on its own hairline: the search field with its key, the group labels, and 30 px rows that use the neutral selected surface like the sidebar.
- **The header is a breadcrumb.** Settings sat outside the compact header that `precision-shell` gave every other tool page. Its title stood beside the navigation, and the sidebar toggle came after the column.
- **Colour only for state, quietly.** Every On/Off is a soft coloured pill. The mock-up shows state as a dot and a word ("Working", "Paused after 3 failures").
- **Controls at the density of the rows.** The switch is 40 × 24 px and selects are 40 px native boxes. The mock-up uses a 32 × 18 px switch and 32 px selects with a drawn chevron.

There is also one leftover from an earlier change. Several places still send people to "Settings → AI → AI assistants", a section that no longer exists: the README, two error messages from the server, the CLI and the Claude plugin's CLI skill. The section is now Settings → Integrations.

## What Changes

- **The settings layout from 1024 px:**
  - The compact page header shows a breadcrumb ("Settings › Notifications") with the sidebar toggle and Help.
  - Under the header sit a 228 px navigation pane with a hairline on its right, and the page.
- **The navigation pane:**
  - The search field shows its `/` key.
  - The group labels are in normal case.
  - Each section is a 30 px row with icon and name; the current one uses the selected surface.
  - There is no profile card, no descriptions and no footer in the pane. The phone list below 1024 px keeps all three.
- **One flat page:**
  - From 1024 px, a 22 px page title and the section's one-line description as the lead line.
  - Below it, every section is flat: a small label heading, its line, and rows divided by hairlines.
  - The primary card tier is removed and no section is drawn as a card. Card icons leave the page headings and stay in the search results.
- **Controls:**
  - The switch becomes 32 × 18 px.
  - Every native select gets the design-system select: no native arrow, a drawn chevron, and 32 px inside a settings row.
  - Buttons in a settings row use the small size.
  - A new `StatusIndicator` primitive (a dot plus a word, five tones) replaces the coloured state badges in Settings. Categorical labels (a role, a token scope, Default, This device) stay badges.
- **The stale path:** "Settings → AI → …" becomes "Settings → Integrations → …" in the README, the server's error messages, the CLI, `skills/opentodo-cli` and the plugin copy of that skill.

Out of scope:
- **The order and grouping of sections.** The mock-up regroups them (You · App · Server, with Keyboard and Security as sections of their own). This change keeps the eleven sections, their addresses and their groups. The question is in the review notes.
- **The phone layout below 768 px.** It keeps the list-then-page flow; `precision-phone` restyles it.
- **What any setting does.** Every row keeps its behaviour, its copy entry and its Help link.

This change advances ROADMAP "Next: Design refresh", item 3 (settings in smaller sections), as part of Precision.

No op, API, data or environment change. Not breaking.

## Capabilities

### Modified Capabilities

- **`settings-navigation`:**
  - "Settings overview": the pane without profile, descriptions or footer from 1024 px;
  - "Section page layout": the breadcrumb header, the pane, the title and lead line;
  - "Panel cards and rows": flat sections, status dots, the select;
  - "Card icons": only in search results;
  - "Card tiers": one flat page, no card surfaces.
- **`design-system`:**
  - "Form controls": the compact switch and the select's chevron;
  - "Settings section and row patterns": flat sections, a status dot in place of the badge;
  - new "Status dot".

## Impact

- **Settings screen and controls:** `web/src/app/SettingsView.tsx`, `web/src/ui/patterns/SettingsSection.tsx`, `web/src/ui/Switch.tsx`, the new `web/src/ui/StatusIndicator.tsx`, `web/src/index.css`.
- **Settings panels that show state:** Backups, Assistant, single sign-on, notification channels, Notifications, Two-factor, Relay, Issues, Calendar feeds, CalDAV, Outgoing email, Email inbox, Encryption, Digest, AI assistants, Webhooks, Users and Members.
- **Tests and catalogs:** the settings tests, stories and visual baselines; the five catalogs.
- **The stale path:** README, `internal/agenttools`, `internal/assistant`, `internal/cli`, `skills/opentodo-cli/SKILL.md` and its plugin copy.
