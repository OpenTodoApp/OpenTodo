## Context

A vault sync reads the folder (`scan`), pulls, merges, pushes, then prints the touched files and writes them (`plan`, `apply`; `planNotes` for TaskNotes). A file saved after `scan` was overwritten by `apply`. `ot vault watch` only narrows how often this happens (#764): the window is the length of a sync, including two network round trips.

## Decisions

**D1. Compare the content right before each write or remove.** `apply` re-reads each file it is about to write or remove and compares it byte for byte with what `scan` read (absent stays absent). A content comparison catches what a modification time misses (coarse timestamps, editors that restore times). The remaining window is between the read and the rename of the temporary file.

**D2. A raced file is treated like a file not downloaded yet.** It is not written; its recorded hash stays what it was before the run, so the next sync reads it as changed; the lines printed in it (`printed`) stay as before the run; a project move keeps the source file too.

**D3. The next merge uses the rows the file was printed from.** Keeping the old rows in the store (as a read-only run does) would also hide the app's changes the run pulled, since the cursor moved on. Instead the state file gains `held`, the rows of the raced file's tasks and project as they were before the run. The next sync merges with `base = store + held` and `app = store + pulled`: the save is a change against `held`, the app's change is a change against `held` too, and the per-field three-way merge keeps both. `held` is cleared at the start of every run and refilled only by a new race.

**D4. Fresh ids still reach a raced file.** A line without an id became a task with a name-based id derived from the run's start cursor; the next run derives another one. So, for a raced file, the ids given this run are written into the saved text by matching the id-less task lines by trimmed text and occurrence, and only while the file still holds the text just read. The same holds for a new TaskNotes note (its `opentodo-id`). Everything else in the save waits for the next sync.

**D5. Removes and conflict renames.** A file that changed is not removed (its project's archive is then handled by the next sync, which turns an edited file of an archived project into a conflict file). A conflict rename takes the file as it is at that moment, so the save is in the conflict file.

## Data model

State file: optional `held` (same shape as `store`). No op, entity or migration change. Older `ot` versions ignore the field, which only loses the protection.

## Size

No dependency; binary size unchanged in practice.

## Risks

- A line whose text was edited during the sync does not get its new id and becomes a second task on the next sync, like an edited new line in a file not yet synced. Rare: the line was typed, saved, read, then changed within one sync.
- The Obsidian plugin's engine (`obsidian/src/vault`) already writes only while a file holds what it read (`vault.process`), but records the file as written; carrying D2 to D4 there is a follow-up. The shared sync vectors do not change, since no vector saves during a sync.
