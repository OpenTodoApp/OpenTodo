## ADDED Requirements

### Requirement: Vault sync in the Obsidian plugin
The OpenTodo plugin for Obsidian SHALL offer, in its settings, to sync one folder inside the Obsidian vault (default `OpenTodo/`) as a vault: on a folder without `.opentodo/` it SHALL do what `ot vault init` does (refusing a folder that holds Markdown files unless the user confirms adopting them), and on a folder with a state file it SHALL continue from it. It SHALL apply the same file format, merge and conflict rules, limits and encrypted-account rules as `ot vault`, read and write the same state file, and exchange as the same kind of device (`vault:<id>`) over the sync route with the plugin's `full` token, so a folder synced by the plugin can later be synced by `ot vault` and the other way round. It SHALL sync when the plugin loads, after a file in the folder has been stable for one second following a change, every 30 seconds while Obsidian is visible, and on the command "Sync vault with OpenTodo now"; it SHALL not sync while Obsidian is closed or in the background, and the settings tab SHALL say so. A failed sync SHALL change no file and no state, be shown with its reason, and be retried with growing intervals. A folder with a TaskNotes folder linked SHALL be refused with a message naming `ot vault`. For the same inputs, the plugin's engine and `ot vault` SHALL push the same operations and write the same bytes, which shared vectors verify.

#### Scenario: Phone-only user
- **WHEN** a user with Obsidian only on an iPhone turns on vault sync for `OpenTodo/` and the account holds the projects Home and Work
- **THEN** the folder holds `Home.md`, `Work.md` and `.opentodo/state.json`, and ticking a line in `Home.md` completes the task on every device after the next sync

#### Scenario: App change reaches the phone
- **WHEN** Obsidian is open on the phone with vault sync on and a task is created in Home on the laptop
- **THEN** `Home.md` on the phone holds the new line within about 30 seconds

#### Scenario: Offline edit
- **WHEN** the user edits three lines with no connection and the network returns while Obsidian is visible
- **THEN** the next sync pushes the three edits and they converge with edits made elsewhere under the field-level last-writer-wins rule

#### Scenario: Same result as ot vault
- **WHEN** the shared sync vectors run
- **THEN** for every case the plugin's engine and `ot vault` produce the same pushed operations, the same file bytes, the same conflict files and the same state

#### Scenario: Locked encrypted account
- **WHEN** the account is encrypted and the plugin is locked
- **THEN** the sync is skipped with "Unlock OpenTodo to sync the vault", no request is sent and no file changes

#### Scenario: TaskNotes linked
- **WHEN** the chosen folder's state file has a TaskNotes folder linked
- **THEN** the plugin refuses to sync it and names `ot vault`

#### Scenario: File not downloaded yet
- **WHEN** iCloud has not downloaded `Work.md` yet and only its placeholder is present
- **THEN** the sync skips `Work.md` with a report, and no task of Work is trashed

### Requirement: One syncing device per vault folder
The vault state file SHALL record which installation syncs the folder (`owner`: its kind, `cli` or `obsidian`, a random installation id and a readable label) and until when (`lease_until`, five minutes after its last sync; `ot vault watch` and the plugin renew it on every cycle). `ot vault sync`, `ot vault watch` and the plugin SHALL refuse to sync a folder whose state names another installation, before any request, with error code `vault_owned` (exit 2 for `ot`) and a message naming the owner's label and whether its lease is still running. Taking over (`--take-over` on `sync` and `watch`, "Take over syncing here" in the plugin) SHALL give the folder a new device id and owner and run a first sync that compares every known line with the server's values, keeping the server's value for any field that differs and writing the file's line to the conflict file, and creating tasks for lines without an id. A state without an owner SHALL be owned by the first installation that syncs it. `--take-over` SHALL appear in `ot schema` and `ot help --json`.

#### Scenario: Replicated folder, two devices
- **WHEN** `ot vault watch` runs on the laptop for a folder that Obsidian Sync also replicates to the phone, and the phone's plugin has vault sync on for the same folder
- **THEN** the phone's plugin shows "Synced by laptop" and sends nothing, and an edit made on the phone reaches OpenTodo through the laptop's next sync

#### Scenario: Owner gone
- **WHEN** the laptop that owned the folder is retired and the user picks "Take over syncing here" on the phone
- **THEN** the phone syncs the folder from then on as a new vault device, no task is created twice, and any line whose fields differ from the server is listed in the conflict file

#### Scenario: Refused on the command line
- **WHEN** the user runs `ot vault sync` on a folder the phone's plugin owns
- **THEN** no request is sent, the exit code is 2, the error code is `vault_owned` and the message names the phone and `--take-over`

#### Scenario: Older state file
- **WHEN** `ot vault sync` runs on a folder whose state was written before this change
- **THEN** the sync runs, and the state now names this installation as the owner
