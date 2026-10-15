# Spec Delta

## ADDED Requirements

### Requirement: Shared files on the capture screen
Files received by the share target SHALL be listed on the capture screen with name, type and size (a thumbnail for images), each removable before saving. Saving SHALL create the task and one attachment per file in one local operation batch and queue the bytes for upload, so a share works offline exactly like a text share. At most 10 files per share SHALL be accepted; files over the last known per-file limit SHALL be refused with the limit named before saving.

#### Scenario: Share a photo offline
- **WHEN** the device has no network and the user shares a photo from the gallery to the installed app and presses Enter
- **THEN** a task titled after the file name exists in the Inbox with the photo as an uploading attachment, and the photo uploads on the next sync

#### Scenario: Share text with a file
- **WHEN** an app shares a title, a text and a PDF
- **THEN** the capture screen shows the title and text as before and the PDF below them, and saving creates the task with the PDF attached

#### Scenario: Oversized file
- **WHEN** a shared file is larger than the per-file limit
- **THEN** the capture screen lists it as refused with the limit named, and saving creates the task without it

## MODIFIED Requirements

### Requirement: Web Share Target registration
The web app manifest SHALL declare a share target on the `/share` route that receives `title`, `text` and `url` as fields and `files` as parts of a `POST` request with `multipart/form-data`, so the installed app is offered in the operating system's share sheet for text, links, images and documents. The service worker SHALL answer the `POST` itself, keep the files in a device-local hand-over store, and redirect to the capture screen, which is served by the precached application shell, so a share opens with no network. `GET /share` with query parameters SHALL keep working for the bookmarklet and the extension.

#### Scenario: Share from a mobile browser
- **WHEN** the user installs the app, opens a web page in another app and chooses the app from the share sheet
- **THEN** the capture screen opens with that page's title and URL prefilled

#### Scenario: Share while offline
- **WHEN** the device has no network and the user shares a page to the installed app
- **THEN** the capture screen opens and saving creates the task locally, to be uploaded when the network returns

#### Scenario: Share an image
- **WHEN** the user shares an image from another app to the installed app
- **THEN** the service worker stores the image on the device and the capture screen opens with the image listed

### Requirement: Capture when signed out
When `/share` is opened on a device that is not signed in, the client SHALL keep the shared payload in memory, show the sign-in screen, and return to the capture screen with the payload intact after sign-in. The payload SHALL not be sent to the server before the user saves. Shared files SHALL live only in the device-local hand-over store the service worker filled, SHALL be removed from it when the share is saved or cancelled and after ten minutes at the latest, and SHALL be cleared at sign-out.

#### Scenario: Sign in then capture
- **WHEN** a signed-out device opens `/share?title=Fix&url=https://example.org`
- **THEN** after successful sign-in the capture screen shows `Fix` and the URL, ready to save

#### Scenario: Shared file is not kept
- **WHEN** a signed-out device receives a shared image and the user cancels the capture
- **THEN** the image is removed from the hand-over store and was never sent to the server

### Requirement: Browser extension
The repository SHALL include a browser extension for Chromium-based browsers and Firefox with a toolbar button, a context-menu entry "Add to OpenTodo" and a keyboard shortcut, each opening `/share` on the configured server with the current tab's URL, title and selection, and a context-menu entry "Add screenshot to OpenTodo" that captures the visible tab and hands the image to the capture popup. It SHALL store only the server URL, hold no token, make no network requests itself, and request only the permissions needed to read the active tab, show the menu and, as an optional host permission granted from its options page, reach the capture popup on the configured server.

#### Scenario: First use asks for the server
- **WHEN** the extension is installed and used before a server URL is set
- **THEN** its options page opens asking for the server URL, and the capture continues once it is saved

#### Scenario: Context menu capture
- **WHEN** the user right-clicks a selection and chooses "Add to OpenTodo"
- **THEN** the capture screen opens with the tab's title, the selection and the URL

#### Scenario: Screenshot capture
- **WHEN** the user chooses "Add screenshot to OpenTodo" on a page and has granted the extension access to their server
- **THEN** the capture popup opens with the page's title and URL and a PNG of the visible tab listed as a file, and nothing is saved until the user presses Save

#### Scenario: Screenshot without the host permission
- **WHEN** the user chooses "Add screenshot to OpenTodo" without having granted access to their server
- **THEN** the capture popup opens with the title and URL and explains that the screenshot could not be handed over until the permission is granted in the extension's options

#### Scenario: No background traffic
- **WHEN** the extension is installed and idle
- **THEN** it opens no connections to any host

### Requirement: Payload limits and hygiene
The capture screen SHALL treat shared title and text as plain text, SHALL truncate the title to 500 characters and the text to 16 KB, SHALL keep a shared URL only when its scheme is `http` or `https`, SHALL accept at most 10 shared files and none over the per-file limit, and SHALL ignore anything else. Opening `/share` SHALL never execute shared content, render a shared file as a document, or navigate to the shared URL.

#### Scenario: Unsafe URL dropped
- **WHEN** the share payload carries `url=javascript:alert(1)`
- **THEN** the description contains no URL and the rest of the payload is shown normally

#### Scenario: Oversized text
- **WHEN** the shared text is 40 KB long
- **THEN** the description holds the first 16 KB followed by a truncation note

#### Scenario: HTML file shared
- **WHEN** a shared file is an HTML document
- **THEN** it is listed by name, type and size only, never rendered, and is attached as a file that downloads rather than opens
