# Spec Delta

## Purpose

Lets each user choose how the web app looks, with a light, dark or system mode and one of a fixed set of accent themes, once for all of their devices, while colours that carry meaning stay the same.

## ADDED Requirements

### Requirement: Appearance preferences
Each user SHALL have two appearance preferences:
- mode: `system`, `light` or `dark`
- theme: `emerald`, `blue`, `indigo`, `violet`, `rose`, `orange`, `teal` or `graphite`

Mode SHALL default to `system`, which follows the operating system's colour scheme. Theme SHALL default to `emerald`. A client SHALL treat an unknown or missing value as the default and SHALL keep the stored value unchanged.

#### Scenario: New account
- **WHEN** a user who never opened the appearance settings opens the app on a device whose system is dark
- **THEN** the app is dark with the emerald accent, exactly as before this change

#### Scenario: Unknown theme from a newer client
- **WHEN** a device receives a theme value it does not know
- **THEN** it shows the emerald theme and does not write any op

#### Scenario: Any mode with any theme
- **WHEN** the user picks the `violet` theme and the `dark` mode
- **THEN** the app is dark with the violet accent

### Requirement: Appearance is personal, synced and offline
The appearance preferences SHALL be written as operations on the user's personal data, so that they apply on every device of that user and never on another user's. They SHALL be editable offline and take effect at once on the editing device. Concurrent edits SHALL converge per preference by last-writer-wins. There SHALL be no per-device override.

#### Scenario: Change on one device
- **WHEN** the user picks the `blue` theme on a laptop and a phone later syncs
- **THEN** both devices show the blue accent, the phone without a reload

#### Scenario: Change offline
- **WHEN** the device is offline and the user sets the mode to `dark`
- **THEN** the device turns dark immediately, and the change reaches the other devices on the next sync

#### Scenario: Concurrent edits
- **WHEN** device A sets the theme to `teal` and device B sets it to `rose`, both offline, and both sync
- **THEN** every device ends with the value written with the greater timestamp, and a mode change made on either device in the meantime is kept

#### Scenario: Not shared with project members
- **WHEN** a user who shares a project with someone picks the `orange` theme
- **THEN** the other member's devices keep their own appearance

#### Scenario: Included in the export
- **WHEN** a user with the `indigo` theme downloads their JSON export and imports it into a new account
- **THEN** the export contains the mode and theme, and the new account shows the indigo theme

### Requirement: Mode decides light or dark
With mode `light` the app SHALL use the light values of every token, and with `dark` the dark values, whatever the operating system's colour scheme. With `system` it SHALL follow the operating system and switch when the system switches, without a reload.

#### Scenario: Dark app on a light system
- **WHEN** the system colour scheme is light and the user's mode is `dark`
- **THEN** every screen uses the dark token values

#### Scenario: System switches at sunset
- **WHEN** the mode is `system` and the operating system changes from light to dark while the app is open
- **THEN** the app turns dark without a reload

### Requirement: A theme changes only the accent
A theme SHALL change the accent colours: primary actions, the focus ring, links, selection, the current navigation item and accent-tinted surfaces. It SHALL NOT change neutrals and surfaces, priority colours p1 to p4, status colours (success, warning, danger, info) or the rendering of stored project, label and view colours. No theme SHALL use a red accent.

#### Scenario: Completed task under another theme
- **WHEN** the theme is `blue` and a task is completed
- **THEN** primary buttons are blue and the completed check mark keeps the success colour

#### Scenario: Priority and project colours
- **WHEN** the user switches from `emerald` to `rose`
- **THEN** a p1 task's flag and a green project's dot look exactly as before the switch

### Requirement: No flash of the wrong appearance
A device SHALL remember the last appearance it applied and SHALL apply it before the first frame of the app is drawn, so the app never briefly shows another mode or theme on start. When the synced value differs, the app SHALL switch to it as soon as it is read, without a reload. Remembering the appearance on the device SHALL NOT write an op.

#### Scenario: Reopening a dark app
- **WHEN** a user whose mode is `dark` on a light system reopens the app
- **THEN** the first frame drawn is already dark

#### Scenario: First start on a new device
- **WHEN** the user signs in on a device that has never run the app
- **THEN** it starts with the defaults and switches to the user's synced appearance once their data has synced

### Requirement: Browser and system bar colour follows the appearance
The colour the browser or operating system uses around the app (address bar, installed app's title bar, phone status bar) SHALL follow the appearance live: the theme's accent in light mode and the dark canvas colour in dark mode, including when `system` mode switches. The install splash screen, which is fixed when the app is installed and the same for every user of the server, SHALL keep its neutral colour.

#### Scenario: Installed app on a phone
- **WHEN** the app is installed on a phone, the mode is `light` and the theme is `orange`
- **THEN** the status bar is the orange accent, and after switching the mode to `dark` it becomes the dark canvas colour without a reload

#### Scenario: Splash screen
- **WHEN** the installed app is launched
- **THEN** the splash screen shows the server's neutral colour, and the first frame after it uses the user's remembered appearance

### Requirement: Appearance in Settings
Settings → Preferences SHALL offer an Appearance panel with a mode control and one tile per theme. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode and theme SHALL be announced to assistive technology.

#### Scenario: Pick a theme by keyboard
- **WHEN** the user tabs to the theme tiles, moves with the arrow keys to `teal` and presses Enter or Space
- **THEN** the app switches to the teal accent at once and the teal tile is marked as selected

#### Scenario: Previews follow the mode
- **WHEN** the user switches the mode from `light` to `dark` in the panel
- **THEN** the app and every tile preview turn dark at once
