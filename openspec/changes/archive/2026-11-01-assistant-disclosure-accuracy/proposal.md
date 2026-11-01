# Proposal

## Why

The assistant's consent disclosure ("What may be sent", `consentFields` in `internal/httpapi/assistant.go`) no longer matches what the assistant sends:

- **Describe it** (`routines-describe-it` D2) sends the names of saved views and the hosts of webhooks as context for a draft. Its design says these are "the fields the consent disclosure already lists", but the list names neither.
- The server's assistant offers every read tool of the shared registry. Since the list was written, the registry gained notes (`list_notes`, `search_notes`, `get_note`), tracked time (`list_time_entries`), routines and their runs, calendar frames and workspaces, and `get_task` returns custom fields, locations, origins, estimates and recurrence. None of these is listed.
- The app's list says nothing of attachments, while `docs/assistant-privacy.md` says their names, types and links are sent.
- The routines paragraph (`routines-ai-step` D10) leaves out that an Ask AI step sends its instruction and can read a whole project (name, sections, open tasks).
- The on-device assistant of an encrypted account shows the server's list, though its own read tools return only tasks, comments and projects.
- The list is shown in English in every language: the server sends English strings and the app prints them as they are.

## What Changes

- The server's list names everything its assistant may send, and a test fails when a read tool is added without an entry that covers it.
- `GET /api/v1/me/assistant` returns a shorter list in `mode: "device"`: what the on-device assistant sends.
- The routines paragraph names the step's instruction and a project as context.
- The app shows every entry in the reader's language (`web/src/lib/assistantDisclosure.ts`, all six languages); a test keeps the server's lists and the app's in step.
- `DisclosureVersion` becomes 4. Earlier consents keep counting (design D2).
- `docs/assistant-privacy.md` and `docs/api.md` say the same.

Out of scope: changing what the assistant sends (no tool is removed or narrowed), MCP connectors (they have their own token and switches), the routines consent itself.

Advances no ROADMAP item; follows up `routines-describe-it` (PR #745).
