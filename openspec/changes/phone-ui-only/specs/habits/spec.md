## MODIFIED Requirements

### Requirement: Habits on a phone
While Habits is on, below 768 px the Habits screen SHALL be drawn for the phone: the phone header with **New habit** in its bar and the day's progress as its lead line; a strip of the seven days ending on the logical today, today chosen; then the habits grouped by part of the day, each as one row with a ring of at least 44 px in the habit's hue, the title on up to two lines, one line with the anchor and the measure, and the last seven days as small read-only marks. A tap on the ring SHALL act on the chosen day; a hold on the row SHALL open the row's actions as a sheet; a tap on the title SHALL open the habit page. Choosing an earlier day SHALL list only the habits with that day in their history, draw each ring with that day's state, and let a tap set it: a missed, skipped or rest day becomes done, a done or tiny day is cleared, and an amount habit opens Set amount for that day. Each action SHALL be one batch with one Undo, SHALL work offline, and SHALL converge as the same action does on the desktop screen. From 768 px the screen SHALL be the desktop screen.

#### Scenario: Check in with a thumb
- **WHEN** at 390 px the person taps the ring of Read
- **THEN** today's occurrence of Read is completed, the ring fills, and one Undo reverts it

#### Scenario: Fix yesterday
- **WHEN** the person chooses yesterday in the day strip, where Stretch was missed, and taps Stretch's ring
- **THEN** yesterday's Stretch is done, the series does not move, and the day strip's ring for yesterday shows one more kept

#### Scenario: A hold
- **WHEN** the person holds Read's row
- **THEN** a sheet offers Check in, the tiny version, Skip this day, Open and Edit

#### Scenario: A wider window
- **WHEN** the window is 768 px wide
- **THEN** the Habits screen is the desktop screen
