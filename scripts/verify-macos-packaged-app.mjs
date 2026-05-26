#!/usr/bin/env node

import { access, lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { findMacosAppBundles, inspectMacosAppSymlinks } from "./materialize-macos-app-symlinks.mjs";

const requiredRelativePaths = [
  "Contents/Info.plist",
  "Contents/MacOS/firefox",
  "Contents/MacOS/XUL",
  "Contents/Resources/application.ini",
  "Contents/Resources/omni.ja",
  "Contents/Resources/browser/omni.ja"
];

const forbiddenRelativePaths = [
  "Contents/Resources/.lldbinit",
  "Contents/Resources/moz-src"
];

const forbiddenInfoPlistKeys = [
  "MozillaDeveloperObjPath",
  "MozillaDeveloperRepoPath"
];

function usage() {
  console.log(`Usage: node scripts/verify-macos-packaged-app.mjs <path...>

Verifies that macOS app bundles are release-shaped before signing or publishing.
`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveAppBundles(rootPath) {
  const stats = await lstat(rootPath);

  if (stats.isDirectory() && rootPath.endsWith(".app")) {
    return [rootPath];
  }

  return findMacosAppBundles(rootPath);
}

function formatFailures(appBundlePath, failures) {
  return `${appBundlePath} is not a packaged macOS app:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`;
}

export async function verifyMacosPackagedApp(appBundlePath) {
  const failures = [];

  for (const relativePath of requiredRelativePaths) {
    if (!(await exists(path.join(appBundlePath, relativePath)))) {
      failures.push(`missing ${relativePath}`);
    }
  }

  for (const relativePath of forbiddenRelativePaths) {
    if (await exists(path.join(appBundlePath, relativePath))) {
      failures.push(`contains development artifact ${relativePath}`);
    }
  }

  const infoPlistPath = path.join(appBundlePath, "Contents", "Info.plist");

  if (await exists(infoPlistPath)) {
    const infoPlist = await readFile(infoPlistPath);

    for (const key of forbiddenInfoPlistKeys) {
      if (infoPlist.includes(Buffer.from(key))) {
        failures.push(`contains development Info.plist key ${key}`);
      }
    }
  }

  const symlinkInspection = await inspectMacosAppSymlinks(appBundlePath);

  if (symlinkInspection.externalSymlinks.length > 0) {
    failures.push(`${symlinkInspection.externalSymlinks.length} external symlink(s)`);
  }

  if (symlinkInspection.brokenSymlinks.length > 0) {
    failures.push(`${symlinkInspection.brokenSymlinks.length} broken symlink(s)`);
  }

  if (failures.length > 0) {
    throw new Error(formatFailures(appBundlePath, failures));
  }

  return {
    appBundlePath,
    requiredPaths: requiredRelativePaths.length,
    internalSymlinks: symlinkInspection.internalSymlinks.length
  };
}

export async function verifyMacosPackagedApps(rootPaths) {
  const summaries = [];

  for (const rootPath of rootPaths) {
    const appBundles = await resolveAppBundles(path.resolve(rootPath));

    if (appBundles.length === 0) {
      const entries = await readdir(rootPath).catch(() => []);
      throw new Error(`No macOS app bundles found under ${rootPath}. Entries: ${entries.join(", ")}`);
    }

    for (const appBundle of appBundles) {
      summaries.push(await verifyMacosPackagedApp(appBundle));
    }
  }

  return summaries;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    usage();
    process.exit(0);
  }

  if (args.length === 0) {
    throw new Error("Expected at least one path to inspect.");
  }

  const summaries = await verifyMacosPackagedApps(args);

  for (const summary of summaries) {
    console.log(
      `Verified ${summary.appBundlePath}: ${summary.requiredPaths} required packaged file(s), ${summary.internalSymlinks} internal symlink(s)`
    );
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
