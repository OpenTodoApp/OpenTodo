## ADDED Requirements

### Requirement: Instance default theme
The owner SHALL be able to set the instance's default light theme and default dark theme, each OpenTodo's, a built-in or an instance theme of that kind, through `PUT /api/v1/settings/themes/default` (`{light, dark}`, each empty for OpenTodo's, `builtin:<id>` or `instance:<id>`). A member whose choice for a side is empty SHALL see the instance default for that side, and a member's own choice SHALL always win. Setting the default SHALL write nothing to any member's data, and changing it later SHALL reach every member who never chose a theme for that side. The route SHALL require the owner, SHALL be refused on the demo instance, and SHALL be recorded as `settings.changed` with the theme ids only. Errors: `unauthorized`, `forbidden`, `invalid_input` (an unknown id or a theme of the wrong kind).

#### Scenario: New member gets the house theme
- **WHEN** the owner sets the default dark theme to an instance theme and a member who never chose a theme opens the app in dark mode
- **THEN** the member sees the instance theme, Settings shows "Default (Server default: <name>)", and no op was written for the member

#### Scenario: The member's choice wins
- **WHEN** a member has chosen Nord for the dark side and the owner sets another default
- **THEN** the member keeps Nord

#### Scenario: Wrong kind refused
- **WHEN** the owner sets the default light theme to `builtin:nord`, a dark theme
- **THEN** the response is 400 `invalid_input` and the default is unchanged

#### Scenario: Member or anonymous caller
- **WHEN** a member or an anonymous request sets the default theme
- **THEN** the response is 403 `forbidden` for the member and 401 `unauthorized` for the anonymous request

#### Scenario: Demo instance
- **WHEN** a visitor of the public demo instance, as its owner, sets the default theme
- **THEN** the route is refused as on every demo-denied route and nothing changes

### Requirement: Instance themes
The owner SHALL be able to add, replace and remove up to 20 instance themes, each a valid theme document of at most 16 KB, through `PUT /api/v1/settings/themes/instance/{id}` (`new` to add) and `DELETE /api/v1/settings/themes/instance/{id}`, from a theme file or by offering a copy of one of the owner's custom themes. Every signed-in member SHALL be able to read the default and the instance themes through `GET /api/v1/themes/instance`, see the instance themes in their theme lists marked as coming from the server, choose them and customise a copy, and SHALL NOT be able to change or delete them. Removing an instance theme that is a default SHALL clear that default; members who chose it SHALL fall back to their side's default and keep their stored choice. The write routes SHALL require the owner, SHALL be refused on the demo instance and SHALL be recorded as `settings.changed` with the theme id only. Errors: `unauthorized`, `forbidden`, `invalid_input`, `too_large`, `limit_reached` (a 21st theme), `not_found`.

#### Scenario: Add a house theme
- **WHEN** the owner adds a valid dark theme file as an instance theme
- **THEN** every member sees it under "From this server" in their Dark list after their next sync wake, and can choose it

#### Scenario: Invalid or too large
- **WHEN** the owner uploads a document whose accent is `var(--x)`, or one of 17 KB
- **THEN** the response is 400 `invalid_input`, or 413 `too_large`, and the instance themes are unchanged

#### Scenario: The 21st instance theme
- **WHEN** the owner adds a theme while 20 instance themes exist
- **THEN** the response is 409 `limit_reached` and nothing is added

#### Scenario: Read by a member, refused anonymously
- **WHEN** a signed-in member reads `GET /api/v1/themes/instance` and an anonymous request does the same
- **THEN** the member receives the default and the instance themes, and the anonymous request receives 401 `unauthorized`

#### Scenario: Remove a chosen theme
- **WHEN** the owner removes an instance theme that a member chose for the light side
- **THEN** the member's app shows the light default at once after it learns of the change, and the member's stored choice is unchanged

#### Scenario: A member cannot change it
- **WHEN** a member sends `DELETE /api/v1/settings/themes/instance/{id}`
- **THEN** the response is 403 `forbidden` and the theme stays

### Requirement: Instance themes offline and in the first frame
A device SHALL remember the instance default and the instance themes it last read, SHALL use them offline and for the first frame, and SHALL refetch them when the server reports a newer version. A device that has never read them SHALL use OpenTodo's themes until it does. The sign-in, invitation and reset screens, the emails, the install splash and the instance's icons SHALL stay neutral whatever the instance default.

#### Scenario: Offline start with a house theme
- **WHEN** a member whose side follows the instance default starts the app offline
- **THEN** the first frame is in the instance default theme

#### Scenario: The owner changes the default
- **WHEN** the owner changes the default dark theme and a member's device next starts online
- **THEN** the device sees a newer version, refetches the instance themes and switches without a reload

#### Scenario: Sign-in screen
- **WHEN** someone opens the sign-in screen of an instance with a default theme
- **THEN** the screen uses OpenTodo's neutral look with the instance's name and logo
