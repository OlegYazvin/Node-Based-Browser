import { BrowserBasicsBridge } from "./browser-basics-bridge.mjs";
import { ChromeStateController } from "./chrome-state-controller.mjs";
import { FavoritesStore } from "./favorites-store.mjs";
import { describeNodelyShellEligibility, NodeRuntimeManager } from "./node-runtime-manager.mjs";
import "./nodely-shell.mjs";
import { WorkspaceStore } from "./workspace-store.mjs";

const HTML_NS = "http://www.w3.org/1999/xhtml";
let ServicesModule = null;
let IOUtilsModule = null;

try {
  if (typeof ChromeUtils !== "undefined") {
    ServicesModule = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
    IOUtilsModule = ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs");
  }
} catch {
  ServicesModule = null;
  IOUtilsModule = null;
}

const ServicesRef = ServicesModule?.Services ?? globalThis.Services ?? null;
const IOUtilsRef = IOUtilsModule?.IOUtils ?? globalThis.IOUtils ?? null;
let bootstrapRequested = false;
let bootstrapComplete = false;

function testingEnabled() {
  if (!ServicesRef?.prefs) {
    return false;
  }

  try {
    return ServicesRef.prefs.getBoolPref("nodely.testing.enabled", false);
  } catch {
    return false;
  }
}

function workspaceNamespace() {
  if (!ServicesRef?.prefs) {
    return "nodely-workspaces";
  }

  try {
    return ServicesRef.prefs.getStringPref("nodely.testing.workspace_namespace", "nodely-workspaces") || "nodely-workspaces";
  } catch {
    return "nodely-workspaces";
  }
}

function smokeFilePath() {
  if (!ServicesRef?.prefs) {
    return null;
  }

  try {
    const value = ServicesRef.prefs.getStringPref("nodely.testing.smoke_file", "").trim();
    return value || null;
  } catch {
    return null;
  }
}

function smokeScenarioName() {
  if (!ServicesRef?.prefs) {
    return "";
  }

  try {
    return ServicesRef.prefs.getStringPref("nodely.testing.smoke_scenario", "").trim();
  } catch {
    return "";
  }
}

function marionetteEnabled() {
  if (!ServicesRef?.prefs) {
    return false;
  }

  try {
    return ServicesRef.prefs.getBoolPref("marionette.enabled", false);
  } catch {
    return false;
  }
}

function shellEnabledPref() {
  if (!ServicesRef?.prefs) {
    return true;
  }

  try {
    return ServicesRef.prefs.getBoolPref("nodely.shell.enabled", true);
  } catch {
    return true;
  }
}

function shouldEnableNodelyShell() {
  if (!shellEnabledPref()) {
    document.documentElement?.setAttribute("nodely-bootstrap-reason", "pref-disabled");
    return false;
  }

  const eligibility = describeNodelyShellEligibility(window, document);
  document.documentElement?.setAttribute("nodely-bootstrap-reason", eligibility.reason);

  if (!eligibility.enabled) {
    return false;
  }

  if ((typeof Cu !== "undefined" && Cu?.isInAutomation) || marionetteEnabled()) {
    const enabledForTests = testingEnabled();
    document.documentElement?.setAttribute(
      "nodely-bootstrap-reason",
      enabledForTests ? "automation-testing" : "automation-disabled"
    );
    return enabledForTests;
  }

  return true;
}

function reportBootstrapError(stage, error) {
  const message = error?.stack || error?.message || String(error);
  document.documentElement?.setAttribute("nodely-bootstrap-state", "error");
  document.documentElement?.setAttribute("nodely-bootstrap-stage", stage);

  try {
    dump(`[nodely] ${stage}: ${message}\n`);
  } catch {}

  try {
    console.error(`[nodely] ${stage}`, error);
  } catch {}
}

function hideNativeBrowserChrome() {
  const idsToHide = [
    "navigator-toolbox",
    "toolbar-menubar",
    "TabsToolbar",
    "nav-bar",
    "PersonalToolbar",
    "sidebar-main",
    "sidebar-box",
    "sidebar-splitter",
    "sidebar-launcher-splitter",
    "vertical-tabs"
  ];

  for (const id of idsToHide) {
    const element = document.getElementById(id);

    if (!element) {
      continue;
    }

    element.hidden = true;
    element.setAttribute("hidden", "true");
    element.style?.setProperty("display", "none", "important");
    element.style?.setProperty("visibility", "collapse", "important");
  }
}

function setPref(kind, name, value) {
  if (!ServicesRef?.prefs) {
    return;
  }

  try {
    switch (kind) {
      case "bool":
        ServicesRef.prefs.setBoolPref(name, value);
        break;
      case "int":
        ServicesRef.prefs.setIntPref(name, value);
        break;
      case "string":
        ServicesRef.prefs.setStringPref(name, value);
        break;
      default:
        break;
    }
  } catch {}
}

