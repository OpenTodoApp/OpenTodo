---
title: Capturing pages
summary: Save pages, selected text, files and screenshots from other apps: the share sheet, the bookmarklet and the browser extension.
audience: user
section: Reference
specs: [share-capture]
screens: [settings/capture]
order: 50
---
# Capturing pages

Many tasks start as "deal with this page later". OpenTodo can receive a page from three places, and all of them open the same **capture screen** at `/share` on your own server:

| From | How | Works offline |
| --- | --- | --- |
| Phone or desktop share sheet | Install the app, then choose **OpenTodo** in the share menu | Yes, once the app has been opened online |
| Any desktop browser | The bookmarklet from **Settings → Capture** | The popup opens from the app's offline cache once the app has been loaded in that browser |
| Chromium and Firefox | The browser extension in [`extension/`](../extension/) | Same as the bookmarklet in Capture screen mode |

The capture screen proposes:

- **Title**: the page title, or the link's host name when there is no title. The title field is a regular [quick-add](quick-add.md) line, so typing `tomorrow #work p1` into it sets the date, project and priority.
- **Description**: the selected or shared text, followed by the link. The link is also kept as the task's [origin](#where-a-task-came-from).
- **Project**: the Inbox by default; pick any project.
- **Files**: anything shared along with the page (photos, PDFs, documents) or a screenshot from the extension, each with its name, type and size and a thumbnail for images. Remove any you don't want; they're saved as [attachments](attachments.md) of the new task. A share that carries only a file proposes the file's name as the title.

Press **Enter** to save or **Esc** to cancel. Nothing is saved until you confirm. Saving creates an ordinary task on the device first and syncs it like any other quick-add task, so it works with no network and reaches your other devices when the network returns.

When the capture screen was opened as a popup (bookmarklet, extension) or in a window opened just for the share, it closes itself after Save or Esc. Otherwise it takes you to the Inbox or to the project you picked.

## Where a task came from

A task saved from a shared link also remembers that link as its **origin**. The task's row shows a small chip with the link's host (`example.org`), and the task panel an **Origin** chip; both open the page in a new tab, and the page title you shared is their tooltip. On a row the chip is quiet, like the counts at the end of the row; on a board card it ends the line under the title. A link to an issue on GitHub, GitLab, Jira (`*.atlassian.net`) or Linear is recognised on your device, without opening it: the chip reads the issue (`owner/repo#7`, `ENG-123`) and the task is listed by `origin: github`, `origin: gitlab`, `origin: jira` or `origin: linear` in a [filter](filters.md). Self-hosted trackers are kept as ordinary links. The link still ends the description, so your notes read as before.

To forget the origin, remove the **Origin** chip in the task panel; the description keeps the link. The [command palette](search.md) also finds a task by its issue id (`eng-123`) or the shared page title. Tasks [from email](email.md) carry an **Email** origin without a link, and [imported](import.md) tasks carry their source (`origin: todoist`). A message saved from Gmail or Outlook on the web with the extension's Quick save reads **Gmail** or **Outlook**, opens the message, has the subject as its tooltip, and is listed by `origin: gmail` or `origin: outlook`.

## Share sheet (installed app)

