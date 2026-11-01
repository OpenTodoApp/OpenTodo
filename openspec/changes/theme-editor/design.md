# Design: theme-editor

## Context

`theme-engine` gives a theme document format (seeds, explicit tokens grouped as surfaces, text, lines, accent, status, priorities, labels, other; bar; shape; type; notes), `validateTheme` and `migrate` (TypeScript) and `internal/themes.Validate` (Go), `deriveTheme`, `checkTheme` (failing pairs for a resolved theme), `applyTheme` with a subtree scope for previews, and the selection fields `theme_light` and `theme_dark` with the reserved prefix `user:`. `theme-catalogue` ships the built-ins with the fix-to-AA search used to adapt palettes. `accent-colour` built a colour picker primitive (swatches, hex field). The workbench has fixture data and stories of the core screens (`design-system` "Core screens in the workbench"). Personal entities with server-unique ids (`rule`, `frame`, `slot`) resolve to the author's personal scope (`internal/sync/scope.go`).

## Goals / Non-Goals

**Goals:** custom themes that sync, can be made from any theme in minutes, stay readable by default and tell the user exactly where and why they are not, can be undone at every step, travel as files, and can start from a VS Code theme.

**Non-Goals:** CSS, sharing through the server, other editors' formats, the user's data in the preview.

## Decisions

### D1. The `theme` entity

```go
// theme: a custom theme (OpenSpec change theme-editor, design D1). Personal like a
// rule, with ids unique on the server. doc is one whole theme document (format of
// theme-engine D1, validated by internal/themes, at most MaxThemeBytes); themes are
// appearance, not user content, so no field is a content field and an encrypted
// account stores them in plain text (docs/themes.md says so).
"theme": {
    "doc":        {Kind: kThemeDoc, Default: `null`},
    "position":   {Kind: kNumber, Default: `0`},
    "created_at": {Kind: kNumber, Default: `0`},
    "deleted_at": {Kind: kNullableNumber, Default: `null`},
},
```

