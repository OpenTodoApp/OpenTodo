# notes-page Specification

## Purpose
The Notes page: one place that lists task notes, project notes and standalone notes newest change first, filters and paginates them, and searches them on the device over the decrypted text with highlighted snippets, offline included, with phone and keyboard behaviour.

## Requirements

### Requirement: Notes page
The app SHALL have a Notes page at `/notes`, loaded on first use, that lists task notes (tasks not deleted with a non-empty note, completed ones marked), project notes (projects not deleted with a non-empty note, archived ones marked) and standalone notes (not deleted) of the current workspace, from local data only, sorted by the time the note itself last changed, newest first. With no words and no token in the search field, pinned standalone notes SHALL be listed first under a **Pinned** heading in the user's favourites order, and every other note under a **Recent** heading in that sorted order; without pinned notes the list SHALL have no headings. It SHALL show the first 50 of the sorted notes and a Show more control that adds the next 50, with the number shown and the total beside it. Each row SHALL be one line on a row grid shared by every row: the kind icon, the title, where the note lives (the standalone note's project, the task's project or Inbox, the project of a project note), its labels as at most two chips then "+n" in the style of task rows, and the relative time of the last change, right-aligned. Opening a row SHALL open the task with its note, the project with its note open for editing, or the standalone note. The page SHALL work offline and SHALL send nothing to the server. An empty page SHALL show one sentence and the New note action. The header SHALL hold the title, the note count, New note and Help, and SHALL keep a place among its actions for a view switch of the Notes page.

#### Scenario: Default list
- **WHEN** the user has 312 notes of all three kinds, none pinned, and opens Notes
- **THEN** the 50 most recently changed notes are listed, newest first, without headings, with "50 of 312" and Show more

#### Scenario: Pinned first
- **WHEN** the user has pinned the notes "Wi-Fi" and "Packing list" and opens Notes
- **THEN** both are listed under Pinned in the pinned order, and the other notes follow under Recent, newest first, without repeating the pinned ones

#### Scenario: Search shows one list
- **WHEN** the user with pinned notes types `ferry` in the search field
- **THEN** the results are one ranked list without the Pinned and Recent headings

#### Scenario: One line per note
- **WHEN** a task note of "Call the plumber" in the project "Home" with the labels "errand" and "phone", changed two hours ago, is listed on a 1280 px screen
- **THEN** its row is one line with the task icon, "Call the plumber", "Home", the chips "errand" and "phone", and "2 h ago" at the row's end, aligned with the same columns of the rows above and below

#### Scenario: Where a note lives
- **WHEN** the list holds a standalone note in "Renovation", a task note of a task without a project and a project note of "Garden"
- **THEN** their rows read "Renovation", "Inbox" and "Garden" in the place column

#### Scenario: A task's other change does not count
- **WHEN** the user changes the due date of a task whose note was last edited a month ago
- **THEN** the task's note keeps its place in the list

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Notes
- **THEN** the list is shown from local data with no request and no error

#### Scenario: Open a project note
- **WHEN** the user opens a project note from the list
- **THEN** the project opens with its note in edit mode

### Requirement: Searching notes on the device
The page SHALL have a search field that finds notes whose title or text contains every word typed, ignoring case and accents, with quoted words matched as a phrase and Markdown syntax ignored, among the notes the field's tokens keep. The search SHALL run on the device over the decrypted text, offline included, and SHALL send nothing to the server. Each result SHALL show, on its one line after the title, a snippet of the text around the first match with every matched word highlighted, as plain text. Results SHALL list title matches first, then by the number of matched words, then by the last change, paginated 50 at a time.

#### Scenario: Find a word in a long note
- **WHEN** a standalone note "Trip" contains "the ferry leaves at 7" and the user types `ferry`
- **THEN** "Trip" is listed with the snippet "…the **ferry** leaves at 7…" after its title on the same line, the word highlighted

#### Scenario: Accents and case
- **WHEN** a note contains "Café Müller" and the user types `cafe muller`
- **THEN** the note is found

#### Scenario: Encrypted and offline
- **WHEN** an encrypted account is unlocked on an offline device and the user searches a word that only occurs in a note's body
- **THEN** the note is found and nothing is sent

#### Scenario: Formatting ignored
- **WHEN** a note contains `**oat** milk` and the user types `"oat milk"`
- **THEN** the note is found and the snippet shows "oat milk" without asterisks

