## ADDED Requirements

### Requirement: Drop in a list without its own order
In a list that has no order of its own (Today unless grouped by Project, Upcoming, Anytime, Someday, Assigned to me, a filter), a dragged task released on one of the list's rows, or in Upcoming on the day the task is already on, SHALL write nothing and SHALL show the short notice "Lists sorted by date or priority keep their order." without an Undo. Drops on the sidebar's projects, the Inbox, labels and Today, and in Upcoming on another day, SHALL work as before, and the touch grip SHALL keep its jobs.

#### Scenario: Drop among Today's rows
- **WHEN** Today is not grouped by Project and the user drags "Call Ada" onto the row "Pay rent"
- **THEN** nothing is written and the notice says the list keeps its order

#### Scenario: Drop on the same day in Upcoming
- **WHEN** the user drags a task due on 22 October onto the 22 October group in Upcoming
- **THEN** nothing is written and the notice says the list keeps its order, without Undo

#### Scenario: Drop on another day still moves it
- **WHEN** the user drags the same task onto the 24 October group
- **THEN** its date moves to 24 October with an Undo, as before
