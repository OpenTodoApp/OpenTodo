## ADDED Requirements

### Requirement: Upgrades from released versions keep the data
CI SHALL check, at least nightly and on every pull request that changes the database schema, the op log or accounts, that a data directory written by released versions is upgraded by the current build without loss: for each checked release, that release's own published server binary SHALL write an account's data through its API, and the current build started on the same data directory SHALL migrate it to its newest schema version, accept the account's existing password and API token, return every row, field and op the release returned, and accept new writes. The checked releases SHALL include the three newest releases and the oldest release that published a server binary.

#### Scenario: A migration loses a column
- **WHEN** a change adds a migration that rebuilds the tasks table without the `deadline` column
- **THEN** the upgrade check fails naming the task and the field whose value changed

#### Scenario: Tokens stop working after an upgrade
- **WHEN** a change alters how API tokens are stored without migrating existing tokens
- **THEN** the upgrade check fails because the token created by the release is refused

#### Scenario: A new release
- **WHEN** a new version is released
- **THEN** the next nightly run checks the upgrade from it without any change to the repository
