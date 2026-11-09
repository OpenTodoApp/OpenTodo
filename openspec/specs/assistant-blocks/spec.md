# assistant-blocks Specification

## Purpose
The in-app assistant shows what it talks about as the app's own interface: tasks, a day or week, places, notes, project outlines and choices appear as blocks in its answers, rendered on the device from local data. The transcript around those answers keeps the answer's steps, offers actions on messages and follows the stream.

## Requirements

### Requirement: Display tools
The in-app assistant SHALL be offered six display tools, identical on server and device: `show_tasks` (up to 20 task ids and an optional title), `show_calendar` (a date and a span of `day` or `week`), `ask_choice` (a question and 2 to 4 options), `show_map` (up to 20 task or place ids), `show_note` (a note id) and `show_project` (a project id). Text arguments SHALL be length-capped by the tool's schema. A display tool SHALL change nothing and SHALL not count toward the proposal's limit.

#### Scenario: A display tool writes nothing
- **WHEN** the model calls `show_tasks` with three task ids during a turn
- **THEN** no op is written, no change set is proposed for it, and the answer shows the three tasks

### Requirement: Display tools are for the in-app assistant only
Display tools SHALL be offered only to the in-app assistant. They SHALL never be offered to MCP clients, to routines' AI steps, or to an agent token. A skill SHALL offer only the display tools its definition lists.

#### Scenario: Skill without display tools
- **WHEN** a turn runs a skill whose definition lists no display tool
- **THEN** the model is offered no display tool in that turn

#### Scenario: Not offered to MCP
- **WHEN** an MCP client lists the server's tools with an `agent` token
- **THEN** none of the display tools is listed

#### Scenario: Same tools on the device
- **WHEN** an encrypted account runs an on-device turn
- **THEN** the device offers the same display tools with the same schemas as the server's assistant

### Requirement: Display tools are checked
Before a block is shown, each id SHALL be checked: it names an entity of the expected kind that exists, is not deleted, is visible to the user and is not in a project kept away from AI assistants (the server checks synced data, the device its local data). Failing ids SHALL be left out and reported only as "not found". A call whose ids all fail, or whose arguments fail the schema, SHALL show nothing and return an error result. A tool result SHALL name the kind and count shown, never content.

#### Scenario: Unknown id left out
- **WHEN** the model calls `show_tasks` with two existing task ids and one unknown id
- **THEN** the block shows the two tasks and the tool result says two were shown and one was not found

#### Scenario: Excluded project
- **WHEN** the model calls `show_project` with the id of a project the user keeps away from AI assistants
- **THEN** no block is shown and the tool result is the same "not found" error as for an unknown id

### Requirement: Block limit per turn
A turn SHALL show at most 4 blocks. A further display call SHALL show nothing and return an error result saying the turn's block limit is reached.

#### Scenario: Fifth block refused
- **WHEN** the model has shown 4 blocks in a turn and calls `show_map`
- **THEN** no fifth block is shown and the tool result says the turn's block limit is reached

### Requirement: Block events carry no content
The turn stream, on the server and on the device, SHALL carry each shown block as one block event holding its kind and its checked parameters (ids, a date and span, a question and options), never the content of the entities it names. A client that does not know an event type SHALL skip it, so the rest of the answer still reads.

#### Scenario: Block event without titles
- **WHEN** a consented user asks "show me what's overdue" and the model calls `show_tasks` with three task ids
- **THEN** the turn route streams a block event of kind `tasks` with those three ids and no task title, between the text before and after the call

### Requirement: Blocks in the conversation
Each shown block SHALL arrive in the answer at the point in the text where the model called it. It SHALL be stored with the message in the device's local conversation as its kind and checked parameters only, never the content it displays. Blocks follow the existing conversation rules: on the device only, never synced, cleared with the conversation and at sign-out.

#### Scenario: Stored without content
- **WHEN** an answer showed a task list and the user inspects the stored conversation on the device
- **THEN** the stored block holds the kind and the task ids, and no task title

