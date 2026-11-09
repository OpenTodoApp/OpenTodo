# Design

## Context

The device loop's readers (`READERS` in `loop.ts`) cover five tools. `loadSnapshot` reads tasks, projects, labels and sections. Notes, time entries, frames and slots live in Dexie tables of their own. The server's implementations are in `internal/agenttools/read_notes.go`, `read_time.go`, and the frames and slots readers.

## Decisions

### D1. Port the readers, pin them with vectors

Each tool gets a TypeScript reader beside `read.ts`. The snapshot gains notes, time entries, frames and slots, read lazily only by the tools that need them.

`go test ./internal/assistant -run Device -update` writes `read.vectors.json`: rows in, arguments, the server's result out. A vitest test checks the device against it, as `plan.vectors.json` does for the planners.

### D2. Reuse ported logic

Note search uses `web/src/lib/noteSearch.ts`, which is already pinned to `internal/notesearch`. Time totals use `web/src/lib/time.ts`, pinned to `internal/timetrack`. Frame occurrences use `web/src/lib/frames.ts`, pinned to `internal/frames`. The device readers only shape results.

## Data model, size, memory

- **Data:** none.
- **Size:** the readers load with the device assistant's lazy chunk, a few KB gzip.
- **Interface budget:** no screen changes.

## Risks / Trade-offs

- **Result drift between server and device.** The vectors fail the build.
