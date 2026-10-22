# Spec Delta

## ADDED Requirements

### Requirement: Rules resource
`opentodo://rules` SHALL be a read-only resource listing the caller's rules (OpenSpec `automation-rules`) with `id`, `name` (through the encrypted-content display rule), `enabled`, `paused_reason`, `trigger`, `condition` and `actions`, under the same owner switch, token rules and limits as the other resources. No tool SHALL create, change, run or delete a rule.

#### Scenario: Read the rules
- **WHEN** an assistant reads `opentodo://rules` with a `read` token while MCP is enabled
- **THEN** it receives the rule list with structural values and names marked as untrusted text

#### Scenario: No write tool for rules
- **WHEN** an assistant with an `agent` token lists the available tools
- **THEN** no tool names a rule, and a `create_rule` call is answered with an unknown-tool error
