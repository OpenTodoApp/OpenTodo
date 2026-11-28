## MODIFIED Requirements

### Requirement: A shell loads the user's server and nothing else
A native shell SHALL load the web app from the server address the user entered, over `https` (or `http` only for `localhost`, private network addresses, and IPv4 addresses in `100.64.0.0/10`, with a warning), in a full-screen web view that keeps the app's origin, cookies, local storage, IndexedDB and service worker, exactly like the installed web app. The shell SHALL open network connections only to that server (and, when the web app itself requests them, to the same origin), and, during a sign-in flow that server starts, to the sign-in pages it redirects to. It SHALL collect no usage data, include no analytics, crash-reporting or advertising library, and declare "no data collected" in every store listing. The shell SHALL NOT bundle a copy of the web app: the server serves the app version that matches it.

#### Scenario: Shared address space server over http
- **WHEN** the user enters `http://100.100.20.30:8080` on the first-run screen
- **THEN** the shell accepts it after showing that the connection is not encrypted on the way to that address

#### Scenario: Public address in adjacent ranges over http
- **WHEN** the user enters `http://100.63.255.255` or `http://100.128.0.0` on the first-run screen
- **THEN** the shell refuses it, explains that a secure address is needed and offers to try the HTTPS address
