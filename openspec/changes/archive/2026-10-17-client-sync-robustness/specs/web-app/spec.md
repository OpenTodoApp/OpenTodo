# Spec Delta

## MODIFIED Requirements

### Requirement: Render failure containment
A rendering error SHALL show a recoverable message with a reload action instead of a blank page, and SHALL not lose local data. An error in one screen, the task panel or an overlay (help, assistant, command palette, Vim layer, display screen) SHALL replace only that part with the message and a Reload button; the sidebar and the rest of the shell SHALL keep working, and navigating to another screen SHALL try again.

#### Scenario: Unexpected render error
- **WHEN** a component throws while rendering
- **THEN** the user sees an error message and a Reload button, and their data is intact after reloading

#### Scenario: One screen fails
- **WHEN** the code of one screen fails to load or render
- **THEN** that screen shows the message with Reload while the sidebar still navigates, and another screen opens normally

## ADDED Requirements

### Requirement: Recovery after a server upgrade
An open tab SHALL recover when the server moves to a new release: when a lazily loaded part of the app is gone, it SHALL reload once on its own (and show a "Reload to update" prompt if the part is still missing right after); when a new service worker takes control, or a newer tab upgrades the local database, it SHALL show a "Reload to update" prompt, and a tab whose database was upgraded elsewhere SHALL close its connection. Offline, the precached release keeps working; local data is untouched.

#### Scenario: Old chunk after an upgrade
- **WHEN** the server was upgraded and an open tab opens a screen whose code chunk no longer exists
- **THEN** the tab reloads into the new release

#### Scenario: New service worker
- **WHEN** a new release's service worker takes control of an open tab
- **THEN** the tab shows "A new version of OpenTodo is ready." with a "Reload to update" button

### Requirement: Missing files are not the app page
The server SHALL answer a request for a missing file under `assets/`, or for any path with a file extension, with 404, and SHALL keep answering extension-less paths with the app page.

#### Scenario: Old chunk requested
- **WHEN** a tab of the previous release requests `/assets/TaskDetail-<old hash>.js`
- **THEN** the server answers 404, not the app page

#### Scenario: Client route
- **WHEN** the browser navigates to `/project/<id>`
- **THEN** the server answers with the app page

### Requirement: Failed actions are shown
When a change the user makes is refused or fails to save (for example making a task its own subtask, a move the target does not allow, or a local database error), the client SHALL show the reason as a toast in the user's language instead of dropping it, and SHALL log promise rejections nobody handled. A refused change is not written, so nothing has to converge.

#### Scenario: Refused subtask
- **WHEN** the user indents a task under a task in another project, or drops a task onto itself
- **THEN** a toast shows the translated reason and the task is unchanged

### Requirement: Title draft survives remote changes
While the user is typing a new title in the task panel, a title change from another device SHALL not replace the text being typed; leaving the field SHALL save the draft as the user's edit, which converges by the normal last-writer-wins rule. An untouched title SHALL follow remote changes.

#### Scenario: Remote rename while typing
- **WHEN** the user is typing a new title and another device renames the task
- **THEN** the field keeps the user's text, and leaving it saves that text

### Requirement: Local data is kept by the browser
After sign-in the client SHALL ask the browser to keep its storage persistent, so the local copy is not evicted under storage pressure or after weeks without a visit; a refusal SHALL change nothing else.

#### Scenario: Persistent storage
- **WHEN** the user signs in on a browser that supports persistent storage
- **THEN** the app requests it once, and works the same whatever the answer
