## Purpose

Lets the owner or an admin of a project keep it, its sub-projects and everything in them away from every AI assistant surface for every member, as server-side access state next to membership, without touching sync, the export or ordinary API clients.

## ADDED Requirements

### Requirement: Keep a project away from AI assistants
Every project SHALL have a server-side switch "Keep away from AI assistants", off by default. It SHALL be settable by the project's owner, or by an admin when the project is shared, and readable by every member. It SHALL be account access state like membership: never an operation, never synced, never in the export, changed only with a connection, and unaffected by the project's own fields. A sub-project SHALL inherit the switch from the nearest ancestor that has it on, and SHALL report which ancestor it inherits from; the switch of a sub-project cannot turn an inherited exclusion off. Deleting, archiving or restoring the project SHALL leave the switch as it is; purging the project SHALL remove it.

#### Scenario: Owner keeps a personal project away
- **WHEN** the owner of the unshared project "Diary" switches it on
- **THEN** the project reads as kept away for that account at once, and no operation is written to any device

#### Scenario: Admin of a shared project
- **WHEN** Bob, an admin of "Client X", switches it on
- **THEN** every member of "Client X" sees it as kept away and every member's assistants lose sight of it from the next request on

#### Scenario: Editor cannot change it
- **WHEN** an editor of "Client X" tries to change the switch
- **THEN** the change is refused with 403 `forbidden` and the switch is unchanged

#### Scenario: Sub-project inherits
- **WHEN** "Client X" is kept away and has a sub-project "Client X / Invoices" with its own switch off
- **THEN** "Invoices" reads as kept away through "Client X", and its tasks are hidden from assistants like those of "Client X"

### Requirement: What the switch hides
While a project is kept away, every assistant surface SHALL behave as if the project and its sub-projects did not exist: their tasks, sections, comments, attachments, time entries, custom field definitions and values, counts and names SHALL be left out of every MCP tool result, resource and prompt whatever the token's scope, of the in-app assistant's reads and context, and of the agent REST routes; a search SHALL not match their text; `today_summary` and the Inbox, Today, Upcoming and every other view SHALL not count them; a write tool or agent REST write that names one of their entities, or that creates into one of them, SHALL fail as `not_found` or the matching `-32602`, indistinguishable from a deleted or foreign entity, and SHALL change nothing; `move_tasks` into or out of such a project SHALL fail the same way. Ordinary REST routes used with a session, a `full` or an `admin` token, CalDAV, calendar feeds, webhooks, public links, the export, the digest and sync SHALL be unaffected, because they are not assistants.

#### Scenario: Hidden from every read
- **WHEN** "Client X" is kept away and an assistant with a `read` token calls `list_projects`, `search_tasks` with a word from one of its titles, `today_summary` and reads `opentodo://projects/<client-x>`
- **THEN** the project is not listed, the search finds nothing in it, the counts leave its tasks out, and the resource read is a `-32002` resource-not-found error

#### Scenario: Write refused as not found
- **WHEN** an allowed assistant calls `complete_tasks` with a task id of "Client X" and a task id of "Home"
- **THEN** the result is the tool error `not_found` listing the "Client X" id and nothing is changed, "Home" included

#### Scenario: Create into an excluded project
- **WHEN** an allowed assistant calls `create_tasks` with `project_id` of "Client X"
- **THEN** the result is the tool error `not_found` naming that project id and no task is created

#### Scenario: Ordinary clients unaffected
- **WHEN** the same user lists tasks with a `full` token on `GET /api/v1/tasks`, syncs a phone and opens the project in Apple Reminders over CalDAV
- **THEN** every one of them shows the project and its tasks as before

#### Scenario: Switch turned off again
- **WHEN** the owner switches it off
- **THEN** the next assistant request sees the project and its tasks again, with nothing to re-sync

### Requirement: Agent access routes
`GET /api/v1/projects/{id}/agent-access` SHALL return `{kept_away: boolean, inherited_from: <project id> | null}` for a project the caller can see, and `PUT` with `{kept_away: boolean}` SHALL set the project's own switch. Both SHALL require a session or a `full` or `admin` token; `read` and `agent` tokens SHALL be refused with 403 `insufficient_scope`; a non-member or an unknown id SHALL be 404 `not_found`; a member who is neither the owner nor an admin SHALL be refused on `PUT` with 403 `forbidden`; a body that is not `{kept_away: boolean}` SHALL be 400 `invalid_input` naming `kept_away`. `GET /api/v1/me` SHALL carry `agent_excluded_projects`: the ids of every project the caller can see that is kept away, inherited ones included. Each change SHALL be audited as `project.agent_access`. On a demo instance `PUT` SHALL answer 403 `demo_restricted`.

#### Scenario: Owner sets the switch
- **WHEN** the owner sends `PUT /api/v1/projects/<id>/agent-access` with `{"kept_away": true}`
- **THEN** the response is 200 `{kept_away: true, inherited_from: null}` and an audit event is recorded

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls `GET /api/v1/projects/<id>/agent-access`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Agent token cannot clear it
- **WHEN** an `agent` token sends `PUT` with `{"kept_away": false}`
- **THEN** the response is 403 `insufficient_scope` and the switch is unchanged

#### Scenario: Non-member
- **WHEN** a user who is not a member of the project calls `GET` on its route
- **THEN** the response is 404 `not_found` that does not reveal the project's existence

#### Scenario: Invalid body
- **WHEN** the body is `{"kept_away": "yes"}`
- **THEN** the response is 400 `invalid_input` naming `kept_away`

#### Scenario: Demo instance
- **WHEN** a demo account sends `PUT` on the route
- **THEN** the response is 403 `demo_restricted`

### Requirement: The switch in the app
The share dialog of a project SHALL show a row "AI assistants" with the state **Allowed** or **Kept away** (and "through <parent>" when inherited) and, for the owner or an admin, a switch that changes it with a confirmation naming what it means for every member; the command palette SHALL offer "Keep away from AI assistants" and "Allow AI assistants" for the current project to the same people. The state SHALL be shown from a copy cached on the device, adopted on every sync like memberships, so it reads the same offline; changing it SHALL need a connection and say so when there is none. The assistant panel SHALL replace its view hint with "This project is kept away from assistants" while the user looks at such a project. No new sidebar marker, row chip or header action is added.

#### Scenario: Owner switches it on from the dialog
- **WHEN** the owner opens the share dialog of "Client X", switches on "Keep away from AI assistants" and confirms
- **THEN** the row reads "Kept away", every member's dialog reads the same after their next sync, and the audit log records it

#### Scenario: Offline
- **WHEN** a member opens the dialog of "Client X" without a network
- **THEN** the row still reads "Kept away" from the cached copy and the switch is disabled with a note that changing it needs a connection

#### Scenario: Keyboard only
- **WHEN** the owner opens the dialog with the share shortcut, tabs to the switch, presses Space and confirms with Enter
- **THEN** the switch changes without any mouse interaction

#### Scenario: Palette command on an inherited exclusion
- **WHEN** the owner opens the palette in "Client X / Invoices", which is kept away through "Client X"
- **THEN** the palette offers neither command for "Invoices" and the dialog says it is kept away through "Client X"
