#!/usr/bin/env node

import { createServer } from "node:http";
import { spawn } from "node:child_process";
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
  resolveOmniboxInput,
  setSurfaceMode,
  setViewMode
} from "../overlay/browser/base/content/nodely/domain.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const geckoRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(geckoRoot, "..");
const refreshBrandingScriptPath = path.join(geckoRoot, "scripts", "refresh-artifact-branding.mjs");
const ROOT_SMOKE_URL =
  "data:text/html,%3Ctitle%3ENodely%20Smoke%20Root%3C%2Ftitle%3E%3Ch1%3ERoot%3C%2Fh1%3E";
const CHILD_SMOKE_URL =
  "data:text/html,%3Ctitle%3ENodely%20Smoke%20Child%3C%2Ftitle%3E%3Ch1%3EChild%3C%2Fh1%3E";

function usage() {
  console.log(`Usage: node gecko/scripts/run-nodely-smoke.mjs [options]

Options:
  --checkout-dir <path>  Gecko source checkout directory
  --binary <path>        Nodely browser binary path
  --profile-dir <path>   Existing profile directory to reuse
  --scenario <name>      Optional smoke scenario to run after bootstrap
  --manual-webrtc-confirm  Leave the WebRTC allow prompt for an external/manual click
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
    manualWebRTCConfirm: false,
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
      case "--manual-webrtc-confirm":
        options.manualWebRTCConfirm = true;
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
    options.binary = path.join(options.checkoutDir, "obj-nodely", "dist", "nodely", "nodely");
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

function buildSeedWorkspace({ viewMode = "split", surfaceMode = "page" } = {}) {
  let workspace = createEmptyWorkspace("default", "Nodely Smoke Workspace");
  workspace = createRootNode(workspace);
  const rootId = workspace.selectedNodeId;
  workspace = applyNodeNavigation(
    workspace,
    rootId,
    resolveOmniboxInput(ROOT_SMOKE_URL, workspace.prefs.searchProvider)
  );
  workspace = createChildNode(workspace, rootId, "manual");
  const childId = workspace.selectedNodeId;
  workspace = applyNodeNavigation(
    workspace,
    childId,
    resolveOmniboxInput(CHILD_SMOKE_URL, workspace.prefs.searchProvider)
  );
  workspace = relayoutWorkspace(workspace);
  workspace = setViewMode(workspace, viewMode);
  workspace = setSurfaceMode(workspace, surfaceMode);
  return workspace;
}

async function writeSmokeProfile({
  profileDir,
  namespace,
  smokeFile,
  scenario,
  smokeTargetUrl = "",
  manualWebRTCConfirm = false,
  extraPrefs = []
}) {
  const workspaceDirectory = path.join(profileDir, namespace);
  const workspacePath = path.join(workspaceDirectory, "default.json");
  const workspace = buildSeedWorkspace(seedWorkspaceOptionsForScenario(scenario));

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
    `user_pref("nodely.testing.smoke_scenario", "${escapeUserPrefValue(scenario ?? "")}");`,
    `user_pref("nodely.testing.smoke_target_url", "${escapeUserPrefValue(smokeTargetUrl)}");`,
    `user_pref("nodely.testing.smoke_manual_webrtc_confirm", ${manualWebRTCConfirm ? "true" : "false"});`,
    ...extraPrefs
  ].join("\n");

  await writeFile(path.join(profileDir, "user.js"), `${userJs}\n`, "utf8");
}

function seedWorkspaceOptionsForScenario(scenario = "") {
  if (
    scenario === "focus-close-and-select-root" ||
    scenario === "focus-escape-and-select-root"
  ) {
    return {
      viewMode: "focus",
      surfaceMode: "page"
    };
  }

  return {
    viewMode: "split",
    surfaceMode: "page"
  };
}

async function createLocalFixtureServer({ html }) {
  const server = createServer((request, response) => {
    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(html);
  });

  const address = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address());
    });
  });

  if (!address || typeof address !== "object") {
    server.close();
    throw new Error("Failed to start local smoke fixture server.");
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function createSmokeScenarioFixtures({ temporaryRoot, scenario }) {
  if (scenario !== "webrtc-microphone-prompt") {
    return {
      smokeTargetUrl: "",
      extraPrefs: [],
      close: async () => {}
    };
  }

  const fixtureHtml = `<!doctype html>
<meta charset="utf-8">
<title>Nodely Smoke Microphone</title>
<body>requesting microphone</body>
<script>
(async () => {
  try {
    window.__nodelyGumStarted = true;
    const devicesBefore = await navigator.mediaDevices.enumerateDevices();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devicesAfter = await navigator.mediaDevices.enumerateDevices();
    window.__nodelyGumResult = {
      ok: true,
      audioTrackCount: stream.getAudioTracks().length,
      beforeKinds: devicesBefore.map((device) => device.kind),
      afterKinds: devicesAfter.map((device) => device.kind),
      afterLabels: devicesAfter.map((device) => device.label)
    };
    document.title = "Nodely Smoke Microphone OK";
    document.body.textContent = "microphone-ok";
  } catch (error) {
    window.__nodelyGumResult = {
      ok: false,
      name: error?.name ?? String(error),
      message: error?.message ?? ""
    };
    document.title = "Nodely Smoke Microphone Error";
    document.body.textContent = error?.name ?? "microphone-error";
  }
})();
</script>
`;
  const fixtureServer = await createLocalFixtureServer({ html: fixtureHtml });

  return {
    smokeTargetUrl: fixtureServer.url,
    extraPrefs: [
      'user_pref("media.navigator.permission.disabled", false);',
      'user_pref("media.navigator.permission.fake", true);',
      'user_pref("media.navigator.streams.fake", true);'
    ],
    close: fixtureServer.close
  };
}

function snapshotLooksReady(snapshot, scenario = "") {
  const expectsSingleNodeTree = scenario === "graph-contextmenu-kill-root";
  const expectsSingleTabTree = scenario === "webrtc-microphone-prompt";
  const minimumNodeCount = expectsSingleNodeTree ? 1 : 2;
  const minimumEdgeCount = expectsSingleNodeTree ? 0 : 1;
  const minimumTreeNodeCount = expectsSingleNodeTree || expectsSingleTabTree ? 1 : 2;
  const minimumMinimapNodeShapes = expectsSingleNodeTree ? 3 : 4;
  const minimumMinimapEdges = expectsSingleNodeTree ? 0 : 1;
  const composerHeightForLayout =
    snapshot.ui?.composerPlacement === "contextual"
      ? 0
      : (snapshot.layout?.composer?.height ?? 0);
  const expectedTop =
    (snapshot.layout?.topbar?.height ?? 0) +
    composerHeightForLayout +
    (snapshot.layout?.pagebar?.height ?? 0);
  const expectedSharedSurfaceTop =
    (snapshot.layout?.topbar?.height ?? 0) + composerHeightForLayout;
  const pageContainer = snapshot.layout?.tabpanels ?? snapshot.layout?.appcontent ?? null;
  const expectedSplitLeft =
    snapshot.view === "split" && snapshot.browserSurface === "page"
      ? snapshot.layout?.graph?.width ?? 0
      : 0;
  const splitPagebarAligned =
    snapshot.view !== "split" ||
    snapshot.browserSurface !== "page" ||
    Math.abs((snapshot.layout?.pagebar?.left ?? 0) - expectedSplitLeft) <= 4;
  const splitCanvasTopAligned =
    snapshot.view !== "split" ||
    snapshot.browserSurface !== "page" ||
    Math.abs((snapshot.layout?.graph?.top ?? 0) - expectedSharedSurfaceTop) <= 4;
  const splitHandleTopAligned =
    snapshot.view !== "split" ||
    snapshot.browserSurface !== "page" ||
    Math.abs((snapshot.layout?.splitHandle?.top ?? 0) - expectedSharedSurfaceTop) <= 4;
  const layoutLooksStable =
    Math.abs((snapshot.layout?.browser?.top ?? 0) - expectedTop) <= 4 &&
    Math.abs((snapshot.layout?.tabbox?.left ?? 0) - expectedSplitLeft) <= 4 &&
    splitPagebarAligned &&
    splitCanvasTopAligned &&
    splitHandleTopAligned &&
    pageContainer != null &&
    Math.abs((pageContainer.left ?? 0) - (snapshot.layout?.tabbox?.left ?? 0)) <= 4 &&
    Math.abs((pageContainer.top ?? 0) - (snapshot.layout?.tabbox?.top ?? 0)) <= 4;
  const minimapLooksReady =
    snapshot.ui?.minimap?.visible === true &&
    snapshot.ui?.minimap?.svgPresent === true &&
    (snapshot.ui?.minimap?.nodeShapeCount ?? 0) >= minimumMinimapNodeShapes &&
    (snapshot.ui?.minimap?.edgeCount ?? 0) >= minimumMinimapEdges &&
    snapshot.ui?.minimap?.viewportPresent === true &&
    (snapshot.ui?.minimap?.toolbarButtonCount ?? 0) >= 4 &&
    snapshot.ui?.minimap?.organizePresent === true;
  const pageToolbarIconsReady =
    (snapshot.ui?.pageToolbar?.buttonCount ?? 0) === 0 ||
    (
      (snapshot.ui?.pageToolbar?.svgCount ?? 0) >= (snapshot.ui?.pageToolbar?.buttonCount ?? 0) &&
      (snapshot.ui?.pageToolbar?.pathCount ?? 0) >= (snapshot.ui?.pageToolbar?.buttonCount ?? 0)
    );
  const branchNextRemoved = snapshot.ui?.pageToolbar?.branchNextPresent === false;
  const topbarOrganizeMoved = snapshot.ui?.topbar?.organizePresent === false;
  const topbarFullscreenPresent = snapshot.ui?.topbar?.fullscreenPresent === true;
  const treeStripIconsReady =
    (snapshot.ui?.treeStrip?.tabFaviconCount ?? 0) >= minimumTreeNodeCount &&
    (snapshot.ui?.treeStrip?.tabCloseCount ?? 0) >= minimumTreeNodeCount &&
    (snapshot.ui?.treeStrip?.tabClosePathCount ?? 0) >= minimumTreeNodeCount &&
    snapshot.ui?.treeStrip?.tabsFitViewport === true &&
    snapshot.ui?.treeStrip?.newChildVisible === true &&
    (snapshot.ui?.treeStrip?.newChildSvgCount ?? 0) >= 1 &&
    (snapshot.ui?.treeStrip?.newChildPathCount ?? 0) >= 1 &&
    snapshot.ui?.treeStrip?.treeFavoritePresent === false;
  const canvasTreeLabelsReady =
    snapshot.ui?.canvasTreeLabels?.mode === "canvas" &&
    (snapshot.ui?.canvasTreeLabels?.count ?? 0) >= Math.max(1, snapshot.workspace?.rootCount ?? 0);
  const surfaceCloseMatchesView =
    snapshot.view === "focus"
      ? snapshot.ui?.surfaceClosePresent === true &&
        /canvas/iu.test(snapshot.ui?.surfaceCloseLabel ?? "") &&
        snapshot.ui?.surfaceCloseSvgPresent === true &&
        (snapshot.ui?.surfaceClosePathCount ?? 0) >= 1
      : snapshot.ui?.surfaceClosePresent === false;
  const graphPointerReady = graphSurfaceAcceptsPointerInput(snapshot);
  const splitHandlePointerReady = splitHandleAcceptsPointerInput(snapshot);

  return (
    snapshot.bootstrapState === "ready" &&
    snapshot.active === "true" &&
    (snapshot.workspace?.nodeCount ?? 0) >= minimumNodeCount &&
    (snapshot.workspace?.edgeCount ?? 0) >= minimumEdgeCount &&
    (snapshot.selectedTree?.nodeCount ?? 0) >= minimumTreeNodeCount &&
    surfaceCloseMatchesView &&
    minimapLooksReady &&
    pageToolbarIconsReady &&
    branchNextRemoved &&
    topbarOrganizeMoved &&
    topbarFullscreenPresent &&
    treeStripIconsReady &&
    canvasTreeLabelsReady &&
    graphPointerReady &&
    splitHandlePointerReady &&
    layoutLooksStable
  );
}

function graphSurfaceAcceptsPointerInput(snapshot) {
  const graphShouldBeInteractive =
    snapshot.emptyWorkspace !== "true" &&
    (snapshot.view === "split" || snapshot.browserSurface === "canvas");

  if (!graphShouldBeInteractive) {
    return true;
  }

  return snapshot.layout?.graph?.pointerEvents === "auto";
}

function splitHandleAcceptsPointerInput(snapshot) {
  const splitHandleShouldBeInteractive =
    snapshot.emptyWorkspace !== "true" &&
    snapshot.view === "split" &&
    snapshot.browserSurface === "page";

  if (!splitHandleShouldBeInteractive) {
    return true;
  }

  return snapshot.layout?.splitHandle?.pointerEvents === "auto";
}

function runtimeMatchesSelectedNode(snapshot) {
  const selectedNode = snapshot.workspace?.selectedNode ?? null;
  const selectedTabUrl = snapshot.runtime?.selectedTabUrl ?? null;

  if (!selectedNode) {
    return selectedTabUrl == null;
  }

  if (!selectedNode.url) {
    return selectedTabUrl == null || selectedTabUrl === "about:blank";
  }

  return selectedTabUrl === selectedNode.url;
}

function snapshotMatchesScenario(snapshot, scenario) {
  const selectedNodeId = snapshot.workspace?.selectedNode?.id ?? null;
  const runtimeMatchesSelection =
    selectedNodeId == null || snapshot.runtime?.selectedTabNodeId === selectedNodeId;
  const runtimeMatchesNode = runtimeMatchesSelectedNode(snapshot);

  if (!scenario) {
    return (
      snapshot.workspace?.selectedNode?.url === CHILD_SMOKE_URL &&
      snapshot.workspace?.selectedNode?.runtimeState === "live" &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (scenario === "graph-select-root") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.selectedNode?.parentId === null &&
      snapshot.workspace?.selectedNode?.url === ROOT_SMOKE_URL &&
      snapshot.workspace?.selectedNode?.runtimeState === "live" &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (
    scenario === "focus-close-and-select-root" ||
    scenario === "focus-escape-and-select-root"
  ) {
    return (
      snapshot.view === "focus" &&
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.selectedNode?.parentId === null &&
      snapshot.workspace?.selectedNode?.url === ROOT_SMOKE_URL &&
      snapshot.workspace?.selectedNode?.runtimeState === "live" &&
      /canvas/iu.test(snapshot.ui?.surfaceCloseLabel ?? "") &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (scenario === "pagebar-new-child") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.nodeCount === 3 &&
      snapshot.workspace?.edgeCount === 2 &&
      snapshot.workspace?.selectedNode?.parentId != null &&
      snapshot.workspace?.selectedNode?.kind === "page" &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (scenario === "pagebar-duplicate-tab") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.nodeCount === 3 &&
      snapshot.workspace?.edgeCount === 2 &&
      snapshot.workspace?.selectedNode?.parentId != null &&
      snapshot.workspace?.selectedNode?.url === CHILD_SMOKE_URL &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (scenario === "webrtc-microphone-prompt") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.ui?.webrtcPrompt?.navBarHidden === false &&
      snapshot.ui?.webrtcPrompt?.toolboxHidden === false &&
      snapshot.ui?.webrtcPrompt?.sharing === "microphone" &&
      snapshot.ui?.webrtcPrompt?.microphoneState != null &&
      runtimeMatchesSelection
    );
  }

  if (scenario === "native-urlbar-overlay") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.ui?.nativeUrlbar?.suppressed === true &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (scenario === "graph-contextmenu-root-composer") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.selectedNode?.url === CHILD_SMOKE_URL &&
      snapshot.ui?.rootComposerPresent === true &&
      snapshot.ui?.composerPlacement === "contextual" &&
      (snapshot.layout?.composer?.height ?? 0) > 0 &&
      (snapshot.layout?.composer?.width ?? 0) <= 420 &&
      (snapshot.layout?.composer?.left ?? 0) >= 12 &&
      (snapshot.layout?.composer?.top ?? 0) >
        ((snapshot.layout?.topbar?.height ?? 0) + 12) &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (scenario === "graph-contextmenu-kill-root") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.nodeCount === 1 &&
      snapshot.workspace?.rootCount === 1 &&
      snapshot.workspace?.selectedNode?.parentId === null &&
      snapshot.workspace?.selectedNode?.url === CHILD_SMOKE_URL &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (scenario === "toggle-fullscreen") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.workspace?.selectedNode?.url === CHILD_SMOKE_URL &&
      snapshot.ui?.windowFullscreen === true &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
    );
  }

  if (scenario === "topbar-drawers") {
    return (
      snapshot.browserSurface === "page" &&
      snapshot.drawer === "downloads" &&
      (snapshot.ui?.treesDrawer?.favoriteButtonCount ?? 0) ===
        (snapshot.ui?.treesDrawer?.rootRowCount ?? 0) &&
      (snapshot.layout?.activeDrawer?.left ?? 0) <=
        (snapshot.layout?.activeDrawerTrigger?.right ?? 0) + 14 &&
      (snapshot.layout?.activeDrawer?.right ?? 0) >=
        (snapshot.layout?.activeDrawerTrigger?.left ?? 0) - 14 &&
      Math.abs(
        (snapshot.layout?.activeDrawer?.top ?? 0) -
          ((snapshot.layout?.activeDrawerTrigger?.bottom ?? 0) + 8)
      ) <= 14 &&
      runtimeMatchesSelection &&
      runtimeMatchesNode
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
          snapshotLooksReady(snapshot, scenario) &&
          snapshotMatchesScenario(snapshot, scenario);

        if (scenario && snapshot.reason === `scenario:${scenario}:error`) {
          throw new Error(
            `Smoke scenario failed inside Nodely: ${scenario}\n\nLast snapshot:\n${JSON.stringify(
              snapshot,
              null,
              2
            )}`
          );
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
  const fixture = await createSmokeScenarioFixtures({
    temporaryRoot,
    scenario: options.scenario
  });

  await mkdir(profileDir, { recursive: true });
  await writeSmokeProfile({
    profileDir,
    namespace,
    smokeFile,
    scenario: options.scenario,
    smokeTargetUrl: fixture.smokeTargetUrl,
    manualWebRTCConfirm: options.manualWebRTCConfirm,
    extraPrefs: fixture.extraPrefs
  });

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
    await fixture.close();

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
