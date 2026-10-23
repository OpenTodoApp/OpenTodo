## MODIFIED Requirements

### Requirement: Filter view
The client SHALL provide a Filter view, called "New view" in the interface (OpenSpec `custom-views` "Saved filters and boards in the user interface"), opened with `g f`, from the sidebar's More group and from the Views overview's "New view" action, at `/views/new`. It SHALL use the page header (title "Views › New view", actions Save as view and Help), the toolbar of `custom-views` "Toolbar filter chips", a filter panel holding the visual builder and the query input, the usage hint shown while the query is empty, the error or warning line, and live results grouped and ordered as a saved view (by project and due date unless the display panel says otherwise) with the standard task rows and keyboard navigation.

The filter panel SHALL open in place under the toolbar, so the results stay in view. Its header reads "Filter" with the number of matching tasks; above the query input it SHALL offer a visual builder of the same query:
- **Conditions:** each term is a chip that reads in words (for example "Label is errand", "Due on or before tomorrow", "Priority is P1", "No project").
- **Groups:** a group is a visible block headed "All of these" (`&`) or "Any of these" (`|`) with actions to add a condition and to add a group, nested at most three levels deep. "Not" can be set on any condition or group.
- **Editing:** adding or changing a condition SHALL pick what it filters on, then its value, using the app's pickers (labels and projects through the Combobox).
- **Count:** the panel SHALL show how many tasks the query matches, updated live.

The query input is the panel's formula line, under the builder, with "Edit as text" to focus it; it SHALL stay the stored form. A change in the builder SHALL rewrite the input with the fewest parentheses the grammar needs. A change in the input that parses SHALL update the builder. A query the builder cannot show (a double negation, or groups nested deeper than three levels) SHALL stay editable in the input, with a notice in place of the builder. The toolbar's filter button SHALL show or hide the filter panel; the choice is kept per device and per screen, open by default on the New view page. While the panel is hidden, `Esc` from the results and the empty view's "Clear the filter" open it again with focus in the query input.

Inside a group, the arrow keys SHALL move between conditions and Delete or Backspace SHALL remove the focused one. Every control SHALL be reachable by keyboard. At 360 px the conditions stack and every target is at least 44 by 44 px.

The builder only reads and writes the query text. It works offline like the rest of the view, and a saved query keeps converging as one field of the view.

#### Scenario: Open and run a query
- **WHEN** the user presses `g f`, types `@work & due <= tomorrow & p1` and presses Enter
- **THEN** the matching tasks are grouped by project and the first result is selected

#### Scenario: Hint folds away
- **WHEN** the user has typed a query that returns results
- **THEN** the usage hint is gone and the results start directly below the filter panel

#### Scenario: Build a query without typing
- **WHEN** the user adds a condition "Label is work", then a condition "Due on or before tomorrow", then a group "Any of these" with "Priority is P1" and "Priority is P2"
- **THEN** the input reads `@work & due <= tomorrow & (p1 | p2)`, and the count and the results show the tasks that match it

#### Scenario: Typing updates the builder
- **WHEN** the user types `(@errand | @call) & !p4` into the input
- **THEN** the builder shows "All of these" containing an "Any of these" group with "Label is errand" and "Label is call", and the condition "Priority is P4" marked Not

#### Scenario: Not on a group
- **WHEN** the user sets Not on a group holding "Label is waiting" and "Someday"
- **THEN** the input reads `!(@waiting | someday)` within the surrounding query

#### Scenario: Remove with the keyboard
- **WHEN** focus is on the chip "Priority is P1" and the user presses Delete
- **THEN** the chip is removed, focus moves to the next chip in the group, and the input drops `p1` along with its connective

#### Scenario: A query the builder cannot show
- **WHEN** the user types `!!p1`
- **THEN** the input keeps the query and its results, and the builder is replaced by a notice that this query can only be edited as text

#### Scenario: Builder folded away
- **WHEN** the user hides the filter panel with the filter button and reloads the app on the same device
- **THEN** the New view page opens with the panel hidden and the conditions still shown as chips, while another device still shows the panel

#### Scenario: Phone width
- **WHEN** the Filter view is shown at 360 px with a group of three conditions
- **THEN** the conditions stack in one column, nothing overflows the screen, and every chip and button is at least 44 by 44 px