### Requirement: Notes page on phones and from the keyboard
On a phone the page SHALL show the search field with its chips at the top, the token suggestions in the same list under the field, rows at least 48 px tall and one line each (the kind icon, the title, where the note lives and the time; the labels left to the note), and the note editor with the touch formatting row. On a computer, `g e` SHALL open Notes, and on the page `q` SHALL create a note, `/` SHALL focus the search field, and `j`, `k` and Enter SHALL move and open as in lists; every control SHALL be reachable with Tab, every chip's remove button included. All page text SHALL be translated in the app languages.

#### Scenario: Phone filters
- **WHEN** the user on a 390 px phone opens Notes, types `in:ren` and taps "Renovation" in the suggestions
- **THEN** a chip "in: Renovation" is in the field, the list shows only notes in Renovation, and every row is one line at least 48 px tall

#### Scenario: Keyboard only
- **WHEN** the user presses `g e`, then `/`, types `ferry`, presses Escape, `j` and Enter
- **THEN** Notes opens, the search finds the note, focus returns to the list, and the first result opens

#### Scenario: Another language
- **WHEN** the app language is Italian and the user opens Notes with no notes
- **THEN** the page title, the empty sentence and New note are in Italian

### Requirement: Writing from the search field
While the search field holds words, the list SHALL show as its first row **New note "<words>"**. The list cursor SHALL start on the first matching note when there is one and on the New note row otherwise; Up from the first result SHALL reach the New note row, and Enter SHALL open what the cursor is on. Choosing the New note row SHALL create a standalone note titled with the trimmed words, in the project of the first `in:` chip when there is one the user may write in and otherwise without a project, with the labels of the label chips, clear the words (the chips stay), and open the note with the caret in its body: docked beside the list on a computer, as a page on a phone, where the row is at least 48 px tall. Creating SHALL work offline as a local write that syncs later, and Undo SHALL remove the note.

#### Scenario: Write right away
- **WHEN** the user presses `/` on the Notes page, types `Packing for Lisbon`, which matches no note, and presses Enter
- **THEN** a note "Packing for Lisbon" is created and open with the caret in its body, and the search field is empty

#### Scenario: Search still comes first
- **WHEN** the note "Trip" contains "ferry" and the user types `ferry` and presses Enter
- **THEN** "Trip" opens and no note is created

#### Scenario: Create although notes match
- **WHEN** the user types `ferry`, presses Up and then Enter
- **THEN** a note "ferry" is created

#### Scenario: Into the chips' project and labels
- **WHEN** the field holds the chips "in: Renovation" and "@ quotes" and the user types `Tiles` and presses Enter
- **THEN** a note "Tiles" is created in Renovation with the label "quotes", and the two chips stay in the field

#### Scenario: Offline
- **WHEN** the device is offline and the user creates a note from the search field
- **THEN** the note is shown at once, survives a reload, and syncs when the network returns

### Requirement: Pinning notes
The user SHALL pin and unpin a standalone note from its row menu, from the note's own menu and from the palette while the note is open. A pin SHALL be a favourite of the kind `note`, personal to the user (never shown to other members of a shared project), synced, and kept in the user's favourites order. A pinned note that is deleted SHALL not be shown as pinned and SHALL be pinned again when restored. Task notes and project notes SHALL not be pinnable from the Notes page. Pinning SHALL work offline and converge as the favourites preference does.

#### Scenario: Pin
- **WHEN** the user chooses Pin in the menu of the note "Wi-Fi"
- **THEN** "Wi-Fi" is listed under Pinned at once and on the user's other devices after sync

#### Scenario: Personal
- **WHEN** Anna pins a note of a project shared with Bob
- **THEN** Bob's Notes page does not show it as pinned

#### Scenario: Trash and restore
- **WHEN** a pinned note is moved to the Trash and later restored
- **THEN** it leaves Pinned while in the Trash and is under Pinned again after the restore

### Requirement: The docked note's width
On a screen of at least 1024 px, the standalone note open beside the Notes list SHALL have a resize handle on its left edge, as the docked task has: dragging it SHALL set the pane's width, a click without dragging SHALL switch between the widest width and the default, and with focus on it ← SHALL widen and → SHALL narrow the pane (Shift for larger steps), and Home SHALL restore the default. The width SHALL stay between 22 rem and what leaves 38 rem for the sidebar and the list. The width SHALL be kept on the device only, never synced, apart from the docked task's width, and SHALL be applied when a note opens again on that device; storage being unavailable SHALL keep the width for the visit. The note's title, text, Project and Labels SHALL stand in one column at most 40 rem wide, centred when the pane is wider, with padding on both sides. Below 1024 px the note SHALL open as its page, unchanged. Offline it works the same, since nothing is sent; there is nothing to converge.

