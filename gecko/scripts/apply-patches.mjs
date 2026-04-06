#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");
const patchesDirectory = path.join(geckoRoot, "patches");
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
const patchTargetRequirements = {
  "0001-linux-aarch64-automation-page-size.patch": {
    platforms: new Set(["linux"]),
    arches: new Set(["arm64"])
  }
};

function usage() {
  console.log(`Usage: node gecko/scripts/apply-patches.mjs [options]

Options:
  --checkout-dir <path>  Target Gecko source checkout directory
  --platform <platform>  Target platform override
  --arch <arch>          Target architecture override
  --help                 Show this help text
`);
}

function normalizePlatform(platform) {
  return platformAliases[platform] ?? platform;
}

function normalizeArch(arch) {
  return archAliases[arch] ?? arch;
}

function parseArguments(argv) {
  const options = {
    checkoutDir: path.resolve(repositoryRoot, "..", "Nodely-Gecko", "firefox-esr"),
    platform: normalizePlatform(process.platform),
    arch: normalizeArch(process.arch)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
        break;
      case "--platform":
        options.platform = normalizePlatform(argv[++index]);
        break;
      case "--arch":
        options.arch = normalizeArch(argv[++index]);
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

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    stdio: options.stdio ?? "inherit",
    encoding: options.encoding ?? "utf8"
  });
}

function ensureCheckout(checkoutDir) {
  if (!existsSync(checkoutDir) || !statSync(checkoutDir).isDirectory()) {
    throw new Error(`Gecko source checkout directory not found: ${checkoutDir}`);
  }

  const gitCheck = run("git", ["-C", checkoutDir, "rev-parse", "--is-inside-work-tree"], {
    stdio: "ignore"
  });

  if (gitCheck.status !== 0) {
    throw new Error(`Gecko source checkout is not a git repository: ${checkoutDir}`);
  }
}

export function patchAppliesToTarget(patchPath, { platform, arch }) {
  const requirements = patchTargetRequirements[path.basename(patchPath)];

  if (!requirements) {
    return true;
  }

  if (requirements.platforms && !requirements.platforms.has(normalizePlatform(platform))) {
    return false;
  }

  if (requirements.arches && !requirements.arches.has(normalizeArch(arch))) {
    return false;
  }

  return true;
}

export function patchFiles({ platform, arch } = {}) {
  if (!existsSync(patchesDirectory)) {
    return [];
  }

  return readdirSync(patchesDirectory)
    .filter((entry) => entry.endsWith(".patch"))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => path.join(patchesDirectory, entry))
    .filter((patchPath) =>
      patchAppliesToTarget(patchPath, {
        platform: platform ?? process.platform,
        arch: arch ?? process.arch
      })
    );
}

function applyPatch(checkoutDir, patchPath) {
  const reverseCheck = run("git", ["-C", checkoutDir, "apply", "--reverse", "--check", patchPath], {
    stdio: "ignore"
  });

  if (reverseCheck.status === 0) {
    console.log(`patch already applied: ${path.basename(patchPath)}`);
    return;
  }

  const applyResult = run(
    "git",
    ["-C", checkoutDir, "apply", "--3way", "--whitespace=nowarn", patchPath],
    { stdio: "inherit" }
  );

  if (applyResult.status !== 0) {
    throw new Error(`Failed to apply patch: ${patchPath}`);
  }

  console.log(`applied patch: ${path.basename(patchPath)}`);
}

export function applyPatchQueue({ checkoutDir, platform, arch }) {
  ensureCheckout(checkoutDir);

  const patches = patchFiles({ platform, arch });

  if (!patches.length) {
    console.log("No Gecko patches to apply.");
    return;
  }

  for (const patchPath of patches) {
    applyPatch(checkoutDir, patchPath);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    applyPatchQueue(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
