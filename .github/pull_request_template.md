## What and why

<!-- What does this change, and why? Link the issue or the OpenSpec change. -->

## Checklist

- [ ] Behaviour changes start as an OpenSpec change (`openspec/changes/<name>/`), or this PR has none
- [ ] One change per pull request; `make check` passes locally
- [ ] Commits credit every author, AI tools included, with a `Co-Authored-By` trailer
- [ ] Data writes go through ops (no direct task/project row writes)
- [ ] New API routes are registered with a policy in `internal/httpapi/policy.go` (`public("reason")` only when the spec says so)
- [ ] No telemetry, no new third-party requests, no new mandatory env vars
- [ ] Docs updated and a changelog entry added as `changelog.d/<Section>/<name>.md` (not in `CHANGELOG.md`); size impact noted for new dependencies
- [ ] Templates only: I wrote the template in `templates/` (or may license it) and agree to publish it under CC BY 4.0; `make templates` is committed
