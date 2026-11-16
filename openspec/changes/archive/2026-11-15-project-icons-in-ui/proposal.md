## Why

A project can show its icon in the sidebar and task rows but still show only a colour dot in a picker or another screen. Reusing the same mark makes a project easier to recognise as it appears across the app. This is the second follow-up agreed in [#1089](https://github.com/OpenTodoApp/OpenTodo/issues/1089#issuecomment-6846511685).

## What Changes

- Use the configured project icon in project pickers that show a colour dot, including their selected values, and in Archived Projects, Notes rows, Monthly Look and Project Walk.
- Apply the same rule to the existing project marks in the Activity Feed, Trash and Quick Add. Reuse the shared renderer in Loop.
- Keep the coloured dot when the icon is unset or unavailable. Keep the current symbols for special options such as No project and Top level.
- Show configured project icons in the tinted headers from [#1277](https://github.com/OpenTodoApp/OpenTodo/pull/1277), as discussed in [#1210](https://github.com/OpenTodoApp/OpenTodo/issues/1210). Headers have no dot fallback.

This advances **Projects** and **UX polish (2026-11 feedback)** in `ROADMAP.md`. Public links, grouping rules, other colour-only cues, icon editing, and label styling are out of scope.

## Capabilities

### Modified Capabilities

- `project-organization`: use one rule for project marks in the signed-in app.
- `task-list-presentation`: show the configured icon beside a project group name in lists and boards.

## Impact

The change reads existing local project fields. It adds no dependency, setting, API surface or persisted field.
