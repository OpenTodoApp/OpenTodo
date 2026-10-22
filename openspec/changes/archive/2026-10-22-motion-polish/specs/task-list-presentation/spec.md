## MODIFIED Requirements

### Requirement: Skeleton loading
While a list, the panel or a settings page waits for local data, it SHALL show skeleton rows in the row's shape, never a spinner or a "Loading…" sentence; the skeleton SHALL be replaced in place. A screen SHALL draw what depends on its local data only once that data has been read, never an empty state, empty groups, a header that is replaced, or a sidebar group that opens and then folds first: a list, a project and Statistics draw nothing below the shell until then, and the Plan, Projects and Updates show their skeleton. A settings section whose cards ask the server SHALL draw its cards together once each has its first answer, waiting at most 600 ms, so a card that grows with its answer does not push the cards below it. On these screens the audit's layout shift (M12) SHALL stay at or below 0.1 at every width.

#### Scenario: Cold start
- **WHEN** the app opens before the local database has answered
- **THEN** the content column shows skeleton rows that are replaced by tasks without a layout jump

#### Scenario: Project opens with its tasks
- **WHEN** a project with three sections opens on a phone before the local database has answered
- **THEN** the sections appear with their tasks in one step, without first showing empty sections or "This project has no open tasks"

#### Scenario: Subtitle arrives on a phone
- **WHEN** the Inbox opens at 360 px and its count of planned tasks without a project is read after the first frame
- **THEN** the count appears under the title without moving the bar's buttons or the list

#### Scenario: Settings cards answer at different times
- **WHEN** Settings → Integrations opens and the app passwords answer 200 ms after the calendar feeds
- **THEN** the section's cards appear together when the last first answer arrives, and after 600 ms they appear in any case

#### Scenario: Later reloads do not hide the page
- **WHEN** the user creates an app password and the list reloads
- **THEN** the section stays visible while it reloads
