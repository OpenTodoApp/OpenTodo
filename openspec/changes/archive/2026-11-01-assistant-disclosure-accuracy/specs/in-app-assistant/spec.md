# Spec Delta

## MODIFIED Requirements

### Requirement: Per-user consent and own keys
Before a user's first turn, the app SHALL show which provider will receive their task content (for a member's own provider, that it goes with their key) and which fields may be sent, and SHALL record consent for that provider only through `PUT /api/v1/me/assistant`. If the owner allows it, users MAY store their own key there. Consent is server state, not an op.

The list of fields SHALL name everything the assistant may send for that user: for the server's assistant, task titles and descriptions; due dates, repeats, priorities, estimates and completion; custom fields, task locations and the links tasks came from; comments; the names, types and links of attachments (never the files); notes; workspace, project, section and label names and project descriptions; saved view names and webhook hosts when the user describes a routine; the user's routines and calendar frames; tracked time and its notes; names of members and groups of shared projects and workspaces; the user's display name, today's date and time zone; the messages typed; and photos added. For the on-device assistant (`mode: "device"`) it SHALL name only what the device sends: task titles and descriptions; due dates, repeats, priorities, estimates and completion; comments; project, section and label names and project descriptions; saved view names and webhook hosts when describing a routine; the display name, date and time zone; the messages; and photos. The paragraph on routines SHALL say that an Ask AI or Summarise step sends its instruction and what it reads, including a project's name, sections and open tasks. `GET /api/v1/me/assistant` SHALL return the list in English as `fields`, and the app SHALL show each entry in the reader's language. Every read tool the server's assistant can call SHALL be covered by an entry of the list. A disclosure that only describes data already sent SHALL raise `disclosure_version` without asking for consent again; a consent from version 1 on keeps counting.

#### Scenario: Consent required
- **WHEN** a user who has not consented sends `POST /api/v1/assistant/turn`
- **THEN** the response is 403 `consent_required` and no provider request is made

#### Scenario: Give consent
- **WHEN** the user reads the disclosure naming "Anthropic (Claude)" and accepts
- **THEN** `GET /api/v1/me/assistant` reports `consented: true` with the provider and disclosure version, and the composer is enabled

#### Scenario: Own key not allowed
- **WHEN** a member sends an own key while the owner has not allowed member keys
- **THEN** the response is 403 `forbidden` and nothing is stored

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls `PUT /api/v1/me/assistant`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Provider changed by the owner
- **WHEN** the owner switches the default provider from Anthropic to OpenAI after a user consented
- **THEN** the user's next turn is refused with `consent_required` until they accept a disclosure naming OpenAI

#### Scenario: Member switches provider
- **WHEN** a member who consented for Anthropic chooses their own Gemini provider
- **THEN** `consented` is false, accepting with provider `anthropic` answers 409 `provider_changed`, and the disclosure says the request goes from this server to Google Gemini with their key

#### Scenario: Disclosure covers every read tool
- **WHEN** the registry offers the server's assistant a read tool that returns notes, time entries, routines, frames or workspaces
- **THEN** the disclosure list names that data, and a test fails when a read tool is added without an entry

#### Scenario: On-device list
- **WHEN** an encrypted user in `mode: "device"` reads the disclosure
- **THEN** the list names task, comment and project data, the Describe it names and the turn's own context, and does not name notes, tracked time, routines or frames, which the device does not send

#### Scenario: Translated list
- **WHEN** a user whose language is Italian opens the disclosure
- **THEN** every entry of the list is shown in Italian

#### Scenario: Earlier consent after the correction
- **WHEN** a user who accepted disclosure version 3 opens the assistant after the disclosure moved to version 4
- **THEN** `consented` stays true and the composer is enabled
