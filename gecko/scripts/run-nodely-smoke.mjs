#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  applyNodeNavigation,
  createChildNode,
  createEmptyWorkspace,
  createRootNode,
  relayoutWorkspace,
  resolveOmniboxInput
} from "../overlay/browser/base/content/nodely/domain.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");
const refreshBrandingScriptPath = path.join(geckoRoot, "scripts", "refresh-artifact-branding.mjs");

function usage() {
  console.log(`Usage: node gecko/scripts/run-nodely-smoke.mjs [options]

Options:
  --checkout-dir <path>  Gecko source checkout directory
  --binary <path>        Nodely browser binary path
  --profile-dir <path>   Existing profile directory to reuse
  --scenario <name>      Optional smoke scenario to run after bootstrap
  --headed               Run with a visible browser window instead of -headless
  --timeout-ms <ms>      Timeout while waiting for smoke snapshot (default: 30000)
  --keep-profile         Keep the temporary profile after the run
  --help                 Show this help text
`);
}

function parseArguments(argv) {
  const defaultCheckoutDir = path.resolve(repositoryRoot, "..", "Nodely-Gecko", "firefox-esr");
  const options = {
    checkoutDir: defaultCheckoutDir,
    binary: null,
    profileDir: null,
    scenario: "",
    headed: false,
    timeoutMs: 30_000,
    keepProfile: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--checkout-dir":
      case "--firefox-dir":
        options.checkoutDir = path.resolve(argv[++index]);
        break;
      case "--binary":
        options.binary = path.resolve(argv[++index]);
        break;
      case "--profile-dir":
        options.profileDir = path.resolve(argv[++index]);
        break;
      case "--scenario":
        options.scenario = String(argv[++index] ?? "").trim();
        break;
      case "--headed":
        options.headed = true;
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(argv[++index] ?? options.timeoutMs);
        break;
      case "--keep-profile":
        options.keepProfile = true;
        break;
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!options.binary) {
    const nodelyBinary = path.join(options.checkoutDir, "obj-nodely", "dist", "bin", "nodely");
    const legacyBinary = path.join(options.checkoutDir, "obj-nodely", "dist", "bin", "firefox");
    options.binary = existsSync(nodelyBinary) ? nodelyBinary : legacyBinary;
  }

  return options;
}

function escapeUserPrefValue(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", '\\"');
}

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function refreshArtifactBranding(checkoutDir) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [refreshBrandingScriptPath, "--checkout-dir", checkoutDir], {
      cwd: repositoryRoot,
      stdio: "ignore"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Failed to refresh artifact branding for ${checkoutDir}`));
    });
    child.on("error", reject);
  });
}

function buildSeedWorkspace() {
  let workspace = createEmptyWorkspace("default", "Nodely Smoke Workspace");
  workspace = createRootNode(workspace);
  const rootId = workspace.selectedNodeId;
  workspace = applyNodeNavigation(
    workspace,
    rootId,
    resolveOmniboxInput("https://example.com/", workspace.prefs.searchProvider)
  );
  workspace = createChildNode(workspace, rootId, "manual");
  const childId = workspace.selectedNodeId;
  workspace = applyNodeNavigation(
    workspace,
    childId,
    resolveOmniboxInput("https://example.org/", workspace.prefs.searchProvider)
  );
  workspace = relayoutWorkspace(workspace);
  return workspace;
}

async function writeSmokeProfile({ profileDir, namespace, smokeFile, scenario }) {
  const workspaceDirectory = path.join(profileDir, namespace);
  const workspacePath = path.join(workspaceDirectory, "default.json");
  const workspace = buildSeedWorkspace();

  await mkdir(workspaceDirectory, { recursive: true });
  await writeFile(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`, "utf8");

  const userJs = [
    'user_pref("browser.startup.page", 0);',
    'user_pref("browser.startup.homepage", "about:blank");',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("browser.newtabpage.enabled", false);',
    'user_pref("nodely.shell.enabled", true);',
    'user_pref("nodely.testing.enabled", true);',
    `user_pref("nodely.testing.workspace_namespace", "${escapeUserPrefValue(namespace)}");`,
    `user_pref("nodely.testing.smoke_file", "${escapeUserPrefValue(smokeFile)}");`,
    `user_pref("nodely.testing.smoke_scenario", "${escapeUserPrefValue(scenario ?? "")}");`
  ].join("\n");

  await writeFile(path.join(profileDir, "user.js"), `${userJs}\n`, "utf8");
}