- `kThemeDoc` is null or a JSON object that passes `internal/themes.Validate` and is at most `MaxThemeBytes = 16 * 1024` bytes; an op with anything else is invalid, like every kind check.
- The document is **one whole value**: editing a theme on two devices offline ends with the later save, as for a rule's trigger. A theme is edited by one person in one place at a time; field-level merging of colours would produce combinations nobody chose and might fail contrast.
- The entity id is the theme's id inside the app (`user:<entity id>`); the document's own `id` key is set to the entity id on save.
- Deleting writes `deleted_at`. If the theme is chosen for a side, the same `mutateMany` batch writes that side back to `""`; another device that chose it concurrently reads the tombstoned theme as unavailable and falls back (theme-engine D6). Undo in the toast restores both.
- In the JSON export and import like rules; ids are re-minted on import into another account, and choices pointing at them are rewritten (the existing importer's id map).

- *Alternative: a `user_prefs` field holding a list of themes.* Rejected: one value of up to 320 KB would be rewritten on every save, and two devices saving different themes would lose one.
- *Alternative: field-level tokens (one field per token).* Rejected: the token list grows; fields are declared once in the schema and never removed, and a document already has a format and a validator.

### D2. Limits

At most 20 live custom themes per user, each at most 16 KB. The size is enforced by the value kind on the server and by the validator on the device. The count is enforced on the device: New, Customise, Duplicate and Import are disabled at 20 with "You have 20 themes; delete one to add another". Two devices creating themes offline can pass 20; all are kept and synced, and the device refuses new ones until the count is below 20 again. The server does not refuse the 21st, so sync never rejects an op that a device already applied (the same choice as `rule`, whose count is checked on its REST route only, and themes have no REST route).

### D3. Where the editor lives

Settings › Appearance gains a **Themes** row: "Your themes" (cards for custom themes, with New theme and Import) below the Light and Dark lists. Each card (built-in or custom) has a menu: Use for light / Use for dark (by kind), Customise (built-ins and others' copies) or Edit (custom), Duplicate, Export, Delete (custom). The editor opens as a Settings sub-page at `/settings/appearance/themes/<id>` (a draft id for a new theme), reachable by keyboard from the card, with Back to Appearance.

Layout from 64 rem: a header row (theme name field, kind, Undo, Redo, Save, a menu with Export, Duplicate, Create the dark or light counterpart, Delete), then two columns: controls (about 24 rem, scrolls) and preview (scrolls). Below 64 rem: the preview is a collapsible strip above the controls. **Interface budget:** 2 rows of chrome (the header row and the preview's screen tabs), 2 vertical scroll regions, no list task properties change, no new sidebar destination, the shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+S inside the editor) registered in the shortcut registry, scoped to the editor, with no conflict (the registry's conflict test).

### D4. Starting from a theme

Customise copies the source document with a new id, the name "<name> (custom)", the user's display name as `author`, and `notes.text` "Based on <name> by <author> (<licence>)"; the licence of the copy defaults to the source's licence (a modified MIT palette stays MIT with its notice in `notes.text`) and is editable. Explicit tokens and seeds are copied, so the copy looks identical. New theme starts from the OpenTodo theme of the current side.

### D5. Seeds

Four seed rows (Canvas, Surface, Text, Accent) and an "Status colours" group with four optional rows (Success, Warning, Danger, Info: "Derived" until set). Each row is a **colour field**, a new primitive: a swatch button that opens a popover with the `accent-colour` swatches, a hex field, and three OKLCH sliders (Lightness 0–100 %, Chroma 0–0.37, Hue 0–360°) with keyboard steps (arrow 1, Page 10, Home and End), `aria-valuetext` in words ("Lightness 62 percent"), and an in-gamut clamp shown as "Adjusted to a displayable colour". Changing a seed re-derives every derived token live; explicit tokens stay.

### D6. Advanced: every token

A grouped, filterable list of the closed token list (theme-engine D1), each group collapsible with a count of set tokens and of warnings. A **token row** (new primitive): swatch, human name and token id (`Muted text · muted`), the value, a badge "Derived" or "Set", the worst pair ("4.2:1 on Canvas"), and actions **Undo** (the token's previous value in this session) and **Reset** (remove the explicit value so it is derived again). Editing a derived token's value makes it Set. The filter matches names and ids in the user's language and in English. Token names are translated; ids are not.

### D7. Undo, redo and drafts

The editor keeps a session history of every change (seed, token, shape, type, name, kind, a fix), Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z with buttons in the header, and the per-token Undo of D6 which reverts that token's last change as a new history entry. The working copy is a **draft on the device** (`deviceStorage`, `ot.themeDraft.<id>`), written on every change, so a reload or a crash loses nothing; nothing is written to the op log until **Save**, which writes one op (create or update `doc`). Leaving with unsaved changes asks: Save, Discard, Keep editing. A draft of a theme that changed on another device meanwhile is offered as "This theme changed on another device: keep your draft or load the saved version". Drafts are per device and never synced.

- *Alternative: save on every change.* Rejected: dragging a slider would write hundreds of ops of up to 16 KB each.

### D8. Live contrast and Fix to AA

After every change (coalesced to one per animation frame), `checkTheme` measures the resolved draft. Failing pairs are shown in a **Contrast** panel at the top of the controls ("3 pairs below AA"), each with the two token names, the measured and required ratio, a sample of the pair and **Fix**; **Fix all** applies every fix as one history entry. A token row shows its worst pair. A polite live region announces the count when it changes, not every frame.

**Fix to AA** keeps the hue and moves lightness: it moves the pair's explicit token (the foreground if both are explicit; derived tokens pass by construction, theme-engine D3); when that token is in several pairs, the search finds the nearest lightness that satisfies all of them at once; if none exists at that hue (a mid-grey surface between dark and light text), it moves the background instead and says so. The result is written as an explicit value, so it can be undone.

**Saving with warnings** is allowed: Save says "Saved with 3 contrast warnings". The card shows a "Low contrast" badge with the count; choosing it applies it as written. High contrast still replaces it (theme-engine D4).

### D9. Live preview

The preview renders the real components of four screens from the workbench's fixture data (a project list with sections and labelled tasks, a board with three columns, the week calendar with blocks and an all-day row, the task panel with notes, subtasks and comments), in a subtree to which `applyTheme` applies the draft with a scoping attribute, so the rest of Settings keeps the active theme. Tabs: List, Board, Calendar, Task. The preview is `inert` (no focus, no writes) with an accessible description ("Preview of the theme on a task list"); screen-reader users get the Contrast panel and token rows as the accessible equivalent. The preview never reads the user's data: deterministic, quick, and the same for everyone who reports a problem. **Counterpart:** "Create the dark counterpart" (or light) makes a new draft of the other kind with the same accent and status seeds, the canvas, surface and text seeds mirrored in lightness at their hues, and no explicit tokens, opened next.

### D10. Shape and type

**Shape:** presets Square (2, 2, 3, 4, 4 px), Default (today's 6, 7, 8, 10, 12) and Round (8, 10, 12, 16, 20), or Custom with five number fields (0–20). **Type:** Font: OpenTodo Inter (bundled), System, Serif, Monospace, or Installed font with a name field and a sample line in that font; a note says the font is used only when it is installed on each device and is never downloaded. Text size: 13, 14 or 15 px for lists. The preview shows both live.

### D11. Export and import of theme files

- **Export** builds the document (validated, current format) and downloads `<slug>.opentodo-theme.json` through a blob link; no server round trip.
- **Import** accepts a file of at most 64 KB through a file picker or drop, reads it on the device, parses JSON, migrates, validates; a valid document becomes a draft with a new id, its name suffixed " (2)" when the name is taken, opened in the editor for review; Save writes it. An invalid file shows what is wrong ("Line 12: `canvas` is not a colour"). Nothing is uploaded except the saved op.

### D12. Importing a VS Code colour theme

A lazy importer (`web/src/lib/theme/vscode.ts`) reads a VS Code colour theme file of at most 1 MB with a small JSONC reader (comments and trailing commas, as VS Code allows; no dependency). It uses `type` (`light`, `dark`; `hcLight` and `hcDark` map to light and dark with a note that OpenTodo's high-contrast setting is the better choice) and `colors`; `tokenColors` and `semanticTokenColors` are ignored (no code editor), and `include` is reported and not followed (the importer reads one file and never fetches). Colours with alpha are composited over the colour they sit on in VS Code before mapping.

| OpenTodo token | VS Code keys, first present wins |
| --- | --- |
| seed `canvas` | `sideBar.background`, `activityBar.background`, `editor.background` |
| seed `surface` | `editor.background` |
| seed `text` | `editor.foreground`, `foreground` |
| seed `accent` | `button.background`, `focusBorder`, `textLink.foreground` |
| `on-accent`, `accent-hover` | `button.foreground`, `button.hoverBackground` |
| `accent-text` | `textLink.foreground` |
| `focus` | `focusBorder` |
| `muted`, `faint` | `descriptionForeground`, `disabledForeground` (or `editorLineNumber.foreground`) |
| `raised`, `pop` | `editorWidget.background`, `menu.background`, `quickInput.background` |
| `sunken` | `input.background` |
| `hover` | `list.hoverBackground` |
| `selected` | `list.activeSelectionBackground` |
| `selected-row` | `list.inactiveSelectionBackground` |
| `border`, `border-soft` | `panel.border`, `sideBar.border`, `editorGroup.border` |
| `border-input` | `input.border` |
| `line-strong` | `widget.border`, `contrastBorder` |
| `danger`, `warning`, `info` | `errorForeground` / `editorError.foreground`, `editorWarning.foreground`, `editorInfo.foreground` |
| `success` | `gitDecoration.addedResourceForeground`, `terminal.ansiGreen` |
| `highlight` | `editor.findMatchHighlightBackground` |
| `scrim` | `widget.shadow` |
| label hues | `terminal.ansiRed`, `ansiYellow`, `ansiGreen`, `ansiCyan`, `ansiBlue`, `ansiMagenta` and their `Bright` variants, each to the nearest of the 12 hues by OKLCH hue; hues left over are derived |
| `bar` | `titleBar.activeBackground` |

`name` comes from the file's `name` (or the file name); `author` from `author` when present; `licence` is "unknown" and the report says "Check the theme's licence before you share this file". The **report** (a dialog before the editor opens) lists: mapped tokens with their VS Code key, derived tokens, values adapted because they failed a pair (with Fix applied or not, as the user chooses: "Fix contrast now" is preselected), and the number of ignored keys with a disclosure listing them. The result opens as a draft.

### D13. Encrypted accounts

The editor shows one line on an encrypted account: "Themes are not encrypted. Don't put private information in a theme's name or notes." The theme's name and notes are short labels about colours; encrypting them would hide them from the server's validator and the owner's instance tools for no protection of task content.

### D14. Accessibility and languages

Every control is a design-system primitive with stories in light and dark at 375 and 1280 px; the colour field and token row get stories with an axe pass in the workbench gate. Sliders and number fields are operable by keyboard; the Contrast panel is a list with headings; fixes announce their result ("Muted text now 4.6 to 1 on Canvas"). Token and group names, actions, warnings and the report are in the six catalogs; theme names are not translated.

## Data model

New entity `theme` (D1) with the new kind `kThemeDoc`, declared in `internal/sync/ops.go` `Schema`; the generator writes `web/src/generated/opSchema.ts`; no content fields, so `internal/e2ee/contentfields.go` is unchanged. Personal scope with unique ids (`scope.go` `uniqueIDs`). Selection values `user:<id>` in the existing `theme_light` and `theme_dark` fields. Additive; nothing renamed.

## Bundle, binary and memory

- First load: under 0.5 KB gzip (the `theme` table in the Dexie schema and the Themes row's entry in the settings index).
- Lazy: the editor about 18 KB gzip (the controls, preview harness, token list, fix search); the VS Code importer about 3 KB gzip (mapping table and JSONC reader). The preview reuses components already in the shell chunk.
- Server binary: the kind and schema entry, a few KB. No dependency anywhere. Memory: one draft and its resolution, about 20 KB, while the editor is open.

## Risks / Trade-offs

- [Users save unreadable themes] → warnings stay visible, the card is marked, Fix is one click, and high contrast always works; refusing to save would block legitimate low-vision tuning in the other direction.
- [Two devices edit one theme offline] → the later save wins whole; the losing device's draft stays on that device and is offered back (D7).
- [VS Code themes vary wildly] → the mapping falls through key lists, everything else is derived, and the report shows exactly what happened before anything is saved.
- [A theme name leaks something on an encrypted account] → the editor says themes are not encrypted (D13).
- [Font names behave differently per device] → the theme falls back to the system stack, and the editor says so.

## Migration Plan

Additive. Older clients ignore the `theme` entity and read `user:` choices as the default. Rollback leaves the rows stored.

## Open Questions

- Should a user be able to offer a custom theme to project members? Not now; the owner can add instance themes (`theme-instance-default`).
