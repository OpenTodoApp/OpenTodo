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

## Implementation notes

- **Preference (D1).** `web/src/app/vim/prefs.ts`: `localStorage["opentodo.vim"] = "1"`, read through `useSyncExternalStore` (`useVimEnabled`) and re-read on the `storage` event, so another tab follows. Every access is in `try`/`catch`; unavailable storage means off. App's sign-out handler calls `clearVimPref()` right after `clearLocalData()` (that wipe is Dexie-only, so the key is removed beside it rather than inside `lib/db.ts`). The switch is a new **Settings → Keyboard** section. No Dexie change.
- **Dispatcher (D2).** `vim/dispatch.ts` is DOM-free (tests drive it with plain key objects); `vim/VimLayer.tsx` installs it as one capturing `keydown` listener on `window`, so `stopPropagation()` keeps a consumed key from Shell's and TaskListView's bubbling listeners. It consumes only digits as a count (on task lists), `j`/`k`/arrows *after a count*, `J`, `K`, the second `g` of `gg`, `G`, `d`, `x`, `o`, `i`, `:`, and Escape while a text field has focus. Every other key, and on views other than task lists every key except `:`, propagates untouched. Insert mode follows focus (`focusin`/`focusout`): text inputs, textareas, selects and contenteditable count; checkboxes and buttons do not.
- **`g` timing.** Instead of a second `g` timer, `gg` reads Shell's existing prefix flag (`isGPending()` in `signals.ts`, 800 ms): the first `g` always propagates so Shell arms its prefix, and a second `g` while the flag is set is consumed (and the flag cleared). `g` followed by anything else stays Shell's (`g t`, `g x`, `g d`, …). The default timing is unchanged; the 1 s window applies to `d` and to counts.
- **List actions (D3).** To keep the default bundle small, the split differs slightly from the sketch: TaskListView registers its *state* (`ListState`: rows, board columns, selection, panel, read-only check, manual-order flag, quick-add focus, the list's own complete/reopen) in `app/listActions.ts`, and `vim/actions.ts` (lazy chunk) turns it into `moveSelection`, `selectIndex`/`selectFirst`/`selectLast`, `openSelected`, `toggleCompleteSelected`, `deleteSelected`, `setPrioritySelected`, `moveSelectedBy`, `openQuickAdd` and `closePanel`. Writes reuse `deleteTask`, `updateTask`, `moveTaskBy` and the list's `toggleComplete` (parent prompt and archive offer included). Viewers' tasks are skipped, as with the default keys. The view defaults for new tasks moved into `taskDefaults()`, so quick add and `:new` share one rule.
- **`o`.** Focuses quick add. In manually ordered views (project lists, Inbox) the next entry is created as usual and then placed right after the selected task as its sibling (same parent and section) with `moveTask(..., {at: {after}})`; further entries follow it. Leaving the field ends this, and `q` and clicks still append at the end. In date-sorted views `o` behaves like `q`.
- **`i`.** Opens the panel and focuses its title once the panel for that task has rendered (`data-detail-for` on the panel's `<aside>`).
- **Command line (D4).** `vim/commands.ts`: an exact name wins, else the first prefix match in table order (`s` → settings, `sy` → sync). Tab takes the first completion, Enter runs. `:project` matches live, unarchived projects by name prefix in position order. `:new` takes a plain title (no quick-add parsing) and calls `createTask` with `taskDefaults(route)`, so it also works outside task lists (with Inbox defaults). Unknown or incomplete commands keep the line open with a message.
- **Escape (D5).** A field inside `[role="dialog"]` (label and assignee pickers, confirmations) keeps its own Escape, so the dialog still closes with one press; focus then leaves and the mode returns to Normal.
- **Help (D6).** The `?` overlay moved unchanged from `Shell.tsx` to `ShortcutHelp.tsx`. It gained `extraSections` and, when no section is passed, a one-line hint that Vim keybindings can be enabled in Settings. The Vim layer hands its table (`vim/help.ts`, built from the command table) to Shell on mount; `:help` opens the overlay.
- **Indicator.** A strip at the bottom of the main column shows `NORMAL` / `INSERT` / `COMMAND` and the pending keys and count (`3`, `d`, `g`), with the command line above it while open.

### Conflicts with existing shortcuts and how they are resolved

| Key | Default meaning | With Vim on |
| --- | --- | --- |
| `1`–`4` | Priority at once | A digit starts a count. A lone `1`–`4` still sets the priority, after 1 s, or at once when the next key is not a motion (`2` then `c` = priority 2, then complete). `2j` is a count. |
| `j` / `k` / arrows | Move one row | Unchanged without a count (the default handler runs). With a count the layer moves N rows (within the column on a board). |
| `g` + key | Navigation | Unchanged, including `g h` (Activity feed, added by `activity-feed`); only `g g` is new (see "`g` timing"). |
| Feed, Trash, calendar, Filter, dashboards | Their own `j`/`k`/Enter/arrow keys | Unchanged: these views register no list state, so the layer passes every key through there except `:` (and Escape in a field). |
| `a` | Add a subtask | Unchanged. The proposal's "`i`/`a` open the panel" is narrowed to `i`, since `a` already enters Insert mode. Spec delta updated. |
| `O` (Shift+O) | Recurring task: this occurrence only | Unchanged; the proposal's `O` (open above) is not implemented. |
| `H` / `L` (Shift) | Project activity / labels | Unchanged; the proposal's "`H`/`L`-style panel focus" is not implemented. |
| `x` | (unbound; `g x` is Trash) | Complete / reopen; `g x` still opens the Trash. |
| `d` | (unbound in lists) | `dd` deletes. `g d` still opens the Day view, and Settings → Users' `d` is outside task lists and untouched. |
| `J` / `K` | (unbound) | Move the selected task one place (with a count, N places), manually ordered views only. Spec delta now defines this. |
| `o`, `i`, `G`, `:` | (unbound) | As listed above. |
| Escape in a field | Blur (some fields: cancel or close) | Blur and stay in the panel. The field's own Escape (comment cancel, subtask line close) does not run, so typed text is kept. Fields in dialogs keep their Escape. |
| Escape in Normal mode | Close panel, clear selection | Unchanged. |

### Size impact (measured)

`npm run build`, before → after:

- Main chunk: 802.75 kB → 807.54 kB minified, **236.69 kB → 238.16 kB gzipped (+1.47 kB)**.
- New lazy chunk `VimLayer-*.js`: 9.70 kB minified, **4.10 kB gzipped**, fetched only while the switch is on.
- CSS unchanged (53.87 kB, 9.72 kB gzipped). Go binary and image unchanged apart from the embedded assets. No dependency.

The main-chunk growth exceeds D8's "under 1 KB" estimate. About 0.8 kB of it is the cost of the app's first dynamic import: Vite's preload helper plus the chunk's import bindings (a build without the lazy boundary measured +0.64 kB). `build.modulePreload: false` in `vite.config.ts` saves 0.24 kB of that; the layer's dependencies all live in the main chunk, so there is nothing to preload. The rest is the Settings switch, the help plumbing and hint, the list-state registration and `o` placement in TaskListView, and the preference store. Dropping the lazy boundary would cost more, because the layer itself is 4.1 kB.
