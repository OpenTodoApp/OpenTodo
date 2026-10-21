# share-capture Specification

## Purpose
Defines how content from other apps and web pages becomes a task: the app as a system share target, the capture screen that confirms and files the shared title, text and URL, the bookmarklet and browser extension that reach the same screen, and the limits that keep shared payloads safe.

## Requirements

### Requirement: Web Share Target registration
The web app manifest SHALL declare a share target on `/share` receiving `title`, `text`, `url` and `files` as a `POST` with `multipart/form-data`, so the installed app is offered in the share sheet for text, links, images and documents. The service worker SHALL answer the `POST` itself, keep the files in a device-local hand-over store and redirect to the capture screen of the precached shell, so a share works offline. `GET /share` with query parameters SHALL keep working.

#### Scenario: Share from a mobile browser
- **WHEN** the user installs the app, opens a web page in another app and chooses the app from the share sheet
- **THEN** the capture screen opens with that page's title and URL prefilled

#### Scenario: Share while offline
- **WHEN** the device has no network and the user shares a page to the installed app
- **THEN** the capture screen opens and saving creates the task locally, to be uploaded when the network returns

#### Scenario: Share an image
- **WHEN** the user shares an image from another app to the installed app
- **THEN** the service worker stores the image on the device and the capture screen opens with the image listed

### Requirement: Capture screen
`/share` SHALL show a quick-add style title field prefilled with the shared title (or the URL's host), a description prefilled with the shared text followed by the URL, a project picker defaulting to the Inbox, and Save and Cancel actions; Enter saves, Escape cancels, focus starts in the title. Saving SHALL create the task in the local store as one operation set that syncs and converges like any quick-add task; nothing SHALL be saved without the user's confirmation. When the payload carries an `http` or `https` URL, the saved task SHALL also carry the origin `{kind: "url", url, title}` with the shared title (not the edited task title) as `title`; a URL of a recognised issue host SHALL be stored as `kind: "issue"` with its provider and id, derived on the device without any request. The URL SHALL still be written into the description, so the notes read as before.

#### Scenario: Save with selection
- **WHEN** the capture screen is opened with title `Interesting article`, text `the quoted paragraph` and url `https://example.org/post` and the user presses Enter
- **THEN** a task titled `Interesting article` exists in the Inbox with a description of the quoted paragraph followed by the URL, with origin `{kind: "url", url: "https://example.org/post", title: "Interesting article"}`, and the screen returns to the previous view or closes if it was opened as a popup

#### Scenario: Issue page shared from the extension
- **WHEN** the extension opens the capture screen for `https://github.com/o/r/issues/7` with the page title and the user saves
- **THEN** the task's origin is `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7", title: <page title>}`, its notes end with the URL, and no request was made to that host

#### Scenario: Share without a URL
- **WHEN** an app shares only a text
- **THEN** the task is created with the text as description and no origin

#### Scenario: Shared offline
- **WHEN** the device has no network and the user saves a shared page
- **THEN** the task with its origin is in the local store at once and both upload as one batch when the network returns

#### Scenario: File into a project
- **WHEN** the user picks the project "Reading" before saving
- **THEN** the task is created in "Reading"

#### Scenario: Cancel
- **WHEN** the user presses Escape
- **THEN** no task is created and the screen closes or returns to the previous view

### Requirement: Capture when signed out
When `/share` is opened on a device that is not signed in, the client SHALL keep the shared payload in memory, show the sign-in screen, and return to the capture screen with the payload intact after sign-in. The payload SHALL not be sent to the server before the user saves. Shared files SHALL live only in the device-local hand-over store the service worker filled, SHALL be removed from it when the share is saved or cancelled and after ten minutes at the latest, and SHALL be cleared at sign-out.

#### Scenario: Sign in then capture
- **WHEN** a signed-out device opens `/share?title=Fix&url=https://example.org`
- **THEN** after successful sign-in the capture screen shows `Fix` and the URL, ready to save

#### Scenario: Shared file is not kept
- **WHEN** a signed-out device receives a shared image and the user cancels the capture
- **THEN** the image is removed from the hand-over store and was never sent to the server

### Requirement: Bookmarklet
Settings SHALL offer a bookmarklet, generated for the server's own origin, that the user can drag to the bookmarks bar. Activating it on any page SHALL open `/share` in a small popup window with that page's URL, title and current text selection. The bookmarklet SHALL contain no token or credential.

#### Scenario: Use the bookmarklet
- **WHEN** the user selects a sentence on a web page and clicks the bookmarklet
- **THEN** a popup shows the capture screen with the page title, the selected sentence and the URL, and closes after saving

#### Scenario: Bookmarklet without a session
- **WHEN** the bookmarklet is used on a browser that is not signed in to the app
- **THEN** the popup shows the sign-in screen and continues to the capture screen afterwards

### Requirement: Browser extension
The repository SHALL include a browser extension for Chromium-based browsers and Firefox with a toolbar button, a context-menu entry "Add to OpenTodo" and a shortcut opening `/share` on the configured server with the tab's URL, title and selection, and an entry "Add screenshot to OpenTodo" handing a capture of the visible tab to that popup. It SHALL store only the server URL, hold no token, make no network requests and ask only for the permissions it needs.

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

### Requirement: Browser extension language
The extension's name, description, context-menu entry, shortcut description and options page SHALL be shown in the browser's interface language when it is one of the shipped languages (OpenSpec `localization`), else in English. The extension SHALL NOT learn or store the account's language preference; it keeps storing only the server URL and making no requests.

#### Scenario: French browser
- **WHEN** the browser's interface language is French and the user right-clicks a page
- **THEN** the menu entry reads `Ajouter à OpenTodo` and the options page is in French

#### Scenario: Browser language not shipped
- **WHEN** the browser's interface language is Japanese
- **THEN** the extension's texts are English and the capture works as usual

#### Scenario: Account language differs from the browser
- **WHEN** the account's interface language is German and the browser's is English
- **THEN** the extension's texts are English, and the capture screen it opens is in German because it is rendered by the app

### Requirement: Share target accepts only the share sheet and the app
The service worker SHALL store a `POST /share` only when the request's `Sec-Fetch-Site` is `none` or `same-origin`, or the header is absent (older browsers), and only when the share, files and text together, is at most 100 MB (a declared `Content-Length` over the cap is refused before the body is read). Any other request SHALL be redirected to the app without storing anything.

#### Scenario: Share from the system share sheet
- **WHEN** the share sheet posts a photo to `/share` with `Sec-Fetch-Site: none`
- **THEN** the share is stored and the capture screen opens with it

#### Scenario: Form on another website
- **WHEN** a page on another site submits a form to `/share` (`Sec-Fetch-Site: cross-site`)
- **THEN** the app opens and nothing is stored

#### Scenario: Share over the cap
- **WHEN** a share holds files of 150 MB in total
- **THEN** the app opens and nothing is stored
