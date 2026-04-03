import { access, constants, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = path.resolve(scriptDirectory, "..");
export const geckoReleaseDirectory = path.join(repositoryRoot, "gecko", "release-artifacts");
export const installerDirectory = path.join(repositoryRoot, "Installer");
export const outMakeDirectory = path.join(repositoryRoot, "out", "make");

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
  generic: ["Ubuntu", "Debian", "Fedora", "openSUSE", "other common desktop Linux distros"],
  deb: ["Ubuntu", "Debian", "Linux Mint", "Pop!_OS", "other Debian-family Linux distros"],
  rpm: ["Fedora", "RHEL", "Rocky Linux", "openSUSE", "other RPM-family Linux distros"],
  appimage: ["Most common desktop Linux distributions with FUSE/AppImage support"]
};

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

export function classifyInstallerFile(fileName, platform) {
  const extension = path.extname(fileName).toLowerCase();

  if (platform === "linux") {
    if (fileName.toLowerCase().endsWith(".appimage")) {
      return {
        variant: "appimage",
        distribution: "generic",
        compatibility: linuxVariantCompatibility.appimage
      };
    }

    if (extension === ".deb") {
      return {
        variant: "deb",
        distribution: "debian",
        compatibility: linuxVariantCompatibility.deb
      };
    }

    if (extension === ".rpm") {
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
    return {
      variant: extension.slice(1),
      distribution: "macos",
      compatibility: ["macOS"]
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
  const nextInstallers = [...manifest.installers];

  for (const outputPath of outputs) {
    const fileName = path.basename(outputPath);
    const classification = classifyInstallerFile(fileName, normalizedPlatform);

    if (!classification) {
      continue;
    }

    const existingEntries = nextInstallers.filter(
      (entry) =>
        entry.platform === normalizedPlatform &&
        entry.arch === normalizedArch &&
        entry.variant === classification.variant
    );

    for (const entry of existingEntries) {
      await rm(path.join(targetDirectory, entry.path), { force: true });
    }

    const filteredInstallers = nextInstallers.filter(
      (entry) =>
        !(
          entry.platform === normalizedPlatform &&
          entry.arch === normalizedArch &&
          entry.variant === classification.variant
        )
    );
    nextInstallers.length = 0;
    nextInstallers.push(...filteredInstallers);

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

  const nextManifest = {
    generatedAt: new Date().toISOString(),
    installers: nextInstallers.sort((left, right) => left.path.localeCompare(right.path))
  };

  await writeFile(path.join(targetDirectory, "manifest.json"), `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  return nextManifest;
}
