# Spec Delta

## ADDED Requirements

### Requirement: Wildcard names
In a label (`@`), project (`#`, `##`) or section (`section:`) term, bare or quoted, each `*` SHALL match any run of characters, none included, ignoring case as names do; the term SHALL match every live item whose name fits, resolved every time the query runs, so an item created or renamed later is included. In those names, bare or quoted, `\*` SHALL be a literal star and `\\` a literal backslash, any other backslash being itself, and a picker that inserts a real name SHALL escape its backslashes and stars. A name that is exactly the name of a live item SHALL mean that item only, before any wildcard reading, so a query saved before wildcards keeps its meaning without a migration. `##` with a pattern SHALL add the sub-projects of every project that fits. A pattern that fits no live name SHALL match no task and the device SHALL warn, as for an unknown name; the server SHALL still accept the query. Patterns SHALL be matched without building a regular expression, in time linear in the name for each piece of the pattern. Evaluation SHALL stay on the device from local data, offline included; a query is plain text, so a saved view converges like any other. The TypeScript and Go evaluators SHALL share their wildcard queries and list the same tasks for them.

#### Scenario: Prefix picks up a new label
- **WHEN** labels "backlog-quick" and "backlog-delayed" exist, the user saves `@backlog*` as a view and later creates "Backlog-later"
- **THEN** the view lists the open tasks carrying any of the three labels

#### Scenario: Projects and their sub-projects
- **WHEN** "Work" contains "Reports", a project "Home" exists and the user enters `##W*`
- **THEN** open tasks of "Work" and of "Reports" are listed, while `#*s` lists only those of "Reports"

#### Scenario: Section pattern
- **WHEN** two projects have sections "Review" and "review" and the user enters `section: rev*`
- **THEN** the open tasks in either section are listed

#### Scenario: Literal star
- **WHEN** labels "to*do" and "to-do" exist and the user enters `@to\*do`
- **THEN** only tasks carrying "to*do" are listed, while `@T*DO` lists tasks carrying either

#### Scenario: A saved query keeps its meaning
- **WHEN** a view saved before wildcards reads `@to*do`, and labels "to*do" and "to-do" exist
- **THEN** the view lists only the tasks carrying "to*do", and lists those carrying "to-do" too only once no label is named "to*do"

#### Scenario: A backslash before a wildcard
- **WHEN** labels "C:\temp" and "C:temp" exist and the user enters `@C:\\*`
- **THEN** only tasks carrying "C:\temp" are listed

#### Scenario: No match
- **WHEN** no label name starts with "x" and the user enters `@x*`
- **THEN** no task is listed and the device warns that no label has that name

#### Scenario: Picking a name with a star
- **WHEN** the user ticks the label "to*do" in a calendar filter's label list
- **THEN** the query reads `@to\*do`, and a label named "a\b" is written `@a\\b`

#### Scenario: Both evaluators
- **WHEN** the shared wildcard queries are run by the Go and the TypeScript evaluators
- **THEN** every query lists the same tasks on both sides
