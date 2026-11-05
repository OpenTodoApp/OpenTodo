# Spec Delta

## MODIFIED Requirements

### Requirement: Primary destination order
Each user SHALL have a synced order of the primary sidebar destinations. Settings → Appearance SHALL list the destinations that can be primary in that order: Inbox, Today, Upcoming and Calendar, and the promotable ones with their "Show in sidebar" switch. Each row SHALL have a drag handle and Move up and Move down in its menu, and Alt+↑ and Alt+↓ SHALL move the focused row.

The sidebar SHALL list the primary destinations that are shown in this order:
- destinations missing from it follow in the default order;
- ids a client does not know are ignored and kept.

The order is an additive field of the user's preferences row, separate from the promotion list: written offline through the outbox, converging by last-writer-wins on the whole order, and included in the export. While "How you work" is Open Loops first, the list SHALL be disabled with the existing explanation and the stored order kept. On a phone the tab bar lists Inbox, Today and Upcoming in this order, then Search, which is not a destination and stays last; the bar does not gain further destinations, including while Open Loops first arranges the sidebar. The drawer lists the remaining primary destinations in the stored order and does not repeat the three the bar holds. The bar reads the stored order from the local preferences row, so it is right offline and follows a reorder from another device after sync.

#### Scenario: Move Today first
- **WHEN** the user moves Today above Inbox with Move up in Settings → Appearance
- **THEN** the sidebar lists Today, Inbox, Upcoming, Calendar on this device at once and on the user's other devices after sync

#### Scenario: Phone tab bar follows the order
- **WHEN** the user moved Today above Inbox and opens the app on a 390 px phone
- **THEN** the tab bar shows Today, Inbox, Upcoming and Search, and the drawer lists Calendar without repeating those three

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
