# Changelog

All notable changes to OpenTodo are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Live push of changes between devices (OpenSpec change `realtime-sync-channel`): an authenticated server-sent event stream at `GET /api/v1/sync/events` wakes a user's other devices as soon as operations are recorded by another device or through the REST API. The wake-up carries only the latest cursor; data still flows through the sync exchange. The web app reconnects with backoff, syncs on every reconnect, relaxes polling to 5 minutes while connected and falls back to 30 s polling otherwise; the status pill shows **Live** or **Polling**. No new dependency or configuration; see `docs/sync.md` and the proxy notes in `docs/self-hosting/`.
- OpenSpec changes drafted for every roadmap item (35 changes, 33 new capabilities plus deltas to existing ones), all passing strict validation. Nothing is implemented yet; each is a planning artifact for `/opsx:apply`.
- Walking skeleton (OpenSpec change `bootstrap-core-platform`): Go + SQLite server with embedded React PWA, local-first storage, field-level conflict-free sync, owner setup and sessions, API tokens, REST API with write-through to the op log, JSON export, single distroless container, Coolify-ready compose file, CI pipeline.
