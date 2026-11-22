# Proposal

## Why

The P3 and default P4 completion circles look the same in a busy list. [#1752](https://github.com/OpenTodoApp/OpenTodo/issues/1752) asks for a ring that makes P3 easier to spot.

## What Changes

- Give an open P3 task a blue ring with an empty centre in task rows, cards, compact rows, and the task panel.
- Preserve the P1 and P2 fills, the P4 treatment, the priority bars, and the completed mark. Priority menus, palette colours, and preferences are outside this change's scope.
- Follow up on the shipped task row design in the UI/UX milestone of ROADMAP.md and the accessibility work from #1674 and #1693.

## Capabilities

### Modified Capabilities

- `row-layouts`: the priority-three completion circle uses a blue outline.
- `task-list-presentation`: the row metadata colour rule includes the priority-three outline.

## Impact

Web presentation and its tests, workbench stories, and guides.
