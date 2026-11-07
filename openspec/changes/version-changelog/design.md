# Design

## D1 — The changelog stays the website's

The published changelog renders every release with its summary, its section headings and its
own resolution of the `docs/…` links that `CHANGELOG.md` writes relative to the repository.
A copy inside the app has none of that, and it drifts the moment a release is cut:
`make release-prepare` rewrites `CHANGELOG.md`, so a compiled module is stale after every
release and a check that compares them fails on `main` until someone rebuilds it. So the row
links out. `changelogUrl()` builds the anchor the site publishes for each release
(`x.y.z` → `#vx-y-z`); a version without an anchor — `dev+abc1234`, or a release candidate
the site lists under its final release — opens the page's newest release.

The cost is a page that needs a connection, like every other link on the About section. In
exchange nothing is generated, committed, checked on every release or paid for in the
bundle.

## D2 — The number offline comes from the build, not from `package.json`

The row shows the server's version (`useServerVersion()`, the call the About card already
makes) and falls back to `__APP_VERSION__`, inlined by a `define` in `vite.config.ts`. A
named import of `package.json` would put its scripts and `devDependencies` in the bundle —
the workbench test's concern and the bundle budget's — while the `define` carries the one
string.

## D3 — One control, in the row's own idiom

The value is an anchor styled like the section's other `ui-btn--secondary` external links,
with the same external-link icon, opening in a new tab. It reuses `SettingRow` and the row
copy in `settingsCopy.ts`, so the settings search, the section's anatomy test and the visual
baselines all see one more row rather than a new pattern.
