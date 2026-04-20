#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_REMOTE = "https://github.com/mozilla-firefox/firefox.git";
const DEFAULT_SERIES = 140;

function usage() {
  console.log(`Usage: node gecko/scripts/resolve-supported-esr-release.mjs [options]

Options:
  --remote <url>    Git remote to inspect for Firefox ESR tags
  --series <major>  ESR major series to resolve (default: ${DEFAULT_SERIES})
  --help            Show this help text

Outputs shell-style KEY=VALUE lines suitable for appending to GITHUB_ENV.
`);
}

function parseArguments(argv) {
  const options = {
    remote: DEFAULT_REMOTE,
    series: DEFAULT_SERIES
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--remote":
        options.remote = argv[++index] ?? options.remote;
        break;
      case "--series":
        options.series = Number.parseInt(argv[++index] ?? "", 10);
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(options.series) || options.series <= 0) {
    throw new Error(`Invalid --series value: ${options.series}`);
  }

  return options;
}

export function parseRemoteTagLine(line) {
  const match = line.match(
    /^[0-9a-f]+\s+refs\/tags\/(FIREFOX_(\d+)_(\d+)_(\d+)esr_(RELEASE|BUILD(\d+)))$/u
  );

  if (!match) {
    return null;
  }

  const [, ref, majorText, minorText, patchText, tagKind, buildNumberText] = match;
  const major = Number.parseInt(majorText, 10);
  const minor = Number.parseInt(minorText, 10);
  const patch = Number.parseInt(patchText, 10);
  const buildNumber = tagKind === "RELEASE" ? Number.MAX_SAFE_INTEGER : Number.parseInt(buildNumberText, 10);

  return {
    ref,
    version: `${major}.${minor}.${patch}esr`,
    major,
    minor,
    patch,
    priority: buildNumber
  };
}

export function compareReleaseCandidates(left, right) {
  if (left.major !== right.major) {
    return right.major - left.major;
  }

  if (left.minor !== right.minor) {
    return right.minor - left.minor;
  }

  if (left.patch !== right.patch) {
    return right.patch - left.patch;
  }

  return right.priority - left.priority;
}

export function resolveBestTaggedCandidates(lines, series = DEFAULT_SERIES) {
  return lines
    .map(parseRemoteTagLine)
    .filter((candidate) => candidate && candidate.major === series)
    .sort(compareReleaseCandidates);
}

export function archiveUrlForVersion(version) {
  return `https://archive.mozilla.org/pub/firefox/releases/${version}/linux-x86_64/en-US/firefox-${version}.tar.xz`;
}

export async function pickPublishedRelease(candidates, archiveExists) {
  const seenVersions = new Set();

  for (const candidate of candidates) {
    if (seenVersions.has(candidate.version)) {
      continue;
    }

    seenVersions.add(candidate.version);

    if (await archiveExists(candidate.version)) {
      return candidate;
    }
  }

  throw new Error("Unable to find a published Firefox ESR release tag with a matching archive payload.");
}

async function archiveExists(version) {
  const response = await fetch(archiveUrlForVersion(version), {
    method: "HEAD",
    redirect: "follow"
  });
  return response.ok;
}

function listRemoteTags(remote) {
  return execFileSync("git", ["ls-remote", "--tags", remote], {
    encoding: "utf8"
  })
    .split(/\r?\n/u)
    .filter(Boolean);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const candidates = resolveBestTaggedCandidates(listRemoteTags(options.remote), options.series);

  if (!candidates.length) {
    throw new Error(`No Firefox ESR tags were found for series ${options.series} on ${options.remote}.`);
  }

  const release = await pickPublishedRelease(candidates, archiveExists);

  process.stdout.write(`FIREFOX_ESR_VERSION=${release.version}\n`);
  process.stdout.write(`FIREFOX_ESR_REF=${release.ref}\n`);
  process.stdout.write(`FIREFOX_ESR_RUNTIME_URL=${archiveUrlForVersion(release.version)}\n`);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
