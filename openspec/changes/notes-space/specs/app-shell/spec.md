## ADDED Requirements

### Requirement: Sidebar spaces
The sidebar SHALL have two spaces, Tasks and Notes, chosen with a two-option control under the workspace control, which is not a destination and does not count against the six primary destinations. In the Tasks space the sidebar SHALL be as "Sidebar structure" describes. In the Notes space the primary destinations and the groups SHALL be replaced by **All notes** (opening `/notes`), a **Pinned** group listing the user's pinned standalone notes of the current workspace in the favourites order, and a **Recent** group listing the five most recently changed standalone notes that are not pinned; each note row SHALL show the note icon and the title ("Untitled note" when empty) and open the note. The workspace control, search, the schedule and the footer SHALL be the same in both spaces. Choosing a space SHALL open its home (Tasks: the device's start view; Notes: `/notes`); choosing the space already shown SHALL do nothing. The space SHALL be kept on the device only, never synced; when storage is unavailable it SHALL hold for the visit. Opening the Notes page or a note, by any means, SHALL show the Notes space; opening a task, a project, a label, a view or any other task screen SHALL show the Tasks space; Settings, Help, Import, the theme editor, the Assistant page and the Trash SHALL keep the space as it was. In the icon rail the control SHALL be two icons named in their tooltips; in the phone drawer it SHALL be at the top, under the workspace control; the phone tab bar SHALL be the same in both spaces. The Notes space reads local data only, so it works offline, and its rows follow pins, renames and new notes from other devices after sync.

#### Scenario: Switch to Notes
- **WHEN** the user in Today selects Notes in the sidebar's control
- **THEN** the Notes page opens, the sidebar shows All notes, Pinned and Recent instead of the task destinations and projects, and the workspace control and footer stay where they were

#### Scenario: Back to Tasks
- **WHEN** the user whose start view is Today selects Tasks while a note is open
- **THEN** Today opens and the sidebar shows the task destinations and groups as before

#### Scenario: A link to a task
- **WHEN** the user in the Notes space follows a link in a note to a task
- **THEN** the task opens and the sidebar shows the Tasks space; Back returns to the note and the Notes space

#### Scenario: A note from the palette
- **WHEN** the user in the Tasks space opens a note from the search and command palette
- **THEN** the note opens and the sidebar shows the Notes space

#### Scenario: Settings keeps the space
- **WHEN** the user in the Notes space opens Settings
- **THEN** the sidebar still shows the Notes space

#### Scenario: Remembered on the device
- **WHEN** the user leaves the app in the Notes space on a laptop and reloads it at `/settings`
- **THEN** the sidebar shows the Notes space on the laptop, and the user's phone keeps its own space

#### Scenario: Pinned and recent
- **WHEN** the user has pinned "Wi-Fi" and "Packing list" and edited "Trip" a minute ago
- **THEN** the Notes space lists "Wi-Fi" and "Packing list" under Pinned in the pinned order and "Trip" first under Recent, and a pin made on another device appears after sync

#### Scenario: Phone drawer
- **WHEN** the user on a 390 px phone opens the drawer
- **THEN** the control is at the top of the drawer under the workspace control, and the tab bar below the page reads Inbox, Today, Upcoming and Search in both spaces

#### Scenario: Offline
- **WHEN** the device is offline and the user switches to Notes
- **THEN** the Notes space and the Notes page show from local data with no request

## MODIFIED Requirements

### Requirement: Favourites group
The Favourites group of the Tasks space SHALL list the user's pinned projects, labels and saved filters in the user's order, each with the icon or colour and the live open-task count its own group shows, opening the same destination. Pinned standalone notes SHALL be listed in the Notes space's Pinned group instead (see "Sidebar spaces"), and the favourites list SHALL keep their entries unchanged. Items SHALL be reorderable from their menus and by keyboard, and unpinnable from their menus. The group SHALL reflect pins, order and renames from the user's other devices after sync, and SHALL render from local data so it is correct offline.

#### Scenario: Mixed kinds in order
- **WHEN** the user pins "Website launch" (project, 5 open), "Deep work" (filter, 4 matches) and "errand" (label, 3 open) and moves "Deep work" to the top
- **THEN** the group reads "Deep work 4", "Website launch 5", "errand 3" on this device now and on other devices after sync, and each row opens its view

#### Scenario: Pinned item removed
- **WHEN** a pinned project is archived or deleted on another device and this device syncs
- **THEN** it leaves the Favourites group without a reload and reappears if it is restored

#### Scenario: Pinned offline
- **WHEN** the device is offline and the user pins a label
- **THEN** it appears in Favourites at once, survives a reload, and reaches the user's other devices when the network returns

#### Scenario: Pinned note
- **WHEN** the user pins the note "Wi-Fi" and renames it "Home Wi-Fi" on another device
- **THEN** the Tasks space's Favourites group does not list it, the Notes space's Pinned group shows "Home Wi-Fi" after sync, and the favourites list still holds the note for other clients

## REMOVED Requirements

### Requirement: Notes in the More group
**Reason**: Notes are a space of the sidebar of their own (see "Sidebar spaces"), so they are no longer a task destination in More and are no longer promotable.
**Migration**: A promotion of `notes` stored by an earlier version stays in the stored list and destination order unchanged; this version ignores it, and earlier versions keep reading it as before. The Notes page is reached from the space control, `g e`, the palette and links.
