# Changelog

All notable changes to OpenTodo are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- OpenSpec changes drafted for every roadmap item (35 changes, 33 new capabilities plus deltas to existing ones), all passing strict validation. Nothing is implemented yet; each is a planning artifact for `/opsx:apply`.
- Walking skeleton (OpenSpec change `bootstrap-core-platform`): Go + SQLite server with embedded React PWA, local-first storage, field-level conflict-free sync, owner setup and sessions, API tokens, REST API with write-through to the op log, JSON export, single distroless container, Coolify-ready compose file, CI pipeline.
