# Privacy disclosure and permission justifications

Paste these answers into the Chrome Web Store "Privacy practices" tab and the
addons.mozilla.org review notes. `store.test.js` fails when the manifest
declares a permission this page does not name.

## Single purpose

Add the current page, a link, an image, a mail message or the selected text as
a task on the user's own OpenTodo server.

## What the extension sends, and to whom

It talks only to the server address the user enters on the options page. It
stores that address and the chosen mode (synchronised by the browser) and, in
Quick save mode, an API token (kept on the device only, never synchronised). It
collects no data, has no analytics, and sends nothing to the developer or to
anyone else.

- Capture screen mode (the default): the extension sends no request. Save opens
  the user's server in a window with the title, the selected text and the page
  address in the address bar.
- Quick save mode: the extension sends the typed line, the selected text, the
  page address and, on a mail message, its subject, sender and permalink to the
  user's server, with the user's token. Nothing is sent before the user opens
  the popup.

Data use answers: no personally identifiable information, health, financial,
authentication, personal communications, location, web history or user
activity is collected by the developer. The content the user chooses to save is
sent to the user's own server only.

## Permissions

- `activeTab`: reads the title, address and selected text of the tab the user
  clicked the button or the menu in, only at that moment.
- `contextMenus`: adds "Add to OpenTodo" for pages, selections, links and
  images, and "Add screenshot to OpenTodo".
- `scripting`: runs one function in the clicked tab to read the selection, or,
  on a Gmail or Outlook message, the sender's name and address from the message
  header; the message body is never read. It also hands a screenshot to the
  user's own capture screen.
- `storage`: keeps the server address and the mode (sync), the token (local),
  and a context-menu capture for the popup to read once (session, in memory).
- Optional host access (`https://*/*`, `http://*/*`): asked for only the
  server's own origin, when the user turns on Quick save or screenshots, so the
  extension can call that server's API or deliver the screenshot. It is never
  asked for any other site, and there are no content scripts.

## Remote code

None. Every script ships in the package.
