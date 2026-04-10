#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, chmod, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  currentArch,
  currentPlatform,
  ensureCleanDirectory,
  ensureDirectory,
  extractGeckoArtifactVersion,
  normalizeArch,
  normalizePlatform,
  outMakeDirectory,
  repositoryRoot,
  resolveGeckoReleaseArtifact,
  syncInstallers
} from "./installers-lib.mjs";

const systemDesktopFileName = "nodely-browser.desktop";
const systemIconName = "nodely-browser";
const systemInstallRoot = "/opt/nodely-browser/app";
const flatpakAppId = "io.nodely.Browser";
const flatpakRuntime = "org.freedesktop.Platform";
const flatpakSdk = "org.freedesktop.Sdk";
const flatpakRuntimeBranch = "24.08";
const flatpakAppBranch = "stable";
const flatpakRuntimeRepo = "https://dl.flathub.org/repo/flathub.flatpakrepo";

const nativeInstallerExtensions = {
  win32: [".exe"],
  darwin: [".dmg", ".pkg"]
};

const flatpakArchNames = {
  x64: "x86_64",
  arm64: "aarch64"
};

const rpmArchNames = {
  x64: "x86_64",
  arm64: "aarch64"
};

const rpmContainerPlatforms = {
  x64: "linux/amd64",
  arm64: "linux/arm64"
};

const debArchNames = {
  x64: "amd64",
  arm64: "arm64"
};

