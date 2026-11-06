# Changelog fragments

The entries of the next release, one file per change. A pull request adds its own file here instead of editing `CHANGELOG.md`, so pull requests open at the same time never touch the same lines.

```
changelog.d/<Section>/<name>.md
```

- **Section**: `Added`, `Changed`, `Fixed`, `Security` or `Removed`, the folder the entry goes in.
- **Name**: the OpenSpec change name (`openspec/changes/<name>/`), or a short slug for a change without one: lowercase letters, digits and dashes, ending in `.md`. Two entries of one change in different sections can share the name.
- **Content**: the entry as `CHANGELOG.md` writes it, one bullet: `- **What changed, in a few words.** What a person notices, and what to do.` The leading `- ` can be left out. A file can hold more than one bullet; it has no heading.

For example, `changelog.d/Fixed/context-menu-move-project.md`:

```markdown
- **Move to project from a task's right-click menu works again.** Choosing a project in the menu moved the task to the Inbox instead.
```

`make release-prepare VERSION=x.y.z` (`scripts/release/prepare.mjs`) assembles the fragments into the new release's section of `CHANGELOG.md`, the sections in the order Security, Added, Changed, Removed, Fixed and the entries in each by file name, and deletes them. The person cutting the release then writes its summary paragraph and reorders entries if one should come first ([RELEASING.md](../RELEASING.md)).

`make repo-check` checks every path and file here, and that nothing is written under `## [Unreleased]` in `CHANGELOG.md` itself (`scripts/release/fragments.mjs`).
