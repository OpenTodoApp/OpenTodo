# Spec Delta

## MODIFIED Requirements

### Requirement: Rhythm markers
A rhythm SHALL be due as follows:
- the weekly review, when its last finish is more than seven days ago or never
- the Monthly look, when it is more than 30 days ago or never
- the Daily check, when it was not done on the user's logical today (OpenSpec `date-time-preferences`, "Logical today")

Close the day is never due and carries no marker of its own. When the day was closed on the user's local date, the sidebar Review entry SHALL show "Day closed" in place of its "last review" text for the rest of that local day, unless a rhythm is due, in which case the due marker wins; the text alternative SHALL name both. The sidebar Review entry SHALL carry the weekly marker in every mode. In `companion` and `first` modes it SHALL also carry the monthly marker. In `first` mode it SHALL also carry the daily marker. The marker SHALL be one small dot in the accent colour, never a filled or coloured badge with text; its text alternative SHALL name each due rhythm and, for the weekly review, when the last one was ("Review due · last weekly review 9 days ago; the Monthly look is due"), and SHALL be the entry's tooltip and part of its accessible name. When no rhythm is due the entry SHALL carry no marker, and when the last review was SHALL be in its tooltip and accessible description. While Review is in the More group, the More row or heading SHALL carry the same dot with the same text, and the Review item inside the More menu SHALL show the text as its description. The marker is derived from the synced review row and local time, so it is correct offline and follows a finish on another device after sync; nothing is written for it. In `first` mode, the first time the app is opened on a logical day on which the Daily check is not done, a toast SHALL offer to start it, at most once per logical day per device.

#### Scenario: Lists only
- **WHEN** a user in `lists` mode has never done a Daily check or Monthly look and finished the weekly review yesterday
- **THEN** the Review entry and the More row carry no marker, and hovering the Review item in the More menu reads "Last review yesterday"

#### Scenario: Open Loops first in the morning
- **WHEN** a user in `first` mode opens the app on a new day
- **THEN** a toast offers "Start your daily check", the primary Review entry shows one dot whose text names the Daily check, and dismissing the toast means it does not return on that device that day

#### Scenario: Day closed in the evening
- **WHEN** no rhythm is due and the user closes the day at 18:42
- **THEN** the Review entry reads "Day closed" with the time in its text alternative until the local date changes, after which it shows the last review again

#### Scenario: Day closed while the weekly review is due
- **WHEN** the weekly review was finished nine days ago and the user closes the day
- **THEN** the Review entry keeps its "due" marker and its text alternative also says the day is closed

#### Scenario: Daily check done in the evening, app open after midnight
- **WHEN** a user in `first` mode with a day start of `04:00` finished the Daily check on Wednesday evening and uses the app at 00:30 on Thursday
- **THEN** the Review entry carries no daily marker and no toast is shown until 04:00 has passed

#### Scenario: Due in Companion
- **WHEN** a user in `companion` mode last finished the weekly review nine days ago and the Monthly look 40 days ago
- **THEN** the More row shows one dot, its tooltip and accessible name read "Review due · last weekly review 9 days ago; the Monthly look is due", and finishing the review on another device removes the dot here after sync without a reload

