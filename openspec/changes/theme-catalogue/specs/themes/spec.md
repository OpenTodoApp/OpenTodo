## ADDED Requirements

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
