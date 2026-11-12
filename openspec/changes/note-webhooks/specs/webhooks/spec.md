## ADDED Requirements

### Requirement: Note events
A webhook SHALL be able to subscribe to `note.created`, `note.updated` and `note.deleted` for standalone notes. They SHALL be derived from the winning operations of committed batches as other events are, by the same precedence (created, then deleted, otherwise updated), for every note the webhook's owner can read (their personal notes and the notes of projects shared with them); a restore from the Trash SHALL be a `note.updated` whose `changes` lists `deleted_at`. Operations that lose under last-writer-wins and batches written by an import or its undo SHALL produce no note event. Edits made offline SHALL produce events when the device syncs them. A project filter SHALL match a note whose project is the filter's project, or that moved into or out of it; a note without a project SHALL never match a filtered webhook. A webhook that does not subscribe to a note event SHALL receive nothing for notes. Task notes and project notes SHALL keep travelling as `description` in task and project events.

#### Scenario: Subscribe to note events
- **WHEN** a user with a `full` token POSTs a webhook with the events `note.created` and `note.updated`
- **THEN** the response is 201 and the webhook lists both events

#### Scenario: Unknown note event
- **WHEN** a user submits the event `note.trashed`
- **THEN** the response is 400 `invalid_input` naming the event, and nothing is stored

#### Scenario: Subscribe requires authentication
- **WHEN** a request without credentials creates a webhook subscribed to `note.created`
- **THEN** the response is 401 `unauthorized` and nothing is stored

#### Scenario: Existing webhooks unchanged
- **WHEN** a user whose webhook subscribes to every task event creates a standalone note
- **THEN** no delivery is queued for that webhook

#### Scenario: Offline note
- **WHEN** a user writes the note "Retro" on a phone without network and the phone syncs an hour later
- **THEN** one `note.created` is held from the time of the sync, and nothing was sent before it

#### Scenario: Project filter
- **WHEN** a webhook is limited to the project Work and a note in Home is created
- **THEN** no delivery is queued for that webhook

#### Scenario: Shared project member
- **WHEN** Anna, an editor of the shared project Renovation, has a webhook subscribed to `note.updated`, and the owner edits a note in Renovation
- **THEN** Anna's webhook receives one `note.updated` for it after the quiet window

#### Scenario: Restore from the Trash
- **WHEN** a note is restored from the Trash
- **THEN** one `note.updated` is delivered whose `changes.deleted_at` reads from the deletion time to null

### Requirement: Note events wait for quiet
A note event SHALL be held per webhook and note until the note has had no winning change for 5 minutes, and at most 30 minutes after its first held change, and SHALL then be queued as one delivery carrying the note's state at that moment and every field changed since the last delivered event, each with its first `from` and its latest `to`. A held `note.created` SHALL stay `note.created` when later batches change the note. `note.deleted` SHALL be queued at once and SHALL drop the note's held event. Held events SHALL be stored durably, so a restart loses none and releases them when due. Releasing SHALL run in the webhook job; delivery, retries, signing, the log and private network protection SHALL then be as for every other event.

#### Scenario: One sitting, one delivery
- **WHEN** a user creates a note, writes in it for 12 minutes with pauses under a minute, and stops
- **THEN** one `note.created` delivery is queued about 5 minutes after the last change, with the final title and text

#### Scenario: Long session
- **WHEN** a note is edited without a 5-minute pause for 40 minutes
- **THEN** a `note.updated` is queued 30 minutes after the first held change, and another after the next quiet or cap

#### Scenario: Deleted while held
- **WHEN** a note is edited and moved to the Trash two minutes later
- **THEN** one `note.deleted` is queued at once and no `note.updated` is sent for the edit

#### Scenario: Restart while held
- **WHEN** the server stops with a held `note.updated` and starts 10 minutes later
- **THEN** the event is queued after startup with the note's state at release

### Requirement: Note payload
A note event's `data.note` SHALL carry `id`, `title`, `description` (the note's Markdown), `project_id`, `labels`, `workspace_id`, `created_at`, `updated_at` and `deleted_at`, and never the editor document. `changes` SHALL list `title`, `labels`, `project_id` and `deleted_at` with `from` and `to`, and `description` as an empty object without values. For an encrypted account `title` and `description` SHALL be the stored ciphertext strings, as task fields are, and the server SHALL read no content. `source` and `device` SHALL be as for other events, so a routine's write carries `source: "rule"` and an assistant's a `device` starting with `agent:`. The Webhooks screen SHALL list the note events in a Notes group of its event picker, and on an encrypted account SHALL say beside them that titles and text arrive encrypted.

#### Scenario: Title change
- **WHEN** a note is renamed from "Trip" to "Lisbon trip" and its text is edited in one sitting
- **THEN** the `note.updated` body holds the note with title "Lisbon trip" and its Markdown, `changes.title` reads `{"from": "Trip", "to": "Lisbon trip"}` and `changes.description` is `{}`

#### Scenario: Encrypted account
- **WHEN** an encrypted account's webhook receives `note.created`
- **THEN** `data.note.title` and `data.note.description` are ciphertext envelopes, and the Webhooks screen said so when the events were chosen

#### Scenario: A routine's note
- **WHEN** a routine creates a note and the user's webhook subscribes to `note.created`
- **THEN** the delivery's `source` is `rule` and its `device` is `rule:<rule-id>`
