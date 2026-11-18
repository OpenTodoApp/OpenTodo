## Why

Issue #1530. In the rich-text editor, an address typed as text (`https://example.com`) stays plain text and can't be opened. An address pasted from another app becomes a Markdown link, `[https://example.com/](https://example.com/)`, whose text and target can drift apart once someone edits the text. The read-only views already show bare addresses as links (`markdown.ts`); the editor doesn't.

## What Changes

- **Bare addresses read as links in the editor.** An `http(s)` address in a note's text, outside code and outside a link, shows as a link, and Ctrl/Cmd-click opens it in a new tab, as for any link. It's a presentation only: the note stores the address as typed, so editing it changes where it points. The rule is the one the read-only views use.
- **Pasting keeps the address bare.** A pasted plain-text address stays text. A pasted link whose text is its own address (a trailing slash aside), as browsers and many apps put on the clipboard, loses the link and stays text. A link with other text is kept.
- **Not in this change:** opening a link with a tap on touch screens (#1529).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: a new requirement, "Bare addresses read as links"; "Images from attachments" changes its pasted-address scenario.

## Impact

- `web/src/lib/editorBareLinks.ts`, which is new: the decoration plugin and the paste filter.
- `web/src/lib/markdown.ts`: `bareUrlAt`, `bareUrls`, the one address rule.
- `web/src/lib/richtextEditor.ts`: the plugin, and `markdownSlice` keeping a pasted address bare.
- Every place the editor is used gets it: task, project and standalone notes, and the comment composer.
- No stored data, op or server change. Notes that already hold `[url](url)` links keep them.
