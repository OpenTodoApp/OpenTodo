# Spec Delta

## MODIFIED Requirements

### Requirement: Panel cards and rows
Each Settings section SHALL appear as a card with the fixed anatomy of the design system: heading, one line of description, rows. Individual settings SHALL be rows with label and description on one side and the control on the other, state shown as a badge beside the label. A card's or row's description SHALL be one sentence of at most 90 characters in English (the "Settings copy" requirement); a card whose guide section says more SHALL end its line with a "Learn more" link that opens contextual help at the card's screen id beside the page, without a reload and without losing what the user entered. Below 640 px each row SHALL stack the control under its label. No row or card SHALL scroll sideways at 320 px wide. Native select controls SHALL be styled as the design-system select.

#### Scenario: Wide row layout
- **WHEN** a user opens `/settings/general` on a 1200 px wide screen
- **THEN** the start view setting shows its label and description on the left and its control on the right, inside the General card area, separated from neighbouring cards by visible space

#### Scenario: Narrow row layout
- **WHEN** the same section is opened on a 320 px wide screen
- **THEN** every control sits below its label and the page has no horizontal scroll

#### Scenario: One line per card
- **WHEN** a user opens `/settings/account` on a 1200 px wide screen
- **THEN** the Two-factor authentication card reads "A six-digit code from an authenticator app after your password. Learn more" on one line under its heading, and the recovery-code and passkey explanations are in the guide section Learn more opens, not on the card

#### Scenario: Learn more keeps the page
- **WHEN** a user has typed a new webhook address in the Webhooks card and activates its Learn more link
- **THEN** the webhooks guide opens beside the section, the typed address is still in the field, and closing Help returns focus to the Learn more link

#### Scenario: Learn more offline
- **WHEN** the installed app is offline and the user activates Learn more on the Backups card
- **THEN** the guide section opens from the precached Help bundle

### Requirement: Demo instance sections
On a demo instance every section SHALL be listed and every row shown; rows the demo refuses SHALL have their controls disabled with one demo note at the top of the page naming them. The note SHALL be one line, "Demo instance: {features} are disabled here.", followed by a Learn more link that opens the demo part of the getting-started guide, which says that the sandbox is private, deleted after 2 hours of inactivity and every night, and that running your own server takes one container. No section SHALL be hidden or replaced by a note.

#### Scenario: Integrations on the demo
- **WHEN** a sandbox opens `/settings/integrations`
- **THEN** the page starts with the demo note naming calendar apps, webhooks and API tokens, and their rows are visible with disabled controls

#### Scenario: General on the demo
- **WHEN** a sandbox opens `/settings/general` and then `/settings/capture`
- **THEN** start view, calendar and keyboard settings work as on any server, and Capture shows quick add, voice and the bookmarklet working with email to task disabled under the note

#### Scenario: Security on the demo
- **WHEN** a sandbox opens `/settings/account`
- **THEN** the page starts with the demo note naming password and two-factor authentication, passkeys, linked accounts and encryption, and those rows are visible with disabled controls while profile and sessions work

#### Scenario: Demo note is one line
- **WHEN** a sandbox opens `/settings/account` on a 1200 px wide screen
- **THEN** the note reads "Demo instance: password and two-factor authentication, passkeys, linked accounts and end-to-end encryption are disabled here. Learn more", the first card starts within two lines of the page header, and Learn more opens the "Try the demo" section of the getting-started guide beside the page

## ADDED Requirements

### Requirement: Settings copy
Every settings card, row, option and notice SHALL have a label of at most 4 words and at most one line of description: one sentence of at most 90 characters in English for a card, a row or a notice, and at most 60 characters for an option in a choice card. Text beyond the line SHALL live in the guide section the card's Learn more link opens, and a safety warning SHALL keep a one-line pointer on the card. Confirmation dialogs are not descriptions and keep their full consequence text.

#### Scenario: Choice card options
- **WHEN** a user opens the How you work card
- **THEN** Lists only, Companion and Open Loops first each show their label and one line of at most 60 characters, and the two-sentence explanations are in the method guide that "Learn the method" opens

#### Scenario: Safety warning kept as a pointer
- **WHEN** a user opens the Email to task card
- **THEN** the address row still says on one line that anyone who knows the address can add tasks and that a leaked address should be replaced, and the hourly limit and what happens to the old address are in the email guide

#### Scenario: Notice on one line
- **WHEN** a user without outgoing email on their server opens Notifications
- **THEN** the Weekly digest card shows one line saying it needs outgoing email set by the server owner under Settings → Server, with Learn more opening the digest section of the statistics guide

#### Scenario: Owner-only pointer
- **WHEN** a member opens the Calendar apps (CalDAV) card on a server where it is off
- **THEN** the card's status row reads "Ask the server owner to turn it on." and nothing longer

