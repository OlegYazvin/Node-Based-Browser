#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";

function usage() {
  console.log(`Usage: node scripts/summarize-ci-log.mjs --log <path> --mode <bootstrap|build|package|installer>`);
}

function parseArguments(argv) {
  const options = {
    logPath: "",
    mode: "build"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--log":
        options.logPath = argv[++index] ?? "";
        break;
      case "--mode":
        options.mode = argv[++index] ?? options.mode;
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.logPath) {
    throw new Error("Missing required --log argument.");
  }

  return options;
}

function escapeAnnotation(text) {
  return text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function modeConfig(mode) {
  if (mode === "bootstrap") {
    return {
      patterns: ["fatal:", "error:", "denied", "unable to", "failed", "Traceback"],
      before: 8,
      after: 16,
      fallback: 60
    };
  }

  if (mode === "package") {
    return {
      patterns: [
        "error:",
        "Error:",
        "FATAL",
        "FAILED",
        "Exception",
        "Traceback",
        "No rule to make target",
        "makensis",
        "nsis",
        "7z"
      ],
      before: 10,
      after: 24,
      fallback: 100
    };
  }

  if (mode === "installer") {
    return {
      patterns: [
        "\\[installers\\] skipped",
        "Missing expected",
        "error:",
        "Error:",
        "FAILED",
        "Exception",
        "Traceback",
        "flatpak",
        "rpmbuild",
        "desktop-file-validate"
      ],
      before: 10,
      after: 28,
      fallback: 120
    };
  }

  return {
    patterns: [
      "error:",
      "ERROR",
      "not all --enable",
      "configure:",
      "Traceback",
      "Exception",
      "fatal:",
      "No rule to make target",
      "not found",
      "failed with exit code"
    ],
    before: 10,
    after: 20,
    fallback: 80
  };
}

function summarizeLog(text, config) {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim());

  for (const pattern of config.patterns) {
    const expression = new RegExp(pattern, "iu");

    for (let index = 0; index < lines.length; index += 1) {
      if (expression.test(lines[index])) {
        return lines.slice(Math.max(0, index - config.before), Math.min(lines.length, index + config.after)).join("\n");
      }
    }
  }

  return lines.slice(-config.fallback).join("\n");
}

try {
  const options = parseArguments(process.argv.slice(2));
  const config = modeConfig(options.mode);
  const text = readFileSync(options.logPath, "utf8");
  process.stdout.write(escapeAnnotation(summarizeLog(text, config)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
