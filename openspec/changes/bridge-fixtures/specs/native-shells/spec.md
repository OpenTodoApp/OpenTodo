## ADDED Requirements

### Requirement: Shared bridge fixtures
The payloads the web app hands a shell (the reminder schedule, the widget data, and their sign-out reset) and the addresses a shell opens the app at (notification buttons, a task, quick add) SHALL be kept as fixture files in the repository, produced from the web app's own code and paired with what a shell must read from each. The web app's tests SHALL fail when the files no longer match what the web app produces, and SHALL check that the web app reads every address in them; each shell's unit tests SHALL parse the same files and build the same addresses.

#### Scenario: The web app renames a payload field
- **WHEN** a change renames `fireAt` in the reminder schedule the web app hands over
- **THEN** the web test fails until the fixtures are regenerated, and with the new fixtures the Android unit tests fail until the shell reads the new field

#### Scenario: The shell changes an address
- **WHEN** a change makes the Android shell open notification actions at another address
- **THEN** the Android unit test of the addresses fails against the shared fixture
