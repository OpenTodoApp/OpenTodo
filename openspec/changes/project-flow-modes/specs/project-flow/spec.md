# Spec Delta

## Purpose

Lets a project or a section say how its tasks flow: all at once (Parallel), one step after another (Sequential), or as an ongoing Area. Defines the derived "available task" state that every list, view and tool shares.

## ADDED Requirements

### Requirement: Flow field on projects and sections
A project SHALL have a `flow_mode` with the values `parallel`, `sequential` and `area`. A section SHALL have a `flow_mode` with the values `parallel` and `sequential`, plus the empty value meaning "follow the project". Both SHALL be additive string fields with the empty string as default. Each SHALL be written through the operation log as an ordinary field, applied locally at once (offline too), and converge by last-writer-wins.

Reading rules:
- A project's empty, missing or unknown value SHALL read as `parallel`.
- A section's empty, missing or unknown value, or `area`, SHALL read as following its project.
- Clients SHALL keep a stored value they do not know unchanged, and SHALL write nothing to normalise it.
- A section that follows an area project SHALL read as `parallel`.

The fields are not user-written content and SHALL never be encrypted. Both SHALL be included in the JSON export.

#### Scenario: Existing projects after upgrade
- **WHEN** a device holds projects and sections synced before this change
- **THEN** every project reads as Parallel, every section follows its project, every list looks as before, and no operation is written

#### Scenario: Concurrent flow changes
- **WHEN** device A sets "Move house" to Sequential and device B sets it to Area, both offline, and both sync
- **THEN** every device shows the flow written with the greater timestamp

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives `flow_mode` `"staged"` for a project
- **THEN** it treats the project as Parallel and writes no operation

### Requirement: Available tasks
A task SHALL be **available** when all of the following hold:
- it is live and open
- it is not blocked by an open task (task-dependencies "Blocked state is derived")
- it is not waiting in sequence
- its start is neither Someday nor a date after the user's logical today

A subtask SHALL be available only when it meets these conditions itself and its top-level task does not wait in sequence; subtasks never form a sequence of their own. Availability SHALL say nothing about assignment, project role or archived projects: those stay the conditions of the views that use it.

Availability SHALL be computed on every device from local rows, with no field or operation of its own. It SHALL change as soon as the underlying rows change locally or arrive by sync. The web app and the server SHALL compute it with the same rules, checked against one shared set of test vectors.

#### Scenario: Deferred step
- **WHEN** a task in a parallel project starts next Monday
- **THEN** it is not available until Monday, and it is available on Monday without any write

#### Scenario: Subtask of a waiting step
- **WHEN** "Pack kitchen" waits in sequence and has the subtask "Buy boxes"
- **THEN** "Buy boxes" is not available either

#### Scenario: Server and app agree
- **WHEN** the agent tools list available tasks for a user whose devices are synced
- **THEN** they return the same tasks the web app shows as available, for every case in the shared vectors

### Requirement: Waiting in sequence
The steps of a project SHALL be taken in the project's list order:
1. its top-level tasks without a section, each one step, in manual order
2. then its live sections in order, each section one step

The manual order SHALL decide, whatever sort a person chose for display.

Which open tasks wait:
- **Sequential project:** the current step is the first step that still holds an open task that is not skipped. Every open top-level task of a later step SHALL wait in sequence.
  - Inside the current step, a Parallel section offers all its tasks.
  - A Sequential section, or one that follows the project, offers only its first open, not-skipped task in manual order; its other open top-level tasks SHALL wait in sequence.
- **Parallel project or area:** tasks without a section and tasks of Parallel sections never wait in sequence. A Sequential section offers only its first open, not-skipped task; its other open top-level tasks SHALL wait in sequence.

Rules for individual tasks:
- **Skipped:** recurring tasks, habits and tasks parked in Someday never wait in sequence and never hold a sequence.
- **Hold a sequence:**
  - a deferred task
  - a task blocked by an open task
  - a task assigned to someone else

  The tasks after it keep waiting.
- **Completed or deleted tasks** neither hold nor wait.
- **No project:** a task without a project never waits in sequence.

