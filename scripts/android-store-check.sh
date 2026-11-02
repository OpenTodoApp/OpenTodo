#!/usr/bin/env bash
# The two Android builds and their location permissions (OpenSpec change play-location-later).
#
#   scripts/android-store-check.sh <aab> <apk>
#
# - The AAB is the Google Play build (-Popentodo.play=true): its manifest, read with
#   bundletool (`dump manifest`), must not declare ACCESS_BACKGROUND_LOCATION,
#   ACCESS_FINE_LOCATION or ACCESS_COARSE_LOCATION until Play approves the
#   background-location declaration (mobile/android/store/play-background-location.md).
# - The APK is the GitHub and F-Droid build: its manifest, read with aapt2
#   (`dump permissions`), must still declare all three, since location reminders ship there.
# Both must declare INTERNET, so an empty or unreadable manifest never passes.
#
# Needs a JDK, the Android SDK with ANDROID_HOME set (aapt2 from build-tools 36.0.0, else the
# newest installed) and curl. BUNDLETOOL=<jar> uses that jar; otherwise the pinned release is
# downloaded once into ${RUNNER_TEMP:-${TMPDIR:-/tmp}} and checked against its SHA-256.
set -euo pipefail
shopt -s inherit_errexit

[ $# -eq 2 ] || { echo "usage: scripts/android-store-check.sh <aab> <apk>" >&2; exit 2; }
aab=$1
apk=$2
[ -f "$aab" ] || { echo "no such AAB: $aab" >&2; exit 2; }
[ -f "$apk" ] || { echo "no such APK: $apk" >&2; exit 2; }

BUNDLETOOL_VERSION=1.18.3
BUNDLETOOL_SHA256=a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29

jar=${BUNDLETOOL:-}
if [ -z "$jar" ]; then
  jar="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/bundletool-$BUNDLETOOL_VERSION.jar"
  if [ ! -f "$jar" ]; then
    curl -sSLf -o "$jar.part" "https://github.com/google/bundletool/releases/download/$BUNDLETOOL_VERSION/bundletool-all-$BUNDLETOOL_VERSION.jar"
    mv "$jar.part" "$jar"
  fi
  echo "$BUNDLETOOL_SHA256  $jar" | sha256sum -c --quiet - || { rm -f "$jar"; echo "bundletool checksum mismatch" >&2; exit 1; }
fi

sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
[ -n "$sdk" ] || { echo "set ANDROID_HOME to the Android SDK" >&2; exit 2; }
aapt2="$sdk/build-tools/36.0.0/aapt2"
[ -x "$aapt2" ] || aapt2=$(find "$sdk/build-tools" -mindepth 2 -maxdepth 2 -name aapt2 2>/dev/null | sort -V | tail -1)
[ -n "$aapt2" ] && [ -x "$aapt2" ] || { echo "no aapt2 in $sdk/build-tools" >&2; exit 2; }

# The permission names a manifest dump declares, one per line, sorted.
names() { grep 'uses-permission' | grep -o 'android\.permission\.[A-Z_]*' | sed 's/^android\.permission\.//' | sort -u; }

play=$(java -jar "$jar" dump manifest --bundle "$aab" | { names || true; })
direct=$("$aapt2" dump permissions "$apk" | { names || true; })

echo "Play AAB permissions: $(tr '\n' ' ' <<<"$play")"
echo "GitHub/F-Droid APK permissions: $(tr '\n' ' ' <<<"$direct")"

fail=0
for p in INTERNET; do
  grep -qx "$p" <<<"$play" || { echo "::error::the Play AAB has no $p: is this its manifest?"; fail=1; }
  grep -qx "$p" <<<"$direct" || { echo "::error::the APK has no $p: is this its manifest?"; fail=1; }
done
for p in ACCESS_BACKGROUND_LOCATION ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do
  if grep -qx "$p" <<<"$play"; then
    echo "::error::the Google Play AAB declares $p; location reminders stay out of the Play build until Play approves the declaration (build it with -Popentodo.play=true)"
    fail=1
  fi
  grep -qx "$p" <<<"$direct" || { echo "::error::the GitHub/F-Droid APK lost $p; location reminders ship there"; fail=1; }
done
[ "$fail" = 0 ] && echo "ok: the Play AAB has no location permission, the APK keeps all three"
exit "$fail"