function usage() {
  console.log(`Usage: node scripts/build-installers.mjs [options]

Options:
  --platform <platform>   linux | win32 | darwin
  --arch <arch>           x64 | arm64
  --channel <name>        Release channel in gecko/release-artifacts (default: local)
  --artifact <path>       Override the staged Gecko release artifact path
  --out-dir <path>        Installer build output directory (default: out/make)
  --strict                Fail if any expected installer builder fails
  --no-sync               Skip syncing finished installers into Installer/
  --help                  Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    platform: currentPlatform(),
    arch: currentArch(),
    channel: "local",
    artifactPath: null,
    outDirectory: outMakeDirectory,
    strict: false,
    sync: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--platform":
        options.platform = normalizePlatform(argv[++index]);
        break;
      case "--arch":
        options.arch = normalizeArch(argv[++index]);
        break;
      case "--channel":
        options.channel = argv[++index];
        break;
      case "--artifact":
        options.artifactPath = path.resolve(argv[++index]);
        break;
      case "--out-dir":
        options.outDirectory = path.resolve(argv[++index]);
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--no-sync":
        options.sync = false;
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function linuxRunFileName(version, arch) {
  return `Nodely-Browser-${version}-linux-${arch}.run`;
}

function linuxFlatpakFileName(version, arch) {
  return `Nodely-Browser-${version}-linux-${arch}.flatpak`;
}

function linuxDebFileName(version, distribution, arch) {
  return `Nodely-Browser-${version}-${distribution}-${arch}.deb`;
}

function linuxRpmFileName(version, arch) {
  return `Nodely-Browser-${version}-fedora-${arch}.rpm`;
}

function linuxExtractFlags(filePath) {
  if (filePath.endsWith(".tar.xz")) {
    return "xJ";
  }

  if (filePath.endsWith(".tar.gz") || filePath.endsWith(".tgz")) {
    return "xz";
  }

  if (filePath.endsWith(".tar.bz2")) {
    return "xj";
  }

  throw new Error(`Unsupported Linux package input: ${filePath}`);
}

function tarballExtractArgument(filePath) {
  return `-${linuxExtractFlags(filePath)}f`;
}

function packageReleaseVersion(version) {
  return `${version}-1`;
}

const linuxDebRuntimeDependencies = [
  "libasound2",
  "libatk-bridge2.0-0",
  "libatk1.0-0",
  "libatspi2.0-0",
  "libbrotli1",
  "libbz2-1.0",
  "libcairo-gobject2",
  "libcairo2",
  "libcolord2",
  "libcups2",
  "libdbus-1-3",
  "libdbus-glib-1-2",
  "libepoxy0",
  "libfontconfig1",
  "libfreetype6",
  "libgdk-pixbuf-2.0-0",
  "libglib2.0-0",
  "libgtk-3-0",
  "libharfbuzz0b",
  "libjpeg8",
  "liblcms2-2",
  "libnspr4",
  "libnss3",
  "libpango-1.0-0",
  "libpangocairo-1.0-0",
  "libpangoft2-1.0-0",
  "libpixman-1-0",
  "libpng16-16",
  "libpulse0",
  "libsqlite3-0",
  "libstdc++6",
  "libthai0",
  "libwayland-client0",
  "libwayland-cursor0",
  "libwayland-egl1",
  "libx11-6",
  "libx11-xcb1",
  "libxcb-render0",
  "libxcb-shm0",
  "libxcb1",
  "libxcomposite1",
  "libxcursor1",
  "libxdamage1",
  "libxext6",
  "libxfixes3",
  "libxinerama1",
  "libxkbcommon0",
  "libxi6",
  "libxml2",
  "libxrandr2",
  "libxrender1",
  "libxt6",
  "libffi8 | libffi7",
  "libgcc-s1",
  "zlib1g"
];

const linuxRpmRuntimeDependencies = [
  "alsa-lib",
  "atk",
  "at-spi2-atk",
  "at-spi2-core",
  "brotli",
  "bzip2-libs",
  "cairo",
  "colord-libs",
  "cups-libs",
  "dbus-libs",
  "dbus-glib",
  "libepoxy",
  "fontconfig",
  "freetype",
  "gdk-pixbuf2",
  "glib2",
  "gtk3",
  "harfbuzz",
  "libjpeg-turbo",
  "lcms2",
  "nspr",
  "nss",
  "pango",
  "pixman",
  "libpng",
  "pulseaudio-libs",
  "sqlite-libs",
  "libstdc++",
  "libthai",
  "wayland-libs",
  "libX11",
  "libxcb",
  "libXcomposite",
  "libXcursor",
  "libXdamage",
  "libXext",
  "libXfixes",
  "libXinerama",
  "libxkbcommon",
  "libXi",
  "libxml2",
  "libXrandr",
  "libXrender",
  "libXt",
  "libffi",
  "libgcc",
  "zlib"
];

function buildDesktopEntry({ name, exec, icon }) {
  return `[Desktop Entry]
Version=1.0
Type=Application
Name=${name}
Comment=Node-based Gecko browser for research workflows
TryExec=${exec}
Exec=${exec} %u
Icon=${icon}
Terminal=false
StartupNotify=true
StartupWMClass=nodely
X-GNOME-WMClass=nodely
Categories=Network;WebBrowser;
Keywords=browser;research;nodely;graph;
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
`;
}

function shellMozBackendSetup() {
  return `moz_enable_wayland="\${MOZ_ENABLE_WAYLAND:-}"
if [[ -z "$moz_enable_wayland" ]]; then
  if [[ -n "\${WAYLAND_DISPLAY:-}" || "\${XDG_SESSION_TYPE:-}" == "wayland" ]]; then
    moz_enable_wayland=1
  else
    moz_enable_wayland=0
  fi
fi`;
}

export function buildSystemWrapper({ installRoot, desktopFileName }) {
  return `#!/usr/bin/env bash
set -euo pipefail
version_only=0

if [[ "\${1:-}" == "--version" || "\${1:-}" == "-v" ]]; then
  version_only=1
fi

${shellMozBackendSetup()}

app_candidates=(
  "${installRoot}/firefox"
  "${installRoot}/firefox-bin"
  "${installRoot}/nodely"
  "${installRoot}/nodely-bin"
)
app_executable=""

for candidate in "\${app_candidates[@]}"; do
  if [[ -x "$candidate" && ! -d "$candidate" ]]; then
    app_executable="$candidate"
    break
  fi
done

if [[ -z "$app_executable" ]]; then
  printf 'Unable to find a runnable Nodely executable in %s\\n' "${installRoot}" >&2
  exit 127
fi

if [[ "$version_only" -eq 1 ]]; then
  set +e
  version="$(
    env \
      MOZ_ENABLE_WAYLAND="$moz_enable_wayland" \
      MOZ_APP_REMOTINGNAME="\${MOZ_APP_REMOTINGNAME:-nodely}" \
      MOZ_DESKTOP_FILE_NAME="\${MOZ_DESKTOP_FILE_NAME:-${desktopFileName}}" \
      "$app_executable" \
      "$@" 2>&1
  )"
  status=$?
  set -e

  if [[ "$status" -ne 0 ]]; then
    printf '%s\n' "$version" >&2
    exit "$status"
  fi

  printf '%s\n' "$version" | sed 's/^Mozilla Firefox /Nodely /'
  exit 0
fi

profile_dir="\${NODELY_PROFILE_DIR:-\${XDG_DATA_HOME:-$HOME/.local/share}/nodely/gecko-profile}"
mkdir -p "$profile_dir"
cat >"$profile_dir/user.js" <<'PREFS'
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "about:blank");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.newtabpage.enabled", false);
user_pref("nodely.shell.enabled", true);
PREFS
exec env \
  MOZ_ENABLE_WAYLAND="$moz_enable_wayland" \
  MOZ_APP_REMOTINGNAME="\${MOZ_APP_REMOTINGNAME:-nodely}" \
  MOZ_DESKTOP_FILE_NAME="\${MOZ_DESKTOP_FILE_NAME:-${desktopFileName}}" \
  "$app_executable" \
  -new-instance \
  -no-remote \
  -profile "$profile_dir" \
  "$@"
