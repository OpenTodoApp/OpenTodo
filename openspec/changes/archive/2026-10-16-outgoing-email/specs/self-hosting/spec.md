# Spec Delta

## MODIFIED Requirements

### Requirement: Optional configuration only
Every setting SHALL be an `OPENTODO_*` environment variable with a working default: `ADDR`, `DATA_DIR`, `BASE_URL`, `ALLOW_SIGNUP`, `SESSION_DAYS`, `LOG_LEVEL`. Outgoing email is configured by the optional `OPENTODO_SMTP_HOST`, `_SECURITY`, `_USER`, `_PASSWORD` (or `_PASSWORD_FILE`) and `_FROM`; `HOST` and `FROM` are required together, `USER` and a password together, and each one set locks its field in Settings. Invalid values SHALL stop startup with a clear message, except `OPENTODO_TRUSTED_PROXIES`, whose invalid entries are ignored with a warning (requirement "Lenient trusted proxies").

#### Scenario: Invalid value
- **WHEN** `OPENTODO_SESSION_DAYS=abc` is set
- **THEN** the process exits non-zero with a message naming the variable

#### Scenario: Partial SMTP configuration
- **WHEN** `OPENTODO_SMTP_HOST` is set without `OPENTODO_SMTP_FROM`, or `OPENTODO_SMTP_USER` without a password
- **THEN** the process exits non-zero with a message naming the missing variable

#### Scenario: SMTP from the environment only
- **WHEN** `OPENTODO_SMTP_HOST=smtp.example.com:587` and `OPENTODO_SMTP_FROM=todo@example.com` are set and nothing was stored in Settings
- **THEN** outgoing email is configured with STARTTLS, the authentication status reports it enabled, and the Outgoing email panel shows both fields as managed by the environment

#### Scenario: Password from a file
- **WHEN** `OPENTODO_SMTP_PASSWORD_FILE` names a readable file
- **THEN** its content without the trailing line break is the password and it never appears in the process environment listing of a child or in logs