#### Scenario: Drag the edge
- **WHEN** the user on a 1600 px screen opens a note on the Notes page and drags the pane's left edge 120 px to the left
- **THEN** the pane is 120 px wider, and the next note opened on this device opens at that width

#### Scenario: Keyboard
- **WHEN** the user focuses the pane's edge and presses ← twice, then Home
- **THEN** the pane widens by two steps, then returns to its default width

#### Scenario: Click for the widest
- **WHEN** the user clicks the pane's edge without dragging, then clicks it again
- **THEN** the pane takes the widest width, then its default width again

#### Scenario: Apart from the task panel
- **WHEN** the user has widened the task side panel and opens a note on the Notes page
- **THEN** the note opens at its own width, and resizing it leaves the task panel's width as it was

#### Scenario: A readable column
- **WHEN** the note pane is 60 rem wide
- **THEN** the note's text stands in a centred column at most 40 rem wide

#### Scenario: Phone
- **WHEN** the user on a 390 px phone opens a note on the Notes page
- **THEN** the note opens as its page, without a resize handle

### Requirement: List or Graph
The Notes page header SHALL offer a List | Graph switch (on a phone, one control in the page bar), the Notes space of the sidebar SHALL list Graph under All notes, and the key `v` on the page SHALL switch between them. Graph mode SHALL be at `/notes?view=graph`, and a standalone note open beside it at `/notes/<id>?view=graph`, so the address can be shared, and Back and reload keep the mode. The last mode shown SHALL be kept on the device, never synced, and every way into Notes that names no mode (`g e`, the palette, the Tasks | Notes switch) SHALL open it, while the sidebar's All notes and Graph name theirs; storage being unavailable SHALL open the List. Both modes SHALL share the page's title, count and search field with its chips. Offline it works the same, since nothing is sent; there is nothing to converge.

#### Scenario: Switch to the graph
- **WHEN** the user on the Notes list chooses Graph
- **THEN** the address becomes `/notes?view=graph`, the graph replaces the list under the same header, and Back returns to the list

#### Scenario: Remembered
- **WHEN** the user leaves Notes in Graph mode and later opens Notes from the sidebar on the same device
- **THEN** Notes opens in Graph mode

#### Scenario: Reload
- **WHEN** the user reloads `/notes?view=graph`
- **THEN** the graph is shown

### Requirement: Search tokens
The search field SHALL accept filter tokens beside words, each shown as a chip with a remove button once complete: `in:<project>` or `#<project>` (the note lives in that project or a sub-project of it: a standalone note's own project, a task note's task's project, a project note's project), `@<label>` or `label:<label>` (the standalone note or the task carries that label), `kind:note`, `kind:task` or `kind:project`, `linked:<note>` (the items linked with that standalone note in either direction, as Linked references and the note's links read them, `note-links`), `orphan` (standalone notes nothing the user can read links to), `pinned` (pinned standalone notes), and `changed:` followed by `<` or `>` and a number of days, weeks or months (`<7d`, `>2w`, `>3m`), by `today` or `yesterday`, or by a date `YYYY-MM-DD` with an optional `<` or `>` (on, before or after that day in the viewer's day). Names SHALL match ignoring case and accents and MAY be quoted. Tokens of different keys SHALL all apply; tokens of the same key SHALL keep a note that matches any of them. A token SHALL become a chip when it is complete and followed by a space, when it is picked from the suggestions or when it is pasted; Backspace in an empty field SHALL remove the last chip. While a token's value is typed, the matching values SHALL be suggested under the field (projects with their path, labels with their colour, standalone notes by title, the kinds, date forms), moved through with the arrows and picked with Enter, Tab or a click; while a word of two letters or more starts a key, the key SHALL be suggested and Tab SHALL complete it, without changing what Enter does. A chip SHALL keep naming its project, label or note after a rename, and SHALL match nothing once it is deleted. The chips, not the words, SHALL be remembered on the device; filters stored by an earlier version SHALL be converted once into chips. Tokens SHALL be matched on the device over local data and decrypted text, offline included, and SHALL send nothing to the server; there is nothing to converge beyond the notes, labels and projects themselves.

