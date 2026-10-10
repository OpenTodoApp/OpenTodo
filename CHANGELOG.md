# Changelog

All notable changes to OpenTodo are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Labels (OpenSpec change `labels`): a synced `label` entity (name, colour, position, soft delete) referenced by id from `task.labels`, so renaming is one operation and never rewrites tasks. Assign from the task detail panel or with `L` on a selected task (type-ahead, create on Enter, multi-select); chips on task rows; a collapsible Labels group in the sidebar with live open counts and a per-label view grouped by project (`g l` opens the overview); rename, recolour, reorder, delete (removes the id from every task) and merge of duplicates created concurrently on other devices. REST `/api/v1/labels` collection, task `labels` validated against existing labels, export gains `labels`. The whole-array convergence caveat of `task.labels` is documented in `docs/sync.md`. Client bundle +4.3 KB gzipped, no new dependencies.
- OpenSpec changes drafted for every roadmap item (35 changes, 33 new capabilities plus deltas to existing ones), all passing strict validation. Nothing is implemented yet; each is a planning artifact for `/opsx:apply`.
- Walking skeleton (OpenSpec change `bootstrap-core-platform`): Go + SQLite server with embedded React PWA, local-first storage, field-level conflict-free sync, owner setup and sessions, API tokens, REST API with write-through to the op log, JSON export, single distroless container, Coolify-ready compose file, CI pipeline.
