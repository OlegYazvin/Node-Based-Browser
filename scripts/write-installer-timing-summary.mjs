#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

function usage() {
  console.log(`Usage: node scripts/write-installer-timing-summary.mjs [options]

Options:
  --summary-path <path>  GitHub step summary path
  --job-label <label>    Human-readable job label
  --job-start <epoch>    Job start time in Unix seconds
  --job-end <epoch>      Job end time in Unix seconds (defaults to now)
  --focus-label <label>  Optional focused phase label
  --focus-start <epoch>  Optional focused phase start in Unix seconds
  --focus-end <epoch>    Optional focused phase end in Unix seconds
  --help                 Show this help text
`);
}

function parseEpochSeconds(value, label) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (hours > 0 || minutes > 0) {
    parts.push(`${minutes}m`);
  }

  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function renderInstallerTimingSummary({
  jobLabel,
  jobStart,
  jobEnd,
  focusLabel = "",
  focusStart = null,
  focusEnd = null
}) {
  const lines = [
    "## Installer Timing",
    "",
    `**Job:** ${jobLabel}`,
    "",
    "| Scope | Duration |",
    "| --- | --- |",
    `| Total job elapsed | ${formatDuration(jobEnd - jobStart)} |`
  ];

  if (focusLabel && focusStart != null) {
    const effectiveFocusEnd = focusEnd ?? jobEnd;
    const suffix = focusEnd == null ? " (through job end)" : "";
    lines.push(`| ${focusLabel}${suffix} | ${formatDuration(effectiveFocusEnd - focusStart)} |`);
  }

  return `${lines.join("\n")}\n`;
}

function parseArguments(argv) {
  const options = {
    summaryPath: process.env.GITHUB_STEP_SUMMARY ?? "",
    jobLabel: "",
    jobStart: null,
    jobEnd: null,
    focusLabel: "",
    focusStart: null,
    focusEnd: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--summary-path":
        options.summaryPath = argv[++index] ?? "";
        break;
      case "--job-label":
        options.jobLabel = argv[++index] ?? "";
        break;
      case "--job-start":
        options.jobStart = parseEpochSeconds(argv[++index], "job start time");
        break;
      case "--job-end":
        options.jobEnd = parseEpochSeconds(argv[++index], "job end time");
        break;
      case "--focus-label":
        options.focusLabel = argv[++index] ?? "";
        break;
      case "--focus-start":
        options.focusStart = parseEpochSeconds(argv[++index], "focus start time");
        break;
      case "--focus-end":
        options.focusEnd = parseEpochSeconds(argv[++index], "focus end time");
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!options.summaryPath) {
    throw new Error("Missing --summary-path (or GITHUB_STEP_SUMMARY).");
  }

  if (!options.jobLabel.trim()) {
    throw new Error("Missing --job-label.");
  }

  if (options.jobStart == null) {
    throw new Error("Missing --job-start.");
  }

  if (options.jobEnd == null) {
    options.jobEnd = Math.floor(Date.now() / 1000);
  }

  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const summary = renderInstallerTimingSummary(options);
    appendFileSync(options.summaryPath, summary);
    process.stdout.write(summary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
