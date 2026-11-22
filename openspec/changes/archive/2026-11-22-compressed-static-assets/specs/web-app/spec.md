## ADDED Requirements

### Requirement: The web app is sent compressed
The server SHALL send a built script, style sheet, SVG or Markdown file of the web app compressed with gzip, with `Content-Encoding: gzip`, when the request accepts gzip and asks for the whole file, and SHALL send the file as it is to a client that does not accept gzip and for a Range request. Every answer for a file that has a compressed form SHALL carry `Vary: Accept-Encoding`. The decoded bytes SHALL be exactly the file the signed list names. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: A first install
- **WHEN** a browser that accepts gzip installs the app from a self-hosted server
- **THEN** the scripts and styles arrive gzip-encoded and decode to the files of the signed list

#### Scenario: A client without gzip
- **WHEN** a client asks for a script without accepting gzip, or asks for a byte range of it
- **THEN** it receives the file as it is, with no `Content-Encoding`