function configureNodelyStartupPrefs() {
  document.documentElement?.setAttribute("nodely-profile-managed", "true");
  setPref("bool", "nodely.profile.managed", true);
  setPref("int", "browser.startup.page", 0);
  setPref("string", "browser.startup.homepage", "about:blank");
  setPref("string", "startup.homepage_welcome_url", "");
  setPref("string", "startup.homepage_welcome_url.additional", "");
  setPref("string", "browser.startup.homepage_override.mstone", "ignore");
  setPref("bool", "browser.aboutwelcome.enabled", false);
  setPref("bool", "browser.newtabpage.enabled", false);
}

function installTestBridge({ shell, controller, workspaceStore, favoritesStore, runtimeManager, basicsBridge }) {
  if (!testingEnabled()) {
    return;
  }

  const smokePath = smokeFilePath();
  const configuredScenario = smokeScenarioName();
  let smokeWriteChain = Promise.resolve();
  let smokeScenarioRun = null;

  const api = {
    shell,
    controller,
    workspaceStore,
    favoritesStore,
    runtimeManager,
    basicsBridge,
    getState() {
      return controller.getState();
    },
    workspaceFilePath(workspaceId = "default") {
      return workspaceStore.workspaceFilePath(workspaceId);
    },
    async flushWorkspace() {
      if (!controller.workspace) {
        return controller.getState();
      }

      controller.workspace = await workspaceStore.saveWorkspace(controller.workspace);
      controller.emitStateChange();
      return controller.getState();
    },
    waitForState(predicate, description = "nodely state") {
      if (predicate(controller.getState())) {
        return Promise.resolve(controller.getState());
      }

      return new Promise((resolve) => {
        const onStateChange = () => {
          const state = controller.getState();

          if (!predicate(state)) {
            return;
          }

          controller.removeEventListener("state-changed", onStateChange);
          resolve(state);
        };

        controller.addEventListener("state-changed", onStateChange);
      });
    },
    runConfiguredSmokeScenario() {
      if (!configuredScenario) {
        return Promise.resolve(null);
      }

      if (!smokeScenarioRun) {
        smokeScenarioRun = runSmokeScenario({
          shell,
          controller,
          writeSmokeSnapshot,
          scenarioName: configuredScenario
        });
      }

      return smokeScenarioRun;
    }
  };

  const writeSmokeSnapshot = (reason) => {
    if (!smokePath || !IOUtilsRef) {
      return;
    }

    const describeElement = (selector) => {
      const element = document.querySelector(selector);

      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visibility: style.visibility,
        marginTop: style.marginTop,
        marginInlineStart: style.marginInlineStart
      };
    };

    const state = controller.getState();
    const workspace = state.workspace;
    const selectedNode =
      workspace?.nodes?.find((node) => node.id === workspace.selectedNodeId) ?? null;
    const selectedRoot =
      selectedNode == null ? null : workspace?.nodes?.find((node) => node.id === selectedNode.rootId) ?? null;
    const selectedTreeNodeCount =
      selectedRoot == null ? 0 : workspace?.nodes?.filter((node) => node.rootId === selectedRoot.id).length ?? 0;
    const minimap = document.querySelector(".nodely-graph-surface__minimap");
    const minimapSvg = minimap?.querySelector("svg");
    const minimapViewport = minimap?.querySelector(".nodely-graph-surface__minimap-viewport");
    const minimapNodes = minimap?.querySelectorAll("rect");
    const minimapEdges = minimap?.querySelectorAll(".nodely-graph-surface__minimap-edge");
    const minimapToolbar = document.querySelector(".nodely-graph-surface__minimap-toolbar");
    const surfaceCloseButton = document.querySelector(".nodely-shell__surface-close");
    const snapshot = {
      reason,
      recordedAt: Date.now(),
      bootstrapState: document.documentElement?.getAttribute("nodely-bootstrap-state") ?? null,
      active: document.documentElement?.getAttribute("nodely-active") ?? null,
      view: document.documentElement?.getAttribute("nodely-view") ?? null,
      drawer: document.documentElement?.getAttribute("nodely-drawer") ?? null,
      browserSurface: document.documentElement?.getAttribute("nodely-browser-surface") ?? null,
      emptyWorkspace: document.documentElement?.getAttribute("nodely-empty-workspace") ?? null,
      workspace: workspace
        ? {
            id: workspace.id,
            selectedNodeId: workspace.selectedNodeId,
            nodeCount: workspace.nodes.length,
            edgeCount: workspace.edges.length,
            rootCount: workspace.nodes.filter((node) => node.parentId === null).length,
            selectedNode:
              selectedNode == null
                ? null
                : {
                    id: selectedNode.id,
                    rootId: selectedNode.rootId,
                    parentId: selectedNode.parentId,
                    title: selectedNode.title,
                    url: selectedNode.url,
                    kind: selectedNode.kind,
                    runtimeState: selectedNode.runtimeState
                  }
          }
        : null,
      selectedTree:
        selectedRoot == null
          ? null
          : {
              rootId: selectedRoot.id,
              title: selectedRoot.title,
              nodeCount: selectedTreeNodeCount
            },
      ui: {
        surfaceCloseLabel: surfaceCloseButton?.textContent?.trim() ?? "",
        smokeActivationMethod: window.__nodelySmokeActivationMethod ?? null,
        minimap: {
          visible: Boolean(minimap && !minimap.hidden),
          svgPresent: Boolean(minimapSvg),
          nodeShapeCount: minimapNodes?.length ?? 0,
          edgeCount: minimapEdges?.length ?? 0,
          viewportPresent: Boolean(minimapViewport),
          toolbarButtonCount: minimapToolbar?.querySelectorAll("button")?.length ?? 0
        }
      },
      layout: {
        browser: describeElement("#browser"),
        tabbox: describeElement("#tabbrowser-tabbox"),
        tabpanels: describeElement("#tabbrowser-tabpanels"),
        appcontent: describeElement("#appcontent"),
        graph: describeElement("nodely-graph-surface"),
        topbar: describeElement(".nodely-shell__topbar"),
        composer: describeElement(".nodely-shell__composer"),
        pagebar: describeElement(".nodely-shell__pagebar")
      }
    };

    smokeWriteChain = smokeWriteChain
      .catch(() => {})
      .then(() => IOUtilsRef.writeUTF8(smokePath, JSON.stringify(snapshot, null, 2)));
  };

  Object.defineProperty(window, "__nodelyTest", {
    configurable: true,
    enumerable: false,
    writable: false,
    value: api
  });

  writeSmokeSnapshot("bridge-installed");
  controller.addEventListener("state-changed", () => {
    writeSmokeSnapshot("state-changed");
  });
}

