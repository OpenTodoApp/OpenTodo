# OpenTodo Capture changelog

The browser extension versions on its own, independently of the app. `make extension` refuses a build whose manifest version is not the first entry here.

## 0.6.1 - 2026-10-22

- The new OpenTodo mark as the toolbar and store icon, the same as the app's.

## 0.6.0 - 2026-10-22

- A popup instead of a new window: the toolbar button and Alt+Shift+O open a quick-add line prefilled from the page, a project and a label picker, the page as the task's origin, and Save.
- Two modes on the options page. **Capture screen** (the default) opens your server's capture screen as before; the extension holds no token and sends nothing itself. **Quick save** creates the task at once with an API token, previewing dates, projects, labels, priority and reminders as chips in your account's language.
- "Add to OpenTodo" on links and images too: a link's text becomes the line and its address the origin; an image's address starts the description, and the extension never downloads the image.
- Messages open in Gmail or Outlook on the web: the subject becomes the line, the message link the origin (shown as Gmail or Outlook in the app), and the sender the first line of the description. The message body is never read.
- Two packages, one for the Chrome Web Store and one for addons.mozilla.org, built from one source manifest.

## 0.5.0

- The capture screen of your own server for the current page, its selection or a screenshot, from the toolbar, the shortcut or the context menu.
