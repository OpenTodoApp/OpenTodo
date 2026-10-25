## ADDED Requirements

### Requirement: Task opening preference
Each user SHALL have a preference for how a task opens from a list, `page` (the default) or `panel`, stored as the additive field `task_open` of the user's preferences. It SHALL be written as an operation on the user's personal data like mode and theme, so it applies on every device of that user and never on another user's. It SHALL be editable offline and take effect at once on the editing device, and concurrent edits SHALL converge by last-writer-wins. A client SHALL treat an empty or unknown value as `page` and keep the stored value unchanged. `panel` opens tasks in the side panel of `web-app` "Task details in a side panel", on screens at least 1024 px wide only; on a narrower screen the preference has no effect.

Settings → Appearance → Task details SHALL offer it as "Open tasks" with the choices "As a page" and "In a side panel", saying that the panel needs a window at least 1024 px wide and that the choice applies on all the user's devices. Searching settings for "side panel" or "open tasks" SHALL find the row.

#### Scenario: New account
- **WHEN** a user who never changed the preference opens a task in Today on a 1280 px wide screen
- **THEN** the task opens as its page, exactly as before this change

#### Scenario: Choose the side panel on two devices
- **WHEN** the user picks "In a side panel" on a desktop and the user's laptop syncs later
- **THEN** both open tasks in the side panel, the laptop without a reload, and the user's phone still opens them as pages

#### Scenario: Choose offline
- **WHEN** the device is offline and the user picks "In a side panel"
- **THEN** the next task opened shows in the panel at once, and the choice reaches the other devices on the next sync

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives a `task_open` value it does not know
- **THEN** it opens tasks as pages and writes no operation

#### Scenario: Older device
- **WHEN** a device with an app version before this preference receives the field
- **THEN** it ignores the field and keeps opening tasks as before
