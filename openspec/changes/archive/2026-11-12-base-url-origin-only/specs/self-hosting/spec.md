## MODIFIED Requirements

### Requirement: Optional configuration only
Every setting SHALL be an `OPENTODO_*` environment variable with a working default: `ADDR`, `DATA_DIR`, `BASE_URL`, `ALLOW_SIGNUP`, `SESSION_DAYS`, `LOG_LEVEL`. Invalid values SHALL stop startup with a clear message, except `OPENTODO_TRUSTED_PROXIES`, whose invalid entries are ignored with a warning (requirement "Lenient trusted proxies"). `OPENTODO_BASE_URL` SHALL be an origin: a scheme, a host, an optional port and an empty path or `/`, with no query or fragment; any other value SHALL stop startup with a message that names the variable and says OpenTodo needs its own origin, because it cannot be served below a path.

#### Scenario: Invalid value
- **WHEN** `OPENTODO_SESSION_DAYS=abc` is set
- **THEN** the process exits non-zero with a message naming the variable

#### Scenario: Base URL with a path
- **WHEN** `OPENTODO_BASE_URL=https://example.test/absproxy/18082/` is set
- **THEN** the process exits non-zero with a message naming `OPENTODO_BASE_URL` and saying that OpenTodo needs its own origin, such as a subdomain or a port

#### Scenario: Base URL with a trailing slash
- **WHEN** `OPENTODO_BASE_URL=https://todo.example.com/` is set
- **THEN** startup succeeds and the base URL is `https://todo.example.com`
