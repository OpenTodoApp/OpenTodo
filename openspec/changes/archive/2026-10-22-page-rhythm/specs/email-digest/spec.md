## ADDED Requirements

### Requirement: Digest words for tasks that are late
The digest SHALL head the list of open tasks due before the send day "Still open from earlier" and SHALL NOT use the word "overdue" or its translation in any of its languages; the list itself (up to 15 tasks with due date and project) and the digest's numbers are unchanged. The wording SHALL be pinned by the golden files of every language.

#### Scenario: Heading in English
- **WHEN** a user with two tasks due before the send day receives the digest in English
- **THEN** the section is headed "Still open from earlier" and lists the two tasks with their dates and projects

#### Scenario: Every language
- **WHEN** the digest is rendered in each of the six languages for the test fixture
- **THEN** no rendering contains the word "overdue" or its translation, and each matches its golden file
