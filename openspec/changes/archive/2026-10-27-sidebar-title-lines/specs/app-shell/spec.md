## ADDED Requirements

### Requirement: Workspace control on two lines
While the workspace control shows both the instance's name and the workspace's name, it SHALL set them on two lines: the instance's wordmark first, at the size and tone the header row gives it, and the workspace's name below it, at the metadata size in the muted tone, each truncated on its own and with no separator between them. The header row SHALL stay one row of 40 px or less, and the control's accessible name SHALL be unchanged.

#### Scenario: One workspace on a branded instance
- **WHEN** the owner named the instance "Acme Family Tasks Server", the account has one workspace, and the sidebar is 256 px wide
- **THEN** the header shows "Acme Family Tasks Server" on the first line, cut with an ellipsis if it does not fit, and "Personal" in full on the second line, and the header row is at most 40 px high

#### Scenario: Several workspaces
- **WHEN** the account has the workspaces Personal and Work and Work is current
- **THEN** the control shows "Work" on one line with no instance name, as before

#### Scenario: Name for assistive technology
- **WHEN** a screen reader reaches the control of an account with one workspace
- **THEN** it is announced as "Workspace: OpenTodo · Personal"
