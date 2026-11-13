## ADDED Requirements

### Requirement: Habits in links
While Habits is on, the `[[` picker SHALL show a habit with the habit mark and its kept measure ("6 of 7") instead of the task mark, in the tasks group, and a link to a habit SHALL render with the habit mark. The stored link SHALL stay the task link `[Run](?task=<id>)`, so plain-text readers, the API and older clients see an ordinary task link. While Habits is off or not decided, a habit SHALL show as a task in the picker and in links.

#### Scenario: Link the habit from a plan
- **WHEN** the user types `[[run` in the note "Running plan" and chooses Run
- **THEN** the picker showed Run with the habit mark and "6 of 7", the note shows a link with the habit mark, and Run's page lists "Running plan" under Linked references

#### Scenario: Off
- **WHEN** Habits is off and the user types `[[run`
- **THEN** Run is listed and linked as a task
