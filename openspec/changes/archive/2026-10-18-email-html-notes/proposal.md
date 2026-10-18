## Why

A newsletter forwarded to Email to task arrives as hard-to-read plain text (reported on issue #9 with a screenshot): the task opens with a tall empty block, and every link is spelled out as `Text <https://…several hundred characters…>`. Two causes. The importer prefers a message's plain-text part, and a newsletter's plain part spells out each tracking link. And newsletters hide a preview text followed by hundreds of invisible filler characters (U+034F, U+200C …), which survive as blank, wrapping lines. Task notes render Markdown (headings, emphasis, links, lists), so the HTML part can be kept far more readable.

## What Changes

- The task description is built from the message's **HTML part converted to notes Markdown** when there is one: headings become `#` headings, bold, italic and strikethrough are kept, lists (nested and ordered) become Markdown lists, line and paragraph breaks are kept, and links become `[text](url)` so long tracking addresses hide behind their text (an image link uses the image's description; a link whose text is its address shows the site name). Only `http` and `https` links stay links; anything else keeps its text only.
- Hidden content is dropped: elements styled `display:none` or `visibility:hidden` (the preview text), scripts, styles and other non-text elements, comments, images outside links, and invisible filler characters, in the HTML and in plain-text bodies.
- Text that the notes would read as formatting (`*`, `_`, `~`, `` ` ``, `[`, `]`, a line starting with `#`, `- ` or `1. `) is escaped, so it shows as written.
- The plain part is used when there is no HTML part, or when the HTML part has less than half its words (a stub some mailers send next to the real text).

Out of scope: rendering HTML itself (notes stay Markdown), images and tables as such (a table's cells become text), the share target and the importers. No new field, route, environment variable, dependency or migration.

Builds on `email-body-limit` (#164), whose limits apply to the Markdown unchanged. Advances the ROADMAP item `email-capture`.

## Impact

`internal/email/markdown.go` (new: the converter), `internal/email/parse.go` (part choice, filler removal), `internal/email/text.go` (the old HTML-to-text converter removed), tests and the `newsletter.eml` fixture with its golden Markdown, `web/src/lib/emailNotes.test.ts` (the notes parser reads the golden file as headings, lists and links), `docs/email.md`, CHANGELOG. The binary grows by a few KB; no dependency.
