#!/usr/bin/env node

import { spawnSync } from "node:child_process";
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
    ref: "mozilla-esr140",
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
  return spawnSync("bash", ["-lc", `[ -e "${targetPath.replaceAll("\"", "\\\"")}" ]`]).status === 0;
}

function isGitCheckout(targetPath) {
  return spawnSync("git", ["-C", targetPath, "rev-parse", "--is-inside-work-tree"]).status === 0;
}

function bootstrapCheckout({ checkoutDir, ref, remote, sync, patches }) {
  if (!pathExists(checkoutDir)) {
    run("git", ["clone", "--depth", "1", "--branch", ref, remote, checkoutDir]);
  } else if (isGitCheckout(checkoutDir)) {
    run("git", ["-C", checkoutDir, "fetch", "origin", ref, "--depth", "1"]);
    run("git", ["-C", checkoutDir, "checkout", ref]);
    run("git", ["-C", checkoutDir, "pull", "--ff-only", "origin", ref]);
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
      checkoutDir
    ]);
  }
}

try {
  bootstrapCheckout(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
