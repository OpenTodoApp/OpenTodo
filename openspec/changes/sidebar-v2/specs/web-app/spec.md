## ADDED Requirements

### Requirement: App icons
The installed app's icons SHALL be the colour variant of the brand mark: the SVG favicon, the 192 and 512 px manifest icons, a 512 px maskable icon and the Apple touch icon, all generated from the one brand source and served under the same paths as today so that installed apps and bookmarks update their icon on the next load without a manifest path change. The sign-in, setup, reset, invitation and email screens SHALL show the mono mark beside the wordmark instead of an image of the icon. The precached shell SHALL include the new icon files, so an installed app shows its icon offline.

#### Scenario: Installed icon updates
- **WHEN** a person who installed the app before this version opens it after the update
- **THEN** the home screen or dock icon shows the brand mark on the slate square after the browser's next icon refresh, and the app's manifest lists the same icon paths as before

#### Scenario: Sign-in shows the mark
- **WHEN** a visitor opens the sign-in screen in light and in dark
- **THEN** the card starts with the mono mark at 32 px and the wordmark, and no raster icon is requested for the screen

#### Scenario: Offline icon
- **WHEN** the installed app is opened without network
- **THEN** the shell and its icons load from the precache and the browser shows the brand mark in the title bar
