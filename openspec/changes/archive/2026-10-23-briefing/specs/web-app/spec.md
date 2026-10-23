## ADDED Requirements

### Requirement: Day page briefing

Today and Upcoming SHALL show a briefing under the title: a bold lead sentence, then at most one more sentence. The briefing SHALL be computed on the device from the local rows: the tasks of projects that are not archived, the in-app notification cache, the close of the day, the calendar grid's day length and the logical today. It SHALL need no network and no model, SHALL work offline, and SHALL follow changes from other devices as they sync and the clock as the day rolls over, like the list under it. Two devices with the same rows and the same day length SHALL show the same briefing. The briefing writes nothing.

On Today with tasks in the list, the briefing SHALL name at most three things that stand out, in this order:
- **Late:**
  - the overdue tasks Today lists, leaving out blocked tasks;
  - one late task is named with how many days late it is, counted from its due date, or from a passed deadline when that is older;
  - more than one is a count;
  - in the danger tone.
- **Load:**
  - when the estimates of Today's tasks (late ones included) exceed the day length, today's planned time against the day length;
  - otherwise, the first of the next seven days whose estimates reach the day length, by weekday;
  - in the warning tone.
- **Replies:**
  - unread notifications of a mention or a reply on a task page;
  - one is named by who answered and about which task, using the device's own copy of the title when the notification carries none;
  - more than one is a count.

The lead SHALL say how many things matter today, and the facts SHALL follow as one sentence. With nothing to name, the briefing SHALL say that nothing stands out, how many tasks are planned and, when there are estimates, the planned time.

When Today's list is empty, the lead SHALL be "All done for today." if the day was closed or a task was completed on the logical today, and otherwise that nothing is planned for today. It SHALL be followed by tomorrow: how many tasks Upcoming lists for tomorrow and the first of them by due time then priority, with its time; or that nothing is planned for tomorrow yet.

On Upcoming the lead SHALL say how many tasks the next seven days hold. When there are any, it SHALL be followed by:
- every one of those days that is already full, or that every day still has room;
- and tomorrow as above.

#### Scenario: Three things
- **WHEN** "Renew the passport" was due two days ago, Monday's estimates fill the eight-hour day, and Mia's unread mention is about "Boiler"
- **THEN** Today's briefing reads "Three things matter today. Renew the passport is 2 days late, Monday is already full, and Mia answered about Boiler."
- **AND** the late part is in the danger tone, the full day in the warning tone, and the titles are shown as written

#### Scenario: A calm day
- **WHEN** Today lists two tasks for today with 45 minutes estimated, nothing is late, no later day is full and no reply is unread
- **THEN** the briefing reads "Nothing stands out today. 2 tasks are planned, about 45m in all."

#### Scenario: Today past the day length
- **WHEN** today's tasks hold nine hours of estimates and the day length is eight hours
- **THEN** the briefing names today's nine hours against the eight-hour day instead of a later full day

#### Scenario: Blocked late task
- **WHEN** the only late task waits for an open blocker
- **THEN** the briefing names nothing late

#### Scenario: All done
- **WHEN** the user completed the last task of Today, and tomorrow holds four tasks, the first "Standup" at 09:30
- **THEN** the briefing reads "All done for today. Tomorrow starts with 4 tasks; the first is Standup at 9:30 AM." in the user's time format

#### Scenario: A clear day
- **WHEN** nothing was due today and nothing was completed today
- **THEN** the briefing starts "Nothing is planned for today." and goes on with tomorrow

#### Scenario: Upcoming
- **WHEN** the next seven days hold six tasks, Friday and Monday are full and tomorrow holds one task, "Groceries"
- **THEN** Upcoming's briefing reads "6 tasks in the next seven days. Friday and Monday are already full. Tomorrow starts with one task; the first is Groceries."

#### Scenario: Offline and after sync
- **WHEN** the device is offline and another device completed the late task earlier
- **THEN** the briefing still names it until the completion syncs, and drops it as soon as it arrives, without a reload

#### Scenario: Reply read
- **WHEN** the user opens the task the unread reply was about
- **THEN** the reply leaves the briefing
