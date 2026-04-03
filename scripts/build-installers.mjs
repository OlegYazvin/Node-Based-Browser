#!/usr/bin/env node

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  currentArch,
  currentPlatform,
  ensureCleanDirectory,
  normalizeArch,
  normalizePlatform,
  outMakeDirectory,
  repositoryRoot,
  resolveGeckoReleaseArtifact,
  syncInstallers
} from "./installers-lib.mjs";

function usage() {
  console.log(`Usage: node scripts/build-installers.mjs [options]

Options:
  --platform <platform>   linux | win32 | darwin
  --arch <arch>           x64 | arm64
  --channel <name>        Release channel in gecko/release-artifacts (default: local)
  --artifact <path>       Override the staged Gecko release artifact path
  --out-dir <path>        Installer build output directory (default: out/make)
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

const nativeInstallerExtensions = {
  win32: [".exe"],
  darwin: [".dmg", ".pkg"]
};

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
#!/usr/bin/env bash
set -euo pipefail
profile_dir="\\\${NODELY_PROFILE_DIR:-$profile_dir}"
mkdir -p "\\\$profile_dir"
cat >"\\\$profile_dir/user.js" <<'PREFS'
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "about:blank");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.newtabpage.enabled", false);
user_pref("nodely.shell.enabled", true);
PREFS
exec env MOZ_ENABLE_WAYLAND="\\\${MOZ_ENABLE_WAYLAND:-1}" MOZ_APP_REMOTINGNAME="\\\${MOZ_APP_REMOTINGNAME:-nodely}" "$install_root/nodely" -new-instance -no-remote -profile "\\\$profile_dir" "\\\$@"
WRAPPER
chmod +x "$wrapper_path"

cat >"$desktop_path" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Nodely Browser
Comment=Node-based Gecko browser for research workflows
TryExec=$wrapper_path
Exec=$wrapper_path
Icon=$icon_path
Terminal=false
StartupNotify=true
Categories=Network;WebBrowser;
Keywords=browser;research;nodely;graph;
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

async function buildLinuxInstallers({ version, sourceArtifactPath, outDirectory, arch }) {
  const outputDirectory = path.join(outDirectory, "linux", arch);
  await ensureCleanDirectory(outputDirectory);

  const iconSvgPath = path.join(repositoryRoot, "desktop", "nodely-icon.svg");
  const iconSvg = (await readFile(iconSvgPath, "utf8")).trim();
  const extractFlags = linuxExtractFlags(sourceArtifactPath);
  const installerPath = path.join(outputDirectory, linuxRunFileName(version, arch));
  const stub = buildLinuxRunStub({ extractFlags, iconSvg });
  const payload = await readFile(sourceArtifactPath);

  await writeFile(installerPath, stub, "utf8");
  await writeFile(installerPath, payload, { flag: "a" });
  await chmod(installerPath, 0o755);

  return [installerPath];
}

async function copyNativeInstaller({ platform, arch, sourceArtifactPath, outDirectory }) {
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
  const destinationPath = path.join(outputDirectory, path.basename(sourceArtifactPath));
  await mkdir(outputDirectory, { recursive: true });
  await rm(destinationPath, { force: true });
  await writeFile(destinationPath, await readFile(sourceArtifactPath));
  return [destinationPath];
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const version = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")).version;
  const sourceArtifactPath = await resolveGeckoReleaseArtifact({
    platform: options.platform,
    arch: options.arch,
    channel: options.channel,
    artifactPath: options.artifactPath
  });

  let outputs = [];

  if (options.platform === "linux") {
    outputs = await buildLinuxInstallers({
      version,
      sourceArtifactPath,
      outDirectory: options.outDirectory,
      arch: options.arch
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

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
