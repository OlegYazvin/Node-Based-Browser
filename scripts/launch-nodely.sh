#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
checkout_dir_default="$repo_root/../Nodely-Gecko/firefox-esr"
checkout_dir="${NODELY_BROWSER_CHECKOUT:-${NODELY_FIREFOX_DIR:-$checkout_dir_default}}"
packaged_binary_default="$checkout_dir/obj-nodely/dist/nodely/nodely"
binary="${NODELY_BROWSER_BINARY:-${NODELY_FIREFOX_BINARY:-$packaged_binary_default}}"
profile_dir="${NODELY_PROFILE_DIR:-$HOME/.local/share/nodely/gecko-profile}"

desktop_exec_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value// /\\ }"
  printf '%s' "$value"
}

ensure_linux_desktop_integration() {
  [[ "$(uname -s)" == "Linux" ]] || return 0

  local applications_dir="$HOME/.local/share/applications"
  local icon_dir="$HOME/.local/share/icons/hicolor/scalable/apps"
  local desktop_file="$applications_dir/nodely.desktop"
  local icon_file="$icon_dir/nodely.svg"
  local escaped_script_path

  escaped_script_path=$(desktop_exec_escape "$script_dir/launch-nodely.sh")

  mkdir -p "$applications_dir" "$icon_dir"

  if [[ -f "$repo_root/desktop/nodely-icon.svg" ]]; then
    cp "$repo_root/desktop/nodely-icon.svg" "$icon_file" 2>/dev/null || true
  fi

  cat >"$desktop_file" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Nodely
Comment=Launch Nodely Browser
TryExec=$escaped_script_path
Exec=$escaped_script_path %u
Path=$repo_root
Icon=nodely
Terminal=false
StartupNotify=true
StartupWMClass=nodely
X-GNOME-WMClass=nodely
Categories=Network;WebBrowser;
Keywords=browser;research;nodely;graph;
EOF

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$applications_dir" >/dev/null 2>&1 || true
  fi

  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
  fi

  if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 >/dev/null 2>&1 || true
  elif command -v kbuildsycoca5 >/dev/null 2>&1; then
    kbuildsycoca5 >/dev/null 2>&1 || true
  fi
}

if [[ -x "$repo_root/.tools/node/bin/node" ]]; then
  "$repo_root/.tools/node/bin/node" \
    "$repo_root/gecko/scripts/refresh-artifact-branding.mjs" \
    --checkout-dir "$checkout_dir" >/dev/null 2>&1 || true
fi

show_error() {
  local message="$1"

  printf '%s\n' "$message" >&2

  if command -v notify-send >/dev/null 2>&1; then
    notify-send "Nodely Launch Failed" "$message"
  fi
}

if [[ ! -x "$binary" ]]; then
  show_error "Nodely browser binary not found at $binary. The supported local Gecko launcher is $packaged_binary_default. Build that packaged app first, then launch it again."
  exit 1
fi

if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then
  exec "$binary" "$1"
fi

mkdir -p "$profile_dir"
ensure_linux_desktop_integration

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
  MOZ_DESKTOP_FILE_NAME="${MOZ_DESKTOP_FILE_NAME:-nodely.desktop}" \
  MOZ_APP_REMOTINGNAME="${MOZ_APP_REMOTINGNAME:-nodely}" \
  "$binary" \
  -new-instance \
  -no-remote \
  -profile "$profile_dir" \
  "$@"
