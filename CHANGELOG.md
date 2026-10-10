# Changelog

All notable changes to OpenTodo are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Invitations (OpenSpec change `invitations`): the owner creates single-use, expiring invitation links in **Settings → Members**, optionally bound to an email, lists them with status (pending, accepted, expired, revoked) and revokes pending ones. Invitees accept at `/invite/<token>` while sign-up stays closed. New routes `GET/POST /api/v1/invitations`, `DELETE /api/v1/invitations/{id}`, public `GET /api/v1/invitations/{token}`, and an optional `invitation` field on `POST /api/v1/auth/register`. Migration `0002_invitations.sql`.
- OpenSpec changes drafted for every roadmap item (35 changes, 33 new capabilities plus deltas to existing ones), all passing strict validation. Nothing is implemented yet; each is a planning artifact for `/opsx:apply`.
- Walking skeleton (OpenSpec change `bootstrap-core-platform`): Go + SQLite server with embedded React PWA, local-first storage, field-level conflict-free sync, owner setup and sessions, API tokens, REST API with write-through to the op log, JSON export, single distroless container, Coolify-ready compose file, CI pipeline.
