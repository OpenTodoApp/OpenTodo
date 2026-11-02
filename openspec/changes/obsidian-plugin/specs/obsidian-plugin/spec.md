## ADDED Requirements

### Requirement: The plugin connects to the user's server only
The OpenTodo plugin for Obsidian SHALL run on Obsidian desktop and mobile and SHALL be configured in its settings tab with a server address and a `full` API token. The address SHALL be `https`, or `http` only for `localhost` and private network addresses after a warning; the plugin SHALL check it by requesting the server's health route and SHALL refuse, naming the minimum version, a server older than the release that accepts the `obsidian` origin kind. Every request SHALL go to that server only, through Obsidian's own request function, and the plugin SHALL include no analytics, crash reporting or other network destination. A `read` or `agent` token SHALL be refused on connect with a message saying a `full` token is needed and why. The token SHALL be stored in Obsidian's per-device storage and SHALL NOT be written to the plugin's settings file inside the vault; "Disconnect" SHALL delete the token, the cached project and label lists and any remembered encryption key from the device.

#### Scenario: Connect
- **WHEN** the user enters `todo.example.com` and a `full` token in the settings tab and picks "Connect"
- **THEN** the tab shows the account's name, the server's version and whether the account is encrypted, and the vault's `.obsidian/plugins/opentodo/data.json` contains no token

#### Scenario: Read token refused
- **WHEN** the user connects with a `read` token
- **THEN** the tab says a `full` token is needed because the plugin writes tasks, and nothing is stored

#### Scenario: Old server
- **WHEN** the server's health route reports a version older than the minimum
- **THEN** the tab names the minimum version and the plugin sends nothing

#### Scenario: Plain http to a public host
- **WHEN** the user enters `http://todo.example.com`
- **THEN** the plugin refuses the address and offers `https://todo.example.com`

#### Scenario: Vault synced to another device
- **WHEN** the vault, including `.obsidian`, is synced to a second device by a file-sync service
- **THEN** the plugin on the second device is not connected until the user connects it there with its own token

### Requirement: Send a line or a selection to OpenTodo
The plugin SHALL offer "Send line to OpenTodo" in the editor's context menu, and the command "Send line as a task" (shown by Obsidian as "OpenTodo: Send line as a task") in the command palette and as a mobile toolbar action; no command SHALL repeat the plugin's name or come with a default hotkey. With no selection it SHALL take the line at the cursor; with a selection it SHALL take each non-empty line of it, at most 50, each becoming one task. A checkbox line (`- [ ]` or `* [ ]` at any indent) SHALL be read with the vault's task-line grammar (do-on date, start date, priority, labels from `#tags`, time, estimate, deadline); any other line SHALL be read with the quick-add parser in the account's quick-add language. Before sending, a confirmation sheet SHALL show each task's title, its recognised fields as removable chips and the target project (the plugin's default project, else the Inbox), reachable and confirmable from the keyboard; a setting "Send without asking", off by default, SHALL skip it. A line that already carries `🆔` or an `[opentodo:: …]` field SHALL NOT be sent again: the command SHALL say it is already in OpenTodo and offer to open the task. Projects the user may not add tasks to SHALL not be offered.

#### Scenario: A plain line from a daily note
- **WHEN** the cursor is on the line `Call the plumber tomorrow 9am p2` in `Daily/2026-10-29.md` and the user runs the command and confirms
- **THEN** a task "Call the plumber" due 2026-10-30 at 09:00 with priority 2 exists in the Inbox on every device after sync

#### Scenario: A Tasks line
- **WHEN** the line is `- [ ] Renew passport 📅 2026-11-05 ⏫ #errand`
- **THEN** the sheet shows the title "Renew passport", do-on 2026-11-05, priority 2 and the label errand, and sending creates that task

#### Scenario: A selection of three lines
- **WHEN** three lines are selected and the user unticks the second in the sheet and confirms
- **THEN** two tasks are created and only those two lines are changed

#### Scenario: Already sent
- **WHEN** the user runs the command on a line carrying `[opentodo:: https://todo.example.com/?task=8c2a…]`
- **THEN** nothing is sent and the notice offers "Open in OpenTodo"

#### Scenario: Selection too large
- **WHEN** the selection holds 80 non-empty lines
- **THEN** the sheet says at most 50 lines can be sent at once and sends nothing

### Requirement: The task links back to its note
Every task the plugin creates SHALL carry the origin `{kind: "obsidian", id: <the note's vault-relative path>, url: "obsidian://open?vault=<vault name>&file=<note path>", title: <the note's name>}`, so its chip opens the note. After sending, the plugin SHALL by default append an inline field `[opentodo:: <server>/?task=<id>]` to the line; the setting "After sending" SHALL instead mark the line done or remove it. A notice "Sent to OpenTodo" with "Undo" SHALL stay ten seconds; Undo SHALL restore the line exactly and move the task to the Trash through an ordinary operation. When a note is renamed or moved in Obsidian on this device, the plugin SHALL update the origin of every task linked from that note's lines; the command "Fix OpenTodo links in this note" SHALL do the same on demand for renames this device did not see. Origin updates are ordinary last-writer-wins writes.

