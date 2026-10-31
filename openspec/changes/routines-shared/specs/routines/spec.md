## ADDED Requirements

### Requirement: Routines of a shared project
A routine MAY carry a `project_id`; it SHALL then live in that project's sharing scope like a task, sync to every member, and converge by last-writer-wins per field, offline edits included. The owner, admins and editors SHALL create, edit, reorder, enable, disable and delete it; a viewer SHALL read it and its runs, and the server SHALL refuse a viewer's writes to it. A routine created in a personal project SHALL move into the shared scope when the project is first shared. Changing `project_id` across scopes SHALL be refused with `scope_change`. A shared project SHALL hold at most 50 live routines. A routine without `project_id` SHALL stay personal.

#### Scenario: Created by an editor offline
- **WHEN** an editor of "Household", offline, creates the routine "Weekly chores" in the project and syncs
- **THEN** every member lists it under Household's routines after their next sync

#### Scenario: Viewer refused
- **WHEN** a viewer's device submits an edit of the routine's steps
- **THEN** the operation is rejected, the routine stays as it was for every member, and the viewer's device discards its change

#### Scenario: First share
- **WHEN** the owner of "Household" shares it while it holds a routine
- **THEN** the routine moves into the shared scope with the project's tasks and every new member sees it

### Requirement: A shared routine acts only in its project
A shared routine SHALL read and write only its project: Find tasks and filter queries SHALL search only its tasks, the trigger's task and every target SHALL be in it, Create tasks SHALL create in it, and Change tasks SHALL not move tasks out of it. Steps that act on personal things SHALL be unavailable in a shared routine with reason `not_in_shared`: Favourite, Set today's focus, Start and Stop timer, Tracked time, Create project, Update project, Create a project from a template, Create labels and label changes, Email me and Send a webhook. Notify me SHALL offer the recipients "the person it runs as" and "the project's members". Event triggers of a shared routine SHALL fire on any member's changes in the project, with the usual exceptions for imports, undo and loop protection.

#### Scenario: Anyone's change fires it
- **WHEN** Bob, an editor, adds a task to "Releases" whose routine "New task → due in 3 days" runs as Alice
- **THEN** the routine fires and the task gets its date, the history reading "Routine (New task → due in 3 days), running as Alice"

#### Scenario: Outside the project
- **WHEN** a shared routine's Change tasks step would move tasks to Alice's personal project
- **THEN** the write is refused at save as invalid, naming the project

#### Scenario: Personal steps
- **WHEN** an editor opens Add step in a shared routine and searches "focus"
- **THEN** Set today's focus is listed dimmed with "Not available in a shared routine"

### Requirement: Runs as whoever last turned it on
The server SHALL record the author of the winning `enabled: true` of a shared routine as its run-as person. Every run SHALL act with that person's current role in the project, checked when planning and when writing, so it never does more than that person can do now and never more than an editor; it SHALL write with device `rule:<rule-id>` and that person as author. The run log, each run and the routine's row SHALL name the run-as person.

#### Scenario: Turned on by Alice
- **WHEN** Alice turns on "Weekly chores" and it runs on Monday
- **THEN** the run reads "Ran as Alice" and the tasks' history names the routine running as Alice

#### Scenario: Turned on again by Bob
- **WHEN** Bob turns the routine off and on again
- **THEN** later runs read "Ran as Bob"

### Requirement: Edits by another member pause the routine
When a winning change to a shared routine's trigger, condition, steps, `ai_apply` or `ai_budget` is authored by someone other than the run-as person, the server SHALL pause the routine with reason `edited_by_other` naming the editor; it SHALL not run until someone turns it on, who becomes the run-as person. Renames, reordering and switching it on or off SHALL not pause it. The editor SHALL say so before such an edit is saved. The pause SHALL be server state compared with op times, so devices converge.

