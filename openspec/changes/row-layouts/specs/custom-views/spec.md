## MODIFIED Requirements

### Requirement: Display panel
A list view and the New view page SHALL offer a display panel, opened from the toolbar's display button, that changes how the results are shown and never which tasks match:
- **Layout:** List (rows under group bars) or Board (one column per group, the tasks as cards, the columns in the group order).
- **Rows:** One line or Detailed (OpenSpec `row-layouts`); the view's own choice, else the account's.
- **Group by** and **Order by:** the options of "Grouping and sort options".
- **Completed tasks:** Hide (default) or Show. Show lists completed matches too, as if the query were `(query) & (open | completed)`; a query that names a state itself (`completed`, `open` or a completion date) is unchanged. Sidebar and overview counts stay counts of open matches.
- **Show on rows:** one toggle per row property (date, project, labels, estimate, assignee, deadline, start, origin), all shown by default. A hidden property is left out of every row and card of the view, and the property column keeps no room for it; the task itself still shows every property.
- **More options:** folded by default, holding the sort direction.

On a saved view every change SHALL be written to the view at once, as operations that work offline and converge per field; on the New view page the choices are kept with the page and saved with the view. The panel SHALL be a popover from 640 px and a bottom sheet below it, reachable and operable by keyboard, with every target at least 44 by 44 px on a coarse pointer.

#### Scenario: Board layout
- **WHEN** the user opens the display panel on "Waiting for", grouped by project, and chooses Board
- **THEN** each project becomes a column of cards in the group order, the choice is stored on the view, and other devices show the board after sync

#### Scenario: Show completed
- **WHEN** the user sets Completed tasks to Show on `@errand`
- **THEN** completed errands are listed with their open ones, struck through, while the sidebar's accessible name still counts only the open ones

#### Scenario: Hide a property
- **WHEN** the user turns off Estimate and Project under "Show on rows"
- **THEN** no row of the view shows an estimate or a project and the column keeps no room for them, while opening a task shows both

#### Scenario: Offline
- **WHEN** the device is offline and the user switches a view to the board layout
- **THEN** the board is shown at once and the change reaches other devices after the network returns

#### Scenario: Detailed rows for one view
- **WHEN** the account uses one-line rows and the user chooses Detailed in the display panel of "Urgent"
- **THEN** "Urgent" shows detailed rows, the choice is stored on the view, and the other lists keep one-line rows
