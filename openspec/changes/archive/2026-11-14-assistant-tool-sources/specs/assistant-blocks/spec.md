## ADDED Requirements

### Requirement: Tool sources in the answer
Each successful call of `list_tasks`, `search_tasks`, `get_task`, `today_summary` or `list_projects` in an in-app assistant turn, on the server and on the device, SHALL add a source to the answer at the point where the call ran. A source SHALL hold the kind (`tasks` or `projects`), the ids the tool's result returned in its order (at most 50) and their total, never a title or other content. It SHALL travel as its own stream event, which a client that does not know it skips, and SHALL be stored with the message like a block: on the device only, never synced, cleared with the conversation and at sign-out. A source SHALL not count toward the turn's block limit, SHALL not be announced while the answer streams, and SHALL be left out of Copy. A failed call SHALL add no source.

The answer SHALL show each source as one line, closed by default, reading "Looked at n tasks" (or projects), or "No tasks found" (or projects) when the result was empty. Opening it SHALL list the stored ids' rows from the device's current local data, decrypted on an encrypted account and available offline, each opening its task or project; a row no longer there SHALL read "Removed", and more ids than stored SHALL end the list with "and n more".

#### Scenario: Tasks the tool returned
- **WHEN** a consented user asks "what's overdue?" and the model calls `list_tasks`, which returns three tasks, and then writes its answer
- **THEN** the turn route streams a source event with kind `tasks`, the three ids and total 3 and no title, and the answer shows "Looked at 3 tasks" above the text written after the call, which opens to the three tasks' titles from the device

#### Scenario: An invented row
- **WHEN** the model's text names a task that no tool returned
- **THEN** that task is in no source line of the answer

#### Scenario: Empty result
- **WHEN** `search_tasks` returns no task
- **THEN** the answer shows "No tasks found" where the call ran, with nothing to open

#### Scenario: Failed call
- **WHEN** `get_task` is called with an unknown id and returns an error result
- **THEN** no source is added

#### Scenario: Encrypted account
- **WHEN** an encrypted account's on-device assistant calls `list_projects`
- **THEN** the device adds the same source with the returned project ids, and the opened line shows the decrypted project names

#### Scenario: Older client
- **WHEN** a client that does not know the source event receives one
- **THEN** it skips the event and the rest of the answer reads as before
