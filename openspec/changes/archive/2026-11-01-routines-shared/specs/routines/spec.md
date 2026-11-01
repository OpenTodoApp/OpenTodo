## ADDED Requirements

### Requirement: Routines of a shared project
A routine MAY carry a `project_id`; once that project is shared the routine SHALL live in the project's sharing scope like a task, sync to every member, and converge by last-writer-wins per field, offline edits included. The owner, admins and editors SHALL create, edit, reorder, turn on and off and delete it; a viewer SHALL read it and its runs, and the server SHALL refuse a viewer's writes to it. A routine of a personal project SHALL move into the shared scope when the project is first shared. Changing `project_id` across scopes SHALL be refused with `scope_change`. A shared project SHALL hold at most 50 live routines, and the per-account limit SHALL count personal routines only. A routine without `project_id` SHALL stay personal.

#### Scenario: Created by an editor offline
- **WHEN** an editor of "Household", offline, creates the routine "Weekly chores" in the project and syncs
- **THEN** every member lists it with Household's chip after their next sync

#### Scenario: Viewer refused
- **WHEN** a viewer's device submits an edit of the routine's steps
- **THEN** the operation is rejected, the routine stays as it was for every member, and the viewer's device receives the winning value

#### Scenario: First share
- **WHEN** the owner of "Household" shares it while it holds a routine
- **THEN** the routine moves into the shared scope with the project's tasks and every new member sees it

### Requirement: A shared routine acts only in its project
A shared routine's run SHALL read only its project: Find tasks, filter queries, the schedule condition, due and overdue triggers and the trigger's task SHALL see only the project's tasks. Every planned write SHALL stay in the project (its tasks, its sections, its note and its tasks' notes and comments); otherwise the run SHALL fail before writing, naming the project. REST and MCP SHALL refuse at save a shared routine whose trigger, condition or steps name another project, name a label, or move tasks out of the project. Steps that act on personal things SHALL be unavailable in a shared routine with reason `not_in_shared`: Favourite, Set today's focus, Start and Stop timer, Tracked time, Create project, Update project, Create a project from a template, Create labels, Email me and Send a webhook; Email project members SHALL be unavailable with reason `not_yet`. Event triggers of a shared routine SHALL fire on any member's changes to the project's tasks, except imports, undos, the routine's own batches and past the chain depth limit; `assigned.to_me` SHALL mean assigned to the run-as person.

#### Scenario: Anyone's change fires it
- **WHEN** Bob, an editor, adds a task to "Releases" whose routine "New task → due in 3 days" runs as Alice
- **THEN** the routine fires and the task gets its date, written with device `rule:<id>` and Alice as author

#### Scenario: Find stays in the project
- **WHEN** "Weekly chores", running as Alice, finds every open task due this week
- **THEN** it finds only Household's tasks, never Alice's personal ones

#### Scenario: Outside the project
- **WHEN** a shared routine's Change tasks step would move tasks to another project
- **THEN** saving it is refused as invalid with "a shared routine acts only in its project"

#### Scenario: Personal steps
- **WHEN** an editor opens Add step in a shared routine and searches "focus"
- **THEN** Set today's focus is listed dimmed with "Not available in a shared routine"

### Requirement: Runs as whoever last turned it on
The server SHALL record the author of the winning `enabled: true` of a shared routine as its run-as person. Every event, schedule, due and overdue run SHALL happen only while that person is the project's owner, admin or editor, SHALL read the project as that person, and SHALL write through `ApplyStrict` with device `rule:<rule-id>` and that person as author, so it never does more than that person can do now and never more than an editor. A shared routine nobody has turned on SHALL not run on its own. Run now and Test SHALL run as the member who asks; a viewer's run SHALL be refused with 403 `forbidden`. The routine's representation SHALL name the run-as person and every run SHALL record it.

#### Scenario: Turned on by Alice
- **WHEN** Alice turns on "Weekly chores" and it runs on Monday
- **THEN** the run's `run_as` is Alice and the routine reads "Runs as Alice"

#### Scenario: Turned on again by Bob
- **WHEN** Bob turns the routine off and on again
- **THEN** later runs record Bob as the run-as person

#### Scenario: Viewer cannot run it
- **WHEN** a viewer asks to run a shared routine now
- **THEN** the response is 403 `forbidden` and nothing runs

### Requirement: Edits by another member pause the routine
When a winning change to a shared routine's `trigger`, `condition`, `steps`, `actions`, `ai_apply` or `ai_budget` is authored by someone other than the run-as person, and the same batch does not turn it on, the server SHALL pause the routine with reason `edited_by_other` naming the editor; it SHALL not run until someone turns it on again, who becomes the run-as person. Renames, reordering and switching it on or off SHALL not pause it. The editor SHALL say so before such an edit is saved.

