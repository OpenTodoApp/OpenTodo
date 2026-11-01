# Design

## Context

The disclosure is the list `consentFields` (`internal/httpapi/assistant.go`), returned as `fields` by `GET /api/v1/me/assistant` and shown by `AssistantConsent` (`web/src/app/assistant/AssistantConsent.tsx`), plus the paragraph `RoutinesDisclosure`. Consent is stored per user in `assistant_consent` with `disclosure_version` and `routines_version` (`internal/assistant/config.go`). `DisclosureVersion` is "bumped whenever the consent text changes materially"; consents from `MinDisclosureVersion` (1) to `DisclosureVersion` count. Version 2 (photos) did not ask again; version 3 (routines) needed a separate routines consent for AI steps.

## Decisions

**D1. Audit, path by path.**

| Path | Sends | Before | Now listed as |
| --- | --- | --- | --- |
| Server assistant, read tools | tasks (title, description, due, recurrence, priority, estimate, completion, custom fields, location, origin), comments, attachments' name/type/link, notes, projects with descriptions and workspaces, routines and runs, frames, time entries with notes, member and group names | tasks, projects, comments, members | one entry each |
| Describe it (server and device) | the sentence, project/section/label names, saved view names, webhook hosts | not listed | "saved view names and the hosts of your webhooks, when you describe a routine" |
| Ask AI / Summarise step | its instruction, text, lines, tasks (title, due, priority, labels, project), a project (name, sections, open tasks) | instruction and project missing | in the routines paragraph |
| On-device assistant | tasks (title, description, due, recurrence, priority, estimate, completion), comments, projects with descriptions, Describe it names, the turn's context, photos | the server's list | its own list (`deviceConsentFields`) |

**D2. Version 4 without asking again.** No spec requires consent again when the text changes; the code's rule is to raise `MinDisclosureVersion` only when a consent must be renewed, and version 2 set the precedent of a wider text that keeps earlier consents. This change corrects the description of data the assistant already sent; it sends nothing new. Asking every user to accept again would interrupt everyone, and the routines AI steps (which run unattended) would stop until each person returned. So `DisclosureVersion` becomes 4 (the text changed materially, and a consent records which text it accepted), `MinDisclosureVersion` stays 1, and `RoutineDisclosureVersion` stays 3. Whether users who consented before should be asked again is recorded as an owner question; raising `MinDisclosureVersion` to 4 would do it.

**D3. Translation on the client.** The server keeps returning English strings (API compatibility). `web/src/lib/assistantDisclosure.ts` lists every entry with `msg()`, so the catalogues carry them, and the consent shows `t(entry)` (an unknown entry as sent). A Go test reads that file and fails when an entry of either server list is missing.

**D4. The list follows the registry.** A Go test lists the read tools the server's assistant gets (`agenttools.Registry.Definitions` with the assistant's caller) and maps each to the entry that covers it; a new read tool without a mapping fails the test.

## Data model impact

None. `disclosure_version` is a number in an existing table and response.

## Size and memory

No dependency. The list adds about 0.5 KB to the assistant's lazy chunk; first load unchanged.

## Interface budget

The consent's list gains entries inside the existing panel: no chrome row, sidebar destination, scroll region or shortcut is added.
