# Spec Delta

## ADDED Requirements

### Requirement: New view keeps its draft
The New view page SHALL keep its draft on the device, per workspace: the query and the display options (grouping, sort, layout, completed matches, hidden properties, row layout). The draft SHALL be restored when the page is opened again, after navigating elsewhere and after a reload.

The draft SHALL be stored only in the device's local data, like the query history:
- never synced, sent to the server or exported;
- cleared on sign-out.

Rules for the draft:
- Saving it as a view SHALL clear it.
- A `?q=` query in the address SHALL replace the draft's query, and the replaced query goes into the history.
- A "Clear" action in the filter panel's header SHALL empty the query, reset the display options to the defaults and clear the draft, with Undo while its toast is shown.
- An empty query with default options stores nothing.

#### Scenario: Check something and come back
- **WHEN** the user builds `@work & due <= tomorrow`, switches the layout to board, opens Today, then presses `g f`
- **THEN** the New view page shows the same query, the board layout and the same results

#### Scenario: Survives a reload
- **WHEN** the user reloads the app on the same device with a draft on the New view page
- **THEN** the draft is restored, and another device's New view page is empty

#### Scenario: Saving clears it
- **WHEN** the user saves the draft as "Work tomorrow" and opens New view again
- **THEN** the page is empty with the usage hint, and Up in the query input recalls the saved query from the history

#### Scenario: Clear and undo
- **WHEN** the user chooses "Clear" in the filter panel's header
- **THEN** the query is empty, the options are the defaults, a toast offers Undo, and Undo brings the draft back

#### Scenario: Per workspace
- **WHEN** the user has a draft in "Work" and switches to "Personal" and opens New view
- **THEN** Personal's New view page has its own draft or none, and switching back to Work restores Work's draft

#### Scenario: Address wins
- **WHEN** a draft exists and the user opens a link to `/views/new?q=p1`
- **THEN** the page shows `p1`, and Up in the input recalls the previous draft's query

#### Scenario: Not in the export
- **WHEN** the user exports their data while a draft exists
- **THEN** the export holds no trace of the draft
