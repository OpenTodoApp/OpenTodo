#!/bin/sh
# Path filters for CI (OpenSpec site-bundle D7). Reads changed file names on
# stdin and prints `code=true|false` and `docs=true|false` for $GITHUB_OUTPUT.
# Conservative: anything that can change the binary, the web app or the CI
# itself counts as code (skills/ is embedded in the binary, scripts/deploy*
# generate and check the deploy/ templates); docs/ and the changelog (CHANGELOG.md and
# its fragments in changelog.d/) count as docs. templates/ is compiled into the web app (template-library).
# mobile/android is the Android app (native-shells D9), with its store listing in fastlane/, and mobile/ios the iOS app
# (ios-shell D7): each has its own answer, so an iOS-only change does not run the
# Android job. Both also run when the workflow or this filter changes; iOS is
# separate because a macOS runner costs ten times an Ubuntu one, which is also why
# a Makefile edit deliberately starts the other jobs but not that one — a broken
# `make ios` shows up with the next mobile/ios change. Tiered CI (ci-speed): on a pull
# request `ui` gates the workbench checks (Storybook a11y and visual), `layout` the
# one browser layout and end-to-end job, `a11y` the accessibility gate on real screens,
# `extension`, `obsidian` and `skill` their packages;
# every one of them is true when the workflow or this filter changes.
# The native app (native-app-foundation D9): `app`, its Linux checks, for mobile/app/,
# a shared module listed in mobile/app/shared-modules.json, the op schema, the
# catalogs it loads and the Makefile (and the workflow or this filter); `app_native`,
# its iOS and Android builds (app-native.yml), only for mobile/app/ itself and that
# workflow, so a shared-module change never starts a Mac.
# Cases: scripts/repo-checks.test.mjs.
set -eu
files=$(cat)
code_files=$files
code=false
docs=false
mobile=false
if printf '%s\n' "$code_files" | grep -qE '^(internal/|cmd/|web/|extension/|deploy/|skills/|go\.(mod|sum)$|Dockerfile|\.dockerignore$|docker-compose\.yml$|Makefile$|\.github/|templates/|scripts/(e2e-layout|e2e-safe-area|e2e-smoke|e2e-views|e2e-offline|cli-smoke|ui-check|coolify|deploy|ci-changes|repo-checks|templates-|release/|bundle-budget))'; then
  code=true
fi
if printf '%s\n' "$files" | grep -qE '^(docs/|website/|CHANGELOG\.md$|changelog\.d/|README\.md$|openspec/|scripts/(site-bundle|e2e-docs|screenshots|docs-screenshots))'; then
  docs=true
fi
if printf '%s\n' "$files" | grep -qE '^(mobile/android/|fastlane/|\.github/workflows/ci\.yml$|scripts/ci-changes\.sh$)'; then
  mobile=true
fi
# Changes to CI itself run every tier, so a workflow edit is tested by its own run.
ci='\.github/workflows/ci\.yml$|scripts/ci-changes\.sh$'
match() { printf '%s\n' "$code_files" | grep -qE "^($1|$ci)" && echo true || echo false; }
ui=$(match 'web/src/|web/public/|web/\.storybook/|web/index\.html$|web/package(-lock)?\.json$|web/vite\.config\.ts$|scripts/ui-check/')
layout=$(match 'web/|internal/|cmd/opentodo/|templates/|go\.(mod|sum)$|Makefile$|scripts/(e2e-|ux-audit/)')
# The accessibility gate on real screens (accessibility-aa D1): the web app and the audit scripts.
a11y=$(match 'web/|scripts/ux-audit/')
extension=$(match 'extension/|Makefile$')
# The Obsidian plugin (obsidian-plugin task 6.4): its folder and the shared code it bundles.
obsidian=$(match 'obsidian/|web/src/lib/nlp/|web/src/lib/e2eeEnvelope\.ts$|web/src/lib/crypto\.ts$|web/src/lib/hlc\.ts$|web/src/lib/recurrence\.ts$|web/src/lib/i18n/format\.ts$|web/src/lib/taskOrigin\.ts$|web/src/lib/ids\.ts$|web/src/lib/moduleState\.ts$|web/src/lib/types\.ts$|web/src/lib/theme/|web/src/lib/colourMath\.ts$|web/src/generated/opSchema\.ts$|internal/vault/testdata/|internal/origin/testdata/|internal/httpapi/sync_handlers\.go$|Makefile$')
skill=$(match 'skills/|Makefile$')
# The TestFlight job's archive script is checked by the iOS job (ios-distribution D9).
ios=$(match 'mobile/ios/|scripts/release/ios-testflight\.sh$')
# The list's paths (one quoted path per line, so no JSON parser), as anchored patterns.
list="$(cd "$(dirname "$0")/.." && pwd)/mobile/app/shared-modules.json"
shared=$(sed -n 's/^ *"\(web\/[^"]*\)",\{0,1\}$/\1/p' "$list" | sed 's/[.]/\\./g; s/$/$/' | paste -sd '|' -)
app=$(match "mobile/app/|\\.github/workflows/app-native\\.yml\$|web/src/generated/opSchema\\.ts\$|web/src/locales/|Makefile\$${shared:+|$shared}")
app_native=false
if printf '%s\n' "$files" | grep -qE '^(mobile/app/|\.github/workflows/app-native\.yml$)'; then app_native=true; fi
echo "code=$code"
echo "docs=$docs"
echo "mobile=$mobile"
echo "ui=$ui"
echo "layout=$layout"
echo "a11y=$a11y"
echo "extension=$extension"
echo "obsidian=$obsidian"
echo "skill=$skill"
echo "ios=$ios"
echo "app=$app"
echo "app_native=$app_native"
