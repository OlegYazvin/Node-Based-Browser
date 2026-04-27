#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { access, constants, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  inspectWindowsBrowserOmniListing,
  inspectWindowsArtifactBundle,
  inspectWindowsInstallerListing,
  isPackagedWindowsInstallerName
} from "./stage-release-artifacts.mjs";
import { syncRuntimeOmniArchive } from "./sync-overlay.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");
const archivePayloadMaxBuffer = 256 * 1024 * 1024;

function usage() {
  console.log(`Usage: node gecko/scripts/repair-windows-installer.mjs [options]

Options:
  --checkout-dir <path>       Gecko source checkout directory
  --installer <path>          Explicit Windows installer to inspect/repair
  --official-installer <path> Use a local official Firefox ESR installer as the donor payload
  --version <version>         Firefox ESR version used for the donor installer URL
  --cache-dir <path>          Directory for cached donor installers
  --verify-only               Fail if repair is needed instead of applying it
  --help                      Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    checkoutDir: path.resolve(repositoryRoot, "..", "Nodely-Gecko", "firefox-esr"),
    installerPath: null,
    officialInstallerPath: null,
    version: process.env.FIREFOX_ESR_VERSION ?? "",
    cacheDirectory: path.join(process.env.RUNNER_TEMP || os.tmpdir(), "nodely-windows-installer-cache"),
    verifyOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
        break;
      case "--installer":
        options.installerPath = path.resolve(argv[++index]);
        break;
      case "--official-installer":
        options.officialInstallerPath = path.resolve(argv[++index]);
        break;
      case "--version":
        options.version = argv[++index] ?? options.version;
        break;
      case "--cache-dir":
        options.cacheDirectory = path.resolve(argv[++index]);
        break;
      case "--verify-only":
        options.verifyOnly = true;
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

async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run7z(args, options = {}) {
  return execFileSync("7z", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
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

export function parse7zTechnicalListing(listing) {
  const lines = String(listing ?? "").split(/\r?\n/u);
  const entries = [];
  let inEntries = false;
  let currentEntry = null;

  const flushCurrentEntry = () => {
    if (!currentEntry?.path || /^\[\d+\]$/u.test(currentEntry.path)) {
      currentEntry = null;
      return;
    }

    entries.push(currentEntry);
    currentEntry = null;
  };

  for (const line of lines) {
    if (line.trim() === "----------") {
      inEntries = true;
      flushCurrentEntry();
      continue;
    }

    if (!inEntries) {
      continue;
    }

    if (!line.trim()) {
      flushCurrentEntry();
      continue;
    }

    if (line.startsWith("Path = ")) {
      flushCurrentEntry();
      currentEntry = {
        path: line.slice("Path = ".length),
        isDirectory: false
      };
      continue;
    }

    if (currentEntry && line.startsWith("Attributes = ")) {
      const attributes = line.slice("Attributes = ".length).trim();
      currentEntry.isDirectory = /\bD\b/u.test(attributes);
    }
  }

  flushCurrentEntry();
  return entries;
}

export function computeMissingArchiveEntries(partialEntries, donorEntries) {
  const partialSet = new Set(partialEntries);

  return donorEntries.filter(
    (entry) =>
      !entry.isDirectory &&
      entry.path !== "setup.exe" &&
      !partialSet.has(entry.path)
  );
}

export function officialWindowsInstallerUrl(version) {
  return `https://archive.mozilla.org/pub/firefox/releases/${version}/win64/en-US/Firefox%20Setup%20${version}.exe`;
}

function listArchiveEntries(archivePath) {
  return parse7zTechnicalListing(run7z(["l", "-slt", archivePath]));
}

function readArchiveTextEntry(archivePath, entryPath) {
  return execFileSync("7z", ["x", "-so", archivePath, entryPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function downloadOfficialInstaller(version, cacheDirectory) {
  if (!version) {
    throw new Error("Missing Firefox ESR version for Windows installer repair.");
  }

  await mkdir(cacheDirectory, { recursive: true });
  const fileName = `Firefox Setup ${version}.exe`;
  const outputPath = path.join(cacheDirectory, fileName);

  if (await pathExists(outputPath)) {
    return outputPath;
  }

  const response = await fetch(officialWindowsInstallerUrl(version), {
    method: "GET",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `Unable to download official Firefox ESR Windows installer ${version}: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));
  return outputPath;
}

export async function findWindowsInstallers(checkoutDir) {
  const distDirectory = path.join(checkoutDir, "obj-nodely", "dist");

  if (!(await pathExists(distDirectory))) {
    return [];
  }

  const files = await walkFiles(distDirectory);
  return files
    .filter((filePath) => isPackagedWindowsInstallerName(path.basename(filePath)))
    .sort((left, right) => left.localeCompare(right));
}

function verifyNodelyApplicationIni(installerPath) {
  const applicationIni = readArchiveTextEntry(installerPath, "core/application.ini");

  if (!/^Vendor=Nodely$/mu.test(applicationIni) || !/^Name=Nodely$/mu.test(applicationIni)) {
    throw new Error(`Expected ${installerPath} to preserve Nodely application metadata after repair.`);
  }
}

function verifyNodelyChromePayload(installerPath) {
  const inspection = inspectWindowsArtifactBundle(installerPath);

  if (inspection.error) {
    throw new Error(`Unable to inspect Nodely browser chrome in ${installerPath}: ${inspection.error}`);
  }

  if (!inspection.hasCompleteNodelyChrome) {
    throw new Error(
      `Windows installer ${installerPath} is missing Nodely browser chrome files: ${inspection.missingNodelyFiles.join(", ")}`
    );
  }
}

async function repairNodelyChromePayload(installerPath) {
  const inspection = inspectWindowsArtifactBundle(installerPath);

  if (inspection.error || inspection.hasCompleteNodelyChrome) {
    return false;
  }

  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-windows-browser-omni-repair-"));

  try {
    const browserOmniPath = path.join(stagingDirectory, "core", "browser", "omni.ja");
    const browserOmni = execFileSync("7z", ["x", "-so", installerPath, "core/browser/omni.ja"], {
      maxBuffer: archivePayloadMaxBuffer,
      stdio: ["ignore", "pipe", "pipe"]
    });

    await mkdir(path.dirname(browserOmniPath), { recursive: true });
    await writeFile(browserOmniPath, browserOmni);
    syncRuntimeOmniArchive(browserOmniPath);
    const repairedBrowserOmniListing = run7z(["l", browserOmniPath]);
    const repairedBrowserOmniInspection = inspectWindowsBrowserOmniListing(repairedBrowserOmniListing);

    if (!repairedBrowserOmniInspection.hasCompleteNodelyChrome) {
      throw new Error(
        `Prepared Windows browser omni is missing Nodely browser chrome files: ${repairedBrowserOmniInspection.missingNodelyFiles.join(", ")}`
      );
    }

    run7z(["d", "-y", installerPath, "core/browser/omni.ja"]);
    run7z(["a", "-y", installerPath, "core/browser/omni.ja"], {
      cwd: stagingDirectory
    });
    return true;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function repairWindowsInstaller({
  installerPath,
  officialInstallerPath,
  verifyOnly = false
}) {
  const partialListing = run7z(["l", installerPath]);
  const partialInspection = inspectWindowsInstallerListing(partialListing);

  if (partialInspection.hasMetadata && partialInspection.hasBrowserBinary && partialInspection.hasRuntimeLibrary) {
    verifyNodelyApplicationIni(installerPath);
    const repairedNodelyChrome = verifyOnly ? false : await repairNodelyChromePayload(installerPath);
    verifyNodelyChromePayload(installerPath);

    return {
      repaired: repairedNodelyChrome,
      addedEntries: repairedNodelyChrome ? ["core/browser/omni.ja"] : []
    };
  }

  const partialEntries = listArchiveEntries(installerPath);
  const donorEntries = listArchiveEntries(officialInstallerPath);
  const missingEntries = computeMissingArchiveEntries(
    partialEntries.filter((entry) => !entry.isDirectory).map((entry) => entry.path),
    donorEntries
  );

  if (!missingEntries.length) {
    throw new Error(`Windows installer ${installerPath} is incomplete, but no donor payload entries were available to repair it.`);
  }

  if (verifyOnly) {
    throw new Error(
      `Windows installer ${installerPath} is incomplete. Missing payload entries include: ${missingEntries
        .slice(0, 10)
        .map((entry) => entry.path)
        .join(", ")}${missingEntries.length > 10 ? ", ..." : ""}`
    );
  }

  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-windows-installer-repair-"));

  try {
    run7z(["x", "-y", officialInstallerPath, ...missingEntries.map((entry) => entry.path), `-o${stagingDirectory}`]);
    run7z(["u", installerPath, ...missingEntries.map((entry) => entry.path)], {
      cwd: stagingDirectory
    });
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
  }

  const repairedListing = run7z(["l", installerPath]);
  const repairedInspection = inspectWindowsInstallerListing(repairedListing);

  if (!repairedInspection.hasMetadata || !repairedInspection.hasBrowserBinary || !repairedInspection.hasRuntimeLibrary) {
    throw new Error(`Windows installer ${installerPath} is still incomplete after repair.`);
  }

  verifyNodelyApplicationIni(installerPath);
  await repairNodelyChromePayload(installerPath);
  verifyNodelyChromePayload(installerPath);

  return {
    repaired: true,
    addedEntries: missingEntries.map((entry) => entry.path)
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const installers = options.installerPath ? [options.installerPath] : await findWindowsInstallers(options.checkoutDir);

  if (!installers.length) {
    throw new Error(`No packaged Windows installers were found under ${path.join(options.checkoutDir, "obj-nodely", "dist")}.`);
  }

  const officialInstallerPath =
    options.officialInstallerPath ?? (await downloadOfficialInstaller(options.version, options.cacheDirectory));

  for (const installerPath of installers) {
    const result = await repairWindowsInstaller({
      installerPath,
      officialInstallerPath,
      verifyOnly: options.verifyOnly
    });

    if (result.repaired) {
      console.log(`Repaired ${installerPath} with ${result.addedEntries.length} payload entries from ${officialInstallerPath}.`);
    } else {
      console.log(`Verified ${installerPath}; Windows runtime payload already complete.`);
    }
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
