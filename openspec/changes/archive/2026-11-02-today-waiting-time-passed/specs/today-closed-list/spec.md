## MODIFIED Requirements

### Requirement: Time-sensitive tasks waiting for a slot
While the Waiting for a slot group is folded, Today SHALL list under its heading the waiting tasks that are due today with a time (in the user's time zone) or whose deadline is today, soonest first: by time, then the deadlines without a time, ties in fill order. Each SHALL show its time (or that its deadline is today) and offer Take a slot, with the rules of Take a slot (refused with its message while every slot holds a focus or taken task; Give back the slot undoes it). At most three SHALL be listed, with a control naming how many more there are that opens the group. A task whose time today is before now (the wall time of the logical today) SHALL be marked as passed: its time in the tone of overdue dates and the words "Time passed"; a deadline without a time SHALL never be marked during the day. The folded heading SHALL name the soonest of them whose time has not passed, with its time, as part of the heading's accessible name ("Waiting for a slot · 4 — next: Send the form, 4:00 PM"); when every one has passed it SHALL say so instead ("time passed: Call the school, 9:00 AM" for one, "2 past their time" for more). The marks and the heading SHALL follow the clock while the list is shown. Opened, the group SHALL list every waiting task in fill order as before, without this list. Upcoming, when it starts with Today, SHALL show the same folded group and list. The fill order SHALL be unchanged: no task SHALL take a slot or move because of its time, and a task whose time has passed SHALL stay listed in its place until the day ends. The list SHALL be derived on the device from local rows with no write, follow synced changes live and work offline; Take a slot writes and converges as before.

#### Scenario: Captured on a full day
- **WHEN** Today is full with a limit of 5 and the user adds "Send the form today at 4pm"
- **THEN** the task waits, the folded heading reads "Waiting for a slot · 1 — next: Send the form, 4:00 PM", and the task is listed under it with 4:00 PM and Take a slot

#### Scenario: Soonest first, fill order kept
- **WHEN** the waiting tasks, in fill order, are "Send the form" at 16:00, "Plain" with no time, "File the taxes" with a deadline today and "Call the school" at 09:00
- **THEN** the folded group lists "Call the school" at 09:00, "Send the form" at 16:00 and "File the taxes" as a deadline, and opening the group lists Send the form, Plain, File the taxes, Call the school

#### Scenario: A time that has passed
- **WHEN** it is 12:00 and the same tasks wait
- **THEN** "Call the school" is still listed first, with 09:00 in the overdue tone and "Time passed", and the heading reads "— next: Send the form, 4:00 PM"

#### Scenario: Every time passed
- **WHEN** it is 12:00 and the only time-sensitive waiting task is "Call the school" at 09:00
- **THEN** the heading reads "— time passed: Call the school, 9:00 AM", and with a second one at 11:30 it reads "— 2 past their time"

#### Scenario: The clock moves
- **WHEN** Today is shown at 8:59 with "Call the school" at 09:00 waiting, and the clock passes 9:00
- **THEN** within a minute the task is marked "Time passed" and the heading no longer names it next, without anything being reordered or written

#### Scenario: Take a slot from the list
- **WHEN** the user activates Take a slot on "Send the form" in that list
- **THEN** it is listed in Today, the last automatically filled task waits again, and one operation on the review row is written, offline included

#### Scenario: Full of chosen tasks
- **WHEN** every slot holds a focus or taken task and the user activates Take a slot in the list
- **THEN** it is refused with "Today is full: complete a task or give one back" and nothing is written

#### Scenario: No time today
- **WHEN** no waiting task is due today with a time or has a deadline today
- **THEN** the folded heading shows its label and count only, as before

#### Scenario: Phone
- **WHEN** the list is shown on a 360 px screen
- **THEN** each line keeps its time, a truncated title, "Time passed" when it applies, and Take a slot on one line, and the heading truncates the next task's name before its label
