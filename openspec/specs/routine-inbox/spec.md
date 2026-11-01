# routine-inbox Specification

## Purpose
The Inbox card "Routines since your last visit": which routine runs it shows and how long they stay, the synced seen marker, the setting that hides successful runs, the bell notifications of failed runs and proposals, and keeping a failed run until it was seen.

## Requirements

### Requirement: Routines card in the Inbox
The Inbox SHALL show, inside its list above the first task, a card "Routines since your last visit" when it has entries, listing at most five lines grouped per routine ("Groceries · 3 tasks created · Friday 17:00", "Weekly digest failed · Not available: outgoing email is not set up", "Sort inbox · proposal waiting · Review") and "See all runs". Its entries SHALL come from the server, which applies the rules of "What the card shows" so every device agrees. Offline the card SHALL show what was last fetched.

#### Scenario: Monday morning
- **WHEN** the user opens the Inbox on Monday after "Morning sweep" ran on Saturday and Sunday and "Weekly digest" failed on Sunday
- **THEN** the card reads "Morning sweep ran 2 times · 9 tasks changed" and "Weekly digest failed · …", each opening its runs

#### Scenario: Nothing new
- **WHEN** no run happened since the marker and nothing is waiting
- **THEN** the card is not shown and the Inbox looks as before

### Requirement: Routines seen marker
The user's preference `user_prefs.routines_seen_at` SHALL hold the server time up to which the user has seen routine runs. A device SHALL write it, as an operation, to the time of the newest run the card displayed once the card has been on screen for 2 seconds or the user chose Mark as seen, and SHALL never write a smaller value than it holds; last-writer-wins keeps the later mark, so devices converge. A device without a marker SHALL use the newest run of its first fetch as its baseline, so earlier runs do not appear after the upgrade. The marker SHALL be written offline and synced later.

#### Scenario: Seen on the phone
- **WHEN** the user sees the card on the phone and then opens the laptop after sync
- **THEN** the laptop's card shows no success the phone displayed

#### Scenario: Concurrent marks
- **WHEN** the phone marks up to 08:00 and the laptop, offline, up to 07:30, and both sync
- **THEN** every device holds 08:00

### Requirement: What the card shows
The card SHALL show runs after the marker of the user's routines, except runs the user started themselves by hand or as tests. Failed runs and waiting proposals SHALL stay until handled (the run undone or followed by a successful run of the same routine, the proposal applied, dismissed or expired), whatever the marker. Successes SHALL stay until the marker passes them or the user dismisses them; a dismissal SHALL apply on every device. For a shared routine the card SHALL show only runs whose touched items the member can see. A run started by an AI assistant or by another member SHALL be shown even though it was manual.

#### Scenario: Own manual run
- **WHEN** the user runs "Groceries" by hand and opens the Inbox
- **THEN** the card does not list that run

#### Scenario: Failure stays
- **WHEN** a failed run is older than the marker and has not been handled
- **THEN** it is still listed

#### Scenario: Run by an assistant
- **WHEN** an AI assistant runs "Groceries" through MCP
- **THEN** the card lists "Groceries · run by an AI assistant · 3 tasks created"

### Requirement: Hide successful runs
Settings → Notifications and the card's menu SHALL offer "Hide successful runs", stored as `user_prefs.routines_hide_successes = "on"` (an unknown or empty value reads as off), synced and converging by last-writer-wins. While it is on, success lines SHALL not be shown; failures and proposals SHALL still be.

#### Scenario: Only what needs me
- **WHEN** the setting is on and three routines succeeded overnight while one failed
- **THEN** the card shows only the failure

### Requirement: Routine notifications in the bell
The server SHALL deliver the in-app notifications `routine_failed` (naming the routine and the failing step, opening the run) and `routine_proposal` (naming the routine, opening the proposal's review), at most one `routine_failed` per routine per day (later failures update its count), never for test runs or runs the user started by hand. They SHALL be listed and marked read through the notification routes, counted by the bell, and delivered to delivery channels that have the `routine` event switched on. Successful runs SHALL not notify, except through the Notify me step and the rule `notify` action.

#### Scenario: Failure in the bell
- **WHEN** "Weekly digest" fails at 07:00 and again at 08:00 on the same day
- **THEN** the bell shows one unread notification "Weekly digest failed (2 times today)" that opens the latest run

#### Scenario: No notification for successes
- **WHEN** a routine without a Notify me step succeeds
- **THEN** no notification is created

### Requirement: Failed runs are kept until seen
The run log SHALL keep a failed run until the user's seen marker has passed it and it is older than 30 days, and at most 90 days; and a run with a waiting proposal until the proposal is handled or expires.

#### Scenario: Away for six weeks
- **WHEN** a run failed while the user did not open the app for six weeks
- **THEN** the run is still listed when the user returns, and is removed 30 days after the card showed it
