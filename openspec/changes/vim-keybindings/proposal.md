# Proposal

## Why

OpenTodo is keyboard-first, and the shipped shortcuts (`j`/`k`, `c`, `1`–`4`, `g` + key, `?`) already borrow from the Vim vocabulary. People who live in modal editors expect the rest of it: counts (`5j`), `gg`/`G`, `dd`, `o` to create below, Escape to get back to a known state, and a `:` command line for anything else. Today Escape has view-specific meanings, there is no mode indicator, and there is no way to extend the vocabulary without colliding with text entry. A proper, explicitly opt-in modal layer gives power users what they expect without changing anything for everyone else.

## What Changes

- An opt-in "Vim keybindings" setting in the settings view, off by default, stored per device.
- When enabled: Normal mode (the default; all existing shortcuts keep working plus counts, `gg`/`G`, `dd`, `o`/`O`, `x` for complete toggle, `H`/`L`-style panel focus), Insert mode (entered by focusing any text field or by `i`/`a`/`o`; Escape leaves the field and returns to Normal without discarding the edit), and Command mode (`:` opens a one-line command input with `:inbox`, `:today`, `:upcoming`, `:completed`, `:settings`, `:project <name>`, `:new <title>`, `:q` for close panel, `:sync`, `:help`, with completion and an unknown-command message).
- A persistent mode indicator in the shell footer, and a Vim section in the `?` help overlay that lists the extra bindings only when the setting is on.
- When disabled (the default) the client behaves exactly as today; the Vim layer is not even loaded.

Out of scope: Vim bindings inside the rich-text notes editor (`collaborative-rich-text` owns the editor; a `:set` for it may come later); Visual mode and multi-selection (needs bulk operations, not yet specified); remapping or user-defined keymaps; search with `/` (needs `filter-query-language`); syncing the preference between devices (per-device for now, revisit with a settings-sync change); macro recording; `.` repeat.

This change advances ROADMAP.md section 1, "Vim-style modal navigation option" (`vim-keybindings`).

No new environment variable, no server change, no op log change. Not **BREAKING**: default behavior is unchanged and the setting is off unless the user turns it on.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `web-app`: new requirements for the opt-in Vim setting, the modes and the mode indicator, Normal-mode motions and counts, Insert-mode Escape semantics, the command line, preservation of all existing shortcuts, and discoverable help. The existing "Keyboard navigation" requirement is not modified; the Vim layer is specified as additive on top of it.

## Impact

- Client only: a `web/src/app/vim/` module (mode store, key dispatcher, command parser, indicator, help section) loaded lazily when the setting is on; a hook point in `Shell` and `TaskListView` so the dispatcher sees keys before the default handlers; a settings toggle; a `localStorage` key for the preference; `?` overlay gains a section.
- No server, API, schema or IndexedDB change. No new dependency.
- Docs: `README.md` (keyboard section), `docs/` keyboard reference if present, `CHANGELOG.md`.
- Footprint: lazy chunk of roughly 4–6 KB gzipped; zero when the setting is off.
