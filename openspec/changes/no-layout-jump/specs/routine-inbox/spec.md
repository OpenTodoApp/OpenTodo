## MODIFIED Requirements

### Requirement: Routines card in the Inbox
The Inbox SHALL show, inside its list under the last task, a card "Routines since your last visit" when it has entries, listing at most five lines grouped per routine ("Groceries · 3 tasks created · Friday 17:00", "Weekly digest failed · Not available: outgoing email is not set up", "Sort inbox · proposal waiting · Review") and "See all runs". The card loads after the list, so it SHALL never move a task when it appears. Its entries SHALL come from the server, which applies the rules of "What the card shows" so every device agrees. Offline the card SHALL show what was last fetched.

#### Scenario: Monday morning
- **WHEN** the user opens the Inbox on Monday after "Morning sweep" ran on Saturday and Sunday and "Weekly digest" failed on Sunday
- **THEN** the card under the tasks reads "Morning sweep ran 2 times · 9 tasks changed" and "Weekly digest failed · …", each opening its runs, and no task moved when it appeared

#### Scenario: Nothing new
- **WHEN** no run happened since the marker and nothing is waiting
- **THEN** the card is not shown and the Inbox looks as before
