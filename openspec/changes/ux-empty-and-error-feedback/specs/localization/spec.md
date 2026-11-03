## ADDED Requirements

### Requirement: Local refusal messages translated by known sentence

When an action fails with a local refusal, the client SHALL translate the source sentences a user can cause: project not found, parent project not found, task not found, parent task not found, not signed in, time entry not found, reminder time is required, and offset must be a whole number of minutes. A source sentence the catalogue does not know SHALL pass through verbatim, so a newer client on an older catalog remains usable.

#### Scenario: Known local refusal is translated

- **WHEN** a French user acts on a task whose project was deleted on another device and the client throws "project not found"
- **THEN** the toast reads "Ce projet n’est plus disponible." instead of the English sentence

#### Scenario: Unknown local refusal passes through

- **WHEN** the client throws a sentence absent from the catalogue
- **THEN** the toast shows that sentence unchanged
