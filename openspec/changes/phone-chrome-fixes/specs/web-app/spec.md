## ADDED Requirements

### Requirement: Static startup colours match the default appearance
Before the app applies a synced appearance, the static `theme-color` metas and the web app manifest SHALL use the default OpenTodo bars: the emerald light bar `#047857` for the light scheme and the dark canvas `#0d0e10` for the dark scheme. The light fallback in `public/appearance.js` SHALL use `#047857`, and the manifest's splash `background_color` SHALL be the light page canvas `#eef0f2`. A test SHALL read `index.html`, `public/appearance.js` and `vite.config.ts` and fail when a static value drifts from the default appearance.

#### Scenario: Android status bar before and after load
- **WHEN** someone with the default emerald appearance opens the installed app in light mode on an Android phone
- **THEN** the status bar is `#047857` from the first frame and keeps that colour after the app applies the synced appearance

#### Scenario: Splash on a light device
- **WHEN** the installed app starts on a light device
- **THEN** the manifest's splash background is the light canvas `#eef0f2`
