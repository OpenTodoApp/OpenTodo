# Android store listing

The Android app's listing in the [Fastlane layout](https://f-droid.org/docs/All_About_Descriptions_Graphics_and_Screenshots/): F-Droid reads it from here for every build, and the Google Play listing is copied from the same texts. The recipe in `mobile/android/store/fdroid/app.opentodo.yml` carries no name, summary or description of its own.

**Why the repository root.** The recipe builds with `subdir: mobile/android/app`, but fdroidserver (2.4) looks for `fastlane/metadata/android/<locale>/` only at the root of the checked-out commit and under `src/<flavor>/`, never under a build's subdir. So the folder lives at the root. F-Droid reads it from the commit it built, so a change here reaches F-Droid with the next release.

| Path | What | Limit | Made by |
| --- | --- | --- | --- |
| `metadata/android/<locale>/title.txt` | the app's name | 50 characters | by hand |
| `metadata/android/<locale>/short_description.txt` | the summary | 80 characters | by hand |
| `metadata/android/<locale>/full_description.txt` | the description, plain text | 4,000 characters | by hand |
| `metadata/android/en-US/changelogs/<versionCode>.txt` | what changed for the app in that release | 500 characters | `make release-prepare` drafts it from the release's entries; rewrite it with the release's summary |
| `metadata/android/en-US/images/icon.png`, `featureGraphic.png` | the 512 px icon, the 1024 × 500 feature graphic | | `make brand-icons` |
| `metadata/android/en-US/images/phoneScreenshots/<n>.png` | phone screenshots | 3 to 8 | `make docs-screenshots` (the `store-*` shots) |

Locales: `en-US` (F-Droid's fallback, and the only one with images and release notes), `de-DE`, `es-ES`, `fr-FR`, `it-IT`, `pt-PT`, the app's six languages. The texts say what the app adds to the web app and that it needs the user's own OpenTodo server; keep them to what `docs/android-app.md` says. The version code is `major·10000 + minor·100 + patch`. `scripts/repo-checks.test.mjs` checks the locales, the limits, the images and that the latest release has its notes; `make android` checks that every locale is there.