### Requirement: Blocks render live from local data
A block SHALL render from the device's current local data each time it is drawn, so edits from this device or synced from another show in it. A block whose entity was deleted, or is no longer visible, SHALL show "Removed". An encrypted account's blocks SHALL show decrypted values. Blocks SHALL render offline.

#### Scenario: Live after an edit
- **WHEN** an answer showed a task list and the user later completes one of those tasks on another device
- **THEN** after sync, the block in the past conversation shows that task as done

#### Scenario: Deleted entity
- **WHEN** a past answer showed a note that has since been moved to the Trash
- **THEN** the note block reads "Removed" and the rest of the answer is unchanged

#### Scenario: Offline
- **WHEN** the device is offline and the user opens a past conversation with a calendar block
- **THEN** the calendar block renders from local data

### Requirement: Task list block
A `show_tasks` block SHALL show its title, when given, and the tasks in the order given, as the app's task rows. Ticking a row SHALL complete or reopen the task through the app's normal operation: local first, offline-capable, converging like any completion, with the Undo toast. Activating a title SHALL open the task. The block SHALL not scroll on its own.

#### Scenario: Complete from the block
- **WHEN** the answer shows three overdue tasks and the user ticks the first one
- **THEN** the task is completed as an op from this device, the toast offers Undo, and the row shows it done

#### Scenario: Offline completion converges
- **WHEN** the user ticks a task in a block while offline and another device edits that task's title meanwhile
- **THEN** after both sync, the task is done and carries the other device's title on both devices

### Requirement: Calendar block
A `show_calendar` block SHALL show the given day, or the week starting on it, as a compact agenda: each day's heading with its planned total against the working day as the calendar counts it, then the day's dated tasks in time order (untimed first) with their estimates. It SHALL draw no time grid and have no scroll region of its own. Activating a day SHALL open that day in the calendar, and activating an item SHALL open its task. The block is read-only: a change to the plan is always a proposal.

#### Scenario: A day
- **WHEN** the model calls `show_calendar` for Thursday with span `day`
- **THEN** the block shows Thursday's dated tasks at their times and the day's planned total against the working day

### Requirement: Choice block
An `ask_choice` block SHALL show the question and one button per option, plus "Something else" which puts the focus in the composer. Choosing an option SHALL send the option's text as the user's next message, through the same path and limits as a typed message. Only the choice block of the latest answer SHALL be active. Once an option is chosen, or a later message exists, its buttons SHALL be disabled and the chosen option marked. Offline, the buttons SHALL be disabled like the composer.

#### Scenario: Pick an option
- **WHEN** an answer asks "Move Clean garage to Saturday or Sunday?" with those two options and the user activates "Saturday"
- **THEN** "Saturday" is sent as the next message, the block marks it chosen, and both buttons are disabled

#### Scenario: Older choice
- **WHEN** the user scrolls up to a choice block in an earlier answer of the thread
- **THEN** its buttons are disabled

### Requirement: Map block
While maps are on for the server, a `show_map` block SHALL show the given tasks' places and the given saved places as markers, with the same items as a numbered list under the map; each marker carries its item's number and name. Tiles and search go only through the server's map proxy. While maps are off, the block SHALL show only the list (names and addresses) and contact no map provider. Activating a list item SHALL open its task or place.

#### Scenario: Maps on
- **WHEN** the model calls `show_map` with two tasks that have places and maps are on
- **THEN** the block shows a map with two numbered markers and a list of the two tasks with their place names

#### Scenario: Maps off
- **WHEN** the owner has turned maps off and the model calls `show_map`
- **THEN** the block shows the list only and the device makes no map request

### Requirement: Note and project blocks
A `show_note` block SHALL show the note's title and the start of its body, rendered as Markdown and cut to at most 12 lines, with "Open note". A `show_project` block SHALL show the project's name, its sections and the number of open tasks in each, with "Open project". Both are read-only.

