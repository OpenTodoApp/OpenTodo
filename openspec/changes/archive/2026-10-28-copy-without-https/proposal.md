## Why

Copy buttons did nothing on a server opened by its LAN address over plain http (issue #525): the asynchronous Clipboard API exists only in secure contexts (https, localhost), so `navigator.clipboard` was undefined there. Some buttons failed silently, others threw, one (the encryption recovery key) even said "Copied" without copying. Plain http on the LAN is how many people run OpenTodo at home.

## What Changes

- One helper, `copyText`, behind every Copy button (the MCP and token secrets, invite and public links, reset links, the email-to-task address, CalDAV details, notification channel secrets, recovery codes and key, the task link, the bookmarklet): the Clipboard API where it exists, otherwise the older copy command on a hidden field, which browsers still allow during a click.
- A button says "Copied" only when the text is on the clipboard; where neither way works, the existing "copy it manually" hints appear as before.

Not **BREAKING**: no data, no API, no setting.

## Out of scope

- Reading from the clipboard (paste) on plain http.

## Roadmap

Fixes #525 for `web-app` (ROADMAP section 7, self-hosting on plain http).

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-app`: copy buttons work without https.

## Impact

- New `web/src/lib/clipboard.ts`; the 15 call sites in `web/src/app` use it. No dependency; a few hundred bytes.
