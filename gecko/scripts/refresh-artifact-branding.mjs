#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  access,
  chmod,
  constants,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");
const nodelyIconSvgPath = path.join(repositoryRoot, "desktop", "nodely-icon.svg");

const NODELY_APP_ID = "{a75f9f03-78b1-4c8a-a2c7-f12d45088b29}";
const RASTER_ICON_SIZES = [16, 32, 48, 64, 128, 256];

function usage() {
  console.log(`Usage: node gecko/scripts/refresh-artifact-branding.mjs [options]

Options:
  --checkout-dir <path>  Gecko source checkout directory
  --mode <full|compat>   Run the full branding refresh or only the macOS compat shim
  --help                 Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    checkoutDir: path.resolve(repositoryRoot, "..", "Nodely-Gecko", "firefox-esr"),
    mode: "full"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
        break;
      case "--mode":
        options.mode = argv[++index] ?? options.mode;
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

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function removeIfPresent(targetPath) {
  if (!(await exists(targetPath))) {
    return false;
  }

  await rm(targetPath, {
    force: true,
    recursive: true
  });
  return true;
}

async function run(command, args, { cwd = repositoryRoot, stdio = "ignore" } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}`));
    });
  });
}

async function commandExists(command) {
  try {
    await run("bash", ["-lc", `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

async function ensureAlias(directory, aliasName, sourceName) {
  const sourcePath = path.join(directory, sourceName);

  if (!(await exists(sourcePath))) {
    return false;
  }

  const aliasPath = path.join(directory, aliasName);

  if (await exists(aliasPath)) {
    const aliasStat = await lstat(aliasPath);

    if (aliasStat.isSymbolicLink()) {
      return false;
    }

    await rm(aliasPath, { force: true });
  }

  try {
    await symlink(sourceName, aliasPath);
  } catch {
    await copyFile(sourcePath, aliasPath);
  }

  return true;
}

async function resolveMacCompatSource(distDirectory, distBinDir) {
  const executableCandidates = ["firefox", "firefox-bin", "nodely", "nodely-bin"];

  for (const executableName of executableCandidates) {
    if (await exists(path.join(distBinDir, executableName))) {
      return {
        executableName,
        reference: executableName
      };
    }
  }

  const distEntries = await readdir(distDirectory, { withFileTypes: true }).catch(() => []);
  const bundleEntry = distEntries.find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));

  if (!bundleEntry) {
    return null;
  }

  for (const executableName of executableCandidates) {
    const reference = path.join("..", bundleEntry.name, "Contents", "MacOS", executableName);

    if (await exists(path.join(distBinDir, reference))) {
      return {
        executableName,
        reference
      };
    }
  }

  return null;
}

export async function ensureMacArtifactCompatibility(checkoutDir) {
  const distDirectory = path.join(checkoutDir, "obj-nodely", "dist");
  const distBinDir = path.join(distDirectory, "bin");

  if (!(await exists(distDirectory))) {
    return 0;
  }

  const source = await resolveMacCompatSource(distDirectory, distBinDir);

  if (!source) {
    return 0;
  }

  await mkdir(distBinDir, { recursive: true });
  const aliasNames = ["firefox", "firefox-bin", "nodely", "nodely-bin"];
  let updates = 0;

  for (const aliasName of aliasNames) {
    if (aliasName === source.reference) {
      continue;
    }

    if (await ensureAlias(distBinDir, aliasName, source.reference)) {
      updates += 1;
    }
  }

  return updates;
}

function nodelyVersionWrapper(targetName, { desktopFileName = "" } = {}) {
  const desktopIntegrationBlock = desktopFileName
    ? `
desktop_file_name="${desktopFileName}"

if [[ "$(uname -s)" == "Linux" ]]; then
  applications_dir="\${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  desktop_path="$applications_dir/$desktop_file_name"
  icon_path="$script_dir/browser/chrome/icons/default/default128.png"

  if [[ ! -f "$icon_path" && -f "$script_dir/icons/updater.png" ]]; then
    icon_path="$script_dir/icons/updater.png"
  fi

  mkdir -p "$applications_dir"

  cat >"$desktop_path" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Nodely
Comment=Node-based Gecko browser for research workflows
TryExec=$script_dir/nodely
Exec=$script_dir/nodely %u
Path=$script_dir
Icon=$icon_path
Terminal=false
StartupNotify=true
StartupWMClass=nodely
X-GNOME-WMClass=nodely
NoDisplay=true
Categories=Network;WebBrowser;
Keywords=browser;research;nodely;graph;
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
EOF

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$applications_dir" >/dev/null 2>&1 || true
  fi

  if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 >/dev/null 2>&1 || true
  elif command -v kbuildsycoca5 >/dev/null 2>&1; then
    kbuildsycoca5 >/dev/null 2>&1 || true
  fi
fi

exec env \\
  MOZ_ENABLE_WAYLAND="\${MOZ_ENABLE_WAYLAND:-1}" \\
  MOZ_APP_REMOTINGNAME="\${MOZ_APP_REMOTINGNAME:-nodely}" \\
  MOZ_DESKTOP_FILE_NAME="\${MOZ_DESKTOP_FILE_NAME:-$desktop_file_name}" \\
  "$target" "$@"
`
    : `
exec "$target" "$@"
`;

  return `#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)
target="$script_dir/${targetName}"

if [[ "\${1:-}" == "--version" || "\${1:-}" == "-v" ]]; then
  version="$("$target" --version 2>/dev/null || true)"

  if [[ -n "$version" ]]; then
    printf '%s\\n' "$version" | sed 's/^Mozilla Firefox /Nodely /'
    exit 0
  fi
fi

${desktopIntegrationBlock.trim()}
`;
}

async function ensureVersionWrapper(directory, wrapperName, targetName, options = {}) {
  const targetPath = path.join(directory, targetName);

  if (!(await exists(targetPath))) {
    return false;
  }

  const wrapperPath = path.join(directory, wrapperName);
  const nextContents = nodelyVersionWrapper(targetName, options);
  const existingContents =
    (await exists(wrapperPath)) && !(await lstat(wrapperPath)).isDirectory()
      ? await readFile(wrapperPath, "utf8").catch(() => null)
      : null;

  if (existingContents === nextContents) {
    await chmod(wrapperPath, 0o755).catch(() => {});
    return false;
  }

  await rm(wrapperPath, {
    force: true,
    recursive: true
  }).catch(() => {});
  await writeFile(wrapperPath, nextContents, {
    encoding: "utf8",
    mode: 0o755
  });
  await chmod(wrapperPath, 0o755).catch(() => {});
  return true;
}

function patchApplicationIni(contents) {
  const version = contents.match(/^Version=(.+)$/mu)?.[1]?.trim() ?? "%VERSION%";
  const buildId = contents.match(/^BuildID=(.+)$/mu)?.[1]?.trim() ?? "%BUILDID%";

  return contents
    .replace(/^Vendor=.*$/mu, "Vendor=Nodely")
    .replace(/^Name=.*$/mu, "Name=Nodely")
    .replace(/^RemotingName=.*$/mu, "RemotingName=nodely")
    .replace(/^CodeName=.*$/mu, "CodeName=Nodely")
    .replace(/^ID=.*$/mu, `ID=${NODELY_APP_ID}`)
    .replace(
      /^ServerURL=.*$/mu,
      `ServerURL=https://crashes.nodely.invalid/submit?id=${NODELY_APP_ID}&version=${version}&buildid=${buildId}`
    )
    .replace(/^URL=.*$/mu, "URL=");
}

async function patchIfPresent(filePath) {
  if (!(await exists(filePath))) {
    return false;
  }

  const original = await readFile(filePath, "utf8");
  const next = patchApplicationIni(original);

  if (next === original) {
    return false;
  }

  await writeFile(filePath, next, "utf8");
  return true;
}

async function renderSvgIcon(svgPath, outputPath, size) {
  await run("magick", [
    "-background",
    "none",
    svgPath,
    "-resize",
    `${size}x${size}`,
    "-gravity",
    "center",
    "-extent",
    `${size}x${size}`,
    outputPath
  ]);
}

async function refreshRasterIconTargets(svgPath, targets) {
  const magickAvailable = await commandExists("magick");

  if (!magickAvailable) {
    return {
      updated: 0,
      skipped: targets.length
    };
  }

  let updated = 0;

  for (const { outputPath, size } of targets) {
    await renderSvgIcon(svgPath, outputPath, size);
    updated += 1;
  }

  return {
    updated,
    skipped: 0
  };
}

async function refreshIconBranding(checkoutDir) {
  if (!(await exists(nodelyIconSvgPath))) {
    return {
      updated: 0,
      skipped: 0
    };
  }

  const targets = [
    ...RASTER_ICON_SIZES.map((size) => ({
      outputPath: path.join(checkoutDir, "browser", "branding", "unofficial", `default${size}.png`),
      size
    })),
    ...RASTER_ICON_SIZES.filter((size) => size <= 128).map((size) => ({
      outputPath: path.join(
        checkoutDir,
        "obj-nodely",
        "dist",
        "bin",
        "browser",
        "chrome",
        "icons",
        "default",
        `default${size}.png`
      ),
      size
    })),
    ...RASTER_ICON_SIZES.filter((size) => size <= 128).map((size) => ({
      outputPath: path.join(
        checkoutDir,
        "obj-nodely",
        "dist",
        "bin",
        "browser",
        "chrome",
        "browser",
        "content",
        "branding",
        `icon${size}.png`
      ),
      size
    })),
    ...RASTER_ICON_SIZES.filter((size) => size <= 128).map((size) => ({
      outputPath: path.join(
        checkoutDir,
        "obj-nodely",
        "dist",
        "nodely",
        "browser",
        "chrome",
        "icons",
        "default",
        `default${size}.png`
      ),
      size
    }))
  ].filter(({ outputPath }) => outputPath && true);

  const existingTargets = [];

  for (const target of targets) {
    if (await exists(path.dirname(target.outputPath))) {
      existingTargets.push(target);
    }
  }

  return refreshRasterIconTargets(nodelyIconSvgPath, existingTargets);
}

async function pruneSupersededFirefoxArtifacts(checkoutDir) {
  const distDirectory = path.join(checkoutDir, "obj-nodely", "dist");
  const nodelyDirectory = path.join(distDirectory, "nodely");
  const removedPaths = [];

  if (!(await exists(distDirectory))) {
    return removedPaths;
  }

  if (await exists(nodelyDirectory)) {
    const firefoxDirectory = path.join(distDirectory, "firefox");

    if (await removeIfPresent(firefoxDirectory)) {
      removedPaths.push(firefoxDirectory);
    }
  }

  const distEntries = await readdir(distDirectory).catch(() => []);

  for (const entry of distEntries) {
    if (!entry.startsWith("firefox-")) {
      continue;
    }

    const nodelyEntry = `nodely-${entry.slice("firefox-".length)}`;
    const nodelyPath = path.join(distDirectory, nodelyEntry);
    const firefoxPath = path.join(distDirectory, entry);

    if (!(await exists(nodelyPath))) {
      continue;
    }

    if (await removeIfPresent(firefoxPath)) {
      removedPaths.push(firefoxPath);
    }
  }

  return removedPaths;
}

async function pruneLegacyBlinkOutputs(repositoryDirectory) {
  const outDirectory = path.join(repositoryDirectory, "out");
  const removedPaths = [];

  if (!(await exists(outDirectory))) {
    return removedPaths;
  }

  const outEntries = await readdir(outDirectory).catch(() => []);

  for (const entry of outEntries) {
    if (!/^Nodely Browser-/u.test(entry)) {
      continue;
    }

    const targetPath = path.join(outDirectory, entry);

    if (await removeIfPresent(targetPath)) {
      removedPaths.push(targetPath);
    }
  }

  return removedPaths;
}

async function refreshBranding({ checkoutDir, mode = "full" }) {
  const distBinDir = path.join(checkoutDir, "obj-nodely", "dist", "bin");
  const packagedNodelyDir = path.join(checkoutDir, "obj-nodely", "dist", "nodely");
  const macCompatUpdates = await ensureMacArtifactCompatibility(checkoutDir);

  if (mode === "compat") {
    console.log(`Refreshed artifact branding in ${checkoutDir} (${macCompatUpdates} macOS compat updates, compat-only mode).`);
    return;
  }

  const wrapperUpdates = process.platform === "win32"
    ? 0
    : [
        await ensureVersionWrapper(distBinDir, "firefox", "firefox-bin"),
        await ensureVersionWrapper(distBinDir, "nodely", "firefox-bin"),
        await ensureVersionWrapper(packagedNodelyDir, "nodely", "nodely-bin", {
          desktopFileName: "nodely-local-build.desktop"
        })
      ].filter(Boolean).length;
  const aliasUpdates = [
    await ensureAlias(distBinDir, "nodely-bin", "firefox-bin"),
    await ensureAlias(distBinDir, "nodely.exe", "firefox.exe"),
    await ensureAlias(distBinDir, "nodely-bin.exe", "firefox-bin.exe")
  ].filter(Boolean).length;

  const applicationIniUpdates = [
    await patchIfPresent(path.join(checkoutDir, "obj-nodely", "build", "application.ini")),
    await patchIfPresent(path.join(checkoutDir, "obj-nodely", "dist", "bin", "application.ini")),
    await patchIfPresent(path.join(checkoutDir, "obj-nodely", "dist", "firefox", "application.ini")),
    await patchIfPresent(path.join(checkoutDir, "obj-nodely", "dist", "nodely", "application.ini"))
  ].filter(Boolean).length;
  const iconRefresh = await refreshIconBranding(checkoutDir);
  const prunedFirefoxArtifacts = await pruneSupersededFirefoxArtifacts(checkoutDir);
  const prunedBlinkOutputs = await pruneLegacyBlinkOutputs(repositoryRoot);

  console.log(
    `Refreshed artifact branding in ${checkoutDir} (${macCompatUpdates} macOS compat updates, ${wrapperUpdates} wrapper updates, ${aliasUpdates} alias updates, ${applicationIniUpdates} application.ini updates, ${iconRefresh.updated} icon refreshes, ${prunedFirefoxArtifacts.length} Firefox artifact removals, ${prunedBlinkOutputs.length} Blink artifact removals).`
  );
}

export { refreshBranding };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await refreshBranding(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
