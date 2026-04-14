import { BrowserBasicsBridge } from "./browser-basics-bridge.mjs";
import { ChromeStateController } from "./chrome-state-controller.mjs";
import { FavoritesStore } from "./favorites-store.mjs";
import { describeNodelyShellEligibility, NodeRuntimeManager } from "./node-runtime-manager.mjs";
import { treeDisplayTitle } from "./domain.mjs";
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
const ROOT_SMOKE_URL =
  "data:text/html,%3Ctitle%3ENodely%20Smoke%20Root%3C%2Ftitle%3E%3Ch1%3ERoot%3C%2Fh1%3E";
const CHILD_SMOKE_URL =
  "data:text/html,%3Ctitle%3ENodely%20Smoke%20Child%3C%2Ftitle%3E%3Ch1%3EChild%3C%2Fh1%3E";
const SMOKE_WAIT_TIMEOUT_MS = 15_000;
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

function smokeTargetUrl() {
  if (!ServicesRef?.prefs) {
    return "";
  }

  try {
    return ServicesRef.prefs.getStringPref("nodely.testing.smoke_target_url", "").trim();
  } catch {
    return "";
  }
}

function smokeManualWebRTCConfirm() {
  if (!ServicesRef?.prefs) {
    return false;
  }

  try {
    return ServicesRef.prefs.getBoolPref("nodely.testing.smoke_manual_webrtc_confirm", false);
  } catch {
    return false;
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
    "toolbar-menubar",
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

function waitForBrowserDelayedStartup() {
  if (!ServicesRef?.obs || window.gBrowserInit?.delayedStartupFinished) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const observer = (subject, topic) => {
      if (topic !== "browser-delayed-startup-finished" || subject !== window) {
        return;
      }

      ServicesRef.obs.removeObserver(observer, topic);
      resolve();
    };

    ServicesRef.obs.addObserver(observer, "browser-delayed-startup-finished");
  });
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

    const describeNode = (element) => {

      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        marginTop: style.marginTop,
        marginInlineStart: style.marginInlineStart
      };
    };

    const describeElement = (selector) => describeNode(document.querySelector(selector));

    const state = controller.getState();
    const workspace = state.workspace;
    const selectedNode =
      workspace?.nodes?.find((node) => node.id === workspace.selectedNodeId) ?? null;
    const selectedTab = window.gBrowser?.selectedTab ?? null;
    const selectedTabNodeId = runtimeManager.nodeIdForTab(selectedTab);
    const selectedTabUrl = selectedTab?.linkedBrowser?.currentURI?.spec ?? null;
    const selectedRoot =
      selectedNode == null ? null : workspace?.nodes?.find((node) => node.id === selectedNode.rootId) ?? null;
    const selectedTreeNodeCount =
      selectedRoot == null ? 0 : workspace?.nodes?.filter((node) => node.rootId === selectedRoot.id).length ?? 0;
    const selectedRootNodeElement =
      selectedRoot == null
        ? null
        : document.querySelector(
            `.nodely-graph-node[data-node-id="${escapeAttributeValue(selectedRoot.id)}"]`
          );
    const minimap = document.querySelector(".nodely-graph-surface__minimap");
    const minimapSvg = minimap?.querySelector("svg");
    const minimapViewport = minimap?.querySelector(".nodely-graph-surface__minimap-viewport");
    const minimapNodes = minimap?.querySelectorAll("rect");
    const minimapEdges = minimap?.querySelectorAll(".nodely-graph-surface__minimap-edge");
    const minimapToolbar = document.querySelector(".nodely-graph-surface__minimap-toolbar");
    const graphSurface = document.querySelector("nodely-graph-surface");
    const surfaceCloseButton = document.querySelector(".nodely-shell__surface-close");
    const surfaceCloseSvg = surfaceCloseButton?.querySelector("svg");
    const surfaceClosePaths = surfaceCloseButton?.querySelectorAll("svg path");
    const pageToolbar = document.querySelector(".nodely-shell__address-form");
    const pageToolbarButtons = pageToolbar?.querySelectorAll(".nodely-shell__icon-button") ?? [];
    const branchNextButton = document.querySelector('[data-action="toggle-branch-next"]');
    const newChildButton = document.querySelector('[data-action="create-child-node"]');
    const treeEditButton = document.querySelector('[data-action="start-tree-rename"]');
    const aiChatTabs = document.querySelectorAll(".nodely-shell__tab--ai-chat");
    const tabFavicons = document.querySelectorAll(".nodely-shell__tab .nodely-shell__tab-favicon");
    const tabCloseButtons = document.querySelectorAll(".nodely-shell__tab-close");
    const tabClosePaths = document.querySelectorAll(".nodely-shell__tab-close svg path");
    const tabsContainer = document.querySelector(".nodely-shell__tabs");
    const treeFavoriteButton = document.querySelector('.nodely-shell__tree-strip [data-action="toggle-tree-favorite"]');
    const topbarOrganizeButton = document.querySelector(".nodely-shell__topbar [data-action='auto-organize']");
    const topbarFullscreenButton = document.querySelector(".nodely-shell__topbar [data-action='toggle-fullscreen']");
    const graphOrganizeButton = minimapToolbar?.querySelector('[data-action="auto-organize"]');
    const activeDrawerName = shell.drawer ?? null;
    const activeDrawerElement = activeDrawerName
      ? document.querySelector(`.nodely-shell__drawer--${activeDrawerName}`)
      : null;
    const activeDrawerTrigger = activeDrawerName
      ? document.querySelector(
          `.nodely-shell__topbar [data-action="toggle-drawer"][data-drawer="${activeDrawerName}"]`
        )
      : null;
    const contextMenu = document.querySelector(".nodely-shell__menu");
    const popupNotifications = window.PopupNotifications ?? null;
    const selectedBrowser = window.gBrowser?.selectedBrowser ?? null;
    const selectedBrowserTitle = selectedBrowser?.contentTitle ?? "";
    const nativeUrlbar = document.getElementById("urlbar");
    const nativeUrlbarInput = document.getElementById("urlbar-input");
    const nativeUrlbarPopup =
      document.getElementById("PopupAutoCompleteRichResult") ??
      document.getElementById("PopupAutoComplete");
    const nodelyLocationInput =
      document.querySelector(".nodely-shell__address-form input[name='address']") ??
      document.querySelector(".nodely-shell__composer-form input[name='root-input']");
    const webRTCPrompt =
      popupNotifications?.getNotification?.("webRTC-shareDevices", selectedBrowser) ??
      popupNotifications?.getNotification?.("webRTC-shareDevices") ??
      null;
    const popupPanel = popupNotifications?.panel ?? null;
    const popupAnchorId = webRTCPrompt?.anchorID ?? null;
    const popupAnchor = popupAnchorId ? document.getElementById(popupAnchorId) : null;
    const navBar = document.getElementById("nav-bar");
    const navigatorToolbox = document.getElementById("navigator-toolbox");
    const webRTCPromptPanel = popupPanel?.firstElementChild ?? null;
    const webRTCPromptPrimaryButton =
      webRTCPromptPanel?.querySelector?.(".popup-notification-primary-button") ?? null;
    const webRTCMicrophoneSelect =
      popupPanel?.querySelector?.("#webRTC-selectMicrophone-menulist") ?? null;
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
              title: treeDisplayTitle(workspace, selectedRoot.id),
              nodeCount: selectedTreeNodeCount
            },
      runtime: {
        selectedTabNodeId,
        selectedTabUrl,
        selectedTabTitle: selectedBrowserTitle,
        selectedTabMatchesSelection:
          selectedNode == null ? selectedTabNodeId == null : selectedTabNodeId === selectedNode.id
      },
      ui: {
        surfaceClosePresent: Boolean(surfaceCloseButton),
        surfaceCloseLabel: surfaceCloseButton?.textContent?.trim() ?? "",
        surfaceCloseSvgPresent: Boolean(surfaceCloseSvg),
        surfaceClosePathCount: surfaceClosePaths?.length ?? 0,
        rootComposerPresent: Boolean(document.querySelector("input[name='root-input']")),
        composerPlacement: shell.composer?.dataset?.placement ?? "",
        pageToolbar: {
          buttonCount: pageToolbarButtons.length,
          svgCount: pageToolbar?.querySelectorAll(".nodely-shell__icon-button > svg")?.length ?? 0,
          pathCount: pageToolbar?.querySelectorAll(".nodely-shell__icon-button > svg path")?.length ?? 0,
          branchNextPresent: Boolean(branchNextButton)
        },
        treeStrip: {
          treeEditPresent: Boolean(treeEditButton),
          aiChatTabCount: aiChatTabs?.length ?? 0,
          tabFaviconCount: tabFavicons?.length ?? 0,
          tabCloseCount: tabCloseButtons?.length ?? 0,
          tabClosePathCount: tabClosePaths?.length ?? 0,
          tabsFitViewport:
            (tabsContainer?.scrollWidth ?? 0) <= (tabsContainer?.clientWidth ?? 0) + 2,
          newChildVisible: nodeFullyVisibleWithin(tabsContainer, newChildButton),
          newChildSvgCount: newChildButton?.querySelectorAll("svg")?.length ?? 0,
          newChildPathCount: newChildButton?.querySelectorAll("svg path")?.length ?? 0,
          treeFavoritePresent: Boolean(treeFavoriteButton)
        },
        nativeUrlbar: {
          popoverOpen: matchesSelectorSafe(nativeUrlbar, ":popover-open"),
          open: Boolean(nativeUrlbar?.hasAttribute?.("open")),
          breakout: Boolean(nativeUrlbar?.hasAttribute?.("breakout")),
          breakoutExtend: Boolean(nativeUrlbar?.hasAttribute?.("breakout-extend")),
          popupOpen:
            matchesSelectorSafe(nativeUrlbarPopup, ":popover-open") ||
            nativeUrlbarPopup?.state === "open",
          nativeInputFocused: document.activeElement === nativeUrlbarInput,
          nodelyInputFocused: document.activeElement === nodelyLocationInput,
          activeElementId: document.activeElement?.id ?? null,
          suppressed:
            !matchesSelectorSafe(nativeUrlbar, ":popover-open") &&
            !nativeUrlbar?.hasAttribute?.("open") &&
            !nativeUrlbar?.hasAttribute?.("breakout-extend") &&
            !(
              matchesSelectorSafe(nativeUrlbarPopup, ":popover-open") ||
              nativeUrlbarPopup?.state === "open"
            ) &&
            document.activeElement !== nativeUrlbarInput
        },
        canvasTreeLabels: {
          count: Number(graphSurface?.dataset?.treeLabelCount ?? 0),
          mode: graphSurface?.dataset?.treeLabelMode ?? null
        },
        windowFullscreen: Boolean(window.fullScreen),
        minimap: {
          visible: Boolean(minimap && !minimap.hidden),
          svgPresent: Boolean(minimapSvg),
          nodeShapeCount: minimapNodes?.length ?? 0,
          edgeCount: minimapEdges?.length ?? 0,
          viewportPresent: Boolean(minimapViewport),
          toolbarButtonCount: minimapToolbar?.querySelectorAll("button")?.length ?? 0,
          organizePresent: Boolean(graphOrganizeButton)
        },
        topbar: {
          organizePresent: Boolean(topbarOrganizeButton),
          fullscreenPresent: Boolean(topbarFullscreenButton)
        },
        treesDrawer: {
          favoriteButtonCount:
            shell.treesDrawer?.querySelectorAll?.('[data-action="toggle-tree-favorite"]')?.length ?? 0,
          rootRowCount:
            shell.treesDrawer?.querySelectorAll?.('form[data-root-id]')?.length ?? 0
        },
        contextMenu: {
          visible: Boolean(contextMenu && !contextMenu.hidden),
          actionCount: contextMenu?.querySelectorAll?.("[data-action]")?.length ?? 0
        },
        webrtcPrompt: {
          visible: Boolean(webRTCPrompt),
          panelState: popupPanel?.state ?? "",
          anchorId: popupAnchorId,
          anchorConnected: Boolean(popupAnchor?.isConnected),
          anchorHidden: Boolean(popupAnchor?.hidden),
          anchorOpacity: popupAnchor ? window.getComputedStyle(popupAnchor).opacity : "",
          navBarHidden: Boolean(navBar?.hidden),
          toolboxHidden: Boolean(navigatorToolbox?.hidden),
          primaryButtonDisabled: Boolean(webRTCPromptPrimaryButton?.disabled),
          microphoneSelectorVisible: Boolean(webRTCMicrophoneSelect),
          microphoneSelectorDisabled: Boolean(webRTCMicrophoneSelect?.disabled),
          microphoneSelectorValue:
            webRTCMicrophoneSelect?.value ??
            webRTCMicrophoneSelect?.selectedItem?.value ??
            null,
          sharing: selectedTab?._sharingState?.webRTC?.sharing ?? null,
          microphoneState: selectedTab?._sharingState?.webRTC?.microphone ?? null
        }
      },
      layout: {
        browser: describeElement("#browser"),
        tabbox: describeElement("#tabbrowser-tabbox"),
        tabpanels: describeElement("#tabbrowser-tabpanels"),
        appcontent: describeElement("#appcontent"),
        graph: describeElement("nodely-graph-surface"),
        splitHandle: describeElement(".nodely-shell__split-handle"),
        topbar: describeElement(".nodely-shell__topbar"),
        composer: describeElement(".nodely-shell__composer"),
        pagebar: describeElement(".nodely-shell__pagebar"),
        navigatorToolbox: describeElement("#navigator-toolbox"),
        navBar: describeElement("#nav-bar"),
        popupNotifications: describeNode(popupPanel),
        selectedRootNode: describeNode(selectedRootNodeElement),
        activeDrawer: describeNode(activeDrawerElement),
        activeDrawerTrigger: describeNode(activeDrawerTrigger),
        contextMenu: describeNode(contextMenu)
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
        await runGraphSelectRootScenario({ shell });
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "focus-close-and-select-root":
        await runFocusCloseAndSelectRootScenario({ shell });
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "focus-escape-and-select-root":
        await runFocusEscapeAndSelectRootScenario({ shell });
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "pagebar-new-child":
        await runPagebarNewChildScenario();
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "pagebar-duplicate-tab":
        await runPagebarDuplicateTabScenario();
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "graph-contextmenu-root-composer":
        await runGraphContextMenuRootComposerScenario();
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "graph-contextmenu-kill-root":
        await runGraphContextMenuKillRootScenario({ shell });
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "toggle-fullscreen":
        await runToggleFullscreenScenario();
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "topbar-drawers":
        await runTopbarDrawersScenario();
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "webrtc-microphone-prompt":
        await runWebRTCMicrophonePromptScenario({ controller });
        writeSmokeSnapshot(`scenario:${scenarioName}:complete`);
        return;
      case "native-urlbar-overlay":
        await runNativeUrlbarOverlayScenario();
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

async function runGraphSelectRootScenario({ shell }) {
  const readyState = await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length >= 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
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

  await waitForSmokeState((state) => {
    const selectedNode =
      state.workspace?.nodes?.find?.((node) => node.id === state.workspace?.selectedNodeId) ?? null;

    return (
      selectedNode?.id === rootNode.id &&
      selectedNode?.url === ROOT_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "graph root selection");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runPagebarNewChildScenario() {
  const readyState = await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length === 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
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

  await waitForSmokeState((state) => {
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

async function runPagebarDuplicateTabScenario() {
  const readyState = await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length === 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "smoke pagebar duplicate ready");
  const parentNodeId = readyState.workspace?.selectedNodeId ?? null;
  const selector = `.nodely-shell__tab[data-node-id="${escapeAttributeValue(parentNodeId)}"]`;
  const tab = document.querySelector(selector);

  if (!parentNodeId) {
    throw new Error("Smoke pagebar-duplicate-tab scenario could not resolve the active tab node.");
  }

  if (!tab) {
    throw new Error(`Smoke pagebar-duplicate-tab scenario could not find ${selector}.`);
  }

  dispatchSyntheticContextMenu(tab);
  await waitForCondition(
    () =>
      !document.querySelector(".nodely-shell__menu")?.hidden &&
      Boolean(document.querySelector('[data-action="duplicate-tab"]')),
    "pagebar duplicate menu"
  );
  document.querySelector('[data-action="duplicate-tab"]')?.click();

  await waitForSmokeState((state) => {
    const selectedNode =
      state.workspace?.nodes?.find?.((node) => node.id === state.workspace?.selectedNodeId) ?? null;

    return (
      state.workspace?.nodes?.length === 3 &&
      state.workspace?.edgeCount === 2 &&
      selectedNode?.id !== parentNodeId &&
      selectedNode?.parentId === parentNodeId &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "pagebar duplicate tab");
  await waitForCondition(
    () => window.gBrowser?.selectedTab?.linkedBrowser?.currentURI?.spec === CHILD_SMOKE_URL,
    "duplicated tab runtime"
  );
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runGraphContextMenuRootComposerScenario() {
  await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length >= 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "smoke graph contextmenu ready");

  const stage = document.querySelector(".nodely-graph-surface__stage");

  if (!stage) {
    throw new Error("Smoke graph-contextmenu-root-composer scenario could not find the graph stage.");
  }

  dispatchSyntheticContextMenu(stage);

  await waitForSmokeState(
    () =>
      !document.querySelector(".nodely-shell__composer")?.hidden &&
      Boolean(document.querySelector("input[name='root-input']")),
    "graph contextmenu composer"
  );
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runGraphContextMenuKillRootScenario({ shell }) {
  const readyState = await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length === 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "smoke graph kill root ready");
  const rootNode =
    readyState.workspace?.nodes?.find?.((node) => node.parentId === null) ?? null;

  if (!rootNode?.id) {
    throw new Error("Smoke graph-contextmenu-kill-root scenario could not find a root node.");
  }

  shell.graph.centerOnNode(rootNode.id);
  await nextAnimationFrame();
  await nextAnimationFrame();

  const selector = `.nodely-graph-node[data-node-id="${escapeAttributeValue(rootNode.id)}"]`;
  const nodeElement = document.querySelector(selector);

  if (!nodeElement) {
    throw new Error(`Smoke graph-contextmenu-kill-root scenario could not find ${selector}.`);
  }

  dispatchSyntheticContextMenu(nodeElement);
  await waitForCondition(
    () =>
      !document.querySelector(".nodely-shell__menu")?.hidden &&
      Boolean(document.querySelector('[data-action="kill-node-context"]')),
    "graph kill menu"
  );
  document.querySelector('[data-action="kill-node-context"]')?.click();

  await waitForCondition(() => {
    const state = window.__nodelyTest?.getState?.();
    const selectedNode =
      state?.workspace?.nodes?.find?.((node) => node.id === state.workspace?.selectedNodeId) ?? null;

    return (
      state?.workspace?.nodes?.length === 1 &&
      state?.workspace?.nodes?.filter?.((node) => node.parentId === null)?.length === 1 &&
      selectedNode?.parentId === null &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page" &&
      window.gBrowser?.selectedTab?.linkedBrowser?.currentURI?.spec === CHILD_SMOKE_URL
    );
  }, "graph contextmenu kill root");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runToggleFullscreenScenario() {
  await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length >= 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "smoke fullscreen ready");

  const fullscreenButton = document.querySelector('[data-action="toggle-fullscreen"]');

  if (!fullscreenButton) {
    throw new Error("Smoke toggle-fullscreen scenario could not find the fullscreen button.");
  }

  fullscreenButton.click();

  await waitForSmokeState(() => window.fullScreen === true, "window fullscreen");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runTopbarDrawersScenario() {
  await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length >= 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "smoke topbar drawers ready");

  const treesButton = document.querySelector('[data-action="toggle-drawer"][data-drawer="trees"]');
  if (!treesButton) {
    throw new Error("Smoke topbar-drawers scenario could not find the Trees drawer toggle button.");
  }

  treesButton.click();
  await waitForCondition(() => {
    const drawer = document.querySelector(".nodely-shell__drawer--trees");
    const trigger = document.querySelector('[data-action="toggle-drawer"][data-drawer="trees"]');
    const drawerRect = drawer?.getBoundingClientRect?.();
    const triggerRect = trigger?.getBoundingClientRect?.();
    const favoriteButtons =
      document.querySelectorAll('.nodely-shell__drawer--trees [data-action="toggle-tree-favorite"]')
        ?.length ?? 0;
    const treeRows =
      document.querySelectorAll('.nodely-shell__drawer--trees form[data-root-id]')?.length ?? 0;

    return (
      document.documentElement?.getAttribute("nodely-drawer") === "trees" &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page" &&
      drawer &&
      !drawer.hidden &&
      trigger &&
      favoriteButtons === treeRows &&
      (drawerRect?.left ?? 0) <= (triggerRect?.right ?? 0) + 14 &&
      (drawerRect?.right ?? 0) >= (triggerRect?.left ?? 0) - 14 &&
      Math.abs((drawerRect?.top ?? 0) - ((triggerRect?.bottom ?? 0) + 8)) <= 14
    );
  }, "trees drawer anchored");

  const downloadsButton = document.querySelector('[data-action="toggle-drawer"][data-drawer="downloads"]');

  if (!downloadsButton) {
    throw new Error("Smoke topbar-drawers scenario could not find the Downloads drawer toggle button.");
  }

  downloadsButton.click();
  await waitForCondition(() => {
    const drawer = document.querySelector(".nodely-shell__drawer--downloads");
    const trigger = document.querySelector('[data-action="toggle-drawer"][data-drawer="downloads"]');
    const drawerRect = drawer?.getBoundingClientRect?.();
    const triggerRect = trigger?.getBoundingClientRect?.();

    return (
      document.documentElement?.getAttribute("nodely-drawer") === "downloads" &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page" &&
      drawer &&
      !drawer.hidden &&
      trigger &&
      (drawerRect?.left ?? 0) <= (triggerRect?.right ?? 0) + 14 &&
      (drawerRect?.right ?? 0) >= (triggerRect?.left ?? 0) - 14 &&
      Math.abs((drawerRect?.top ?? 0) - ((triggerRect?.bottom ?? 0) + 8)) <= 14
    );
  }, "downloads drawer anchored");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runWebRTCMicrophonePromptScenario({ controller }) {
  const targetUrl = smokeTargetUrl();

  if (!targetUrl) {
    throw new Error("Smoke webrtc-microphone-prompt scenario is missing nodely.testing.smoke_target_url.");
  }

  await controller.createRootFromInput(targetUrl);
  await waitForCondition(() => {
    const selectedBrowser = window.gBrowser?.selectedBrowser ?? null;
    return Boolean(
      window.PopupNotifications?.getNotification?.("webRTC-shareDevices", selectedBrowser) ??
        window.PopupNotifications?.getNotification?.("webRTC-shareDevices")
    );
  }, "webrtc microphone permission prompt");
  await waitForCondition(
    () => window.PopupNotifications?.panel?.state === "open",
    "webrtc microphone permission panel open"
  );
  await nextAnimationFrame();
  await nextAnimationFrame();

  const popupNotification = window.PopupNotifications?.panel?.firstElementChild ?? null;
  const mainButton =
    popupNotification?.button ??
    window.PopupNotifications?.panel?.querySelector?.(".popup-notification-primary-button");
  const promptNotification = popupNotification?.notification ?? null;

  if (!mainButton) {
    throw new Error("Smoke webrtc-microphone-prompt scenario could not find the Allow button.");
  }

  if (!smokeManualWebRTCConfirm()) {
    if (typeof promptNotification?.mainAction?.callback === "function") {
      await promptNotification.mainAction.callback({
        checkboxChecked: Boolean(popupNotification?.checkbox?.checked),
        source: "smoke"
      });
      window.PopupNotifications?._remove?.(promptNotification);
    } else if (typeof mainButton.doCommand === "function") {
      mainButton.doCommand();
    } else {
      mainButton.click();
    }
  }
  await waitForCondition(() => {
    const selectedBrowser = window.gBrowser?.selectedBrowser ?? null;
    const browserTitle = selectedBrowser?.contentTitle ?? "";
    const sharingState = window.gBrowser?.selectedTab?._sharingState?.webRTC ?? null;

    return (
      /Nodely Smoke Microphone OK/iu.test(browserTitle) ||
      /Nodely Smoke Microphone Error/iu.test(browserTitle) ||
      Boolean(sharingState?.microphone)
    );
  }, "webrtc microphone page outcome");

  const selectedBrowser = window.gBrowser?.selectedBrowser ?? null;
  const browserTitle = selectedBrowser?.contentTitle ?? "";

  if (/Nodely Smoke Microphone Error/iu.test(browserTitle)) {
    throw new Error(`Smoke webrtc-microphone-prompt page reported failure: ${browserTitle}`);
  }

  await waitForCondition(() => {
    const sharingState = window.gBrowser?.selectedTab?._sharingState?.webRTC ?? null;
    return Boolean(sharingState?.microphone);
  }, "webrtc microphone capture state");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runNativeUrlbarOverlayScenario() {
  await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length >= 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page"
    );
  }, "native urlbar scenario ready");

  const openLocationCommand = document.getElementById("Browser:OpenLocation");

  if (!openLocationCommand?.doCommand) {
    throw new Error("Smoke native-urlbar-overlay scenario could not find Browser:OpenLocation.");
  }

  openLocationCommand.doCommand();
  await nextAnimationFrame();
  await nextAnimationFrame();

  await waitForCondition(() => {
    const nativeUrlbar = document.getElementById("urlbar");
    const nativeUrlbarInput = document.getElementById("urlbar-input");
    const nativeUrlbarPopup =
      document.getElementById("PopupAutoCompleteRichResult") ??
      document.getElementById("PopupAutoComplete");
    const nodelyLocationInput =
      document.querySelector(".nodely-shell__address-form input[name='address']") ??
      document.querySelector(".nodely-shell__composer-form input[name='root-input']");

    return (
      !matchesSelectorSafe(nativeUrlbar, ":popover-open") &&
      !nativeUrlbar?.hasAttribute?.("open") &&
      !nativeUrlbar?.hasAttribute?.("breakout-extend") &&
      !(
        matchesSelectorSafe(nativeUrlbarPopup, ":popover-open") ||
        nativeUrlbarPopup?.state === "open"
      ) &&
      document.activeElement !== nativeUrlbarInput
    );
  }, "native urlbar suppressed");
}

async function runFocusCloseAndSelectRootScenario({ shell }) {
  const readyState = await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length >= 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-view") === "focus" &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page" &&
      window.gBrowser?.selectedTab?.linkedBrowser?.currentURI?.spec === CHILD_SMOKE_URL
    );
  }, "smoke focus page ready");
  const rootNode =
    readyState.workspace?.nodes?.find?.((node) => node.parentId === null) ?? null;
  const closeButton = document.querySelector(".nodely-shell__surface-close");

  if (!rootNode?.id) {
    throw new Error("Smoke focus-close-and-select-root scenario could not find a root node.");
  }

  if (!closeButton) {
    throw new Error("Smoke focus-close-and-select-root scenario could not find the canvas close button.");
  }

  if (!/canvas/iu.test(closeButton.textContent?.trim() ?? "")) {
    throw new Error("Smoke focus-close-and-select-root scenario expected a Back to Canvas button in focus mode.");
  }

  closeButton.click();

  await waitForSmokeState(
    () => document.documentElement?.getAttribute("nodely-browser-surface") === "canvas",
    "focus canvas"
  );

  shell.graph.centerOnNode(rootNode.id);
  await nextAnimationFrame();
  await nextAnimationFrame();

  const selector = `.nodely-graph-node[data-node-id="${escapeAttributeValue(rootNode.id)}"]`;
  const nodeElement = document.querySelector(selector);

  if (!nodeElement) {
    throw new Error(`Smoke focus-close-and-select-root scenario could not find ${selector}.`);
  }

  synthesizeMouseActivation(nodeElement);

  await waitForSmokeState((state) => {
    const selectedNode =
      state.workspace?.nodes?.find?.((node) => node.id === state.workspace?.selectedNodeId) ?? null;

    return (
      selectedNode?.id === rootNode.id &&
      selectedNode?.url === ROOT_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page" &&
      window.gBrowser?.selectedTab?.linkedBrowser?.currentURI?.spec === ROOT_SMOKE_URL
    );
  }, "focus root selection");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

async function runFocusEscapeAndSelectRootScenario({ shell }) {
  const readyState = await waitForSmokeState((state) => {
    const selectedNode = state.workspace?.nodes?.find?.(
      (node) => node.id === state.workspace?.selectedNodeId
    );

    return (
      state.workspace?.nodes?.length >= 2 &&
      selectedNode?.url === CHILD_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-view") === "focus" &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page" &&
      window.gBrowser?.selectedTab?.linkedBrowser?.currentURI?.spec === CHILD_SMOKE_URL
    );
  }, "smoke focus page ready for escape");
  const rootNode =
    readyState.workspace?.nodes?.find?.((node) => node.parentId === null) ?? null;

  if (!rootNode?.id) {
    throw new Error("Smoke focus-escape-and-select-root scenario could not find a root node.");
  }

  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Escape"
    })
  );

  await waitForSmokeState(
    () => document.documentElement?.getAttribute("nodely-browser-surface") === "canvas",
    "focus canvas from escape"
  );

  shell.graph.centerOnNode(rootNode.id);
  await nextAnimationFrame();
  await nextAnimationFrame();

  const selector = `.nodely-graph-node[data-node-id="${escapeAttributeValue(rootNode.id)}"]`;
  const nodeElement = document.querySelector(selector);

  if (!nodeElement) {
    throw new Error(`Smoke focus-escape-and-select-root scenario could not find ${selector}.`);
  }

  synthesizeMouseActivation(nodeElement);

  await waitForSmokeState((state) => {
    const selectedNode =
      state.workspace?.nodes?.find?.((node) => node.id === state.workspace?.selectedNodeId) ?? null;

    return (
      selectedNode?.id === rootNode.id &&
      selectedNode?.url === ROOT_SMOKE_URL &&
      document.documentElement?.getAttribute("nodely-browser-surface") === "page" &&
      window.gBrowser?.selectedTab?.linkedBrowser?.currentURI?.spec === ROOT_SMOKE_URL
    );
  }, "focus root selection from escape");
  await nextAnimationFrame();
  await nextAnimationFrame();
}

function nodeFullyVisibleWithin(container, element) {
  if (!container || !element) {
    return false;
  }

  const containerRect = container.getBoundingClientRect?.();
  const elementRect = element.getBoundingClientRect?.();

  if (!containerRect || !elementRect) {
    return false;
  }

  return (
    elementRect.left >= containerRect.left - 1 &&
    elementRect.right <= containerRect.right + 1
  );
}

function matchesSelectorSafe(element, selector) {
  if (!element?.matches) {
    return false;
  }

  try {
    return element.matches(selector);
  } catch {
    return false;
  }
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

function waitForSmokeState(predicate, description) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out waiting for ${description}.`));
    }, SMOKE_WAIT_TIMEOUT_MS);

    window.__nodelyTest
      .waitForState(predicate, description)
      .then((state) => {
        window.clearTimeout(timeoutId);
        resolve(state);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function waitForCondition(predicate, description) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const tick = () => {
      try {
        if (predicate()) {
          resolve(true);
          return;
        }
      } catch {}

      if (Date.now() - startedAt >= SMOKE_WAIT_TIMEOUT_MS) {
        reject(new Error(`Timed out waiting for ${description}.`));
        return;
      }

      window.setTimeout(tick, 100);
    };

    tick();
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
  } catch {
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

function dispatchSyntheticContextMenu(element) {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  element.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      button: 2,
      buttons: 2
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
    waitForBrowserDelayedStartup()
      .then(() => controller.initialize())
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