#### Scenario: Bob edits Alice's routine
- **WHEN** Bob adds a step to "Weekly chores", which runs as Alice
- **THEN** before saving the editor says "Saving pauses this routine: it runs as Alice", after saving the routine shows "Paused: edited by Bob", and no run uses Alice's role or tokens

#### Scenario: Rename does not pause
- **WHEN** Bob renames the routine
- **THEN** it keeps running as Alice

### Requirement: AI in shared routines
AI steps of a shared routine SHALL use the run-as person's assistant provider, routines consent, monthly allowance and the routine's daily budget, and their tokens SHALL be counted to that person. Apply without asking SHALL be effective only when the winning `ai_apply` op was authored by the run-as person; otherwise the AI mode SHALL read as fallback `not_run_as` and runs SHALL be proposals for the run-as person. Agents SHALL still never turn it on.

#### Scenario: Tokens to the run-as person
- **WHEN** "Weekly chores", running as Alice, makes an Ask AI call of 2,000 tokens
- **THEN** Alice's usage counts 2,000 tokens tagged routine, and Bob's does not change

#### Scenario: Auto mode set by someone else
- **WHEN** the winning `ai_apply = "auto"` was written by Bob while the routine runs as Alice
- **THEN** the routine's runs are proposals, never applied without asking

### Requirement: Shared routine runs for members
Every member of the project, viewers included, SHALL see a shared routine's runs in its History, on the all-runs page and in the run detail. Undo run SHALL be offered to editors and above and SHALL write as the person undoing; a viewer's undo SHALL be refused with 403 `forbidden`. The Inbox card and the bell for failures and proposals SHALL stay with the run-as person. The run routes SHALL answer 404 `not_found` to someone who is not a member, and 401 without credentials.

#### Scenario: A viewer's history
- **WHEN** a viewer of "Household" opens the History of "Weekly chores"
- **THEN** the runs are listed with "Ran as Alice" and no Undo

#### Scenario: Not a member
- **WHEN** a user who is not a member requests the runs of a shared routine
- **THEN** the response is 404 `not_found`

#### Scenario: Runs require authentication
- **WHEN** a request without credentials asks for a shared routine's runs
- **THEN** the response is 401 `unauthorized`

### Requirement: When the run-as person loses access
When the run-as person leaves the project, is removed, becomes a viewer or their account is gone, the server SHALL pause every routine of the project running as that person with reason `run_as_left` or `run_as_viewer`, after the membership change and at the latest before the next run, and SHALL notify the project's owner, admins and editors in app (`routine_paused_shared`). A routine of a project in the Trash SHALL not run; purging the project SHALL remove its routines.

#### Scenario: Alice leaves
- **WHEN** Alice leaves "Household" while "Weekly chores" runs as her
- **THEN** the routine is paused for every member, Bob and the owner get the notification, and nothing runs until someone turns it on

#### Scenario: Demoted to viewer
- **WHEN** an admin changes Alice to viewer
- **THEN** routines running as Alice pause with `run_as_viewer`

### Requirement: Shared routines and encryption
A shared routine SHALL run on the server even when the run-as person's account is end-to-end encrypted, reading only the plaintext project and never the person's encrypted personal data. Clients SHALL write a shared routine's name and step text in plaintext. A shared routine whose text is encrypted SHALL fail its run with reason `encrypted` and a message asking to open and save it again.

#### Scenario: Encrypted member's routine
- **WHEN** Carol, whose account is encrypted, turns on a routine of "Household" that comments on overdue tasks
- **THEN** it runs on the server as Carol and the comments are plaintext in the shared project

### Requirement: Shared routines in the CLI and MCP
`ot routine list` SHALL show each routine's project and run-as person, and `ot routine create --project <name|id>` (or a `project` key in the file) SHALL create a routine of that project. The MCP `create_routine` tool SHALL accept `project`, and `list_routines` and `get_routine` SHALL include `project_id` and `run_as`. Agent writes SHALL follow the token user's role.

#### Scenario: Create from the CLI
- **WHEN** an editor runs `ot routine create --project Household --file chores.yaml`
- **THEN** the routine is created in Household and `ot routine list` shows Household in its PROJECT column

### Requirement: Shared routines in the editor
"New routine" SHALL ask Where in an anchored menu ("Just me" or each shared project where the user is editor or above) when such a project exists. A routine of a project SHALL show the project and "Runs as <name>" (or "Not turned on yet") in its row and the editor's header, and the editor SHALL be read-only for a viewer. Add step SHALL mark the steps unavailable in a shared routine. The project's menu SHALL offer **Routines**, opening the Routines page filtered to that project.

#### Scenario: Where
- **WHEN** an editor of "Household" chooses New routine
- **THEN** an anchored menu offers "Just me" and "Household", and choosing Household opens the editor for a routine of Household

#### Scenario: Project menu
- **WHEN** a member opens Household's menu and chooses Routines
- **THEN** the Routines page lists only Household's routines with a removable filter
