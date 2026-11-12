## ADDED Requirements

### Requirement: Standalone notes in the vault
While a vault's notes are on, each live standalone note the account can read SHALL be one file `Notes/<title>.md` at the vault's root, named by the vault's file-name rules (refused characters as `-`, a clash resolved by a numeric suffix, "Untitled note" for an empty title). The file SHALL start with front matter holding `opentodo-id`, `project` as an Obsidian link to the project's file (absent for a note without a project) and `tags` with the note's labels in the vault's tag spelling; other front-matter keys SHALL be preserved byte for byte. The body SHALL be the note's Markdown. Files SHALL be matched to notes by `opentodo-id`: renaming a file SHALL rename the note, changing `project` SHALL move it, changing `tags` SHALL set its labels (a tag naming no label creating one), and a `.md` file in `Notes/` without `opentodo-id` SHALL create a note titled after the file and gain the front matter on the next sync. A title change in the app SHALL rename the file. A note a viewer of a shared project cannot edit SHALL be written, and its file's edits SHALL be reported and written back from the app, never pushed. Every change SHALL be ordinary note operations from the vault's device, so edits made in the file offline converge with every device under the field-level last-writer-wins rule and the document merge on the next sync.

#### Scenario: Notes written
- **WHEN** the user runs `ot vault init ~/Notes/Tasks` for an account holding the standalone notes "Packing list" in Home and "Wi-Fi" without a project
- **THEN** the folder holds `Notes/Packing list.md` with `project: "[[Home]]"` and `Notes/Wi-Fi.md` without `project`, each with its `opentodo-id` and body

#### Scenario: Rename a file
- **WHEN** the user renames `Notes/Wi-Fi.md` to `Notes/Home network.md` and syncs
- **THEN** the note is titled "Home network" on every device and keeps its id

#### Scenario: New file
- **WHEN** the user creates `Notes/Recipes.md` with two paragraphs and `tags: [cooking]` and syncs
- **THEN** a standalone note "Recipes" with that text and the label cooking exists on every device, and the file gains `opentodo-id`

#### Scenario: Move by front matter
- **WHEN** the user changes `project` of a note's file from `"[[Home]]"` to `"[[Work/Work]]"` and syncs
- **THEN** the note is in Work on every device

#### Scenario: Unknown project link
- **WHEN** a note's `project` names a file that is no project file
- **THEN** the sync reports the note, its project is unchanged, and the file keeps the value

#### Scenario: Viewer's note
- **WHEN** the user is a viewer of a shared project and edits the file of one of its notes
- **THEN** the sync reports the note as read-only, writes the app's text back, and pushes nothing for it

### Requirement: Merging a note's body
The vault SHALL keep each note's last-synced title, project, labels and body. Title, project and labels SHALL merge per field like task fields. The body SHALL merge as text: changed only in the file, it SHALL be pushed as a plain-text write that the next app folds into the note's document; changed only in the app, it SHALL be written to the file; changed on both sides since the last sync, it SHALL be merged line by line against the last-synced body, non-overlapping edits combined and pushed, and when edits overlap the app's lines SHALL be kept and the file's body appended to `Notes/<title>.conflict.md`, listed in the output and by `ot vault status`. A body push SHALL carry the version the vault last pulled, so a body changed on the server meanwhile is merged on the next sync and never overwritten. Edits made offline wait for the next sync and converge.

#### Scenario: Different lines on both sides
- **WHEN** the file gains a line at the end of "Packing list" while a phone edits its first line, both since the last sync
- **THEN** after the sync the note holds both edits on every device and in the file, and no conflict is reported

#### Scenario: Same line on both sides
- **WHEN** the file and the app both changed the second line of a note since the last sync
- **THEN** the note keeps the app's line, `Notes/<title>.conflict.md` gains the file's body, and the sync reports one conflict

#### Scenario: Changed on the server during the sync
- **WHEN** a phone edits the note after the vault pulled and before its body push
- **THEN** the push is refused as stale, nothing is overwritten, and the next sync merges the three versions

