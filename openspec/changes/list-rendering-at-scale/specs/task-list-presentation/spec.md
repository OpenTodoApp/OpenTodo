## ADDED Requirements

### Requirement: Long lists draw only what is in view
A task list SHALL let the browser skip the layout and paint of rows far from the viewport while keeping every row in the document, so keyboard navigation, find in page, drag and drop and assistive technology work on every row. One write (local or from sync) SHALL update the shared task data from the changed rows instead of reading every stored task again, and completing a task SHALL show its tick in the frame of the click. With the 10,000-task account of the performance budgets, opening the 2,000-task project, completing a task in it, a cursor move and an edit from another device SHALL stay within their budgets in `scripts/perf/budgets.json`. Only reading and drawing change, so offline behaviour and convergence are unchanged.

#### Scenario: Opening a 2,000-task project
- **WHEN** the user opens a project of 2,000 open tasks
- **THEN** the list is ready within the open-project budget, and pressing `End` then `k` reaches and selects the last rows

#### Scenario: Completing a task in a long list
- **WHEN** the user ticks a task in a 2,000-row list
- **THEN** the tick shows in the next frame, and the stored tasks are not read again in full