#### Scenario: Project with sub-projects
- **WHEN** the project "House" has the sub-project "Kitchen", and the user types `in:House ` in the search field
- **THEN** a chip "in: House" replaces the text, and the list keeps the notes of tasks in House and Kitchen, the standalone notes in either and the project notes of both

#### Scenario: Labels like the task filter
- **WHEN** a standalone note and a task note carry the label "errand" and the user types `@err`, then picks "errand" from the suggestions
- **THEN** a chip "@ errand" is in the field and both notes are listed, and project notes are not

#### Scenario: Two labels
- **WHEN** the field holds the chips "@ errand" and "@ phone"
- **THEN** notes with either label are listed

#### Scenario: Kind and age
- **WHEN** the user types `kind:note changed:<7d `
- **THEN** two chips are in the field and only standalone notes changed in the last seven days are listed

#### Scenario: Linked with a note
- **WHEN** the note "Trip" links to "Packing list" and is linked from the task "Book ferry", and the user picks "Trip" after `linked:`
- **THEN** "Packing list" and the note of "Book ferry" are listed, and "Trip" itself is not

#### Scenario: Orphans
- **WHEN** the note "Trip" is linked from a task, the note "Ideas" links to "Trip" but nothing links to "Ideas", and the user types `orphan `
- **THEN** "Ideas" is listed and "Trip" is not

#### Scenario: Remove a chip
- **WHEN** the field holds the chips "kind: note" and "pinned", the words are empty and the user presses Backspace
- **THEN** the "pinned" chip is removed and the list keeps every standalone note

#### Scenario: Enter still opens
- **WHEN** the user types `pin`, which starts the key `pinned`, and presses Enter
- **THEN** the first note matching the word "pin" opens and no chip is added

#### Scenario: Filters of an earlier version
- **WHEN** a device that stored the Source "Standalone only" and the project "Renovation" opens Notes for the first time after the update
- **THEN** the field holds the chips "kind: note" and "in: Renovation", and the list is the one those filters showed

#### Scenario: Renamed project
- **WHEN** the field holds the chip "in: Renovation" and the project is renamed "House works" on another device
- **THEN** after sync the chip reads "in: House works" and keeps the same notes

#### Scenario: Encrypted and offline
- **WHEN** an encrypted account is unlocked on an offline device and the user types `@errand ferry`
- **THEN** the notes with that label whose decrypted text contains "ferry" are listed and no request is made

### Requirement: Sorting the list
The Notes page header SHALL offer, in its overflow menu, a Sort choice of **Last changed** (the default and the order of "Notes page"), **Created** and **Title**, each with a direction: newest first for the two times and A to Z for Title, reversed by choosing the checked order again and shown by an arrow beside it. Title SHALL compare the shown titles in the app language's collation with numbers in numeric order, untitled notes last in either direction; Created SHALL use a standalone note's creation time, a task note's task's creation time and a project note's project's creation time; ties SHALL fall back to the last change. The order SHALL apply to the notes listed under **Recent** when no words are searched, chips included, and its heading SHALL name the order; **Pinned** SHALL keep the user's pin order, and search words SHALL keep the search ranking. The order SHALL be stored on the device only, never synced or written as an operation, and SHALL work offline; with storage refused it SHALL hold for the visit. Graph mode SHALL ignore it.

#### Scenario: By title
- **WHEN** the user has the notes "Week 10", "Wi-Fi", "Week 2" and an untitled note, chooses Sort → Title
- **THEN** the list reads "Week 2", "Week 10", "Wi-Fi", "Untitled note", under the heading "A–Z"

#### Scenario: Reverse
- **WHEN** the order is Title and the user chooses Title again
- **THEN** the list reads "Wi-Fi", "Week 10", "Week 2", "Untitled note", the heading reads "Z–A" and the arrow beside Title points the other way

#### Scenario: Created
- **WHEN** the note "Reading log" was created in January and edited today, and "Ideas" was created yesterday and not edited since, and the user chooses Created
- **THEN** "Ideas" is listed before "Reading log"

#### Scenario: Pinned keeps its order
- **WHEN** the user has pinned "Wi-Fi" then "Packing list" and sorts by Title
- **THEN** Pinned still lists "Wi-Fi" then "Packing list", and the other notes follow under "A–Z"

#### Scenario: Search ranks
- **WHEN** the order is Title and the user types `ferry`
- **THEN** the results are ranked as search ranks them, and clearing the words lists the notes A to Z again

