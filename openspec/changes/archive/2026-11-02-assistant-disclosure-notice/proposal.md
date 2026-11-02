# Proposal

## Why

`assistant-disclosure-accuracy` (PR #762) made the assistant's "What may be sent" list complete and raised `DisclosureVersion` to 4, while consents from version 1 on keep counting (`MinDisclosureVersion` 1). People who accepted an older, shorter list therefore never see the complete one: the assistant keeps working, and nothing tells them that the list now names notes, tracked time, routines, frames, workspaces, custom fields, locations, attachment names and the Describe it context. The owner decided (2026-11-02) that they must not be asked to consent again, but must be told once.

## What Changes

- People whose consent names a disclosure older than version 4 see a one-time notice where they use the assistant: in the chat panel (the side sheet and the Assistant page), and on the Routines page when their consent covers routines' AI steps. It says the list is now complete and offers **Review the list** (shows the full list in place), **Turn off the assistant** (withdraws consent, as Settings → Integrations → Assistant does) and **Got it**.
- **Got it** records the disclosure version the person has seen, on the server, so the notice shows once across every device. It works the same for an encrypted account's on-device consent.
- `GET /api/v1/me/assistant` returns `disclosure_notice` and `consent.seen_version`; `POST /api/v1/me/assistant/disclosure-seen` records it.
- Nothing is paused: the assistant and routines' AI steps keep working while the notice is shown.
- `docs/assistant-settings.md` (with a pointer from `docs/assistant-privacy.md`) and `docs/api.md` describe the notice.

Out of scope: asking for consent again, changing what is sent, the MCP connectors, notices for later disclosure versions (a later correction raises `CompleteDisclosureVersion` to show it again).

Advances no ROADMAP item; follows up `assistant-disclosure-accuracy` (PR #762). No new environment variable, no op log change.
