# Spec Delta

## ADDED Requirements

### Requirement: Sidebar counts preference
Each user SHALL have a synced sidebar counts preference: "Inbox and Today" (the default) or "Every list", offered in Settings → Appearance with a short description of each. It decides which sidebar rows show their count at rest (`app-shell` "Sidebar structure"). Counts are always computed on the device from local rows and are never stored, so they are correct offline and follow every sync. The preference is an additive field of the user's preferences row: written offline through the outbox, converging by last-writer-wins, included in the export. An unknown value reads as the default and is kept unchanged.

#### Scenario: Turn every count on
- **WHEN** the user chooses "Every list" in Settings → Appearance on the laptop
- **THEN** the laptop's sidebar shows the counts of projects, labels and views at once, and the phone does after sync

#### Scenario: Default
- **WHEN** a user who never changed the preference opens Settings → Appearance
- **THEN** "Inbox and Today" is selected and the sidebar shows numbers only on Inbox, Today and collapsed group headers

#### Scenario: Offline
- **WHEN** the device is offline and the user switches to "Every list"
- **THEN** the counts show at once from local data and the choice reaches the other devices when the network returns

#### Scenario: Unknown value
- **WHEN** a newer client stores a value this client does not know
- **THEN** this client shows the default and keeps the stored value unchanged

### Requirement: Primary destination order
Each user SHALL have a synced order of the primary sidebar destinations. Settings → Appearance SHALL list the destinations that can be primary in that order: Inbox, Today, Upcoming and Calendar, and the promotable ones with their "Show in sidebar" switch. Each row SHALL have a drag handle and Move up and Move down in its menu, and Alt+↑ and Alt+↓ SHALL move the focused row.

The sidebar SHALL list the primary destinations that are shown in this order:
- destinations missing from it follow in the default order;
- ids a client does not know are ignored and kept.

The order is an additive field of the user's preferences row, separate from the promotion list: written offline through the outbox, converging by last-writer-wins on the whole order, and included in the export. While "How you work" is Open Loops first, the list SHALL be disabled with the existing explanation and the stored order kept. The phone tab bar keeps Today, Inbox and Upcoming, and the drawer lists the remaining primary destinations in the stored order.

#### Scenario: Move Today first
- **WHEN** the user moves Today above Inbox with Move up in Settings → Appearance
- **THEN** the sidebar lists Today, Inbox, Upcoming, Calendar on this device at once and on the user's other devices after sync

#### Scenario: Keyboard
- **WHEN** focus is on the Calendar row of the list and the user presses Alt+↑ twice
- **THEN** Calendar moves above Today and Upcoming, the change is announced, and focus stays on the Calendar row

#### Scenario: Newly promoted destination
- **WHEN** the stored order holds `today,inbox,upcoming,calendar` and the user promotes Someday
- **THEN** Someday is listed last among the primary destinations, and can then be moved

#### Scenario: Concurrent reorders
- **WHEN** the laptop moves Calendar first and the phone moves Upcoming first, both offline, then both sync
- **THEN** every device shows the order written last, whole

#### Scenario: Older client
- **WHEN** a client that predates this change syncs a stored order
- **THEN** it shows its default order and keeps the field unchanged, and a later promotion from that client does not remove it
