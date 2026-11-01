# themes Specification

## Purpose
Lets the whole interface take the colours, corners and type of a theme, the way code editors do: a documented, versioned theme file that sets the app's semantic tokens from a few seeds, applied before the first paint, chosen separately for light and dark, synced across the user's devices, and checked for readable contrast.

## Requirements

### Requirement: Theme document format
A theme SHALL be a JSON document carrying a format version (an integer, 1 for this change), an id, a name, an author, a licence, an optional source given as text, a kind (`light` or `dark`), seeds (canvas, surface, text and accent, and optionally the success, warning, danger and info hues), and optionally explicit values for any token of the closed list of semantic tokens (surfaces, the four text tones, lines, accent steps, status steps, priorities p1 to p4 with their soft steps, the solid step of each of the 12 label hues, scrim, highlight and charts), a bar colour, a radius scale of five steps (0 to 20 px each) and a type choice (the bundled typeface, the system, serif or monospace stack, or a font installed on the device by name; and a list text size of 13, 14 or 15 px). Colours SHALL be written as `#rrggbb` or as an OKLCH value inside the sRGB gamut, with transparency allowed only on the scrim. A document SHALL be at most 16 KB. The app SHALL refuse a document that breaks these rules, SHALL keep and ignore a token name it does not know, and SHALL never read a URL, a CSS expression or a font from another host out of a document; the source is shown as text and never fetched. The format SHALL be published as a JSON Schema with documentation of every key and token, and the app and the server SHALL accept and refuse exactly the same shared example documents.

#### Scenario: A valid document
- **WHEN** a document with format 1, kind `dark`, the four required seeds and no other values is read
- **THEN** it is accepted and every token of the list has a value after derivation

#### Scenario: A document that tries to carry CSS
- **WHEN** a document gives the canvas as `url(https://example.com/x.png)` or a token as `var(--ot-text)`
- **THEN** it is refused as invalid, nothing is applied and no request leaves the device

#### Scenario: Unknown token from a newer app
- **WHEN** a document carries a token `hue-amber` that this app does not know
- **THEN** the document is accepted, the token is ignored when applying, and it is still in the document when the document is exported or synced

#### Scenario: Too large
- **WHEN** a document is 17 KB
- **THEN** it is refused as too large in the app and on the server

#### Scenario: Shared examples
- **WHEN** a contributor makes the app accept an example that the server refuses
- **THEN** the shared example test fails naming the file and which side disagreed

### Requirement: Format versions and migration
The app SHALL migrate a document of an older known format to the current one before using it, without changing the stored document. A document of a newer format than the app knows, or one that fails validation, SHALL NOT be applied: the side it was chosen for SHALL show its default theme, the app SHALL write no op, the stored choice and document SHALL stay as they are, and Settings SHALL say that the theme was made with a newer version of OpenTodo or is invalid.

#### Scenario: Newer format on an older app
- **WHEN** an app that knows format 1 receives a chosen theme of format 2
- **THEN** it shows the default theme for that side, writes nothing, and after updating the app the chosen theme applies

### Requirement: Missing tokens are derived from the seeds
Every token a theme does not set SHALL be derived on the device from the theme's seeds, keeping each seed's hue and moving only lightness (and chroma, to stay displayable) until every contrast pair the design system measures passes for the theme's kind. The accent SHALL keep at least the distance from the theme's danger and priority-1 colours that the custom accent keeps. A theme made only of seeds SHALL therefore always be complete and pass every pair, including tokens added to the app after the theme was written. Explicit values SHALL never be moved by the derivation. The derivation SHALL be deterministic, so every device shows the same colours for the same document and app version, and SHALL be pinned by test vectors, among them that OpenTodo's own seeds reproduce the default tokens.

#### Scenario: Four seeds
- **WHEN** a theme gives only a light canvas, a white surface, a dark text and a pale yellow accent
- **THEN** the muted and faint tones, borders, raised and sunken surfaces, accent steps, status, priorities and the 12 label hues all exist and pass their contrast pairs, and the accent keeps its yellow hue at a lightness that reaches them

#### Scenario: A token added later
- **WHEN** a new version of the app adds a token and a user's theme was written before it
- **THEN** the token is derived from that theme's seeds and passes its pairs, with no change to the stored theme

#### Scenario: Explicit value kept
- **WHEN** a theme sets `muted` explicitly to a value that reaches only 4.1:1 on its surface
- **THEN** the value is used as written and the contrast checker reports that pair

### Requirement: Applying a theme without a flash
The app SHALL apply the active theme's tokens, radius scale and type to the whole interface at once and without a reload when the choice, the mode or the operating system's colour scheme changes. A device SHALL remember the resolved active themes and SHALL apply the right one before the first frame is drawn, so the app never briefly shows another theme on start; it SHALL never derive a theme before the first frame and SHALL ignore a remembered theme that is malformed. When the synced choice or the theme itself differs from what was remembered, the app SHALL switch as soon as it reads it. Remembering SHALL NOT write an op. Under the high-contrast presentation, the theme's colours SHALL NOT apply; its radius and type SHALL still apply.

