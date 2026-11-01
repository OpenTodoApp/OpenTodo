## Purpose

Lets people make their own themes safely in Settings: start from any theme, change its base colours or any single token, shape and type, see real screens change live, get told at once when a colour pair stops being readable and fix it in one click, undo anything, and move themes in and out as files, including from a VS Code colour theme.

## ADDED Requirements

### Requirement: Start a theme from any theme
Every theme card in Settings › Appearance SHALL offer to customise the theme (or, for a custom theme, to edit it) and to duplicate and export it; a custom theme SHALL also offer deletion. Customising SHALL open the editor on a copy that looks identical, named after the original, with the user as author, crediting the original's name, author and licence, and keeping the original's licence until the user changes it. A new theme SHALL start from the OpenTodo theme of the current side. The editor SHALL be a Settings page reachable and operable by keyboard alone.

#### Scenario: Customise Nord
- **WHEN** the user chooses Customise on the Nord card
- **THEN** the editor opens on "Nord (custom)" that looks exactly like Nord, by the user, noting "Based on Nord by Sven Greb (MIT)", and nothing is saved yet

### Requirement: Edit the seeds
The editor SHALL show the canvas, surface, text and accent seeds and the optional success, warning, danger and info hues, each with a colour field that offers swatches, a hex field and lightness, chroma and hue sliders operable by keyboard and announced in words. A colour outside the displayable range SHALL be clamped and the field SHALL say so. Changing a seed SHALL update every derived token and the preview at once; tokens the user set SHALL stay as set.

#### Scenario: Change the accent seed
- **WHEN** the user moves the accent's hue slider with the arrow keys
- **THEN** the accent, its hover, soft, focus and chart steps and the preview's buttons and selection follow at once, and an explicitly set link colour stays as set

### Requirement: Advanced list of every token
The editor SHALL list every semantic token of the theme format in named groups (surfaces, text, lines, accent, status, priorities, labels, other), each token with its name in the user's language and its id, its value, whether it is derived or set, and its worst contrast pair with the ratio. The user SHALL be able to set any token's value, which makes it set, and to filter the list by name or id. A group SHALL show how many of its tokens are set and how many have warnings.

#### Scenario: Set a single token
- **WHEN** the user filters for "muted", opens Muted text and types `#6b7280`
- **THEN** the token is marked Set, its worst pair and ratio update, and the preview's secondary text changes at once

### Requirement: Undo and reset
The editor SHALL keep a history of every change in the session, with undo and redo by buttons and by Ctrl or Cmd with Z and Shift and Z. Each token SHALL offer undo of its own last change and reset, which removes the set value so the token is derived again. Changes SHALL be kept as a draft on the device, surviving a reload, and SHALL be written only when the user saves; leaving with unsaved changes SHALL ask whether to save, discard or keep editing. When the saved theme changed on another device while a draft exists, the editor SHALL offer to keep the draft or load the saved version.

#### Scenario: Reset a token
- **WHEN** the user has set Faint text and chooses Reset on its row
- **THEN** Faint text is derived again from the seeds, marked Derived, and Undo brings the set value back

#### Scenario: Reload during editing
- **WHEN** the user changes three tokens and the tab reloads before saving
- **THEN** the editor reopens with the three changes as an unsaved draft, and no op was written

### Requirement: Live contrast warnings and Fix to AA
After every change the editor SHALL measure every contrast pair of the gate on the draft and list the pairs below AA with both token names, the measured and the required ratio and a sample, announcing the number of failing pairs to assistive technology when it changes. Each failing pair SHALL offer Fix and the list SHALL offer Fix all; a fix SHALL keep the colour's hue and move only its lightness to the nearest value that passes every pair the colour is in, moving the other colour of the pair only when no lightness of the first can pass, and saying so. A fix SHALL be one undoable change. Saving a theme with failing pairs SHALL be allowed and SHALL say how many pairs fail.

#### Scenario: Fix one pair
- **WHEN** the user sets Muted text so it reaches 3.9:1 on Canvas and chooses Fix on that pair
- **THEN** Muted text keeps its hue, reaches at least 4.5:1 on every surface it is used on, the warning disappears, and "Muted text now 4.6 to 1 on Canvas" is announced

#### Scenario: Save with warnings
- **WHEN** the user saves a theme with two failing pairs
- **THEN** the theme is saved, the confirmation says it was saved with 2 contrast warnings, and its card is marked low contrast

