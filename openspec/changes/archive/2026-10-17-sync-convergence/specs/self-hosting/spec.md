## MODIFIED Requirements

### Requirement: Schema migrations
The server SHALL apply embedded database migrations automatically at startup and SHALL refuse to start if a migration fails. It SHALL record the name of every applied migration file, and SHALL log an error naming any file numbered below an applied migration that was never applied, instead of skipping it silently. The repository checks SHALL fail a change that adds a migration not numbered above every migration on the main branch.

#### Scenario: Upgrade
- **WHEN** a newer image starts against a data directory from an older version
- **THEN** pending migrations run before the server accepts requests

#### Scenario: Migration merged below the current version
- **WHEN** the server starts with a migration file numbered below the database's version that was never applied
- **THEN** it logs an error naming that file
