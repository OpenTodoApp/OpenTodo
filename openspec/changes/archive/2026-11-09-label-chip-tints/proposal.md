# Proposal

## Why

In task lists, a small dot is the only part of a label chip that uses the label's colour. A soft fill makes the labels easier to tell apart while keeping their names readable. The maintainer agreed to this treatment for the shared label chip in [point 2 of #1089](https://github.com/OpenTodoApp/OpenTodo/issues/1089#issuecomment-6726382938).

## What Changes

- The shared label chip shows its name on a soft fill in the label's hue. The separate colour dot inside the chip is removed.
- Readable text, label order and overflow, and the remove action on editable chips are part of the expected behaviour.

Out of scope: project icons, row separators, label markers in the sidebar and pickers, and changes to label storage or assignment. This advances the existing **Labels** item in `ROADMAP.md` as a presentation improvement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `labels` describes the appearance of the shared chip and preserves assignment behaviour.
- `task-list-presentation` describes the tinted labels in task metadata.

## Impact

Shared web UI, the user guide, tests and visual baselines. No new dependencies, strings, routes or data fields.
