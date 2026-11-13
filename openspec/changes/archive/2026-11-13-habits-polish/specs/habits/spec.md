## ADDED Requirements

### Requirement: Habit page
While Habits is on, a habit SHALL open a page of its own at `/habits/<id>` from its row, Today's strip and links, and wherever its task page or panel would open for an open habit series. The page SHALL show a way back to Habits, the title, one line with how often, the part of the day and the anchor, the tiny version, strength, kept and both streaks, a Check in button for the current occurrence, the month history with editable past days, and a menu with Edit, Graduate or Resume, Open as a task, Stop tracking as a habit and Delete. It SHALL show no task-only fields (sections, deadlines, estimates, dependencies, subtasks) and no task-series wording such as the past-occurrences scope note. **Open as a task** SHALL show the task's ordinary page. An occurrence record SHALL still open as a task. The page SHALL render from the device's rows only, offline too, and be operable with the keyboard alone.

#### Scenario: Open a habit
- **WHEN** the user opens Read from the Habits screen
- **THEN** the address is `/habits/<id>` and the page shows "Every day · This Evening · After dinner", the tiny version, its numbers, Check in and the month history, and no section, deadline or estimate field

#### Scenario: From a link or search
- **WHEN** the user opens Read from search or a link to its task
- **THEN** the habit page is shown, and Open as a task in its menu shows the full task page

#### Scenario: Edit
- **WHEN** the user chooses Edit, changes the title to "Read a book" and saves
- **THEN** the series has the new title in one batch with one Undo, and no question about past occurrences is asked

## MODIFIED Requirements

### Requirement: Habits in lists and the detail panel
A habit SHALL be an ordinary row in Upcoming, its project and saved views, with a streak chip next to the repeat indicator, and in Today as specified in "Habits strip in Today". While Habits is off, the chip SHALL not be shown. While Habits is not on, the detail panel SHALL show the habit switch, the current and best streak, the month history and the existing Skip control together under the repeat rule, all reachable with the keyboard; while Habits is on, a habit series SHALL open its habit page instead (see "Habit page"), and the task page reached through Open as a task SHALL show the same habit section with the measure and strength, the tiny version, the anchor and Graduate. The Habits screen is the built-in view of habits; the `habit` filter keyword still lists habits.

#### Scenario: Streak chip
- **WHEN** Upcoming lists a habit with a streak of 12
- **THEN** its row shows the repeat indicator and a chip reading 12 with an accessible name "12-day streak"

#### Scenario: Habits view from a query
- **WHEN** the user saves the query `habit` as a view named "Habits"
- **THEN** the view lists every open habit, with its streak chip

#### Scenario: No chip while off
- **WHEN** Habits is off and a project lists a habit
- **THEN** its row shows the repeat indicator and no streak chip

### Requirement: Habits screen
While Habits is on, the app SHALL offer a **Habits** screen as a destination of the sidebar's More group, which the sidebar order setting can move among the primary destinations, and through `g` then `Shift+H` and the command palette. It SHALL list every open habit the user can see, grouped by part of the day (Morning, Afternoon, This Evening, then Any time), each as one row with the habit's colour, title, anchor, a thread of the last seven days, its measure and a check button for the current occurrence. A row SHALL keep the title on one line, cut with an ellipsis when it does not fit, with the full title in the tooltip and the accessible name; below 640 px the thread SHALL take a second line under the title while the measure and the button stay on the first. Every row SHALL have a check button: for a habit whose current occurrence is later than today, it SHALL check in that occurrence early, exactly as completing the task does, and its accessible name SHALL name the date. The title SHALL open the habit page. Graduated habits SHALL follow in a folded **Graduated** group. The screen SHALL render from the device's rows only, offline too, and SHALL be reachable and operable with the keyboard alone. With no habit, it SHALL show three starters (such as Drink water, Read 10 minutes, Walk after lunch) that each open **New habit** filled in, and no illustration.

#### Scenario: A morning at a glance
- **WHEN** the user has "Run" (Morning, `every mon, wed, fri`), "Read" (This Evening, `every day`) and a graduated "Floss", and opens Habits on a Wednesday
- **THEN** Morning lists Run with Monday done and Wednesday as today, This Evening lists Read with seven days, and a folded Graduated group lists Floss

#### Scenario: Check in from the screen
- **WHEN** the user presses the check button of Run, or Space on its focused row
- **THEN** the current occurrence is completed exactly as completing the task would, today's day fills in the thread, and one Undo reverts it

#### Scenario: A long title
- **WHEN** a habit is titled "Practise the Bach cello suite in G major, first movement" on a 375 px screen
- **THEN** its row shows one line of title ending in an ellipsis, the measure and the check button beside it, and hovering or focusing the title shows the full title

#### Scenario: Not due today
- **WHEN** Run repeats `every mon, wed, fri` and today is Tuesday
- **THEN** Run's row has a check button named "Check in Run early (Wednesday 12 November)"

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Habits and checks in Read
- **THEN** the screen renders from local rows, the day fills in at once, and the record reaches the other devices on the next sync

