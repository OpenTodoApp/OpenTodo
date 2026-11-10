# Design

## Context

The device loop's readers (`READERS` in `loop.ts`) cover five tools. `loadSnapshot` reads tasks, projects, labels and sections. Notes, time entries, frames and slots live in Dexie tables of their own. The server's implementations are in `internal/agenttools/read_notes.go`, `read_time.go`, and the frames and slots readers.

## Decisions

### D1. Port the readers, pin them with vectors

Each tool gets a TypeScript reader beside `read.ts`. The snapshot gains notes, time entries, frames and slots, read lazily only by the tools that need them.

`go test ./internal/assistant -run Device -update` writes `read.vectors.json`: rows in, arguments, the server's result out. A vitest test checks the device against it, as `plan.vectors.json` does for the planners.

### D2. Reuse ported logic

Note search uses `web/src/lib/noteSearch.ts`, which is already pinned to `internal/notesearch`. Time totals use `web/src/lib/time.ts`, pinned to `internal/timetrack`. Frame occurrences use `web/src/lib/frames.ts`, pinned to `internal/frames`. The device readers only shape results.

### D3. Found while implementing

- **Answers as for an encrypted account.** The vectors call the server with an encrypted caller, so `get_note` carries no `links` or `linked_from` (its description says an encrypted account gets neither). Only `search_notes` is called as a plaintext account: the server refuses it for encrypted accounts, the device can run it over its decrypted notes. The device's `search_notes` description leaves out "Not available on an end-to-end encrypted account." (`deviceTool.drop`, checked by a test).
- **No cursor.** The device does not page; where the server returns a `next_cursor`, the device returns `truncated: true`, as its other read tools do.
- **The disclosure.** The on-device list of what may be sent now names notes, calendar frames and slots, and tracked time (`deviceConsentFields`, a MODIFIED requirement in this change's delta spec).
- **Slots and kept-away projects.** The server's `list_slots` read each listed task by id and showed tasks of projects kept away from assistants, against `agent-project-exclusion`. It now leaves them out like deleted ones, and the device does the same.

## Data model, size, memory

- **Data:** none.
- **Size:** the readers load with the device assistant's lazy chunk, a few KB gzip.
- **Interface budget:** no screen changes.

## Risks / Trade-offs

- **Result drift between server and device.** The vectors fail the build.
