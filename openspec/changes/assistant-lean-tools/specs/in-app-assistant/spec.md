# Spec Delta

## ADDED Requirements

### Requirement: Write tools on request
A turn without a skill SHALL first offer the read and display tools and `propose_changes`. After the model calls `propose_changes`, later rounds of that turn SHALL also offer the write tools. Proposals, limits and review are unchanged. The server and the device behave the same.

#### Scenario: A question reads only
- **WHEN** the user asks "what is due today?"
- **THEN** the model calls are offered no write tool and the answer proposes nothing

#### Scenario: A change is asked for
- **WHEN** the user asks "move everything overdue to Friday"
- **THEN** the model calls `propose_changes`, the next round offers `schedule_tasks`, and the turn ends with a change set
