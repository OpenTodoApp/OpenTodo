# Changelog

All notable changes to OpenTodo are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Subtask trees (OpenSpec change `subtask-trees`): tasks nest to any depth through the existing `parent_id`; Project and Inbox views render the tree with per-device collapse, date views list subtasks flat with a parent breadcrumb; parents show `completed/total` progress over direct subtasks; completing a parent completes its open descendants and deleting one tombstones the subtree (reopen does not cascade); completing the last open subtask offers to complete the parent; `a` adds a subtask, Tab / Shift+Tab re-parent from the keyboard, and the detail panel has a subtask list and a parent picker; concurrent re-parenting converges with a deterministic, write-free cycle-breaking rule shared by every device; `POST`/`PATCH /api/v1/tasks` reject a parent that is missing, deleted, in another project or would form a cycle.
- OpenSpec changes drafted for every roadmap item (35 changes, 33 new capabilities plus deltas to existing ones), all passing strict validation. Nothing is implemented yet; each is a planning artifact for `/opsx:apply`.
- Walking skeleton (OpenSpec change `bootstrap-core-platform`): Go + SQLite server with embedded React PWA, local-first storage, field-level conflict-free sync, owner setup and sessions, API tokens, REST API with write-through to the op log, JSON export, single distroless container, Coolify-ready compose file, CI pipeline.
