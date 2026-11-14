# Spec Delta

## ADDED Requirements

### Requirement: A shell's pull to refresh yields to the web app
A shell that has its own pull to refresh, which reloads the page (the iOS shell), SHALL list the bridge capability `pull-refresh` in its visible app. A web app that handles a pull down itself (app-shell "Pull down to sync on a touch device") SHALL call the bridge method `pullHandled`, without arguments, on every page load in such a shell, and SHALL NOT call it in a shell that does not list the capability. From that call until another page loads in the web view, the shell SHALL NOT offer its own pull to refresh, so one pull never both syncs and reloads. When another page loads (a reload, a sign-in page, a web app of an older server), the shell's pull to refresh SHALL be back until that page calls the method. A shell without a pull to refresh (the Android shell) SHALL NOT list the capability. The bridge version SHALL stay 1, and the call SHALL be part of the shared bridge fixtures. The call hands over no data, works offline and stores nothing.

#### Scenario: Current web app in the iOS app
- **WHEN** the iOS app shows a web app that handles the pull, and the user pulls Today down
- **THEN** the web app syncs and shows its own mark, the shell's refresh control does not appear, and the page is not reloaded

#### Scenario: Older server
- **WHEN** the iOS app loads the web app of a server that does not know `pullHandled`
- **THEN** the method is never called and pulling down reloads the page, as before

#### Scenario: A sign-in page
- **WHEN** the web view leaves the web app for a sign-in page of another origin
- **THEN** the shell's pull to refresh is back on that page

#### Scenario: Android
- **WHEN** the web app runs in the Android shell
- **THEN** `pull-refresh` is not listed, `pullHandled` is not called, and the web app's pull to sync works by itself
