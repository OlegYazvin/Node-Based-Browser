import { access, constants, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = path.resolve(scriptDirectory, "..");
export const geckoReleaseDirectory = path.join(repositoryRoot, "gecko", "release-artifacts");
export const installerDirectory = path.join(repositoryRoot, "Installer");
export const outMakeDirectory = path.join(repositoryRoot, "out", "make");
export const installerReadmeName = "README.MD";

const platformAliases = {
  linux: "linux",
  win32: "win32",
  windows: "win32",
  darwin: "darwin",
  macos: "darwin"
};

const archAliases = {
  x64: "x64",
  amd64: "x64",
  arm64: "arm64",
  aarch64: "arm64"
};

const linuxVariantCompatibility = {
  generic: ["Ubuntu", "Debian", "Fedora", "Linux Mint", "other common desktop Linux distros"],
  flatpak: ["Linux Mint", "Fedora", "Ubuntu", "Debian", "other Flatpak-enabled Linux distros"],
  debian: ["Debian"],
  ubuntu: ["Ubuntu"],
  fedora: ["Fedora"],
  deb: ["Ubuntu", "Debian", "Linux Mint", "Pop!_OS", "other Debian-family Linux distros"],
  rpm: ["Fedora", "RHEL", "Rocky Linux", "openSUSE", "other RPM-family Linux distros"],
  appimage: ["Most common desktop Linux distributions with FUSE/AppImage support"]
};

const installerSupportSections = [
  {
    platform: "win32",
    arch: "x64",
    title: "Windows 10 and 11",
    description: "Use this on Intel/AMD Windows 10 or Windows 11 PCs."
  },
  {
    platform: "darwin",
    arch: "x64",
    title: "macOS Intel",
    description: "Use this on Intel Macs."
  },
  {
    platform: "darwin",
    arch: "arm64",
    title: "macOS Apple Silicon",
    description: "Use this on Apple Silicon Macs."
  },
  {
    platform: "linux",
    arch: "x64",
    title: "Linux x64",
    description: "Use this on most Linux Mint, Ubuntu, Debian, and Fedora desktop PCs with Intel/AMD processors."
  },
  {
    platform: "linux",
    arch: "arm64",
    title: "Linux arm64",
    description: "Use this only on ARM64 Linux hardware."
  }
];

export function normalizePlatform(platform) {
  return platformAliases[platform] ?? platform;
}

export function normalizeArch(arch) {
  return archAliases[arch] ?? arch;
}

export function currentPlatform() {
  return normalizePlatform(process.platform);
}

export function currentArch() {
  return normalizeArch(process.arch);
}

export async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readPackageVersion() {
  const packageJsonPath = path.join(repositoryRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  return packageJson.version;
}

export async function readGeckoReleaseManifest(stageDirectory = geckoReleaseDirectory) {
  const manifestPath = path.join(stageDirectory, "manifest.json");

  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return {
      generatedAt: null,
      artifacts: []
    };
  }
}

export async function resolveGeckoReleaseArtifact({
  platform,
  arch,
  channel = "local",
  artifactPath = null,
  stageDirectory = geckoReleaseDirectory
}) {
  if (artifactPath) {
    return path.resolve(artifactPath);
  }

  const manifest = await readGeckoReleaseManifest(stageDirectory);
  const entry =
    manifest.artifacts.find(
      (candidate) =>
        candidate.platform === normalizePlatform(platform) &&
        candidate.arch === normalizeArch(arch) &&
        candidate.channel === channel
    ) ?? null;

  if (!entry) {
    throw new Error(
      `No staged Gecko release artifact found for platform=${platform} arch=${arch} channel=${channel}.`
    );
  }

  return path.join(stageDirectory, entry.path);
}

export async function ensureCleanDirectory(targetDirectory) {
  await rm(targetDirectory, { recursive: true, force: true });
  await mkdir(targetDirectory, { recursive: true });
}

export async function ensureDirectory(targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
}

export async function readInstallerManifest(targetDirectory = installerDirectory) {
  const manifestPath = path.join(targetDirectory, "manifest.json");

  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return {
      generatedAt: null,
      installers: []
    };
  }
}