#### Scenario: Project outline
- **WHEN** the model calls `show_project` for a project with sections "Design" (3 open) and "Build" (5 open)
- **THEN** the block shows the project name, both sections with their counts, and "Open project"

### Requirement: Task links in answers
The fixed instructions of the in-app assistant, on the server and on the device, SHALL tell the model to write every task it names in prose as a link of the form `[title](?task=<id>)`. Such a link SHALL render as the app's task link: the task's current title and done state, opening the task when activated, when the task is on this device; otherwise the link text, muted and not a link. Link text is the model's output and SHALL render as text, never as markup.

#### Scenario: Linked task
- **WHEN** the answer says "Start with [Pay taxes](?task=t1)" and the user has since renamed t1 to "Pay taxes 2026"
- **THEN** the answer shows "Pay taxes 2026" as a link that opens the task

### Requirement: Steps of an answer
The progress lines of a turn SHALL be kept on the answer. While the answer streams, the latest line SHALL show as it does today. Once the answer ends, a collapsed disclosure reading "n steps" SHALL list every line in order. The disclosure SHALL be closed by default, reachable by keyboard, and SHALL not be announced as new content.

#### Scenario: After the answer
- **WHEN** a turn read Today and searched for "tax" before answering
- **THEN** the finished answer shows "2 steps" and opening it lists both progress lines in order

### Requirement: Message actions
The latest answer SHALL offer Regenerate, which runs the same conversation again in place of that answer. The latest question SHALL offer Edit, which puts its text back in the composer; sending it replaces that question and everything after it. Both follow sending's rules and are unavailable while streaming, offline, or for a question that carried pasted text or photos, which are not kept. A replaced unapplied proposal SHALL be discarded; an applied one stays applied with its Undo.

#### Scenario: Regenerate
- **WHEN** the user activates Regenerate on the latest answer, whose proposal was not applied
- **THEN** a new turn runs with the same messages, the old answer and its proposal are replaced, and the thread keeps one answer to that question

#### Scenario: Question with pasted text
- **WHEN** the latest question carried pasted text
- **THEN** neither Regenerate nor Edit is offered, and Copy still is

#### Scenario: Edit the last question
- **WHEN** the user activates Edit on "plan my week", changes it to "plan my week, no meetings Friday" and sends it
- **THEN** the old question and its answer are removed from the thread and the new question is answered

### Requirement: Copy an answer
Each finished answer SHALL offer Copy, which copies its text as Markdown with each block written as plain text: a list of task titles, the day's items, the choice's question and options.

#### Scenario: Copy with a block
- **WHEN** the user copies an answer that showed two tasks in a block
- **THEN** the clipboard holds the answer's Markdown with the two task titles as a list where the block was

### Requirement: Following the stream
While an answer streams, the transcript SHALL keep its newest line in view. When the user scrolls up, the transcript SHALL stop following and show "Jump to latest", which scrolls to the end and resumes following. Following SHALL use the transcript's existing scroll region, add none, and honour reduced motion by jumping instead of animating.

#### Scenario: Reading back while it streams
- **WHEN** an answer is streaming and the user scrolls up to an earlier block
- **THEN** the transcript stays where the user scrolled and "Jump to latest" appears

### Requirement: Blocks are accessible
Every block SHALL be a labelled group named from its parameters (for example "3 tasks" or "Map, 2 places"), and SHALL be reachable and usable by keyboard with the app's normal list and button keys. No block SHALL add a shortcut. The live region SHALL announce a block once, by that label, at the point where it arrives in the answer, never its content row by row. Blocks SHALL use the design tokens and the shared building blocks, and show icons through `<Icon>`.

#### Scenario: Screen reader
- **WHEN** an answer with a task list block streams with a screen reader on
- **THEN** the live region announces the text at sentence boundaries and "3 tasks" once where the block arrives
