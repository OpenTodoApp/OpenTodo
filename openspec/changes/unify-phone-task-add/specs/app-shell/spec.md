# Spec Delta

## ADDED Requirements

### Requirement: Contextual phone task capture
Below 768 px, task-list section and board-column add actions SHALL open the same quick-add sheet as the floating Add task button, with the initiating project and section as defaults, including an explicit No section. This SHALL apply with New phone screens on or off. An explicit project chosen in the input SHALL override the initiating project; when it differs, the initiating section SHALL NOT be applied. Defaults SHALL apply to single tasks and every line of a pasted batch. Adding SHALL use the existing local operations, work offline, and converge through sync as ordinary task creation does.

The sheet SHALL keep its initiating context while adding successive tasks, retain the visible send control when the software keyboard is dismissed, and clear its contextual defaults when closed or when the page changes. A new opening from the floating Add task button SHALL use only the current view's ordinary defaults. Existing native text prefill, preferred placement, reusable-list behavior, Undo, and view defaults SHALL remain available.

#### Scenario: Repeated section capture
- **WHEN** a person taps Doing's plus on a phone and submits two tasks without closing the sheet
- **THEN** the sheet stays open after each add and both tasks are saved in Doing's project and section

#### Scenario: Project override and pasted tasks
- **WHEN** a pasted batch opened from Doing contains one task without a project and one with an explicit different project
- **THEN** the first task belongs to Doing and the second belongs to the chosen project without Doing's section

#### Scenario: Context does not leak
- **WHEN** the person closes a section's sheet and opens quick add from the floating button, or navigates to another page
- **THEN** the old section default is cleared and subsequent capture uses the new opening's view defaults

#### Scenario: No section
- **WHEN** a person adds through a phone board's No section control
- **THEN** the sheet saves the task to that project with no section

#### Scenario: Offline section capture
- **WHEN** an offline phone creates a task from a section and reconnects
- **THEN** the task appears in that section immediately and another device receives the same project and section through sync

#### Scenario: Keyboard dismissed
- **WHEN** the person types in the sheet and dismisses the phone keyboard
- **THEN** the sheet's send control remains available and adds the typed task without opening a competing inline draft
