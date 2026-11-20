## 1. Build

- [x] 1.1 `markdown.ts`: `bareUrlAt` and `bareUrls`, the renderer's rule factored out and used by it
- [x] 1.2 `editorBareLinks.ts`: link decorations over bare addresses outside code and links; the paste filter for self-links; the plugin in every editor
- [x] 1.3 `markdownSlice`: a pasted address stays text
- [x] 1.4 Tests: `editorBareLinks.test.ts` (the rule, paste, decorations, code); notes editing "Web image stays a link" updated

## 2. Checks

- [x] 2.1 Web typecheck, lint and tests; `make openspec-validate`; `make repo-check`
