## MODIFIED Requirements

### Requirement: Save and edit a view from the Filter view
The Filter view SHALL offer a "Save view" action (button and `s` shortcut when focus is in the result list) that asks for a name and creates a pinned view with the current query, grouping and sort. Opening a saved view SHALL show its query in an editable input. The same visual builder as the Filter view SHALL edit it, hidden by default on a saved view and shown with the Builder toggle. Changing the query, in the input or in the builder, or the options SHALL update the view after confirmation; until then the builder's count shows how many tasks the changed query would match. A saved view whose query no longer parses SHALL show the parse error and no results. The view stores only the query text, so a change made with the builder syncs and converges like a typed one.

#### Scenario: Save the current query
- **WHEN** the user runs a query in the Filter view, presses `s`, types "Work tomorrow" and confirms
- **THEN** "Work tomorrow" appears in the sidebar under "Views" and opening it shows the same results

#### Scenario: Edit a saved query
- **WHEN** the user opens "Work tomorrow", changes the query to add `& !@waiting` and confirms
- **THEN** the view's results update, and the changed query is shown on other devices after sync

#### Scenario: Edit a saved query with the builder
- **WHEN** the user opens "Work tomorrow", shows the builder, adds the condition "Label is waiting" with Not set, and confirms with Save
- **THEN** the stored query ends with `& !@waiting`, the results update, and another device shows the same query text after sync

#### Scenario: Count before saving
- **WHEN** the user changes a saved view's query in the builder without confirming
- **THEN** the builder shows how many tasks the changed query matches, while the list still shows the saved query's results
