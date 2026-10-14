# Spec Delta

## Purpose

Gives a signed-in device a chrome-free, large-type screen for one view (Today, Upcoming, a project or a saved view) with a clock, live refresh and e-ink friendly presentation, for a tablet on the fridge or a wall panel.

## ADDED Requirements

### Requirement: Display routes
The web app SHALL serve `/display` (Today), `/display/today`, `/display/upcoming`, `/display/project/<id>` and `/display/view/<id>` as full-screen displays without the sidebar, header controls, quick add, detail panel or notifications. They SHALL require the app's ordinary session: without one the sign-in screen is shown and the display opens after sign-in. An unknown project or view id SHALL show a message with a link to the Inbox.

#### Scenario: Open Today on a tablet
- **WHEN** a signed-in tablet opens `/display`
- **THEN** the Today display fills the screen with no sidebar, menu button or quick-add field

#### Scenario: Not signed in
- **WHEN** a device without a session opens `/display/project/p1`
- **THEN** the sign-in screen is shown and, after sign-in, the project display opens

#### Scenario: Deleted project
- **WHEN** the project of a display route was deleted
- **THEN** the display shows "This project no longer exists" with a link to the Inbox

### Requirement: Today display
The Today display SHALL show a clock in the user's time format and the date in the user's date format, overdue tasks first and today's tasks under them, the tasks completed today ticked below, and the next days (`days` 1–7, default 3) each as its own column with the day's heading. Columns SHALL stack on screens narrower than 768 px. Dates and the clock SHALL roll over by themselves at midnight without a reload.

#### Scenario: Morning view
- **WHEN** it is 07:30 on Wednesday and the display opens with the default days
- **THEN** it shows the clock, "Wednesday 14 October" in the user's format, Overdue and Today groups, and columns for Thursday, Friday and Saturday

#### Scenario: Midnight
- **WHEN** the display stays open past midnight
- **THEN** yesterday's remaining tasks move into Overdue, the date changes, and the columns shift by one day, without a reload

#### Scenario: Completed today
- **WHEN** a member completes a task due today on their phone
- **THEN** the display shows it ticked under today's open tasks within a few seconds

### Requirement: Upcoming, project and saved view displays
The Upcoming display SHALL show the next days (default 7) as columns. A project display SHALL show the project's name and its open tasks grouped by section in position order, subtasks under their parent, with due date and priority. A saved view display SHALL show the view's name and its result with the view's own grouping and sort. Each SHALL carry the clock.

#### Scenario: Project on the fridge
- **WHEN** `/display/project/<id>` opens for a project with sections "Produce" and "Dairy"
- **THEN** the two sections list their open tasks in order under the project name, each with its priority mark and due date if any

#### Scenario: Saved view
- **WHEN** `/display/view/<id>` opens for a view grouped by due date
- **THEN** the tasks appear under the view's date groups, sorted as the view sorts them

### Requirement: Presentation options
A display SHALL read its presentation from the URL: `size` `m`, `l` (default) or `xl` (body text at least 20, 24 and 32 px); `contrast=high` (black on white or white on black, no soft tints, borders of at least 3:1); `motion=none` (no transitions); and `eink=1` as the preset for high contrast, no motion and a clock without seconds. Options SHALL apply only while a display route is shown and SHALL not change the user's theme or synced preferences.

#### Scenario: E-ink preset
- **WHEN** `/display/today?eink=1` opens
- **THEN** the page renders in high contrast, no element animates or fades, and the clock shows hours and minutes only

#### Scenario: Options leave with the route
- **WHEN** the user exits a high-contrast display to the normal Today view
- **THEN** the app is back to its usual theme and nothing was written to the user's preferences

#### Scenario: Readable from a distance
- **WHEN** `size=xl` is set
- **THEN** task titles render at 32 px or larger and the layout does not scroll horizontally at 768 px wide

### Requirement: Live refresh and offline
A display SHALL render from the device's local copy and update within a few seconds of a change reaching the server while connected, using the existing live channel, and SHALL keep showing the local copy offline with a line saying when it last synced. Nothing about the display changes how data syncs or converges; it writes nothing on its own.

#### Scenario: Change from another device
- **WHEN** a member adds a task due today on their laptop while the display is connected
- **THEN** the display shows the task within a few seconds without any input

#### Scenario: Network lost
- **WHEN** the display loses its connection for an hour
- **THEN** it keeps showing the list, states "Last synced 1 h ago", and catches up when the network returns

### Requirement: Toggling tasks on a display
A display SHALL let the signed-in account complete or reopen a task only when that account may edit it: in its own data, or in a shared project where its role is editor or higher. A toggle SHALL be made with Space or Enter on the focused row, or by touch on the row's checkbox of at least 44×44 px, and SHALL be written as an ordinary local-first operation that syncs and converges like a completion in the list. Where the account may not edit, rows SHALL show no checkbox and ignore the keys.

#### Scenario: Toggle with a keyboard
- **WHEN** a row is focused on the owner's display and the user presses Space
- **THEN** the task is completed locally at once and reaches other devices on the next sync

#### Scenario: Viewer account
- **WHEN** the display is signed in as an account that is a viewer of the shown shared project
- **THEN** the rows have no checkboxes and pressing Space changes nothing

#### Scenario: Toggle offline
- **WHEN** the display is offline and a task is toggled by touch
- **THEN** it shows the task completed immediately and uploads the change when the network returns

### Requirement: Keyboard operation of a display
On a display, arrows and `j`/`k` SHALL move the focus between rows across columns, Home and End SHALL jump to the first and last row, Escape SHALL leave display mode for the same view in the normal app, and the shell's navigation shortcuts (`g` sequences, `q`, `?`) SHALL be inactive. Focus SHALL be visible with the focus ring at every size and in high contrast.

#### Scenario: Move and exit
- **WHEN** the user presses `j` three times and then Escape on `/display/today`
- **THEN** the fourth row had the focus and the normal Today view opens

#### Scenario: Shell shortcuts inactive
- **WHEN** the user presses `g` then `s` on a display
- **THEN** Settings does not open

### Requirement: Entering and leaving display mode
"Display mode" SHALL be offered in the Today and Upcoming headers, in a project's header menu and in a saved view's menu, opening the matching display route with default options. Every display SHALL have a small Exit control of at least 44×44 px that returns to the same view in the normal app, and an option to make this display the device's start view.

#### Scenario: From a project
- **WHEN** the user chooses "Display mode" from a project's header menu
- **THEN** `/display/project/<id>` opens

#### Scenario: Exit by touch
- **WHEN** the user taps Exit on a project display
- **THEN** the normal project view opens

### Requirement: Public link display
With `public-links` available, the public page SHALL accept `display=1` together with the presentation options, rendering the shared list with the display's type sizes, the clock, the public notice and, for tick links, its checkboxes, with no session on the device. It keeps the public page's polling and offline behaviour; nothing is stored on the device.

#### Scenario: E-ink panel with a public link
- **WHEN** `/public/<secret>?display=1&eink=1` opens on a device that is not signed in
- **THEN** the list renders in high contrast with large type and a clock, refreshes every 30 seconds, and the public notice stays visible

#### Scenario: Without the parameter
- **WHEN** `/public/<secret>` opens
- **THEN** the public page renders as before, at its normal size
