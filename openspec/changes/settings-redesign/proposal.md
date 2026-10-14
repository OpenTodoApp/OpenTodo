# Proposal: settings-redesign

## Why

Settings works, but it reads as a stack of forms. Account alone has eight panels (profile, password, two-factor, passkeys, recent activity and audit log, linked accounts, encryption, session) separated only by a gap. General packs six unrelated preferences together. Every panel hand-builds its markup, so the page has no visual rhythm and no hierarchy, and important state (is two-factor on? how many recovery codes are left? which passkey was used last?) is buried in small text next to always-visible forms. User feedback: "too compact", "no information architecture", "too many subsections". Now that `design-language` and `ui-primitives` provide tokens, cards and setting rows, Settings is the first screen to rebuild with them.

## What Changes

- **New information architecture.** The eight sections become fourteen smaller ones in four labelled groups:
  - **You:** Account (profile, sign out), Security (password, two-factor, passkeys, linked accounts), Encryption, Activity (recent sign-ins and, for the owner, the audit log).
  - **App:** Preferences (start view, calendar, keyboard, and date and time once `date-time-preferences` lands), Notifications, Capture (quick add, voice, bookmarklet and extension, email to task), Projects (auto-archive, archived projects).
  - **Data and connections:** Data (export, import, sync status), Integrations, AI.
  - **Server** (owner and admins only): Administration (users, invitations, members), Backups (owner only), Access policies (owner only: two-factor policy, single sign-on, project invite links).
- **Old addresses keep working.** `/settings/general` redirects to `/settings/preferences` in place. The ids `account`, `data`, `capture`, `integrations`, `ai`, `admin` and `notifications` stay. The single sign-on link flow returns to `/settings/security`, where Linked accounts now lives. Help screen ids (`settings/...`) do not change.
- **Grouped navigation with icons.** The side list (≥1024 px) and the overview list show the four groups with headings and one Lucide icon per section. The overview opens with a profile card (avatar initials, name, email, role badge).
- **One panel grammar.** Every panel becomes a `SettingsSection` card: a heading with its Help link, a one-line description, then `SettingRow`s (label and description on the left, control on the right, stacked below 640 px). There is clear vertical space between cards.
- **State first, forms behind actions.** Each card leads with its current state, using only data the server already exposes. Examples: "Two-factor on · 7 of 10 recovery codes left"; passkeys listed with last use; "Push off on this device"; last backup run and its result. Multi-step forms (change password, enrol two-factor, new token, new webhook, new app password, new invitation) open from a button in a dialog or an inline expansion instead of sitting open on the page.
- **Lists and empty states.** Passkeys, remembered browsers, API tokens, app passwords, webhooks, linked identities, invitations, users, backup runs and activity events share one list-row pattern (icon, primary label, secondary metadata, trailing actions menu). They also share one empty state (what this is, why you'd want it, a primary action).
- **Danger zone.** Destructive actions (disable two-factor, sign out, delete user, reset encryption) sit at the bottom of their card, in danger styling, behind a confirmation dialog in place of `window.confirm`.
- Roles, demo notes and offline behaviour stay the same; only the section that holds a panel can change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `settings-navigation`: sections, routes, groups and the legacy redirect; the overview with its profile card and grouped list; the section page with grouped side navigation; role and demo tables recomputed for the new sections; new requirements for the panel layout (cards and rows), state-first summaries, forms behind actions, shared list rows and empty states, and confirmation dialogs for destructive actions.
- `web-app`: the "Settings" requirement's sign-out scenario now confirms in a dialog first (and gains a cancel scenario); what signing out does is unchanged.

## Impact

- **Web:** `web/src/app/settingsSections.ts`, `router.ts` (new ids and the `general` alias), `SettingsView.tsx` (overview, grouped nav, `SectionContent` split), and every settings panel: `PasswordSection`, `TwoFactorPanel`, `SecurityPanel`, `ActivityPanel`, `AuditPanel`, `SsoPanel`, `EncryptionPanel`, `CalendarSettings`, `QuickAddSettings`, `VoiceSettings`, `ArchivedProjects`, `NotificationsSettings`, `BackupsPanel`, `EmailInboxPanel`, `CaldavPanel`, `WebhooksPanel`, `TokensSection`, `AssistantSettings`, `AssistantsPanel`, `UsersPanel`, `MembersPanel`, `InviteLinksSection`, `ProjectInvitePolicyPanel`, `ConfigWarnings`, `ImportScreen` (back link). Their pure `*View` components get Storybook stories.
- **Server:** `internal/httpapi/oidc.go` sends the link flow back to `/settings/security` instead of `/settings/account` (4 places). There are no new routes, no API shape changes and no data model changes.
- **Docs:** `docs/settings.md` and every "Settings → General/Account/Data/Administration → …" path across `docs/` (about 50 mentions), regenerated `web/src/generated/help.json`, and new screenshots for `scripts/docs-screenshots.mjs`. `scripts/e2e-layout.mjs` covers the new section list.
- **Dependencies:** none beyond those added by `design-language` and `ui-primitives`. Bundle impact is expected to be neutral or smaller, since repeated hand-rolled markup collapses into shared primitives.
- **Depends on:** `design-language` (tokens) and `ui-primitives` (`Icon`, `Button`, `Card`, `Switch`, `Badge`, `MenuItem`, `SettingsSection`, `SettingRow`, `EmptyState`, overlay `Dialog`). It integrates with `date-time-preferences` (its panel lands in Preferences) and `push-test-delivery` / `backup-restore-web` (their panels adopt this grammar) whichever lands first, without depending on them.
- **Not breaking:** no new environment variables and no op-log change.

## Out of scope

- Behaviour of any setting. Every control keeps its effect, storage (per-device or server) and permissions.
- An "active sessions" list with per-session revoke. The server exposes no session list, so the Account card shows only "Sign out of this device". It is noted as a follow-up.
- "Password last changed" in the Security card. `/api/v1/me` does not expose it; an additive field is a possible follow-up.
- New settings (accent themes, density): future changes.
- The import screen layout (`/settings/import`) beyond its back link.

## Roadmap

ROADMAP.md lists the original roadmap as complete, and no existing item covers this. This change is part of the UI redesign series that starts with `design-language`, which adds the series to ROADMAP.md. This change advances its "Settings" entry.
