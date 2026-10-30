# Proposal

## Why

Since `task-row-context-menu`, a right-click on a task row opens the full Actions menu at the pointer. That menu lists every priority (four rows) and every date choice (five rows) at its top level, on top of Complete, tracking, Labels, the moves, Assign and Trash: about sixteen rows with group headings, taller than a laptop window. It opens partly off-screen or as a long scrolling panel, and it reads as a wall of options next to a row the user only wanted to act on once.

## What Changes

- **Priority and Date become one item each.** In the task Actions menu, "Priority…" and "Date…" open their choices in place of the menu's items, inside the same menu: Priority 1–4 with their keys, and Today, Tomorrow, Next week, No date, Pick a date…. Their first item (and Escape, or a tap outside) goes back to the menu, with the focus on the item that opened them. The menu drops from about sixteen rows to ten.
- **A shared submenu item.** `ActionMenu` gains a `submenu` item kind for this, so other object menus can fold long lists of choices the same way. A submenu stays a menu: arrow keys, Home/End, type-ahead, and an item closes the whole menu. The command palette still lists each choice as its own command.
- **A menu's focus survives its data loading.** Groups were keyed by position, so the "Start tracking" group that appears once the menu has read its task remounted every group below it and dropped the keyboard focus; groups are now keyed by their first item.
- The More button's menu is unchanged: it already leaves out Priority and Date, which the row's own buttons offer.

Out of scope: the order or wording of other items, the selection bar, the row's own Priority and Schedule buttons, and the bottom sheet on phones (shorter for the same reason, otherwise unchanged). No shortcut, string, route, API, dependency or environment variable is added; no server or sync change.

Advances ROADMAP.md's UX direction; follows up `task-row-context-menu` and `labels-and-menus`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `action-menus`: a new requirement "Long lists of choices fold into a submenu" defines the submenu item, its keyboard and focus behaviour, and that the task Actions menu folds Priority and Date into one.