#### Scenario: Dialogs keep their consequence
- **WHEN** a user activates Sign out everywhere
- **THEN** the confirmation dialog still names every consequence in full (every device signed out, remembered browsers forgotten, tokens and app passwords revoked, unsynced changes on other devices lost), while the row above it reads one line

### Requirement: Settings copy lint
The project's checks SHALL fail when an English settings description exceeds its limit, when a label exceeds 4 words, or when a settings card or row is given a literal description instead of an entry of the settings copy table, naming the entry and its length. The lint SHALL run in the web test suite and SHALL NOT replace the translation checks: the entries of the table are ordinary source messages, so the catalog check still reports a missing, stale or malformed translation.

#### Scenario: Description too long
- **WHEN** a change sets a card description of 112 characters in the table
- **THEN** `npm test` fails naming the card and "112 of 90"

#### Scenario: Literal bypasses the table
- **WHEN** a change passes a literal sentence as a card's description in a panel instead of a table entry
- **THEN** `npm test` fails naming the file and line

#### Scenario: Translation missing
- **WHEN** a change adds a card to the table without its Italian entry
- **THEN** `make i18n-check` fails naming the message and the language, and the copy lint passes

#### Scenario: Long translation
- **WHEN** a German entry for a card description is 140 characters
- **THEN** `npm test` fails naming the entry and "140 of 120", since a translation may be at most a third longer than its English line

### Requirement: Settings copy inventory
Every settings card SHALL show the one-line English description listed in the scenarios below in place of its text at the time of this change (length in characters in the "Before" column). Rows and notices over the limit are listed with their cards. Cards not listed keep their text, which is already within the limit. The five other shipped languages SHALL carry the same meaning within 120 characters.

#### Scenario: Account cards
- **WHEN** a user opens `/settings/account`
- **THEN** each card reads as follows:

| Card | Before | After |
| --- | --- | --- |
| Profile | no description | no description |
| How you work | 129 | How much the app shows its method, Open Loops. Synced; never changes a task. · Learn the method (the existing link) |
| How you work › Lists only | 52 | OpenTodo as a plain task app, with no method words. |
| How you work › Companion | 88 | Your sidebar as it is; screens name the move they serve. |
| How you work › Open Loops first | 103 | The Loop home first, a sidebar by the Places, a daily check. |
| Session | 40 | This device is signed in to your server. |
| Session › Sign out of this device | 100 | Clears your tasks from this device after uploading unsynced changes. |
| Session › Sign out everywhere | 102 | Every device, plus your API tokens and app passwords. |
| Password | 107 | Changing it signs out your other sessions; this one stays signed in. · Learn more |
| Two-factor authentication | 196 | A six-digit code from an authenticator app after your password. · Learn more |
| Two-factor authentication › Turn off | 176 | Required by the server owner for your account, so it cannot be turned off. / Sign-in needs only your password; remembered browsers are forgotten. |
| Passkeys | 173 | Sign in with your fingerprint, face or PIN instead of your password. · Learn more |
| Linked accounts | 195 | Sign in with {name} instead of a password. / Single sign-on is off on this server; your links are kept. · Learn more |
| End-to-end encryption | 133 | Your task text is encrypted on your devices before it syncs. · Learn more |
| Recent activity | 160 | Sign-ins and token changes from the last 90 days; revoke tokens if one is not yours. · Learn more |

#### Scenario: Appearance and General cards
- **WHEN** a user opens `/settings/appearance` and `/settings/general`
- **THEN** each card reads as follows:

| Card | Before | After |
| --- | --- | --- |
| Appearance | 137 | Light or dark, colour and row density, on all your devices. · Learn more |
| Appearance › Density | 110 | Compact tightens rows, headers and the sidebar; touch targets stay full size. |
| Sidebar | 296 | Pick which More destinations sit next to Inbox, Today, Upcoming and Calendar. / Open Loops first arranges the sidebar; these choices apply in the other modes. · Learn more |
| Language | 75 | The language of the app on all your devices. Tasks are not translated. · Learn more |
| Start view | 89 | The view this device opens on. Not synced. · Learn more |
| Date and time | 97 | How dates and times look and where weeks start, on all your devices. · Learn more |
| Calendar | 140 (with two key badges) | Working hours and day length for Day and Week, on this device. · Learn more |
| Keyboard | 59 | Every action has a shortcut; press ? to list them. · Learn more |
| Keyboard › Show shortcut hints | 136 | Print the keys in the app itself, not only in tooltips. This device only. |

#### Scenario: Notifications, Capture and About cards
- **WHEN** a user opens `/settings/notifications`, `/settings/capture` and `/settings/about`
- **THEN** each card reads as follows:

