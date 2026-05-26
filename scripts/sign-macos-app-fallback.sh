#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"

app_bundle_override=""
symlink_mode="materialize"

usage() {
  cat <<'EOF'
Usage: GECKO_CHECKOUT_DIR=/path/to/firefox-esr bash scripts/sign-macos-app-fallback.sh [--app <Nodely.app>] [--check-symlinks]

Ad-hoc signs the packaged macOS .app with Mozilla's developer entitlements.
Use this only for the non-notarized macOS ZIP fallback.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      app_bundle_override="$2"
      shift 2
      ;;
    --check-symlinks)
      symlink_mode="check"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${GECKO_CHECKOUT_DIR:-}" ]]; then
  echo "GECKO_CHECKOUT_DIR is required." >&2
  exit 1
fi

checkout_dir="$(cd "$GECKO_CHECKOUT_DIR" && pwd)"
dist_dir="$checkout_dir/obj-nodely/dist"

if [[ ! -d "$dist_dir" ]]; then
  echo "Gecko dist directory not found: $dist_dir" >&2
  exit 1
fi

if [[ -n "$app_bundle_override" ]]; then
  app_bundle="$app_bundle_override"

  if [[ ! -d "$app_bundle" ]]; then
    echo "macOS app bundle not found: $app_bundle" >&2
    exit 1
  fi
else
  app_bundles=()
  while IFS= read -r app_bundle; do
    app_bundles+=("$app_bundle")
  done < <(find "$dist_dir" -mindepth 1 -maxdepth 1 -type d -name '*.app' | sort)

  if [[ ${#app_bundles[@]} -ne 1 ]]; then
    echo "Expected exactly one macOS app bundle under $dist_dir, found ${#app_bundles[@]}." >&2
    printf '  %s\n' "${app_bundles[@]}" >&2 || true
    exit 1
  fi

  app_bundle="${app_bundles[0]}"
fi

entitlements_dir="$checkout_dir/security/mac/hardenedruntime/developer"

if [[ "$symlink_mode" == "check" ]]; then
  node "$repository_root/scripts/materialize-macos-app-symlinks.mjs" --check "$app_bundle"
else
  node "$repository_root/scripts/materialize-macos-app-symlinks.mjs" "$app_bundle"
fi

echo "Removing Gecko build metadata files from $app_bundle"
find "$app_bundle/Contents" -name moz.build -type f -print -delete

echo "Stripping extended attributes and existing signatures from $app_bundle"
xattr -cr "$app_bundle"
while IFS= read -r -d '' signing_path; do
  codesign --remove-signature "$signing_path" >/dev/null 2>&1 || true
done < <(find "$app_bundle" -print0)

run_logged() {
  local label="$1"
  shift

  local output=""
  local status=0

  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e

  if [[ -n "$output" ]]; then
    printf '%s\n' "$output"
  fi

  if [[ "$status" -ne 0 ]]; then
    local message="${output:-Command exited with status $status.}"
    message="${message//'%'/'%25'}"
    message="${message//$'\r'/'%0D'}"
    message="${message//$'\n'/'%0A'}"
    echo "::error title=$label failed::$message"
    return "$status"
  fi
}

sign_existing_paths() {
  local label="$1"
  shift

  local entitlement_file=""
  if [[ "${1:-}" == "--entitlements" ]]; then
    entitlement_file="$2"
    shift 2
  fi

  local paths=()
  local pattern=""
  local matched_path=""

  for pattern in "$@"; do
    while IFS= read -r matched_path; do
      if [[ -n "$matched_path" ]]; then
        paths+=("$matched_path")
      fi
    done < <(compgen -G "$pattern" | sort)
  done

  if [[ ${#paths[@]} -eq 0 ]]; then
    echo "Skipping $label; no matching paths were present."
    return 0
  fi

  echo "Ad-hoc signing $label (${#paths[@]} path(s))."

  local codesign_command=(codesign --sign - --force --timestamp=none --options runtime)
  if [[ -n "$entitlement_file" ]]; then
    codesign_command+=(--entitlements "$entitlement_file")
  fi

  local path_to_sign=""
  for path_to_sign in "${paths[@]}"; do
    run_logged "codesign $label" "${codesign_command[@]}" "$path_to_sign"
  done
}

sign_existing_paths "plugin container" \
  --entitlements "$entitlements_dir/plugin-container.xml" \
  "$app_bundle/Contents/MacOS/plugin-container.app"

sign_existing_paths "media plugin helper" \
  --entitlements "$entitlements_dir/media-plugin-helper.xml" \
  "$app_bundle/Contents/MacOS/media-plugin-helper.app"

sign_existing_paths "utility helpers" \
  --entitlements "$entitlements_dir/utility.xml" \
  "$app_bundle/Contents/MacOS/crashhelper" \
  "$app_bundle/Contents/MacOS/crashreporter.app" \
  "$app_bundle/Contents/MacOS/updater.app/Contents/Frameworks/UpdateSettings.framework" \
  "$app_bundle/Contents/MacOS/updater.app/Contents/MacOS/org.mozilla.updater" \
  "$app_bundle/Contents/MacOS/updater.app" \
  "$app_bundle/Contents/Library/LaunchServices/org.mozilla.updater" \
  "$app_bundle/Contents/MacOS/pingsender" \
  "$app_bundle/Contents/MacOS/nmhproxy" \
  "$app_bundle/Contents/MacOS/http3server" \
  "$app_bundle/Contents/MacOS/xpcshell" \
  "$app_bundle/Contents/MacOS/pk12util" \
  "$app_bundle/Contents/MacOS/certutil" \
  "$app_bundle/Contents/MacOS/ssltunnel" \
  "$app_bundle/Contents/Frameworks/ChannelPrefs.framework"

sign_existing_paths "browser libraries" \
  "$app_bundle/Contents/MacOS/XUL" \
  "$app_bundle/Contents/MacOS/"'*.dylib' \
  "$app_bundle/Contents/Resources/gmp-clearkey/"'*/*.dylib'

sign_existing_paths "browser app bundle" \
  --entitlements "$entitlements_dir/browser.xml" \
  "$app_bundle"

if ! run_logged "codesign strict verify" codesign --verify --deep --strict --verbose=2 "$app_bundle"; then
  echo "::warning title=Retrying macOS ad-hoc app signing::Strict verification failed after targeted signing; retrying with codesign --deep for the fallback ZIP."
  run_logged "deep codesign browser app bundle" \
    codesign --sign - --force --deep --timestamp=none --options runtime \
    --entitlements "$entitlements_dir/browser.xml" \
    "$app_bundle"
  run_logged "codesign strict verify after deep retry" codesign --verify --deep --strict --verbose=2 "$app_bundle"
fi

run_logged "codesign display" codesign --display --verbose=2 "$app_bundle"
