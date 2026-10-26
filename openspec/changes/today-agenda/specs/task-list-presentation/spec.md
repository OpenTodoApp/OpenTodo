## MODIFIED Requirements

### Requirement: Nothing between the header and the list
Above the first task of a list there SHALL be at most the page header and the quick add, and the quick add SHALL end at its field and its preview chips: no help link, hint line or note under it. Filters (duration, labels, assignee), layout switches, disclosures, sort notes, promotions, help links and first-run guidance SHALL live in the page header, its menus, the overflow, the Help panel or an overlay, never as rows above or inside the list. The one exception SHALL be Today's agenda of calendar events (OpenSpec `today-agenda`), which is content the user turned on and SHALL show between the quick add and the first task only while it is on and today has events. A list with no task SHALL show its empty view (see "Empty views") in the place of the rows, with nothing between the quick add and it apart from that agenda. This is presentation only and behaves the same offline.

#### Scenario: First task on a phone
- **WHEN** the Inbox with eight tasks opens on a 390×844 screen with the keyboard closed
- **THEN** at least four tasks are visible without scrolling

#### Scenario: Filter affordance
- **WHEN** the user activates Filter in the page header of Today and chooses "Quick wins"
- **THEN** the list is filtered and one active chip with a clear control appears in the header, not above the list

#### Scenario: No help row under the quick add
- **WHEN** a new browser opens the Inbox and has never added a task
- **THEN** the page shows the header, the quick add and the first task, and the only Help control on the page is the header's Help action

#### Scenario: First visit on a fresh account
- **WHEN** an account opens the Inbox for the first time
- **THEN** the list page holds the header, the quick add and the empty view only; the start guide is an overlay over it

#### Scenario: Today's agenda
- **WHEN** the user turned on Today's calendar events and today holds two events
- **THEN** Today shows the header, the quick add, the agenda and then the first task; with the option off it shows the header, the quick add and the first task
