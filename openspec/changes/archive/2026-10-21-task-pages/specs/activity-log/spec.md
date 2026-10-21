## MODIFIED Requirements

### Requirement: Public link operations form their own events
Operations written through a public link (device `public:<link-id>`, OpenSpec `public-links`) SHALL form their own events, attributed to the link and never folded into the creator's events. Operations written through a task page (device `page:<page-id>`, OpenSpec change `task-pages`) SHALL likewise form their own events, attributed to the page and the guest's typed name, never folded into the publisher's events.

#### Scenario: Public tick next to the creator's edit
- **WHEN** the link creator reschedules a task and, two seconds later, a guest completes it through the link
- **THEN** the activity shows two events: "rescheduled" by the creator and "completed" by the public link, with the second carrying device `public:<link-id>`

#### Scenario: Task page tick next to the publisher's edit
- **WHEN** the publisher renames a task and, a second later, a guest ticks one of its subtasks through its task page
- **THEN** the activity shows "renamed" by the publisher and "completed" by the guest through the task page, with device `page:<page-id>`
