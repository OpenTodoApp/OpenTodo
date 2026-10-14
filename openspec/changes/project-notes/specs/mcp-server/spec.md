# Spec Delta

## ADDED Requirements

### Requirement: Project description in reads
`list_projects` and the `opentodo://projects/{id}` resource SHALL include each project's description as Markdown inside the project's untrusted-text object, with the encrypted placeholder and `encrypted: true` when it is ciphertext, and SHALL never include `notes_doc`. No write tool SHALL change a project's description in this version; `update_project` keeps accepting only `name` and `color`.

#### Scenario: Project brief visible to the assistant
- **WHEN** an assistant calls `list_projects` and a project's note begins with "Meet at gate B"
- **THEN** that project's entry carries the Markdown of the note under `untrusted_text.description`, next to its name

#### Scenario: Write refused
- **WHEN** an assistant calls `update_project` with a `description` argument
- **THEN** the call fails with an invalid-arguments error naming the unexpected argument and nothing is written