### Requirement: Links between note files
On write, a link to a note or a project in a note's Markdown (`[text](?note=<id>)`, `[text](?project=<id>)`) SHALL be written as a relative Markdown link to that note's or project's file when it exists, and on read a relative link to a vault file holding an `opentodo-id` SHALL be read back as the id form. Links to tasks, links to items without a file and every other link SHALL be kept as written. A round trip of a note without edits SHALL leave its Markdown in the app unchanged.

#### Scenario: Link opens in Obsidian
- **WHEN** the note "Trip" links to the note "Ferry times" and the vault writes it
- **THEN** `Notes/Trip.md` holds `[Ferry times](Ferry times.md)`, and the app still shows the link to the note after the next sync

#### Scenario: Link written in the file
- **WHEN** the user adds `[Home](../Home.md)` to a note's file and syncs
- **THEN** the note's Markdown in the app holds `[Home](?project=<Home's id>)` and shows a link to the project

### Requirement: Deleting and trashing note files
Deleting a note's file SHALL move the note to the Trash when nothing changed on it in the app since the last sync, and SHALL otherwise write the file again and report it. A note trashed or purged in the app SHALL lose its file when the file is unchanged since the last write, and SHALL have the file renamed `<title>.conflict.md` when it is not. A note restored from the Trash SHALL be written again. The checks of "Watch mode" before each write or removal SHALL apply to note files.

#### Scenario: File deleted
- **WHEN** the user deletes `Notes/Recipes.md` and nothing changed on the note in the app since the last sync
- **THEN** the note is in the Trash on every device and the output names it

#### Scenario: Deleted while edited in the app
- **WHEN** the user deletes a note's file while a phone edited the note since the last sync
- **THEN** the note stays, its file is written again with the phone's text, and the output says it was restored

#### Scenario: Trashed in the app while edited
- **WHEN** a note is trashed on a phone and its file was edited since the last sync
- **THEN** the file is renamed `<title>.conflict.md` and the note stays in the Trash

### Requirement: Turning notes on and off
`ot vault init` SHALL turn notes on. A vault created by an earlier version SHALL keep syncing without notes until `ot vault notes on`, which SHALL write every note on the next sync and create notes from `.md` files already in `Notes/` without `opentodo-id`. `ot vault notes off` SHALL stop reading and writing `Notes/`, keep the files and keep the last-synced values, so turning notes on again creates no duplicate. The choice SHALL be the optional `notes` member of `.opentodo/state.json`, ignored by older versions. Both commands SHALL work offline, change only the state file and apply on the next sync. `ot vault sync` SHALL count notes written, created, changed and trashed in its output and its `--json` object, and the commands SHALL appear in `ot schema`.

#### Scenario: Existing vault
- **WHEN** a vault made by an earlier version syncs with this version
- **THEN** no `Notes/` folder is written until the user runs `ot vault notes on`

#### Scenario: Off and on again
- **WHEN** the user runs `ot vault notes off`, syncs, runs `ot vault notes on` and syncs
- **THEN** the files in `Notes/` are matched to their notes by `opentodo-id` and no note is created twice

#### Scenario: Sync output
- **WHEN** the user edits one note's file and creates another, and syncs with `--json`
- **THEN** the object reports one note created and one note changed

### Requirement: Note limits and encryption in the vault
A sync SHALL stop before any write or push, naming the file, when a note's body exceeds 64 KB or the vault would hold more than 5,000 notes, with the state file unchanged; `ot vault notes on` on an account over a limit SHALL report it on the next sync and write nothing. For an encrypted account the vault SHALL decrypt a note's title, body and labels on the machine and encrypt every value it pushes, as for tasks; a value that does not decrypt SHALL be written as the encrypted placeholder and never pushed back.

#### Scenario: Note too large
- **WHEN** a note's file grows past 64 KB and the user syncs
- **THEN** the command exits with code 2 naming the file and the limit, nothing is pushed and no file is written

#### Scenario: Encrypted note
- **WHEN** an unlocked encrypted account edits a note's file and syncs
- **THEN** the server receives only ciphertext for the body, and every unlocked device shows the edit