#### Scenario: Chips keep the sort
- **WHEN** the order is Created and the field holds the chip "in: Renovation" with no words
- **THEN** the notes in Renovation are listed newest created first

#### Scenario: Per device
- **WHEN** the user sorts by Title on the laptop and opens Notes on the phone
- **THEN** the phone lists by Last changed, and the laptop still lists by Title after a reload, offline included

### Requirement: Search operators
The words of the Notes page search SHALL accept two operators beside words and quoted phrases: `OR` in capitals, standing alone outside quotes, between two words or phrases, which keeps a note that contains either of them; and the prefixes `title:` and `text:` directly before a word or phrase, which limit it to the note's title or to its text. Words separated only by spaces SHALL all have to match, as without operators, so `lisbon ferry OR train` keeps notes containing "lisbon" and either "ferry" or "train". `or` in lower case, `OR` inside quotes, and a prefix without a value SHALL be ordinary words; an `OR` at the start or end, or two in a row, SHALL be ignored. A query without operators SHALL match and rank exactly as before. Ranking SHALL count a word as a title match only when it matched in the title. Snippets SHALL highlight the words that matched in the text. The key suggestion SHALL offer `title:` and `text:` like the token keys, without turning them into chips. Matching SHALL run on the device over the decrypted text, offline included, and SHALL send nothing to the server; there is nothing to converge.

#### Scenario: Either word
- **WHEN** the note "Trip" contains "ferry", the note "Commute" contains "train", the note "Garden" contains neither, and the user types `ferry OR train`
- **THEN** "Trip" and "Commute" are listed and "Garden" is not

#### Scenario: OR with other words
- **WHEN** "Trip" contains "lisbon" and "ferry", "Commute" contains "train" but not "lisbon", and the user types `lisbon ferry OR train`
- **THEN** only "Trip" is listed

#### Scenario: Lower-case or is a word
- **WHEN** the user types `ferry or train`
- **THEN** only notes containing all three words "ferry", "or" and "train" are listed

#### Scenario: Title only
- **WHEN** the note "Wi-Fi" has the password in its text and the notes "Router" and "Guests" mention "wifi" in their text, and the user types `title:wifi`
- **THEN** only "Wi-Fi" is listed

#### Scenario: Text only with a phrase
- **WHEN** the note "Oat milk brands" has no "oat milk" in its text and the note "Groceries" has "oat milk" in its text, and the user types `text:"oat milk"`
- **THEN** only "Groceries" is listed, with "oat milk" highlighted in its snippet

#### Scenario: Prefix without a value
- **WHEN** the user types `title: ferry`
- **THEN** notes containing the words "title:" and "ferry" are searched, as two ordinary words

#### Scenario: Offline and encrypted
- **WHEN** an encrypted account is unlocked on an offline device and the user types `title:passport OR title:visa`
- **THEN** the notes with either word in their decrypted titles are listed and no request is made

### Requirement: Changed within a date range
The `changed:` token SHALL also accept a range `YYYY-MM-DD..YYYY-MM-DD`, keeping the notes whose last change falls on a day from the first date to the second, both included, in the viewer's time zone; a range written backwards SHALL be read in date order, and a range with one end left out SHALL keep the notes changed on or after, or on or before, the given day. A complete range SHALL become a chip like the other `changed:` forms, and the date suggestions SHALL offer "This month" and "Last month" as ranges. The chip SHALL be remembered on the device like the other chips. The range SHALL be matched on the device over local data, offline included, and SHALL send nothing to the server.

#### Scenario: October
- **WHEN** the note "Trip" changed on 2026-10-14, "Taxes" on 2026-11-02 and "Ideas" on 2026-09-30, and the user types `changed:2026-10-01..2026-10-31 `
- **THEN** a chip "changed: 1 Oct – 31 Oct 2026" is in the field and only "Trip" is listed

#### Scenario: Both ends included
- **WHEN** a note changed at 23:30 on 2026-10-31 in the viewer's time zone and the field holds `changed:2026-10-01..2026-10-31`
- **THEN** the note is listed

#### Scenario: Backwards and open
- **WHEN** the user types `changed:2026-10-31..2026-10-01`, and later `changed:2026-10-01..`
- **THEN** the first keeps the same notes as the October range, and the second keeps every note changed on 1 October 2026 or later

#### Scenario: Last month from the suggestions
- **WHEN** on 2026-11-12 the user types `changed:` and picks "Last month"
- **THEN** the chip covers 1 to 31 October 2026
