## ADDED Requirements

### Requirement: Focus style
The user SHALL choose today's focus style, **Three tasks** (default) or **Bento**, stored as the synced additive preference `user_prefs.focus_style` (`bento`; empty or unknown reads as Three tasks and is not rewritten), from Settings › Account › How you work ("Daily focus") and from the Daily check's header menu. Three tasks SHALL behave exactly as the Daily check does without this change. The preference SHALL be written offline, converge by last-writer-wins and sync to the user's own devices only. Switching style SHALL write nothing to the focus.

#### Scenario: Default unchanged
- **WHEN** a user who never chose a style opens the Daily check
- **THEN** today's tasks are listed and `f` toggles up to three of them into the focus, as before

#### Scenario: Chosen on one device
- **WHEN** the user chooses Bento in How you work on the laptop, offline, and later syncs
- **THEN** the phone's Daily check shows the three slots after its next sync

#### Scenario: Switching keeps the focus
- **WHEN** three tasks are in today's focus in Three tasks style and the user switches to Bento
- **THEN** the same three tasks are shown in slots by their estimates, and no operation is written

### Requirement: Bento slots
In Bento style today's focus SHALL be three slots, Large, Medium and Small, each holding at most one task. A task's suggested slot SHALL follow its estimate: Small up to 30 minutes, Medium 31 to 89, Large 90 or more. `f` on a focused task SHALL remove it; on an estimated task it SHALL put the task in its suggested slot when free, and otherwise refuse with a message naming the slot's task and offering Choose a slot; on an unestimated task it SHALL open a menu of the free slots and Set estimate…, offered only when the user may edit the task. Choosing a slot SHALL write only the user's `review` row: the plain id list `focus` in display order, the additive field `focus_slots` (`L:<id>,M:<id>,S:<id>`) and `focus_date`, as one batch with Undo. Reading SHALL write nothing: a `focus_slots` entry counts only for an id in `focus`, and an id in `focus` without one takes its suggested slot when free, else the first free slot, else is listed after the slots as Not sized. The fields are not content, are written offline, converge per field by last-writer-wins and sync to the user's own devices only; completed or deleted tasks drop out as in the Daily check.

#### Scenario: Placed by estimate
- **WHEN** Bento is on and the user presses `f` on a 2-hour task, a 45-minute task and a 20-minute task
- **THEN** they fill Large, Medium and Small in that order, and the Loop home on every device lists them after sync

#### Scenario: Slot taken
- **WHEN** Large holds "Write the report" and the user presses `f` on another 3-hour task
- **THEN** nothing is written, the message reads that Large holds "Write the report", and Choose a slot lists Medium and Small if free

#### Scenario: Unestimated task
- **WHEN** the user presses `f` on a task without an estimate and Medium is free
- **THEN** a menu offers Medium, any other free slot and Set estimate…, and choosing Medium puts the task there without changing its estimate

#### Scenario: Viewer of a shared project
- **WHEN** the user presses `f` on an unestimated task of a shared project they only view
- **THEN** the menu lists the free slots without Set estimate…, and the task can be put in a slot

#### Scenario: Older device writes the focus
- **WHEN** a device without Bento replaces today's focus with three other tasks while `focus_slots` still names the old ones
- **THEN** the Bento device shows the three new tasks in slots by their estimates, with no write until the user changes a slot

#### Scenario: Older device reads the focus
- **WHEN** the user picks a Bento on the phone and opens the Loop home on a device that predates this change
- **THEN** the older device lists the same three tasks

#### Scenario: Offline
- **WHEN** the device is offline and the user fills the three slots
- **THEN** the slots show at once and the review row is uploaded on the next successful sync

### Requirement: Bento order
In Bento style the user SHALL choose an order, Frog (Large, Medium, Small; default) or Summit (Medium, Large, Small), stored as the synced additive preference `user_prefs.bento_order` (`summit`; empty or unknown reads as Frog and is not rewritten), from How you work, where it is shown only while Bento is chosen, and from the Daily check's header menu. The Daily check's slots, the Loop home's Today's focus and the Focus screen's first task SHALL follow the order, with Not sized tasks after the slots. Changing the order SHALL write only the preference, offline included, converging by last-writer-wins.

#### Scenario: Summit
- **WHEN** Bento holds a Large, a Medium and a Small task and the user chooses Summit
- **THEN** the Loop home lists Medium, Large, Small, and the Focus screen opens on the Medium task

#### Scenario: Frog by default
- **WHEN** a user turns Bento on and never chooses an order
- **THEN** the focus is listed Large, Medium, Small

#### Scenario: Not shown without Bento
- **WHEN** the style is Three tasks
- **THEN** How you work shows no Order row and the focus keeps the order it was picked in
