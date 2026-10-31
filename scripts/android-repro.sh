#!/usr/bin/env bash
# Reproducible Android builds (OpenSpec change play-production D4, D5).
#
#   scripts/android-repro.sh <tag-or-commit> [apk]
#
# Checks the ref out in a temporary directory and builds the unsigned release
# APK there, with OPENTODO_VERSION taken from the tag (v0.20.0 → 0.20.0).
# - With an APK (a release asset, signed): compares it with the local build by
#   copying its signature onto the build (`apksigcopier compare`); a match means
#   the release APK is exactly this source, apart from the signature.
# - Without one: builds the ref a second time in another directory, with another
#   SOURCE_DATE_EPOCH and an empty Gradle cache, and compares the two builds.
# On a mismatch it names the files inside the APK that differ, and exits 1.
#
# Needs a JDK 17 (CI and the F-Droid recipe use 17; mobile/README.md names the
# exact one), the Android SDK with ANDROID_HOME set, git, python3, and for the
# first form apksigcopier:
#   python3 -m pip install --require-hashes -r scripts/release/requirements-repro.txt
# REPRO_WORKDIR keeps the checkouts in a directory of your choice (default: a
# new temporary directory, deleted afterwards). REPRO_CLEAN_CACHE=1 gives every
# build an empty Gradle cache (CI on tags; by default only the second build of
# the two-build form gets one). REPRO_TOUCH=<strings.xml> changes the first
# string of that file in the second checkout only, to see a mismatch named (the
# self-test).
set -euo pipefail
shopt -s inherit_errexit

usage() { echo "usage: scripts/android-repro.sh <tag-or-commit> [apk]" >&2; exit 2; }
[ $# -ge 1 ] && [ $# -le 2 ] || usage
ref=$1
apk=${2:-}
root=$(cd "$(dirname "$0")/.." && pwd)

sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
[ -n "$sdk" ] || { echo "set ANDROID_HOME to the Android SDK" >&2; exit 2; }
if [ -n "$apk" ]; then
  [ -f "$apk" ] || { echo "no such APK: $apk" >&2; exit 2; }
  apk=$(cd "$(dirname "$apk")" && pwd)/$(basename "$apk")
  command -v apksigcopier >/dev/null || {
    echo "apksigcopier is needed to compare with a signed APK:" >&2
    echo "  python3 -m pip install --require-hashes -r scripts/release/requirements-repro.txt" >&2
    exit 2
  }
  # apksigcopier verifies with apksigner: the pinned build tools, else the newest installed.
  if ! command -v apksigner >/dev/null; then
    tools="$sdk/build-tools/36.0.0"
    [ -x "$tools/apksigner" ] || tools=$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1)
    [ -n "$tools" ] && [ -x "$tools/apksigner" ] || { echo "no apksigner in $sdk/build-tools" >&2; exit 2; }
    PATH="$tools:$PATH"
  fi
fi
commit=$(git -C "$root" rev-parse --verify --quiet "$ref^{commit}") || { echo "unknown tag or commit: $ref (git fetch --tags?)" >&2; exit 2; }

# The version comes from the tag only, as in CI; any other ref builds as 0.0.0-dev.
case "$ref" in
  v[0-9]*) version=${ref#v} ;;
  *) version=${OPENTODO_VERSION:-0.0.0-dev} ;;
esac

if [ -n "${REPRO_WORKDIR:-}" ]; then
  work=$REPRO_WORKDIR
  mkdir -p "$work"
else
  work=$(mktemp -d "${TMPDIR:-/tmp}/opentodo-repro.XXXXXX")
  trap 'rm -rf "$work"' EXIT
fi

# build <dir> <epoch> [gradle-home] (an empty one means the default cache): a clean checkout of $commit in <dir>, then its unsigned release APK.
build() {
  local dir=$1 epoch=$2 home=${3:-}
  rm -rf "$dir"
  git clone --quiet --no-checkout "$root" "$dir"
  git -C "$dir" -c advice.detachedHead=false checkout --quiet "$commit"
  if [ -n "${REPRO_TOUCH:-}" ] && [ "$dir" = "$work/b" ]; then
    sed -i '0,/<string name="[^"]*">/s//&~/' "$dir/$REPRO_TOUCH"
  fi
  echo "building $ref ($commit, version $version) in $dir" >&2
  (
    cd "$dir/mobile/android"
    [ -n "$home" ] && export GRADLE_USER_HOME="$home"
    SOURCE_DATE_EPOCH=$epoch OPENTODO_VERSION=$version ./gradlew --no-daemon --quiet :app:assembleRelease >&2
  )
  echo "$dir/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk"
}

# Names the entries that differ between two APKs, apart from the v1 signature files.
diff_entries() {
  python3 -I - "$1" "$2" <<'EOF'
import re, sys, zipfile
sig = re.compile(r'^META-INF/([^/]+\.(SF|RSA|DSA|EC)|MANIFEST\.MF)$')
def entries(p):
    with zipfile.ZipFile(p) as z:
        return {i.filename: (i.CRC, i.file_size) for i in z.infolist() if not sig.match(i.filename)}
a, b = entries(sys.argv[1]), entries(sys.argv[2])
bad = sorted(n for n in a.keys() | b.keys() if a.get(n) != b.get(n))
for n in bad:
    what = 'only in the first' if n not in b else 'only in the second' if n not in a else 'differs'
    print(f'  {what}: {n}')
if not bad:
    print('  every entry is equal; the archive layout (order, alignment, compression) differs')
EOF
}

first_home=
[ "${REPRO_CLEAN_CACHE:-}" = 1 ] && first_home="$work/gradle-home-a"
first=$(build "$work/a" 1000000000 "$first_home") || exit 1
if [ -n "$apk" ]; then
  echo "comparing $apk with the build of $ref" >&2
  if apksigcopier compare "$apk" --unsigned "$first"; then
    echo "match: $(basename "$apk") is the build of $ref ($commit), apart from its signature"
    exit 0
  fi
  echo "MISMATCH: $(basename "$apk") is not the build of $ref:" >&2
  diff_entries "$apk" "$first" >&2
  exit 1
fi

second=$(build "$work/b" 1700000000 "$work/gradle-home") || exit 1
if cmp -s "$first" "$second"; then
  echo "match: two builds of $ref ($commit) are identical ($(wc -c < "$first") bytes, sha256 $(sha256sum "$first" | cut -d' ' -f1))"
  exit 0
fi
echo "MISMATCH: two builds of $ref differ:" >&2
diff_entries "$first" "$second" >&2
exit 1
