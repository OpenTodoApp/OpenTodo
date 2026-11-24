## MODIFIED Requirements

### Requirement: Parent task reference
A task MAY reference a parent task through the existing `parent_id` field, to any depth. A subtask SHALL belong to the same project as its parent; changing a parent's project SHALL change the project of every descendant, one operation per task. Parent changes SHALL apply locally first, work offline and converge under per-field last-writer-wins. A task whose parent is missing locally, deleted or completed SHALL be displayed at the top level of its project without any write, except an open task under a completed ancestor, which is kept ("Kept subtasks").

#### Scenario: Subtree follows the parent to a new project
- **WHEN** "Plan trip" with subtasks "Flights" and "Hotel" is moved from "Personal" to "Travel"
- **THEN** all three tasks are listed in "Travel" and none remain in "Personal", on this device now and on others after sync

#### Scenario: Parent not yet received
- **WHEN** a device receives a subtask's operations before its parent's operations
- **THEN** the subtask is shown at the top level of its project until the parent arrives, then nests beneath it, with no operation written

### Requirement: Completing a parent
Completing a parent SHALL also complete every open descendant, one completion operation per task, so the result converges on every device, unless the account chose to keep open subtasks: the synced preference `user_prefs.complete_subtasks` is empty by default (complete them) and `keep` completes only the parent; an unknown value reads as empty. Settings → General → Tasks SHALL offer the choice as one switch, "Complete subtasks with parent", on by default, with no helper text; the client SHALL NOT ask on each completion. The choice SHALL apply on every device after sync and offline as soon as it is made, and converge last-writer-wins. A bulk completion SHALL follow the same choice. Undo of a completion SHALL reopen every task that completion wrote. Reopening a parent SHALL reopen only the parent. Completing the last open subtask SHALL not complete the parent automatically but SHALL offer a one-key action to complete it. Under concurrent edits, a subtask added to a parent that was completed on another device SHALL remain open and SHALL be kept ("Kept subtasks").

#### Scenario: Complete the parent
- **WHEN** the user completes "Plan trip" while two of its subtasks are open, with the default choice
- **THEN** "Plan trip" and both subtasks gain a completion time and appear in Completed

#### Scenario: Keep open subtasks
- **WHEN** the user has turned off "Complete subtasks with parent" and completes "Plan trip" while "Book hotel" is open
- **THEN** only "Plan trip" gains a completion time, and "Book hotel" stays open and is kept

#### Scenario: Undo either way
- **WHEN** the user completes "Plan trip" with either choice and activates Undo
- **THEN** "Plan trip" and every subtask the completion completed are open again, and nothing is kept

#### Scenario: Choice offline
- **WHEN** the device is offline and the user turns the switch off
- **THEN** the next completion on this device keeps open subtasks at once, and the other devices follow after sync

#### Scenario: Last subtask completed
- **WHEN** the user completes the only remaining open subtask of "Plan trip"
- **THEN** "Plan trip" stays open showing "5/5" and a prompt offers to complete it with Enter

#### Scenario: Concurrent complete and add
- **WHEN** device A completes "Plan trip" offline while device B adds subtask "Insurance" under it offline, and both sync
- **THEN** "Plan trip" is completed, "Insurance" is open and kept, and listed in the Subtasks of "Plan trip", on both devices

## ADDED Requirements

### Requirement: Kept subtasks
An open, not deleted task with a live (not deleted) completed ancestor at any depth SHALL be **kept**. Kept is derived from synced fields, never stored or written, so it is the same on every device once `completed_at`, `deleted_at` and `parent_id` have converged, and offline it follows what the device holds. A kept task SHALL be left out of every list of open work and every count: project and Inbox lists, Today, Upcoming, Anytime and Someday, the calendar, filters and saved views, search and the command palette, sidebar and workspace counts, the app badge, progress shown in list rows, the briefing, the display and the phone widgets; and on the server, the agent tools' lists, search, Today summary and counts (MCP and the REST agent routes), `ot` lists and the weekly digest. A kept task SHALL fire no reminder, in the browser, on a phone or by push, while it is kept; a reminder due while kept SHALL fire once the task is no longer kept. A kept task SHALL stay listed with its state in its parent's Subtasks, where it can be opened, edited, completed, reopened and deleted, and `get_task` SHALL list it among the parent's subtasks. Reopening or deleting the parent (or moving the task out) SHALL end the kept state with no write. Open subtasks of completed parents that exist before this change, such as those created through MCP or REST, SHALL be kept by the same rule. A completed subtask of a completed parent is not kept.

#### Scenario: Out of lists and counts
- **WHEN** "Plan trip" is completed while "Book hotel", due today, stays open
- **THEN** "Book hotel" is not listed in Today or the project, the project's count and the badge leave it out, and a search for "hotel" does not find it

#### Scenario: In the parent's detail
- **WHEN** the user opens the completed "Plan trip"
- **THEN** its Subtasks lists "Book hotel" as open, and the user can open, edit and complete it there

#### Scenario: Reopen the parent
- **WHEN** the user reopens "Plan trip"
- **THEN** "Book hotel" is listed in Today and the project again and counts again, with no operation written for it

#### Scenario: Deeper levels
- **WHEN** "Plan trip" is completed and its open subtask "Hotel" has an open subtask "Compare prices"
- **THEN** both "Hotel" and "Compare prices" are kept

#### Scenario: No reminder while kept
- **WHEN** a reminder of "Book hotel" falls due while "Plan trip" is completed
- **THEN** no notification is shown on any device and no push is sent; after "Plan trip" is reopened the reminder fires

#### Scenario: An earlier orphan
- **WHEN** an agent completed "Plan trip" through MCP, which left "Book hotel" open, before this change
- **THEN** after the update "Book hotel" is kept and listed in the Subtasks of "Plan trip"

#### Scenario: The server agrees
- **WHEN** an AI assistant lists today's tasks or asks for the Today summary while "Book hotel" is kept
- **THEN** "Book hotel" is not in the answer, and `get_task` of "Plan trip" lists it among its subtasks
