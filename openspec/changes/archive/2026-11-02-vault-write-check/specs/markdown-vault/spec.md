## MODIFIED Requirements

### Requirement: Watch mode
`ot vault watch` SHALL run `sync` once, then keep the folder in sync until stopped: it SHALL open the server's live update stream for its device and sync within two seconds of a wake-up, and SHALL check the files' modification times every two seconds and sync when one changed, waiting until a changed file has been stable for one second. It SHALL fall back to a 30-second poll while the stream is down, SHALL not exit on a failed sync but print the error and retry with backoff, and SHALL exit cleanly on an interrupt with the state file consistent.

Every sync (`sync` and each cycle of `watch`) SHALL read a project file or a task note again right before it writes or removes it, and SHALL leave the file as it is when its content differs from what the sync read, reporting it as skipped. Such a file SHALL count as changed for the next sync, which SHALL merge it against the values it was printed from, so a save made while a sync ran reaches the app and the app's changes made meanwhile reach the file, with neither reverted. A line or a note the sync turned into a task SHALL still get its id written into the saved file, so its task is not created twice. Offline, the check is the same: it reads only the folder. Convergence is unchanged: the save becomes ordinary ops on the next sync.

#### Scenario: App change reaches the file
- **WHEN** `ot vault watch` runs and a phone creates a task in Home
- **THEN** `Home.md` holds the new line within a few seconds

#### Scenario: File save reaches the app
- **WHEN** `ot vault watch` runs and the user saves `Home.md` in Obsidian with a new line
- **THEN** the task exists in the app within a few seconds and the line has its `🆔`

#### Scenario: Server away
- **WHEN** the server becomes unreachable while `watch` runs
- **THEN** the command keeps running, prints one line per failed attempt with growing intervals, and syncs again once the server answers

#### Scenario: Save during a sync
- **WHEN** a phone renames "Pay rent" to "Pay the rent" and the user saves `Home.md` with a due date on "Call mum" after the sync read the folder and before it writes
- **THEN** that sync leaves `Home.md` as saved and reports it skipped, and the next sync sends the due date to the app and writes "Pay the rent" into the file

#### Scenario: New line saved again during its sync
- **WHEN** the sync creates the task of a new line "Order compost" and the user saves the file again, with another new line, before the sync writes
- **THEN** the saved file gets the `🆔` of "Order compost", and the next sync creates only the other line's task

#### Scenario: Removed file saved meanwhile
- **WHEN** a project is archived in the app and its file is saved after the sync read it
- **THEN** the file is not removed, and the next sync renames it to a conflict file holding the save
