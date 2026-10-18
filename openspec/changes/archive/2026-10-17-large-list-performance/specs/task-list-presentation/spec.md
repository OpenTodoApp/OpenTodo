## ADDED Requirements

### Requirement: Large lists stay responsive

Task lists SHALL do work in proportion to what changed, not to the size of the list or of the task store. Moving the cursor SHALL re-render only the row it leaves and the row it reaches. One write (local or from sync) SHALL read the stored tasks once for every list, count and badge on screen together, not once per component. Grouping a list SHALL take time linear in the number of tasks. With end-to-end encryption on, rows SHALL NOT each open their own query. This holds offline as online: the lists read local storage either way, and every device converges as before because only reads change.

#### Scenario: Cursor moves in a long list

- **WHEN** a project lists 2,000 tasks and the user presses `j` or `k`
- **THEN** at most the two rows whose selection changed render again

#### Scenario: One write with the sidebar and a project open

- **WHEN** a project of 2,000 tasks is open with the sidebar and one task is renamed
- **THEN** the stored tasks are read about once to update the list, the sidebar counts and the project header

#### Scenario: Synced changes refresh every view

- **WHEN** a sync batch lands while the device was offline or online
- **THEN** every open list, count and badge shows the new state from one shared read

#### Scenario: Grouping a large list

- **WHEN** 20,000 tasks fall into one group of a list
- **THEN** grouping them takes linear time (milliseconds, not seconds)
