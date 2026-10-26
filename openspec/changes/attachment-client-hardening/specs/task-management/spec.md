## ADDED Requirements

### Requirement: Origin links open only http(s)
The app SHALL make a task's origin chip a link, and open it from any command, only when the origin's URL as the device reads it, after any decryption, is `http` or `https`. Any other URL SHALL show the chip without a link. The server validates plaintext origins, but cannot check an encrypted one. This needs no connection and changes nothing that syncs.

#### Scenario: Encrypted origin with an unsafe scheme
- **WHEN** an encrypted account's task origin decrypts on the device to `javascript:alert(1)`
- **THEN** the chip shows without a link and activating it opens nothing

#### Scenario: Ordinary link
- **WHEN** a task's origin is `{kind: "url", url: "https://example.com/page"}`
- **THEN** the chip links to `https://example.com/page` in a new tab without referrer