`;
}

export function buildFlatpakWrapper() {
  return `#!/usr/bin/env bash
set -euo pipefail
version_only=0

if [[ "\${1:-}" == "--version" || "\${1:-}" == "-v" ]]; then
  version_only=1
fi

${shellMozBackendSetup()}

app_candidates=(
  /app/lib/nodely/firefox
  /app/lib/nodely/firefox-bin
  /app/lib/nodely/nodely
  /app/lib/nodely/nodely-bin
)
app_executable=""

for candidate in "\${app_candidates[@]}"; do
  if [[ -x "$candidate" && ! -d "$candidate" ]]; then
    app_executable="$candidate"
    break
  fi
done

if [[ -z "$app_executable" ]]; then
  printf 'Unable to find a runnable Nodely executable in %s\\n' "/app/lib/nodely" >&2
  exit 127
fi

if [[ "$version_only" -eq 1 ]]; then
  set +e
  version="$(
    env \
      MOZ_ENABLE_WAYLAND="$moz_enable_wayland" \
      MOZ_APP_REMOTINGNAME="\${MOZ_APP_REMOTINGNAME:-nodely}" \
      MOZ_DESKTOP_FILE_NAME="\${MOZ_DESKTOP_FILE_NAME:-${flatpakAppId}.desktop}" \
      "$app_executable" \
      "$@" 2>&1
  )"
  status=$?
  set -e

  if [[ "$status" -ne 0 ]]; then
    printf '%s\n' "$version" >&2
    exit "$status"
  fi

  printf '%s\n' "$version" | sed 's/^Mozilla Firefox /Nodely /'
  exit 0
fi

profile_dir="\${NODELY_PROFILE_DIR:-\${XDG_DATA_HOME:-$HOME/.local/share}/nodely/gecko-profile}"
mkdir -p "$profile_dir"
cat >"$profile_dir/user.js" <<'PREFS'
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "about:blank");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.newtabpage.enabled", false);
user_pref("nodely.shell.enabled", true);
PREFS
exec env \
  MOZ_ENABLE_WAYLAND="$moz_enable_wayland" \
  MOZ_APP_REMOTINGNAME="\${MOZ_APP_REMOTINGNAME:-nodely}" \
  MOZ_DESKTOP_FILE_NAME="\${MOZ_DESKTOP_FILE_NAME:-${flatpakAppId}.desktop}" \
  "$app_executable" \
  -new-instance \
  -no-remote \
  -profile "$profile_dir" \
  "$@"
`;
}

function buildFlatpakMetainfo(version) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${flatpakAppId}</id>
  <name>Nodely Browser</name>
  <summary>Node-based Gecko browser for research workflows</summary>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MPL-2.0</project_license>
  <description>
    <p>Nodely Browser is a node-based Gecko browser focused on graph-first research workflows.</p>
  </description>
  <launchable type="desktop-id">${flatpakAppId}.desktop</launchable>
  <categories>
    <category>Network</category>
    <category>WebBrowser</category>
  </categories>
  <releases>
    <release version="${version}" date="${new Date().toISOString().slice(0, 10)}"/>
  </releases>
</component>
`;
}

