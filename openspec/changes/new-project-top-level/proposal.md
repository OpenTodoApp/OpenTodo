# A new project starts at the top level

## Why

GitHub issue #1759: creating several projects in a row from the sidebar nests each one inside the one before. The sidebar's New project picks the project on screen as the parent, and after a create the app opens the new project, so the next one lands inside it. The owner decided on 22 Nov that the sidebar's "+" always creates a top-level project, and that a project is nested only when the person picks a parent.

## What Changes

- New project in the sidebar starts with the parent set to Top level, whatever project is on screen. The Parent project field in the form still nests it when the person picks one.
- On the iPhone, the form's name field and its Parent project field stay above the keyboard (checked with a test).

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Moving existing projects (drag and the project menu are unchanged).
- The palette's New project, which already creates a top-level project.

ROADMAP.md: none (a bug fix).

## Capabilities

### Modified Capabilities

- `project-organization`: a new project's parent is chosen, never inferred from the screen.
