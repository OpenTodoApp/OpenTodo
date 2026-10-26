## MODIFIED Requirements

### Requirement: Recognised issue links
A link in a note or comment whose address is a GitHub, GitLab, Jira or Linear issue, recognised on the device the way a task's origin is, SHALL render as an inline issue chip (`o/r#7`, `ENG-123`) that opens the issue in a new tab; recognition SHALL use the address alone and SHALL make no request. Every other link renders as a link.

#### Scenario: Issue chip
- **WHEN** a note contains `https://github.com/OpenTodoApp/OpenTodo/issues/198`
- **THEN** it renders as a chip reading `OpenTodoApp/OpenTodo#198`, no request leaves the device, and the projection keeps the plain address