function buildLinuxRunStub({ extractFlags, iconSvg }) {
  return `#!/usr/bin/env bash
set -euo pipefail

prefix="$HOME/.local/opt/nodely-browser"
bin_dir="$HOME/.local/bin"
desktop_dir="$HOME/.local/share/applications"
icon_dir="$HOME/.local/share/icons/hicolor/scalable/apps"
profile_dir="$HOME/.local/share/nodely/gecko-profile"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)
      prefix="$2"
      shift 2
      ;;
    --bin-dir)
      bin_dir="$2"
      shift 2
      ;;
    --desktop-dir)
      desktop_dir="$2"
      shift 2
      ;;
    --icon-dir)
      icon_dir="$2"
      shift 2
      ;;
    --help)
      cat <<'HELP'
Nodely Browser Linux installer

Options:
  --prefix <path>        Installation root (default: ~/.local/opt/nodely-browser)
  --bin-dir <path>       Wrapper script directory (default: ~/.local/bin)
  --desktop-dir <path>   Desktop entry directory (default: ~/.local/share/applications)
  --icon-dir <path>      Icon directory (default: ~/.local/share/icons/hicolor/scalable/apps)
HELP
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

archive_line=$(awk '/^__NODELY_ARCHIVE_BELOW__$/ { print NR + 1; exit }' "$0")

if [[ -z "$archive_line" ]]; then
  echo "Installer payload marker not found." >&2
  exit 1
fi

temp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT

tail -n +"$archive_line" "$0" | tar -${extractFlags} -C "$temp_dir" -f -

bundle_dir=$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)

if [[ -z "$bundle_dir" ]]; then
  echo "Unable to locate extracted Nodely bundle." >&2
  exit 1
fi

install_root="$prefix/app"
wrapper_path="$bin_dir/nodely-browser"
desktop_path="$desktop_dir/nodely-browser.desktop"
icon_path="$icon_dir/nodely-browser.svg"
uninstall_path="$prefix/uninstall-nodely-browser.sh"

mkdir -p "$prefix" "$bin_dir" "$desktop_dir" "$icon_dir"
rm -rf "$install_root"
mv "$bundle_dir" "$install_root"

cat >"$wrapper_path" <<WRAPPER
${buildSystemWrapper({
  installRoot: '$install_root',
  desktopFileName: systemDesktopFileName
}).trim()}
WRAPPER
chmod +x "$wrapper_path"

cat >"$desktop_path" <<DESKTOP
${buildDesktopEntry({
  name: "Nodely Browser",
  exec: "$wrapper_path",
  icon: "$icon_path"
}).trim()}
DESKTOP

cat >"$icon_path" <<'ICON'
${iconSvg}
ICON

cat >"$uninstall_path" <<UNINSTALL
#!/usr/bin/env bash
set -euo pipefail
rm -f "$wrapper_path" "$desktop_path" "$icon_path"
rm -rf "$install_root"
rm -f "$uninstall_path"
rmdir "$prefix" 2>/dev/null || true
UNINSTALL
chmod +x "$uninstall_path"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache "$(dirname "$(dirname "$icon_dir")")" >/dev/null 2>&1 || true
fi

echo "Installed Nodely Browser"
echo "  App: $install_root"
echo "  Launcher: $wrapper_path"
echo "  Desktop entry: $desktop_path"
echo "  Uninstall: $uninstall_path"
exit 0
__NODELY_ARCHIVE_BELOW__
`;
}

export function debControl({ version, arch, distribution }) {
  const distributionLabel = distribution === "ubuntu" ? "Ubuntu" : "Debian";
  return `Package: nodely-browser
Version: ${packageReleaseVersion(version)}
Section: web
Priority: optional
Architecture: ${debArchNames[arch] ?? arch}
Maintainer: Nodely Browser <noreply@nodely.invalid>
Depends: ${linuxDebRuntimeDependencies.join(", ")}
Homepage: https://nodely.invalid/
Description: Nodely Browser for ${distributionLabel}
 Node-based Gecko browser for research workflows packaged for ${distributionLabel}.
`;
}

function desktopDatabaseScript() {
  return `#!/usr/bin/env bash
set -e
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi
`;
}

function rpmChangelogDate() {
  const date = new Date();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, "0")} ${date.getUTCFullYear()}`;
}

export function rpmSpec({ version, arch }) {
  const requires = linuxRpmRuntimeDependencies
    .map((dependency) => `Requires:       ${dependency}`)
    .join("\n");

  return `%global debug_package %{nil}
%global _debugsource_packages 0
Name:           nodely-browser
Version:        ${version}
Release:        1
Summary:        Node-based Gecko browser for research workflows
License:        MPL-2.0
BuildArch:      ${rpmArchNames[arch] ?? arch}
${requires}
Source0:        nodely-browser-system.tar.gz

%description
Nodely Browser is a node-based Gecko browser for research workflows.

%prep
%setup -q -c -T
tar --no-same-owner --no-same-permissions -xzf %{SOURCE0}

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}
cp -a opt usr %{buildroot}/

%post
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || :
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache /usr/share/icons/hicolor >/dev/null 2>&1 || :
fi

%postun
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || :
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache /usr/share/icons/hicolor >/dev/null 2>&1 || :
fi

%files
/opt/nodely-browser
/usr/bin/nodely-browser
/usr/share/applications/nodely-browser.desktop
/usr/share/icons/hicolor/scalable/apps/nodely-browser.svg

%changelog
* ${rpmChangelogDate()} Nodely Browser <noreply@nodely.invalid> - ${version}-1
- Package the Gecko-based Nodely Browser bundle
`;
}

async function runCommand(command, args, options = {}) {
  const { cwd = repositoryRoot, env = process.env } = options;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code}\n${[stderr, stdout].filter(Boolean).join("\n") || "(no output)"}`
        )
      );
    });
  });
}

