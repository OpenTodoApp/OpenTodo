## ADDED Requirements

### Requirement: Notes terms
`notes` SHALL match tasks whose note is not empty, `no notes` tasks whose note is empty, and `notes: text` (quotes allowed, case ignored) tasks whose note contains the text. `notes:` without text SHALL be an error. All three SHALL be keywords in the published grammar, accepted by the server's validation of saved views, and evaluated on the device from local data, over the decrypted note on an encrypted account, with the same open-only default as every other term, offline included; `notes` SHALL be a reserved word. The terms SHALL match tasks only, never standalone notes. The TypeScript and Go parsers SHALL share their test queries.

#### Scenario: Tasks with notes in a project
- **WHEN** the user enters `notes & #Renovation`
- **THEN** the open tasks of "Renovation" that have a note are listed

#### Scenario: Text in the note
- **WHEN** the user enters `notes: "permit office"`
- **THEN** open tasks whose note contains "permit office" in any letter case are listed, and a task with those words only in its title is not

#### Scenario: Missing text
- **WHEN** the user enters `notes:`
- **THEN** the query is not run and the error asks for text after `notes:`

#### Scenario: Saved and offline
- **WHEN** the user saves `no notes & p1` as a view and opens it later on an offline device
- **THEN** the server accepts the view, and the device lists the open priority-1 tasks without a note from local data

#### Scenario: Reserved word
- **WHEN** a project defines a custom field named "Notes" and the user enters `notes`
- **THEN** the term is the notes keyword, and the field is reachable only through its quoted name