#### Scenario: Chip opens the note
- **WHEN** a task was sent from `Meetings/Kick-off.md` in the vault "Work notes" and the user activates its origin chip on a laptop with Obsidian installed
- **THEN** Obsidian opens `Meetings/Kick-off.md` in "Work notes"

#### Scenario: Undo
- **WHEN** the user picks "Undo" within ten seconds of sending
- **THEN** the line reads as before sending and the task is in OpenTodo's Trash on every device after sync

#### Scenario: Note renamed
- **WHEN** the user renames `Daily/2026-10-29.md` to `Daily/Thursday.md` in Obsidian on the same device
- **THEN** the tasks linked from its lines get origins naming `Daily/Thursday.md`, and their chips open the renamed note

#### Scenario: Line removed by setting
- **WHEN** "After sending" is "Remove the line" and the user sends a line
- **THEN** the line is gone from the note, and Undo puts it back

### Requirement: Sends work offline
The plugin SHALL build each task's operations on the device, with ids it makes, and keep them in a per-device outbox before changing the line, so sending works with no connection and the line gets its link immediately. The outbox SHALL be pushed when the plugin loads, when the network returns, every 60 seconds while it is not empty and on the command "Send pending to OpenTodo"; operations are idempotent, so a push repeated after an interruption creates nothing twice. The settings tab, and on desktop the status bar, SHALL show how many tasks are waiting. An operation the server refuses SHALL be removed from the outbox and reported with the server's reason and the note it came from. The plugin's operations SHALL carry the device `obsidian:<install id>` and converge with every other device's under the field-level last-writer-wins rule.

#### Scenario: Sent on a plane
- **WHEN** the phone has no connection and the user sends two lines
- **THEN** both lines get their links at once, the settings tab shows "2 waiting", and both tasks exist on every device after the phone is next online with Obsidian open

#### Scenario: Interrupted push
- **WHEN** the connection drops after the server applied a push but before the answer arrived, and the plugin pushes again
- **THEN** each task exists once

#### Scenario: Refused
- **WHEN** a queued task targets a shared project in which the user has meanwhile become a viewer
- **THEN** the server refuses it, the outbox drops it, and a notice names the project, the reason and the note

### Requirement: The plugin on an encrypted account
For an account with end-to-end encryption the plugin SHALL ask for the passphrase, derive the account key on the device with the same envelope code as the web app, encrypt every content value (title, notes, origin) before it enters the outbox, and decrypt project and label names it reads. The key SHALL live in memory until Obsidian closes, unless the user ticks "Remember on this device", which SHALL store it in Obsidian's per-device storage and say so. While locked the plugin SHALL refuse to send, before anything is queued, and offer "Unlock OpenTodo". The server SHALL receive only ciphertext for content values.

#### Scenario: Encrypted send
- **WHEN** an unlocked encrypted account sends `Renew passport`
- **THEN** the server stores only ciphertext for the title and the origin, and every unlocked device shows "Renew passport" with the Obsidian chip

#### Scenario: Locked
- **WHEN** the account is encrypted, Obsidian was restarted without "Remember on this device", and the user runs the command
- **THEN** nothing is queued, the line is unchanged, and the notice offers "Unlock OpenTodo"

### Requirement: Plugin distribution and review
The plugin's source SHALL live in `obsidian/` in this repository under the repository's licence and SHALL import the quick-add parser, the task-line grammar and the envelope code from their single implementations, so their shared vectors pin the plugin too. Tagged releases SHALL build the plugin and publish `manifest.json`, `main.js` and `styles.css` to the plugin's release repository with the same version as the OpenTodo release; the build SHALL fail when `main.js` exceeds its size budget or uses an API not available on Obsidian mobile. The plugin's own strings SHALL exist in the six languages the web app ships and follow Obsidian's language. Its README SHALL state that it connects only to the server the user configures, collects nothing, needs a `full` token and an OpenTodo account, and costs nothing. The release repository SHALL also receive the source the bundle is built from, so that installing its locked dependencies and running `npm run build` there gives the released `main.js` and `styles.css` byte for byte; CI SHALL check this, the dependencies' audit, the manifest and README rules of Obsidian's community directory, and its ESLint rules (`eslint-plugin-obsidianmd`), and SHALL fail on any error those rules report.

#### Scenario: Tagged release
- **WHEN** the tag `v0.20.0` is pushed and every gate passes
- **THEN** the release repository has a release `0.20.0` with the three files, and its `manifest.json` reads version `0.20.0` and `isDesktopOnly: false`

#### Scenario: Directory review
- **WHEN** the community directory reviews the release `0.20.0` of the release repository
- **THEN** its build of the repository matches the released files, and its manifest, release and source checks report no error, because `make obsidian-review` ran the same checks on the same files before the tag

#### Scenario: Shared parser change
- **WHEN** a change alters how the quick-add parser reads `tomorrow 9am`
- **THEN** the plugin built from the same commit reads it the same way, and the quick-add vectors fail in one place if they disagree

#### Scenario: Missing translation
- **WHEN** a plugin string has no German entry
- **THEN** `make i18n-check` fails
