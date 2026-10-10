# Design

## Context

Keyboard handling today lives in two `keydown` listeners: `Shell` (the `g` prefix, `?`) and `TaskListView` (`j`/`k`, Enter, `c`, `1`–`4`, Delete, Escape), each with its own "am I typing in a field" guard. Escape already has context-dependent meaning (close panel, else clear selection). There is no mode concept, no indicator and no command line. The product rule is keyboard-first with every action reachable without a mouse; the roadmap marks Vim-style modal navigation as "exploring", so this change should be small, reversible and strictly additive.

## Goals / Non-Goals

**Goals:**
- A faithful-enough subset of Vim navigation that feels natural: modes, counts, `gg`/`G`, `dd`, `o`, `:` commands.
- Zero behavior change and zero bundle cost when the setting is off.
- One dispatch point so new bindings do not create a third ad-hoc listener.

**Non-Goals:**
- Visual mode, registers, `.` repeat, macros, user remapping, `/` search, bindings inside the notes editor, syncing the preference.

## Decisions

### D1. Opt-in, device-local preference
Stored under a `localStorage` key `opentodo.vim = "1"`, read through a tiny `useVimEnabled()` store so toggling re-renders without reload. Cleared by the existing sign-out routine that wipes local data.
- Why not a synced user setting: there is no user-settings entity in the op schema yet; adding one for a single boolean is premature. A later `settings-sync` change can migrate the key into a synced field without touching this layer.

### D2. One key dispatcher with a mode state machine, loaded lazily
`web/src/app/vim/` exports `VimLayer`, mounted by `Shell` only when the preference is on, via `React.lazy`. It installs a single capturing `keydown` listener on `window` that runs before the existing listeners. It owns: mode (`normal | insert | command`), a pending-key buffer with a 1 s timeout (`g`, `d`, digits), the count accumulator, and the command-line state. Insert mode is derived from focus (`focusin`/`focusout` on inputs, textareas, selects and contenteditable), not toggled by hand, so it can never desynchronise from where keystrokes actually go. In Normal mode the dispatcher handles only its own additions (`gg`, `G`, `dd`, `x`, `o`, `i`/`a`, counts, `:`) and otherwise lets the event propagate to the existing handlers, which keep working untouched. For `gg` it consumes the second `g`; a `g` followed by `t` is left to `Shell`'s handler as today, which is why both work.
- Why capturing phase: avoids editing the two existing handlers beyond exposing the list actions they already implement.
- Why not rewrite all shortcuts into the dispatcher: the default layer must stay exactly as specified and reviewable in isolation; the Vim layer is a decorator.

### D3. List actions as a small imperative API
`TaskListView` already knows the selection and the visible ordering. It registers `{ moveSelection(n), selectFirst(), selectLast(), openSelected(), toggleCompleteSelected(), deleteSelected(), openQuickAdd() }` in a module-level ref (`listActions.ts`) while mounted. The Vim layer calls these; they call the same `mutate()`-backed helpers as the buttons, so offline and convergence behavior is inherited.

### D4. Command line
A one-line input rendered above the footer, with prefix completion over a static command table plus live project names from Dexie (`useLiveQuery`). Commands map to existing functions: `navigate(...)`, `syncNow()`, quick-add's `createTask` with the view defaults, panel close. Unknown commands show an inline message and keep the line open for correction. Escape or blur closes it.

### D5. Escape semantics
In Insert mode Escape blurs the field (keeping its content; the detail panel's field already saves on blur/change) and returns to Normal without closing the panel; a second Escape is then handled by the existing handlers (close panel / clear selection). In Command mode Escape cancels the command line. In Normal mode Escape is untouched. This is the one place where the Vim layer deliberately intercepts a default key, and only while enabled and only while a field has focus.
- Alternative: keep Escape-closes-panel even from a field. Rejected: it breaks the Vim mental model that Escape always lands in Normal mode first.

### D6. Indicator and help
A footer strip shows `NORMAL`, `INSERT` or `COMMAND` and the pending count/keys (`3`, `d`, `g`). The `?` overlay receives an optional `extraSections` prop; the Vim layer supplies its table. `:help` toggles the same overlay.

### D7. Data model impact
None. No op, schema, API or IndexedDB change; one `localStorage` key.

### D8. Footprint
No dependency. The Vim chunk is roughly 4–6 KB gzipped, loaded only when enabled; the default bundle grows by under 1 KB (settings switch, lazy boundary, `extraSections` plumbing). Server image and memory unchanged.

## Risks / Trade-offs

- [Capturing listener swallows a key another component needed] → the layer calls `preventDefault`/`stopPropagation` only for keys it actually acts on, listed in a single table; test asserts that non-Vim keys propagate.
- [Modal UI confuses users who turned it on by accident] → off by default, indicator always visible, the switch sits next to the shortcut list in Settings, and `?` explains how to turn it off.
- [Escape-to-Normal changes a default behavior] → only when enabled; documented in the help section; default users unaffected.
- [Pending-key buffer and the existing `g` timer drift apart] → both use a 1 s window; the Vim layer owns `gg` only and leaves other `g` sequences to the existing handler; test covers `g t` and `g g` in both orders.
- [Count prefixes collide with `1`–`4` priority shortcuts] → a digit followed by a motion is a count; a digit followed by nothing within 1 s falls through to the priority shortcut; test covers `2j` versus `2`.

## Migration Plan

Additive, client-only. Rollback is removing the setting; the `localStorage` key is ignored if present.

## Open Questions

- Whether to sync the preference once a user-settings entity exists.
- Whether the notes editor should honour a reduced Vim subset (`Escape` to Normal) when `collaborative-rich-text` ships.
