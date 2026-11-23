# Design

## D1. What counts as cut short

The vault writes a file and records its full hash. It now also records `size`, the length in bytes, and `prefixes`: `prefixHash` (the first 8 bytes of the SHA-256, in hex) of each prefix of the written bytes that ends at a `\n`. A file now on disk is cut short when all of these hold:
- it is not empty;
- it is shorter than `size`;
- its text up to and including its last `\n` hashes to one of `prefixes`, or it has no `\n` at all (cut inside the first line).

The check is exact when the cut lands on a line end. When the cut lands mid-line, everything before the cut line is checked, and the partial line is not. A text with no prefixes recorded (more than 5000 lines, or written by an older engine with a size) counts as cut short when it is shorter and does not end in `\n`.

## D2. The hold

The hold is the one the empty-file hold already uses: up to `halfSavedHold` (five minutes) from the first sync that sees the file empty or cut short, recorded in `FileState.held`. It ends when the file is no longer cut short, or when the time has passed. An empty file is held unless every task line it lost is in another file (a move). A file cut short is held only when it lost a task line that is in no other file: a cut that removed only prose, or only lines moved elsewhere, cannot trash anything, so it is read at once.

## D3. The base of a held file

Before this change, a held file's tasks kept their old rows in the store itself. A change pulled from the app while the file was held was therefore dropped from the vault's copy, and once the file was read, a removed line looked unchanged in the app and was trashed. A held file now uses the mechanism that files saved during a sync use (`State.held`, vault-write-check): its rows are held apart, the store takes the app's values, and the next sync merges the file against the held rows. A file not yet downloaded (iCloud) keeps the old way. An engine from before this change ignores `held` (see the proposal). A task the app moves from a held file to another file during the hold is printed in the other file, so its row is not held; that gap is the same as before this change.

## D4. Unknown id at a known path

`mapFiles` sends a file whose `opentodo-id` is not an id at all (not of the form the app makes, `8-4-4-4-12` lowercase hex) down the same path as a file without one. When the last sync wrote that path for a live, unclaimed project, the file is that project's, the id is written back on the next write, and the warning says so; otherwise the file becomes a new project with the old warning. A well-formed id that names no project of the account is a file from elsewhere and still becomes a new project.
