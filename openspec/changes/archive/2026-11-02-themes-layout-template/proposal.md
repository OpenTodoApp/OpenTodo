# Theme settings that use the space, and a theme template

## Why

The owner tried themes and liked them, with three problems (feedback of 2026-11-02):

- the theme editor wastes space: a 24 rem column of full-width rows beside a preview that leaves most of a wide screen empty, labels missing above the segmented controls, and at 1024 px a preview squeezed until task titles show one letter;
- Settings › Appearance crowds: the actions under Your themes touch the next row's divider and wrap unevenly on a phone; the server themes list in Branding touches its divider the same way;
- Import a theme file is useful only if you know what a theme file looks like. There is no starting point other than reading the format docs.

## What Changes

- **Your themes** is a row of the Appearance section with the row spacing of the others, a sentence with Learn more on theme files, an empty state, and one row of actions that wraps cleanly: **New theme**, **Import** (Theme file, VS Code theme) and **Download a template**. A custom theme's swatches show its derived label colours.
- **Download a template** saves a starter file made on the device from the theme in use (or OpenTodo Light or Dark): JSON with notes (`//` comments) in the user's language, `$schema` pointing at the published JSON Schema, the format version, every key, the seeds, and every token of the format, the ones the theme does not set as commented lines with their current derived colour. Removing `//` sets a colour. The editor's menu offers **Download as a template** for the theme being edited, and Branding offers it for server themes.
- Theme files may carry `//` and `/* */` comments and trailing commas (the importer already reads VS Code files that way), and a top-level `$schema` text, which both validators accept and the importer drops.
- **The editor** lays out by the space it has, not the window: from 52 rem the controls sit beside a sticky preview; the base and status colours are compact rows (swatch, name, Derived or Set, a hex field, Reset) two by two when two 12.5 rem rows fit; a colour in a pair below AA says so on its row as well as in the Contrast panel; Corners, List text size, Font and Kind have visible labels and share rows; Advanced is folded with its counts until opened (open while a token has a warning); Author and Licence sit side by side. Narrower, the preview is a strip above the controls that folds away.
- The layout check (`scripts/e2e-layout.mjs`) fails when controls overlap or touch a row divider on Settings › Appearance and Server › Branding.

Not **BREAKING**: no op field, route or environment variable changes. A file with `$schema` or comments is refused by an older app's importer, which is the template only; Export still writes plain JSON.

Out of scope: a template in another format (YAML, CSS), editing a theme file in the app as text, translating the keys of the format, and serving the JSON Schema from the server or the website.

ROADMAP: polish of the shipped `theme-editor` and `theme-instance-default` items (owner feedback), no new roadmap row.
