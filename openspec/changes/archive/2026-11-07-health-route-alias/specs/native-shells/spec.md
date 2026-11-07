## MODIFIED Requirements

### Requirement: First-run server screen
On first start, and whenever no server is configured, a shell SHALL show a screen asking for the server address with the device's language, SHALL check the address by requesting the server's health route with the web view's cookies for it, and SHALL name the reason when the check fails (no network, not an OpenTodo server, behind a login page, certificate not trusted, address refused). The shell SHALL request `/api/v1/health` first and, unless that answers as OpenTodo or the connection or certificate failed, `/healthz`, so a server whose proxy answers `/healthz` itself and a server from before `/api/v1/health` both pass. When the health route answers with a redirect to a sign-in page or with a sign-in page refusing access, the screen SHALL say the server is behind a login page and offer to sign in inside the app; when it answers with a web page, the screen SHALL say so and offer the same. Signing in SHALL use the shell's sign-in flow without the bridge and SHALL end, with the check repeated, once the health route answers. A trusted certificate the user installed on the device SHALL be accepted. The address SHALL be changeable later from the shell's own menu, and changing it SHALL discard the web view's storage for the old server only after the user confirms.

#### Scenario: Not an OpenTodo server
- **WHEN** the user enters `https://example.com`
- **THEN** the screen says the address does not answer as an OpenTodo server and keeps the address for editing

#### Scenario: Behind a login page
- **WHEN** the user enters the address of a server whose login wall redirects `/healthz` to its sign-in page
- **THEN** the screen says the server is behind a login page and offers "Sign in here"; after signing in there, the check passes and the app opens the server

#### Scenario: Behind a proxy that answers /healthz
- **WHEN** the user enters the address of a server behind Pomerium, which answers `/healthz` with a plain `OK`
- **THEN** the check passes on `/api/v1/health` and the app opens the server

#### Scenario: A server before 1.0.1
- **WHEN** the user enters the address of a server that has no `/api/v1/health`
- **THEN** the check passes on `/healthz` and the app opens the server

#### Scenario: Self-signed certificate the user trusts
- **WHEN** the home server uses a certificate from a private authority installed in the device's user credentials
- **THEN** the shell accepts the connection, and a certificate the device does not trust is refused with an explanation, never silently accepted

#### Scenario: Change the server
- **WHEN** a signed-in user chooses "Change server" and confirms
- **THEN** the shell forgets the old server's storage, scheduled reminders and widget data, and shows the first-run screen