async function commandSucceeds(command, args, options = {}) {
  try {
    await runCommand(command, args, options);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function podmanUnshare(args, options = {}) {
  return runCommand("podman", ["unshare", ...args], options);
}

async function extractLinuxArtifact(sourceArtifactPath, destinationDirectory) {
  await ensureDirectory(destinationDirectory);
  await runCommand("tar", [tarballExtractArgument(sourceArtifactPath), sourceArtifactPath, "-C", destinationDirectory]);
}

async function directoryContainsLinuxApp(candidateDirectory) {
  const metadataMarkers = ["application.ini", "platform.ini"];
  const browserBinaries = ["nodely-bin", "firefox-bin"];

  let hasMetadata = false;

  for (const marker of metadataMarkers) {
    if (await pathExists(path.join(candidateDirectory, marker))) {
      hasMetadata = true;
      break;
    }
  }

  if (!hasMetadata) {
    return false;
  }

  for (const marker of browserBinaries) {
    if (await pathExists(path.join(candidateDirectory, marker))) {
      return pathExists(path.join(candidateDirectory, "libxul.so"));
    }
  }

  return false;
}

async function refineExtractedLinuxAppDirectory(candidateDirectory) {
  if (await directoryContainsLinuxApp(candidateDirectory)) {
    return candidateDirectory;
  }

  const entries = await readdir(candidateDirectory, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  for (const preferredName of ["nodely", "firefox"]) {
    if (!directories.includes(preferredName)) {
      continue;
    }

    const nestedDirectory = path.join(candidateDirectory, preferredName);
    const refinedDirectory = await refineExtractedLinuxAppDirectory(nestedDirectory);

    if (refinedDirectory) {
      return refinedDirectory;
    }
  }

  if (directories.length === 1) {
    const nestedDirectory = path.join(candidateDirectory, directories[0]);
    const refinedDirectory = await refineExtractedLinuxAppDirectory(nestedDirectory);

    if (refinedDirectory) {
      return refinedDirectory;
    }
  }

  return null;
}

export async function resolveExtractedLinuxAppDirectory(extractedDirectory) {
  const entries = await readdir(extractedDirectory, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  for (const preferredName of ["nodely", "firefox"]) {
    if (directories.includes(preferredName)) {
      const refinedDirectory = await refineExtractedLinuxAppDirectory(path.join(extractedDirectory, preferredName));

      if (refinedDirectory) {
        return refinedDirectory;
      }
    }
  }

  if (directories.length === 1) {
    const refinedDirectory = await refineExtractedLinuxAppDirectory(path.join(extractedDirectory, directories[0]));

    if (refinedDirectory) {
      return refinedDirectory;
    }
  }

  throw new Error(
    `Unable to determine the packaged Linux app directory in ${extractedDirectory}. Found: ${directories.join(", ") || "(none)"}.`
  );
}

async function prepareSystemPayload({ sourceArtifactPath, temporaryDirectory, iconSvg }) {
  const extractedDirectory = path.join(temporaryDirectory, "extracted");
  const payloadRoot = path.join(temporaryDirectory, "payload-root");
  const appDestination = path.join(payloadRoot, "opt", "nodely-browser", "app");
  const wrapperPath = path.join(payloadRoot, "usr", "bin", "nodely-browser");
  const desktopPath = path.join(payloadRoot, "usr", "share", "applications", systemDesktopFileName);
  const iconPath = path.join(payloadRoot, "usr", "share", "icons", "hicolor", "scalable", "apps", `${systemIconName}.svg`);

  await extractLinuxArtifact(sourceArtifactPath, extractedDirectory);
  const extractedAppDirectory = await resolveExtractedLinuxAppDirectory(extractedDirectory);
  await ensureDirectory(path.dirname(appDestination));
  await cp(extractedAppDirectory, appDestination, { recursive: true });
  await ensureDirectory(path.dirname(wrapperPath));
  await ensureDirectory(path.dirname(desktopPath));
  await ensureDirectory(path.dirname(iconPath));

  await writeFile(wrapperPath, buildSystemWrapper({ installRoot: systemInstallRoot, desktopFileName: systemDesktopFileName }), "utf8");
  await chmod(wrapperPath, 0o755);
  await writeFile(
    desktopPath,
    buildDesktopEntry({
      name: "Nodely Browser",
      exec: "nodely-browser",
      icon: systemIconName
    }),
    "utf8"
  );
  await runCommand("desktop-file-validate", [desktopPath]);
  await writeFile(iconPath, `${iconSvg.trim()}\n`, "utf8");

  return payloadRoot;
}

async function buildLinuxRunInstaller({ version, sourceArtifactPath, outputDirectory, arch, iconSvg }) {
  const installerPath = path.join(outputDirectory, linuxRunFileName(version, arch));
  const stub = buildLinuxRunStub({ extractFlags: linuxExtractFlags(sourceArtifactPath), iconSvg: iconSvg.trim() });
  const payload = await readFile(sourceArtifactPath);

  await writeFile(installerPath, stub, "utf8");
  await writeFile(installerPath, payload, { flag: "a" });
  await chmod(installerPath, 0o755);
  return installerPath;
}

async function buildDebInstaller({ version, outputDirectory, arch, distribution, payloadRoot }) {
  const packageDirectory = await mkdtemp(path.join(os.tmpdir(), `nodely-${distribution}-deb-`));
  const rootDirectory = path.join(packageDirectory, "root");
  const finalPath = path.join(outputDirectory, linuxDebFileName(version, distribution, arch));
  const controlArchivePath = path.join(packageDirectory, "control.tar.gz");
  const dataArchivePath = path.join(packageDirectory, "data.tar.xz");
  const debianBinaryPath = path.join(packageDirectory, "debian-binary");

  try {
    await cp(payloadRoot, rootDirectory, { recursive: true });
    await ensureDirectory(path.join(rootDirectory, "DEBIAN"));

    const controlPath = path.join(rootDirectory, "DEBIAN", "control");
    const postinstPath = path.join(rootDirectory, "DEBIAN", "postinst");
    const postrmPath = path.join(rootDirectory, "DEBIAN", "postrm");

    await writeFile(controlPath, debControl({ version, arch, distribution }), "utf8");
    await writeFile(postinstPath, desktopDatabaseScript(), "utf8");
    await writeFile(postrmPath, desktopDatabaseScript(), "utf8");
    await chmod(postinstPath, 0o755);
    await chmod(postrmPath, 0o755);
    await writeFile(debianBinaryPath, "2.0\n", "utf8");

    await runCommand("tar", [
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-czf",
      controlArchivePath,
      "-C",
      path.join(rootDirectory, "DEBIAN"),
      "."
    ]);
    await runCommand("tar", [
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "--exclude=DEBIAN",
      "-cJf",
      dataArchivePath,
      "-C",
      rootDirectory,
      "."
    ]);
    await rm(finalPath, { force: true });
    await runCommand("ar", ["r", finalPath, debianBinaryPath, controlArchivePath, dataArchivePath]);
    return finalPath;
  } finally {
    await rm(packageDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function buildRpmInstaller({ version, outputDirectory, arch, payloadRoot }) {
  const rpmDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-fedora-rpm-"));
  const rpmbuildRoot = path.join(rpmDirectory, "rpmbuild");
  const sourcesDirectory = path.join(rpmbuildRoot, "SOURCES");
  const specsDirectory = path.join(rpmbuildRoot, "SPECS");
  const sourceTarballPath = path.join(sourcesDirectory, "nodely-browser-system.tar.gz");
  const specPath = path.join(specsDirectory, "nodely-browser.spec");
  const finalPath = path.join(outputDirectory, linuxRpmFileName(version, arch));

  try {
    await ensureDirectory(sourcesDirectory);
    await ensureDirectory(specsDirectory);
    await runCommand("tar", ["-czf", sourceTarballPath, "-C", payloadRoot, "."]);
    await writeFile(specPath, rpmSpec({ version, arch }), "utf8");

    await runCommand("podman", [
      "run",
      "--rm",
      "--platform",
      rpmContainerPlatforms[arch] ?? `linux/${arch}`,
      "-v",
      `${rpmDirectory}:/workspace:Z`,
      "-v",
      `${outputDirectory}:/out:Z`,
      "quay.io/fedora/fedora:43",
      "bash",
      "-lc",
      [
        "set -euo pipefail",
        "if ! dnf -y install rpm-build >/tmp/nodely-rpm-dnf.log 2>&1; then cat /tmp/nodely-rpm-dnf.log >&2; exit 1; fi",
        "cp -a /workspace/rpmbuild /tmp/rpmbuild",
        "rpmbuild --define '_topdir /tmp/rpmbuild' -bb /tmp/rpmbuild/SPECS/nodely-browser.spec",
        "rpm_path=\"$(find /tmp/rpmbuild/RPMS -name '*.rpm' -print -quit)\"",
        "test -n \"$rpm_path\"",
        `cp "$rpm_path" /out/${path.basename(finalPath)}`
      ].join("; ")
    ]);
    await podmanUnshare(["chown", "-R", "0:0", outputDirectory]);
    return finalPath;
  } finally {
    await podmanUnshare(["rm", "-rf", rpmDirectory]).catch(() => {});
    await rm(rpmDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensureFlatpakSdkInstalled(arch) {
  const flatpakArch = flatpakArchNames[arch] ?? arch;
  const runtimeRef = `${flatpakRuntime}/${flatpakArch}/${flatpakRuntimeBranch}`;
  const sdkRef = `${flatpakSdk}/${flatpakArch}/${flatpakRuntimeBranch}`;

  if (!(await commandSucceeds("flatpak", ["info", "--user", "--arch", flatpakArch, runtimeRef]))) {
    await runCommand("flatpak", ["install", "--user", "-y", "--arch", flatpakArch, "flathub", runtimeRef]);
  }

  if (!(await commandSucceeds("flatpak", ["info", "--user", "--arch", flatpakArch, sdkRef]))) {
    await runCommand("flatpak", ["install", "--user", "-y", "--arch", flatpakArch, "flathub", sdkRef]);
  }
}

async function buildFlatpakInstaller({ version, outputDirectory, arch, payloadRoot, iconSvg }) {
  const flatpakDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-flatpak-"));
  const buildDirectory = path.join(flatpakDirectory, "build");
  const repoDirectory = path.join(flatpakDirectory, "repo");
  const filesDirectory = path.join(buildDirectory, "files");
  const appRoot = path.join(filesDirectory, "lib", "nodely");
  const wrapperPath = path.join(filesDirectory, "bin", "nodely-browser");
  const desktopPath = path.join(filesDirectory, "share", "applications", `${flatpakAppId}.desktop`);
  const iconPath = path.join(filesDirectory, "share", "icons", "hicolor", "128x128", "apps", `${flatpakAppId}.png`);
  const metainfoPath = path.join(filesDirectory, "share", "metainfo", `${flatpakAppId}.metainfo.xml`);
  const finalPath = path.join(outputDirectory, linuxFlatpakFileName(version, arch));
  const flatpakArch = flatpakArchNames[arch] ?? arch;

  try {
    await ensureFlatpakSdkInstalled(arch);
    await rm(buildDirectory, { recursive: true, force: true });
    await rm(repoDirectory, { recursive: true, force: true });

    await runCommand("flatpak", [
      "build-init",
      "--arch",
      flatpakArch,
      buildDirectory,
      flatpakAppId,
      flatpakSdk,
      flatpakRuntime,
      flatpakRuntimeBranch
    ]);

    await ensureDirectory(path.dirname(appRoot));
    await ensureDirectory(path.dirname(wrapperPath));
    await ensureDirectory(path.dirname(desktopPath));
    await ensureDirectory(path.dirname(iconPath));
    await ensureDirectory(path.dirname(metainfoPath));

    await cp(path.join(payloadRoot, "opt", "nodely-browser", "app"), appRoot, { recursive: true });
    await writeFile(wrapperPath, buildFlatpakWrapper(), "utf8");
    await chmod(wrapperPath, 0o755);
    await writeFile(
      desktopPath,
      buildDesktopEntry({
        name: "Nodely Browser",
        exec: "nodely-browser",
        icon: flatpakAppId
      }),
      "utf8"
    );
    await runCommand("desktop-file-validate", [desktopPath]);
    const iconCandidates = [
      path.join(appRoot, "browser", "chrome", "icons", "default", "default128.png"),
      path.join(appRoot, "browser", "chrome", "icons", "default", "default64.png")
    ];
    const flatpakIconSource = (await Promise.all(iconCandidates.map((candidate) => pathExists(candidate)))).findIndex(Boolean);

    if (flatpakIconSource === -1) {
      throw new Error(`Unable to locate a PNG app icon for Flatpak export in ${appRoot}.`);
    }

    await cp(iconCandidates[flatpakIconSource], iconPath);
    await writeFile(metainfoPath, buildFlatpakMetainfo(version), "utf8");

    await runCommand("flatpak", [
      "build-finish",
      "--command=nodely-browser",
      "--share=network",
      "--share=ipc",
      "--socket=wayland",
      "--socket=fallback-x11",
      "--socket=pulseaudio",
      "--device=dri",
      "--filesystem=home",
      "--env=MOZ_APP_REMOTINGNAME=nodely",
      `--env=MOZ_DESKTOP_FILE_NAME=${flatpakAppId}.desktop`,
      buildDirectory
    ]);

    await runCommand("flatpak", [
      "build-export",
      "--arch",
      flatpakArch,
      repoDirectory,
      buildDirectory,
      flatpakAppBranch
    ]);

    await runCommand("flatpak", [
      "build-bundle",
      "--arch",
      flatpakArch,
      "--runtime-repo",
      flatpakRuntimeRepo,
      repoDirectory,
      finalPath,
      flatpakAppId,
      flatpakAppBranch
    ]);

    return finalPath;
  } finally {
    await rm(flatpakDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function buildLinuxInstallers({ version, sourceArtifactPath, outDirectory, arch, strict = false }) {
  const outputDirectory = path.join(outDirectory, "linux", arch);
  const iconSvgPath = path.join(repositoryRoot, "desktop", "nodely-icon.svg");
  const iconSvg = await readFile(iconSvgPath, "utf8");
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-linux-installers-"));
  const outputs = [];
  const failures = [];

  await ensureCleanDirectory(outputDirectory);

  try {
    const payloadRoot = await prepareSystemPayload({
      sourceArtifactPath,
      temporaryDirectory,
      iconSvg
    });

    const builders = [
      {
        label: "linux-run",
        run: () =>
          buildLinuxRunInstaller({
            version,
            sourceArtifactPath,
            outputDirectory,
            arch,
            iconSvg
          })
      },
      {
        label: "debian-deb",
        run: () =>
          buildDebInstaller({
            version,
            outputDirectory,
            arch,
            distribution: "debian",
            payloadRoot
          })
      },
      {
        label: "ubuntu-deb",
        run: () =>
          buildDebInstaller({
            version,
            outputDirectory,
            arch,
            distribution: "ubuntu",
            payloadRoot
          })
      },
      {
        label: "fedora-rpm",
        run: () =>
          buildRpmInstaller({
            version,
            outputDirectory,
            arch,
            payloadRoot
          })
      },
      {
        label: "flatpak",
        run: () =>
          buildFlatpakInstaller({
            version,
            outputDirectory,
            arch,
            payloadRoot,
            iconSvg
          })
      }
    ];

    for (const builder of builders) {
      try {
        outputs.push(await builder.run());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${builder.label}: ${message}`);
        console.warn(`[installers] skipped ${builder.label}: ${message}`);
      }
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }

  if (!outputs.length) {
    const details = failures.length ? `\n${failures.join("\n")}` : "";
    throw new Error(`Failed to build any Linux installers for ${arch}.${details}`);
  }

  if (strict && failures.length) {
    throw new Error(`Failed to build the full Linux installer set for ${arch}.\n${failures.join("\n")}`);
  }

  return outputs;
}

export async function copyNativeInstaller({ platform, arch, sourceArtifactPath, outDirectory }) {
  const allowedExtensions = nativeInstallerExtensions[platform] ?? [];
  const matchesExpectedExtension = allowedExtensions.some((extension) =>
    sourceArtifactPath.toLowerCase().endsWith(extension)
  );

  if (!matchesExpectedExtension) {
    throw new Error(
      `Expected a native ${platform} installer (${allowedExtensions.join(", ")}) but found ${path.basename(sourceArtifactPath)}.`
    );
  }

  const outputDirectory = path.join(outDirectory, platform, arch);
  await ensureCleanDirectory(outputDirectory);
  const version = extractGeckoArtifactVersion(path.basename(sourceArtifactPath));

  if (!version) {
    throw new Error(
      `Could not determine the Nodely version from native installer ${path.basename(sourceArtifactPath)}.`
    );
  }

  const extension = sourceArtifactPath.toLowerCase().endsWith(".pkg") ? ".pkg" : path.extname(sourceArtifactPath);
  const destinationFileName =
    platform === "win32"
      ? `Nodely-Browser-${version}-windows-${arch}.installer.exe`
      : `Nodely-Browser-${version}-macos-${arch}${extension}`;
  const destinationPath = path.join(outputDirectory, destinationFileName);
  await cp(sourceArtifactPath, destinationPath);
  return [destinationPath];
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourceArtifactPath = await resolveGeckoReleaseArtifact({
    platform: options.platform,
    arch: options.arch,
    channel: options.channel,
    artifactPath: options.artifactPath
  });
  const version = extractGeckoArtifactVersion(path.basename(sourceArtifactPath));

  if (!version) {
    throw new Error(
      `Could not determine the Nodely version from packaged artifact ${path.basename(sourceArtifactPath)}.`
    );
  }

  let outputs = [];

  if (options.platform === "linux") {
    outputs = await buildLinuxInstallers({
      version,
      sourceArtifactPath,
      outDirectory: options.outDirectory,
      arch: options.arch,
      strict: options.strict
    });
  } else if (options.platform === "win32" || options.platform === "darwin") {
    outputs = await copyNativeInstaller({
      platform: options.platform,
      arch: options.arch,
      sourceArtifactPath,
      outDirectory: options.outDirectory
    });
  } else {
    throw new Error(`Unsupported installer platform: ${options.platform}`);
  }

  for (const outputPath of outputs) {
    console.log(outputPath);
  }

  if (options.sync) {
    await syncInstallers({
      platform: options.platform,
      arch: options.arch,
      makeDirectory: options.outDirectory
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