#### Scenario: Not while off
- **WHEN** Habits is off and the user opens the Habits address or presses `g` then `Shift+H`
- **THEN** the shortcut does nothing, More has no Habits entry, and the address shows that Habits is off with a link to How you work

### Requirement: Habits strip in Today
While Habits is on, Today SHALL show its habits as one quiet line above its first task group, without a group heading, count or fold: a "Habits" link that opens the Habits screen, then each habit whose current occurrence is due on the logical today or earlier and is not done, as a small ring in its hue followed by its title, in part-of-the-day order; a habit done today SHALL stay with a filled ring until the day ends. The ring SHALL check in the habit with one Undo; the title SHALL open the habit page. The line SHALL never take more than one line at any width; the habits that do not fit SHALL fold into a "+N" link that opens the Habits screen. Those habits SHALL then not be listed among Today's task rows, and SHALL not count toward the Today limit, as before. When no habit is due or done today, the line SHALL not be shown. While Habits is not decided or off, habits SHALL be ordinary Today rows, as before.

#### Scenario: No habit shown twice
- **WHEN** Habits is on and Read is due today
- **THEN** Read is in Today's habits line and not a row among Today's tasks

#### Scenario: A weekly habit on another day
- **WHEN** Run repeats `every mon, wed, fri` and today is Tuesday
- **THEN** Run is not in the line

#### Scenario: Through to Habits
- **WHEN** the user presses "Habits" at the start of the line
- **THEN** the Habits screen opens

#### Scenario: Narrow screen
- **WHEN** nine habits are due today on a 360 px screen
- **THEN** the line stays one line and ends with a "+N" link that opens Habits

### Requirement: New habit and Make it a habit
While Habits is on, **New habit** on the Habits screen and in the command palette, and **Make it a habit** in a task's menu and its page, and **Edit** on a habit's page SHALL open one form with the title, how often (Every day, Days of the week, or any calendar rule typed as in the repeat editor), the tiny version, the anchor, the part of the day and the colour, and create or change the task in one batch of operations with one Undo. The Tiny version and After labels SHALL each have a "?" control that shows a one-line explanation in a tooltip on hover and on keyboard focus. The form SHALL show no other task field. A new habit SHALL have no project unless one is chosen. **Make it a habit** on a task with a calendar rule SHALL keep that rule; on a task without one it SHALL propose `every day`; a task with a rule and no due date SHALL get its first date from the rule; on a task with a completion-relative rule it SHALL ask for a calendar rule first. Everything SHALL work offline and converge as ordinary field operations.

#### Scenario: Create in one step
- **WHEN** the user chooses New habit, types "Read", picks Every day, the tiny version "One page", the anchor "After dinner" and This Evening, and confirms
- **THEN** one task "Read" with `every day`, `habit` true, that tiny version, anchor and part of the day exists, and it is listed under This Evening

#### Scenario: From a one-off task
- **WHEN** the user chooses Make it a habit on "Stretch", which has no rule
- **THEN** the form proposes Every day, and confirming sets the rule and the flag in one Undo

#### Scenario: What tiny means
- **WHEN** the user focuses the "?" after Tiny version
- **THEN** a tooltip reads "The two-minute version that still counts on a bad day"

#### Scenario: From a completion-relative task
- **WHEN** the user chooses Make it a habit on "Water the plants" with `every 3 days after completion`
- **THEN** the form asks for a calendar rule and writes nothing until one is chosen

### Requirement: Habit visual language
Each habit SHALL show one of the 12 palette hues: its own colour (`habit_color`, an additive task field, a palette colour or empty, not content, converging by last-writer-wins) when set, otherwise the hue of its project when it has one, otherwise one derived from its id, so every device shows the same hue. The thread SHALL draw each scheduled day of the last seven as a mark (filled for done, half filled for tiny, a dash for skipped, empty for missed, a ring for today) joined by a solid line between consecutive kept days, a dotted line across a skip and no line across a miss; unscheduled days SHALL be blank. Marks SHALL differ by shape as well as colour, each day SHALL be announced with its date and state, every colour SHALL come from the design tokens and pass the contrast checks in every built-in theme, light and dark, at 360 px. Checking in SHALL play the completion moment (the ring closes, the mark fills, the line reaches today, the number changes) within the existing 400 ms motion step, with the haptic tick where available, and reduced motion SHALL show the end state at once. There SHALL be no confetti, badges, points or emoji.

#### Scenario: Own colour
- **WHEN** the user picks green for Read, which is in a blue project
- **THEN** Read shows green on the Habits screen, in Today and on its page on every device, and Automatic gives it blue again

#### Scenario: A week with a skip and a miss
- **WHEN** Read was done Monday and Tuesday, skipped Wednesday, missed Thursday and done Friday, and today is Saturday
- **THEN** Monday and Tuesday are filled and joined, a dotted line crosses Wednesday's dash, Thursday is an empty mark with no line on either side, Friday is filled, and Saturday is a ring

#### Scenario: Screen reader
- **WHEN** a screen reader user moves through Read's thread
- **THEN** each day is announced with its date and state, such as "Wednesday 11 November, skipped"

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and the user checks in
- **THEN** the filled mark, the line and the new number appear without animation
