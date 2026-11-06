# Design

## Context

The shortcut registry (`web/src/lib/shortcuts.ts`) already supports sequences of any length; the dispatcher arms a prefix while a longer sequence can still complete, and an entry is only a candidate when a registered frame has a handler for it. The sequence spotlight lists the continuations of the pending prefix, but only entries that complete with the next key. The Vim layer runs first as a capturing frame and consumes `o`, `d`, `x`, `i`, `G`, digits and the second `g` of `gg`; it reads "a sequence is pending" as "`g` is pending".

The Display options panel writes through `setListDisplay` (project prefs row or label) and, in a saved view, `updateView(displayPatch(...))`. Both are one op per changed field.

## Goals / Non-Goals

**Goals:** short sequences for Group by, Order by and the direction; the panel's write; only what the page offers; feedback for sighted and screen reader users; no existing key changes.

**Non-Goals:** custom-field orders from the keyboard (their names are the user's own and unbounded), layout, completed tasks or row properties, a New view draft.

## Decisions

### D1. Prefix `r`, then `g` / `o` / `r`

Every single key a list can meet was checked: list, board, timeline, panel, the project, label and view route keys, global and Vim. Free letters were `f`, `r` and `w`. `r` reads as rearrange and `r r` as reverse. The second key names the option (`g` group, `o` order) and the third the choice, so the user's `vgpodd` becomes `r g p r o d`. Letters follow the choice's first letter where free; project is `j` (`p` is priority) and deadline `l` (`d` is due date). The conflict test in `shortcuts.test.ts` passes without overrides.

Alternatives: `o` (taken by Vim's quick add, which sits on top of every scope), `Shift+G` (Vim's last task), a modifier chord such as `Alt+G` (produces characters on macOS and several layouts), making `v` a prefix (would break the layout cycle).

### D2. Named middle steps

`SEQUENCE_STEPS` in the registry names `r g` ("Group by") and `r o` ("Order by"). `pendingContinuations` lists a longer sequence by its step when one is named, once per next key, so the spotlight after `r` shows "g Group by", "o Order by" and "r Reverse order" under "Display options", and after `r g` the grouping choices under "Group by". Steps are never dispatched or listed in the sheet.

### D3. One hook, the panel's write

`useDisplayKeys` registers a `list` scope frame with a handler only for each choice the page's panel offers (project: section, none, due, priority, label; label page: project, none, due, priority; saved view: project, due, priority, label, none). The project's board and timeline have no panel and get no frame. Handlers call the same write as the panel; a choice equal to the current one writes nothing and still announces. A second key before the list re-renders builds on the last keyed choice, so `r o p r r` reverses priority, not the previous order.

### D4. Feedback in the toast

The existing toast (`role="status"` in a polite live region) says the new setting, worded like the panel: "Group by: Priority", "Order by: Priority · Descending (p1 first)". No Undo: the panel's changes have none, and the same keys set the old value back.

### D5. Vim

`isGPending` now means exactly `g` is pending. While another sequence is pending the Vim machine clears its own state and lets the key through, so `r o d` is never quick add and a deletion, and `r g` is never `gg`.

## Interface budget

No chrome, row property or sidebar destination is added. One section of 13 registry entries, no conflicts. Bundle impact is a few hundred bytes in the list chunk.

## Data model

None. The keys write the existing `project_prefs`, `label` and `view` fields (`group_by`, `sort_by`, `sort_dir`) through the op log.
