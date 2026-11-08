#!/bin/bash
# The macOS half of the iOS TestFlight upload (OpenSpec change ios-distribution, D5): the steps
# that need Xcode. scripts/release/appstore.mjs does everything that talks to App Store Connect.
#
#   ios-testflight.sh xcode                                    select the newest stable Xcode
#   ios-testflight.sh archive <archive> <version> <build> [team]
#                                                              archive unsigned, then sign ad hoc
#   ios-testflight.sh csr <dir>                                a new private key and its CSR
#   ios-testflight.sh keychain <dir>                           this run's keychain and profiles
#   ios-testflight.sh export <archive> <dir> <out>             sign for the App Store, write the .ipa
#   ios-testflight.sh upload <ipa> <app-id> <version> <build>  upload with the API key (altool)
#   ios-testflight.sh cleanup <dir>                            delete keychain, profiles and key
#
# Why the archive is unsigned: signing while building needs a development certificate and
# profile, which need a registered device and Xcode's own sign-in. So the archive is built with
# CODE_SIGNING_ALLOWED=NO and signed ad hoc with each target's entitlements, and the export signs
# it for the App Store with the certificate and profiles appstore.mjs made through the REST API.
# The same `archive` runs on every iOS pull request (with a placeholder team), so this path is
# checked long before a release needs it.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
ios="$root/mobile/ios"
openssl=/usr/bin/openssl # LibreSSL: its .p12 files are the ones `security import` reads
keychain_name=opentodo-testflight.keychain-db
profile_dirs=("$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles")

die() { echo "::error::$*"; exit 1; }

cmd=${1:-}
shift || true
case "$cmd" in
xcode)
  # App Store Connect takes builds made with a current SDK only; the runner's default Xcode can be
  # older than the newest one it has installed.
  newest=$(ls -d /Applications/Xcode_*.app 2>/dev/null | grep -E '/Xcode_[0-9.]+\.app$' | sort -V | tail -1 || true)
  [ -n "$newest" ] || die "no Xcode_<version>.app in /Applications"
  sudo xcode-select -s "$newest/Contents/Developer"
  xcodebuild -version
  ;;

