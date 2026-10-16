# Spec Delta

## MODIFIED Requirements

### Requirement: Start view per device
The user SHALL be able to choose any built-in or saved view, or a display route (OpenSpec `display-mode`: Today, Upcoming, a project or a saved view in display mode), as the start view that opens on launch. The choice SHALL be a per-device preference that persists across reloads and is not synced. If the chosen saved view or project is deleted, the device SHALL fall back to the Inbox.

#### Scenario: Open on a saved view
- **WHEN** the user sets "Work tomorrow" as the start view on their laptop and relaunches the app
- **THEN** "Work tomorrow" opens first on the laptop while the phone still opens on its own start view

#### Scenario: Deleted start view
- **WHEN** the start view is deleted on another device and this device syncs and relaunches
- **THEN** the Inbox opens and a notice explains the start view was removed

#### Scenario: Open in display mode
- **WHEN** the user chooses "Make this the start view on this device" on `/display/today?eink=1` and the tablet restarts
- **THEN** the app opens straight on that display with the same options, while other devices keep their own start view

#### Scenario: Display of a deleted project
- **WHEN** the start view is the display of a project that was deleted since
- **THEN** the Inbox opens with the notice that the start view was removed