#### Scenario: Reopen with Nord
- **WHEN** a user whose dark theme is a dark palette reopens the installed app in dark mode
- **THEN** the first frame is drawn in that palette's canvas and text, not in OpenTodo Dark

#### Scenario: High contrast wins
- **WHEN** a non-default theme is active and the user turns high contrast on
- **THEN** the canvas is pure white or black with black or white text exactly as with OpenTodo's themes, and turning it off brings the theme back at once

#### Scenario: Malformed cache
- **WHEN** the remembered theme on the device has been edited by hand into an invalid value
- **THEN** the first frame shows the default theme and the app then applies the synced choice

### Requirement: Theme choice per light and dark side, synced
Each user SHALL have a theme choice for the light side and one for the dark side, empty by default, meaning OpenTodo Light and OpenTodo Dark. The light side's theme SHALL apply whenever the app is light and the dark side's whenever it is dark; with mode `system` the app SHALL switch between them when the operating system switches. A side SHALL accept only a theme of its kind. A choice naming an unknown, unavailable or invalid theme, or a theme of the other kind, SHALL read as that side's default without writing an op, and SHALL apply once the theme becomes available. The choices SHALL be written as operations on the user's personal data, editable offline with effect at once, converge per side by last writer wins, never apply to another user, and be part of the JSON export and import. Theme choices and theme documents are not user content and SHALL NOT be end-to-end encrypted; the documentation SHALL say so.

#### Scenario: Day and night palettes
- **WHEN** the mode is `system`, the light side is a light palette and the dark side a dark palette, and the operating system turns dark at sunset
- **THEN** the app switches from the light palette to the dark palette without a reload

#### Scenario: Offline and concurrent
- **WHEN** device A chooses one dark theme and device B another, both offline, and both sync
- **THEN** every device ends with the dark-side choice written with the greater timestamp, and a light-side choice made on either device in the meantime is kept

#### Scenario: Unavailable theme
- **WHEN** a device receives a dark-side choice naming a theme it does not have
- **THEN** it shows OpenTodo Dark, writes nothing, and keeps the stored choice

#### Scenario: Export and import
- **WHEN** a user with a light and a dark theme chosen downloads their JSON export and imports it into a new account
- **THEN** both choices are in the export and the new account shows the same themes

### Requirement: OpenTodo Light and OpenTodo Dark are themes
OpenTodo's default tokens SHALL also be published as two theme documents, OpenTodo Light and OpenTodo Dark, generated from the stylesheet and kept equal to it by a test. They SHALL be the first entries of each side's theme list and the default of each side. Choosing them SHALL look exactly as the app looks without a theme, with the user's accent theme or custom accent applied as before.

#### Scenario: Stale generated document
- **WHEN** a contributor changes the dark muted token in the stylesheet and does not regenerate the documents
- **THEN** the theme document test fails naming the token

#### Scenario: Nothing changes for current users
- **WHEN** a user who never opened the theme choice updates the app
- **THEN** every screen looks as before, with their accent, and no op is written

### Requirement: Accent themes apply to the OpenTodo themes
The accent preference (the eight accent themes and the custom accent) SHALL apply while an OpenTodo theme is active on the current side. While another theme is active, that theme's accent SHALL apply, and Settings SHALL show the accent choice as coming from the theme instead of offering the tiles for that side. The stored accent SHALL be kept and SHALL apply again when an OpenTodo theme is chosen.

#### Scenario: Teal and a palette
- **WHEN** a user with the Teal accent chooses a dark palette for the dark side and switches to dark mode
- **THEN** the app uses the palette's accent, the accent row says it comes from the theme, and switching back to OpenTodo Dark shows Teal again

### Requirement: Every theme in the repository passes the contrast gate
`make check` SHALL resolve every theme document shipped in the repository and measure every contrast pair the design system holds for its kind, failing with the theme, the pair, the measured and the required ratio. It SHALL also derive themes from a fixed sweep of seed sets covering light and dark canvases, the hue circle and pale and saturated accents, and require that each passes every pair. The app SHALL offer the same measurement for any theme document on the device, with results that agree with the gate on every shipped theme.

#### Scenario: A shipped theme fails
- **WHEN** a contributor sets a shipped theme's faint text so it reaches 4.2:1 on its canvas
- **THEN** `make check` fails naming the theme, `faint` on `canvas`, 4.2 and 4.5

#### Scenario: The derivation's guarantee
- **WHEN** a contributor changes a derivation step so a swept seed set's accent soft text falls below 4.5:1
- **THEN** `make check` fails naming the seed set, the pair and the ratio

