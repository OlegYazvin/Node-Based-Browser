#!/usr/bin/env bash

set -euo pipefail

deb_path=""
image="ubuntu:22.04"

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

podman run --rm \
  -v "$deb_dir:/artifacts:ro,z" \
  "$image" \
  bash -lc "
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    dpkg -i /artifacts/$deb_file >/tmp/nodely-dpkg.log 2>&1 || true
    if ! apt-get install -f -y >/tmp/nodely-apt-fix.log 2>&1; then
      cat /tmp/nodely-dpkg.log >&2 || true
      cat /tmp/nodely-apt-fix.log >&2 || true
      exit 1
    fi
    test -x /usr/bin/nodely-browser
    test -f /usr/share/applications/nodely-browser.desktop
    if ! /usr/bin/nodely-browser --version >/tmp/nodely-version.txt 2>/tmp/nodely-version.err; then
      cat /tmp/nodely-dpkg.log >&2 || true
      cat /tmp/nodely-apt-fix.log >&2 || true
      cat /tmp/nodely-version.err >&2 || true
      ldd /opt/nodely-browser/app/nodely-bin >&2 || true
      ldd /opt/nodely-browser/app/libxul.so >&2 || true
      exit 127
    fi
    grep -q 'Mozilla Firefox\\|Nodely' /tmp/nodely-version.txt
    apt-get remove -y nodely-browser
    test ! -e /usr/bin/nodely-browser
  "
