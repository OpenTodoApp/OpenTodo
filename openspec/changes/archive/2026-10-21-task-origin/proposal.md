# Proposal

## Why

Tasks that come from somewhere else lose the thread back to it: the share target and the extension paste the page URL at the end of the notes (`proposedDescription` in `web/src/lib/share.ts`), email to task keeps only the Message-ID in its receipts table where nobody can see it, the Linear importer writes the issue identifier as the first word of the description, and the Todoist, Things and TickTick importers keep their source ids only in the server's import memory. A person looking at a row cannot tell at a glance that it came from a page, a mail or an issue, cannot open the source in one click, and cannot ask for "everything I captured from the tracker". The data exists at capture time in every one of these paths; the task simply has no place for it.

## What Changes

- One additive task field, `origin`: `{kind: "url" | "email" | "issue" | "import", provider?, id?, url?, title?}`, validated by the op schema (kind from the closed list, `http(s)` URL only, bounded lengths, no unknown members), stored, synced and converging as one last-writer-wins register like `due`. `title` and `url` are user content; because the member values cannot be encrypted separately inside one value and `id` names the issue or page anyway, an end-to-end encrypted account encrypts the whole object as one ciphertext string, and the server accepts that string wherever it accepts the object.
- An **origin chip** in the row's metadata line and in the task panel's property chips: an icon for the kind from the existing icon set (`link`, `at-sign`, `download`), the external id or the URL's host, opening the URL in a new tab when there is one; removable from the panel. Cards on the board show it as any other row does. The command palette finds tasks by their origin id and title.
- Filter terms `origin` (has an origin), `no origin` and `origin: <provider or kind>` (`origin: github`, `origin: email`), in the published grammar, the server parser and the client, evaluated on the device.
- Writers: the capture screen (share target, bookmarklet, extension) sets `{kind: "url", url, title}` and still puts the URL in the notes; email to task sets `{kind: "email", id: <Message-ID>}`; the Linear importer sets `{kind: "issue", provider: "linear", id: "ENG-123"}` (the CSV carries no URL); the Todoist, Things and TickTick importers set `{kind: "import", provider, id}` from the source id they already compute, so a later change can match a re-import against the task itself. `ot add` and `ot edit` take `--origin-url`, REST accepts `origin` on create and patch, the MCP write tools accept `origin_url` on `create_tasks`. The CLI and the MCP tools recognise the hosts of GitHub, GitLab, Jira and Linear and derive `provider`, `kind: "issue"` and the issue id with one shared table; the web app does the same at capture.
- Readers: webhook payloads, REST reads, MCP tool results and the JSON export carry `origin` as any other field; the own-export round trip keeps it. The server never fetches the URL.
- Allowed on the demo instance: it is a field, not an outbound request.

Out of scope: polling or syncing with external trackers (a follow-up change, `issue-import`), fetching favicons or page titles over the network, an origin on projects, a manual origin editor in the panel (a pasted link still goes into the notes or a link attachment), deduplicating a re-import by origin (the importer keeps its source-id memory; this change makes the id visible so that can follow), and quick-add syntax for an origin.

Advances ROADMAP.md: `share-capture` (the captured page becomes a link on the task instead of a line in the notes) and `named-importers` (imported items keep their identity across export and import); and the first step toward a code-tracker integration, before `issue-import` (polling and syncing issues), which needs a task to know which issue it stands for.

No new environment variable. Additive op field, no rename, no format change. Not **BREAKING**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `task-management`: a new "Task origin" requirement defines the field, its validation, the default, and its offline and convergence behaviour.
- `task-list-presentation`: "Metadata language" gains the origin chip among the neutral chips.
- `web-app`: no delta any more. "Task panel property chips" was replaced by "Task panel facets" (`task-panel-facets`, archived 2026-10-21), which already carries the origin as a part of the Where line that opens its source, with Remove origin in the header menu.
- `filter-queries`: a new "Origin terms" requirement (`origin`, `no origin`, `origin: value`).
- `command-palette`: "Search over local data" also matches a task's origin id and title.
- `share-capture`: "Capture screen" sets the origin from the shared URL and title, keeping the URL in the notes.
- `email-capture`: "Message becomes a task" records the Message-ID as the task's origin.
- `data-import`: "Linear attributes" records the issue identifier as the origin; a new "Imported origins" requirement covers the Todoist, Things and TickTick source ids and the own-export round trip.
- `cli-client`: "Add and edit tasks" gains `--origin-url`.
- `http-api`: a new "Task origin on the API" requirement (accepted on create and patch, validated, returned, exported) with its authentication and error scenarios.
- `mcp-server`: a new "Task origin in tools" requirement (`origin_url` on `create_tasks`, `origin` in task results).
- `webhooks`: "Payload and signature" states that `origin` travels like every field, with a scenario.
- `end-to-end-encryption`: "Encrypted and plaintext fields" adds the origin as a content value encrypted whole.

## Impact

- Server: `internal/sync/ops.go` (`origin` in `Schema`, a `kOrigin` kind in `kinds.go`), `internal/e2ee` (`ContentFields`), a new small package `internal/origin` (host recognition, shared vectors), `internal/email/process.go` (one more op), `internal/importer/profile_linear.go`, `profile_todoist.go`, `profile_things.go`, `profile_ticktick.go` and the `Row` struct, `internal/filter/filter.go` (three terms), `internal/agenttools/write.go` and `data.go`, `internal/httpapi` (no new route: the collection handlers already validate through the schema), `internal/cli/cmd_tasks.go` and the CLI schema, `internal/activity` (no new event kind). Docs: `docs/sync.md`, `docs/api.md`, `docs/filters.md`, `docs/capture.md`, `docs/import.md`, `docs/cli.md`, `docs/mcp.md`, `docs/webhooks.md`, `docs/e2ee.md`.
- Web: `web/src/lib/types.ts`, `ops.ts` (default `null`, `COPY_FIELDS`), `e2ee.ts` and `e2eeSync.ts` (encrypt the object as one string), a new `web/src/lib/origin.ts`, `share.ts` and `app/ShareCapture.tsx`, `app/TaskRow.tsx`, `app/task-detail/Properties.tsx`, `lib/filter/parse.ts`, `evaluate.ts`, `suggest.ts`, the palette's local search, `lib/activity.ts` (field label), stories and tests.
- Specs: the thirteen deltas above. Extension: unchanged (it already sends `url` and `title`).
- Size: about +3 KB gzipped in the web bundle (chip, panel chip, origin table, three filter terms, search), about +40 KB in the binary (validation, recognition table, importer and email ops, CLI flag); no dependency, image, memory or database schema change.
- No API route added; no new setting; the demo deny list is untouched.
