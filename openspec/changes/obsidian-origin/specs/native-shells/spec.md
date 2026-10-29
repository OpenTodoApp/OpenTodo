## ADDED Requirements

### Requirement: Obsidian note links leave the shell
A shell that lists the capability `obsidian-links` SHALL accept, through its external-link method, an Obsidian note link of the exact form the `task-management` "Origin validation" requirement defines (`obsidian://open` with only `vault` and `file`) and hand it to the operating system, which opens Obsidian or does nothing when Obsidian is not installed. Every other `obsidian:` URL, and every other custom scheme, SHALL still be refused; the external-link allow-list otherwise stays `https`, `http`, `mailto` and `tel`. The shell SHALL NOT navigate its web view to an `obsidian:` URL. The check SHALL be a pure function covered by each shell's unit tests and by the shared bridge fixtures.

#### Scenario: Open a note from the Android app
- **WHEN** the user taps the origin chip of a task whose origin is `{kind: "obsidian", id: "Daily/2026-10-29.md", url: "obsidian://open?vault=Notes&file=Daily%2F2026-10-29"}` in the Android app with Obsidian installed
- **THEN** Obsidian opens the note, and the shell's web view stays on the task

#### Scenario: Another action refused
- **WHEN** the web app, or a page script, calls the external-link method with `obsidian://new?vault=Notes&name=x`
- **THEN** the shell opens nothing and the web view does not navigate

#### Scenario: Obsidian not installed
- **WHEN** the user taps an Obsidian chip on an iPhone without Obsidian
- **THEN** nothing opens, the app stays as it was, and the chip's menu still offers "Copy link"

#### Scenario: Older shell
- **WHEN** a shell released before this change loads a web app that knows `obsidian-links`
- **THEN** the shell does not list the capability, the web app never calls the external-link method with an Obsidian link, and the chip offers "Copy link"
