# Spec Delta

## MODIFIED Requirements

### Requirement: Demo sign-in and banner
With demo mode on, `GET /api/v1/auth/status` SHALL include a `demo` object with a short-lived creation token, the sandbox lifetimes and the next reset, and no credentials. "Try the demo" SHALL create a sandbox and sign the browser into it. Settings SHALL hide or disable restricted controls with a short note.

While signed into a sandbox the app SHALL show a demo banner above the shell that is **one line at every width** from 360 px up, reading "Demo: private sandbox, deleted after {idle} h of inactivity. Don't store anything personal." followed by a "Learn more" link; below 640 px the second sentence is left to the Details control and the rest is cut with an ellipsis rather than wrapped, so the banner never takes a second line. The link SHALL open the demo section of the getting-started guide in the Help panel over the current screen. `{idle}` SHALL be the idle lifetime in hours from the status's `demo.sandboxHours`, remembered on the device so the line is the same offline, never a number fixed in the app. The banner SHALL offer a Dismiss control and a Details control: Dismiss hides the banner on this device until the browser session ends (stored on the device only, never synced, never sent); Details shows the full text (private sandbox, the idle lifetime, the maximum age, the nightly reset, nothing personal) as a tooltip with a fine pointer and as a dialog on touch. While the sandbox's write budget is used up, the line SHALL show the write-limit notice in the banner's place, dismissed or not, and return to the demo line when writes are accepted again. The banner SHALL be a status region for assistive technology and SHALL not be shown in docs screenshots.

#### Scenario: Try the demo
- **WHEN** a visitor clicks "Try the demo"
- **THEN** a new sandbox is created, they are signed into it and see the sample data and the banner

#### Scenario: One line on a phone
- **WHEN** a sandbox is open on a 360 px wide screen
- **THEN** the banner is one line reading "Demo: private sandbox, deleted after 2 h of inactivity." (cut with an ellipsis if it still does not fit) with its Learn more link and its two controls, Details shows the full text, and the first task of the Inbox is two lines higher than before

#### Scenario: Lifetime from the server
- **WHEN** a demo server reports an idle lifetime of 3 hours
- **THEN** the banner reads "deleted after 3 h of inactivity", also after the tab was reopened offline

#### Scenario: Dismissed for the session
- **WHEN** a visitor dismisses the banner, opens another view and reloads the tab
- **THEN** the banner stays hidden; in a new browser session or another browser it is shown again, and nothing was written to the account

#### Scenario: Learn more
- **WHEN** a visitor activates Learn more while editing a task
- **THEN** the demo section of the guide opens in the Help panel beside the screen and the task stays open as it was

#### Scenario: Write limit
- **WHEN** a sandbox that dismissed the banner reaches its write limit
- **THEN** the banner's line shows the write-limit notice until writes are accepted again

#### Scenario: Returning visitor
- **WHEN** a visitor comes back within the sandbox lifetime in the same browser
- **THEN** they are still signed into the same sandbox with their changes

#### Scenario: Restricted control
- **WHEN** a sandbox opens Settings
- **THEN** Import is disabled and restricted sections are replaced by a note saying they are off on the demo

#### Scenario: Status without demo mode
- **WHEN** demo mode is off and the status is requested
- **THEN** the response has no `demo` field and no banner is shown
