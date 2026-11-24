## ADDED Requirements

### Requirement: Click a task to: the account's choice and the server's default
The account preference "Click a task to" in Settings → Appearance → Task details SHALL offer "Use the server default" (the initial value, naming the default it follows), "Select, then edit the title" and "Open details". It SHALL be stored in the synced user preferences, written through the op log, so a choice made offline applies at once on that device and reaches the account's other devices on sync, converging per field by last-writer-wins. An unknown stored value SHALL read as "Use the server default" and be kept.

Under "Select, then edit the title" a pointer click SHALL follow "A click selects the row, a second click edits its title". Under "Open details" a pointer click on a task row's title or empty area, in every list that rule covers, SHALL open the task as Enter does (its page, or the side panel or the Inbox's split where they show) and SHALL never start an inline title edit. Under both, `F2`, Enter, the double-click, `a`, Shift and Ctrl/⌘ clicks, Select mode and touch SHALL behave as that rule says.

The owner SHALL set the server's default in Settings → Server → Task lists, "Select, then edit the title" until set. Every account whose choice is "Use the server default" SHALL follow it; an account's own choice SHALL always win. A device SHALL keep the last default it read, so it follows the default without a connection.

The default SHALL be changed with `PUT /api/v1/settings/row-click` `{default}` (`select` or `open`), which requires a signed-in owner, is refused on a demo instance and is recorded as a `settings.changed` audit event. `GET /api/v1/auth/status` SHALL report it to signed-in callers as `rowClick: {default}`.

#### Scenario: The server default applies
- **WHEN** the owner sets Server → Task lists to "Open details" and a member who never chose clicks the title of "Pay rent" in Today with a mouse
- **THEN** the task opens as Enter opens it and no title field appears

#### Scenario: The account choice wins and follows the account
- **WHEN** the server default is "Open details" and a member chooses "Select, then edit the title" on a laptop, offline
- **THEN** a click on the laptop selects the row and a second click edits its title at once, and after both devices sync the member's phone and desktop follow the same choice

#### Scenario: Open details beside the side panel
- **WHEN** an account with "Open details" and the side panel clicks the title of "Call the bank", then clicks it again
- **THEN** the panel shows "Call the bank" and its title in the list never becomes a text field

#### Scenario: Back to the server default
- **WHEN** a member chooses "Use the server default" again
- **THEN** their clicks follow the server's default, now and after it changes

#### Scenario: Only the owner sets the default
- **WHEN** an admin or a member sends `PUT /api/v1/settings/row-click` `{"default": "open"}`
- **THEN** the server answers 403 and the default is unchanged; without a session or token it answers 401

#### Scenario: An unknown value is refused
- **WHEN** the owner sends `PUT /api/v1/settings/row-click` `{"default": "expand"}`
- **THEN** the server answers 400 `invalid_input` and the default is unchanged
