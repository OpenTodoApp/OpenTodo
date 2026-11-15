# Spec Delta

## ADDED Requirements

### Requirement: A day page opens with its briefing
Today and Upcoming SHALL draw nothing below the shell until everything their briefing is worded from has been read from the device: the tasks, the cached notifications, the review row and the account's preferences, including the one that hides the briefing. The briefing SHALL NOT be drawn from a part of them and completed later, and a hidden briefing SHALL NOT be drawn at all. The reads are local and asked for together, so the page SHALL NOT wait for the network and SHALL open the same way offline. With the seeded account on a device that has finished its first sync, the layout shift of Today from navigation to idle SHALL stay below 0.1 at 360, 390 and 768 px, on a cold load and on a navigation inside the app. A change that arrives later (a reply brought by a sync, a task completed on another device) updates the briefing as it updates the list; it converges like any other synced change and is not part of this requirement. This is presentation only: it writes nothing.

#### Scenario: Replies are part of the first sentence
- **WHEN** Today opens at 360 px on a device whose cache holds two unread replies and one late task
- **THEN** the first thing drawn is the title, "Two things matter today." with the late task and "2 replies are waiting", and the list under it, and none of them moves afterwards

#### Scenario: The notifications answer last
- **WHEN** the tasks have been read and the notifications have not
- **THEN** the page shows nothing below the shell, and the title, the briefing and the rows appear together when the notifications are read

#### Scenario: Hidden briefing
- **WHEN** Upcoming opens on an account that chose Hide briefing
- **THEN** the rows are never shown with a briefing above them

#### Scenario: Offline
- **WHEN** Today opens with the server unreachable
- **THEN** it is drawn from the device's rows as soon as they are read, with the replies the device last cached

#### Scenario: A list without a briefing
- **WHEN** the Inbox or a project opens
- **THEN** it waits for nothing more than before

#### Scenario: A reply arrives later
- **WHEN** Today is open and a sync brings a new unread reply
- **THEN** the briefing names it, as before
