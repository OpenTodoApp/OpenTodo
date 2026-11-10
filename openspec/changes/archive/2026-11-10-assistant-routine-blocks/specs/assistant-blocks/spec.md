# Spec Delta

## MODIFIED Requirements

### Requirement: Display tools are for the in-app assistant only
Display tools SHALL be offered only to the in-app assistant and, limited to `show_tasks`, `show_calendar` and `show_deadlines`, to routines' Ask AI steps that answer in text, at most four blocks per run. They SHALL never be offered to MCP clients or to an agent token. A skill SHALL offer only the display tools its definition lists.

#### Scenario: Skill without display tools
- **WHEN** a turn runs a skill whose definition lists no display tool
- **THEN** the model is offered no display tool in that turn

#### Scenario: Not offered to MCP
- **WHEN** an MCP client lists the server's tools with an `agent` token
- **THEN** none of the display tools is listed

#### Scenario: Same tools on the device
- **WHEN** an encrypted account runs an on-device turn
- **THEN** the device offers the same display tools with the same schemas as the server's assistant

#### Scenario: A routine's AI step
- **WHEN** a routine's Ask AI step answering in text runs
- **THEN** it is offered `show_tasks`, `show_calendar` and `show_deadlines` and no other display tool

#### Scenario: Other AI steps
- **WHEN** a routine's Summarise step, or an Ask AI step answering in lines, runs
- **THEN** it is offered no tool
