# Spec Delta

## MODIFIED Requirements

### Requirement: Pinned views in the sidebar
Every saved view SHALL be listed in a "Views" group in the sidebar, in the sidebar's single scroller, ordered by position, and SHALL be reorderable from its menu. With the default sidebar counts preference a sidebar view row SHALL show no count; with every count on (`appearance-preferences` "Sidebar counts preference") a list view's row SHALL show its open-match count, as `app-shell` "Sidebar structure" describes, and a dashboard's row none. The open-task count, computed locally, SHALL always be in the row's accessible name ("Waiting, 2 open tasks"), on the Views overview opened with `g v` and the group's "All" action, and in the view's page header. A saved view whose query no longer parses SHALL keep an error mark on its row with the message in its accessible name, in place of any count. The Views group SHALL start closed on a device that has not stored a state for it, and SHALL be hidden until the user has a saved view. A pinned saved view SHALL also appear in the sidebar's Favourites group, where "Pin to sidebar" sets its pinned flag and its favourites entry together and unpinning clears both; the Favourites row follows the same count rule. The sidebar SHALL reflect pins, order and renames from other devices after sync, and counts SHALL update live from local data without a reload.

#### Scenario: Count and order
- **WHEN** the user has saved "Work tomorrow" (4 open matches) and "Waiting" (2) and moves "Waiting" first
- **THEN** the Views group shows "Waiting" above "Work tomorrow" with no visible numbers, their accessible names read "Waiting, 2 open tasks" and "Work tomorrow, 4 open tasks", the Views overview lists "Waiting 2" above "Work tomorrow 4", and the order is the same on other devices after sync

#### Scenario: Count in the header, not the row
- **WHEN** the user opens "Work tomorrow" from the sidebar
- **THEN** the page header's meta reads "4", the sidebar row stays without a number, and completing one match changes the header to "3" and the row's accessible name to "Work tomorrow, 3 open tasks" without a reload

#### Scenario: Pin to Favourites
- **WHEN** the user chooses "Pin to sidebar" on "Waiting"
- **THEN** "Waiting" appears in the Favourites group without a visible count, stays listed in the Views group, and its pinned flag reads true through the API

#### Scenario: Unpin
- **WHEN** the user unpins "Waiting"
- **THEN** it leaves the Favourites group and is still listed in the Views group and the Views overview

#### Scenario: Closed on a new device
- **WHEN** a user with three saved views signs in on a new device
- **THEN** the Views group header reads "Views 3" with no rows under it, opening it lists the three rows, and the choice is remembered on that device only

#### Scenario: Every count on
- **WHEN** every sidebar count is on and the user completes one of the 4 matches of "Work tomorrow"
- **THEN** its sidebar row changes from "4" to "3" without a reload, and the board "Week" in the same group shows no number

## ADDED Requirements

### Requirement: View icon
A saved view SHALL have an optional icon from the app's icon catalogue, an additive field that is null by default. A view without an icon, or with a name this client does not know, SHALL show the default icon of its kind. "Icon…" in the view menu SHALL offer the same icon picker as projects, including "No icon". The icon SHALL be shown wherever the view is listed: the Views group, Favourites, the Views overview, the view's page header, the command palette and the Start view choice.

The icon is not content, so it is not encrypted. It is written offline through the outbox, converges by last-writer-wins on the field, and is included in the export. Sync SHALL accept any string, so a newer catalogue stays additive. The API SHALL accept `icon` on create and patch as null or a catalogue name, and reject anything else.

#### Scenario: Choose an icon
- **WHEN** the user opens the menu of "Waiting", chooses "Icon…" and picks "hourglass"
- **THEN** the hourglass replaces the default icon in the Views group, the Views overview and the view's header on this device at once, and on the user's other devices after sync

#### Scenario: Offline
- **WHEN** the device is offline and the user sets an icon on a view
- **THEN** it shows at once, survives a reload, and reaches the other devices when the network returns

#### Scenario: Unknown icon from a newer client
- **WHEN** a device receives a view whose icon is a name its catalogue does not have
- **THEN** it shows the view's default icon and keeps the stored name unchanged

#### Scenario: Set through the API
- **WHEN** a script PATCHes `{"icon":"hourglass"}` on a view with a bearer token
- **THEN** the response is 200 with the view carrying the icon, and devices show it after their next sync

#### Scenario: Invalid icon
- **WHEN** a patch body sets `icon` to `"not-an-icon"` or to `42`
- **THEN** the response is 400 `invalid_input` naming `icon` and nothing is written

#### Scenario: Unauthenticated
- **WHEN** a request without credentials patches a view's icon
- **THEN** the response is 401 `unauthorized` and nothing is written

#### Scenario: In the export
- **WHEN** the user downloads the export
- **THEN** each view in `views` carries `icon`, null for views without one