export function classifyInstallerFile(fileName, platform, arch = null) {
  const extension = path.extname(fileName).toLowerCase();
  const lowerFileName = fileName.toLowerCase();

  if (platform === "linux") {
    if (lowerFileName.endsWith(".appimage")) {
      return {
        variant: "appimage",
        distribution: "generic",
        compatibility: linuxVariantCompatibility.appimage
      };
    }

    if (extension === ".flatpak") {
      return {
        variant: "flatpak",
        distribution: "flatpak",
        compatibility: linuxVariantCompatibility.flatpak
      };
    }

    if (extension === ".deb") {
      if (lowerFileName.includes("ubuntu")) {
        return {
          variant: "deb",
          distribution: "ubuntu",
          compatibility: linuxVariantCompatibility.ubuntu
        };
      }

      if (lowerFileName.includes("debian")) {
        return {
          variant: "deb",
          distribution: "debian",
          compatibility: linuxVariantCompatibility.debian
        };
      }

      return {
        variant: "deb",
        distribution: "debian-family",
        compatibility: linuxVariantCompatibility.deb
      };
    }

    if (extension === ".rpm") {
      if (lowerFileName.includes("fedora")) {
        return {
          variant: "rpm",
          distribution: "fedora",
          compatibility: linuxVariantCompatibility.fedora
        };
      }

      return {
        variant: "rpm",
        distribution: "rpm",
        compatibility: linuxVariantCompatibility.rpm
      };
    }

    if (extension === ".run") {
      return {
        variant: "generic",
        distribution: "generic",
        compatibility: linuxVariantCompatibility.generic
      };
    }
  }

  if (platform === "win32" && extension === ".exe") {
    return {
      variant: "installer",
      distribution: "windows",
      compatibility: ["Windows 10", "Windows 11"]
    };
  }

  if (platform === "darwin" && (extension === ".dmg" || extension === ".pkg")) {
    const compatibility =
      arch === "x64" ? ["macOS Intel"] : arch === "arm64" ? ["macOS Apple Silicon"] : ["macOS"];

    return {
      variant: extension.slice(1),
      distribution: "macos",
      compatibility
    };
  }

  return null;
}

export function stagedInstallerRelativePath(platform, fileName) {
  if (platform === "linux") {
    return path.join("linux", fileName);
  }

  if (platform === "win32") {
    return path.join("windows", fileName);
  }

  if (platform === "darwin") {
    return path.join("macos", fileName);
  }

  return fileName;
}

export function parseInstallerTarget(target) {
  if (typeof target !== "string" || !target.includes(":")) {
    throw new Error(`Expected installer target in <platform>:<arch> form, received: ${target}`);
  }

  const [rawPlatform, rawArch] = target.split(":");
  const platform = normalizePlatform(rawPlatform);
  const arch = normalizeArch(rawArch);

  if (!platform || !arch) {
    throw new Error(`Invalid installer target: ${target}`);
  }

  return { platform, arch };
}

export async function listInstallerOutputs(platform, arch, makeDirectory = outMakeDirectory) {
  const platformDirectory = path.join(makeDirectory, normalizePlatform(platform), normalizeArch(arch));

  if (!(await pathExists(platformDirectory))) {
    return [];
  }

  const entries = await readdir(platformDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(platformDirectory, entry.name));
}

function installerDisplayType(entry) {
  if (entry.platform === "linux") {
    if (entry.variant === "generic") {
      return "Self-extracting installer (`.run`)";
    }

    if (entry.variant === "flatpak") {
      return "Flatpak bundle";
    }

    if (entry.variant === "rpm") {
      return entry.distribution === "fedora" ? "Fedora RPM package" : "RPM package";
    }

    if (entry.variant === "deb") {
      if (entry.distribution === "ubuntu") {
        return "Ubuntu DEB package";
      }

      if (entry.distribution === "debian") {
        return "Debian DEB package";
      }

      return "DEB package";
    }
  }

  if (entry.platform === "win32") {
    return "Windows installer (`.exe`)";
  }

  if (entry.platform === "darwin") {
    return entry.variant === "pkg" ? "macOS package installer (`.pkg`)" : "macOS disk image (`.dmg`)";
  }

  return entry.variant;
}

function installerSupportText(entry) {
  const systems = Array.isArray(entry.compatibility) && entry.compatibility.length ? entry.compatibility.join(", ") : "Supported systems";

  if (entry.platform === "linux") {
    return `${systems}; ${entry.arch} only`;
  }

  if (entry.platform === "win32") {
    return `${systems}; x64 only`;
  }

  return systems;
}

function installerLinkPath(relativePath) {
  return relativePath.replaceAll("\\", "/");
}

