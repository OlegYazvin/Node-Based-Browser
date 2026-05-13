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
signing_channel="${MACOS_SIGNING_CHANNEL:-release}"

node "$repository_root/scripts/materialize-macos-app-symlinks.mjs" "$app_bundle"

(
  cd "$checkout_dir"
  python ./mach macos-sign \
    --app-path "$app_bundle" \
    --entitlements developer \
    --channel "$signing_channel"
)

codesign --verify --deep --strict --verbose=2 "$app_bundle"
codesign --display --verbose=2 "$app_bundle"
