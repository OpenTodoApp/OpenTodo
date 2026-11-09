## ADDED Requirements

### Requirement: A bulk action that empties the selection closes the menu
When an action from the Actions menu takes every ticked task out of the list, the menu SHALL close and SHALL NOT turn into the menu of a single task. No task SHALL open in the side panel or the Inbox pane because of it: the panel follows the cursor only while the cursor's task is in the list.

#### Scenario: Removing a label page's label from all its tasks
- **WHEN** both tasks of a label page are ticked and the user removes that label from them through Actions → Labels
- **THEN** the page shows its empty state, no menu is open, and no task opens in the side panel