Waiting in sequence SHALL be derived like availability: offline, convergent, and with no write.

#### Scenario: Next step unblocks
- **WHEN** the sequential project "Move house" has, in order, "Book van", "Pack kitchen" and "Hand over keys", and the user completes "Book van" while offline
- **THEN** "Pack kitchen" becomes available at once, "Hand over keys" still waits, and the other devices show the same after sync, with no operation written beyond the completion

#### Scenario: Reopen a step
- **WHEN** the user reopens "Book van" after "Pack kitchen" became available
- **THEN** "Pack kitchen" waits in sequence again

#### Scenario: Parallel section as one step
- **WHEN** the sequential project "Launch" has the sections "Prepare" (Parallel, three open tasks) and "Ship" (follows the project, two open tasks)
- **THEN** the three tasks of "Prepare" are available together, both tasks of "Ship" wait, and once all three are completed "Ship"'s first task becomes available

#### Scenario: Sequential section in a parallel project
- **WHEN** the parallel project "Home" has the Sequential section "Paint bedroom" with "Buy paint", "Tape edges" and "Paint"
- **THEN** only "Buy paint" is available in that section, and the other tasks of "Home" are unaffected

#### Scenario: Recurring task in a sequence
- **WHEN** a sequential project starts with the weekly task "Water plants" followed by "Repot fern"
- **THEN** "Water plants" and "Repot fern" are both available, and completing an occurrence of "Water plants" changes nothing about "Repot fern"

#### Scenario: Deferred first step holds the sequence
- **WHEN** the first open step of a sequential project starts next week
- **THEN** no task of that project is available until then

#### Scenario: Concurrent reorder and completion
- **WHEN** device A moves "Hand over keys" before "Pack kitchen" while device B completes "Book van", both offline, and both sync
- **THEN** every device shows "Hand over keys" as the available step and "Pack kitchen" as waiting

### Requirement: Areas
A project whose flow is `area` SHALL behave as a parallel project for availability. It SHALL:
- show no progress ring or percentage
- never be listed as without a next action
- never be graded Quiet (see `statistics` and `method-views`)

Its sub-projects keep their own flows. An area SHALL be shown with the same name, colour and icon as any project; on the All projects page its Progress cell SHALL read "Area".

#### Scenario: Ongoing list
- **WHEN** "Home" is an area with eight open tasks and no change for three weeks
- **THEN** All projects shows "Area" in its progress column and no Quiet word, and the weekly review does not list it as without a next action

#### Scenario: Sub-project of an area
- **WHEN** the area "Home" has the sequential sub-project "Kitchen renovation"
- **THEN** "Kitchen renovation" shows its progress and offers one step at a time

