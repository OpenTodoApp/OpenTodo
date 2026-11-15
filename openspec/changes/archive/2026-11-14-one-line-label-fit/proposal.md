## Why

In a One line task row, the label column can clip long names and the overflow count. The fixed row grid should make tasks easier to scan while keeping every label name available. This follows up on [#1089](https://github.com/OpenTodoApp/OpenTodo/issues/1089) and the fixed slots shipped in ROADMAP.md under `sidebar-brand-and-row-grid`.

## What Changes

- Fit whole chips in the label column in task order. If the first name cannot fit with the overflow count, shorten it with an ellipsis.
- Show the full cut name and the names behind `+N` on hover and keyboard focus. Keep every name readable by assistive technology.
- Out of scope: Detailed rows, cards, the phone layout's existing visibility rules, and the widths and order of the property slots.

## Capabilities

### Modified Capabilities

- `row-layouts`: specifies label fitting and access to hidden names in One line rows.

## Impact

Web row presentation, tests and user documentation. No data writes, API changes, or dependencies.