export function renderInstallerReadme(manifest) {
  const installers = [...(manifest.installers ?? [])].sort((left, right) => {
    const platformOrder = ["win32", "darwin", "linux"];
    const archOrder = ["x64", "arm64"];
    const leftPlatformIndex = platformOrder.indexOf(left.platform);
    const rightPlatformIndex = platformOrder.indexOf(right.platform);

    if (leftPlatformIndex !== rightPlatformIndex) {
      return leftPlatformIndex - rightPlatformIndex;
    }

    const leftArchIndex = archOrder.indexOf(left.arch);
    const rightArchIndex = archOrder.indexOf(right.arch);

    if (leftArchIndex !== rightArchIndex) {
      return leftArchIndex - rightArchIndex;
    }

    return left.fileName.localeCompare(right.fileName);
  });

  const sections = installerSupportSections
    .map((section) => {
      const sectionInstallers = installers.filter(
        (entry) => entry.platform === section.platform && entry.arch === section.arch
      );

      const lines = [`## ${section.title}`, "", section.description, ""];

      if (!sectionInstallers.length) {
        lines.push("No installers are currently staged in this repo for this target.", "");
        return lines.join("\n");
      }

      lines.push("| File | Type | Supported systems |");
      lines.push("| --- | --- | --- |");

      for (const entry of sectionInstallers) {
        const linkPath = installerLinkPath(entry.path);
        lines.push(
          `| [${entry.fileName}](./${linkPath}) | ${installerDisplayType(entry)} | ${installerSupportText(entry)} |`
        );
      }

      lines.push("");
      return lines.join("\n");
    })
    .join("\n");

  const generatedAt = manifest.generatedAt ? new Date(manifest.generatedAt).toISOString() : "unknown";

  return `# Nodely Installer Guide

This directory contains the installers that actually exist in this repo right now. \`Installer/manifest.json\` is the machine-readable source of truth, and this file is regenerated from that manifest.

## Quick guide

- Use **Linux x64** on most Linux Mint, Ubuntu, Debian, and Fedora desktop PCs.
- Use **Linux arm64** only on ARM64 Linux hardware.
- Windows and macOS installers are produced on native GitHub Actions runners and only show up here after a real native build has been promoted into this directory.
- If a section below says no installers are staged, there is nothing in this repo for that target today.
- First-pass Windows and macOS installers may be unsigned unless separate signing credentials are configured.

Generated from \`Installer/manifest.json\` at ${generatedAt}.

${sections}`.trimEnd() + "\n";
}

async function writeInstallerReadme(targetDirectory, manifest) {
  const readmePath = path.join(targetDirectory, installerReadmeName);
  await writeFile(readmePath, renderInstallerReadme(manifest), "utf8");
}

async function writeInstallerState(targetDirectory, installers) {
  const nextManifest = {
    generatedAt: new Date().toISOString(),
    installers: installers.sort((left, right) => left.path.localeCompare(right.path))
  };

  await writeFile(path.join(targetDirectory, "manifest.json"), `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  await writeInstallerReadme(targetDirectory, nextManifest);
  return nextManifest;
}

function matchesInstallerTarget(entry, targets) {
  return targets.some((target) => entry.platform === target.platform && entry.arch === target.arch);
}

export async function pruneInstallers({
  targets,
  targetDirectory = installerDirectory
}) {
  await ensureDirectory(targetDirectory);
  const manifest = await readInstallerManifest(targetDirectory);
  const normalizedTargets = targets.map((target) =>
    typeof target === "string" ? parseInstallerTarget(target) : {
      platform: normalizePlatform(target.platform),
      arch: normalizeArch(target.arch)
    }
  );

  const removedEntries = manifest.installers.filter((entry) => matchesInstallerTarget(entry, normalizedTargets));

  for (const entry of removedEntries) {
    await rm(path.join(targetDirectory, entry.path), { force: true });
  }

  const nextInstallers = manifest.installers.filter((entry) => !matchesInstallerTarget(entry, normalizedTargets));
  return writeInstallerState(targetDirectory, nextInstallers);
}

export async function syncInstallers({
  platform,
  arch,
  makeDirectory = outMakeDirectory,
  targetDirectory = installerDirectory
}) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedArch = normalizeArch(arch);
  const version = await readPackageVersion();
  const outputs = await listInstallerOutputs(normalizedPlatform, normalizedArch, makeDirectory);

  if (!outputs.length) {
    throw new Error(
      `No installer outputs found in ${path.join(makeDirectory, normalizedPlatform, normalizedArch)}.`
    );
  }

  await ensureDirectory(targetDirectory);
  const manifest = await readInstallerManifest(targetDirectory);
  const nextInstallers = manifest.installers.filter(
    (entry) => !(entry.platform === normalizedPlatform && entry.arch === normalizedArch)
  );

  for (const entry of manifest.installers) {
    if (entry.platform === normalizedPlatform && entry.arch === normalizedArch) {
      await rm(path.join(targetDirectory, entry.path), { force: true });
    }
  }

  for (const outputPath of outputs) {
    const fileName = path.basename(outputPath);
    const classification = classifyInstallerFile(fileName, normalizedPlatform, normalizedArch);

    if (!classification) {
      continue;
    }

    const relativeDestination = stagedInstallerRelativePath(normalizedPlatform, fileName);
    const destinationPath = path.join(targetDirectory, relativeDestination);
    await ensureDirectory(path.dirname(destinationPath));
    await rm(destinationPath, { force: true });
    await cp(outputPath, destinationPath);

    const outputStats = await stat(destinationPath);
    nextInstallers.push({
      version,
      platform: normalizedPlatform,
      arch: normalizedArch,
      variant: classification.variant,
      distribution: classification.distribution,
      compatibility: classification.compatibility,
      path: relativeDestination,
      fileName: path.basename(destinationPath),
      source: path.relative(repositoryRoot, outputPath),
      size: outputStats.size,
      syncedAt: new Date().toISOString()
    });
  }

  return writeInstallerState(targetDirectory, nextInstallers);
}
