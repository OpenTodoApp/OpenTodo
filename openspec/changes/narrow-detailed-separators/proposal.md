## Why

When an open task details pane narrows a desktop list, the separators from the shipped [task-group-separators roadmap entry](../../../ROADMAP.md) disappear. Detailed rows can still span several lines at that width, so adjacent groups become harder to scan. See [#2168](https://github.com/OpenTodoApp/OpenTodo/issues/2168).

## What changes

Keep the existing faint separator between top-level task groups in Detailed on desktop, including panes narrower than 40 rem. A parent and its visible descendants still form one group.

## Scope

This extends the existing Detailed desktop treatment. Narrow One line rows, the phone list's own dividers, and board cards keep their current treatment. No new setting.
