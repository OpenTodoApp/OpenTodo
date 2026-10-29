# Proposal

## Why

Many Obsidian users write their tasks inline in daily and meeting notes, not in project files (research §3.2 "The Obsidian Vault Bridge", P3.3). When such a line becomes an OpenTodo task, the task should point back at the note it came from, so a click on the task's origin chip opens that note in Obsidian. Today it cannot: origin kinds are a closed list (`url | email | issue | import`, spec `task-management` "Task origin") and an origin URL must be `http(s)` ("Origin validation", "Origin links open only http(s)"), so `obsidian://open?vault=…&file=…` is refused by the server and would not be opened by the app or the native shells.

This is the small, server-side half of the Obsidian work. It is split out of the roadmap's `obsidian-plugin` item (size L) so the data contract ships, is pinned by shared vectors and reaches every client before the plugin that writes it. The plugin itself is `obsidian-plugin`, its mobile vault sync `obsidian-vault-sync`.

## What Changes

- A fifth origin kind, `obsidian`: `{kind: "obsidian", id: "<vault-relative note path>", url: "obsidian://open?vault=<vault>&file=<note>", title?}`. It needs an `id` and a `url`, carries no `provider`, and is the only kind whose URL may use a scheme other than `http(s)`, and then only the exact shape `obsidian://open` with the two query members `vault` and `file`. Every other kind keeps the `http(s)` rule.
- The origin chip shows a note icon and the note's name (its `title`, else the last segment of `id`); activating it opens the note through the system. The `origin: obsidian` filter term works with no grammar change (the term already matches `kind` when there is no provider).
- The client-side guard "Origin links open only http(s)" becomes "only http(s), or a valid Obsidian note link on an `obsidian` origin", checked after decryption, so an encrypted origin cannot smuggle another scheme or another `obsidian://` action (`new`, `search`, third-party URI plugins) to the device.
- The Android and iOS shells hand `obsidian://open` links to the system (new bridge capability `obsidian-links`), still never any other custom scheme. A shell without it shows the chip with "Copy link" instead of opening.
- Shared vectors: `internal/origin/testdata/origin_vectors.json` gains the `obsidian` cases (valid, wrong action, extra query member, `path=` refused, fragment refused, too long, `url` kind with an `obsidian://` URL refused) run by Go and TypeScript, and the bridge fixtures gain the address.

Not **BREAKING**: an additive enum value on an existing field, no new field, route or environment variable. An older server refuses the new kind (as it refuses any unknown one), which `obsidian-plugin` checks for before writing it.

**Out of scope**: the Obsidian plugin and the "Send line to OpenTodo" command (`obsidian-plugin`); vault sync on Obsidian mobile (`obsidian-vault-sync`); links to a heading or block inside a note; any other app's URI scheme (Logseq, Bear, Things); recognising pasted `obsidian://` links in quick add or the capture screen (they stay plain text in the title or notes). ROADMAP.md item advanced: 0.20 "Everywhere", `obsidian-plugin` (first of its three changes).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-management`: "Task origin", "Origin validation", "Origin lengths and required members" and "Origin links open only http(s)" admit the `obsidian` kind and its one URL shape.
- `native-shells`: a shell may hand an Obsidian note link to the system, behind a new capability name.

## Impact

- **Data model, sync and op schema:** no new field. `task.origin.kind` gains the value `obsidian`; `internal/origin` (`Kinds`, `Validate`, `Label`) and `web/src/lib/taskOrigin.ts` (`originLabel`, `originIcon`, `openOrigin`, a new `obsidianURL` check) change together. Origins still converge whole by last-writer-wins. An older web client shows the chip with the path and no link (its `originOf` accepts any kind string and its `openOrigin` opens only `http(s)`), which is a safe degradation; an older server refuses the op as invalid, so writers check the server version first.
- **E2EE:** `task.origin` is already a content field (`internal/e2ee.ContentFields`, `OBJECT_CONTENT` in `web/src/lib/e2ee.ts`); nothing to add. The server cannot validate an encrypted origin, so the device-side guard is the one that matters for encrypted accounts.
- **API, CLI, MCP:** `PATCH /api/v1/tasks/{id}` and `POST /api/v1/tasks`, the CLI (which passes `origin` through) and the agent tools accept the new kind through the one validation in `internal/origin`; `docs/api.md` lists it. MCP task views show it like other origins, as untrusted text.
- **CalDAV and vault:** CalDAV does not map origins (unchanged). The vault already writes `[origin:: <url or id>]` read-only; an `obsidian` origin writes its `obsidian://` URL there, which Obsidian renders as a clickable link.
- **Shells:** Android `MainActivity`'s and iOS `Bridge`'s external-link allow-lists gain `obsidian` for the `open` action only; `capabilities` gains `obsidian-links`.
- **Size:** a few dozen lines in Go and TypeScript; no dependency, no measurable bundle or binary change.
