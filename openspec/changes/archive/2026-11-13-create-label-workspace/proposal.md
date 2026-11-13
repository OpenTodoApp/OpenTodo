# Proposal

## Why

An assistant can create projects and tasks in any of the user's workspaces, but `create_label` has no workspace argument, so every label lands in the default workspace (issue #1222). Tagging a task of another workspace with it works, but the label is missing from that workspace's Labels and filters, where the task lives. A label of the same name in the default workspace also made `create_label` return that one instead of creating one where it is needed.

## What Changes

- **`create_label`:** an optional `workspace_id`, a workspace id or exact name (as the read tools' `workspace`), default unchanged (the default workspace). A workspace the user does not belong to is an invalid argument. A label of the same name counts as existing only in that workspace.
- **Agent REST route:** `POST /api/v1/labels` with an agent token passes `workspace_id` on; sessions and full tokens already set the label field.
- **Label names on tasks:** a name labels of several workspaces share resolves to the label in the task's workspace (`create_tasks`, `update_tasks`).
- **Docs:** `docs/mcp.md`, `docs/api.md`.

The in-app assistant's device tools keep their arguments (they create in the default workspace, like `create_project` there).

## Capabilities

### Modified Capabilities

- `mcp-server`: "Workspaces in tools" gains `create_label`'s `workspace_id`.

## Out of scope

Prefix or parent matching of nested labels in the filter language (`@vpc/*`, the comment on #1222): a separate change of the filter grammar shared with the web app. A `list_labels` tool and a setting for the default workspace.

## Roadmap

A fix outside the roadmap's milestones (issue #1222).
