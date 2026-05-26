#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"

output_path=""

usage() {
  cat <<'EOF'
Usage: GECKO_CHECKOUT_DIR=/path/to/firefox-esr bash scripts/build-macos-adhoc-archive.sh --output <archive.zip>

Builds the non-notarized macOS ZIP fallback from Gecko's packaged macOS app,
not from the raw obj/dist .app bundle.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      output_path="$2"
      shift 2
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

if [[ -z "$output_path" ]]; then
  echo "--output is required." >&2
  usage >&2
  exit 1
fi

checkout_dir="$(cd "$GECKO_CHECKOUT_DIR" && pwd)"
dist_dir="$checkout_dir/obj-nodely/dist"
output_path="$(python3 - "$output_path" <<'PY'
import os
import sys
print(os.path.abspath(sys.argv[1]))
PY
)"

if [[ ! -d "$dist_dir" ]]; then
  echo "Gecko dist directory not found: $dist_dir" >&2
  exit 1
fi

work_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/nodely-macos-adhoc-XXXXXX")"
mount_dir="$work_dir/mount"
extract_dir="$work_dir/extract"
payload_dir="$work_dir/payload"
mounted=0

cleanup() {
  if [[ "$mounted" -eq 1 ]]; then
    hdiutil detach "$mount_dir" -force >/dev/null 2>&1 || true
  fi
  rm -rf "$work_dir"
}

trap cleanup EXIT

copy_single_app_from_directory() {
  local source_dir="$1"
  local destination_dir="$2"
  local app_bundles=()

  while IFS= read -r app_bundle; do
    app_bundles+=("$app_bundle")
  done < <(find "$source_dir" -mindepth 1 -maxdepth 1 -type d -name '*.app' | sort)

  if [[ ${#app_bundles[@]} -ne 1 ]]; then
    echo "Expected exactly one macOS app bundle in $source_dir, found ${#app_bundles[@]}." >&2
    find "$source_dir" -mindepth 1 -maxdepth 1 -print >&2 || true
    exit 1
  fi

  mkdir -p "$destination_dir"
  /usr/bin/ditto "${app_bundles[0]}" "$destination_dir/$(basename "${app_bundles[0]}")"
}

mkdir -p "$mount_dir" "$extract_dir" "$payload_dir" "$(dirname "$output_path")"

packaged_dmgs=()
while IFS= read -r dmg; do
  packaged_dmgs+=("$dmg")
done < <(find "$dist_dir" -maxdepth 1 -type f -name '*.dmg' | sort)

packaged_zips=()
while IFS= read -r zip; do
  packaged_zips+=("$zip")
done < <(find "$dist_dir" -maxdepth 1 -type f -name '*.zip' | sort)

if [[ ${#packaged_dmgs[@]} -eq 1 ]]; then
  echo "Extracting packaged macOS app from ${packaged_dmgs[0]}"
  hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "${packaged_dmgs[0]}" >/dev/null
  mounted=1
  copy_single_app_from_directory "$mount_dir" "$payload_dir"
  hdiutil detach "$mount_dir" -force >/dev/null
  mounted=0
elif [[ ${#packaged_dmgs[@]} -gt 1 ]]; then
  echo "Expected exactly one packaged macOS DMG under $dist_dir, found ${#packaged_dmgs[@]}." >&2
  printf '  %s\n' "${packaged_dmgs[@]}" >&2
  exit 1
elif [[ ${#packaged_zips[@]} -eq 1 ]]; then
  echo "Extracting packaged macOS app from ${packaged_zips[0]}"
  /usr/bin/ditto -x -k "${packaged_zips[0]}" "$extract_dir"
  copy_single_app_from_directory "$extract_dir" "$payload_dir"
else
  echo "No packaged macOS DMG or ZIP was found under $dist_dir after mach package." >&2
  find "$dist_dir" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.zip' -o -name '*.pkg' \) -print >&2 || true
  exit 1
fi

app_bundle="$(find "$payload_dir" -mindepth 1 -maxdepth 1 -type d -name '*.app' | sort | head -n 1)"

if [[ -z "$app_bundle" ]]; then
  echo "No copied macOS app bundle was found in $payload_dir." >&2
  exit 1
fi

node "$repository_root/scripts/materialize-macos-app-symlinks.mjs" --check "$app_bundle"
node "$repository_root/scripts/verify-macos-packaged-app.mjs" "$app_bundle"

bash "$repository_root/scripts/sign-macos-app-fallback.sh" --app "$app_bundle" --check-symlinks

node "$repository_root/scripts/materialize-macos-app-symlinks.mjs" --check "$app_bundle"
node "$repository_root/scripts/verify-macos-packaged-app.mjs" "$app_bundle"

rm -f "$output_path"
/usr/bin/ditto -c -k --keepParent "$app_bundle" "$output_path"
echo "Built ad-hoc signed packaged macOS app archive: $output_path"
