## 1. Fix

- [x] 1.1 Sidebar project drag: only the project drop indicator (line with a dot at the landing level, ring for inside), the task-drop ring off while a project is dragged; test in `web/src/app/sidebarDrop.test.tsx` and a browser run (`npm test`)
- [x] 1.2 `keepProjectWorkspace` in `moveProjectTo` and `moveProject`; test in `web/src/lib/workspaces.test.ts` (`npm test`)
- [x] 1.3 `PATCH /api/v1/projects/{id}` and agent `update_project` write the kept workspace; `TestProjectToTopLevelKeepsWorkspace` in `internal/httpapi` and `internal/agenttools` (`go test ./...`)

## 2. Check

- [x] 2.1 `make check`
