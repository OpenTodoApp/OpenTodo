# Spec Delta

## MODIFIED Requirements

### Requirement: Notes page on phones and from the keyboard
On a phone the page SHALL show the search field with its chips at the top, the token suggestions in the same list under the field, and the note editor with the touch formatting row. A phone's row SHALL be at least 48 px tall: the kind icon and the title, on one line when it fits and on two when it is longer, ending with an ellipsis after two (every line with Show full task titles on), and under the title one line with the time of the last change and where the note lives; the labels are left to the note. While the search field holds text the snippet SHALL have its own line between the title and that line. The kind icon and the row's menu SHALL stay beside the title's first line, the menu a touch target of at least 44 × 44 px. The row reads the device's copy and writes nothing, so it is the same offline. On a computer, `g e` SHALL open Notes, and on the page `q` SHALL create a note, `/` SHALL focus the search field, and `j`, `k` and Enter SHALL move and open as in lists; every control SHALL be reachable with Tab, every chip's remove button included. All page text SHALL be translated in the app languages.

#### Scenario: Phone filters
- **WHEN** the user on a 390 px phone opens Notes, types `in:ren` and taps "Renovation" in the suggestions
- **THEN** a chip "in: Renovation" is in the field, the list shows only notes in Renovation, and every row is at least 48 px tall with its title above its time and place

#### Scenario: A long title on a phone
- **WHEN** the Notes list on a 360 px phone holds the note of the task "Paint the fence along the garden path before the neighbours come over", which has no project
- **THEN** the row shows the whole title on two lines beside the task icon, and "Inbox" with the time of the last change on one line under it

#### Scenario: A short title on a phone
- **WHEN** the list holds a standalone note "Ideas" on a 360 px phone
- **THEN** its row is the title on one line with the time under it, and its menu button beside the title is 44 × 44 px

#### Scenario: Keyboard only
- **WHEN** the user presses `g e`, then `/`, types `ferry`, presses Escape, `j` and Enter
- **THEN** Notes opens, the search finds the note, focus returns to the list, and the first result opens

#### Scenario: Another language
- **WHEN** the app language is Italian and the user opens Notes with no notes
- **THEN** the page title, the empty sentence and New note are in Italian
