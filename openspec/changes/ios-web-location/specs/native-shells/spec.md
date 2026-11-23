# Spec Delta

## MODIFIED Requirements

### Requirement: Position for the web app
The Android shell SHALL answer a page's request for the device's position: for a page of the configured server it SHALL ask Android for location (precise or approximate) the first time, and not before, and SHALL give the page the position when either is allowed; it SHALL refuse a page of any other origin without a prompt, and SHALL NOT let the web view keep the answer, so a later refusal in the system settings holds. The Google Play build, which declares no location permission, SHALL refuse without asking. The decision SHALL be a pure function covered by the shell's unit tests. The iOS shell SHALL declare the app's location use while in use, so a secure page (https or localhost) of the configured server gets the position after iOS asks for the app's location the first time; in every document of another origin that WebKit runs the app's scripts in, it SHALL replace the page's geolocation, before the page's own scripts run, with one that refuses at once without a prompt, and its first-run sign-in screen and background run SHALL do so for every page; that script SHALL be covered by the shell's unit tests, including a frame's `Navigator.prototype` getter called on the page's own navigator. Two known limits SHALL be named in the tests and in the change that adds them: WebKit runs no app script in a frame's first empty document, so a page can still reach WebKit's geolocation through that frame's own `navigator.geolocation`, or through that frame's `Navigator.prototype` getter called on its own navigator; only sign-in pages and the server's own pages can reach them: in the shell, a sign-in provider's pages and the frames they embed; in the first-run sign-in screen, the address the person chose to sign in on and the pages of that sign-in; in the background run, the server's page. This requirement touches no synced data: the position goes only to the page, which writes it as an ordinary location edit, offline as online.

#### Scenario: Use my location in the Android app
- **WHEN** the person chooses "Use my location" in the Android app for the first time and allows location
- **THEN** Android asks once, and the task's location gets the device's coordinates

#### Scenario: Use my location in the iPhone app
- **WHEN** the person chooses "Use my location" in the iPhone app for the first time and allows location while using the app
- **THEN** iOS asks for the app's location, and the task's location gets the device's coordinates

#### Scenario: Location refused
- **WHEN** the person refuses Android's location prompt
- **THEN** the editor says the browser did not share the position and nothing is written

#### Scenario: Another origin
- **WHEN** a page of another origin loaded in the shell asks for the position
- **THEN** it is refused and Android does not ask

#### Scenario: Another origin in the iPhone app
- **WHEN** a sign-in provider's page loaded in the iPhone app asks for the position
- **THEN** it is refused at once and iOS does not ask

#### Scenario: A frame's getter in the iPhone app
- **WHEN** a sign-in page of another origin calls a frame's `Navigator.prototype` geolocation getter on its own navigator, and WebKit ran the app's scripts in that frame
- **THEN** it is refused at once and iOS does not ask
