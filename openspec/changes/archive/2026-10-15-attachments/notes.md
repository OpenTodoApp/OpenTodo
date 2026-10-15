# Implementation notes: attachments

## Smoke test (11.1), 2026-10-15

Run against a throwaway server (`./bin/opentodo` on :18080, fresh data directory), Chromium through Playwright:

- **Offline attach, second device.** With the browser offline, two files picked in the task panel were listed at once as "Uploading". Back online, they uploaded; a second session of the same account showed both as available (no "Uploading"), the server listed both with `uploaded: true`, the PDF downloaded with `Content-Type: application/pdf` and its bytes, and the task row showed "2 attachments".
- **Comment with a file.** A comment posted with a picked file showed the file under its text.
- **Share sheet.** With an entry in the `opentodo-share` hand-over store (what the service worker writes), `/share?inbox=<id>` listed the photo, proposed its name as the title, saved the task with the photo attached, and the entry was gone from the store afterwards.
- **Settings.** Settings → Data read "233 bytes of 1 GB used"; the owner's panel showed under Administration.
- **Export ZIP, import into another account.** `GET /api/v1/export?format=zip` answered `application/zip`; importing it into a second account finished `done` with no errors, every file uploaded, and the PDF downloaded with its original bytes. A comment attachment became a task attachment (comments are not imported).
- **Encryption.** Enabling encryption in Settings re-wrote the content and then re-uploaded the three files as new encrypted attachments (`name` ciphertext, `encrypted: true`, served as `application/octet-stream`, bytes starting with `OTAT1`). A second session unlocked with the passphrase, opened the PDF and got an `application/pdf` blob with the original bytes.
- **Backup and restore.** A folder backup succeeded; `opentodo restore --data-dir <fresh>` restored it with all 8 files; the restored server served the second account's PDF with its original bytes.
- **Extension (10.1).** Loaded unpacked in Chromium (headless, persistent context): the service worker registered, version 0.5.0, `optional_host_permissions` present, and both the capture and the screenshot handlers available. `captureVisibleTab` and the permission prompt need a real click, so the screenshot hand-over itself is covered by the unit tests (`share-url.test.js`) and the capture screen's message tests. Firefox was not available on this machine; the manifest keeps the `background.scripts` entry Firefox uses.
- **Layout (11.2).** `ENGINES=chromium WIDTHS=360 THEMES=light,dark` on the inbox (task panel with files, a link and an image), the project (comment attachment), the capture screen with files, Settings → Data and Administration: OK.

## Decisions taken while implementing

- **Removing a file before it uploaded.** The bytes stay on the device until the removal has synced, then the uploader drops them, so an undo right after removing still has the file; a removed row is never uploaded. This keeps the spec's "never uploaded, dropped from the device" and makes the undo toast work offline.
- **Disabling encryption.** The file phase runs first, while the key record still exists, and the app waits until every decrypted file is stored on the server before it deletes the record (the spec's order). The content fields are then decrypted as before. If files cannot be confirmed (offline), encryption stays on and the user is told to try again.
- **`attachment.url` is free nullable text** (`kNullableText`), not an id-like string, so an encrypted link (ciphertext) passes validation.
- **Import of own ZIP exports** checks each file against the per-file limit and the account's total, like an upload; a file that does not fit is left out and listed among the job's errors.
- **`POST /share` fallback on the server.** If the share sheet reaches the server before the new service worker is active, the server redirects to `/share` with the text fields and `files=lost`, and the capture screen explains. The worker normally answers the POST on the device.
- **Extension without the host permission** opens the popup with `files=denied`, and the capture screen explains how to allow it. With the permission, the injected script posts the message until the page marks it received (the app may still be loading), and the page accepts one message only.
- **Service worker.** `injectManifest` with `src/sw.ts` (IIFE, so `importScripts('push-sw.js')` keeps working), its own `tsconfig.sw.json`, and `workbox-core`, `workbox-precaching`, `workbox-routing` 7.4.1 declared as dev dependencies (they were already installed through `vite-plugin-pwa`; no new download). The built worker is 17 KB (6 KB gzipped) and replaces the generated worker plus its separate Workbox chunk.
- **Dexie version 16** adds `attachments` and `attachmentBlobs`.
