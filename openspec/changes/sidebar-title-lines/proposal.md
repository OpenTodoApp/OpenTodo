# Proposal

## Why

Issue [#492](https://github.com/OpenTodoApp/OpenTodo/issues/492) (calli33): put the instance title and the workspace title on two lines, so the sidebar header does not waste space.

While an account has one workspace, the workspace control at the top of the sidebar shows both names on one truncated line: "OpenTodo · Personal", or "Acme Family Tasks · Personal" on a branded instance (`web/src/app/WorkspaceControl.tsx`). The header row shares its width with the search button, so on the 240–280 px sidebar the line already runs out of room with a branded name of about 15 characters. It then cuts off the workspace name, which is the part that tells you where you are. The separator " · " also spends width on nothing.

## What Changes

- While the control shows both names, it shows them on two lines:
  - **Line 1:** the instance's wordmark (the owner's name on a branded instance), at the size and tone it has today.
  - **Line 2:** the workspace name, at the metadata size in the muted tone.
  - Each line truncates on its own, and the " · " separator goes away.
- The header row stays one row of 40 px or less (two lines of 20 + 18 px, measured at 38 px). The mark, the update dot, the chevron and the search button stay where they are.
- With several workspaces the control keeps showing only the workspace name, on one line, as today. The instance name is not added there, because the rule that it appears only while there is one workspace is unchanged.
- The control's accessible name and tooltip still read "Workspace: OpenTodo · Personal".

Assumption: "instance title" is the instance name (the owner's branded name, or "OpenTodo"), and "workspace title" is the current workspace's name. "Title return" means a line break between them. It doesn't mean dropping either name.

No data, op, API or environment-variable change. Not **BREAKING**.

**Out of scope**:
- Showing the instance name while there are several workspaces.
- The icon rail, which shows the mark alone and keeps its tooltip.
- The sidebar width.

ROADMAP.md: no numbered row. This is a polish of the shipped sidebar (`workspaces`, `instance-branding`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: a new requirement, "Workspace control on two lines". The "One workspace" scenario of "Sidebar structure" still holds: the control's name reads "OpenTodo · Personal".

## Impact

- **Code:** `web/src/app/WorkspaceControl.tsx`, the trigger's content only.
- **Tests:** `web/src/app/workspaces.test.tsx`.
- **Stories and baselines:** `web/src/app/sidebar.stories.tsx`, where the `OneWorkspace` story gets a branded variant with a long name, plus its baselines.
- **Docs:** `docs/workspaces.md` and the generated help.
- **CHANGELOG:** an entry under Unreleased.
- **Issue:** Closes #492.
