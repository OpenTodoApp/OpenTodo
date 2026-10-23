## MODIFIED Requirements

### Requirement: Phone header actions
Below 768 px a list SHALL show its actions in the shell's bar and its overflow menu, never as a row of controls between the bar and the quick add, so the rule "Nothing between the header and the list" holds at every width. The bar SHALL show at most two visible actions: Process the Inbox in the Inbox, the Ask action in Today when the assistant is available, and otherwise the duration filter where the view has one; Display mode, "Select tasks", the duration filter when the slots are taken, and the rest SHALL be in the overflow. The Inbox SHALL have no subtitle: its planned tasks without a project are the last group of its list (OpenSpec `web-app`, "Standard views"). An active filter SHALL show as one chip with a clear control in the bar, not above the list.

#### Scenario: Today on a phone
- **WHEN** Today with ten tasks opens on a 390×844 phone
- **THEN** the only chrome above the first task is the bar and the quick add, Display mode is in the bar's overflow, and at least four tasks are visible without scrolling

#### Scenario: Inbox on a phone
- **WHEN** the Inbox with eight tasks and three planned tasks without a project opens on a phone
- **THEN** the bar shows "Process 8" as a visible action, no subtitle, and no row of controls under it; the three planned tasks are the folded group at the end of the list

#### Scenario: Filter chip in the bar
- **WHEN** the user picks "Quick wins" from the filter in the bar of a project on a phone
- **THEN** the list is filtered and one chip with a clear control appears in the bar, and the first task keeps its place under the quick add

### Requirement: Skeleton loading
While a list, the panel or a settings page waits for local data, it SHALL show skeleton rows in the row's shape, never a spinner or a "Loading…" sentence; the skeleton SHALL be replaced in place. A screen SHALL draw what depends on its local data only once that data has been read, never an empty state, empty groups, a header that is replaced, or a sidebar group that opens and then folds first: a list, a project and Statistics draw nothing below the shell until then, and the Plan, Projects and Updates show their skeleton. A settings section whose cards ask the server SHALL draw its cards together once each has its first answer, waiting at most 600 ms, so a card that grows with its answer does not push the cards below it. On these screens the audit's layout shift (M12) SHALL stay at or below 0.1 at every width.

#### Scenario: Cold start
- **WHEN** the app opens before the local database has answered
- **THEN** the content column shows skeleton rows that are replaced by tasks without a layout jump

#### Scenario: Project opens with its tasks
- **WHEN** a project with three sections opens on a phone before the local database has answered
- **THEN** the sections appear with their tasks in one step, without first showing empty sections or "This project has no open tasks"

#### Scenario: Subtitle arrives on a phone
- **WHEN** the Inbox opens at 360 px with planned tasks without a project
- **THEN** their folded group appears at the end of the list in the same step as the Inbox's tasks, and nothing appears under the title later
#### Scenario: Settings cards answer at different times
- **WHEN** Settings → Integrations opens and the app passwords answer 200 ms after the calendar feeds
- **THEN** the section's cards appear together when the last first answer arrives, and after 600 ms they appear in any case

#### Scenario: Later reloads do not hide the page
- **WHEN** the user creates an app password and the list reloads
- **THEN** the section stays visible while it reloads