#### Scenario: Bob edits Alice's routine
- **WHEN** Bob adds an Ask AI step to "Weekly chores", which runs as Alice
- **THEN** before saving the editor says "Saving pauses this routine: it runs as Alice", after saving the routine shows "Paused: edited by Bob", and no run uses Alice's role or tokens

#### Scenario: Concurrent edits
- **WHEN** Alice renames the routine and Bob changes its steps, both offline, and both sync
- **THEN** every member shows the new name and Bob's steps, and the routine is paused for Bob's edit

### Requirement: AI in shared routines
AI steps of a shared routine SHALL use the run-as person's assistant provider, routines consent, monthly allowance and usage, and the routine's daily budget, and their tokens SHALL be counted to that person. Without the run-as person's consent the AI steps SHALL be unavailable for everyone with "<name> has not allowed AI in routines". Apply without asking SHALL be effective only when the run-as person turned it on; otherwise runs SHALL be proposals that any editor may review and apply within their own role.

#### Scenario: Tokens to the run-as person
- **WHEN** "Weekly chores", running as Alice, makes an Ask AI call of 2,000 tokens
- **THEN** Alice's usage counts 2,000 tokens tagged routine, and Bob's does not change

#### Scenario: Auto mode by another editor
- **WHEN** Bob turns on Apply without asking while the routine runs as Alice
- **THEN** the routine pauses for Bob's edit, and once Bob turns it on it runs as Bob in auto mode

### Requirement: Shared routine runs for members
Every member of the project, viewers included, SHALL see a shared routine's runs in its History, on the all-runs page and in their Inbox card, limited to runs whose touched items they can see, with items they cannot see shown by id as "Task you cannot see". Undo run and reviewing proposals SHALL be offered to editors and above. Failures and waiting proposals SHALL appear in the Inbox cards and bells of editors and above; successes in every member's card, under each member's own seen marker and settings. The run routes SHALL answer 404 `not_found` to someone who is not a member.

#### Scenario: A viewer's card
- **WHEN** a viewer of "Household" opens the Inbox after "Weekly chores" ran
- **THEN** the card lists "Weekly chores · 6 tasks assigned", and offers no Undo

#### Scenario: Not a member
- **WHEN** a user who is not a member requests the runs of a shared routine
- **THEN** the response is 404 `not_found`

#### Scenario: Runs require authentication
- **WHEN** a request without credentials asks for a shared routine's runs
- **THEN** the response is 401 `unauthorized`

### Requirement: When the run-as person loses access
When the run-as person leaves the project, is removed, becomes a viewer, or their account is disabled or deleted, or the project is unshared, the server SHALL pause every routine of the project running as that person with the reason (`run_as_left`, `run_as_viewer`, `unshared`), and SHALL notify the project's owner, admins and editors in app and in their Inbox cards: "<routine> paused: <name> no longer edits <project>. Turn it on to run it as you." Deleting the project SHALL move its routines to the Trash with it.

#### Scenario: Alice leaves
- **WHEN** Alice leaves "Household" while "Weekly chores" runs as her
- **THEN** the routine is paused for every member, Bob and the owner get the notification, and the next Monday nothing runs until someone turns it on

#### Scenario: Demoted to viewer
- **WHEN** an admin changes Alice to viewer
- **THEN** routines running as Alice pause with "Alice can no longer edit Household"

### Requirement: Email project members
In a shared routine, the step Email project members SHALL be available while outgoing email is configured and the instance is not a demo, and SHALL send one plain-text routine message to each member of the project with a verified address, in each member's language, with a link to stop emails from this routine; a member who stops them SHALL receive no more from it. Each message SHALL count toward the routine's and the run-as person's daily email limits and the mail service's limits.

#### Scenario: Friday summary to the household
- **WHEN** "Friday summary" emails the members of "Household", three of whom have verified addresses
- **THEN** three messages are sent, each with the stop link, and the run counts three emails

#### Scenario: A member stops them
- **WHEN** Carol follows the stop link and the routine runs again
- **THEN** Carol receives nothing and the others receive the message
