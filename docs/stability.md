---
title: Stability and compatibility
summary: What every 1.x release keeps: the v1 API, the sync protocol and op schema, the export format, MCP tools and the ot CLI; deprecation, upgrades and versioning.
audience: developer
section: Integrations
specs: [api-stability]
screens: []
order: 5
---
# Stability and compatibility

From 1.0 on, OpenTodo keeps its promises to the scripts, apps and assistants you connect to it. Within a major version (1.x) nothing you rely on is removed or changed incompatibly: things are only added. This page says what is covered, what may change, how a change that is not additive would be introduced, and how upgrades work.

## The v1 surface

These are covered by the promise:

- **The HTTP API**: every route under `/api/v1/` ([API reference](api.md)): its method and path, its request fields, its response fields, and the status and error code of each documented condition.
- **The error codes**: the `code` values of the error envelope `{"error":{"code","message"}}`.
- **The sync protocol**: `POST /api/v1/sync`, its request and response, the op envelope, and the op schema: every entity and field with its value kind ([sync protocol](sync.md)).
- **The export format**: `opentodo-export` version 1, as JSON and as a ZIP with attachments ([import and export](import-export.md)).
- **The MCP tools**: tool names, their argument names and types, and the fields of their results ([AI assistants](mcp.md)).
- **The `ot` command**: command names, flags, exit codes and the `--json` output ([command-line client](cli.md)).

Not covered: internal Go packages, the database tables (only upgrading them is promised, see below), the web app's screens and its browser storage, log lines, the human-readable (non-`--json`) output of `ot`, and the public demo's restrictions. CalDAV follows RFC 4791, and webhook payloads carry their own `version` field.

The surface is recorded in [`internal/httpapi/testdata/v1_surface.json`](../internal/httpapi/testdata/v1_surface.json), generated from the route table, the error codes, the op schema, the export, the MCP tool definitions and the `ot` schema. A test fails when anything recorded disappears or changes, so a breaking change cannot be merged by accident.

## What may change within 1.x

Only additions:

- new routes, and new optional request fields;
- new response fields;
- new error codes for new conditions;
- new op entities and fields;
- new values of an enumeration the docs call open (task origin kinds, notification channel kinds, rule actions);
- new MCP tools, and new optional arguments;
- new `ot` commands and flags;
- new members in the export.

These need a new major version (`/api/v2/`, export version 2, `ot` 2.x):

- removing or renaming anything listed above;
- changing a value's type or unit;
- making an optional field required;
- changing the status or error code of a documented condition;
- narrowing the values a field accepts;
- changing what a field means.

**Clients must ignore what they do not know**: unknown fields in a response, and unknown values of an open enumeration. The web app, the phone apps, `ot`, the browser extension and the Obsidian plugin already do.

## Deprecation

A route that will be replaced is first deprecated. It keeps working exactly as before and answers with two headers:

- `Deprecation: @<unix-seconds>` (RFC 9745): when it was deprecated;
- `Sunset: <date>` (RFC 8594): the earliest date it may stop being served, at least **12 months and two minor releases** after the release that deprecated it, whichever is later.

Its row in the [API reference](api.md#endpoints) is marked **deprecated** and names the replacement. Even after the sunset date, a v1 route is not removed while `/api/v1/` is served: removal only happens by serving a new major path next to it, with both served during the window. No route is deprecated in 1.0.

Op fields are never removed: the operation log is append-only and old operations must replay. A deprecated op field is still accepted and served for as long as the server speaks version 1 of the sync protocol.

## Upgrades

- Any release from **0.1.0** on upgrades **directly** to any 1.x release, and any 1.x to any later 1.x: no intermediate version is needed. Migrations run when the server starts ([updating](self-hosting/docker.md#updating)).
- Downgrades are not supported. A backup is taken before migrations run; restoring it is the way back ([backups](backups.md)).
- Devices that synced before the upgrade continue from where they were, without downloading everything again.

This is tested. For every released minor version there is a fixture: the data directory that version wrote while a fixed scenario ran against it (an owner and a second member, projects with sections, labels, tasks with due dates, subtasks, a repeating task, a completed and a deleted one, a reminder, a shared project, comments, an attachment, a time entry, an API token, and a second account with end-to-end encryption, each where the version had it). On every change, CI opens each fixture with the current server and checks that the migrations finish, that the server reports the same projects, sections, labels, tasks, reminders, time entries, members, comments and attachments as the old version did, that a sync from the start returns every operation, that a device continues from its cursor, that the export is valid, that the owner signs in with the password, that the API token still works and that the attachment is readable. A new minor release is not prepared without its fixture.

## Clients across versions

A 1.x server accepts sync and REST requests from every 1.x client: a web app still cached on a phone, the Android and iOS apps, `ot`, the browser extension and the Obsidian plugin, of any 1.x version.

This is tested too. The calls the web app's sync client (which the phone apps run), `ot` and the extension make were recorded against the server, with every session, token and password replaced by a placeholder. CI replays them in order against the current server and fails when a response has another status, or lacks a field the recording had or has it with another type. Fields added since are fine. The recordings are made once per major version and are never regenerated within it.

## The export format

Every 1.x server writes exports with `"format":"opentodo-export"` and `"version":1`, and imports every version 1 export written by any 0.x or 1.x release.

Each upgrade fixture keeps the export its version wrote, and CI imports every one of them into an empty account: every project, section, label, task, reminder and time entry must arrive, and workspaces other than the default one are created. Comments are not imported, as for any import of an export: a comment keeps its author, an account of the server that wrote the file. The import names how many it left out.

## Versioning

Releases follow [semantic versioning](https://semver.org):

- **MAJOR** (2.0.0) for any change this page does not allow within a major version;
- **MINOR** (1.1.0) for new features;
- **PATCH** (1.0.1) for fixes.

The container image tags follow the same rule: `1.2.3` is one release, `1.2` the latest patch of 1.2, `1` the latest 1.x release, and `stable` the latest release. Pin `1` to receive features and fixes without breaking changes.