### Requirement: System bars follow the theme
The browser and system bar colour SHALL be the active theme's bar colour when it gives one, and otherwise its accent for a light theme and its canvas for a dark theme, following the mode and the operating system live. In a native shell that offers it, the phone's status and navigation bars SHALL take the same colour with icons that stay legible on it, from the first frame of the shell. The install splash screen and the instance's icons SHALL stay neutral.

#### Scenario: Phone in a dark palette
- **WHEN** the Android app shows a dark palette whose bar colour is its canvas
- **THEN** the status and navigation bars are that colour with light icons, and on the next launch the bars have it before the page is drawn

#### Scenario: Older shell
- **WHEN** a shell without the system bar capability runs a non-default theme
- **THEN** the page is themed and the shell's bars stay as they were

### Requirement: Built-in theme catalogue
The app SHALL ship, beside OpenTodo Light and OpenTodo Dark, these built-in themes: Solarized Light and Solarized Dark, Gruvbox Light and Gruvbox Dark, Catppuccin Latte and Catppuccin Mocha, Rosé Pine Dawn and Rosé Pine, Tokyo Night Light and Tokyo Night, One Light and One Dark, Nord, and Dracula. Each SHALL be listed only on the side of its kind, set colours only (no font, text size or radius change), and keep a stable id across versions. A built-in theme SHALL be available offline once the app is installed. When the user chooses one theme of a light and dark family for one side and the other side is not that family, Settings SHALL offer to set the other side to its counterpart, writing that op only when the user accepts.

#### Scenario: Choose Nord
- **WHEN** the user in dark mode chooses Nord in the Dark list
- **THEN** the app takes Nord's canvas, text and accent at once, one op is written for the dark side, and the user's other devices switch after sync

#### Scenario: Offer the counterpart
- **WHEN** the mode is `system`, the user chooses Solarized Light for the light side, and the dark side is OpenTodo Dark
- **THEN** Settings offers "Also use Solarized Dark at night", and accepting writes one op for the dark side while dismissing writes nothing

#### Scenario: Dark-only palettes
- **WHEN** the user opens the Light list
- **THEN** Nord and Dracula are not in it

#### Scenario: Offline after install
- **WHEN** the device is offline and the user opens Appearance and chooses Gruvbox Dark
- **THEN** it applies at once, and the choice syncs when the device is back online

### Requirement: Built-in themes are faithful and readable
Each built-in theme SHALL take its seeds and explicit tokens from its palette's published colours by a written mapping, and SHALL pass every contrast pair of the gate at WCAG AA. Where a published colour misses a pair, the theme SHALL use the nearest lightness of the same hue that passes, SHALL record the published value it replaced, and its details SHALL say that some colours were adapted for contrast. The 12 label hues SHALL stay distinguishable from each other in every built-in theme.

#### Scenario: An adapted comment colour
- **WHEN** a palette's comment colour reaches only 3.6:1 on its background and is used as the faint tone
- **THEN** the built-in theme's faint tone has the same hue at a lightness that reaches 4.5:1, the document records the published value, and the details mention the adaptation

#### Scenario: A built-in fails in CI
- **WHEN** a contributor edits a built-in so a label chip's text reaches 4.3:1
- **THEN** `make check` fails naming the theme, the pair and the ratio

#### Scenario: Label hues too close
- **WHEN** a contributor maps two label hues of a built-in to nearly the same colour
- **THEN** the catalogue test fails naming the theme and the two hues

### Requirement: Credits and licences of built-in palettes
Every built-in theme taken from another project SHALL be under a licence that allows its use and SHALL name its author, licence and project; the app SHALL show the author on the theme's card and, in the theme's details, the licence, the copyright line, the project's address as text and a line saying that OpenTodo is not affiliated with the project. The full licence notices SHALL ship with the app and be readable from the details without contacting any other host, and the documentation SHALL list the same credits. A palette whose licence or naming terms are unclear SHALL NOT be shipped.

#### Scenario: About a theme
- **WHEN** the user opens About this theme on the Catppuccin Mocha card
- **THEN** the dialog shows the author Catppuccin, the MIT licence, the copyright line, the project's address and the not-affiliated line, and its Licence link opens the notice served by the user's own server

#### Scenario: Missing credit
- **WHEN** a contributor adds a built-in document without a credits entry
- **THEN** the catalogue test fails naming the theme

### Requirement: The catalogue loads lazily
The built-in catalogue SHALL NOT be part of the app's first load. The active theme SHALL be applied from the device's remembered resolution; the catalogue SHALL be loaded when Settings › Appearance opens, or when the active built-in's remembered resolution is missing or out of date.

#### Scenario: First load unchanged
- **WHEN** the app is built with the catalogue
- **THEN** the bundle budget check shows the same first-load size as without it, and the catalogue is a separate chunk

#### Scenario: Stale resolution
- **WHEN** a new version changes a built-in's derivation and a user with that theme opens the app
- **THEN** the first frame uses the remembered colours, then the app loads the catalogue chunk, applies the new resolution and remembers it, without a reload