function snapshotLooksReady(snapshot) {
  const expectedTop =
    (snapshot.layout?.topbar?.height ?? 0) +
    (snapshot.layout?.composer?.height ?? 0) +
    (snapshot.layout?.pagebar?.height ?? 0);
  const pageContainer = snapshot.layout?.tabpanels ?? snapshot.layout?.appcontent ?? null;
  const expectedSplitLeft =
    snapshot.view === "split" && snapshot.browserSurface === "page"
      ? snapshot.layout?.graph?.width ?? 0
      : 0;
  const layoutLooksStable =
    Math.abs((snapshot.layout?.browser?.top ?? 0) - expectedTop) <= 4 &&
    Math.abs((snapshot.layout?.tabbox?.left ?? 0) - expectedSplitLeft) <= 4 &&
    pageContainer != null &&
    Math.abs((pageContainer.left ?? 0) - (snapshot.layout?.tabbox?.left ?? 0)) <= 4 &&
    Math.abs((pageContainer.top ?? 0) - (snapshot.layout?.tabbox?.top ?? 0)) <= 4;
  const minimapLooksReady =
    snapshot.ui?.minimap?.visible === true &&
    snapshot.ui?.minimap?.svgPresent === true &&
    (snapshot.ui?.minimap?.nodeShapeCount ?? 0) >= 4 &&
    (snapshot.ui?.minimap?.edgeCount ?? 0) >= 1 &&
    snapshot.ui?.minimap?.viewportPresent === true &&
    (snapshot.ui?.minimap?.toolbarButtonCount ?? 0) >= 3;

  return (
    snapshot.bootstrapState === "ready" &&
    snapshot.active === "true" &&
    (snapshot.workspace?.nodeCount ?? 0) >= 2 &&
    (snapshot.workspace?.edgeCount ?? 0) >= 1 &&
    (snapshot.selectedTree?.nodeCount ?? 0) >= 2 &&
    snapshot.ui?.surfaceCloseLabel === "Canvas" &&
    minimapLooksReady &&
    layoutLooksStable
  );
}

function snapshotMatchesScenario(snapshot, scenario) {
  if (!scenario) {
    return snapshot.workspace?.selectedNode?.url === "https://example.org/";
  }

  if (scenario === "graph-select-root") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.selectedNode?.parentId === null &&
      snapshot.workspace?.selectedNode?.url === "https://example.com/"
    );
  }

  if (scenario === "pagebar-new-child") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.nodeCount === 3 &&
      snapshot.workspace?.edgeCount === 2 &&
      snapshot.workspace?.selectedNode?.parentId != null &&
      snapshot.workspace?.selectedNode?.kind === "page"
    );
  }

  return snapshot.reason === `scenario:${scenario}:complete`;
}

async function waitForSnapshot(smokeFile, timeoutMs, scenario = "") {
  const startedAt = Date.now();
  let lastParseError = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (await exists(smokeFile)) {
      try {
        const snapshot = JSON.parse(await readFile(smokeFile, "utf8"));
        const looksReady =
          snapshotLooksReady(snapshot) &&
          snapshotMatchesScenario(snapshot, scenario);

        if (scenario && snapshot.reason === `scenario:${scenario}:error`) {
          throw new Error(`Smoke scenario failed inside Nodely: ${scenario}`);
        }

        if (scenario && snapshot.reason === `scenario:${scenario}:unknown`) {
          throw new Error(`Unknown smoke scenario requested: ${scenario}`);
        }

        if (looksReady) {
          return snapshot;
        }

        lastParseError = new Error(`Snapshot not ready yet: ${JSON.stringify(snapshot)}`);
      } catch (error) {
        lastParseError = error;
      }
    }

    await delay(250);
  }

  throw lastParseError ?? new Error(`Timed out waiting for smoke snapshot: ${smokeFile}`);
}

async function terminateProcess(child) {
  if (child.exitCode != null) {
    return child.exitCode;
  }

  child.kill("SIGTERM");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode != null) {
      return child.exitCode;
    }

    await delay(250);
  }

  child.kill("SIGKILL");
  return child.exitCode;
}

async function runSmoke(options) {
  await refreshArtifactBranding(options.checkoutDir);

  if (!(await exists(options.binary))) {
    throw new Error(`Nodely browser binary not found: ${options.binary}`);
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "nodely-gecko-smoke-"));
  const profileDir = options.profileDir ?? path.join(temporaryRoot, "profile");
  const smokeFile = path.join(temporaryRoot, "nodely-smoke.json");
  const namespace = `nodely-smoke-${Date.now()}`;

  await mkdir(profileDir, { recursive: true });
  await writeSmokeProfile({ profileDir, namespace, smokeFile, scenario: options.scenario });

  const stdoutChunks = [];
  const stderrChunks = [];
  const launchArgs = [
    ...(options.headed ? [] : ["-headless"]),
    "-new-instance",
    "-no-remote",
    "-profile",
    profileDir
  ];
  const child = spawn(options.binary, launchArgs, {
    env: {
      ...process.env,
      MOZ_APP_REMOTINGNAME: "nodely",
      ...(options.headed ? {} : { MOZ_HEADLESS: "1" })
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", (chunk) => {
    stdoutChunks.push(chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  try {
    const snapshot = await waitForSnapshot(smokeFile, options.timeoutMs, options.scenario);
    console.log(JSON.stringify(snapshot, null, 2));
  } catch (error) {
    const output = `${stdoutChunks.join("")}\n${stderrChunks.join("")}`.trim();
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nBrowser output:\n${output || "(no output)"}`
    );
  } finally {
    await terminateProcess(child);

    if (!options.keepProfile && !options.profileDir) {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

try {
  await runSmoke(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
