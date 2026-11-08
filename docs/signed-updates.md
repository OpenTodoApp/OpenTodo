---
title: Signed updates
summary: What Settings → About says about the app's code, and what to do when an update didn't pass the check.
audience: user
section: Reference
specs: [web-app]
screens: []
order: 95
---
# Signed updates

Your server sends the app's code to your browser. For every release, OpenTodo publishes a list of the app's files with a fingerprint of each one, and signs that list. Before an update runs, the app compares what your server sent with the signed list.

**For now, the check only reports.** An update that doesn't pass is still installed, and Settings → About says what went wrong. A later release turns refusal on: from then on, an update that doesn't pass is not installed, and the app keeps the version it has.

## What Settings → About shows

The **App code** row says who signed the code your device runs:

| It says | What it means |
| --- | --- |
| **Signed by OpenTodo** | A release key of OpenTodo signed the list. **Verify key** opens the website, which compares the key with the published one. The app sends nothing to the website. |
| **Signed with this server's key** | Whoever built this server signed it with their own key. |
| **Self-built** | The server was built without a key. Updates are not signature-checked. |
| **Preview build** | A test build of the next release. Updates are not signature-checked. |

When the last update didn't pass the check, a note under the row names the likely cause, with **What to do**, which opens this page. **Copy diagnostics** copies one line (the version, the key, the result) that you can paste into an issue or send to whoever runs your server. It holds no account data.

## A proxy or the server changed the app's files

The most common cause is a proxy in front of the server that rewrites pages or scripts, to speed them up or add something to them. The files then differ from the signed ones. Whoever runs the server can fix it:

- **Cloudflare.** For the server's host name, turn off **Rocket Loader**, **Auto Minify** (where your plan still shows it) and **Email Address Obfuscation**, either for the whole site or with a Configuration Rule for that host name. Then purge the cache.
- **Other proxies.** Turn off anything that rewrites HTML or JavaScript for this host: nginx `sub_filter`, injected analytics or chat widgets, "optimizers" of a hosting panel.
- **Check the result.** Run `go run github.com/OpenTodoApp/opentodo/cmd/websign@latest verify https://your.server/`. It downloads every file the way a browser does and names any file that differs.

The server already sends `Cache-Control: no-transform` on every file of the app, which tells well-behaved proxies to leave them alone.

## The update isn't signed by OpenTodo

The server now sends a version that OpenTodo didn't sign: a self-built version, or a build signed with another key.

- If whoever runs the server switched on purpose, follow the steps under [Starting over on this device](#starting-over-on-this-device).
- If nobody did, someone may have changed the server. Don't enter your encryption passphrase, and ask whoever runs the server.

## The server went back to an older version

The server was rolled back to an older release. Your device keeps the newer one, which is safer: an older version may have a problem that was fixed later. Sync keeps working. To use the older version anyway, start over on this device.

## Starting over on this device

There is no reset button, on purpose: someone who controls a server could talk people into pressing it. Instead:

1. Make sure everything synced: the sync indicator shows no changes waiting.
2. Remove the site's data for the server's address:
   - **Chrome, Edge:** click the icon left of the address, then **Site settings** → **Delete data**.
   - **Firefox:** click the padlock, then **Clear cookies and site data**.
   - **Safari on a Mac:** **Settings** → **Privacy** → **Manage Website Data**, find the server and remove it.
   - **iPhone and iPad:** remove the app from the home screen, then **Settings** → **Apps** → **Safari** → **Advanced** → **Website Data**, and remove the server.
   - **The Android app:** **Settings** → **Apps** → **OpenTodo** → **Storage** → **Clear storage**.
3. Open the server again and sign in. Your tasks download again from the server. With end-to-end encryption, you enter your passphrase again.

## If you don't trust the server

The check guards against a server that sends changed code the ordinary way. In a browser, a server that is determined to cheat can still replace the part of the app that does the checking, and nothing in a browser can stop that. If you don't trust whoever runs the server, don't enter your passphrase there. The Android app will check the code itself, with the key built into the app, once refusal is on.

[Signed app code](security/signed-app.md) explains the design, the keys and what the check doesn't cover.
