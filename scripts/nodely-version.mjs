import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const packageJsonPath = path.join(repositoryRoot, "package.json");

let cachedVersionMetadata = null;

export function formatNodelyDisplayVersion(packageVersion) {
  const normalizedVersion = String(packageVersion ?? "").trim();
  const shortSemverMatch = normalizedVersion.match(/^(\d+)\.(\d+)\.0$/u);

  if (shortSemverMatch) {
    return `${shortSemverMatch[1]}.${shortSemverMatch[2]}`;
  }

  return normalizedVersion;
}

export function readNodelyVersionMetadata() {
  if (cachedVersionMetadata) {
    return cachedVersionMetadata;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const packageVersion = String(packageJson.version ?? "").trim();

  if (!packageVersion) {
    throw new Error(`package.json at ${packageJsonPath} is missing a version.`);
  }

  cachedVersionMetadata = {
    packageVersion,
    displayVersion: formatNodelyDisplayVersion(packageVersion)
  };

  return cachedVersionMetadata;
}

export function formatNodelyVersionString(nodelyVersion, geckoVersion = "") {
  const normalizedNodelyVersion = String(nodelyVersion ?? "").trim();
  const normalizedGeckoVersion = String(geckoVersion ?? "").trim();

  if (!normalizedNodelyVersion) {
    throw new Error("A Nodely version is required to format the version string.");
  }

  if (!normalizedGeckoVersion) {
    return `Nodely ${normalizedNodelyVersion}`;
  }

  return `Nodely ${normalizedNodelyVersion} (Gecko ${normalizedGeckoVersion})`;
}
