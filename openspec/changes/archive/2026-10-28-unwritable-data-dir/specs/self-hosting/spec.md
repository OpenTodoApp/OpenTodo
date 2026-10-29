## ADDED Requirements

### Requirement: An unwritable data directory is explained
When the server cannot create its data directory or a file in it because of permissions, it SHALL stop with a message that names the directory, the numeric user and group the process runs as, and a command that gives the folder to that user (`chown -R <uid>:<gid> <host folder>`), with a link to the guide. It SHALL not start serving.

#### Scenario: Host folder owned by root
- **WHEN** the container starts with `/data` bound to a host folder owned by root
- **THEN** it stops, and its log says that `/data` is not writable for user 65532 (group 65532) and shows `chown -R 65532:65532` with the folder mounted at `/data` and the guide's address

#### Scenario: Writable directory
- **WHEN** the data directory is writable
- **THEN** the server starts as before and logs nothing about permissions
