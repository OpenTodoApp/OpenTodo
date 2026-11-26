# Proposal

## Why

Issue #2105: phone section controls open inline inputs while the floating button opens a separate sheet. Hiding the keyboard leaves inline drafts without a visible submit action.

## What Changes

Below 768 px, omit the top task-list input and use the existing sheet for section/board add actions, prefilling project and section. Apply this with either phone-screen preference. Preserve desktop inline entry, typed project overrides, batch paste, placement, reusable lists, Undo and offline ops. Specialized row/subtask editors, capture and calendar scheduling are outside scope.

## Capabilities

- `app-shell`: contextual phone capture through one sheet.
- `task-list-presentation`: no top phone input, including the earlier layout.

## Impact

Advances ROADMAP.md's phone-lists and phone-ui-default work. Touches task capture, tests and user docs; adds no dependencies, routes, op fields, migrations, mandatory environment variables or native code.
