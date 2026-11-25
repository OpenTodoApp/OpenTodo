## 1. Rule and preference

- [x] 1.1 `user_prefs.complete_subtasks` declared in the op schema and the generated schema refreshed (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`)
- [x] 1.2 `keptIds` in `web/src/lib/subtasks.ts` and `internal/kept` pass the shared vectors `web/src/lib/kept.vectors.json` (`subtasks.kept.test.ts`, `go test ./internal/kept`)

## 2. Web app

- [x] 2.1 `planCompletePlain` cascades only without `keep`; `completeTask` and the bulk complete follow the preference; undo reopens what each path wrote (`subtasks.kept.test.ts`)
- [x] 2.2 The snapshot leaves kept tasks out, a reopened parent brings them back, the parent's Subtasks still lists them, and a patched snapshot equals a full derive (`subtasks.kept.test.ts`)
- [x] 2.3 Kept tasks fire no reminder in the browser, the shell or its geofences, and leave the widgets (`subtasks.kept.test.ts`)
- [x] 2.4 Settings → General → Tasks has the switch; it writes `keep` and back (`tasksSettings.test.tsx`); the strings in every catalogue (`make i18n-check`)

## 3. Server

- [x] 3.1 The agent tools leave kept tasks out of lists, search, the Today summary and counts and keep them in `get_task` (`go test ./internal/agenttools -run Kept`)
- [x] 3.2 The digest and `ot list` leave them out (`go test ./internal/digest ./internal/cli -run Kept`)
- [x] 3.3 A kept task's reminder waits and fires after the parent is reopened (`go test ./internal/push -run Kept`)

## 4. Docs and checks

- [x] 4.1 `docs/notes-and-subtasks.md`, `docs/contracts.md`, `docs/contributing/packages.md` and the changelog fragment; `make docs` and `make docs-check`
- [x] 4.2 `npm test` and `npm run build` in web/, `make bundle-budget`, `make check`
