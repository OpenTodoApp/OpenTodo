## ADDED Requirements

### Requirement: Unlinked mentions
Below Linked references of a standalone note, a task and a project, the app SHALL show one folded line **Unlinked mentions** with a count, listing, when expanded, every task note, project note and standalone note the user can read whose text contains the item's title and that does not link to the item, most recently changed first, at most 50 then Show more, each row with its kind, title, project and the line around the first mention with the title highlighted, opening the source when activated. A mention SHALL be the whole title as whole words, ignoring case, accents and Markdown syntax, outside inline code, code blocks and the visible text of any link, and never in the item's own note; titles shorter than 3 characters after this normalisation and the default "Untitled note" SHALL never be matched. The line SHALL be hidden when the count is 0. The section SHALL be computed on the device from the local, decrypted notes, SHALL work offline and on encrypted accounts, SHALL send nothing to the server and SHALL update as notes change locally or arrive by sync; its expanded state SHALL be a per-device preference. Nothing about it SHALL be stored or synced, so convergence of notes is unchanged.

#### Scenario: A plain mention
- **WHEN** the standalone note "Lisbon ideas" reads "Ask Ana about the trip to lisbon ferry" and the user opens the note "Trip to Lisbon", which nothing links to
- **THEN** Linked references is not shown, Unlinked mentions reads 1, and expanding it lists "Lisbon ideas" with "trip to lisbon" highlighted in its line

#### Scenario: Already linked
- **WHEN** the note "Packing list" links to "Trip to Lisbon" and also names it in plain text
- **THEN** "Packing list" is listed under Linked references and not under Unlinked mentions

#### Scenario: Code and short titles
- **WHEN** a note names "Trip to Lisbon" only inside a code block, and another note is titled "Go"
- **THEN** the code block is not a mention of "Trip to Lisbon", and no note is ever listed as mentioning "Go"

#### Scenario: Encrypted and offline
- **WHEN** an encrypted account is unlocked on an offline device and the user opens a task whose title three notes mention
- **THEN** the three are counted and listed and no request is made

#### Scenario: Mentioned from another device
- **WHEN** another device adds a sentence naming "Trip to Lisbon" to a note, and this device, showing "Trip to Lisbon", syncs
- **THEN** the count grows by one without a reload

### Requirement: Linking a mention
Each row of Unlinked mentions SHALL offer **Link**, which SHALL replace that mention in the source note with a link to the item, written as an edit of the source's document in the same batch as its projection, exactly as a link written with `[[`, with one Undo. When the source changed so that the mention is no longer at its place, the device SHALL match again and link the first remaining mention, or remove the row when none is left. The source SHALL then be listed under Linked references and leave Unlinked mentions. Viewers of the source's shared project, and sources the user may not edit, SHALL show the row without Link. The edit SHALL apply locally and offline at once and converge with concurrent edits of the source under the document merge rules of `rich-text-editing`.

#### Scenario: Link one mention
- **WHEN** the user activates Link on the row "Lisbon ideas" under Unlinked mentions of "Trip to Lisbon"
- **THEN** "Lisbon ideas" reads "Ask Ana about the [Trip to Lisbon](?note=<id>) ferry", the row moves to Linked references, and Undo restores the plain text

#### Scenario: Concurrent edit of the source
- **WHEN** device A links a mention in "Lisbon ideas" while device B, offline, adds a paragraph to the same note, and both sync
- **THEN** every device shows the link and the new paragraph

#### Scenario: Viewer
- **WHEN** a viewer of a shared project sees an unlinked mention in one of that project's notes
- **THEN** the row is shown without Link

#### Scenario: Offline
- **WHEN** the device is offline and the user links a mention
- **THEN** the link is shown at once, survives a reload and is uploaded on the next successful sync

### Requirement: Unlinked mentions fit the budgets
Finding unlinked mentions SHALL not decode note documents and SHALL not block input: it SHALL run after Linked references are painted, never as a main-thread task over 200 ms on the notes fixture of `performance-budgets`, and SHALL read normalised text cached beside the link index and rebuilt only for sources that changed. Opening an item there SHALL keep the `note-references` metric within its limits.

#### Scenario: Large account
- **WHEN** the nightly benchmark opens an item of the notes fixture whose title 40 notes mention
- **THEN** Linked references are painted within the metric's limit, the count follows, and no long task exceeds 200 ms
