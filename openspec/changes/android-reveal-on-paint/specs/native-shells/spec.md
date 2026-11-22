# Spec Delta

## MODIFIED Requirements

### Requirement: The web app says when its first frame is drawn
A shell that keeps its web view hidden until the page shows (the iOS and Android shells) SHALL list the bridge capability `first-paint` in its visible app. The web app SHALL call the bridge method `painted`, without arguments, once per page load, after its first frame with the app's own content (the loading skeleton or a screen) has been drawn, and SHALL NOT call it in a shell that does not list the capability. On that call the shell SHALL show its web view at once, whether or not the page has finished loading. A web app of a server that does not know the method leaves the shell showing it when the page has loaded, as before. The background run SHALL NOT list the capability, and a call from it SHALL show nothing. The bridge version SHALL stay 1, and the call SHALL be part of the shared bridge fixtures. The call hands over no data, works offline and stores nothing.

#### Scenario: The first frame ends the launch screen
- **WHEN** the iOS app opens and the web app draws its loading skeleton while a script or font of the page is still loading
- **THEN** the web app calls `painted` and the web view shows with the skeleton, before the page has finished loading

#### Scenario: An older server
- **WHEN** the iOS app loads the web app of a server that does not know `painted`
- **THEN** the web view shows when the page has loaded, or after five seconds

#### Scenario: The first frame ends the launch screen on Android
- **WHEN** the Android app opens and the web app draws its first frame while an image of the page is still loading
- **THEN** the web app calls `painted` and the web view shows, before the page has finished loading and before the five-second cap

#### Scenario: A shell without the capability
- **WHEN** the web app runs in a browser, or in a background run of a shell
- **THEN** `first-paint` is not listed and `painted` is not called

### Requirement: Launch screen until the page shows
A shell SHALL open on a launch screen in the web app's default canvas colour, light or dark with the phone's appearance, and SHALL keep it until the shell has something to show: the page of the server ready to be drawn (in a shell that lists `first-paint`, the web app's first drawn frame; otherwise the end of the page's load), a sign-in page, an error screen or a dialog of the shell. Between the launch screen and what follows, the shell SHALL NOT show an empty web view. On Android the launch screen SHALL carry the app's icon. The launch screen SHALL NOT outlast five seconds from the start of the load: after that the shell shows the web view with whatever it has, so a slow server still gets the screens it had. The bar colour and icons the shell remembers from the last run (see "System bars follow the app's theme") SHALL appear together with the page, not over the launch screen. The launch screen SHALL need no dependency and no permission. This is presentation only: it reads and writes no task data, works the same offline (a start from the stored copy ends it like any page), and changes nothing that syncs.

#### Scenario: Cold start on Android
- **WHEN** the user taps the app's icon on an Android phone in dark mode with a server configured
- **THEN** the icon shows over the dark canvas colour until the web app has drawn its first frame, and the page follows with no blank frame

#### Scenario: Cold start on iPhone
- **WHEN** the user opens the iOS app in light mode with a server configured
- **THEN** the light canvas colour shows until the web app has drawn its first frame, and the page follows with no white web view between them

#### Scenario: A page that keeps loading after its first frame
- **WHEN** the iOS app opens on a web app that has drawn its loading frame while its page has not finished loading
- **THEN** the launch screen goes with that frame, not when the page finishes loading or five seconds have passed

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
