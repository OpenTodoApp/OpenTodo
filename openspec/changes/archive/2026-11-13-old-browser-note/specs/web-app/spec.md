## ADDED Requirements

### Requirement: A note for an engine too old for the app
Before the app's code runs, the page SHALL check for the CSS the interface needs (oklch and color-mix colours, container queries: Chrome and Android System WebView 111, Safari 16.4, Firefox 128). When it is missing, the page SHALL show a note instead of the app, in the browser's language when it is a shipped language and in English otherwise, naming the minimum versions and the engine version it found, and saying that on Android a browser with its own engine works where the system WebView cannot be updated. A current engine SHALL see no change.

#### Scenario: An old Android WebView
- **WHEN** the Android app opens a server on a phone whose system WebView reports Chrome 83 and the language is Chinese
- **THEN** the screen shows the note in Chinese with the minimum versions and "Chrome 83.0.4103.106", not a blank page

#### Scenario: A current browser
- **WHEN** a browser with the needed CSS opens the app
- **THEN** no note is shown and the app starts as before
