## ADDED Requirements

### Requirement: A task's page offers the iPhone app
The page served for a task's address, `/task/<id>`, SHALL carry Safari's Smart App Banner tag naming the OpenTodo app for iPhone and iPad. With a configured base URL, its argument SHALL be that task's address under the base URL, with the id escaped as one path segment and the tag's content escaped for HTML. Without a configured base URL, the tag SHALL carry no argument. The server SHALL add it to the page it sends, and the service worker SHALL add the same tag to the page it serves from its cache for that address. No other page SHALL carry it, and the page's Content-Security-Policy SHALL be the same as on every other page of the app. The server SHALL make no request for it.

The iOS shell SHALL open the task when it is handed such an address whose scheme, host and port are the configured server's. It SHALL ignore one on any other host or with any other path. The banner changes no data. Offline, a page from the service worker still carries it, and the app opens the task from what it holds, converging when it syncs.

#### Scenario: A calendar link on an iPhone with the app
- **WHEN** a person taps a task's link in a calendar event, and Safari opens `https://todo.example.com/task/abc`
- **THEN** the page shows the banner with Open, and Open brings up the OpenTodo app at task `abc`

#### Scenario: A link to another server
- **WHEN** the app connected to `https://todo.example.com` is handed `https://other.example.com/task/abc`
- **THEN** it opens nothing

#### Scenario: Other pages
- **WHEN** Safari opens `/today` or a public task page under `/t/`
- **THEN** the page carries no banner tag

#### Scenario: An id that tries to leave the tag
- **WHEN** the address is `/task/x"><script>,app-id=1`
- **THEN** the id stays escaped inside the argument and the page gains no element

#### Scenario: No base URL
- **WHEN** the server has no base URL and Safari opens `/task/abc`
- **THEN** the banner names the app without an argument and opens the app at its start
