# Mail fixtures

What `mail.js` reads from a message open in Gmail or Outlook on the web: the tab's
address, the tab's title and the sender from the message header. `mail.test.js`
runs `recognizeMail` on every file here and compares the result with `expect`
(`null` means "filled like any page").

Each file holds `about`, `url`, `title`, `header` (`{name, email}` as
`readMailHeader` returns it, or `null` when it cannot be read) and `expect`. No
message body is ever captured. Every address uses an `example` domain (the test
fails on any other), and ids are made up in the clients' shapes.

## Refreshing them

When Gmail or Outlook changes its page, a capture has no "From:" line (never an
error). To check and refresh:

1. Open a message in the client, in the browser with the extension loaded unpacked.
2. Open the popup's developer tools and run, on the mail tab:
   `chrome.scripting.executeScript({target: {tabId}, func: readMailHeader, args: [HEADER_SELECTORS.gmail]})`
   (import both from `mail.js`). A `null` result means the selectors in
   `HEADER_SELECTORS` need updating: inspect the sender element of the open
   message and change the table.
3. Copy the tab's title and address into a fixture, replace every real address
   and name with made-up ones on `example` domains, and replace the id with a
   made-up one of the same shape.
4. Run `node --test extension/mail.test.js`.

The current files are synthetic: they follow the title, address and attribute
shapes the clients used when this was written, not a recorded session.
