## MODIFIED Requirements

### Requirement: All projects page
The app SHALL offer an All projects page at `/projects`, reachable with `g Shift+P`, from the palette and from an "All" action on the Projects header, using the page template: Active and Archived tabs with their counts, a find field that narrows the tree keeping ancestors, New project and From a template as actions, and the projects as a table. The table SHALL keep the project tree (sub-projects indented under their parent, fold and unfold, Collapse all and Expand all in the page menu) and SHALL show for each project its name with icon and colour, its health (statistics "Project health") with its detail, its progress as a ring and a percentage, its open task count, its next due date in the danger colour when it is before today, the members of a shared project as avatars (up to three, then "+n"), when it last changed, and its menu; a click anywhere on a row SHALL open the project. A row's figures SHALL follow the sidebar's rule: a folded row includes its live, unarchived sub-projects, an expanded row only its own tasks. A note under the table SHALL say that health is worked out on the device. Every column but People SHALL sort by its header among siblings, so the tree stays a tree: the first activation in the column's natural direction (health from the most urgent, last change from the newest, the others ascending), the second reversed, the third back to the user's own order, with missing values last in both directions and the sorted column marked for assistive technology; the sort lasts while the page is open. The rows SHALL be reachable by keyboard: Up and Down (and `j`, `k`), Home and End move between rows, Left folds a row or moves to its parent, Right unfolds it, Enter opens the project, and Down from the find field enters the table. The table SHALL drop columns from its end as it narrows (Updated under 68 rem, People under 60 rem, Progress under 52 rem, Next due under 44 rem, Open and the health detail under 36 rem), so a phone shows the name and the health word without scrolling sideways; when the table is narrower than 18 rem (a phone with a large text size), the health word SHALL move under the project name and its column SHALL be hidden, so the name keeps its width. Where the health detail is dropped, the health word SHALL still say why: it SHALL show the detail in a tooltip on hover and keyboard focus and in place under the word on a tap, without opening the project, and assistive technology SHALL read the detail at every width. The page SHALL render from local data, work offline, and update live after sync.

#### Scenario: Find a project
- **WHEN** the user presses `g Shift+P` and types "des"
- **THEN** the page shows "Work › Hiring › Designer" and "Website launch › Design" with their ancestors and no other project, and Enter on the first opens it

#### Scenario: Every project is one click away
- **WHEN** the user's sidebar shows only Favourites and a collapsed Projects group
- **THEN** the "All" action on the Projects header opens the page listing all thirty projects

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the page lists the projects with their health, progress, counts and dates, the archived projects, and the find field works

#### Scenario: A table that says where to look
- **WHEN** "Home renovation" has a task due two days ago, "Personal admin" has an open task "passport" whose deadline passed, "Reading" has had no change for nine days, and "Work" has one task completed and one open due next week
- **THEN** the table reads "Overdue · 1 late" for Home renovation with its next due date in the danger colour, "Late · passport" for Personal admin, "Quiet · 9 days" for Reading, and "On track" with "50%" for Work

#### Scenario: Sort by health
- **WHEN** the user activates the Health header, then again, then a third time
- **THEN** the projects are ordered from Late to On track with projects that have nothing open last, then reversed with those projects still last, then back in the user's own order, and sub-projects stay under their parent each time

#### Scenario: Keyboard through the table
- **WHEN** focus is on "Home", which has the sub-project "Garden", and the user presses `j`, Left, Left, Right and Enter
- **THEN** focus moves to Garden, back to Home, Home folds and hides Garden, unfolds again, and Home opens

#### Scenario: Folded row sums its sub-projects
- **WHEN** "Home" has 2 open tasks and "Garden" under it has 3, one of them due yesterday
- **THEN** expanded, Home reads 2 open and On track and Garden reads 3 and Overdue; folded, Home reads 5 and Overdue

#### Scenario: Phone width
- **WHEN** the page is opened at 360 px wide
- **THEN** each row shows the project's name and its health word, no column is cut and the page does not scroll sideways

#### Scenario: Why on a phone
- **WHEN** the page is opened at 360 px wide and the user taps "Overdue" on Home renovation's row
- **THEN** "1 late" shows under the word, the project does not open, and a second tap hides it again

#### Scenario: Why with a mouse
- **WHEN** the table is narrower than 36 rem and the user hovers or focuses "Late" on Personal admin's row
- **THEN** a tooltip reads "passport"

#### Scenario: Read aloud
- **WHEN** a screen reader reads Reading's row at any width
- **THEN** it reads "Quiet" followed by "9 days"

#### Scenario: Large text on a phone
- **WHEN** the page is opened at 360 px wide with the browser's text size at 20 px
- **THEN** each row shows the project's full width name with its health word on the line under it, and there is no Health column
