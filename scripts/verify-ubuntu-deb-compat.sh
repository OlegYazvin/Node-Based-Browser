#!/usr/bin/env bash

set -euo pipefail

deb_path=""
image="ubuntu:22.04"
container_platform=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deb)
      deb_path="$2"
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

if [[ -z "$deb_path" ]]; then
  echo "Usage: $0 --deb <path> [--image ubuntu:22.04]" >&2
  exit 1
fi

if [[ ! -f "$deb_path" ]]; then
  echo "Deb package not found: $deb_path" >&2
  exit 1
fi

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required for Ubuntu compatibility verification." >&2
  exit 1
fi

deb_path=$(cd -- "$(dirname -- "$deb_path")" && pwd)/$(basename -- "$deb_path")
deb_dir=$(dirname -- "$deb_path")
deb_file=$(basename -- "$deb_path")

if command -v dpkg-deb >/dev/null 2>&1; then
  deb_architecture=$(dpkg-deb -f "$deb_path" Architecture)
elif [[ "$deb_file" == *-x64.deb ]]; then
  deb_architecture="amd64"
elif [[ "$deb_file" == *-arm64.deb ]]; then
  deb_architecture="arm64"
else
  echo "Unable to determine the DEB architecture for $deb_file." >&2
  exit 1
fi

case "$deb_architecture" in
  amd64)
    container_platform="linux/amd64"
    ;;
  arm64)
    container_platform="linux/arm64"
    ;;
  *)
    echo "Unsupported DEB architecture for compatibility verification: $deb_architecture" >&2
    exit 1
    ;;
esac

podman run --rm \
  --platform "$container_platform" \
  -v "$deb_dir:/artifacts:ro,z" \
  "$image" \
  bash -lc "
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    dpkg -i /artifacts/$deb_file >/tmp/nodely-dpkg.log 2>&1 || true
    if ! apt-get install -f -y --no-install-recommends >/tmp/nodely-apt-fix.log 2>&1; then
      cat /tmp/nodely-dpkg.log >&2 || true
      cat /tmp/nodely-apt-fix.log >&2 || true
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
      cat /tmp/nodely-dpkg.log >&2 || true
      cat /tmp/nodely-apt-fix.log >&2 || true
      cat /tmp/nodely-version.err >&2 || true
      find /opt/nodely-browser -maxdepth 4 -mindepth 1 -printf '%P\n' | sort >&2 || true
      ldd /opt/nodely-browser/app/nodely-bin >&2 || true
      ldd /opt/nodely-browser/app/libxul.so >&2 || true
      exit 127
    fi
    grep -q 'Mozilla Firefox\\|Nodely' /tmp/nodely-version.txt
    if ! apt-get install -y --no-install-recommends xvfb xauth dbus-x11 xdotool x11-utils >/tmp/nodely-apt-gui-smoke.log 2>&1; then
      cat /tmp/nodely-apt-gui-smoke.log >&2 || true
      exit 1
    fi
    if ! timeout 45s xvfb-run -a /usr/bin/nodely-browser --headless --screenshot /tmp/nodely-headless.png about:blank >/tmp/nodely-headless.out 2>/tmp/nodely-headless.err; then
      cat /tmp/nodely-headless.out >&2 || true
      cat /tmp/nodely-headless.err >&2 || true
      find "\${HOME:-/root}/.local/share/nodely-browser" -maxdepth 4 -mindepth 1 -printf '%P\n' 2>/dev/null | sort >&2 || true
      exit 127
    fi
    test -s /tmp/nodely-headless.png
    window_home=\"\$(mktemp -d)\"
    if ! timeout 60s xvfb-run -a bash -lc '
      set -euo pipefail
      export HOME=\"\$1\"
      smoke_url=\"data:text/html,%3Ctitle%3ENodely%20Desktop%20Smoke%3C%2Ftitle%3E%3Ch1%3ENodely%20Desktop%20Smoke%3C%2Fh1%3E\"
      /usr/bin/nodely-browser \"\$smoke_url\" >/tmp/nodely-window.out 2>/tmp/nodely-window.err &
      browser_pid=\$!
      cleanup() {
        kill \"\$browser_pid\" >/dev/null 2>&1 || true
        wait \"\$browser_pid\" >/dev/null 2>&1 || true
      }
      trap cleanup EXIT
      for _ in \$(seq 1 45); do
        if xdotool search --onlyvisible --name \"Crash Reporter\" >/tmp/nodely-crashreporter.ids 2>/dev/null; then
          xwininfo -root -tree >/tmp/nodely-window-tree.txt 2>&1 || true
          echo \"Nodely opened Nodely Crash Reporter instead of the desktop browser window.\" >&2
          exit 2
        fi
        if xdotool search --onlyvisible --name \"Nodely Desktop Smoke\" >/tmp/nodely-window.ids 2>/dev/null; then
          exit 0
        fi
        if xdotool search --onlyvisible --pid \"\$browser_pid\" >/tmp/nodely-window.ids 2>/dev/null; then
          exit 0
        fi
        if xdotool search --onlyvisible --class \"[Nn]odely|[Ff]irefox|Navigator\" >/tmp/nodely-window.ids 2>/dev/null; then
          exit 0
        fi
        if xdotool search --onlyvisible --name \"[Nn]odely|[Ff]irefox|Mozilla\" >/tmp/nodely-window.ids 2>/dev/null; then
          exit 0
        fi
        if ! kill -0 \"\$browser_pid\" >/dev/null 2>&1; then
          wait \"\$browser_pid\" >/dev/null 2>&1 || true
          echo \"Nodely desktop browser process exited before exposing a visible window.\" >&2
          exit 1
        fi
        sleep 1
      done
      xwininfo -root -tree >/tmp/nodely-window-tree.txt 2>&1 || true
      echo \"Nodely desktop smoke timed out before a visible browser window appeared.\" >&2
      exit 1
    ' nodely-desktop-smoke \"\$window_home\"; then
      cat /tmp/nodely-window.out >&2 || true
      cat /tmp/nodely-window.err >&2 || true
      cat /tmp/nodely-window-tree.txt >&2 || true
      find \"\$window_home/.local/share/nodely-browser\" -maxdepth 5 -mindepth 1 -printf '%P\n' 2>/dev/null | sort >&2 || true
      exit 127
    fi
    apt-get remove -y nodely-browser
    test ! -e /usr/bin/nodely-browser
  "
