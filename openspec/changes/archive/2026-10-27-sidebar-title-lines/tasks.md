# Tasks

## 1. Two lines in the workspace control

- [x] 1.1 In `web/src/app/WorkspaceControl.tsx`, render the single-workspace label as two truncating lines: the wordmark first, the workspace name in `text-meta text-muted` below it, with no " · " separator. Leave the several-workspaces case and the trigger's accessible label unchanged (design D1, D2). Verify: `cd web && npm run build`.
- [x] 1.2 Extend `web/src/app/workspaces.test.tsx`:
  - with one workspace, the trigger holds the instance name and the workspace name in two separate line elements, and no "·";
  - the accessible name is still "Workspace: OpenTodo · Personal";
  - with two workspaces, only the current workspace's name is shown.

  Verify: `cd web && npm test -- workspaces`.
- [x] 1.3 Add a `OneWorkspaceBranded` story with a long branded name ("Acme Family Tasks Server") next to `OneWorkspace` in `web/src/app/sidebar.stories.tsx`. Verify: the story renders with the name cut on line 1 and "Personal" in full on line 2.

## 2. Docs and baselines

- [x] 2.1 Update `docs/workspaces.md` (the top of the sidebar shows the app's name with the workspace name below it) and regenerate the help. Verify: `npm run docs:check`.
- [x] 2.2 Accept the changed Sidebar baselines after inspecting each diff (CI artifact recipe). Verify: `make ui-check` passes in CI, and only the header text differs.

## 3. Release

- [x] 3.1 Add a CHANGELOG.md entry under Unreleased (Closes #492). Verify: `npm run docs:check`.
- [x] 3.2 Run `make openspec-validate` and the web tests. Verify: both pass, and CI is green on the PR.
- [x] 3.3 After the PR is merged, reply on issue #492 with a short, friendly note thanking calli33 and describing the change, then close it. Verify: `gh issue view 492 -R OpenTodoApp/OpenTodo` shows the comment and the state CLOSED.
