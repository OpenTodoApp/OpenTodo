# Spec Delta

## Purpose

Defines how content from other apps and web pages becomes a task: the app as a system share target, the capture screen that confirms and files the shared title, text and URL, the bookmarklet and browser extension that reach the same screen, and the limits that keep shared payloads safe.

## ADDED Requirements

### Requirement: Web Share Target registration
The web app manifest SHALL declare a share target that receives `title`, `text` and `url` as query parameters of the `/share` route using a GET request, so the installed app is offered in the operating system's share sheet. The route SHALL be served by the precached application shell, so it opens with no network.

#### Scenario: Share from a mobile browser
- **WHEN** the user installs the app, opens a web page in another app and chooses the app from the share sheet
- **THEN** the capture screen opens with that page's title and URL prefilled

#### Scenario: Share while offline
- **WHEN** the device has no network and the user shares a page to the installed app
- **THEN** the capture screen opens and saving creates the task locally, to be uploaded when the network returns

### Requirement: Capture screen
`/share` SHALL show a quick-add style title field prefilled with the shared title (or the URL's host), a description prefilled with the shared text followed by the URL, a project picker defaulting to the Inbox, and Save and Cancel actions; Enter saves, Escape cancels, focus starts in the title. Saving SHALL create the task in the local store as one operation set that syncs and converges like any quick-add task; nothing SHALL be saved without the user's confirmation.

#### Scenario: Save with selection
- **WHEN** the capture screen is opened with title `Interesting article`, text `the quoted paragraph` and url `https://example.org/post` and the user presses Enter
- **THEN** a task titled `Interesting article` exists in the Inbox with a description of the quoted paragraph followed by the URL, and the screen returns to the previous view or closes if it was opened as a popup

#### Scenario: File into a project
- **WHEN** the user picks the project "Reading" before saving
- **THEN** the task is created in "Reading"

#### Scenario: Cancel
- **WHEN** the user presses Escape
- **THEN** no task is created and the screen closes or returns to the previous view

### Requirement: Capture when signed out
When `/share` is opened on a device that is not signed in, the client SHALL keep the shared payload in memory, show the sign-in screen, and return to the capture screen with the payload intact after sign-in. The payload SHALL not be sent to the server or stored anywhere else before the user saves.

#### Scenario: Sign in then capture
- **WHEN** a signed-out device opens `/share?title=Fix&url=https://example.org`
- **THEN** after successful sign-in the capture screen shows `Fix` and the URL, ready to save

### Requirement: Bookmarklet
Settings SHALL offer a bookmarklet, generated for the server's own origin, that the user can drag to the bookmarks bar. Activating it on any page SHALL open `/share` in a small popup window with that page's URL, title and current text selection. The bookmarklet SHALL contain no token or credential.

#### Scenario: Use the bookmarklet
- **WHEN** the user selects a sentence on a web page and clicks the bookmarklet
- **THEN** a popup shows the capture screen with the page title, the selected sentence and the URL, and closes after saving

#### Scenario: Bookmarklet without a session
- **WHEN** the bookmarklet is used on a browser that is not signed in to the app
- **THEN** the popup shows the sign-in screen and continues to the capture screen afterwards

### Requirement: Browser extension
The repository SHALL include a browser extension for Chromium-based browsers and Firefox with a toolbar button, a context-menu entry "Add to OpenTodo" and a keyboard shortcut, each opening `/share` on the configured server with the current tab's URL, title and selection. It SHALL store only the server URL, hold no token, make no network requests itself, and request only the permissions needed to read the active tab and show the menu.

#### Scenario: First use asks for the server
- **WHEN** the extension is installed and used before a server URL is set
- **THEN** its options page opens asking for the server URL, and the capture continues once it is saved

#### Scenario: Context menu capture
- **WHEN** the user right-clicks a selection and chooses "Add to OpenTodo"
- **THEN** the capture screen opens with the tab's title, the selection and the URL

#### Scenario: No background traffic
- **WHEN** the extension is installed and idle
- **THEN** it opens no connections to any host

### Requirement: Payload limits and hygiene
The capture screen SHALL treat shared title and text as plain text, SHALL truncate the title to 500 characters and the text to 16 KB, SHALL keep a shared URL only when its scheme is `http` or `https`, and SHALL ignore anything else. Opening `/share` SHALL never execute shared content or navigate to the shared URL.

#### Scenario: Unsafe URL dropped
- **WHEN** the share payload carries `url=javascript:alert(1)`
- **THEN** the description contains no URL and the rest of the payload is shown normally

#### Scenario: Oversized text
- **WHEN** the shared text is 40 KB long
- **THEN** the description holds the first 16 KB followed by a truncation note
