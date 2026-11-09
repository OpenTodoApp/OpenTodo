# Spec Delta

## MODIFIED Requirements

### Requirement: Display tools are for the in-app assistant only
Display tools SHALL be offered to the in-app assistant and, while the owner's MCP switch is on, to MCP clients that announce support for the MCP Apps extension. They SHALL never be offered to clients without it, to routines' AI steps, or to an agent token outside MCP. A skill SHALL offer only the display tools its definition lists.

#### Scenario: Skill without display tools
- **WHEN** a turn runs a skill whose definition lists no display tool
- **THEN** the model is offered no display tool in that turn

#### Scenario: Not offered to MCP
- **WHEN** an MCP client that does not announce the Apps extension lists the server's tools with an `agent` token
- **THEN** none of the display tools is listed

#### Scenario: Same tools on the device
- **WHEN** an encrypted account runs an on-device turn
- **THEN** the device offers the same display tools with the same schemas as the server's assistant

#### Scenario: Offered to an Apps-capable client
- **WHEN** an MCP client that announces the Apps extension lists tools
- **THEN** the display tools are listed with their schemas
