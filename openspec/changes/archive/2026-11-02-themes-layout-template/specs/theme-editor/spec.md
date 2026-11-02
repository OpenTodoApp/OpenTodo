## MODIFIED Requirements

### Requirement: Edit the seeds
The editor SHALL show the canvas, surface, text and accent seeds and the optional success, warning, danger and info hues, each as one compact row with a swatch that opens a colour field offering swatches, a hex field and lightness, chroma and hue sliders operable by keyboard and announced in words, the colour's name, whether it is derived or set, a hex field on the row itself that applies on Enter or when focus leaves it, and Reset for an optional hue that is set. A colour outside the displayable range SHALL be clamped and the field SHALL say so; a hex value that is not a colour SHALL be refused on its row with the reason, changing nothing. A colour in a pair below AA SHALL say how many pairs on its row. Changing a seed SHALL update every derived token and the preview at once; tokens the user set SHALL stay as set. When the editor is wide enough the rows SHALL be laid out two by two, and the editor SHALL lay out by the space it has: the controls beside a preview that stays in view while they scroll, or, when narrower, the preview above the controls behind a toggle.

#### Scenario: Change the accent seed
- **WHEN** the user moves the accent's hue slider with the arrow keys
- **THEN** the accent, its hover, soft, focus and chart steps and the preview's buttons and selection follow at once, and an explicitly set link colour stays as set

#### Scenario: Type a hex value on the row
- **WHEN** the user types `#1d4ed8` in the Accent row's hex field and presses Enter
- **THEN** the accent seed is `#1d4ed8` and the preview follows; typing `blue` instead says "Enter a colour as #rrggbb or #rgb." on the row and changes nothing

#### Scenario: A warning beside the colour
- **WHEN** the theme sets Text so that it fails on Canvas and Surface
- **THEN** the Text row says "2 pairs below AA" and the Contrast panel lists both pairs with Fix

#### Scenario: Wide and narrow
- **WHEN** the editor is 59 rem wide, and later 43 rem wide
- **THEN** first the colour rows are two by two beside a sticky preview, then the preview is above the controls with a Preview toggle and task titles in it stay readable

### Requirement: Import and export theme files
The user SHALL be able to export any theme as a `.opentodo-theme.json` file in the current format, made on the device. The user SHALL be able to import such a file of at most 64 KB by choosing or dropping it; the file MAY carry `//` and `/* */` comments and trailing commas. The device SHALL read, migrate and validate it, open a valid theme as an unsaved draft with a new id (renaming it when its name is taken) and without a `$schema`, and show what is wrong with an invalid one and on which line, writing nothing. No file SHALL be uploaded; only a saved theme is synced.

#### Scenario: Round trip
- **WHEN** the user exports a custom theme and imports the file into another account
- **THEN** the theme opens as a draft that looks the same, and saving it adds it to that account

#### Scenario: Invalid file
- **WHEN** the user imports a file whose canvas is `blue`
- **THEN** the editor says that the canvas is not a colour and nothing is saved or synced

## ADDED Requirements

### Requirement: Theme template
Settings › Appearance SHALL offer **Download a template** beside New theme and Import, also when the user has no theme of their own and at the limit of 20; the editor's menu SHALL offer **Download as a template** for the theme being edited, and Server › Branding SHALL offer it beside Add from file. A template SHALL be a theme file made on the device, from the theme in use on the side shown (OpenTodo's theme when that cannot be read), the edited draft, or for Branding a new theme from OpenTodo Light. It SHALL be in the accepted format with notes as comments in the user's language: a header saying how to fill it in and import it and where the format is documented, `$schema`, the format version, every key with a note, the seeds, and every token of the format, the ones the theme does not set written as commented lines holding the colour they have now. Removing the comment marker from any one line SHALL keep the file valid. Importing a template unchanged SHALL open a draft that looks like the theme it was made from. The app and the server SHALL accept OpenTodo Light's and Dark's templates, as written and with every commented line set. Settings SHALL link to the format's documentation from Your themes.

#### Scenario: Download and import
- **WHEN** a user with OpenTodo Light chooses Download a template, changes the accent to `#7c3aed` and removes the `//` before `"muted"`, then imports the file
- **THEN** a draft opens named "OpenTodo Light (custom)" with the violet accent and Muted text set to the value the file held, and nothing is saved before Save

#### Scenario: No themes yet
- **WHEN** a user without themes of their own opens Settings › Appearance
- **THEN** Your themes says how to start, and New theme, Import and Download a template are on one row that does not touch the next setting

#### Scenario: Nothing leaves the device
- **WHEN** the user downloads a template
- **THEN** it is made on the device, no request is made, and the `$schema` address is not fetched
