# Spec Delta

## MODIFIED Requirements

### Requirement: No telemetry
The server and client SHALL make no network requests to third parties and SHALL collect no usage data. The only outbound requests the server makes SHALL be to destinations the owner or a user explicitly configured (such as a backup destination or a webhook endpoint), and none of them SHALL carry usage data beyond the configured payload.

#### Scenario: Network audit
- **WHEN** the app is used for a session with the network inspected and no integration is configured
- **THEN** every request goes to the server's own origin

#### Scenario: Only configured destinations
- **WHEN** the owner has configured a backup destination and the server's outbound traffic is inspected
- **THEN** every outbound request goes to that destination and to nothing else
