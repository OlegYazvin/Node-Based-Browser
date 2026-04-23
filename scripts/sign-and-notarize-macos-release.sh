#!/usr/bin/env bash

set -euo pipefail

check_env_only=0

if [[ "${1:-}" == "--check-env-only" ]]; then
  check_env_only=1
  shift
fi

required_vars=(
  MACOS_DEVELOPER_ID_APPLICATION_CERT_BASE64
  MACOS_DEVELOPER_ID_APPLICATION_CERT_PASSWORD
  MACOS_NOTARY_APPLE_ID
  MACOS_NOTARY_APP_PASSWORD
  MACOS_NOTARY_TEAM_ID
)

if [[ "$check_env_only" -eq 0 ]]; then
  required_vars=(
    GECKO_CHECKOUT_DIR
    "${required_vars[@]}"
  )
fi

missing_vars=()

for required_var in "${required_vars[@]}"; do
  if [[ -z "${!required_var:-}" ]]; then
    missing_vars+=("$required_var")
  fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
  printf 'Missing required macOS signing/notarization environment variables:\n' >&2
  printf '  %s\n' "${missing_vars[@]}" >&2
  exit 1
fi

if [[ "$check_env_only" -eq 1 ]]; then
  exit 0
fi

checkout_dir="$(cd "$GECKO_CHECKOUT_DIR" && pwd)"
dist_dir="$checkout_dir/obj-nodely/dist"

if [[ ! -d "$dist_dir" ]]; then
  echo "Gecko dist directory not found: $dist_dir" >&2
  exit 1
fi

certificate_path="${RUNNER_TEMP:-/tmp}/nodely-developer-id-application.p12"
keychain_path="${RUNNER_TEMP:-/tmp}/nodely-signing.keychain-db"
keychain_password="${MACOS_KEYCHAIN_PASSWORD:-}"
signing_channel="${MACOS_SIGNING_CHANNEL:-release}"

if [[ -z "$keychain_password" ]]; then
  keychain_password="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(24))
PY
)"
fi

cleanup() {
  rm -f "$certificate_path"
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
}

trap cleanup EXIT

python3 - "$certificate_path" <<'PY'
import base64
import os
import sys

with open(sys.argv[1], "wb") as certificate_file:
    certificate_file.write(
        base64.b64decode(os.environ["MACOS_DEVELOPER_ID_APPLICATION_CERT_BASE64"])
    )
PY

security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security import "$certificate_path" \
  -P "$MACOS_DEVELOPER_ID_APPLICATION_CERT_PASSWORD" \
  -A \
  -f pkcs12 \
  -k "$keychain_path"
security set-key-partition-list -S apple-tool:,apple: -k "$keychain_password" "$keychain_path"

existing_keychains=()
while IFS= read -r keychain; do
  keychain="${keychain#"${keychain%%[![:space:]]*}"}"
  keychain="${keychain%"${keychain##*[![:space:]]}"}"
  keychain="${keychain#\"}"
  keychain="${keychain%\"}"
  if [[ -n "$keychain" ]]; then
    existing_keychains+=("$keychain")
  fi
done < <(security list-keychains -d user)

security list-keychains -d user -s "$keychain_path" "${existing_keychains[@]}"
security default-keychain -d user -s "$keychain_path"

signing_identity="$(
  security find-identity -v -p codesigning "$keychain_path" |
    awk -F'"' '/Developer ID Application:/ { print $2; exit }'
)"

if [[ -z "$signing_identity" ]]; then
  echo "No Developer ID Application signing identity was found in $keychain_path." >&2
  security find-identity -v -p codesigning "$keychain_path" >&2 || true
  exit 1
fi

echo "Using macOS signing identity: $signing_identity"

shopt -s nullglob
mapfile -t dmgs < <(find "$dist_dir" -type f -name '*.dmg' | sort)

if [[ ${#dmgs[@]} -eq 0 ]]; then
  echo "No macOS DMG outputs were found under $dist_dir." >&2
  find "$dist_dir" -type f \( -name '*.dmg' -o -name '*.pkg' \) | sort >&2 || true
  exit 1
fi

for dmg in "${dmgs[@]}"; do
  echo "Signing and notarizing $dmg"

  (
    set -euo pipefail

    work_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/nodely-macos-sign-XXXXXX")"
    mount_dir="$work_dir/mount"
    payload_dir="$work_dir/payload"
    mkdir -p "$mount_dir" "$payload_dir"

    mounted=0
    cleanup_artifact() {
      if [[ "$mounted" -eq 1 ]]; then
        hdiutil detach "$mount_dir" -force >/dev/null 2>&1 || true
      fi
      rm -rf "$work_dir"
    }

    trap cleanup_artifact EXIT

    hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg" >/dev/null
    mounted=1

    app_bundle="$(find "$mount_dir" -mindepth 1 -maxdepth 1 -type d -name '*.app' | sort | head -n 1)"

    if [[ -z "$app_bundle" ]]; then
      echo "No app bundle was found inside $dmg." >&2
      exit 1
    fi

    app_name="$(basename "$app_bundle")"
    signed_app="$payload_dir/$app_name"
    /usr/bin/ditto "$app_bundle" "$signed_app"

    hdiutil detach "$mount_dir" -force >/dev/null
    mounted=0

    (
      cd "$checkout_dir"
      python ./mach macos-sign \
        --app-path "$signed_app" \
        --signing-identity "$signing_identity" \
        --entitlements production-without-restricted \
        --channel "$signing_channel"
    )

    codesign --verify --deep --strict --verbose=2 "$signed_app"

    app_archive="$work_dir/${app_name%.app}.zip"
    /usr/bin/ditto -c -k --keepParent "$signed_app" "$app_archive"

    xcrun notarytool submit "$app_archive" \
      --apple-id "$MACOS_NOTARY_APPLE_ID" \
      --password "$MACOS_NOTARY_APP_PASSWORD" \
      --team-id "$MACOS_NOTARY_TEAM_ID" \
      --wait

    xcrun stapler staple "$signed_app"
    xcrun stapler validate "$signed_app"
    spctl --assess --type execute --verbose=4 "$signed_app"

    rebuilt_dmg="$work_dir/$(basename "$dmg")"
    volume_name="${MACOS_DMG_VOLUME_NAME:-${app_name%.app}}"

    hdiutil create \
      -ov \
      -fs HFS+ \
      -format UDZO \
      -volname "$volume_name" \
      -srcfolder "$payload_dir" \
      "$rebuilt_dmg" \
      >/dev/null

    xcrun notarytool submit "$rebuilt_dmg" \
      --apple-id "$MACOS_NOTARY_APPLE_ID" \
      --password "$MACOS_NOTARY_APP_PASSWORD" \
      --team-id "$MACOS_NOTARY_TEAM_ID" \
      --wait

    xcrun stapler staple "$rebuilt_dmg"
    xcrun stapler validate "$rebuilt_dmg"
    spctl --assess --type open --context context:primary-signature --verbose=4 "$rebuilt_dmg"

    mv "$rebuilt_dmg" "$dmg"
  )
done
