#!/usr/bin/env bash

set -euo pipefail

rpm_path=""
image="quay.io/fedora/fedora:43"
container_platform=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpm)
      rpm_path="$2"
      shift 2
      ;;
    --image)
      image="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$rpm_path" ]]; then
  echo "Usage: $0 --rpm <path> [--image quay.io/fedora/fedora:43]" >&2
  exit 1
fi

if [[ ! -f "$rpm_path" ]]; then
  echo "RPM package not found: $rpm_path" >&2
  exit 1
fi

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required for Fedora compatibility verification." >&2
  exit 1
fi

rpm_path=$(cd -- "$(dirname -- "$rpm_path")" && pwd)/$(basename -- "$rpm_path")
rpm_dir=$(dirname -- "$rpm_path")
rpm_file=$(basename -- "$rpm_path")

if [[ "$rpm_file" == *-x64.rpm ]]; then
  container_platform="linux/amd64"
elif [[ "$rpm_file" == *-arm64.rpm ]]; then
  container_platform="linux/arm64"
else
  echo "Unable to determine the RPM architecture for $rpm_file." >&2
  exit 1
fi

podman run --rm \
  --platform "$container_platform" \
  -v "$rpm_dir:/artifacts:ro,z" \
  "$image" \
  bash -lc "
    set -euo pipefail
    if ! dnf install -y /artifacts/$rpm_file >/tmp/nodely-dnf-install.log 2>&1; then
      cat /tmp/nodely-dnf-install.log >&2 || true
      exit 1
    fi
    test -x /usr/bin/nodely-browser
    test -f /usr/share/applications/nodely-browser.desktop
    broken_symlink=\"\$(find /opt/nodely-browser -xtype l -print -quit)\"
    if [[ -n \"\$broken_symlink\" ]]; then
      echo \"Broken Nodely symlink found: \$broken_symlink\" >&2
      find /opt/nodely-browser -xtype l -printf '%p -> %l\n' >&2
      exit 1
    fi
    if ! /usr/bin/nodely-browser --version >/tmp/nodely-version.txt 2>/tmp/nodely-version.err; then
      cat /tmp/nodely-dnf-install.log >&2 || true
      cat /tmp/nodely-version.err >&2 || true
      find /opt/nodely-browser -maxdepth 4 -mindepth 1 -printf '%P\n' | sort >&2 || true
      ldd /opt/nodely-browser/app/nodely-bin >&2 || true
      ldd /opt/nodely-browser/app/libxul.so >&2 || true
      exit 127
    fi
    grep -q 'Mozilla Firefox\\|Nodely' /tmp/nodely-version.txt
    if ! dnf install -y xorg-x11-server-Xvfb xorg-x11-xauth dbus-x11 xdotool xorg-x11-utils >/tmp/nodely-dnf-gui-smoke.log 2>&1; then
      cat /tmp/nodely-dnf-gui-smoke.log >&2 || true
      exit 1
    fi
    if ! timeout 45s xvfb-run -a /usr/bin/nodely-browser --headless --screenshot /tmp/nodely-headless.png about:blank >/tmp/nodely-headless.out 2>/tmp/nodely-headless.err; then
      cat /tmp/nodely-headless.out >&2 || true
      cat /tmp/nodely-headless.err >&2 || true
      find "\${HOME:-/root}/.local/share/nodely" -maxdepth 4 -mindepth 1 -printf '%P\n' 2>/dev/null | sort >&2 || true
      exit 127
    fi
    test -s /tmp/nodely-headless.png
    window_home=\"\$(mktemp -d)\"
    if ! timeout 60s xvfb-run -a bash -lc '
      set -euo pipefail
      export HOME=\"\$1\"
      /usr/bin/nodely-browser about:blank >/tmp/nodely-window.out 2>/tmp/nodely-window.err &
      browser_pid=\$!
      cleanup() {
        kill \"\$browser_pid\" >/dev/null 2>&1 || true
        wait \"\$browser_pid\" >/dev/null 2>&1 || true
      }
      trap cleanup EXIT
      for _ in \$(seq 1 45); do
        if xdotool search --onlyvisible --pid \"\$browser_pid\" >/tmp/nodely-window.ids 2>/dev/null ||
          xdotool search --onlyvisible --class nodely >/tmp/nodely-window.ids 2>/dev/null ||
          xwininfo -root -tree 2>/dev/null | grep -Eiq \"nodely|firefox|browser\"; then
          exit 0
        fi
        if ! kill -0 \"\$browser_pid\" >/dev/null 2>&1; then
          wait \"\$browser_pid\" >/dev/null 2>&1 || true
          exit 1
        fi
        sleep 1
      done
      xwininfo -root -tree >/tmp/nodely-window-tree.txt 2>&1 || true
      exit 1
    ' nodely-desktop-smoke \"\$window_home\"; then
      cat /tmp/nodely-window.out >&2 || true
      cat /tmp/nodely-window.err >&2 || true
      cat /tmp/nodely-window-tree.txt >&2 || true
      find \"\$window_home/.local/share/nodely\" -maxdepth 4 -mindepth 1 -printf '%P\n' 2>/dev/null | sort >&2 || true
      exit 127
    fi
    dnf remove -y nodely-browser >/tmp/nodely-dnf-remove.log 2>&1
    test ! -e /usr/bin/nodely-browser
  "
