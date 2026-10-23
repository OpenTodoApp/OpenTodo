# appearance-preferences Specification

## Purpose
Lets each user choose how the web app looks, with a light, dark or system mode and one of a fixed set of accent themes, once for all of their devices, while colours that carry meaning stay the same.

## Requirements

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

### Requirement: Density preference
Each user SHALL have a density preference, `comfortable` (default) or `compact`, stored and synced like mode and theme as an additive preference, applied at once to task rows, group headers and the sidebar. Comfortable rows SHALL be 36 px and compact rows 32 px with a fine pointer. A client SHALL treat an unknown value as `comfortable` and keep the stored value unchanged. Touch targets SHALL stay 44 px on coarse pointers in both densities.

#### Scenario: Compact on two devices
- **WHEN** the user picks Compact on a laptop
- **THEN** rows are 32 px tall there at once and on the user's tablet after sync, where touch targets remain 44 px

### Requirement: Sidebar destinations preference
Each user SHALL have a synced list of promoted destinations, shown among the primary sidebar items. Any of these can be promoted: Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter. The default is empty. Settings → Appearance SHALL offer one switch per destination. A client SHALL ignore unknown entries and keep the stored value unchanged. While the user's "How you work" preference is `first`, the switches SHALL be shown disabled with a sentence explaining that Open Loops first arranges the sidebar, and the stored list SHALL be kept.

#### Scenario: Promote Someday
- **WHEN** the user turns on Someday in Settings → Appearance
- **THEN** Someday is listed under Calendar in the primary items on every device after sync and leaves the More group

#### Scenario: Companion promotes Next
- **WHEN** a user in `companion` mode turns on Next
- **THEN** Next is listed under Calendar in the primary items on every device after sync

#### Scenario: Older client
- **WHEN** a client that predates this change receives a promotion list containing `next`
- **THEN** it ignores the entry and keeps the stored value unchanged

#### Scenario: Open Loops first
- **WHEN** a user in `first` mode opens Settings → Appearance
- **THEN** the destination switches are disabled with the explanation, and switching back to `companion` restores the promotions they show

### Requirement: Favourites preference
Each user SHALL have a synced, ordered list of favourites, each an entry naming a kind (project, label or saved filter) and an id, stored and synced like the promoted destinations as an additive preference; the default is empty. A client SHALL ignore entries of an unknown kind or whose item is missing, archived or deleted, and keep the stored value unchanged. A saved filter whose own pinned flag is set SHALL be treated as a favourite even when the list does not name it, after the listed entries.

#### Scenario: Pin on two devices
- **WHEN** the user pins a project on a laptop
- **THEN** the project is in Favourites there at once and on the user's phone after sync, in the same position

#### Scenario: Unknown kind from a newer device
- **WHEN** a device receives a favourites list containing an entry of a kind it does not know
- **THEN** it shows the entries it knows, keeps the stored value unchanged, and a later write from this device preserves the unknown entry

#### Scenario: Filter pinned on an older device
- **WHEN** an older device sets a saved filter's pinned flag without writing the favourites list
- **THEN** devices with this change list the filter in Favourites after the listed entries, and unpinning it on a new device clears the flag and removes it from the list

#### Scenario: Concurrent pins converge
- **WHEN** two devices pin different projects while offline and then sync
- **THEN** both devices show the same Favourites group, the later write's order winning for the list and no project duplicated

### Requirement: Retired row detail preference
The `row_detail` field of the user's appearance preferences SHALL remain in the operation schema and the client defaults as a retired field: it is accepted, stored, synced and exported exactly as before, converges by last-writer-wins on the field, and SHALL have no effect on how rows render. No client SHALL write it, and no client SHALL remove or rename it; an older client that still writes `detailed` SHALL cause no change on a current client.

#### Scenario: Older client writes Detailed
- **WHEN** a device running the previous version picks Detailed and syncs
- **THEN** the current devices receive the op, keep the value, and keep rendering the one row

#### Scenario: Export round-trip
- **WHEN** a user whose stored `row_detail` is `detailed` exports and imports into a new account
- **THEN** the value travels in the export and is stored, and the rows are unchanged

#### Scenario: Nothing is written
- **WHEN** a user opens Settings → Appearance and changes the density
- **THEN** one op for `density` is queued and none for `row_detail`

### Requirement: Appearance in Settings without a Rows choice
Settings → Appearance SHALL be its own section offering a mode control, one tile per theme (a horizontal row of swatches below 640 px), the density choice, the haptic feedback switch on devices that can vibrate, and the sidebar destination switches. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode, theme, density and haptics state SHALL be announced to assistive technology. The section SHALL NOT offer a row detail choice.

#### Scenario: Pick a theme by keyboard
- **WHEN** the user tabs to the theme tiles, moves with the arrow keys to `teal` and presses Enter or Space
- **THEN** the app switches to the teal accent at once and the teal tile is marked as selected

#### Scenario: Previews follow the mode
- **WHEN** the user switches the mode from `light` to `dark` in the panel
- **THEN** the app and every tile preview turn dark at once

#### Scenario: Swatches on a phone
- **WHEN** the user opens Appearance on a 390 px screen
- **THEN** the eight themes are a single scrollable row of named swatches, not a grid of cards

#### Scenario: No Rows control
- **WHEN** the user tabs through Settings → Appearance after Density
- **THEN** the next control is the haptic feedback switch on a device that can vibrate and otherwise the first sidebar destination switch, and searching settings for "Calm" or "Detailed" finds nothing

### Requirement: Haptic feedback preference
Each user SHALL have a `haptics` preference, `on` or `off`, defaulting to `on`, synced like the other appearance preferences as an additive field and editable offline, converging by last-writer-wins. With it on, a device that can vibrate SHALL give a short tick (at most 15 ms) when a task is completed and when a long press lifts a task for dragging; with it off, or on a device that cannot vibrate, nothing SHALL vibrate. The switch SHALL appear in Settings → Appearance only on devices that can vibrate; a client that receives an unknown value SHALL treat it as `on` and keep the stored value.

#### Scenario: Complete on a phone
- **WHEN** the preference is on and the user completes a task on a phone whose browser supports vibration
- **THEN** the device ticks once as the check mark fills, and does not tick again when the row leaves

#### Scenario: Turned off on one device
- **WHEN** the user turns haptics off on their phone while offline and later opens a tablet
- **THEN** the phone stops ticking at once, the preference syncs when online, and the tablet stops ticking too

#### Scenario: Desktop hides the switch
- **WHEN** the user opens Settings → Appearance in a desktop browser without vibration support
- **THEN** no haptics row is shown and nothing is written to the preference

#### Scenario: Older device
- **WHEN** a device with an app version before this preference receives the field
- **THEN** it ignores the field and keeps syncing as before