async function runSmokeScenario({ shell, controller, writeSmokeSnapshot, scenarioName }) {
  try {
    switch (scenarioName) {
      case "graph-select-root":
        await runGraphSelectRootScenario({ shell, controller });
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "pagebar-new-child":
        await runPagebarNewChildScenario({ shell, controller });
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      default:
        writeSmokeSnapshot(`scenario:${scenarioName}:unknown`);
        return;
    }
  } catch (error) {
    reportBootstrapError(`smoke.${scenarioName}`, error);
    writeSmokeSnapshot(`scenario:${scenarioName}:error`);
  }
}

async function runGraphSelectRootScenario({ shell, controller }) {
  const readyState = await window.__nodelyTest.waitForState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length >= 2 &&
      selectedNode?.url === "https://example.org/" &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "smoke graph ready");
  const rootNode =
    readyState.workspace?.nodes?.find?.((node) => node.parentId === null) ?? null;

  if (!rootNode?.id) {
    throw new Error("Smoke graph-select-root scenario could not find a root node.");
  }

  shell.graph.centerOnNode(rootNode.id);
  await nextAnimationFrame();
  await nextAnimationFrame();

  const selector = `.nodely-graph-node[data-node-id="${escapeAttributeValue(rootNode.id)}"]`;
  const nodeElement = document.querySelector(selector);

  if (!nodeElement) {
    throw new Error(`Smoke graph-select-root scenario could not find ${selector}.`);
  }

  synthesizeMouseActivation(nodeElement);

  await window.__nodelyTest.waitForState((state) => {
    const selectedNode =
      state.workspace?.nodes?.find?.((node) => node.id === state.workspace?.selectedNodeId) ?? null;

    return (
      selectedNode?.id === rootNode.id &&
      selectedNode?.url === "https://example.com/" &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "graph root selection");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runPagebarNewChildScenario() {
  const readyState = await window.__nodelyTest.waitForState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length === 2 &&
      selectedNode?.url === "https://example.org/" &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "smoke pagebar ready");
  const parentNodeId = readyState.workspace?.selectedNodeId ?? null;
  const button = document.querySelector('[data-action="create-child-node"]');

  if (!parentNodeId) {
    throw new Error("Smoke pagebar-new-child scenario could not resolve the active page node.");
  }

  if (!button) {
    throw new Error("Smoke pagebar-new-child scenario could not find the new child button.");
  }

  button.click();

  await window.__nodelyTest.waitForState((state) => {
    const selectedNode =
      state.workspace?.nodes?.find?.((node) => node.id === state.workspace?.selectedNodeId) ?? null;

    return (
      state.workspace?.nodes?.length === 3 &&
      state.workspace?.edgeCount === 2 &&
      selectedNode?.id !== parentNodeId &&
      selectedNode?.parentId === parentNodeId &&
      selectedNode?.kind === "page" &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "pagebar new child");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

function escapeAttributeValue(value) {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(value);
  }

  return String(value).replace(/["\\]/gu, "\\$&");
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function synthesizeMouseActivation(element) {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const utils = window.windowUtils;
  const mouseSource = window.MouseEvent?.MOZ_SOURCE_MOUSE ?? 1;
  const pointerId = utils?.DEFAULT_MOUSE_POINTER_ID ?? 1;

  if (!utils?.sendMouseEvent) {
    window.__nodelySmokeActivationMethod = "dispatchEvent-fallback";
    dispatchSyntheticMouseActivation(element, clientX, clientY);
    return;
  }

  try {
    // Drive the graph through Gecko's window-utils synthesis so smoke
    // coverage matches the browser's real click path more closely than plain
    // dispatchEvent shortcuts. Headless builds can reject this call, so we
    // fall back below when needed.
    utils.sendMouseEvent("mousemove", clientX, clientY, 0, 0, 0, false, 0, mouseSource, true, false, 0, pointerId);
    utils.sendMouseEvent("mousedown", clientX, clientY, 0, 1, 0, false, 0, mouseSource, true, false, 1, pointerId);
    utils.sendMouseEvent("mouseup", clientX, clientY, 0, 1, 0, false, 0, mouseSource, true, false, 0, pointerId);
    utils.sendMouseEvent("click", clientX, clientY, 0, 1, 0, false, 0, mouseSource, true, false, 0, pointerId);
    window.__nodelySmokeActivationMethod = "windowUtils";
  } catch {
    window.__nodelySmokeActivationMethod = "dispatchEvent-fallback";
    dispatchSyntheticMouseActivation(element, clientX, clientY);
  }
}

function dispatchSyntheticMouseActivation(element, clientX, clientY) {
  const pointerBase = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    clientX,
    clientY
  };

  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      ...pointerBase,
      button: 0,
      buttons: 1
    })
  );
  element.dispatchEvent(
    new PointerEvent("pointerup", {
      ...pointerBase,
      button: 0,
      buttons: 0
    })
  );
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      button: 0
    })
  );
}

