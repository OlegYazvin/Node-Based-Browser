#!/usr/bin/env node

import process from "node:process";

import { pruneInstallers } from "./installers-lib.mjs";

function usage() {
  console.log(`Usage: node scripts/prune-installers.mjs --target <platform:arch> [--target <platform:arch> ...]

Options:
  --target <target>      Installer slice to remove, in <platform>:<arch> form
  --help                 Show this help text
`);
}

function parseArguments(argv) {
  const options = {
    targets: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--target":
        options.targets.push(argv[++index]);
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.targets.length) {
    throw new Error("At least one --target <platform:arch> value is required.");
  }

  return options;
}

try {
  const manifest = await pruneInstallers(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
