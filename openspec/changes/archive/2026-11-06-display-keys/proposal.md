# Proposal

## Why

Grooming a list means looking at it several ways in a row: group by priority to set priorities, then group by date and order by priority to schedule, then group by label to check labels. Each change is three clicks in Display options. Keyboard users asked for short key sequences instead, in the spirit of `vgpodd` ([#842](https://github.com/OpenTodoApp/OpenTodo/issues/842)).

## What Changes

- In a project's list, on a label's page and in a saved view, `r` starts a sequence that rearranges the list: `r g` and a letter sets Group by (`s` section, `j` project, `n` none, `d` due date, `p` priority, `l` label), `r o` and a letter sets Order by (`m` manual, `p` priority, `d` due date, `c` created, `l` deadline, `t` title), and `r r` reverses the direction.
- The keys write the same synced setting as the Display options panel, through the same write, so the choice follows the user to every device, works offline and converges like a panel change.
- Only the choices the page's panel offers work there; the others do nothing and the sequence spotlight does not list them. Custom-field orders stay in the panel.
- A short notice says what is set now ("Group by: Priority", "Order by: Title · Descending"), read by screen readers. No Undo: the panel's changes have none and the same keys set it back.
- The sequence spotlight names the middle step of a three-key sequence (`r` then "g Group by", "o Order by").
- The `?` sheet and `docs/keyboard.md` list the keys under "Group and order", generated from the registry.

Why `r`: plain `v` cycles a project's layout and `g` starts go-to sequences. `o` is Vim's quick add and `Shift+G` Vim's last task. `r` (rearrange, reverse) is free in every scope a list shares: the list, the board, the timeline, the task panel, the project's own keys and the Vim layer. It is used only by the Trash and the reviews, which have no list with Display options.

No new environment variable. No op field is added or changed; nothing is **BREAKING**.

## Capabilities

### New Capabilities

### Modified Capabilities

- `keyboard-shortcuts`: the group and order sequences, and named middle steps in the sequence spotlight.
- `list-display-options`: the options can be changed from the keyboard.

## Impact

- `web/src/lib/shortcuts.ts` (registry entries, spotlight steps), the dispatcher's continuations, the spotlight's groups, the cheat sheet's context sections.
- A hook beside the display panel used by project and label lists and saved views.
- The Vim layer leaves the keys of another sequence to the dispatcher.
- Six catalogues, `docs/keyboard.md`, `docs/group-and-order.md`.

Out of scope: the New view page (an unsaved draft), Today, Upcoming and other fixed-order lists, row properties, layout and completed tasks, custom-field orders, and remapping keys. Advances no open ROADMAP item.
