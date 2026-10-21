# Proposal

## Why

User feedback, October 2026:

1. Pressing `g` starts a two-key sequence, and nothing on screen says so. The sequence expires after 800 ms with no trace. A user who forgets the second key, or never knew it, can only guess or open `?`. The feedback asks for a spotlight in the centre of the screen that shows "g +", waits for the second key, offers suggestions, and can be dismissed with Esc or a close button.
2. The built-in shortcut views (the `?` cheat sheet and the Keyboard shortcuts Help page) "look old" and "overlap sometimes". The cheat sheet is a two-column table whose key column is 40 % of a 512 px card. A key cell that holds alternatives or a condition ("Enter / Esc (proposed changes)", "Drag (touch: press and hold)") wraps inside its keycap, so the keycaps' borders run into each other and the row's description. Descriptions are full sentences, 2 to 7 lines long, so a section of 12 shortcuts fills a screen.

## What Changes

- **Sequence spotlight.** When the first key of a registered sequence (`g`, outside a text field) is pressed and the second key has not followed within 250 ms, a small dialog opens in the centre of the screen. It shows the pressed key as a keycap followed by "+", the sentence "Press a key", and the completions available right now, grouped by section (Views, Calendar, Review and planning, Tools) as a grid of keycap and short name. While the spotlight is open, the sequence does not expire. Pressing a listed key runs its action and closes the spotlight. Esc, the close button, a click outside it, or a key that completes nothing closes it without running anything. Typing a listed key's name is not a search. The spotlight is a hint, not a palette, and the command palette (`Ctrl+K`) stays the search. Fluent users who type `g t` within 250 ms never see it.
- **Short names in the registry.** Every entry that can complete a sequence gains a `label` of at most 24 characters ("Today", "Calendar · Week", "Process Inbox"), shown by the spotlight and the cheat sheet. The long `description` stays for search, the palette and the guide. The registry test fails on a sequence entry without a label, or on a label over 24 characters.
- **A compact cheat sheet.** One row per shortcut: the short label (or the description, clamped to one line with the full text in the row's accessible name and tooltip) on the left. On the right, the keys as separate keycaps, never wrapped inside a keycap. A sequence reads as two keycaps with a thin "then" between them, and alternatives read with "or". A condition ("when ticked") moves out of the keycap into muted text under the label. Three columns from 1280 px, two from 768 px, one below. The dialog is the `xl` size, with 32 px rows, section titles as small caps-style headings, and the search field pinned. Nothing in the sheet can overlap: the key group has `flex-shrink: 0` and a minimum width, and the label column truncates.
- **The Help page uses the same keycaps.** The keyboard guide's tables (generated into `docs/keyboard.md` and rendered by Help) show sequences and alternatives with the same keycap rendering and never wrap inside a keycap.
- **Vim**: when the Vim layer is on, `g` also completes with `g` ("First task"). The spotlight lists it, and `gg` typed quickly still never shows the spotlight.

No data, op, API or environment change. No new shortcut: the spotlight is opened by the existing prefix keys, and Esc inside it is local to the dialog. Not **BREAKING**.

**Out of scope**: rebinding shortcuts, a "which-key" spotlight for single-key shortcuts or for `d` inside the Vim layer (Vim operators keep their own pending state and mode indicator), touch devices (no keyboard, no sequence), and changing which keys exist. ROADMAP.md item advanced: the keyboard-first principle ("every action reachable without a mouse") through discoverability. No numbered roadmap row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `keyboard-shortcuts`: a new requirement "Sequence spotlight"; "Cheat sheet" rewritten for the compact layout (one-line rows, keycaps that never wrap or overlap, columns by width, conditions outside the keycaps); "One shortcut registry with scopes" gains the short `label` for entries that complete a sequence; "Registry drives the guide and the palette" says the guide renders keys with the same keycaps.

## Impact

- **Code**: `web/src/lib/shortcuts.ts` (`label` on entries, a `continuations(prefix, scopes)` helper), `web/src/app/shortcuts/dispatch.ts` (an observable pending prefix, no expiry while the spotlight is open, a `cancelPrefix` used by the spotlight), a new `web/src/app/shortcuts/Spotlight.tsx` mounted by the shell, `web/src/app/shortcuts/Kbd.tsx` (the keycap group: chords, "then", "or"), `web/src/app/ShortcutHelp.tsx` (the compact sheet), the Help renderer of the keyboard guide and `scripts/` that generate `docs/keyboard.md`, `index.css` (`.ui-kbd` gets `white-space: nowrap`), stories `Shortcuts/Spotlight` and `Shortcuts/Cheat sheet` with baselines, `docs/keyboard.md`, `docs/interface-guide.md` (overlays list), the Help page "Keyboard shortcuts".
- **Server and API**: none.
- **Dependencies**: none. Expected client growth under 2 KB gzipped in the entry chunk (one small component, labels in the registry).
- **Interface budget**: no new chrome row, no new scroller outside the sheet's existing one, no new shortcut. The spotlight is an overlay.
