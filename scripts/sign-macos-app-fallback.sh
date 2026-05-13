#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: GECKO_CHECKOUT_DIR=/path/to/firefox-esr bash scripts/sign-macos-app-fallback.sh

Ad-hoc signs the packaged macOS .app with Mozilla's developer entitlements.
Use this only for the non-notarized macOS ZIP fallback.
EOF
  exit 0
fi

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
entitlements_dir="$checkout_dir/security/mac/hardenedruntime/developer"

node "$repository_root/scripts/materialize-macos-app-symlinks.mjs" "$app_bundle"

echo "Stripping extended attributes and existing signatures from $app_bundle"
xattr -cr "$app_bundle"
while IFS= read -r -d '' signing_path; do
  codesign --remove-signature "$signing_path" >/dev/null 2>&1 || true
done < <(find "$app_bundle" -print0)

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

  local codesign_command=(codesign --sign - --force --options runtime)
  if [[ -n "$entitlement_file" ]]; then
    codesign_command+=(--entitlements "$entitlement_file")
  fi

  codesign_command+=("${paths[@]}")
  "${codesign_command[@]}"
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
  "$app_bundle/Contents/MacOS/updater.app" \
  "$app_bundle/Contents/Library/LaunchServices/org.mozilla.updater" \
  "$app_bundle/Contents/MacOS/pingsender" \
  "$app_bundle/Contents/MacOS/nmhproxy" \
  "$app_bundle/Contents/Frameworks/ChannelPrefs.framework"

sign_existing_paths "browser libraries" \
  "$app_bundle/Contents/MacOS/XUL" \
  "$app_bundle/Contents/MacOS/"'*.dylib' \
  "$app_bundle/Contents/Resources/gmp-clearkey/"'*/*.dylib'

sign_existing_paths "browser app bundle" \
  --entitlements "$entitlements_dir/browser.xml" \
  "$app_bundle"

codesign --verify --deep --strict --verbose=2 "$app_bundle"
codesign --display --verbose=2 "$app_bundle"
