# Spec Delta

## ADDED Requirements

### Requirement: Launch screen until the page shows
A shell SHALL open on a launch screen in the web app's default canvas colour, light or dark with the phone's appearance, and SHALL keep it until the shell has something to show: the page of the server ready to be drawn, a sign-in page, an error screen or a dialog of the shell. Between the launch screen and what follows, the shell SHALL NOT show an empty web view. On Android the launch screen SHALL carry the app's icon. The launch screen SHALL NOT outlast five seconds from the start of the load: after that the shell shows the web view with whatever it has, so a slow server still gets the screens it had. The bar colour and icons the shell remembers from the last run (see "System bars follow the app's theme") SHALL appear together with the page, not over the launch screen. The launch screen SHALL need no dependency and no permission. This is presentation only: it reads and writes no task data, works the same offline (a start from the stored copy ends it like any page), and changes nothing that syncs.

#### Scenario: Cold start on Android
- **WHEN** the user taps the app's icon on an Android phone in dark mode with a server configured
- **THEN** the icon shows over the dark canvas colour until the page can be drawn, and the page follows with no blank frame

#### Scenario: Cold start on iPhone
- **WHEN** the user opens the iOS app in light mode with a server configured
- **THEN** the light canvas colour shows until the page has loaded, and the page follows with no white web view between them

#### Scenario: A slow server
- **WHEN** the page has not loaded five seconds after the start
- **THEN** the launch screen goes and the web view shows what it has, as it did before

#### Scenario: The server cannot be reached
- **WHEN** the load fails and no stored copy can stand in
- **THEN** the launch screen goes at once and the shell's error screen shows, with the text it had

#### Scenario: A login wall answers first
- **WHEN** the first page is a sign-in page of another origin
- **THEN** the launch screen goes when that page has loaded, and the site bar names its host

#### Scenario: A remembered dark theme under a light phone
- **WHEN** the app last ran with a dark theme and the phone's appearance is light
- **THEN** the launch screen is light with the system's status bar icons, and the remembered bar colour and icons appear with the page

#### Scenario: Offline start from the stored copy
- **WHEN** the Android app opens with no network and a stored copy of the web app
- **THEN** the launch screen stays until that copy can be drawn, and Today shows the locally stored tasks
