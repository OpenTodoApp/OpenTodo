# Spec Delta

## ADDED Requirements

### Requirement: Habits on a phone
While Habits is on and the phone screens are on below 768 px, the Habits screen SHALL be drawn for the phone: the phone header with **New habit** in its bar and the day's progress as its lead line; a strip of the seven days ending on the logical today, today chosen; then the habits grouped by part of the day, each as one row with a ring of at least 44 px in the habit's hue, the title on up to two lines, one line with the anchor and the measure, and the last seven days as small read-only marks. A tap on the ring SHALL act on the chosen day; a hold on the row SHALL open the row's actions as a sheet; a tap on the title SHALL open the habit page. Choosing an earlier day SHALL list only the habits with that day in their history, draw each ring with that day's state, and let a tap set it: a missed, skipped or rest day becomes done, a done or tiny day is cleared, and an amount habit opens Set amount for that day. Each action SHALL be one batch with one Undo, SHALL work offline, and SHALL converge as the same action does on the desktop screen. With the switch off or from 768 px the screen SHALL be the desktop screen.

#### Scenario: Check in with a thumb
- **WHEN** the phone screens are on at 390 px and the person taps the ring of Read
- **THEN** today's occurrence of Read is completed, the ring fills, and one Undo reverts it

#### Scenario: Fix yesterday
- **WHEN** the person chooses yesterday in the day strip, where Stretch was missed, and taps Stretch's ring
- **THEN** yesterday's Stretch is done, the series does not move, and the day strip's ring for yesterday shows one more kept

#### Scenario: A hold
- **WHEN** the person holds Read's row
- **THEN** a sheet offers Check in, the tiny version, Skip this day, Open and Edit

#### Scenario: Off
- **WHEN** the phone screens are off, or the window is 768 px wide
- **THEN** the Habits screen is the desktop screen

### Requirement: Today's progress on the Habits screen
While Habits is on, the Habits screen's header SHALL read how many of the habits due on the chosen day are kept, "3 of 5 today" for today, counting each non-graduated habit whose day is due, done, the tiny version, partial or missed (a skipped day is a rest, and a target habit counts only until its period is met or when kept that day), and as kept the done and tiny days. With no habit due the line SHALL not be shown. It SHALL be derived from the device's rows, offline too.

#### Scenario: Halfway through the day
- **WHEN** Run, Stretch and Read are due today and Run is checked in
- **THEN** the header reads "1 of 3 today"

#### Scenario: Nothing due
- **WHEN** the only habit is Run on `every mon, wed, fri` and today is Tuesday
- **THEN** no progress line is shown

### Requirement: Taking back today's check-in
While Habits is on, the check control of a habit kept today (its row's button, the phone ring, the habit page's Done today and the ring in Today's strip) SHALL take back today's check-in with one Undo: today's record is removed and, when the habit had moved past today and no later day has been recorded since, the habit is due today again with its time, start and deadline moved alike. An amount habit's control SHALL keep adding its step. The control SHALL be a toggle that reads as pressed while the habit is kept today and keeps its name; Space on a kept row SHALL take back as the button does. The writes SHALL be ordinary field operations that work offline and converge as any edit.

#### Scenario: A mistaken tap
- **WHEN** the person checks in Read, the toast has gone, and they press Read's check button again
- **THEN** today's record of Read is gone, Read is due today again and the thread shows today as today

#### Scenario: An amount
- **WHEN** Water has reached 8 of 8 glasses and the person presses its button
- **THEN** a glass is added, as before

### Requirement: Skip this day
While Habits is on, a habit's row menu, the phone row's sheet and the habit page's menu SHALL offer **Skip this day** when its current occurrence is due today or earlier and is not kept, unless the habit has a target or an amount. It SHALL skip the current occurrence exactly as Skip does in a repeating task's menu, keeping the streak, with one Undo, offline too.

#### Scenario: A rest day
- **WHEN** the person chooses Skip this day on Run on a Wednesday
- **THEN** Wednesday reads skipped, Run's streak holds, and Run is due on Friday

#### Scenario: Not for a target
- **WHEN** the person opens Gym's menu, "3 times a week"
- **THEN** Skip this day is not offered

### Requirement: A reminder in the habit form
The habit form SHALL have **Remind me at**, an optional time. Saving a time SHALL set the habit's due time and one reminder at that time on every scheduled day, in the form's one batch with one Undo, with an id derived from the habit so two devices setting it offline end with one reminder. The field SHALL show the habit's due time when the habit has a reminder at that time. Clearing it SHALL remove that reminder and the due time. It SHALL work offline, on an end-to-end encrypted account too.

#### Scenario: Remind at half past seven
- **WHEN** the person sets Remind me at 07:30 on Stretch and saves
- **THEN** Stretch is due at 07:30 and reminds at 07:30 each day, and Undo removes both

#### Scenario: Two devices
- **WHEN** two offline devices each set Remind me at on Stretch and then sync
- **THEN** Stretch has one reminder

#### Scenario: Clear it
- **WHEN** the person clears Remind me at on Stretch and saves
- **THEN** Stretch has no reminder and no due time

### Requirement: A habit's year
While Habits is on, a habit's page SHALL show, under the month history, its last 53 weeks as a heatmap in the habit's colour, as Statistics shows a year of done tasks: weeks as columns from the first day of the week, newest last, the month names where a month starts, a sideways scroll on a narrow screen that opens on the current week, and the keyboard and names of that heatmap. Each day SHALL be drawn by its state, differing by shape as well as colour, and named with its date and state. The heatmap's accessible name SHALL summarise it ("140 of 160 scheduled days kept in the last 53 weeks"). The month history SHALL draw kept days in the habit's colour, and below 640 px SHALL fill the page's width with cells of at least 40 px. Both SHALL render from the device's rows, offline too.

#### Scenario: Months of reading
- **WHEN** the person opens Read, kept since June, on a 1280 px window
- **THEN** the page shows 53 weeks with June to November filled in Read's colour

#### Scenario: On a phone
- **WHEN** the same page is open at 360 px
- **THEN** the month grid fills the width and the heatmap shows the current week, the earlier weeks a sideways scroll away

#### Scenario: A day by keyboard
- **WHEN** a keyboard user moves into the heatmap and presses the left arrow
- **THEN** the day before today is focused and named with its date and state
