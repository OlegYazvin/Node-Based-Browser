#!/usr/bin/env node

import { access, constants, copyFile, lstat, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");

const NODELY_APP_ID = "{a75f9f03-78b1-4c8a-a2c7-f12d45088b29}";

function usage() {
  console.log(`Usage: node gecko/scripts/refresh-artifact-branding.mjs [options]

Options:
  --checkout-dir <path>  Gecko source checkout directory
  --help                 Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    checkoutDir: path.resolve(repositoryRoot, "..", "Nodely-Gecko", "firefox-esr")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
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

async function refreshBranding({ checkoutDir }) {
  const distBinDir = path.join(checkoutDir, "obj-nodely", "dist", "bin");
  const aliasUpdates = [
    await ensureAlias(distBinDir, "nodely", "firefox"),
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

  console.log(
    `Refreshed artifact branding in ${checkoutDir} (${aliasUpdates} alias updates, ${applicationIniUpdates} application.ini updates).`
  );
}

try {
  await refreshBranding(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