archive)
  archive=$1 version=$2 build=$3 team=${4:-XXXXXXXXXX}
  xcodebuild archive -quiet -project "$ios/OpenTodo.xcodeproj" -scheme OpenTodo -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$archive" -derivedDataPath "$ios/build/archive" \
    CODE_SIGNING_ALLOWED=NO OPENTODO_VERSION="$version" CURRENT_PROJECT_VERSION="$build"
  app="$archive/Products/Applications/OpenTodo.app"
  [ -d "$app" ] || die "no app in $archive"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  # What Xcode adds when it signs: the application identifier and the team.
  sign() { # <bundle> <entitlements>
    local id e
    id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$1/Info.plist")
    e="$tmp/$(basename "$1").plist"
    cp "$2" "$e"
    /usr/libexec/PlistBuddy -c "Add :application-identifier string $team.$id" -c "Add :com.apple.developer.team-identifier string $team" "$e"
    codesign --force --sign - --timestamp=none --generate-entitlement-der --entitlements "$e" "$1"
  }
  # Inside out: the extensions, then the app that holds them.
  for appex in "$app"/PlugIns/*.appex; do
    name=$(basename "$appex" .appex)
    sign "$appex" "$ios/$name/$name.entitlements"
  done
  sign "$app" "$ios/OpenTodo/OpenTodo.entitlements"
  codesign --verify --deep --strict "$app"
  for b in "$app" "$app"/PlugIns/*.appex; do
    codesign -d --entitlements - --xml "$b" 2>/dev/null | grep -q 'group.app.open-todo.ios' || die "$(basename "$b") lost the App Group entitlement"
  done
  short=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Info.plist")
  bundle=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Info.plist")
  [ "$short" = "$version" ] && [ "$bundle" = "$build" ] || die "the app carries $short ($bundle), expected $version ($build)"
  echo "archived $app: version $short build $bundle, signed ad hoc with its entitlements"
  ;;

csr)
  dir=$1
  mkdir -p "$dir"
  chmod 700 "$dir"
  "$openssl" req -new -newkey rsa:2048 -nodes -keyout "$dir/key.pem" -out "$dir/csr.pem" -subj "/CN=OpenTodo CI/O=OpenTodo" 2>/dev/null
  chmod 600 "$dir/key.pem"
  ;;

keychain)
  dir=$1
  pass=$("$openssl" rand -hex 24)
  p12pass=$("$openssl" rand -hex 24)
  "$openssl" x509 -inform der -in "$dir/distribution.cer" -out "$dir/distribution.pem"
  "$openssl" pkcs12 -export -inkey "$dir/key.pem" -in "$dir/distribution.pem" -out "$dir/identity.p12" -passout "pass:$p12pass"
  kc="$HOME/Library/Keychains/$keychain_name"
  security delete-keychain "$kc" 2>/dev/null || true
  security create-keychain -p "$pass" "$kc"
  security set-keychain-settings -lut 3600 "$kc"
  security unlock-keychain -p "$pass" "$kc"
  security import "$dir/identity.p12" -k "$kc" -P "$p12pass" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
  # The intermediate that issues Apple Distribution certificates, in case the image lacks it.
  if curl -fsSL --retry 3 -o "$dir/wwdr.cer" https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer; then
    security import "$dir/wwdr.cer" -k "$kc" >/dev/null 2>&1 || true
  fi
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$pass" "$kc" >/dev/null
  # shellcheck disable=SC2046
  security list-keychains -d user -s "$kc" $(security list-keychains -d user | tr -d '"')
  rm -f "$dir/identity.p12" "$dir/key.pem"
  security find-identity -v -p codesigning "$kc" | tee "$dir/identities.txt"
  grep -q 'Apple Distribution' "$dir/identities.txt" || die "the new certificate is not a valid signing identity on this runner"
  for d in "${profile_dirs[@]}"; do
    mkdir -p "$d"
    cp "$dir"/profiles/*.mobileprovision "$d/"
  done
  ;;

export)
  archive=$1 dir=$2 out=$3
  xcodebuild -exportArchive -archivePath "$archive" -exportPath "$out" -exportOptionsPlist "$dir/ExportOptions.plist"
  ipa=$(ls "$out"/*.ipa 2>/dev/null | head -1)
  [ -n "$ipa" ] || die "the export wrote no .ipa"
  echo "exported $ipa ($(du -k "$ipa" | cut -f1) KB)"
  ;;

upload)
  ipa=$1 app_id=$2 version=$3 build=$4
  [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ] && [ -n "${ASC_KEY_FILE:-}" ] || die "ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_FILE must be set"
  keys=$(dirname "$ASC_KEY_FILE")
  [ "$(basename "$ASC_KEY_FILE")" = "AuthKey_$ASC_KEY_ID.p8" ] || die "altool finds the key only as AuthKey_<key id>.p8"
  log=$(mktemp)
  # altool's exit code is not reliable across Xcode versions; its own success line is.
  API_PRIVATE_KEYS_DIR="$keys" xcrun altool --upload-package "$ipa" -t ios --apple-id "$app_id" \
    --bundle-id app.open-todo.ios --bundle-short-version-string "$version" --bundle-version "$build" \
    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID" 2>&1 | tee "$log" || true
  grep -qE 'UPLOAD SUCCEEDED|No errors uploading' "$log" || die "the upload of $version ($build) failed; altool's answer is above"
  ;;

cleanup)
  dir=$1
  security delete-keychain "$HOME/Library/Keychains/$keychain_name" 2>/dev/null || true
  if [ -d "$dir/profiles" ]; then
    for p in "$dir"/profiles/*.mobileprovision; do
      [ -e "$p" ] || continue
      for d in "${profile_dirs[@]}"; do rm -f "$d/$(basename "$p")"; done
    done
  fi
  rm -rf "$dir"
  ;;

*)
  echo "usage: $0 xcode|archive|csr|keychain|export|upload|cleanup …" >&2
  exit 2
  ;;
esac
