## Why

Two promises from the October UX changes were left open: inline-task-editing's design (D3) said the row being edited is not dragged, but a press in its field could still start a drag; and smart-title-tokens' proposal said the cheat sheet would teach the `#` and `@` suggestions, but the sheet still only showed `#project @label`.

## What Changes

- The row being edited in place no longer starts a drag; the other rows still do.
- The cheat sheet's quick add syntax gains a line for the `#` and `@` suggestions and `#Parent/Child`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `task-list-presentation`: the inline-edited row is not draggable.
- `keyboard-shortcuts`: the cheat sheet lists the `#`/`@` suggestions.

## Impact

`web/src/app/task-list/ListGroups.tsx`, `web/src/lib/shortcuts.ts`, the locale catalogs and the generated keyboard guide. No new dependency; bundle size unchanged within a few bytes.
