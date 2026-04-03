#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
checkout_dir_default="$repo_root/../Nodely-Gecko/firefox-esr"
checkout_dir="${NODELY_BROWSER_CHECKOUT:-${NODELY_FIREFOX_DIR:-$checkout_dir_default}}"
nodely_binary_default="$checkout_dir/obj-nodely/dist/bin/nodely"
legacy_binary_default="$checkout_dir/obj-nodely/dist/bin/firefox"
binary="${NODELY_BROWSER_BINARY:-${NODELY_FIREFOX_BINARY:-}}"
profile_dir="${NODELY_PROFILE_DIR:-$HOME/.local/share/nodely/gecko-profile}"

if [[ -x "$repo_root/.tools/node/bin/node" ]]; then
  "$repo_root/.tools/node/bin/node" \
    "$repo_root/gecko/scripts/refresh-artifact-branding.mjs" \
    --checkout-dir "$checkout_dir" >/dev/null 2>&1 || true
fi

if [[ -z "$binary" ]]; then
  if [[ -x "$nodely_binary_default" ]]; then
    binary="$nodely_binary_default"
  else
    binary="$legacy_binary_default"
  fi
fi

show_error() {
  local message="$1"

  printf '%s\n' "$message" >&2

  if command -v notify-send >/dev/null 2>&1; then
    notify-send "Nodely Launch Failed" "$message"
  fi
}

if [[ ! -x "$binary" ]]; then
  show_error "Nodely browser binary not found at $binary. Build the Gecko app first, then launch it again."
  exit 1
fi

mkdir -p "$profile_dir"

cat >"$profile_dir/user.js" <<'EOF'
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "about:blank");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.newtabpage.enabled", false);
user_pref("nodely.shell.enabled", true);
EOF

exec env \
  MOZ_ENABLE_WAYLAND="${MOZ_ENABLE_WAYLAND:-1}" \
  MOZ_APP_REMOTINGNAME="${MOZ_APP_REMOTINGNAME:-nodely}" \
  "$binary" \
  -new-instance \
  -no-remote \
  -profile "$profile_dir" \
  "$@"
