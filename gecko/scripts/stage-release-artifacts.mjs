#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  win32: [/^nodely-.*\.exe$/iu, /^nodely-browser-.*\.exe$/iu, /^firefox-.*\.exe$/iu]
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

async function findPackagedArtifacts(checkoutDir, platform) {
  const distDirectory = path.join(checkoutDir, "obj-nodely", "dist");
  const files = await walkFiles(distDirectory);
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

export function selectPackagedArtifact(artifacts, platform) {
  if (platform !== "linux") {
    const [selectedArtifact] = [...artifacts].sort((left, right) => right.localeCompare(left));
    return selectedArtifact ?? null;
  }

  const runnableArtifacts = artifacts.filter((artifact) => linuxArtifactContainsRunnableBundle(artifact));

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
  const artifacts = await findPackagedArtifacts(options.checkoutDir, options.platform);

  if (!artifacts.length) {
    throw new Error(
      `No packaged Gecko artifacts were found for ${options.platform}. Run ./mach package in ${options.checkoutDir} first.`
    );
  }

  const selectedArtifact = selectPackagedArtifact(artifacts, options.platform);

  if (!selectedArtifact) {
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
    platform: options.platform,
    arch: options.arch,
    channel: options.channel,
    buildArtifact: path.basename(selectedArtifact),
    size: fileStats.size,
    stagedAt: new Date().toISOString()
  });

  const nextManifest = {
    generatedAt: new Date().toISOString(),
    artifacts: nextArtifacts.sort((left, right) => left.path.localeCompare(right.path))
  };

  await writeFile(path.join(options.stageDir, "manifest.json"), `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  console.log(destinationPath);
}

if (!process.env.VITEST) {
  try {
    await stageArtifacts(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
