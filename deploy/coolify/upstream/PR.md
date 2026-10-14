# Pull request for coollabsio/coolify

## Title

```
feat(service): add OpenTodo
```

## Before you paste

- Coolify's template says the **Changes** and **Why** sections must be written by a person, not by an AI. The body below leaves them for you. Write two or three sentences in your own words from the notes here.
  - Changes: adds one template (one container, one named volume, health check, no required variables) and its SVG logo; nothing else in the repository changes.
  - Why: OpenTodo is a self-hosted, local-first task manager (AGPL-3.0) that already runs on Coolify; a one-click entry saves users from pasting a compose file, and the template follows the current conventions (SERVICE_URL with port, pinned image line, optional variables with defaults).
- Replace `#NNNN` with the discussion or issue you opened first (CONTRIBUTING: every PR should reference one), and add the link to the docs pull request in coollabsio/coolify-docs.
- Tick the boxes only after you have done what they say. Add a screenshot of the running service (Preview).
- The last agreement box speaks of "a local development instance of Coolify". Tick it only if that is true; otherwise test on one first (HOW-TO-SUBMIT.md) or say in Testing which instance you used.
- The body below is about 1,850 characters, which leaves about 600 for Changes and Why. Keep the total under 2,500 characters and use at most 5 inline code spans; Coolify's PR quality check closes PRs that break these limits. Do not add any "Generated with ..." line.

## Body (paste everything below the line)

---

## Changes

- 

## Why



## Issues

- Closes #NNNN
- Docs PR: https://github.com/coollabsio/coolify-docs/pull/NNNN

## Category

- [ ] Bug fix
- [ ] Improvement
- [ ] New feature
- [x] Adding new one click service
- [ ] Fixing or updating existing one click service

## Preview

(screenshot)

## AI Assistance

- [ ] AI was NOT used to create this PR
- [x] AI was used (please describe below)

**If AI was used:**

- Tools used: Claude Code
- How extensively: drafted the template, logo and this text after comparing with existing templates and Coolify's parser. I reviewed every line and tested it myself (below).

## Testing

Coolify v4.x.x (fill in), Docker Compose Empty:

- [ ] Pasted the template, set an https domain, deployed: healthy
- [ ] First visit creates the owner; then sign-up is closed
- [ ] App uses the https domain; a passkey can be added
- [ ] Data survives Restart and Redeploy
- [ ] A variable set in the UI reaches the container

[Repository](https://github.com/pixari/opentodo), [docs](https://open-todo.app/docs/self-hosting/coolify/), [demo](https://demo.open-todo.app). Image ghcr.io/pixari/opentodo:0.3 (amd64, arm64), AGPL-3.0.

## Contributor Agreement

> [!IMPORTANT]
>
> - [ ] I have read and understood the [contributor guidelines](https://github.com/coollabsio/coolify/blob/HEAD/CONTRIBUTING.md). If I have failed to follow any guideline, I understand that this PR may be closed without review.
> - [ ] I have searched [existing issues](https://github.com/coollabsio/coolify/issues) and [pull requests](https://github.com/coollabsio/coolify/pulls) (including closed ones) to ensure this isn't a duplicate.
> - [ ] I have tested all the changes thoroughly with a local development instance of Coolify and I am confident that they will work as expected when a maintainer tests them.
