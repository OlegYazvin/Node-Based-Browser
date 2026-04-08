#!/usr/bin/env node

import process from "node:process";

import { currentArch, currentPlatform, normalizeArch, normalizePlatform, syncInstallers } from "./installers-lib.mjs";

function usage() {
  console.log(`Usage: node scripts/sync-installers.mjs [options]

Options:
  --platform <platform>      linux | win32 | darwin
  --arch <arch>              x64 | arm64
  --built-by <source>        local | github-actions (default: local)
  --build-workflow <path>    Optional workflow path or label for promoted builds
  --build-run-url <url>      Optional workflow run URL for promoted builds
  --help                     Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    platform: currentPlatform(),
    arch: currentArch(),
    builtBy: "local",
    buildWorkflow: null,
    buildRunUrl: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--platform":
        options.platform = normalizePlatform(argv[++index]);
        break;
      case "--arch":
        options.arch = normalizeArch(argv[++index]);
        break;
      case "--built-by":
        options.builtBy = argv[++index];
        break;
      case "--build-workflow":
        options.buildWorkflow = argv[++index];
        break;
      case "--build-run-url":
        options.buildRunUrl = argv[++index];
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

try {
  const manifest = await syncInstallers(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
