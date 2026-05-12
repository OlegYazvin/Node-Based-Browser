#!/usr/bin/env node

import { chmod, cp, lstat, readlink, readdir, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function usage() {
  console.log(`Usage: node scripts/materialize-macos-app-symlinks.mjs [--check] <path...>

Options:
  --check   Fail when a macOS app bundle contains broken or external symlinks.
  --help    Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    check: false,
    roots: []
  };

  for (const argument of argv) {
    switch (argument) {
      case "--check":
        options.check = true;
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        options.roots.push(path.resolve(argument));
        break;
    }
  }

  if (!options.roots.length) {
    throw new Error("Expected at least one path to inspect.");
  }

  return options;
}

function isPathInside(parent, candidate) {
  const relativePath = path.relative(parent, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findMacosAppBundles(rootPath) {
  const bundles = [];
  const queue = [rootPath];

  while (queue.length > 0) {
    const currentPath = queue.pop();

    if (!currentPath) {
      continue;
    }

    let currentStats;
    try {
      currentStats = await lstat(currentPath);
    } catch {
      continue;
    }

    if (!currentStats.isDirectory()) {
      continue;
    }

    if (currentPath.endsWith(".app")) {
      bundles.push(currentPath);
      continue;
    }

    for (const entry of await readdir(currentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      queue.push(path.join(currentPath, entry.name));
    }
  }

  return bundles.sort((left, right) => left.localeCompare(right));
}

async function walkBundleSymlinks(appBundlePath) {
  const symlinks = [];
  const queue = [appBundlePath];

  while (queue.length > 0) {
    const currentPath = queue.pop();

    if (!currentPath) {
      continue;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isSymbolicLink()) {
        symlinks.push(entryPath);
        continue;
      }

      if (entry.isDirectory()) {
        queue.push(entryPath);
      }
    }
  }

  return symlinks.sort((left, right) => left.localeCompare(right));
}

async function inspectSymlink(appRealPath, symlinkPath) {
  const linkTarget = await readlink(symlinkPath);
  const resolvedTarget = path.isAbsolute(linkTarget)
    ? linkTarget
    : path.resolve(path.dirname(symlinkPath), linkTarget);

  let targetRealPath = null;
  try {
    targetRealPath = await realpath(resolvedTarget);
  } catch {
    return {
      kind: "broken",
      linkPath: symlinkPath,
      linkTarget,
      resolvedTarget,
      targetRealPath: null
    };
  }

  return {
    kind: isPathInside(appRealPath, targetRealPath) ? "internal" : "external",
    linkPath: symlinkPath,
    linkTarget,
    resolvedTarget,
    targetRealPath
  };
}

export async function inspectMacosAppSymlinks(appBundlePath) {
  const appRealPath = await realpath(appBundlePath);
  const symlinkPaths = await walkBundleSymlinks(appBundlePath);
  const inspection = {
    appBundlePath,
    internalSymlinks: [],
    externalSymlinks: [],
    brokenSymlinks: []
  };

  for (const symlinkPath of symlinkPaths) {
    const symlink = await inspectSymlink(appRealPath, symlinkPath);

    if (symlink.kind === "external") {
      inspection.externalSymlinks.push(symlink);
    } else if (symlink.kind === "broken") {
      inspection.brokenSymlinks.push(symlink);
    } else {
      inspection.internalSymlinks.push(symlink);
    }
  }

  return inspection;
}

function formatSymlinkList(symlinks, appBundlePath) {
  return symlinks
    .slice(0, 12)
    .map((symlink) => {
      const relativeLink = path.relative(appBundlePath, symlink.linkPath);
      const target = symlink.targetRealPath ?? symlink.resolvedTarget;
      return `  ${relativeLink} -> ${target}`;
    })
    .join("\n");
}

function assertNoExternalOrBrokenSymlinks(inspection) {
  const failures = [];

  if (inspection.externalSymlinks.length > 0) {
    failures.push(
      `${inspection.externalSymlinks.length} external symlink(s):\n${formatSymlinkList(
        inspection.externalSymlinks,
        inspection.appBundlePath
      )}`
    );
  }

  if (inspection.brokenSymlinks.length > 0) {
    failures.push(
      `${inspection.brokenSymlinks.length} broken symlink(s):\n${formatSymlinkList(
        inspection.brokenSymlinks,
        inspection.appBundlePath
      )}`
    );
  }

  if (failures.length > 0) {
    throw new Error(`${inspection.appBundlePath} is not self-contained:\n${failures.join("\n")}`);
  }
}

async function copyResolvedTarget(targetPath, destinationPath) {
  const targetStats = await stat(targetPath);
  await rm(destinationPath, { force: true, recursive: true });

  if (targetStats.isDirectory()) {
    await cp(targetPath, destinationPath, {
      dereference: true,
      preserveTimestamps: true,
      recursive: true
    });
  } else {
    await cp(targetPath, destinationPath, {
      dereference: true,
      preserveTimestamps: true
    });
  }

  await chmod(destinationPath, targetStats.mode & 0o777).catch(() => {});
}

export async function materializeMacosAppSymlinks(appBundlePath) {
  let materializedSymlinks = 0;

  for (let pass = 0; pass < 20; pass += 1) {
    const inspection = await inspectMacosAppSymlinks(appBundlePath);

    if (inspection.brokenSymlinks.length > 0) {
      assertNoExternalOrBrokenSymlinks(inspection);
    }

    if (inspection.externalSymlinks.length === 0) {
      return {
        appBundlePath,
        materializedSymlinks,
        internalSymlinks: inspection.internalSymlinks.length
      };
    }

    for (const symlink of inspection.externalSymlinks) {
      await copyResolvedTarget(symlink.targetRealPath, symlink.linkPath);
      materializedSymlinks += 1;
    }
  }

  throw new Error(`Unable to materialize all external symlinks in ${appBundlePath} after 20 passes.`);
}

export async function inspectOrMaterializeMacosApps(rootPaths, { check = false } = {}) {
  const summaries = [];

  for (const rootPath of rootPaths) {
    if (!(await pathExists(rootPath))) {
      throw new Error(`Path does not exist: ${rootPath}`);
    }

    const appBundles = await findMacosAppBundles(rootPath);

    if (appBundles.length === 0) {
      throw new Error(`No macOS app bundles found under ${rootPath}.`);
    }

    for (const appBundle of appBundles) {
      if (check) {
        const inspection = await inspectMacosAppSymlinks(appBundle);
        assertNoExternalOrBrokenSymlinks(inspection);
        summaries.push({
          appBundlePath: appBundle,
          materializedSymlinks: 0,
          internalSymlinks: inspection.internalSymlinks.length
        });
      } else {
        summaries.push(await materializeMacosAppSymlinks(appBundle));
      }
    }
  }

  return summaries;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const summaries = await inspectOrMaterializeMacosApps(options.roots, { check: options.check });

  for (const summary of summaries) {
    const action = options.check ? "Checked" : "Materialized";
    console.log(
      `${action} ${summary.appBundlePath}: ${summary.materializedSymlinks} external symlink(s), ${summary.internalSymlinks} internal symlink(s)`
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
