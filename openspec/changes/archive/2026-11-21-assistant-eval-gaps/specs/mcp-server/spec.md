# Spec Delta

## ADDED Requirements

### Requirement: Read tools name sections and match labels
`list_projects` and `opentodo://projects` SHALL carry each project's live sections in board order, each with its id, `flow_mode` and name marked as untrusted text, and SHALL leave the list out for a project without sections. `search_tasks` SHALL also match a task that carries a label whose name holds the query, or whose name the query is with a trailing `s` or `es`, ignoring case and a leading `#` or `@`. `list_tasks`' `label` SHALL, when no label has that name or id, find the labels whose name the argument is with a trailing `s` or `es`. Encrypted names SHALL never match. The rule SHALL only add matches and SHALL never stem a word otherwise. The on-device assistant's read tools SHALL apply the same rule, pinned by shared vectors. These are reads of synced data: they work on whatever a device has synced, change nothing and need no convergence.

#### Scenario: A board column is named
- **WHEN** an assistant calls `list_projects` for an account whose project "Website launch" has the sections "To do" and "In progress"
- **THEN** the project carries both sections in order with their ids, and the id of "In progress" can be passed to `show_board`

#### Scenario: A plural finds a label
- **WHEN** an assistant calls `search_tasks` with `query: "errands"` and three open tasks carry the label "errand"
- **THEN** the result holds those three tasks

#### Scenario: Other words are not stemmed
- **WHEN** an assistant calls `search_tasks` with `query: "commissioni"` and tasks carry the label "commissione"
- **THEN** the label does not match
