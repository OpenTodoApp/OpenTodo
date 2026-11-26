# Proposal

## Why

On a phone, section and board add controls open inline task inputs while the floating Add task button opens a separate sheet. Dismissing the keyboard leaves inline drafts without a visible submit action. The earlier phone layout also reserves space for a top-level input. Issue #2105 asks for the floating button's sheet to handle these actions consistently.

## What Changes

- Below 768 px, omit the shared task-list screen's top quick-add row regardless of the New phone screens preference.
- Open the existing quick-add sheet from section plus buttons and board header/footer add controls on phones, retaining the originating project and section.
- Preserve explicit project overrides, batch paste, reusable-list behavior, preferred placement, offline ops, and keep-adding behavior.
- Preserve desktop inline adding. Leave specialized subtask/sibling editors, onboarding, capture, calendar scheduling, and native notification entry unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: a single mobile sheet for list and section/board task capture, with request-scoped defaults.
- `task-list-presentation`: omit the top quick-add row below 768 px in the earlier layout as well as dedicated phone lists.
- `sections-and-boards`: section and column add controls use the shared sheet below 768 px and inline entry on desktop.

## Impact

Advances the phone-lists and phone-ui-default work in ROADMAP.md with a scoped follow-up for #2105. Touches Shell, QuickAddSheet, TaskListView, section/board rendering, interaction tests, user docs, and a changelog fragment. No dependencies, routes, op fields, migrations, mandatory environment variables, or native app changes. Browser tests use isolated data directories and free ports.
