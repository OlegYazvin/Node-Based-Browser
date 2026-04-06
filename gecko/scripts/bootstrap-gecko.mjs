#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");

function usage() {
  console.log(`Usage: node gecko/scripts/bootstrap-gecko.mjs [options]

Options:
  --checkout-dir <path>  Target Gecko source checkout directory
  --ref <ref>            Gecko source branch or ref to clone/update
  --remote <url>         Gecko source remote URL
  --no-sync              Skip the overlay sync step
  --no-patches           Skip the Gecko patch queue step
  --help                 Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    checkoutDir: path.resolve(repositoryRoot, "..", "Nodely-Gecko", "firefox-esr"),
    ref: "esr140",
    remote: "https://github.com/mozilla-firefox/firefox.git",
    sync: true,
    patches: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
        break;
      case "--ref":
        options.ref = argv[++index];
        break;
      case "--remote":
        options.remote = argv[++index];
        break;
      case "--no-sync":
        options.sync = false;
        break;
      case "--no-patches":
        options.patches = false;
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
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.`);
  }
}

function pathExists(targetPath) {
  return existsSync(targetPath);
}

function isGitCheckout(targetPath) {
  return spawnSync("git", ["-C", targetPath, "rev-parse", "--is-inside-work-tree"]).status === 0;
}

function candidateRefs(ref) {
  const candidates = [ref];

  if (ref.startsWith("mozilla-")) {
    candidates.push(ref.replace(/^mozilla-/, ""));
  } else if (/^esr\d+$/u.test(ref)) {
    candidates.push(`mozilla-${ref}`);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function resolveRemoteRef(remote, ref) {
  for (const candidate of candidateRefs(ref)) {
    const remoteCheck = spawnSync("git", ["ls-remote", "--heads", remote, candidate], {
      cwd: repositoryRoot,
      encoding: "utf8"
    });

    if (remoteCheck.status === 0 && remoteCheck.stdout.trim()) {
      return candidate;
    }
  }

  return ref;
}

function prepareGitEnvironment() {
  if (process.platform !== "win32") {
    return;
  }

  spawnSync("git", ["config", "--global", "core.longpaths", "true"], {
    cwd: repositoryRoot,
    stdio: "ignore"
  });
  spawnSync("git", ["config", "--global", "core.autocrlf", "false"], {
    cwd: repositoryRoot,
    stdio: "ignore"
  });
  spawnSync("git", ["config", "--global", "core.eol", "lf"], {
    cwd: repositoryRoot,
    stdio: "ignore"
  });
}

function cloneArguments(resolvedRef, remote, checkoutDir) {
  return [
    "clone",
    "--filter=blob:none",
    "--depth",
    "1",
    "--single-branch",
    "--no-tags",
    "--branch",
    resolvedRef,
    remote,
    checkoutDir
  ];
}

function fetchArguments(resolvedRef) {
  return ["fetch", "origin", resolvedRef, "--filter=blob:none", "--depth", "1", "--no-tags"];
}

function bootstrapCheckout({ checkoutDir, ref, remote, sync, patches }) {
  prepareGitEnvironment();
  const resolvedRef = resolveRemoteRef(remote, ref);

  if (!pathExists(checkoutDir)) {
    run("git", cloneArguments(resolvedRef, remote, checkoutDir));
  } else if (isGitCheckout(checkoutDir)) {
    run("git", ["-C", checkoutDir, ...fetchArguments(resolvedRef)]);
    run("git", ["-C", checkoutDir, "checkout", resolvedRef]);
    run("git", ["-C", checkoutDir, "pull", "--ff-only", "origin", resolvedRef]);
  } else {
    throw new Error(`Target path exists but is not a git checkout: ${checkoutDir}`);
  }

  if (sync) {
    run(process.execPath, [path.join(geckoRoot, "scripts", "sync-overlay.mjs"), "--checkout-dir", checkoutDir]);
  }

  if (patches) {
    run(process.execPath, [
      path.join(geckoRoot, "scripts", "apply-patches.mjs"),
      "--checkout-dir",
      checkoutDir,
      "--platform",
      process.platform,
      "--arch",
      process.arch
    ]);
  }
}

try {
  bootstrapCheckout(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