### Requirement: Live preview of real screens
The editor SHALL preview the draft on a task list, a board, the week calendar and the task panel, built from fixed sample data and never from the user's own data, switching between them with tabs. The preview SHALL follow every change at once and SHALL NOT change the theme of the rest of the app. It SHALL not take keyboard focus and SHALL carry a text description; the contrast list and token rows SHALL be its accessible equivalent. The editor SHALL offer to create the theme's counterpart of the other kind, which keeps the accent and status seeds and mirrors the surfaces and text.

#### Scenario: Preview the board
- **WHEN** the user switches the preview to Board and changes the surface seed
- **THEN** the board's columns and cards take the new surface at once while Settings around the editor keeps the active theme

#### Scenario: Make the dark counterpart
- **WHEN** the user editing a light theme chooses Create the dark counterpart
- **THEN** a new dark draft opens with the same accent and status colours and dark surfaces of the same hues, passing every pair

### Requirement: Shape and type in the editor
The editor SHALL let the user choose the corner radius as a preset (Square, Default, Round) or as five values from 0 to 20 px, the font as OpenTodo's bundled typeface, the system, serif or monospace font, or an installed font by name, and the list text size of 13, 14 or 15 px, all shown live in the preview. It SHALL say that an installed font is used only on devices that have it and is never downloaded.

#### Scenario: An installed font
- **WHEN** the user chooses Installed font and types "Atkinson Hyperlegible"
- **THEN** the preview uses that font where it is installed and the system font where it is not, and no font request leaves the device

### Requirement: Import and export theme files
The user SHALL be able to export any theme as a `.opentodo-theme.json` file in the current format, made on the device. The user SHALL be able to import such a file of at most 64 KB by choosing or dropping it; the device SHALL read, migrate and validate it, open a valid theme as an unsaved draft with a new id (renaming it when its name is taken), and show what is wrong with an invalid one, writing nothing. No file SHALL be uploaded; only a saved theme is synced.

#### Scenario: Round trip
- **WHEN** the user exports a custom theme and imports the file into another account
- **THEN** the theme opens as a draft that looks the same, and saving it adds it to that account

#### Scenario: Invalid file
- **WHEN** the user imports a file whose canvas is `blue`
- **THEN** the editor says that the canvas is not a colour and nothing is saved or synced

### Requirement: Import a VS Code colour theme
The user SHALL be able to import a VS Code colour theme file of at most 1 MB, with comments and trailing commas allowed. The device SHALL map its kind and its workbench colours (among them the editor, side bar, list, focus border, button, input, panel border, error, warning and info colours, and the terminal's ANSI colours to the label palette) to the theme's tokens, compositing translucent colours over the colour they sit on, derive every token it cannot map, ignore syntax colours, never follow a reference to another file or address, and set the licence to unknown. Before the editor opens, a report SHALL list the mapped tokens with their source keys, the derived tokens, the values that fail contrast (with Fix contrast now preselected) and the ignored keys, and SHALL advise checking the theme's licence before sharing it. The result SHALL open as an unsaved draft.

#### Scenario: Import a dark VS Code theme
- **WHEN** the user imports a VS Code theme with `type: dark`, `editor.background`, `sideBar.background`, `button.background` and the terminal ANSI colours
- **THEN** the report shows the canvas from the side bar, the surface from the editor background, the accent from the button and six label hues from the ANSI colours, the rest as derived, and the draft opens as a dark theme

#### Scenario: Include is not followed
- **WHEN** the imported file has `"include": "./base.json"`
- **THEN** the report says the included file was not read, and no request is made

#### Scenario: Not a colour theme
- **WHEN** the user imports a VS Code settings file without `colors`
- **THEN** the importer says the file is not a colour theme and nothing is created

### Requirement: The editor is accessible and translated
Every control of the editor, the preview tabs, the contrast list, the import report and the theme cards' menus SHALL be design-system primitives with stories in light and dark, operable by keyboard alone, with names announced to assistive technology, and available in the app's six languages. The editor's keyboard shortcuts SHALL be registered in the shortcut registry without a conflict and SHALL apply only inside the editor.

#### Scenario: Keyboard only
- **WHEN** a keyboard user customises a theme, changes the accent seed with the sliders, fixes a warning and saves
- **THEN** every step is reachable with Tab, the arrow keys, Enter and Space, and each result is announced

#### Scenario: Another language
- **WHEN** the app language is Italian
- **THEN** token names, groups, warnings, fixes and the import report are in Italian while token ids and theme names stay as written
