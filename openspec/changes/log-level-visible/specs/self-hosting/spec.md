## ADDED Requirements

### Requirement: The log names its level
The server's startup line SHALL include the log level in effect (`log_level=debug|info|warn|error`). With `OPENTODO_LOG_LEVEL=debug` the server SHALL also log, at startup and at debug level, a line saying that debug logging adds one line per API request.

#### Scenario: Debug is visible before any request
- **WHEN** the server starts with `OPENTODO_LOG_LEVEL=debug` and no request has been made yet
- **THEN** the log has the startup line with `log_level=debug` and a `level=DEBUG` line about request logging

#### Scenario: Info stays quiet
- **WHEN** the server starts with the default level
- **THEN** the startup line shows `log_level=info` and no debug line is written
