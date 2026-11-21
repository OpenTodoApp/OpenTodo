# Spec Delta

## MODIFIED Requirements

### Requirement: Obsidian note links leave the shell
A shell that lists the capability `obsidian-links` SHALL accept, through its external-link method, an Obsidian note link of the exact form the `task-management` "Origin validation" requirement defines (`obsidian://open` with only `vault` and `file`) and hand it to the operating system, which opens Obsidian or does nothing when Obsidian is not installed. Every other `obsidian:` URL, and every other custom scheme, SHALL still be refused; the external-link allow-list otherwise stays `https`, `http`, `mailto` and `tel`, and on Android also a `geo:` point of the form `geo:<lat>,<lon>` or `geo:<lat>,<lon>?q=<lat>,<lon>` with coordinates in range, which the Android shell SHALL hand to the maps app and, when no app opens it, open as the same point on openstreetmap.org in the browser. The shell SHALL NOT navigate its web view to an `obsidian:` URL. The check SHALL be a pure function covered by each shell's unit tests and by the shared bridge fixtures.

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

#### Scenario: Open in maps from the Android app
- **WHEN** the user taps "Open in maps" on a task's location with coordinates in the Android app
- **THEN** the phone's maps app opens at that point, or the browser opens it on openstreetmap.org when no maps app is installed, and the web view stays on the task

#### Scenario: Another geo link refused
- **WHEN** a page hands the Android shell `geo:0,0?q=pizza`
- **THEN** the shell opens nothing

## ADDED Requirements

### Requirement: Position for the web app
The Android shell SHALL answer a page's request for the device's position: for a page of the configured server it SHALL ask Android for location (precise or approximate) the first time, and not before, and SHALL give the page the position when either is allowed; it SHALL refuse a page of any other origin without a prompt, and SHALL NOT let the web view keep the answer, so a later refusal in the system settings holds. The Google Play build, which declares no location permission, SHALL refuse without asking. The decision SHALL be a pure function covered by the shell's unit tests. This requirement touches no synced data: the position goes only to the page, which writes it as an ordinary location edit, offline as online.

#### Scenario: Use my location in the Android app
- **WHEN** the person chooses "Use my location" in the Android app for the first time and allows location
- **THEN** Android asks once, and the task's location gets the device's coordinates

#### Scenario: Location refused
- **WHEN** the person refuses Android's location prompt
- **THEN** the editor says the browser did not share the position and nothing is written

#### Scenario: Another origin
- **WHEN** a page of another origin loaded in the shell asks for the position
- **THEN** it is refused and Android does not ask