The web app manifest declares a [Web Share Target](https://developer.mozilla.org/docs/Web/Manifest/share_target) (`POST /share` with `title`, `text`, `url` and `files`), so the app is offered for links, text, images and documents. The browser adds OpenTodo to the share menu once the app is **installed**:

| Platform | Install | Share |
| --- | --- | --- |
| Android, Chrome / Edge / Samsung Internet | Menu → **Install app** (or **Add to Home screen**) | Share from any app → **OpenTodo** |
| Android, other browsers (Vivaldi, Brave …) or a device without Google Play services (GrapheneOS, /e/OS, LineageOS) | Usually only a home-screen shortcut, which Android cannot list in the share menu | See [below](#opentodo-is-missing-from-the-share-menu-on-android) |
| Windows, ChromeOS, Chrome / Edge | Install icon in the address bar | Share from apps that use the system share dialog |
| macOS, Chrome / Edge | Install icon in the address bar | Support for receiving shares varies by version; use the bookmarklet or extension |
| iOS and iPadOS, any browser | Share → **Add to Home Screen** | Safari does not support share targets for web apps; use the bookmarklet in Safari instead |
| Firefox (all platforms) | Firefox does not install web apps as share targets | Use the extension or bookmarklet |

### From the Android app

The [Android app](android-app.md) is in the share menu as soon as it is installed, also on phones without Google Play services. Links and text open the capture screen as above; photos and files (up to ten, 20 MB each, 25 MB together) are handed to it the way the browser extension hands over a screenshot, and stay on the phone until you save. A share that arrives before you have entered a server waits until you have.

### OpenTodo is missing from the share menu on Android

Android lists a web app in the share menu only when it was installed as a real app (a *WebAPK*), not as a home-screen shortcut. Chrome creates that app through Google Play services, Samsung Internet through its own service. Other browsers such as Vivaldi or Brave, and any browser on a device without Google Play services (GrapheneOS without sandboxed Google Play, /e/OS, LineageOS), add a shortcut instead. OpenTodo then opens normally from the home screen but cannot receive shares. Nothing on your server can change this.

To check: open Android **Settings → Apps**. If **OpenTodo** is listed there, it is installed as an app; if not, it is a shortcut.

What works instead:

- **Install from Chrome**: remove the shortcut, open your server in Chrome and choose **Install app**. On GrapheneOS this needs sandboxed Google Play installed in the same profile.
- **Email to task**: share the page to your email app and send it to your [secret inbox address](email.md), if the owner turned email capture on.
- **Copy and paste**: share → **Copy**, then paste the link into quick add.

Some apps put the link inside the shared text instead of the link field. The capture screen then takes the last `http(s)` link from the text and moves it to the end of the description.

After an update that adds or changes the share target, the browser may need the app to be opened once (or reinstalled) before the share menu entry appears. If a share reaches the server before the app has been opened since the update, the title, text and link still arrive, and the capture screen says the files did not: open the app once and share again.

**Shared files never leave the device before you save.** The app's service worker receives the share on the device, also offline, and keeps the files in a separate local store (`opentodo-share`) only until the capture screen is saved or cancelled. Anything left there is removed after ten minutes and at sign-out. Saving creates the task and its attachments in one step, on the device first; the files upload with the next sync.

The service worker only takes a share from the system share sheet or from the app's own pages: a form on another website that posts to `/share` just opens the app and nothing is stored. A share larger than 100 MB in total (files and text together) is not stored either.

## Bookmarklet

**Settings → Capture** shows an **Add to OpenTodo** button generated for your server's address. Drag it to the bookmarks bar (or use **Copy bookmarklet** and paste the code as the address of a new bookmark). Clicking it on any page opens a small popup with the capture screen, prefilled with the page's address, title and the text you selected.

The bookmarklet contains no password or token. It only opens your server's `/share` page in a popup, where your normal sign-in applies. Its source, with your server's address in place of `https://todo.example.com`:

```js
javascript:(function () {
  var e = encodeURIComponent
  var s = String(window.getSelection ? getSelection() : '').slice(0, 16384)
  var u = "https://todo.example.com/share" + '?url=' + e(location.href) + '&title=' + e(document.title) + (s ? '&text=' + e(s) : '')
  if (!window.open(u, 'opentodo-capture', 'popup,width=480,height=640'))
    alert('Allow pop-ups for this site to capture it to OpenTodo.')
})()
```

If nothing happens, the browser blocked the popup: allow pop-ups for the site you are on. Some sites block bookmarklets with their own security policy; the extension works there.

## Browser extension

[`extension/`](../extension/) holds a small Manifest V3 extension for Chromium-based browsers (Chrome, Edge, Brave, Vivaldi) and Firefox 128 or later. The toolbar button and **Alt+Shift+O** (change it at `chrome://extensions/shortcuts` or in Firefox's **Manage Extension Shortcuts**) open a popup: one line with the page's title, the text you selected, a project and a label picker, the page as the task's origin (remove it with its cross), and **Save**. **Enter** saves, **Esc** closes without keeping anything.

Right-click to start from something else with **Add to OpenTodo**: on a link, the link's text is the line and its address the origin; on an image, the file name is the line and the image's address starts the description (the extension never downloads the image). On a message open in Gmail or Outlook on the web, the subject is the line and **From:** with the sender starts the description; the message body is never read.

**Two modes**, chosen in the extension's options:

- **Capture screen** (the default): Save opens your server's capture screen in a popup window with the line, the text and the address, where you check and save as above. The extension holds no token and sends nothing itself.
- **Quick save**: paste a full-access [API token](api.md) (create one per browser, so you can revoke it alone). Save then creates the task at once and shows **Saved** with a link to it. While you type, the line is previewed as chips (date, project, labels, priority, reminders) in your account's language; a `#name` that is no project shows a grey chip and stays in the title. A label that does not exist yet is created. If the server cannot be reached or refuses the token, the popup keeps your text and offers **Open capture screen**. On an account with [end-to-end encryption](e2ee.md), save from the capture screen, which encrypts on your device. A read-only token previews but does not save.

The extension's own texts follow the browser's interface language in English, German, French, Spanish, Italian and Portuguese, and English otherwise; the chips and the capture screen follow your [interface language](language.md).

**Install** (it is not published in the browser stores yet): download `opentodo-browser-extension-chrome.zip` or `opentodo-browser-extension-firefox.zip` from a release (or run `make extension`) and unzip it.

- *Chromium*: open `chrome://extensions`, turn on **Developer mode**, **Load unpacked**, pick the unzipped folder.
- *Firefox*: open `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on…**, pick `manifest.json` in the unzipped folder. Temporary add-ons are removed when Firefox restarts.

**First use**: if no server is set, the extension opens its options page and asks for your server's address (for example `https://todo.example.com`); the capture you started continues once it is saved.

**Screenshot**: right-click a page and choose **Add screenshot to OpenTodo**. The visible part of the tab is handed to the capture screen as a PNG under **Files**; nothing is saved until you press Save. This needs access to your server's address, which the options page asks for.

**Privacy**: the extension talks only to the server address you enter. It stores that address and the mode in the browser's extension sync storage, and the token, in Quick save mode, on this device only (browsers never synchronise it); a token travels only over `https` (or to `localhost`). It has no content scripts and opens no connections while idle. Permissions: `activeTab` (the clicked tab's address, title and selection), `contextMenus`, `scripting` (read the selection or a mail's sender, hand a screenshot over), `storage`, and, optional, access to your server's address only.

## Signed out

If the device is not signed in, the capture screen first shows the sign-in form with a note, then continues to the capture screen with the shared page intact. Until you save, the shared title, text and link stay in the page's memory only: they are removed from the address bar and are not written to storage or sent to the server (the server's request log records paths, never query strings). Reloading the sign-in page therefore loses the shared content; share it again.

## Limits and safety

- The title is cut to 500 characters, the text to 16 KB with a `[truncated]` note.
- A link is kept only if it starts with `http://` or `https://`; anything else (`javascript:`, `data:`, `file:` …) is dropped and the rest of the share is shown normally.
- Shared content is shown as plain text, never as HTML, and the capture screen never opens the shared link.
- There is no auto-save: a link to `/share` cannot create a task without you pressing Save.
- At most 10 files per share, none larger than the server's limit per file (25 MB unless the owner changed it); a larger file is listed as refused and the task is saved without it. On the public demo, files are not attached.
- Shared files are listed by name, type and size and never shown as web pages; an HTML file is attached as a file that downloads.
