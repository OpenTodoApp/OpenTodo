## ADDED Requirements

### Requirement: Project assistant access events
The server SHALL record `project.agent_access` whenever a project's "Keep away from AI assistants" switch changes, in the transaction of the change, with the acting account as actor, the project id and the values before and after (`allowed` or `kept_away`) in its details. The project's name and content SHALL never be recorded. Reads refused because of the switch SHALL NOT be recorded; a refused assistant write stays an `agent.write` failure as today.

#### Scenario: Switch turned on
- **WHEN** Alice, admin of the shared project "Client X", switches on "Keep away from AI assistants"
- **THEN** the log contains `project.agent_access` with Alice as actor, the project id, `from: allowed` and `to: kept_away`, and no project name

#### Scenario: No event without a change
- **WHEN** the switch is set to the value it already has
- **THEN** no event is recorded

#### Scenario: Refused read is not an event
- **WHEN** an assistant calls `get_task` on a task of a project kept away from assistants
- **THEN** the result is `not_found` and nothing is added to the audit log
