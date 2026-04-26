#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { extractGeckoArtifactVersion } from "../../scripts/installers-lib.mjs";
import { readNodelyVersionMetadata } from "../../scripts/nodely-version.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");

const platformAliases = {
  linux: "linux",
  win32: "win32",
  windows: "win32",
  darwin: "darwin",
  macos: "darwin"
};

const artifactMatchers = {
  linux: [
    /^nodely-.*\.(?:tar\.xz|tar\.bz2|tar\.gz)$/iu,
    /^nodely-browser-.*\.(?:tar\.xz|tar\.bz2|tar\.gz)$/iu,
    /^firefox-.*\.(?:tar\.xz|tar\.bz2|tar\.gz)$/iu
  ],
  darwin: [
    /^nodely-.*\.(?:dmg|pkg)$/iu,
    /^nodely-browser-.*\.dmg$/iu,
    /^firefox-.*\.dmg$/iu,
    /^nodely-browser-.*\.pkg$/iu
  ],
  win32: []
};

function usage() {
  console.log(`Usage: node gecko/scripts/stage-release-artifacts.mjs [options]

Options:
  --checkout-dir <path>  Gecko source checkout directory
  --platform <platform>  linux | darwin | win32
  --arch <arch>          Artifact architecture label
  --channel <name>       Release channel label
  --stage-dir <path>     Staging directory (defaults to gecko/release-artifacts)
  --help                 Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    checkoutDir: path.resolve(repositoryRoot, "..", "Nodely-Gecko", "firefox-esr"),
    platform: platformAliases[process.platform] ?? process.platform,
    arch: process.arch,
    channel: "local",
    stageDir: path.join(geckoRoot, "release-artifacts")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
        break;
      case "--platform":
        options.platform = platformAliases[argv[++index]] ?? argv[index];
        break;
      case "--arch":
        options.arch = argv[++index];
        break;
      case "--channel":
        options.channel = argv[++index];
        break;
      case "--stage-dir":
        options.stageDir = path.resolve(argv[++index]);
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!(options.platform in artifactMatchers)) {
    throw new Error(`Unsupported release platform: ${options.platform}`);
  }

  return options;
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

export function isPackagedWindowsInstallerName(fileName) {
  return /^(?:nodely(?:-browser)?|firefox(?:-browser)?)-.+\.installer\.exe$/iu.test(fileName);
}

export async function findPackagedArtifacts(checkoutDir, platform) {
  const distDirectory = path.join(checkoutDir, "obj-nodely", "dist");
  const files = await walkFiles(distDirectory);

  if (platform === "win32") {
    return files.filter((filePath) => isPackagedWindowsInstallerName(path.basename(filePath)));
  }

  const matchers = artifactMatchers[platform];

  return files.filter((filePath) => matchers.some((matcher) => matcher.test(path.basename(filePath))));
}

function linuxArtifactNamePriority(filePath) {
  const fileName = path.basename(filePath);

  if (/^nodely-.*\.(?:tar\.xz|tar\.bz2|tar\.gz)$/iu.test(fileName)) {
    return 3;
  }

  if (/^firefox-.*\.(?:tar\.xz|tar\.bz2|tar\.gz)$/iu.test(fileName)) {
    return 2;
  }

  if (/^nodely-browser-.*\.(?:tar\.xz|tar\.bz2|tar\.gz)$/iu.test(fileName)) {
    return 1;
  }

  return 0;
}

function linuxArtifactContainsRunnableBundle(filePath) {
  try {
    const listing = execFileSync("tar", ["-tf", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    const hasMetadata = /(^|\/)(?:application\.ini|platform\.ini)$/mu.test(listing);
    const hasBrowserBinary = /(^|\/)(?:nodely-bin|firefox-bin)$/mu.test(listing);
    const hasLibxul = /(^|\/)libxul\.so$/mu.test(listing);

    return hasMetadata && hasBrowserBinary && hasLibxul;
  } catch {
    return false;
  }
}

function inspectLinuxArtifactBundle(filePath) {
  try {
    const listing = execFileSync("tar", ["-tf", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    return {
      hasMetadata: /(^|\/)(?:application\.ini|platform\.ini)$/mu.test(listing),
      hasBrowserBinary: /(^|\/)(?:nodely-bin|firefox-bin)$/mu.test(listing),
      hasLibxul: /(^|\/)libxul\.so$/mu.test(listing)
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      hasMetadata: false,
      hasBrowserBinary: false,
      hasLibxul: false
    };
  }
}

export function inspectWindowsInstallerListing(listing) {
  const normalizedListing = String(listing ?? "");

  return {
    hasMetadata: /(?:^|\n).*\bcore\/application\.ini\b/mu.test(normalizedListing),
    hasBrowserBinary: /(?:^|\n).*\bcore\/(?:nodely(?:-bin)?|firefox(?:-bin)?)\.exe\b/mu.test(normalizedListing),
    hasRuntimeLibrary: /(?:^|\n).*\bcore\/xul\.dll\b/mu.test(normalizedListing)
  };
}

function windowsArtifactContainsRunnableBundle(filePath) {
  const inspection = inspectWindowsArtifactBundle(filePath);
  return inspection.hasMetadata && inspection.hasBrowserBinary && inspection.hasRuntimeLibrary;
}

function inspectWindowsArtifactBundle(filePath) {
  try {
    const listing = execFileSync("7z", ["l", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    return inspectWindowsInstallerListing(listing);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      hasMetadata: false,
      hasBrowserBinary: false,
      hasRuntimeLibrary: false
    };
  }
}

export function selectPackagedArtifact(artifacts, platform, inspectors = {}) {
  const inspectLinuxArtifact = inspectors.inspectLinuxArtifact ?? linuxArtifactContainsRunnableBundle;
  const inspectWindowsArtifact = inspectors.inspectWindowsArtifact ?? windowsArtifactContainsRunnableBundle;

  if (platform === "darwin") {
    const artifactPriority = (artifactPath) => {
      const lowerArtifactPath = artifactPath.toLowerCase();

      if (lowerArtifactPath.endsWith(".dmg")) {
        return 2;
      }

      if (lowerArtifactPath.endsWith(".pkg")) {
        return 1;
      }

      return 0;
    };

    const [selectedArtifact] = [...artifacts].sort((left, right) => {
      const priorityDifference = artifactPriority(right) - artifactPriority(left);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return right.localeCompare(left);
    });

    return selectedArtifact ?? null;
  }

  if (platform === "win32") {
    const runnableArtifacts = artifacts.filter((artifact) => inspectWindowsArtifact(artifact));

    if (!runnableArtifacts.length) {
      return null;
    }

    const [selectedArtifact] = [...runnableArtifacts].sort((left, right) => right.localeCompare(left));
    return selectedArtifact ?? null;
  }

  if (platform !== "linux") {
    const [selectedArtifact] = [...artifacts].sort((left, right) => right.localeCompare(left));
    return selectedArtifact ?? null;
  }

  const runnableArtifacts = artifacts.filter((artifact) => inspectLinuxArtifact(artifact));

  if (!runnableArtifacts.length) {
    return null;
  }

  const [selectedArtifact] = [...runnableArtifacts].sort((left, right) => {
    const priorityDifference = linuxArtifactNamePriority(right) - linuxArtifactNamePriority(left);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return right.localeCompare(left);
  });

  return selectedArtifact ?? null;
}

async function readManifest(stageDir) {
  const manifestPath = path.join(stageDir, "manifest.json");

  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return {
      generatedAt: null,
      nodelyVersion: null,
      artifacts: []
    };
  }
}

function normalizeArtifactBaseName(fileName) {
  return fileName
    .replace(/^(?:firefox(?:-browser)?|nodely(?:-browser)?)(?=[-.])/iu, "nodely-browser")
    .replace(/^nodely-browser-browser(?=[-.])/iu, "nodely-browser");
}

async function stageArtifacts(options) {
  const { displayVersion: nodelyVersion } = readNodelyVersionMetadata();
  const artifacts = await findPackagedArtifacts(options.checkoutDir, options.platform);

  if (!artifacts.length) {
    throw new Error(
      `No packaged Gecko artifacts were found for ${options.platform}. Run ./mach package in ${options.checkoutDir} first.`
    );
  }

  const selectedArtifact = selectPackagedArtifact(artifacts, options.platform);

  if (!selectedArtifact) {
    if (options.platform === "linux") {
      const artifactSummary = artifacts
        .map((artifact) => {
          const inspection = inspectLinuxArtifactBundle(artifact);

          if (inspection.error) {
            return `${path.basename(artifact)} [error=${inspection.error}]`;
          }

          return `${path.basename(artifact)} [metadata=${inspection.hasMetadata} binary=${inspection.hasBrowserBinary} libxul=${inspection.hasLibxul}]`;
        })
        .join(", ");

      throw new Error(
        `Unable to select a packaged Gecko artifact for ${options.platform}. Candidates: ${artifactSummary || "(none)"}.`
      );
    }

    if (options.platform === "win32") {
      const artifactSummary = artifacts
        .map((artifact) => {
          const inspection = inspectWindowsArtifactBundle(artifact);

          if (inspection.error) {
            return `${path.basename(artifact)} [error=${inspection.error}]`;
          }

          return `${path.basename(artifact)} [metadata=${inspection.hasMetadata} binary=${inspection.hasBrowserBinary} runtime=${inspection.hasRuntimeLibrary}]`;
        })
        .join(", ");

      throw new Error(
        `Unable to select a packaged Gecko artifact for ${options.platform}. Candidates: ${artifactSummary || "(none)"}.`
      );
    }

    throw new Error(`Unable to select a packaged Gecko artifact for ${options.platform}.`);
  }

  const destinationDirectory = path.join(options.stageDir, options.platform, options.arch, options.channel);
  const destinationPath = path.join(destinationDirectory, normalizeArtifactBaseName(path.basename(selectedArtifact)));

  await mkdir(destinationDirectory, { recursive: true });
  await rm(destinationPath, { force: true });
  await cp(selectedArtifact, destinationPath);

  const manifest = await readManifest(options.stageDir);
  const relativeDestination = path.relative(options.stageDir, destinationPath);
  const fileStats = await stat(destinationPath);
  const nextArtifacts = manifest.artifacts.filter(
    (entry) =>
      !(
        entry.platform === options.platform &&
        entry.arch === options.arch &&
        entry.channel === options.channel
      )
  );

  nextArtifacts.push({
    path: relativeDestination,
    nodelyVersion,
    geckoVersion: extractGeckoArtifactVersion(path.basename(selectedArtifact)),
    platform: options.platform,
    arch: options.arch,
    channel: options.channel,
    buildArtifact: path.basename(selectedArtifact),
    size: fileStats.size,
    stagedAt: new Date().toISOString()
  });

  const nextManifest = {
    generatedAt: new Date().toISOString(),
    nodelyVersion,
    artifacts: nextArtifacts.sort((left, right) => left.path.localeCompare(right.path))
  };

  await writeFile(path.join(options.stageDir, "manifest.json"), `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  console.log(destinationPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await stageArtifacts(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
