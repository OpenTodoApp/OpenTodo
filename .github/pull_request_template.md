## What and why

<!-- What does this change, and why? Link the issue or the OpenSpec change. -->

## Checklist

- [ ] Behaviour changes start as an OpenSpec change (`openspec/changes/<name>/`), or this PR has none
- [ ] `make check` passes locally
- [ ] Data writes go through ops (no direct task/project row writes)
- [ ] New API routes use `requireAuth` (or the spec says why not)
- [ ] No telemetry, no new third-party requests, no new mandatory env vars
- [ ] Docs and `CHANGELOG.md` updated; size impact noted for new dependencies
- [ ] Templates only: I wrote the template in `templates/` (or may license it) and agree to publish it under CC BY 4.0; `make templates` is committed