function initializeNodelyShell() {
  configureNodelyStartupPrefs();
  document.documentElement?.setAttribute("nodely-bootstrap-state", "loading");

  if (document.querySelector("nodely-shell")) {
    document.documentElement?.setAttribute("nodely-bootstrap-state", "ready");
    return;
  }

  try {
    const shell = document.createElementNS(HTML_NS, "nodely-shell");
    const workspaceStore = new WorkspaceStore({ namespace: workspaceNamespace() });
    const favoritesStore = new FavoritesStore();
    const runtimeManager = new NodeRuntimeManager(window);
    const basicsBridge = new BrowserBasicsBridge(window, { runtimeManager });
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge
    });

    hideNativeBrowserChrome();
    document.documentElement.setAttribute("nodely-active", "true");
    document.documentElement.setAttribute("nodely-bootstrap-state", "ready");
    const body = document.body ?? document.documentElement;
    body.insertBefore(shell, body.firstElementChild ?? null);
    shell.setController(controller);
    installTestBridge({
      shell,
      controller,
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge
    });
    controller
      .initialize()
      .then(() => {
        if (testingEnabled()) {
          window.dispatchEvent(new CustomEvent("nodely-ready", { detail: { shell } }));
          void window.__nodelyTest?.runConfiguredSmokeScenario?.();
        }
      })
      .catch((error) => reportBootstrapError("controller.initialize", error));

    window.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        controller.createChildNode();
      }
    });
  } catch (error) {
    reportBootstrapError("initializeNodelyShell", error);
  }
}

function browserChromeReady() {
  return Boolean(document.body && window.gBrowser?.tabContainer);
}

function requestNodelyBootstrap(stage) {
  if (bootstrapComplete || bootstrapRequested) {
    return;
  }

  bootstrapRequested = true;

  window.requestAnimationFrame(() => {
    bootstrapRequested = false;

    if (bootstrapComplete) {
      return;
    }

    if (!browserChromeReady()) {
      requestNodelyBootstrap(stage);
      return;
    }

    if (!shouldEnableNodelyShell()) {
      document.documentElement?.setAttribute("nodely-bootstrap-state", "disabled");
      bootstrapComplete = true;
      return;
    }

    try {
      initializeNodelyShell();
      bootstrapComplete = true;
    } catch (error) {
      reportBootstrapError(stage, error);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => requestNodelyBootstrap("startup.domcontentloaded"), { once: true });
} else {
  requestNodelyBootstrap("startup.ready");
}

window.addEventListener("load", () => requestNodelyBootstrap("startup.load"), { once: true });