### Requirement: Choosing a flow
The project menu (in the sidebar and in the page header's overflow) SHALL offer "Flow…" as a submenu (action-menus "Long lists of choices fold into a submenu") with:
- Parallel
- Sequential
- Area

Each choice has a one-line description, and the current choice is marked. The section heading menu and the board column menu SHALL offer "Flow…" with:
- Follow project (naming the project's flow)
- Parallel
- Sequential

A choice SHALL write one operation, offer Undo and apply at once.

When the user's "How you work" preference is `lists`, the items SHALL be shown only on a project or section whose stored flow is not the default, so the flow can be turned back. The command palette SHALL offer "Set project flow…" in every mode for the current project.

In a shared project, the project's flow SHALL be changeable only by those who may change its other fields (owner and admins). A section's flow SHALL be changeable by those who may rename the section. Viewers SHALL see no item. Editing SHALL be keyboard-reachable throughout.

#### Scenario: Make a project sequential
- **WHEN** a user in `companion` mode opens the menu of "Move house", chooses "Flow…" and then "Sequential"
- **THEN** the project's later steps dim at once with their markers, a toast offers Undo, and other devices show the same after sync

#### Scenario: Simple lists see nothing new
- **WHEN** a user in `lists` mode opens the menu of a parallel project
- **THEN** the menu shows no "Flow…" item, exactly as before this change

#### Scenario: Editor of a shared project
- **WHEN** an editor of the shared project "Household" opens its menu
- **THEN** no "Flow…" item is offered for the project, and the section menus still offer it

### Requirement: Waiting tasks in lists, boards and Today
In every task list and on board cards, a task waiting in sequence SHALL:
- stay in its position, dimmed like a blocked task
- carry a marker reading "After" and the title of the step it waits for: the first open task that holds it, or "After *section*" when the holding step is a section

The marker SHALL take the slot of the blocked marker. A task both blocked and waiting SHALL show the blocked marker. The marker's text alternative SHALL say "Waits for the previous step: *title*". The task SHALL remain selectable, openable and completable, and completing it SHALL write nothing for the other steps.

Today SHALL put tasks due today or earlier that wait in sequence in its collapsed Blocked group with the blocked ones, and take them out when they become available. The project header SHALL show nothing new beyond the dimmed rows. The marker SHALL not count as one of the task's seven default properties.

#### Scenario: Dimmed step with its marker
- **WHEN** "Hand over keys" waits for "Pack kitchen" in a sequential project
- **THEN** its row is dimmed and reads "After Pack kitchen", and a screen reader reads "Waits for the previous step: Pack kitchen"

#### Scenario: Due today but waiting
- **WHEN** "Pack kitchen" is due today and waits in sequence
- **THEN** Today lists it in the collapsed Blocked group, and it moves into today's tasks without a reload when "Book van" is completed

#### Scenario: Phone width
- **WHEN** a sequential project is opened at 360 px wide
- **THEN** the markers fit on the rows without horizontal scrolling, truncating the title of the step waited for

### Requirement: Flow through the API, agent tools and CLI
The `projects` collection SHALL accept and return `flow_mode` (`parallel`, `sequential` or `area`), and the `sections` collection SHALL accept and return `flow_mode` (`""`, `parallel` or `sequential`), on create and patch, with the same authentication and role rules as their other fields. A value outside the set SHALL be refused with `400 invalid_input` naming the field, and nothing SHALL be written. The sync endpoint SHALL accept any string, so a newer client's value is kept.

The agent tools and MCP SHALL:
- accept `flow_mode` on the project and section create and update tools
- return it in project and section output and in the project resources
- offer `available: true|false` on `list_tasks`, evaluated with the same rules and vectors as the web app

The CLI SHALL offer `ot tasks --available` and show a project's flow in `ot projects`.

#### Scenario: Make a project sequential via the API
- **WHEN** a script PATCHes `{"flow_mode":"sequential"}` to a project it may change, with a bearer token
- **THEN** the response is 200 with the value, and devices show the project's later steps waiting after sync

#### Scenario: Invalid value
- **WHEN** a script PATCHes `{"flow_mode":"serial"}` to a project
- **THEN** the response is 400 `invalid_input` naming `flow_mode`, and the project is unchanged

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials PATCHes a project's `flow_mode`
- **THEN** the response is 401 `unauthorized` and nothing is written

#### Scenario: An assistant asks what can be done now
- **WHEN** an MCP client calls `list_tasks` with `available: true` for a sequential project
- **THEN** only the current step's tasks are returned, the same tasks the web app shows undimmed

### Requirement: Flow in the Markdown vault
A project file in the vault SHALL carry the project's flow as the frontmatter key `opentodo-flow` with the value `sequential` or `area`, and SHALL leave the key out for Parallel. Editing the key in the file SHALL write the project's `flow_mode` on the next sync, and an unknown value SHALL be left in the file and not written. Task lines SHALL be unchanged; a section's flow SHALL not be carried by the vault.

#### Scenario: Flow written to the file
- **WHEN** "Move house" is made Sequential in the app and `ot vault` syncs
- **THEN** `Move house.md` gains `opentodo-flow: sequential` in its frontmatter, and its other frontmatter keys and body stay byte for byte

#### Scenario: Flow edited in Obsidian
- **WHEN** the user changes the key to `area` in Obsidian and the vault syncs
- **THEN** the project is an area on every device after sync
