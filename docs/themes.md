---
title: Themes
summary: How a theme sets the colours, corners and type of the app, making your own in the editor, theme files and VS Code import, the file format, derivation, and why there is no custom CSS.
audience: user
section: Reference
specs: [themes, theme-editor, appearance-preferences, design-system, instance-branding]
screens: [themes-files#theme-files]
order: 24
---
# Themes

A theme sets the colours of the whole interface, the way a theme does in a code editor, and optionally its corner radii and typeface. You choose one theme for when the app is light and one for when it is dark, in **Settings → Appearance → Theme and density**, under **Theme**. With the mode **System** both lists show, **Light** and **Dark**, and the app switches between your two themes when your device switches between light and dark. The choice follows your account to every device, also offline, and applies at once.

Besides the two OpenTodo themes, **OpenTodo Light** and **OpenTodo Dark** (the defaults), the app ships fourteen themes from well-known editor palettes: the [catalogue](#catalogue). A theme chosen on a newer version shows as **Made with a newer version of OpenTodo** on an older one, which then shows the OpenTodo theme for that side and keeps your choice for when it is updated.

## Catalogue

<picture><source srcset="images/theme-catalogue-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/theme-catalogue-light.webp" alt="The Theme row with a Light and a Dark list of theme cards, each with a strip of its colours and its author; Solarized Light is chosen, About this theme is under the Light list, and the button Also use Solarized Dark at night is below."></picture>

Each list shows the OpenTodo theme first, then the palettes of its kind by name; a palette that is only published dark (Nord, Dracula) is only in the **Dark** list. Each card credits the palette's author. Choosing a theme applies it at once, also offline: the themes are part of the app, and the catalogue loads with Settings, never with the first screen.

| Light | Dark | Palette by |
| --- | --- | --- |
| Catppuccin Latte | Catppuccin Mocha | Catppuccin |
| Gruvbox Light | Gruvbox Dark | Pavel Pertsev |
| One Light | One Dark | GitHub Inc. (Atom's One themes) |
| Rosé Pine Dawn | Rosé Pine | Rosé Pine |
| Solarized Light | Solarized Dark | Ethan Schoonover |
| Tokyo Night Light | Tokyo Night | Enkia |
| | Nord | Sven Greb |
| | Dracula | Dracula Theme |

With the mode **System**, choosing a theme of a light and dark pair while the other side has a theme of another family offers its counterpart: **Also use Solarized Dark at night** (or **Also use … by day**) sets the other side too, and the cross dismisses the offer without changing anything.

A palette is mapped onto OpenTodo's colours by one written mapping ([`MAPPING.md`](https://github.com/OpenTodoApp/OpenTodo/blob/main/web/src/lib/theme/builtin/MAPPING.md)): its background, panel, text and comment colours go to the surfaces and text tones, its accent to the accent, its green, yellow, red and blue to the status colours, and its accent colours to the label colours by nearest hue (a label colour the palette has none for uses OpenTodo's hue at the palette's lightness). The palettes set colours only: the typeface, corners and text size stay OpenTodo's, so switching never moves the layout. Every theme passes the [contrast](#contrast) check: where a published colour is too faint for its place (for example a palette's comment colour used for secondary text), the theme uses the same hue at the nearest lightness that passes and keeps the published value in its file (`notes.adapted`); its details then say **Some colours were adapted for contrast**.

**About this theme**, under a list whose chosen theme is a palette, shows its author, licence, copyright line and project address (as text, nothing is loaded from it) and **Licence**, which opens the full notices served by your own server.

### Credits

Every palette is under the MIT licence; the full notices ship with the app ([`CREDITS.md`](https://github.com/OpenTodoApp/OpenTodo/blob/main/web/src/lib/theme/builtin/CREDITS.md)). The names are used only to credit the palettes: **OpenTodo is not affiliated with these projects.**

| Palette | Project | Copyright |
| --- | --- | --- |
| Solarized | github.com/altercation/solarized | Copyright (c) 2011 Ethan Schoonover |
| Gruvbox | github.com/morhetz/gruvbox (licence file of github.com/gruvbox-community/gruvbox) | Copyright (c) 2018 Pavel Pertsev |
| Catppuccin | github.com/catppuccin/catppuccin | Copyright (c) 2021 Catppuccin |
| Rosé Pine | github.com/rose-pine/rose-pine-theme | Copyright (c) 2023 Rosé Pine |
| Tokyo Night | github.com/enkia/tokyo-night-vscode-theme | Copyright (c) 2018-present Enkia |
| One Light, One Dark | github.com/atom/one-light-syntax, github.com/atom/one-dark-syntax | Copyright (c) 2016 GitHub Inc. |
| Nord | github.com/nordtheme/nord | Copyright (c) 2016-present Sven Greb |
| Dracula | github.com/dracula/dracula-theme | Copyright (c) 2023 Dracula Theme |

Not shipped: GitHub's Primer palette (the names are GitHub's marks), Monokai (no clear open licence; Monokai Pro is a commercial product of the same name) and Material Theme (relicensed, the terms of the name unclear). A palette joins the catalogue only with a licence file, no naming terms that forbid the use, and an entry in the credits.

## Your own themes

You can make up to 20 themes of your own. They are in **Your themes**, below the **Light** and **Dark** lists, and each one also appears in the list of its kind, where you choose it like any other theme. Your themes sync to all your devices, never to anyone else's, and they work offline: a theme you make or change on a plane is there at once and reaches your other devices when you are back online.

- **Customise**, in the menu beside any theme card (the button with three dots), opens the editor on a copy that looks exactly like that theme, named "*Theme* (custom)", with you as the author. Its notes credit the original ("Based on Nord by Sven Greb (MIT)"), and it keeps the original's licence until you change it.
- **New theme** starts from the OpenTodo theme of the side you are looking at, with every colour derived from four base colours.
- **Import** reads a theme file or a VS Code colour theme ([below](#theme-files)), and **Download a template** saves a starter file to fill in with a text editor.
- The menu of one of your themes also offers **Use for light** or **Use for dark**, **Edit**, **Duplicate**, **Export** and **Delete**. Deleting a theme that a side uses puts that side back on its OpenTodo theme in the same change, and **Undo** in the notice brings both back.

At 20 themes, **New theme**, **Customise**, **Duplicate** and **Import** are unavailable (**Download a template** still works) and say *You have 20 themes; delete one to add another.* Themes made on two devices while both were offline are all kept, even past 20.

A theme of yours whose colours fail some [contrast](#contrast) pairs can still be saved and used. Its card then reads **Low contrast · 2** (the number of pairs). High contrast on the [display](display-mode.md) still replaces its colours.

### The editor

The editor is a page of its own: **Settings → Appearance → Theme and density → Your themes →** a theme. The header holds the theme's name, **Undo**, **Redo**, **Save**, and a menu with **Export**, **Download as a template**, **Duplicate**, **Create the dark counterpart** (or light) and **Delete**. When the editor has room (about 830 pixels), the controls are on the left and the preview stays in view on the right while you scroll; the colours then sit two to a line. With less room (a phone, a tablet, a window with the sidebar open) the preview is a strip above the controls that you can fold away with **Preview**.

- **Contrast** lists every pair of colours below AA, with both colours' names, the measured and required ratio and a sample. **Fix** on a pair keeps the colour's hue and moves only its lightness, to the nearest value at which every pair that colour is in passes. When no lightness can (a grey surface halfway between dark and light text), it moves the other colour of the pair instead and says so. **Fix all** fixes every pair as one change. A screen reader hears the number of failing pairs when it changes, and the result of each fix ("Muted text now 4.6 to 1 on Canvas").
- **Base colours** are the canvas, surface, text and accent, and **Status colours** four optional ones (success, warning, danger, info) that are **Derived** until you set them. Each is one line: its swatch, its name with **Derived** or **Set**, and its hex value, which you can type over (<kbd>Enter</kbd> or leaving the field applies it; a value that is not a colour says so and changes nothing). A colour in a pair below AA says how many under its name, for example *2 pairs below AA*. A set status colour has **Reset**. The swatch opens a colour picker with swatches, a hex field, and sliders for lightness, chroma and hue. The sliders work with the arrow keys (one step), Page Up and Page Down (ten steps), and Home and End, and they are read out in words. A colour a screen cannot show keeps its lightness and hue with less chroma, and the picker says *Adjusted to a displayable colour*. Changing a base colour changes every derived colour at once. Colours you set stay as you set them.
- **Shape and type**: the corners as **Square**, **Default**, **Round** or **Custom** (five values from 0 to 20 px), and the font (**OpenTodo Inter**, **System**, **Serif**, **Monospace**, or **Installed font** with its name). An installed font is used only on devices that have it, others show the system font, and it is never downloaded. Last comes the list text size (13, 14 or 15 px).
- **Advanced** is folded, with how many colours are set and how many have warnings beside it; it opens by itself while a colour has a warning. It lists every colour of the theme in its group (surfaces, text, lines, accent, status, priorities, labels, other). Each one shows whether it is **Derived** or **Set**, its value, its worst pair ("4.2:1 on Canvas"), **Undo** for its last change and **Reset**, which makes it derived again. Each group counts its set colours and its warnings. The filter finds colours by their name in your language, their English name or their id (`muted`).
- **About this theme**: its kind (**Light** or **Dark**), the author, the licence and notes.

The **preview** shows a task list, a board, the week calendar and a task panel, built from sample tasks (never your own). It follows every change at once and does not change the rest of the app. It cannot take focus; the Contrast list and the Advanced rows describe the same colours to a screen reader. **Create the dark counterpart** (or light) starts a new theme of the other kind with the same accent and status colours, and with the canvas, surface and text mirrored at their hues.

Every change is kept as a draft on this device until you **Save**, so a reload or a crash loses nothing, and nothing syncs before you save. **Undo** and **Redo** cover the whole session (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> and <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>S</kbd> saves), and they work only inside the editor. Leaving with unsaved changes asks whether to **Save**, **Discard** or **Keep editing**. If the theme changed on another device while you had a draft, the editor offers **Keep my draft** or **Load the saved version**. When two devices save the same theme, the later save wins as a whole, so colours are never mixed half from each.

### Theme files

**Export** (in a theme's menu or the editor's) saves the theme as `name.opentodo-theme.json`, made on your device. **Import a theme file**, or dropping a file onto **Your themes**, reads a file of up to 64 KB on your device. A valid theme opens in the editor as an unsaved draft, renamed "Name (2)" when you already have one by that name, and saving it adds it to your themes. An invalid file says what is wrong and where, for example *Line 12: canvas is not a colour.*, and nothing is saved or synced. Only a saved theme ever leaves your device, as part of your synced data. A theme file may hold notes (lines and line ends after `//`, and `/* … */`) and trailing commas.

**Download a template** (under **Your themes**) saves a starter file, `name-template.opentodo-theme.jsonc`, made on your device from the theme you are using (or, in the editor's menu, from the theme you are editing). It holds every key of the format with a short note in your language, the base and status colours, and every colour of the [token list](#tokens). The colours the theme does not set are lines that start with `//` and show the colour they have now: remove the `//` to set one yourself, change any value, then **Import → Theme file**. The file starts with `$schema`, the address of the format's [JSON Schema](themes/opentodo-theme.schema.json), so an editor such as VS Code checks the file and completes keys as you type; OpenTodo never opens that address. Imported unchanged, a template looks exactly like the theme it was made from.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/OpenTodoApp/OpenTodo/main/docs/themes/opentodo-theme.schema.json",
  "opentodoTheme": 1, // The format version. Keep 1.
  "kind": "light", // light or dark: a theme is one side.
  "seeds": {
    "accent": "#047857", // Buttons, links, focus and selection.
    // "danger": "#bd2f2a", // Errors, late tasks and delete.
  },
  "tokens": {
    // "muted": "#5c6169", // Muted text
  },
}
```

### Importing a VS Code colour theme

**Import a VS Code theme** reads a VS Code colour theme file (`.json`, comments and trailing commas allowed, up to 1 MB) on your device. Its kind (`light` or `dark`; `hcLight` and `hcDark` count as light and dark, with a note that OpenTodo's own high-contrast setting may suit you better) and its workbench `colors` are mapped onto the theme as below; the first key the file has wins. Translucent colours are blended over the colour they sit on, and every colour the file does not give is derived. Syntax colours (`tokenColors`, `semanticTokenColors`) are ignored. A file named in `include` is not read: the importer reads one file and never fetches another.

| OpenTodo | VS Code keys, first present wins |
| --- | --- |
| Base colour canvas | `sideBar.background`, `activityBar.background`, `editor.background` |
| Base colour surface | `editor.background` |
| Base colour text | `editor.foreground`, `foreground` |
| Base colour accent | `button.background`, `focusBorder`, `textLink.foreground` |
| Status colours | danger `errorForeground`, `editorError.foreground`; warning `editorWarning.foreground`; info `editorInfo.foreground`; success `gitDecoration.addedResourceForeground`, `terminal.ansiGreen` |
| `on-accent`, `accent-hover`, `accent-text`, `focus` | `button.foreground`, `button.hoverBackground`, `textLink.foreground`, `focusBorder` |
| `muted`, `faint` | `descriptionForeground`; `disabledForeground`, `editorLineNumber.foreground` |
| `raised`, `pop` | `editorWidget.background`, `menu.background`, `quickInput.background` |
| `sunken`, `hover`, `selected`, `selected-row` | `input.background`, `list.hoverBackground`, `list.activeSelectionBackground`, `list.inactiveSelectionBackground` |
| `border`, `border-soft`, `border-input`, `line-strong` | `panel.border`, `sideBar.border`, `editorGroup.border`; `input.border`; `widget.border`, `contrastBorder` |
| `highlight`, `scrim` | `editor.findMatchHighlightBackground`, `widget.shadow` |
| Label colours | the terminal's six ANSI colours (`terminal.ansiRed` … `terminal.ansiMagenta`), each to the nearest free label hue, then the bright ones within 30° |
| Browser bar | `titleBar.activeBackground` |

Before the editor opens, a report shows what was taken from the file (with its VS Code key), what was derived, which pairs fail contrast (**Fix contrast now** is ticked; untick it to keep the colours as published), and which keys were ignored. The licence is set to *unknown*: check the theme's licence before you share the file. The result opens as an unsaved draft.

## Themes from your server

The owner of your server can choose a **default theme** for each side and offer **server themes** to everyone (**Settings → Server → Branding**, see [Branding](self-hosting/branding.md#themes)):

- While you have not chosen a theme for a side, you see the server's default for it. The list then starts with **Default (Server default: *name*)**, and the server's default is marked **Server default**. Your own choice always wins, and choosing **Default** again follows the server's default from then on. Choosing **OpenTodo Light** or **OpenTodo Dark** while the server has a default keeps OpenTodo's theme even when the owner changes the default later.
- Server themes appear in the list of their kind after the built-in ones, marked **From this server**. You can choose one, and its menu offers **Customise** (a copy of your own, as for any theme) and **Export**; only the owner can change or remove it. If the owner removes a theme you chose, that side shows its default again, and your choice comes back if the theme does.
- Your device remembers the server's default and themes, so they work offline and the first frame is already in your theme. It reads them again when they change, at the next start or when the app comes back to the front. A device that has never read them uses OpenTodo's themes until it does.

The sign-in, invitation and password-reset screens, emails, the splash screen and the app's icons always keep OpenTodo's neutral look.

## Themes and the accent

The accent (**Emerald** to **Graphite**, or your [own colour](custom-accent.md)) colours the OpenTodo themes. Another theme brings its own accent: while it is shown, the accent row says **From the theme**, and your accent comes back when you choose an OpenTodo theme again. High contrast (on the [display](display-mode.md)) always wins over a theme's colours; the theme's corners and type stay.

## What a theme is

A theme is a small JSON file (`.opentodo-theme.json`). It names a few **seeds**, and every colour it does not set is derived from them on your device, so a theme of four colours is complete, and stays complete when OpenTodo adds a colour later. The format is published as a JSON Schema, [`docs/themes/opentodo-theme.schema.json`](themes/opentodo-theme.schema.json); the two OpenTodo themes are the reference documents (`web/src/lib/theme/builtin/opentodo-light.json` and `opentodo-dark.json`, generated from the stylesheet), and the catalogue's documents sit next to them (`nord.json`, `solarized-light.json` and the others).

```json
{
  "opentodoTheme": 1,
  "id": "nord",
  "name": "Nord",
  "author": "Sven Greb",
  "licence": "MIT",
  "source": "https://github.com/nordtheme/nord",
  "kind": "dark",
  "seeds": { "canvas": "#2e3440", "surface": "#3b4252", "text": "#eceff4", "accent": "#88c0d0" },
  "tokens": { "muted": "#d8dee9" },
  "bar": "#2e3440",
  "shape": { "radius": { "card": 6 } },
  "type": { "family": "system", "list": 14 }
}
```

### Keys

| Key | Required | Value |
| --- | --- | --- |
| `$schema` | no | The address of the JSON Schema, for editors that check the file; up to 300 characters of text, never opened by OpenTodo. Dropped on import. |
| `opentodoTheme` | yes | The format version, `1`. Adding a token never changes it; a newer format is not applied by an older app. |
| `id` | yes | 1 to 64 characters of `a-z`, `0-9` and `-`. |
| `name` | yes | 1 to 60 characters, shown on the theme's card. |
| `author`, `licence` | yes | Up to 120 characters each; the author is credited on the card. Use an SPDX identifier for the licence where one applies. |
| `source` | no | Where the palette comes from, up to 300 characters. Shown as text, never fetched. |
| `kind` | yes | `light` or `dark`. A theme is one side; a light and dark pair is two files. |
| `seeds` | yes | `canvas`, `surface`, `text` and `accent`, and optionally `success`, `warning`, `danger` and `info`. |
| `tokens` | no | Explicit values for any token of the list below. A name this app does not know is kept and ignored. |
| `bar` | no | The browser and phone bar colour. By default the accent of a light theme and the canvas of a dark one. |
| `notes` | no | `adapted`, the published colour each adjusted token replaced, and `text`, up to 500 characters. |
| `shape.radius` | no | Corner radii in whole pixels, 0 to 20: `chip`, `control`, `card`, `surface`, `popover`. A step left out keeps OpenTodo's proportion to the nearest given step. |
| `type.family` | no | `inter` (the bundled typeface, the default), `system`, `serif`, `mono`, or `{ "local": "Font name" }` for a font installed on the device (letters, digits, spaces and hyphens). Never a font from another host. |
| `type.list` | no | The list text size in pixels: `13` (the default), `14` or `15`. It scales with the browser's font size. |

A colour is `#rrggbb` or `oklch(L C H)` with L from 0 to 1, C from 0 to 0.4 and H from 0 to 360, inside the sRGB gamut. Only `scrim` may be translucent (`#rrggbbaa` or `oklch(L C H / a)`). Nothing else is accepted, so a theme can never carry CSS, a `url()` or a reference to another value. A file is at most 16 KB. The app and the server accept and refuse exactly the same files.

### Tokens

| Group | Tokens |
| --- | --- |
| Surfaces | `canvas`, `surface`, `raised`, `sunken`, `pop`, `hover`, `selected`, `selected-row`, `sidebar` |
| Text | `text-strong`, `text`, `muted`, `faint` |
| Lines | `border`, `border-soft`, `border-input`, `line-strong` |
| Accent | `accent`, `accent-hover`, `on-accent`, `accent-text`, `accent-soft`, `accent-soft-text`, `focus` |
| Status | `success`, `success-soft`, `success-soft-text`, `warning`, `warning-soft`, `warning-soft-text`, `danger`, `danger-soft`, `danger-soft-text`, `info`, `info-soft`, `info-soft-text` |
| Priorities | `p1`, `p1-soft`, `p2`, `p2-soft`, `p3`, `p3-soft`, `p4`, `p4-soft` |
| Labels | `hue-red`, `hue-orange`, `hue-yellow`, `hue-lime`, `hue-green`, `hue-teal`, `hue-cyan`, `hue-blue`, `hue-indigo`, `hue-violet`, `hue-pink`, `hue-slate` (the solid step; the soft and text steps of each label colour are always derived) |
| Other | `scrim`, `highlight`, `highlight-text`, `chart-base`, `chart-seq-1`, `chart-seq-2`, `chart-seq-3`, `chart-seq-4`, `chart-seq-5` |

Projects, labels and views keep their stored colour and draw it through the theme's label colours: a green project uses the theme's `hue-green`.

## How missing colours are derived

Every token a theme does not set starts from OpenTodo's own value for the theme's kind, carried onto the theme's seeds: it keeps its lightness distance from the seed it belongs to (`raised` from `surface`, `muted` from `text`, a status colour's soft step from `surface`), a near-grey seed keeps OpenTodo's cool slate tint, and a coloured seed gives its own hue. The accent's hover, soft and focus steps, the label colours' soft and text steps and the chart ramp mix as the stylesheet mixes them. Then each colour moves only its lightness, keeping its hue, to the nearest value at which every contrast pair it takes part in passes. A colour that already passes does not move, so OpenTodo's own seeds give exactly OpenTodo's colours. Text on the accent is white or the theme's darkest colour, whichever needs the smaller change, and an accent close to the red of errors turns away from it as a [custom accent](custom-accent.md#away-from-the-red-of-errors) does.

A value written in `tokens` is never moved, even when it fails a pair: the theme's author decides. The derivation is deterministic, so every device shows the same colours for the same file and app version.

## Contrast

Every theme in the repository passes the same contrast rules as the stylesheet ([design system](design-system.md#tokens)): 4.5:1 for text on every surface it may appear on, 3:1 for borders, focus rings and marks, in its own kind. The check in `make check` derives each theme as a device does and names the theme, the pair and both ratios when one fails, and it derives 200 themes from a fixed sweep of seeds (light and dark canvases around the hue circle, pale and saturated accents) that must all pass: the derivation's guarantee.

## Privacy and storage

Your theme choices are preferences, not content: they are not end-to-end encrypted, also when your account is. Your own themes are not encrypted either, as they are colours and short labels: on an encrypted account the editor says *Themes are not encrypted. Don't put private information in a theme's name or notes.* Choices and themes are part of the JSON export and come back with an import, keeping their ids so your choices still apply. A theme never contacts another server: there are no web fonts, images or links in a theme, and its source is only text. Each device remembers the resolved colours of your two themes so the first frame is already in your theme; that memory never syncs. Working out a theme's colours from its base colours can take a moment for some colours, so the app does it in the background and shows the remembered colours meanwhile.

## No custom CSS

Free-form custom CSS is not offered, for three reasons. CSS can load from anywhere (backgrounds, fonts, cursors), so a synced snippet would make every device contact a server nobody configured. CSS targets the app's structure, which changes in every release, so a snippet that worked yesterday can make the app unusable on every synced device at once. And CSS can hide controls or make text the colour of its background, defeating the contrast and accessibility checks. Themes cover colours, corners, the typeface and the text size, with contrast checks and a way back. The question is open again when several people ask for something tokens cannot express, in a form that stays on one device and cannot load anything.