| Card | Before | After |
| --- | --- | --- |
| Notifications | 147 | Get reminders while the app is closed. Each device decides for itself. · Learn more |
| Notifications › Include task titles | 215 | Off: the push carries only encrypted ids and this device adds the title. |
| Weekly digest | 149 | An email on your review day with last week's numbers and what is due. · Learn more |
| Quick add | 63 | How quick add reads what you type, on this device. · Learn more |
| Voice capture | 63 | Speak a task instead of typing it, on this device. · Learn more |
| Capture | 56 | Save pages and selected text from your browser as tasks. · Learn more |
| Email to task | 175 | Send any email to your personal address and it becomes an Inbox task. · Learn more |
| Email to task › Your address | 152 | Keep it private: anyone who knows it can add tasks. If it leaks, make a new one. |
| About OpenTodo | 142 | OpenTodo {version} · free and open source · no tracking, no telemetry. |
| Support OpenTodo | 111 | No paid plan: if it saves you a subscription, a coffee helps. |

#### Scenario: Integrations and Data cards
- **WHEN** a user opens `/settings/integrations` and `/settings/data`
- **THEN** each card reads as follows:

| Card | Before | After |
| --- | --- | --- |
| Calendar apps (CalDAV) | 124 | Sync your tasks with calendar and reminder apps; each project is a list. · Learn more |
| Calendar feeds | 119 | Other calendars in Day and Week, and your tasks in a calendar app. · Learn more |
| Calendar feeds › Calendar feeds on this server | 244 | People can subscribe to calendar addresses and get a private feed of their tasks. |
| Webhooks | 134 | Notify any HTTP endpoint when tasks and projects change. Requests are signed. · Learn more |
| Webhooks › Allow private network targets | 158 | For receivers on your LAN or this machine. Leave off on a public server. |
| API tokens | 67 | For scripts, the ot command and AI assistants. Sent as {header}. · Learn more |
| Assistant | 284 | Plan and change your tasks by talking. Every change is proposed for review. · Learn more |
| Assistant › Apply small changes without review | 153 | Up to 3 existing tasks: done, dates, priority or labels. Undo always appears. |
| AI assistants (MCP) | 174 | Let an MCP assistant read your tasks with a token; read-only by default. · Learn more |
| AI assistants › Allow AI assistants (MCP endpoint) | 166 | Every account can connect an assistant with its own token. / The endpoint answers “not found” until turned on. |
| AI assistants › AI assistants may make changes | 195 | People can let an assistant with a dedicated token change their tasks. / Assistants can only read, whatever people choose. |
| Your data | 63 | Everything you see is stored on this device and on your server. · Learn more |
| Your data › Export | 115 | Everything you can see as one JSON file, including the Trash. |
| Projects | 60 | Deleted items stay in the Trash until restored or purged. · Learn more |

#### Scenario: People and Server cards
- **WHEN** the owner opens `/settings/people` and `/settings/server`
- **THEN** each card reads as follows:

| Card | Before | After |
| --- | --- | --- |
| Users | 212 | Everyone with an account; you manage every account and choose admins. / Everyone with an account; admins can deactivate, reset and delete members. · Learn more |
| Members | 78 | Invite someone with a single-use link; sign-up stays closed. · Learn more |
| Two-factor policy | 159 | Who must use two-factor authentication. API tokens are never affected. · Learn more |
| Single sign-on | 170 | Sign in with an OpenID Connect provider you run; only that issuer is contacted. · Learn more |
| Project invite links | 157 | Whether project links can also create accounts for new people. · Learn more |
| Project invite links › Members can invite new people | 154 | Off: members' links only work for people who already have an account. |
| Backups | 170 | Scheduled copies of the whole server to a folder, S3 or WebDAV, restored here. · Learn more |
| Attachments | 116 | Files on tasks and comments, stored under the data directory and backed up. · Learn more |
| Outgoing email | 117 | Lets this server mail password resets, confirmations and invitations. · Learn more |
| Download your data | 205 | The whole server as one archive, to restore into your own OpenTodo server. · Learn more |
| Audit log | 106 | Sign-ins, tokens, invitations, exports and setting changes. Never task content. · Learn more |

#### Scenario: Notices over the limit
- **WHEN** a settings page shows one of the fifteen notices that were longer than one line (the demo note, the offline notes of the server-side cards, the weekly digest's email and encryption notes, the calendar feeds encryption note, the plain-http webhook warning, the language-load failure, the two push notes, the two outgoing-email transport warnings, the assistant's encryption note)
- **THEN** it reads as one line of at most 90 characters with the same meaning, and the warnings about unencrypted transport keep saying so on the line
