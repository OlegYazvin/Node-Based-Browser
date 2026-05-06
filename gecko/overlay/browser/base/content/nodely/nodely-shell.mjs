import {
  buildPageFavoriteId,
  buildTreeFavoriteId,
  classifySiteCategory,
  deriveSubtreeTabBarModel,
  findNode,
  findOwningPageNode,
  findRoots,
  isArtifactNode,
  nodeDimensions,
  orderTreeNodesForTabs,
  summarizeTreeContents,
  treeDisplayTitle,
  treeHasInitializedPage
} from "./domain.mjs";
import {
  resolveChromeStorePageSupport,
  resolveCompatExtensionRecord
} from "./chrome-extension-compat.mjs";
import "./nodely-graph-surface.mjs";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const CONTEXTUAL_COMPOSER_WIDTH = 360;
const CONTEXTUAL_COMPOSER_HEIGHT = 72;
const CONTEXTUAL_COMPOSER_MARGIN = 16;
const CONTEXTUAL_COMPOSER_OFFSET = 12;
const FLOATING_PANEL_MARGIN = 12;
const FLOATING_PANEL_GAP = 8;
const FLOATING_MENU_WIDTH = 192;
const CONTEXT_MENU_OPEN_GRACE_MS = 180;
const NATIVE_LOCATION_FOCUS_SELECTOR =
  "#urlbar-input, .urlbar-input-box, .urlbarView, #PopupAutoComplete, #PopupAutoCompleteRichResult";

function createIcon(paths, viewBox = "0 0 20 20") {
  return {
    viewBox,
    paths
  };
}

function iconStar(filled = false) {
  return createIcon([
    {
      d: "m10 2.8 2.25 4.56 5.03.73-3.64 3.55.86 5.01L10 14.37 5.5 16.65l.86-5.01L2.72 8.1l5.03-.73L10 2.8Z",
      fill: filled ? "currentColor" : "none",
      stroke: "currentColor",
      "stroke-width": "1.45",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconTree(filled = false) {
  return createIcon([
    {
      d: "M10 2.2 6.6 6h2.1L5 10h2.25L4.4 14h4.35V17h2.5v-3h4.35l-2.85-4H15L11.3 6h2.1L10 2.2Z",
      fill: filled ? "currentColor" : "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconExtension() {
  return createIcon([
    {
      d: "M8.45 3.4a1.55 1.55 0 1 1 3.1 0v1.05h1.95c.88 0 1.6.72 1.6 1.6V8h1.05a1.55 1.55 0 1 1 0 3.1H15.1v2.85c0 .88-.72 1.6-1.6 1.6h-2.85V14.5a1.55 1.55 0 1 0-3.1 0v1.05H6.05c-.88 0-1.6-.72-1.6-1.6V11.1H3.4a1.55 1.55 0 1 1 0-3.1h1.05V6.05c0-.88.72-1.6 1.6-1.6h2.4V3.4Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.3",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconDownload() {
  return createIcon([
    {
      d: "M10 3.2v8.5m0 0 3.2-3.2M10 11.7 6.8 8.5M3.4 14.7h13.2",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.55",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconUpload() {
  return createIcon([
    {
      d: "M10 16.8V8.3m0 0 3.2 3.2M10 8.3 6.8 11.5M3.4 5.3h13.2",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.55",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconShield() {
  return createIcon([
    {
      d: "M10 2.6 15.7 4.7v4.6c0 3.5-2 6-5.7 8.1-3.7-2.1-5.7-4.6-5.7-8.1V4.7L10 2.6Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.45",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconFind() {
  return createIcon([
    {
      d: "M8.7 3.1a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2Zm7.1 12.7-3.1-3.1",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.45",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconPrint() {
  return createIcon([
    {
      d: "M5.3 6.2V3.5h9.4v2.7M4.2 9h11.6A1.8 1.8 0 0 1 17.6 10.8v2.5H14.7v3.2H5.3v-3.2H2.4v-2.5A1.8 1.8 0 0 1 4.2 9Zm1.8 4.3h8m-8 2.1h6.4",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.4",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconFullscreen() {
  return createIcon([
    {
      d: "M3.6 7.4V3.6h3.8M16.4 7.4V3.6h-3.8M3.6 12.6v3.8h3.8M16.4 12.6v3.8h-3.8",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconBackToCanvas() {
  return createIcon([
    {
      d: "M7.6 4.2H14a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H7.6a2 2 0 0 1-2-2V6.2a2 2 0 0 1 2-2Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linejoin": "round"
    },
    {
      d: "M4.2 10h7.3m-3-2.9L5.6 10l2.9 2.9",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconNodeTabPlus() {
  return createIcon([
    {
      d: "M5.2 5.3v7.2m0 0c0 1.8 1.5 3.3 3.3 3.3h3.2m-6.5-3.3c0-1.8 1.5-3.3 3.3-3.3h3.2m-6.5-4.7A1.7 1.7 0 1 0 5.2 8a1.7 1.7 0 0 0 0-3.4Zm8.3 0A1.7 1.7 0 1 0 13.5 8a1.7 1.7 0 0 0 0-3.4Zm0 8A1.7 1.7 0 1 0 13.5 16a1.7 1.7 0 0 0 0-3.4Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    },
    {
      d: "M16.8 3.2v3.8m1.9-1.9H15",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linecap": "round"
    }
  ]);
}

function iconEdit() {
  return createIcon([
    {
      d: "M4.2 15.8 5 12.2 12.9 4.3a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1L7.8 15l-3.6.8Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    },
    {
      d: "M11.8 5.4 14.6 8.2",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linecap": "round"
    }
  ]);
}

function iconWarning() {
  return createIcon([
    {
      d: "m10 3.1 7 12.3H3l7-12.3Zm0 4.1v4.4m0 2.8h.01",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.45",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconClose() {
  return createIcon([
    {
      d: "M5.1 5.1 14.9 14.9M14.9 5.1 5.1 14.9",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.55",
      "stroke-linecap": "round"
    }
  ]);
}

function iconFolder() {
  return createIcon([
    {
      d: "M3.1 5.4h4.3l1.3 1.6h8.2v7.6a1.6 1.6 0 0 1-1.6 1.6H4.7a1.6 1.6 0 0 1-1.6-1.6V7a1.6 1.6 0 0 1 1.6-1.6Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconSeedling() {
  return createIcon([
    {
      d: "M10 17V9.2",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.45",
      "stroke-linecap": "round"
    },
    {
      d: "M9.8 11.1c-2.8.1-4.8-1.4-5.8-4.2 3.2-.7 5.6.3 6.7 2.8",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    },
    {
      d: "M10.2 8.9c2.8.1 4.8-1.3 5.8-4.1-3.2-.8-5.6.1-6.7 2.7",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconRootNode() {
  return createIcon([
    {
      d: "M6.5 7.2c.5-1.9 1.9-3.3 3.5-3.3s3 1.4 3.5 3.3",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.45",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    },
    {
      d: "M10 7.2v3.1M5.4 10.3h9.2",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.3",
      "stroke-linecap": "round"
    },
    {
      d: "M10 10.3 7.2 14.7M10 10.3 8.6 15.8M10 10.3V16.5M10 10.3 11.4 15.8M10 10.3 12.8 14.7",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.25",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

function iconParentNode() {
  return createIcon([
    {
      d: "M5.1 5.2h4.4m0 0v9.6m0-9.6h5.4",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    },
    {
      d: "M5.1 5.2h.01M9.5 14.8h.01M14.9 5.2h.01",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2.2",
      "stroke-linecap": "round"
    }
  ]);
}

function iconBranchDescendants() {
  return createIcon([
    {
      d: "M5.1 5.1v9.8m0-4.9h4.2m0 0V6.3m0 3.7V13.7m0-3.7h5.6",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    },
    {
      d: "M5.1 3.8h.01M9.3 5h.01M9.3 15h.01M14.9 10h.01",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2.2",
      "stroke-linecap": "round"
    }
  ]);
}

function iconSun() {
  return createIcon([
    {
      d: "M10 5.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35"
    },
    {
      d: "M10 2.5v1.7M10 15.8v1.7M17.5 10h-1.7M4.2 10H2.5M15.3 4.7l-1.2 1.2M5.9 14.1l-1.2 1.2M15.3 15.3l-1.2-1.2M5.9 5.9 4.7 4.7",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.35",
      "stroke-linecap": "round"
    }
  ]);
}

function iconMoon() {
  return createIcon([
    {
      d: "M12.7 2.9a6.9 6.9 0 1 0 4.4 10.7A7.5 7.5 0 0 1 12.7 2.9Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.4",
      "stroke-linejoin": "round"
    }
  ]);
}

export class NodelyShell extends HTMLElement {
  constructor() {
    super();
    this.controller = null;
    this.state = { workspace: null, favorites: [], chrome: null };
    this.composerOpen = false;
    this.composerAnchor = null;
    this.drawer = null;
    this.contextMenuState = null;
    this.contextMenuOpenedAt = 0;
    this.permissionsPanelOpen = false;
    this.findOpen = false;
    this.findQuery = "";
    this.printSheetOpen = false;
    this.inlineTreeRenameRootId = null;
    this.inlineTreeRenameValue = "";
    this.lastSelectedNodeId = null;
    this.treePreviewRootId = null;
    this.favoriteFolderComposerOpen = false;
    this.favoriteFolderDraft = "";
    this.composerDraft = "";
    this.addressDraft = "";
    this.composerSuggestions = [];
    this.addressSuggestions = [];
    this.layoutSyncFrame = null;
    this.tabStripTransitionFrame = null;
    this.tabStripTransitionResetTimer = null;
    this.lastChildDescendTransitionAt = 0;
    this.splitResizeState = null;
    this.splitWidthOverride = null;
    this.layoutObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
          this.scheduleLayoutSync();
        })
        : null;
    this.boundWindowKeydown = (event) => this.handleWindowKeydown(event);
    this.boundWindowFocusIn = (event) => this.handleWindowFocusIn(event);
    this.boundWindowClick = (event) => this.handleWindowClick(event);
    this.boundDocumentCommand = (event) => this.handleDocumentCommand(event);
    this.boundWindowResize = () => this.scheduleLayoutSync();
    this.boundSplitResizeMove = (event) => this.handleSplitResizeMove(event);
    this.boundSplitResizeUp = (event) => this.handleSplitResizeUp(event);
    this.boundStateChange = (event) => {
      this.state = event.detail;
      if (!this.splitResizeState) {
        this.splitWidthOverride = null;
      }
      this.render();
    };
  }

  connectedCallback() {
    if (this.built) {
      return;
    }

    this.built = true;
    this.className = "nodely-shell";
    this.replaceChildren();

    this.topbar = createHtmlElement(this.ownerDocument, "div", "nodely-shell__topbar");
    this.composer = createHtmlElement(this.ownerDocument, "div", "nodely-shell__composer");
    this.pagebar = createHtmlElement(this.ownerDocument, "div", "nodely-shell__pagebar");
    this.graph = createHtmlElement(this.ownerDocument, "nodely-graph-surface", "nodely-shell__graph");
    this.splitHandle = createHtmlElement(this.ownerDocument, "div", "nodely-shell__split-handle");
    this.artifactSurface = createHtmlElement(
      this.ownerDocument,
      "section",
      "nodely-shell__artifact-surface"
    );
    this.favoritesDrawer = createHtmlElement(
      this.ownerDocument,
      "aside",
      "nodely-shell__drawer nodely-shell__drawer--favorites"
    );
    this.downloadsDrawer = createHtmlElement(
      this.ownerDocument,
      "aside",
      "nodely-shell__drawer nodely-shell__drawer--downloads"
    );
    this.recoverDrawer = createHtmlElement(
      this.ownerDocument,
      "aside",
      "nodely-shell__drawer nodely-shell__drawer--recover"
    );
    this.extensionsDrawer = createHtmlElement(
      this.ownerDocument,
      "aside",
      "nodely-shell__drawer nodely-shell__drawer--extensions"
    );
    this.treesDrawer = createHtmlElement(
      this.ownerDocument,
      "aside",
      "nodely-shell__drawer nodely-shell__drawer--trees"
    );
    this.contextMenu = createHtmlElement(
      this.ownerDocument,
      "aside",
      "nodely-shell__menu"
    );
    this.promptStack = createHtmlElement(
      this.ownerDocument,
      "section",
      "nodely-shell__prompt-stack"
    );
    this.treePreviewDialog = createHtmlElement(
      this.ownerDocument,
      "section",
      "nodely-shell__tree-preview"
    );

    this.append(
      this.topbar,
      this.composer,
      this.pagebar,
      this.graph,
      this.splitHandle,
      this.artifactSurface,
      this.favoritesDrawer,
      this.downloadsDrawer,
      this.recoverDrawer,
      this.extensionsDrawer,
      this.treesDrawer,
      this.contextMenu,
      this.promptStack,
      this.treePreviewDialog
    );

    this.topbar.addEventListener("click", (event) => this.handleTopbarClick(event));
    this.topbar.addEventListener("change", (event) => this.handleTopbarChange(event));
    this.composer.addEventListener("click", (event) => this.handleComposerClick(event));
    this.composer.addEventListener("input", (event) => this.handleComposerInput(event));
    this.composer.addEventListener("submit", (event) => this.handleComposerSubmit(event));
    this.pagebar.addEventListener("click", (event) => this.handlePagebarClick(event));
    this.pagebar.addEventListener("contextmenu", (event) => this.handlePagebarContextMenu(event));
    this.pagebar.addEventListener("submit", (event) => this.handleAddressSubmit(event));
    this.pagebar.addEventListener("change", (event) => this.handlePagebarChange(event));
    this.pagebar.addEventListener("input", (event) => this.handlePagebarInput(event));
    this.pagebar.addEventListener("focusout", (event) => this.handlePagebarFocusOut(event));
    this.favoritesDrawer.addEventListener("click", (event) => this.handleFavoritesClick(event));
    this.favoritesDrawer.addEventListener("change", (event) => this.handleFavoritesChange(event));
    this.favoritesDrawer.addEventListener("input", (event) => this.handleFavoritesInput(event));
    this.favoritesDrawer.addEventListener("submit", (event) => this.handleFavoritesSubmit(event));
    this.downloadsDrawer.addEventListener("click", (event) => this.handleDownloadsClick(event));
    this.recoverDrawer.addEventListener("click", (event) => this.handleRecoverClick(event));
    this.extensionsDrawer.addEventListener("click", (event) => this.handleExtensionsClick(event));
    this.extensionsDrawer.addEventListener("change", (event) => this.handleExtensionsChange(event));
    this.treesDrawer.addEventListener("click", (event) => this.handleTreesClick(event));
    this.treesDrawer.addEventListener("focusout", (event) => this.handleTreesFocusOut(event));
    this.treesDrawer.addEventListener("submit", (event) => this.handleTreesSubmit(event));
    this.contextMenu.addEventListener("click", (event) => this.handleContextMenuClick(event));
    this.artifactSurface.addEventListener("click", (event) => this.handleArtifactSurfaceClick(event));
    this.promptStack.addEventListener("click", (event) => this.handlePromptStackClick(event));
    this.treePreviewDialog.addEventListener("click", (event) => this.handleTreePreviewClick(event));
    this.graph.addEventListener("nodely-select-node", (event) => {
      void this.openNodeFromGraph(event.detail.nodeId);
    });
    this.graph.addEventListener("nodely-node-moved", (event) => this.controller?.updateNodePosition(event.detail.nodeId, event.detail.position));
    this.graph.addEventListener("nodely-viewport-change", (event) => this.controller?.setViewport(event.detail.viewport));
    this.graph.addEventListener("nodely-open-composer", (event) => {
      this.openComposer(event.detail?.anchor ?? null);
    });
    this.graph.addEventListener("nodely-auto-organize", () => this.controller?.autoOrganize());
    this.graph.addEventListener("nodely-open-node-menu", (event) => {
      this.openContextMenu({
        kind: "node",
        nodeId: event.detail?.nodeId ?? null,
        anchor: event.detail?.anchor ?? null
      });
    });
    this.splitHandle.addEventListener("pointerdown", (event) => this.handleSplitResizeStart(event));
    window.addEventListener("keydown", this.boundWindowKeydown);
    window.addEventListener("focusin", this.boundWindowFocusIn, true);
    window.addEventListener("click", this.boundWindowClick);
    window.addEventListener("resize", this.boundWindowResize);
    this.ownerDocument?.addEventListener?.("command", this.boundDocumentCommand, true);
    this.layoutObserver?.observe(this.topbar);
    this.layoutObserver?.observe(this.composer);
    this.layoutObserver?.observe(this.pagebar);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.boundWindowKeydown);
    window.removeEventListener("focusin", this.boundWindowFocusIn, true);
    window.removeEventListener("click", this.boundWindowClick);
    window.removeEventListener("resize", this.boundWindowResize);
    this.ownerDocument?.removeEventListener?.("command", this.boundDocumentCommand, true);

    if (this.layoutSyncFrame != null) {
      window.cancelAnimationFrame(this.layoutSyncFrame);
      this.layoutSyncFrame = null;
    }

    window.removeEventListener("pointermove", this.boundSplitResizeMove);
    window.removeEventListener("pointerup", this.boundSplitResizeUp);
    this.layoutObserver?.disconnect();
  }

  setController(controller) {
    if (this.controller) {
      this.controller.removeEventListener("state-changed", this.boundStateChange);
    }

    this.controller = controller;

    if (controller) {
      controller.addEventListener("state-changed", this.boundStateChange);
      this.state = controller.getState();
      this.render();
    }
  }

  hasSelectedPageNode() {
    const selectedNode = findNode(this.state.workspace, this.state.workspace?.selectedNodeId);
    return Boolean(selectedNode && !isArtifactNode(selectedNode));
  }

  closeInlinePanels({ closeFind = true } = {}) {
    const hadOpenPanels = this.permissionsPanelOpen || this.printSheetOpen || this.findOpen;

    this.permissionsPanelOpen = false;
    this.printSheetOpen = false;

    if (this.findOpen && closeFind) {
      this.controller?.closeFind();
    }

    this.findOpen = false;
    return hadOpenPanels;
  }

  isContextualComposer(workspace = this.state.workspace) {
    return Boolean(this.composerOpen && this.composerAnchor && workspace?.nodes?.length);
  }

  openComposer(anchor = null) {
    this.drawer = null;
    this.closeContextMenu();
    this.closeInlinePanels();
    this.closeTreeRename();
    this.closeTreePreview();
    this.composerOpen = true;
    this.composerAnchor = anchor && this.state.workspace?.nodes?.length ? normalizeComposerAnchor(anchor) : null;
    this.render();
    this.composer.querySelector("input")?.focus();
  }

  closeComposer() {
    this.composerOpen = false;
    this.composerAnchor = null;
    this.composerSuggestions = [];
  }

  openTreeRename(rootId, currentTitle = "") {
    if (!rootId) {
      return;
    }

    this.drawer = null;
    this.closeContextMenu();
    this.closeInlinePanels();
    this.closeComposer();
    this.closeTreePreview();
    this.inlineTreeRenameRootId = rootId;
    this.inlineTreeRenameValue = currentTitle || "";
    this.render();
    this.pagebar.querySelector("input[name='tree-title']")?.focus();
    this.pagebar.querySelector("input[name='tree-title']")?.select?.();
  }

  closeTreeRename() {
    if (!this.inlineTreeRenameRootId) {
      return false;
    }

    this.inlineTreeRenameRootId = null;
    this.inlineTreeRenameValue = "";
    return true;
  }

  commitInlineTreeRename(rootId, title, { close = true } = {}) {
    if (!rootId) {
      return;
    }

    const normalizedTitle = String(title ?? "").trim();

    if (normalizedTitle) {
      this.controller?.renameTree(rootId, normalizedTitle);
    }

    if (close) {
      this.closeTreeRename();
      this.render();
    }
  }

  commitDrawerTreeRename(form) {
    if (!form?.dataset?.rootId) {
      return;
    }

    const input = form.querySelector("input[name='title']");
    const nextTitle = String(input?.value ?? "").trim();
    const previousTitle = String(input?.dataset?.initialValue ?? "").trim();

    if (!nextTitle || nextTitle === previousTitle) {
      return;
    }

    input.dataset.initialValue = nextTitle;
    input.title = nextTitle;
    this.controller?.renameTree(form.dataset.rootId, nextTitle);
  }

  resolveContextualRootPosition() {
    if (!this.isContextualComposer(this.state.workspace) || !this.composerAnchor || !this.graph?.worldFromClient) {
      return null;
    }

    const anchorWorldPoint = this.graph.worldFromClient(
      this.composerAnchor.clientX,
      this.composerAnchor.clientY
    );
    const dimensions = nodeDimensions({ kind: "page" });

    return {
      x: Math.round(anchorWorldPoint.x - dimensions.width / 2),
      y: Math.round(anchorWorldPoint.y - dimensions.height / 2)
    };
  }

  toggleDrawer(drawerName) {
    this.closeContextMenu();
    this.closeInlinePanels();
    this.closeTreeRename();
    this.closeTreePreview();
    this.drawer = this.drawer === drawerName ? null : drawerName;
    this.render();
  }

  openFindPanel() {
    if (!this.hasSelectedPageNode()) {
      return false;
    }

    this.drawer = null;
    this.closeContextMenu();
    this.permissionsPanelOpen = false;
    this.printSheetOpen = false;
    this.closeTreeRename();
    this.findOpen = true;
    this.findQuery = this.controller?.getFindQuery?.() ?? this.findQuery;
    this.render();
    this.pagebar.querySelector("input[name='find-query']")?.focus();
    return true;
  }

  openPrintPanel() {
    if (!this.hasSelectedPageNode()) {
      return false;
    }

    this.drawer = null;
    this.closeContextMenu();
    this.permissionsPanelOpen = false;
    this.closeTreeRename();

    if (this.findOpen) {
      this.controller?.closeFind();
    }

    this.findOpen = false;
    this.printSheetOpen = true;
    this.render();
    return true;
  }

  focusPreferredLocationInput() {
    const addressInput =
      this.addressInput ?? this.pagebar?.querySelector?.("input[name='address']") ?? null;

    if (addressInput && !this.pagebar?.hidden) {
      addressInput.focus();
      addressInput.select?.();
      return true;
    }

    if (!this.composerOpen) {
      this.openComposer();
      return true;
    }

    const composerInput =
      this.composerInput ?? this.composer?.querySelector?.("input[name='root-input']") ?? null;

    if (!composerInput) {
      return false;
    }

    composerInput.focus();
    composerInput.select?.();
    return true;
  }

  dismissNativeLocationOverlay({ refocus = false } = {}) {
    const documentRef = this.ownerDocument ?? globalThis.document ?? null;
    const windowRef = documentRef?.defaultView ?? globalThis.window ?? null;
    const nativeUrlbar = documentRef?.getElementById?.("urlbar") ?? null;
    const nativeUrlbarInput = documentRef?.getElementById?.("urlbar-input") ?? null;
    const nativeAutocomplete =
      documentRef?.getElementById?.("PopupAutoCompleteRichResult") ??
      documentRef?.getElementById?.("PopupAutoComplete") ??
      null;
    const activeElement = documentRef?.activeElement ?? null;
    const gURLBarRef = windowRef?.gURLBar ?? null;
    let dismissed = false;

    try {
      if (gURLBarRef?.view?.isOpen) {
        gURLBarRef.view.close();
        dismissed = true;
      }
    } catch {}

    try {
      if (matchesSelectorSafe(nativeUrlbar, ":popover-open")) {
        nativeUrlbar.hidePopover?.();
        dismissed = true;
      }
    } catch {}

    try {
      if (nativeAutocomplete?.state === "open") {
        nativeAutocomplete.hidePopup?.();
        dismissed = true;
      }
    } catch {}

    try {
      if (activeElement === nativeUrlbarInput || activeElement?.closest?.(NATIVE_LOCATION_FOCUS_SELECTOR)) {
        activeElement.blur?.();
        dismissed = true;
      }
    } catch {}

    try {
      if (gURLBarRef?.focused) {
        gURLBarRef.blur();
        dismissed = true;
      }
    } catch {}

    if (refocus) {
      this.focusPreferredLocationInput();
    }

    return dismissed;
  }

  async openNodeFromGraph(nodeId) {
    if (!nodeId || !this.controller) {
      return;
    }

    const dismissedUi = this.dismissTransientUi();

    if (dismissedUi) {
      this.render();
    }

    await this.controller.selectNode(nodeId);
  }

  toggleFocusSurface() {
    const workspace = this.state.workspace;

    if (workspace?.prefs.viewMode !== "focus") {
      return false;
    }

    if (workspace.prefs.surfaceMode === "canvas") {
      if (!workspace.selectedNodeId) {
        return false;
      }

      void this.controller?.selectNode?.(workspace.selectedNodeId);
      return true;
    }

    this.controller?.setSurfaceMode("canvas");
    return true;
  }

  dismissTransientUi() {
    if (this.closeContextMenu()) {
      this.render();
      return true;
    }

    if (this.drawer) {
      this.drawer = null;
      this.render();
      return true;
    }

    if (this.closeTreePreview()) {
      this.render();
      return true;
    }

    if (this.permissionsPanelOpen || this.findOpen || this.printSheetOpen) {
      this.closeInlinePanels();
      this.render();
      return true;
    }

    if (this.closeTreeRename()) {
      this.render();
      return true;
    }

    if (this.composerOpen) {
      this.closeComposer();
      this.render();
      return true;
    }

    return false;
  }

  openContextMenu({ kind, nodeId = null, nodeIds = [], anchor = null } = {}) {
    const normalizedAnchor = normalizeFloatingAnchor(anchor);

    if (!kind || !normalizedAnchor) {
      return;
    }

    this.drawer = null;
    this.closeInlinePanels();
    this.closeComposer();
    this.closeTreeRename();
    this.closeTreePreview();
    this.contextMenuState = {
      kind,
      nodeId,
      nodeIds: Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : [],
      anchor: normalizedAnchor
    };
    this.contextMenuOpenedAt = Date.now();
    this.render();
  }

  closeContextMenu() {
    if (!this.contextMenuState) {
      return false;
    }

    this.contextMenuState = null;
    this.contextMenuOpenedAt = 0;
    return true;
  }

  openTreePreview(rootId) {
    if (!rootId) {
      return;
    }

    this.closeContextMenu();
    this.closeInlinePanels();
    this.closeComposer();
    this.closeTreeRename();
    this.treePreviewRootId = rootId;
    this.render();
  }

  closeTreePreview() {
    if (!this.treePreviewRootId) {
      return false;
    }

    this.treePreviewRootId = null;
    return true;
  }

  render() {
    const workspace = this.state.workspace;
    const surfaceMode = workspace?.prefs.surfaceMode ?? "page";
    const selectedNode = findNode(workspace, workspace?.selectedNodeId);
    const selectedRoot = selectedNode ? findNode(workspace, selectedNode.rootId) : null;
    const selectedRootTitle = selectedRoot ? treeDisplayTitle(workspace, selectedRoot.id) : "Tree";
    const favoritePageNode = selectedNode && isArtifactNode(selectedNode) ? findOwningPageNode(workspace, selectedNode) : selectedNode;
    const activePageFavoriteId = favoritePageNode ? buildPageFavoriteId(workspace.id, favoritePageNode.id) : null;
    const activeFavoriteIds = new Set(this.state.favorites.map((favorite) => favorite.id));
    const showComposer = this.composerOpen || !workspace?.nodes?.length;
    const contextualComposer = this.isContextualComposer(workspace);

    if (this.lastSelectedNodeId !== (selectedNode?.id ?? null)) {
      this.permissionsPanelOpen = false;
      this.printSheetOpen = false;
      this.findOpen = false;
      this.findQuery = this.controller?.getFindQuery?.() ?? "";
      this.addressDraft = "";
      this.addressSuggestions = [];
      this.lastSelectedNodeId = selectedNode?.id ?? null;
    }

    if (!selectedNode || isArtifactNode(selectedNode)) {
      this.permissionsPanelOpen = false;
      this.printSheetOpen = false;
      this.findOpen = false;
    }

    if (this.inlineTreeRenameRootId && (!selectedRoot || this.inlineTreeRenameRootId !== selectedRoot.id)) {
      this.closeTreeRename();
    }

    if (this.treePreviewRootId && !findNode(workspace, this.treePreviewRootId)) {
      this.closeTreePreview();
    }

    if (!contextualComposer && this.composerAnchor) {
      this.composerAnchor = null;
    }

    this.renderTopbar(workspace);
    this.renderComposer(workspace, showComposer);
    this.renderPagebar(
      workspace,
      selectedNode,
      selectedRoot,
      selectedRootTitle,
      activeFavoriteIds,
      activePageFavoriteId
    );
    this.renderArtifactSurface(workspace, selectedNode);
    this.renderFavoritesDrawer();
    this.renderDownloadsDrawer(workspace);
    this.renderRecoverDrawer(workspace);
    this.renderExtensionsDrawer();
    this.renderTreesDrawer(workspace, activeFavoriteIds);
    this.renderTreePreview(workspace);
    this.renderContextMenu(workspace);
    this.renderPromptStack();

    const canvasVisible =
      !workspace?.nodes?.length ||
      surfaceMode === "canvas" ||
      workspace?.prefs.viewMode === "split";

    this.graph.hidden = !canvasVisible;
    this.splitHandle.hidden =
      !workspace?.nodes?.length ||
      workspace?.prefs.viewMode !== "split" ||
      surfaceMode === "canvas";
    this.graph.setWorkspace(workspace);
    this.graph.setSelectedNode(workspace?.selectedNodeId ?? null);
    this.syncDocumentLayout(workspace, selectedNode);
    this.syncFloatingLayout();
    this.scheduleLayoutSync();
  }

  renderTopbar(workspace) {
    this.topbar.replaceChildren();
    const artifactCount = (workspace?.nodes ?? []).filter((node) => isArtifactNode(node)).length;
    const selectedNode = findNode(workspace, workspace?.selectedNodeId);
    const hiddenActiveNode =
      workspace?.prefs.viewMode === "focus" &&
      workspace?.prefs.surfaceMode === "canvas" &&
      selectedNode &&
      !isArtifactNode(selectedNode)
        ? selectedNode
        : null;
    const sessionRecovery = this.state.chrome?.sessionRecovery ?? {
      closedTabs: [],
      closedWindows: [],
      lastSessionWindows: []
    };
    const recoveryCount =
      sessionRecovery.closedTabs.length +
      sessionRecovery.closedWindows.length +
      sessionRecovery.lastSessionWindows.length +
      (this.state.chrome?.crashedNodes?.length ?? 0);

    const brand = createHtmlElement(this.ownerDocument, "div", "nodely-shell__brand");
    const brandStrong = createHtmlElement(this.ownerDocument, "strong");
    brandStrong.textContent = "Nodely Browser";
    brand.append(brandStrong);

    const viewSegmented = createHtmlElement(this.ownerDocument, "div", "nodely-shell__segmented");
    viewSegmented.append(
      createActionButton(this.ownerDocument, "Split", workspace?.prefs.viewMode === "split" ? "is-active" : "", {
        action: "set-view",
        dataset: { view: "split" }
      }),
      createActionButton(this.ownerDocument, "Focus", workspace?.prefs.viewMode === "focus" ? "is-active" : "", {
        action: "set-view",
        dataset: { view: "focus" }
      })
    );
    brand.append(viewSegmented);

    if (hiddenActiveNode) {
      const returnButton = createHtmlElement(
        this.ownerDocument,
        "button",
        "nodely-shell__surface-toggle"
      );
      returnButton.type = "button";
      returnButton.dataset.action = "toggle-surface";
      returnButton.title = "Return to the active node (Ctrl/Cmd+\\)";
      returnButton.append(
        createFaviconChip(
          this.ownerDocument,
          hiddenActiveNode,
          "nodely-shell__tab-favicon nodely-shell__surface-toggle-favicon"
        )
      );

      const copy = createHtmlElement(this.ownerDocument, "span", "nodely-shell__surface-toggle-copy");
      const kicker = createHtmlElement(this.ownerDocument, "span", "nodely-shell__surface-toggle-kicker");
      kicker.textContent = "Hidden Node";
      const title = createHtmlElement(this.ownerDocument, "strong");
      title.textContent = hiddenActiveNode.title || hiddenActiveNode.url || "Untitled page";
      copy.append(kicker, title);

      const shortcut = createHtmlElement(
        this.ownerDocument,
        "span",
        "nodely-shell__surface-toggle-shortcut"
      );
      shortcut.textContent = "Ctrl/Cmd+\\";
      returnButton.append(copy, shortcut);
      brand.append(returnButton);
    }

    const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__topbar-actions");
    const primaryActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__topbar-primary");
    primaryActions.append(
      createActionButton(this.ownerDocument, "New Root", "nodely-shell__button", { action: "toggle-composer" }),
      createActionButton(this.ownerDocument, "Center", "nodely-shell__button", { action: "center-view" }),
      createActionButton(this.ownerDocument, "Trees", `nodely-shell__button${this.drawer === "trees" ? " is-active" : ""}`, {
        action: "toggle-drawer",
        dataset: { drawer: "trees" }
      }),
      createActionButton(this.ownerDocument, "Favorites", `nodely-shell__button${this.drawer === "favorites" ? " is-active" : ""}`, {
        action: "toggle-drawer",
        dataset: { drawer: "favorites" }
      }),
      createActionButton(this.ownerDocument, "Extensions", `nodely-shell__button nodely-shell__button--extensions${this.drawer === "extensions" ? " is-active" : ""}`, {
        action: "toggle-drawer",
        dataset: { drawer: "extensions" },
        icon: iconExtension()
      }),
      createCountButton(this.ownerDocument, "Downloads", artifactCount, `nodely-shell__button${this.drawer === "downloads" ? " is-active" : ""}`, {
        action: "toggle-drawer",
        dataset: { drawer: "downloads" }
      }),
      createCountButton(this.ownerDocument, "Recover", recoveryCount, `nodely-shell__button${this.drawer === "recover" ? " is-active" : ""}`, {
        action: "toggle-drawer",
        dataset: { drawer: "recover" }
      })
    );

    const themeSegmented = createHtmlElement(
      this.ownerDocument,
      "div",
      "nodely-shell__segmented nodely-shell__segmented--theme"
    );
    themeSegmented.append(
      createActionButton(this.ownerDocument, "", `nodely-shell__theme-toggle${workspace?.prefs.themeMode !== "dark" ? " is-active" : ""}`, {
        action: "set-theme",
        dataset: { theme: "light" },
        title: "Use light mode",
        icon: iconSun()
      }),
      createActionButton(this.ownerDocument, "", `nodely-shell__theme-toggle${workspace?.prefs.themeMode === "dark" ? " is-active" : ""}`, {
        action: "set-theme",
        dataset: { theme: "dark" },
        title: "Use dark mode",
        icon: iconMoon()
      })
    );
    const utilities = createHtmlElement(this.ownerDocument, "div", "nodely-shell__topbar-utilities");
    utilities.append(
      themeSegmented,
      createActionButton(this.ownerDocument, "", "nodely-shell__icon-button", {
        action: "toggle-fullscreen",
        title: "Toggle fullscreen",
        icon: iconFullscreen()
      })
    );

    const searchLabel = createHtmlElement(this.ownerDocument, "label", "nodely-shell__search");
    const searchText = createHtmlElement(this.ownerDocument, "span");
    searchText.textContent = "Default Search";
    const select = createHtmlElement(this.ownerDocument, "select");
    select.dataset.action = "search-provider";
    select.append(
      createOption(this.ownerDocument, "google", "Google", workspace?.prefs.searchProvider === "google"),
      createOption(this.ownerDocument, "wikipedia", "Wikipedia", workspace?.prefs.searchProvider === "wikipedia"),
      createOption(this.ownerDocument, "bing", "Bing", workspace?.prefs.searchProvider === "bing"),
      createOption(this.ownerDocument, "yahoo", "Yahoo", workspace?.prefs.searchProvider === "yahoo")
    );
    searchLabel.append(searchText, select);
    utilities.append(
      searchLabel,
      createActionButton(this.ownerDocument, "Exit", "nodely-shell__button nodely-shell__button--utility", {
        action: "quit-browser"
      })
    );

    actions.append(primaryActions, utilities);

    this.topbar.append(brand, actions);
  }

  renderComposer(workspace, showComposer) {
    const contextualComposer = this.isContextualComposer(workspace);
    this.composer.hidden = !showComposer;
    this.composer.toggleAttribute("data-visible", showComposer);
    this.composer.dataset.placement = contextualComposer ? "contextual" : "bar";
    this.composer.replaceChildren();

    if (!showComposer) {
      this.composer.style.removeProperty("left");
      this.composer.style.removeProperty("top");
      this.composer.style.removeProperty("width");
      return;
    }

    if (contextualComposer) {
      const composerPosition = resolveContextualComposerPosition(
        this.composerAnchor,
        this.ownerDocument?.defaultView ?? window,
        Math.round(this.topbar?.getBoundingClientRect?.().height ?? 52)
      );
      this.composer.style.left = `${composerPosition.left}px`;
      this.composer.style.top = `${composerPosition.top}px`;
      this.composer.style.width = `${composerPosition.width}px`;
    } else {
      this.composer.style.removeProperty("left");
      this.composer.style.removeProperty("top");
      this.composer.style.removeProperty("width");
    }

    const stack = createHtmlElement(this.ownerDocument, "div", "nodely-shell__combo-stack");
    const form = createHtmlElement(this.ownerDocument, "form", "nodely-shell__composer-form");
    const input = createHtmlElement(this.ownerDocument, "input", "nodely-shell__input");
    input.name = "root-input";
    input.value = this.composerDraft;
    input.setAttribute("placeholder", "Enter a URL or search term for a new root");
    input.setAttribute("autocomplete", "off");
    const button = createActionButton(this.ownerDocument, "Open Root", "nodely-shell__primary", { type: "submit" });
    form.append(input, button);
    this.composerInput = input;
    this.composerSuggestionsPanel = createHtmlElement(
      this.ownerDocument,
      "div",
      "nodely-shell__combo-suggestions"
    );
    this.composerSuggestionsPanel.hidden = true;
    stack.append(form, this.composerSuggestionsPanel);
    this.composer.append(stack);
    if (!this.composerDraft.trim()) {
      this.composerSuggestions = [];
    }
    this.refreshSuggestionPanel("composer");
  }

  renderPagebar(
    workspace,
    selectedNode,
    selectedRoot,
    selectedRootTitle,
    activeFavoriteIds,
    activePageFavoriteId
  ) {
    const previousTabStripSnapshot = this.captureTabStripSnapshot();
    this.pagebar.hidden = !selectedNode || workspace?.prefs.surfaceMode === "canvas";
    this.pagebar.replaceChildren();
    this.addressInput = null;
    this.addressSuggestionsPanel = null;

    if (!selectedNode || workspace?.prefs.surfaceMode === "canvas") {
      return;
    }

    const pageActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__page-actions");
    const pageActionsHeader = createHtmlElement(this.ownerDocument, "div", "nodely-shell__page-actions-header");
    const treeCounts = selectedRoot ? summarizeTreeContents(workspace, selectedRoot.id) : { pageCount: 0, artifactCount: 0 };
    const activeTabNodeId = isArtifactNode(selectedNode) ? findOwningPageNode(workspace, selectedNode)?.id ?? null : selectedNode.id;
    const isFocusView = workspace.prefs.viewMode === "focus";
    const compatExtensionsState = this.state.chrome?.compatExtensions ?? {
      experimentalMode: false,
      extensions: [],
      busyExtensionId: null,
      busyAction: null,
      checkingUpdates: false,
      lastActionError: null
    };
    const chromeStorePage = !isArtifactNode(selectedNode)
      ? resolveChromeStorePageSupport(selectedNode.url)
      : null;
    const selectedNodeActions = createHtmlElement(
      this.ownerDocument,
      "div",
      "nodely-shell__inline-actions nodely-shell__pagebar-actions"
    );

    if (isFocusView) {
      const closeSurfaceTitle = "Back to canvas (Esc). Toggle surfaces with Ctrl/Cmd+\\";
      const closeSurfaceButton = createActionButton(
        this.ownerDocument,
        "Canvas",
        "nodely-shell__button nodely-shell__surface-close",
        {
          action: "set-surface",
          dataset: { surface: "canvas" },
          title: closeSurfaceTitle,
          icon: iconBackToCanvas()
        }
      );
      selectedNodeActions.append(closeSurfaceButton);
    }

    if (isArtifactNode(selectedNode)) {
      const artifactBar = createHtmlElement(this.ownerDocument, "div", "nodely-shell__artifact-bar");
      const artifactSummary = createHtmlElement(this.ownerDocument, "div", "nodely-shell__artifact-summary");
      const artifactGlyph = createHtmlElement(this.ownerDocument, "span", "nodely-shell__artifact-glyph");
      appendSvgIcon(
        this.ownerDocument,
        artifactGlyph,
        selectedNode.kind === "upload" ? iconUpload() : iconDownload()
      );
      const artifactCopy = createHtmlElement(this.ownerDocument, "div");
      const artifactTitle = createHtmlElement(this.ownerDocument, "strong");
      artifactTitle.textContent = selectedNode.title || "Captured file";
      const artifactMeta = createHtmlElement(this.ownerDocument, "span");
      artifactMeta.textContent = selectedNode.kind === "upload" ? "Upload provenance" : "Download provenance";
      artifactCopy.append(artifactTitle, artifactMeta);
      artifactSummary.append(artifactGlyph, artifactCopy);

      const artifactActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__artifact-actions");
      artifactActions.append(
        createActionButton(this.ownerDocument, "Open File", "nodely-shell__drawer-pill", {
          action: "open-artifact-file",
          disabled: !selectedNode.artifact?.filePath
        }),
        createActionButton(this.ownerDocument, "Reveal", "nodely-shell__drawer-pill", {
          action: "reveal-artifact-file",
          disabled: !selectedNode.artifact?.filePath
        }),
        createActionButton(this.ownerDocument, "Source Page", "nodely-shell__drawer-pill", {
          action: "show-artifact-source"
        })
      );

      artifactBar.append(artifactSummary, artifactActions);
      pageActionsHeader.append(artifactBar);
      if (selectedNodeActions.childElementCount) {
        pageActionsHeader.append(selectedNodeActions);
      }
      pageActions.append(pageActionsHeader);
    } else {
      const surfaceMain = createHtmlElement(this.ownerDocument, "div", "nodely-shell__page-surface-main");
      const navGroup = createHtmlElement(this.ownerDocument, "div", "nodely-shell__nav-group");
      navGroup.append(
        createActionButton(this.ownerDocument, "‹", "nodely-shell__icon-button", {
          action: "page-command",
          dataset: { command: "back" },
          title: "Back"
        }),
        createActionButton(this.ownerDocument, "›", "nodely-shell__icon-button", {
          action: "page-command",
          dataset: { command: "forward" },
          title: "Forward"
        }),
        createActionButton(this.ownerDocument, "↻", "nodely-shell__icon-button", {
          action: "page-command",
          dataset: { command: "reload" },
          title: "Reload"
        })
      );

      const addressStack = createHtmlElement(this.ownerDocument, "div", "nodely-shell__combo-stack nodely-shell__address-stack");
      const addressForm = createHtmlElement(this.ownerDocument, "form", "nodely-shell__address-form");
      const addressInput = createHtmlElement(this.ownerDocument, "input", "nodely-shell__input nodely-shell__address-input");
      addressInput.name = "address";
      addressInput.value = this.addressDraft || selectedNode.url || "";
      addressInput.setAttribute("placeholder", "Enter a URL or search term");
      addressInput.setAttribute("autocomplete", "off");

      const favoritePageButton = createActionButton(this.ownerDocument, "", `nodely-shell__icon-button${activeFavoriteIds.has(activePageFavoriteId) ? " is-active" : ""}`, {
        action: "toggle-page-favorite",
        title: "Favorite page",
        icon: iconStar(activeFavoriteIds.has(activePageFavoriteId))
      });
      const permissionsButton = createActionButton(
        this.ownerDocument,
        "",
        `nodely-shell__icon-button nodely-shell__permissions-button${selectedNode.permissions?.activeCount ? " has-count" : ""}`,
        {
          action: "toggle-permissions-panel",
          title: permissionSummaryLabel(selectedNode.permissions),
          icon: iconShield()
        }
      );
      const findButton = createActionButton(this.ownerDocument, "", `nodely-shell__icon-button${this.findOpen ? " is-active" : ""}`, {
        action: "toggle-find",
        title: "Find in page",
        icon: iconFind()
      });
      const printButton = createActionButton(this.ownerDocument, "", `nodely-shell__icon-button${this.printSheetOpen ? " is-active" : ""}`, {
        action: "toggle-print",
        title: "Print page",
        icon: iconPrint()
      });
      if (selectedNode.permissions?.activeCount) {
        const count = createHtmlElement(this.ownerDocument, "span", "nodely-shell__icon-count");
        count.textContent = String(selectedNode.permissions.activeCount);
        permissionsButton.append(count);
      }

      addressForm.append(
        addressInput,
        favoritePageButton,
        permissionsButton,
        findButton,
        printButton
      );
      this.addressInput = addressInput;
      this.addressSuggestionsPanel = createHtmlElement(
        this.ownerDocument,
        "div",
        "nodely-shell__combo-suggestions nodely-shell__combo-suggestions--pagebar"
      );
      this.addressSuggestionsPanel.hidden = true;
      addressStack.append(addressForm, this.addressSuggestionsPanel);
      surfaceMain.append(navGroup, addressStack);
      pageActionsHeader.append(surfaceMain);
      if (selectedNodeActions.childElementCount) {
        pageActionsHeader.append(selectedNodeActions);
      }
      pageActions.append(pageActionsHeader);
      if (!this.addressDraft.trim()) {
        this.addressSuggestions = [];
      }
      this.refreshSuggestionPanel("address");

      if (this.permissionsPanelOpen) {
        const permissionsPanel = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-panel");
        const heading = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-panel-heading");
        const headingStrong = createHtmlElement(this.ownerDocument, "strong");
        headingStrong.textContent = "Site Permissions";
        const headingSpan = createHtmlElement(this.ownerDocument, "span");
        headingSpan.textContent = permissionSummaryLabel(selectedNode.permissions);
        heading.append(headingStrong, headingSpan);

        const chips = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-chips");
        const labels = selectedNode.permissions?.labels?.length
          ? selectedNode.permissions.labels
          : ["No active site permissions"];
        labels.forEach((label) => {
          const chip = createHtmlElement(this.ownerDocument, "span", "nodely-shell__inline-chip");
          chip.textContent = label;
          chips.append(chip);
        });

        const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-actions");
        actions.append(
          createActionButton(this.ownerDocument, "Manage In Gecko", "nodely-shell__drawer-pill", {
            action: "open-native-permissions"
          }),
          createActionButton(this.ownerDocument, "Close", "nodely-shell__drawer-pill", {
            action: "toggle-permissions-panel"
          })
        );

        permissionsPanel.append(heading, chips, actions);
        pageActions.append(permissionsPanel);
      }

      if (this.findOpen) {
        const findPanel = createHtmlElement(this.ownerDocument, "form", "nodely-shell__inline-panel nodely-shell__find-form");
        const findInput = createHtmlElement(this.ownerDocument, "input", "nodely-shell__input nodely-shell__find-input");
        findInput.name = "find-query";
        findInput.value = this.findQuery;
        findInput.setAttribute("placeholder", "Find in page");
        findInput.setAttribute("autocomplete", "off");
        const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-actions");
        actions.append(
          createActionButton(this.ownerDocument, "Prev", "nodely-shell__drawer-pill", {
            action: "find-prev"
          }),
          createActionButton(this.ownerDocument, "Next", "nodely-shell__drawer-pill", {
            action: "find-next"
          }),
          createActionButton(this.ownerDocument, "Done", "nodely-shell__drawer-pill", {
            action: "close-find"
          })
        );
        findPanel.append(findInput, actions);
        pageActions.append(findPanel);
      }

      if (this.printSheetOpen) {
        const printPanel = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-panel");
        const heading = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-panel-heading");
        const title = createHtmlElement(this.ownerDocument, "strong");
        title.textContent = "Print This Page";
        const subtitle = createHtmlElement(this.ownerDocument, "span");
        subtitle.textContent = selectedNode.title || selectedNode.url || "Current page";
        heading.append(title, subtitle);
        const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-actions");
        actions.append(
          createActionButton(this.ownerDocument, "Preview", "nodely-shell__drawer-pill", {
            action: "preview-print"
          }),
          createActionButton(this.ownerDocument, "Print", "nodely-shell__primary", {
            action: "print-page"
          }),
          createActionButton(this.ownerDocument, "Close", "nodely-shell__drawer-pill", {
            action: "toggle-print"
          })
        );
        printPanel.append(heading, actions);
        pageActions.append(printPanel);
      }

      if (chromeStorePage) {
        pageActions.append(
          this.renderChromeStoreCompatPanel(chromeStorePage, compatExtensionsState)
        );
      }
    }

    const treeStrip = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-strip");
    const treeHeader = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-header");
    const treeHeading = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-heading");
    const isInlineTreeRename = selectedRoot && this.inlineTreeRenameRootId === selectedRoot.id;
    const currentTreeFavorites = selectedRoot
      ? this.state.favorites
          .filter((favorite) => favorite.kind === "page" && favorite.rootId === selectedRoot.id)
          .sort(
            (left, right) =>
              (right.updatedAt ?? 0) - (left.updatedAt ?? 0) ||
              String(left.title ?? "").localeCompare(String(right.title ?? ""))
          )
      : [];

    if (isInlineTreeRename) {
      const renameForm = createHtmlElement(this.ownerDocument, "form", "nodely-shell__tree-rename-form");
      renameForm.dataset.rootId = selectedRoot.id;
      const renameInput = createHtmlElement(
        this.ownerDocument,
        "input",
        "nodely-shell__input nodely-shell__tree-rename-input"
      );
      renameInput.name = "tree-title";
      renameInput.value = this.inlineTreeRenameValue;
      renameInput.setAttribute("placeholder", "Rename this tree");
      renameInput.setAttribute("autocomplete", "off");
      const treeMeta = createHtmlElement(this.ownerDocument, "span", "nodely-shell__tree-meta");
      treeMeta.textContent = `${treeCounts.pageCount} pages${
        treeCounts.artifactCount ? ` • ${treeCounts.artifactCount} files` : ""
      }`;
      const renameActions = createHtmlElement(
        this.ownerDocument,
        "div",
        "nodely-shell__tree-rename-actions"
      );
      renameActions.append(
        createActionButton(this.ownerDocument, "", "nodely-shell__icon-button", {
          action: "cancel-tree-rename"
          ,
          title: "Cancel tree rename",
          icon: iconClose()
        })
      );
      renameForm.append(renameInput, treeMeta, renameActions);
      treeHeading.append(renameForm);
    } else {
      const treeTitle = createHtmlElement(this.ownerDocument, "strong");
      treeTitle.textContent = selectedRootTitle || "Tree";
      const treeMeta = createHtmlElement(this.ownerDocument, "span", "nodely-shell__tree-meta");
      treeMeta.textContent = `${treeCounts.pageCount} pages${
        treeCounts.artifactCount ? ` • ${treeCounts.artifactCount} files` : ""
      }`;
      treeHeading.append(treeTitle);
      if (selectedRoot) {
        treeHeading.append(
          createActionButton(this.ownerDocument, "", "nodely-shell__icon-button nodely-shell__tree-edit", {
            action: "start-tree-rename",
            dataset: {
              rootId: selectedRoot.id
            },
            title: "Rename tree",
            icon: iconEdit()
          })
        );
      }
      treeHeading.append(treeMeta);
      if (isFocusView) {
        treeHeading.append(
          createActionButton(this.ownerDocument, "", "nodely-shell__icon-button nodely-shell__tree-seed", {
            action: "toggle-composer",
            title: "Create a new root tree",
            icon: iconSeedling()
          })
        );
      }
    }

    treeHeader.append(treeHeading);

    if (currentTreeFavorites.length) {
      const favoritesRail = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-favorites");

      currentTreeFavorites.slice(0, 6).forEach((favorite) => {
      const favoriteButton = createActionButton(
          this.ownerDocument,
          favorite.title,
          "nodely-shell__tree-favorite-link",
          {
            action: "open-favorite",
            dataset: { favoriteId: favorite.id },
            title: favorite.title
          }
        );

        favoriteButton.prepend(
          createFaviconChip(
            this.ownerDocument,
            favorite,
            "nodely-shell__tab-favicon nodely-shell__tree-favorite-favicon"
          )
        );
        favoritesRail.append(favoriteButton);
      });

      if (currentTreeFavorites.length > 6) {
        const overflow = createHtmlElement(this.ownerDocument, "span", "nodely-shell__tree-favorites-overflow");
        overflow.textContent = `+${currentTreeFavorites.length - 6}`;
        favoritesRail.append(overflow);
      }

      treeHeader.append(favoritesRail);
    }

    const tabs = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tabs");
    tabs.dataset.rootId = selectedRoot?.id ?? "";
    if (selectedRoot) {
      const subtreeModel = deriveSubtreeTabBarModel(workspace, activeTabNodeId);
      const visibleTabs = [];
      const seenNodeIds = new Set();
      const ellipsisButton = subtreeModel.hiddenAncestors.length
        ? createActionButton(
            this.ownerDocument,
            "...",
            "nodely-shell__tab nodely-shell__tab--ellipsis",
            {
              action: "open-ancestry-menu",
              title: "Show hidden ancestors"
            }
          )
        : null;

      if (ellipsisButton) {
        ellipsisButton.classList.add("nodely-shell__tab-strip-item");
        ellipsisButton.dataset.tabKey = "ellipsis";
        ellipsisButton.dataset.tabRole = "ellipsis";
      }

      const appendVisibleTab = (node, role) => {
        if (!node || seenNodeIds.has(node.id)) {
          return;
        }

        visibleTabs.push({
          node,
          role,
          descendantPageCount: role === "child" ? subtreeModel.descendantPageCounts[node.id] ?? 0 : 0
        });
        seenNodeIds.add(node.id);
      };

      appendVisibleTab(subtreeModel.root, "root");
      if (subtreeModel.parent && subtreeModel.parent.id !== subtreeModel.root?.id) {
        appendVisibleTab(subtreeModel.parent, "parent");
      }
      appendVisibleTab(subtreeModel.current, "current");
      subtreeModel.children.forEach((node) => appendVisibleTab(node, "child"));

      for (const { node, role, descendantPageCount } of visibleTabs) {
        const isActiveTab = node.id === activeTabNodeId;
        const category = classifySiteCategory(node.url, node.title);
        const tabWrap = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tab-wrap");
        tabWrap.classList.add("nodely-shell__tab-strip-item");
        tabWrap.dataset.tabKey = `node:${node.id}`;
        tabWrap.dataset.tabRole = role;
        tabWrap.dataset.nodeId = node.id;
        const tab = createActionButton(
          this.ownerDocument,
          "",
          `nodely-shell__tab${isActiveTab ? " is-active nodely-shell__tab--current-page" : ""}${role === "root" ? " nodely-shell__tab--root-node" : ""}${role === "parent" ? " nodely-shell__tab--parent-node" : ""} nodely-shell__tab--${category}`,
          {
            action: "select-node",
            dataset: { nodeId: node.id, tabRole: role },
            title: role === "parent" ? `Parent node: ${node.title || "Untitled"}` : node.title || "Untitled"
          }
        );
        const favicon = createFaviconChip(this.ownerDocument, node, "nodely-shell__tab-favicon");
        const rootIcon =
          role === "root"
            ? (() => {
                const accent = createHtmlElement(
                  this.ownerDocument,
                  "span",
                  "nodely-shell__tab-role-icon nodely-shell__tab-root-icon"
                );
                accent.title = "Root node";
                appendSvgIcon(this.ownerDocument, accent, iconRootNode());
                return accent;
              })()
            : null;
        const parentIcon =
          role === "parent"
            ? (() => {
                const accent = createHtmlElement(
                  this.ownerDocument,
                  "span",
                  "nodely-shell__tab-role-icon nodely-shell__tab-parent-icon"
                );
                accent.title = "Parent node";
                appendSvgIcon(this.ownerDocument, accent, iconParentNode());
                return accent;
              })()
            : null;
        const copy = createHtmlElement(this.ownerDocument, "span", "nodely-shell__tab-copy");
        const label = createHtmlElement(this.ownerDocument, "strong");
        label.textContent = node.title || "Untitled";
        copy.append(label);
        tab.append(favicon);
        if (rootIcon) {
          tab.append(rootIcon);
        }
        if (parentIcon) {
          tab.append(parentIcon);
        }
        tab.append(copy);
        const trailing = createHtmlElement(this.ownerDocument, "span", "nodely-shell__tab-trailing");
        const closeTabButton = createHtmlElement(
          this.ownerDocument,
          "span",
          "nodely-shell__tab-close"
        );
        closeTabButton.dataset.action = "kill-tab-node";
        closeTabButton.dataset.nodeId = node.id;
        closeTabButton.setAttribute("role", "button");
        closeTabButton.setAttribute("tabindex", "-1");
        closeTabButton.setAttribute("title", `Close tab: ${node.title || "Untitled"}`);
        closeTabButton.setAttribute("aria-label", `Close tab: ${node.title || "Untitled"}`);
        appendSvgIcon(this.ownerDocument, closeTabButton, iconClose());
        trailing.append(closeTabButton);
        if (descendantPageCount > 0) {
          const badge = createHtmlElement(this.ownerDocument, "span", "nodely-shell__tab-badge");
          appendSvgIcon(this.ownerDocument, badge, iconBranchDescendants());
          const badgeCount = createHtmlElement(this.ownerDocument, "span");
          badgeCount.textContent = descendantPageCount > 99 ? "99+" : String(descendantPageCount);
          badge.append(badgeCount);
          badge.title = `${descendantPageCount} hidden descendant page${descendantPageCount === 1 ? "" : "s"}`;
          trailing.append(badge);
        }
        tab.append(trailing);
        if (isActiveTab) {
          const pageBridge = createHtmlElement(
            this.ownerDocument,
            "span",
            "nodely-shell__tab-page-bridge"
          );
          pageBridge.setAttribute("aria-hidden", "true");
          tab.append(pageBridge);
        }
        tabWrap.append(tab);
        tabs.append(tabWrap);

        if (role === "root" && ellipsisButton) {
          tabs.append(ellipsisButton);
        }

        const currentIsRoot = subtreeModel.current?.id === subtreeModel.root?.id;

        if (
          subtreeModel.children.length > 0 &&
          (role === "current" || (role === "root" && currentIsRoot))
        ) {
          const childDivider = createHtmlElement(
            this.ownerDocument,
            "div",
            "nodely-shell__tab-divider nodely-shell__tab-strip-item"
          );
          childDivider.dataset.tabKey = "children-divider";
          childDivider.dataset.tabRole = "children-divider";
          childDivider.setAttribute("aria-hidden", "true");
          childDivider.setAttribute("title", "Child nodes");
          const dividerGlyph = createHtmlElement(this.ownerDocument, "span", "nodely-shell__tab-divider-icon");
          appendSvgIcon(this.ownerDocument, dividerGlyph, iconBranchDescendants());
          const dividerLabel = createHtmlElement(this.ownerDocument, "span", "nodely-shell__tab-divider-label");
          dividerLabel.textContent = "Children";
          childDivider.append(dividerGlyph, dividerLabel);
          tabs.append(childDivider);
        }
      }
    }

    const createChildButton = createActionButton(
      this.ownerDocument,
      "",
      "nodely-shell__tab nodely-shell__tab--new-child",
      {
        action: "create-child-node",
        disabled: !activeTabNodeId,
        title: "Create a new child node from the active page",
        icon: iconNodeTabPlus()
      }
    );
    createChildButton.setAttribute("aria-label", "Create a new child node from the active page");
    tabs.append(createChildButton);

    treeStrip.append(treeHeader, tabs);
    this.pagebar.append(pageActions, treeStrip);
    this.animateTabStripTransition(previousTabStripSnapshot, tabs);

    if (workspace.prefs.viewMode === "focus" && workspace.prefs.showFocusHint !== false) {
      const focusHint = createHtmlElement(this.ownerDocument, "div", "nodely-shell__focus-hint");
      const hintCopy = createHtmlElement(this.ownerDocument, "div");
      const hintTitle = createHtmlElement(this.ownerDocument, "strong");
      hintTitle.textContent = "Focus Mode";
      const hintText = createHtmlElement(this.ownerDocument, "p");
      hintText.textContent =
        "The page now uses the full browser content area. Press Esc to return to the canvas, and Ctrl/Cmd+\\ to toggle between the canvas and the active node.";
      hintCopy.append(hintTitle, hintText);
      focusHint.append(
        hintCopy,
        createActionButton(this.ownerDocument, "×", "nodely-shell__icon-button", {
          action: "hide-focus-hint"
        })
      );
      this.pagebar.append(focusHint);
    }
  }

  captureTabStripSnapshot() {
    const tabs = this.pagebar?.querySelector?.(".nodely-shell__tabs");

    if (!tabs) {
      return null;
    }

    const items = Array.from(tabs.querySelectorAll(".nodely-shell__tab-strip-item[data-tab-key]"));

    if (!items.length) {
      return null;
    }

    return {
      rootId: tabs.dataset.rootId ?? "",
      items: items.map((item) => ({
        key: item.dataset.tabKey ?? "",
        role: item.dataset.tabRole ?? "",
        nodeId:
          item.dataset.nodeId ??
          item.querySelector(".nodely-shell__tab[data-node-id]")?.dataset?.nodeId ??
          "",
        rect: item.getBoundingClientRect(),
        clone: item.cloneNode(true)
      }))
    };
  }

  animateTabStripTransition(previousSnapshot, tabs) {
    if (this.tabStripTransitionFrame != null) {
      window.cancelAnimationFrame(this.tabStripTransitionFrame);
      this.tabStripTransitionFrame = null;
    }

    if (this.tabStripTransitionResetTimer != null) {
      clearTimeout(this.tabStripTransitionResetTimer);
      this.tabStripTransitionResetTimer = null;
    }

    const currentItems = Array.from(tabs.querySelectorAll(".nodely-shell__tab-strip-item[data-tab-key]"));

    if (!currentItems.length) {
      tabs.dataset.transitionMode = "static";
      tabs.dataset.transitionProfile = "static";
      return;
    }

    const shouldAnimate =
      previousSnapshot &&
      previousSnapshot.rootId &&
      previousSnapshot.rootId === (tabs.dataset.rootId ?? "");

    tabs.dataset.transitionMode = shouldAnimate ? "animated" : "static";

    if (!shouldAnimate) {
      tabs.dataset.transitionProfile = "static";
      return;
    }

    const currentItemMeta = currentItems.map((item) => ({
      key: item.dataset.tabKey ?? "",
      role: item.dataset.tabRole ?? "",
      nodeId:
        item.dataset.nodeId ??
        item.querySelector(".nodely-shell__tab[data-node-id]")?.dataset?.nodeId ??
        "",
      item
    }));
    const previousCurrentNodeId =
      previousSnapshot.items.find((item) => item.role === "current")?.nodeId ?? "";
    const nextCurrentNodeId =
      currentItemMeta.find((entry) => entry.role === "current")?.nodeId ?? "";
    const nextParentNodeId =
      currentItemMeta.find((entry) => entry.role === "parent")?.nodeId ?? "";
    const descendingIntoChild = Boolean(
      previousCurrentNodeId &&
      nextCurrentNodeId &&
      nextParentNodeId &&
      previousCurrentNodeId === nextParentNodeId &&
      nextCurrentNodeId !== previousCurrentNodeId
    );
    tabs.dataset.transitionProfile = descendingIntoChild ? "descend-child" : "default";
    if (descendingIntoChild) {
      this.lastChildDescendTransitionAt = Date.now();
    }

    const previousItems = new Map(previousSnapshot.items.map((item) => [item.key, item]));
    const nextItems = new Map(currentItems.map((item) => [item.dataset.tabKey ?? "", item]));

    this.tabStripTransitionFrame = window.requestAnimationFrame(() => {
      this.tabStripTransitionFrame = null;
      const tabsRect = tabs.getBoundingClientRect();
      const ghosts = [];

      currentItems.forEach((item) => {
        const key = item.dataset.tabKey ?? "";
        const role = item.dataset.tabRole ?? "";
        const previous = previousItems.get(key);
        item.style.transition = "none";

        if (previous) {
          const nextRect = item.getBoundingClientRect();
          const deltaX = previous.rect.left - nextRect.left;
          const deltaY = previous.rect.top - nextRect.top;
          item.style.transform =
            Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5
              ? `translate(${deltaX}px, ${deltaY}px)`
              : "";
          item.style.opacity = "";
        } else {
          const enterShift = role === "child" ? 18 : role === "children-divider" ? 10 : -12;
          item.style.transform = `translate(${enterShift}px, 0)`;
          item.style.opacity = "0";
        }
      });

      previousSnapshot.items.forEach((previous) => {
        if (nextItems.has(previous.key)) {
          return;
        }

        const ghost = previous.clone;
        ghost.classList.add("nodely-shell__tab-strip-ghost");
        ghost.style.left = `${previous.rect.left - tabsRect.left}px`;
        ghost.style.top = `${previous.rect.top - tabsRect.top}px`;
        ghost.style.width = `${previous.rect.width}px`;
        ghost.style.height = `${previous.rect.height}px`;
        ghost.style.opacity = "1";
        ghost.style.transform = "translate(0, 0)";
        tabs.append(ghost);
        ghosts.push({ ghost, role: previous.role });
      });

      void tabs.getBoundingClientRect();

      const transition =
        "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease";

      currentItems.forEach((item) => {
        item.style.transition = transition;
        item.style.transform = "";
        item.style.opacity = "";
      });

      ghosts.forEach(({ ghost, role }) => {
        const exitShiftX =
          descendingIntoChild && role === "child"
            ? 0
            : role === "child"
              ? 18
              : role === "children-divider"
                ? 10
                : -18;
        const exitShiftY = descendingIntoChild && role === "child" ? 18 : 0;
        ghost.style.transition = transition;
        ghost.style.transform = `translate(${exitShiftX}px, ${exitShiftY}px)`;
        ghost.style.opacity = "0";
      });

      this.tabStripTransitionResetTimer = setTimeout(() => {
        currentItems.forEach((item) => {
          item.style.transition = "";
          item.style.transform = "";
          item.style.opacity = "";
        });
        ghosts.forEach(({ ghost }) => ghost.remove());
        this.tabStripTransitionResetTimer = null;
      }, 360);
    });
  }

  renderArtifactSurface(workspace, selectedNode) {
    const isArtifactSelection = Boolean(
      selectedNode &&
      isArtifactNode(selectedNode) &&
      workspace?.prefs.surfaceMode !== "canvas"
    );
    this.artifactSurface.hidden = !isArtifactSelection;
    this.artifactSurface.replaceChildren();

    if (!isArtifactSelection) {
      return;
    }

    const artifact = selectedNode.artifact ?? {};
    const parentPage = findOwningPageNode(workspace, selectedNode);
    const card = createHtmlElement(this.ownerDocument, "div", "nodely-shell__artifact-card");
    const heading = createHtmlElement(this.ownerDocument, "div", "nodely-shell__artifact-card-heading");
    const badge = createHtmlElement(this.ownerDocument, "span", "nodely-shell__artifact-card-badge");
    appendSvgIcon(
      this.ownerDocument,
      badge,
      selectedNode.kind === "upload" ? iconUpload() : iconDownload()
    );
    badge.append(` ${selectedNode.kind === "upload" ? "Upload" : "Download"}`);
    const titleBlock = createHtmlElement(this.ownerDocument, "div");
    const title = createHtmlElement(this.ownerDocument, "strong");
    title.textContent = selectedNode.title || "Captured file";
    const subtitle = createHtmlElement(this.ownerDocument, "span");
    subtitle.textContent = artifactStatusCopy(selectedNode);
    titleBlock.append(title, subtitle);
    heading.append(badge, titleBlock);

    const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__artifact-card-actions");
    actions.append(
      createActionButton(this.ownerDocument, "Open File", "nodely-shell__primary", {
        action: "open-artifact-file",
        disabled: !artifact.filePath
      }),
      createActionButton(this.ownerDocument, "Reveal In Folder", "nodely-shell__button", {
        action: "reveal-artifact-file",
        disabled: !artifact.filePath
      }),
      createActionButton(this.ownerDocument, parentPage ? "Open Source Page" : "Source Missing", "nodely-shell__button", {
        action: "show-artifact-source",
        disabled: !parentPage
      }),
      createActionButton(this.ownerDocument, "Kill Node", "nodely-shell__drawer-pill is-danger", {
        action: "kill-node",
        dataset: { nodeId: selectedNode.id }
      })
    );

    const details = createHtmlElement(this.ownerDocument, "dl", "nodely-shell__artifact-details");
    appendDefinitionRow(this.ownerDocument, details, "Path", artifact.filePath || "Waiting for a local path");
    appendDefinitionRow(this.ownerDocument, details, "Source Page", parentPage?.title || parentPage?.url || "Unknown");
    appendDefinitionRow(this.ownerDocument, details, "Transfer URL", artifact.sourceUrl || artifact.referrerUrl || "Unavailable");
    appendDefinitionRow(this.ownerDocument, details, "Type", artifact.mimeType || "Unknown");
    appendDefinitionRow(this.ownerDocument, details, "Size", formatBytes(artifact.totalBytes));
    if (artifact.inputLabel) {
      appendDefinitionRow(this.ownerDocument, details, "Input", artifact.inputLabel);
    }

    card.append(heading, actions, details);
    this.artifactSurface.append(card);
  }

  renderFavoritesDrawer() {
    this.favoritesDrawer.hidden = this.drawer !== "favorites";
    this.favoritesDrawer.replaceChildren();

    const header = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-header");
    const title = createHtmlElement(this.ownerDocument, "strong");
    title.textContent = "Favorites";
    const headerActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-header-actions");
    headerActions.append(
      createActionButton(this.ownerDocument, "New Folder", "nodely-shell__drawer-pill", {
        action: "start-favorite-folder"
      })
    );
    header.append(title, headerActions);

    const body = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-body");
    const folderEntries = favoriteFolders(this.state.favorites);
    const bookmarkEntries = this.state.favorites.filter((favorite) => favorite.kind !== "folder");

    if (this.favoriteFolderComposerOpen) {
      const createForm = createHtmlElement(this.ownerDocument, "form", "nodely-shell__drawer-folder-form");
      const input = createHtmlElement(this.ownerDocument, "input", "nodely-shell__drawer-input");
      input.name = "folder-title";
      input.value = this.favoriteFolderDraft;
      input.setAttribute("placeholder", "New bookmark folder");
      const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-action-row");
      actions.append(
        createActionButton(this.ownerDocument, "Create", "nodely-shell__primary", { type: "submit" }),
        createActionButton(this.ownerDocument, "", "nodely-shell__icon-button", {
          action: "cancel-favorite-folder",
          title: "Cancel folder creation",
          icon: iconClose()
        })
      );
      createForm.append(input, actions);
      body.append(createForm);
    }

    const renderFavoriteSection = (sectionTitle, favorites, folder = null) => {
      if (!favorites.length && !folder) {
        return;
      }

      const section = createHtmlElement(this.ownerDocument, "section", "nodely-shell__drawer-section");

      if (folder) {
        const folderHeader = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-folder-header");
        const folderLabel = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-folder-label");
        appendSvgIcon(this.ownerDocument, folderLabel, iconFolder());
        const folderTitle = createHtmlElement(this.ownerDocument, "strong");
        folderTitle.textContent = folder.title || "Folder";
        const folderCount = createHtmlElement(this.ownerDocument, "span", "nodely-shell__drawer-folder-count");
        folderCount.textContent = `${favorites.length}`;
        folderLabel.append(folderTitle, folderCount);
        const folderActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-action-row");
        folderActions.append(
          createActionButton(this.ownerDocument, "", "nodely-shell__icon-button nodely-shell__icon-button--danger", {
            action: "remove-favorite",
            dataset: { favoriteId: folder.id },
            title: `Delete folder: ${folder.title || "Folder"}`,
            icon: iconClose()
          })
        );
        folderHeader.append(folderLabel, folderActions);
        section.append(folderHeader);
      } else if (sectionTitle) {
        const heading = createHtmlElement(this.ownerDocument, "strong", "nodely-shell__drawer-section-title");
        heading.textContent = sectionTitle;
        section.append(heading);
      }

      favorites.forEach((favorite) => {
        const row = createHtmlElement(
          this.ownerDocument,
          "div",
          `nodely-shell__drawer-row nodely-shell__drawer-row--${favorite.category ?? "general"}`
        );
        const link = createActionButton(this.ownerDocument, "", "nodely-shell__drawer-link", {
          action: "open-favorite",
          dataset: { favoriteId: favorite.id },
          title: favorite.title
        });
        const strong = createHtmlElement(this.ownerDocument, "strong");
        strong.textContent = favorite.title;
        const span = createHtmlElement(this.ownerDocument, "span");
        span.textContent = favorite.kind === "tree" ? "Tree" : favorite.url || "Page";
        link.append(strong, span);

        const controls = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-action-row");
        const folderSelect = createHtmlElement(this.ownerDocument, "select", "nodely-shell__drawer-folder-select");
        folderSelect.dataset.action = "move-favorite-folder";
        folderSelect.dataset.favoriteId = favorite.id;
        folderSelect.append(createOption(this.ownerDocument, "", "Unfiled", !favorite.folderId));
        folderEntries.forEach((entry) => {
          folderSelect.append(
            createOption(this.ownerDocument, entry.id, entry.title || "Folder", favorite.folderId === entry.id)
          );
        });
        controls.append(
          folderSelect,
          createActionButton(
            this.ownerDocument,
            "",
            "nodely-shell__icon-button nodely-shell__icon-button--danger",
            {
              action: "remove-favorite",
              dataset: { favoriteId: favorite.id },
              title: `Remove bookmark: ${favorite.title}`,
              icon: iconClose()
            }
          )
        );
        row.append(link, controls);
        section.append(row);
      });

      body.append(section);
    };

    const unfiledFavorites = bookmarkEntries.filter((favorite) => !favorite.folderId);

    if (folderEntries.length || unfiledFavorites.length) {
      renderFavoriteSection(folderEntries.length ? "Unfiled" : "", unfiledFavorites);
      folderEntries.forEach((folder) => {
        renderFavoriteSection(
          "",
          bookmarkEntries.filter((favorite) => favorite.folderId === folder.id),
          folder
        );
      });
    } else {
      const empty = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-empty");
      empty.textContent = "No favorites yet.";
      body.append(empty);
    }

    this.favoritesDrawer.append(header, body);
  }

  renderDownloadsDrawer(workspace) {
    this.downloadsDrawer.hidden = this.drawer !== "downloads";
    this.downloadsDrawer.replaceChildren();

    const header = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-header");
    const title = createHtmlElement(this.ownerDocument, "strong");
    title.textContent = "Downloads & Uploads";
    header.append(title);

    const body = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-body");
    const artifacts = (workspace?.nodes ?? [])
      .filter((node) => isArtifactNode(node))
      .sort(
        (left, right) =>
          (right.artifact?.recordedAt ?? 0) - (left.artifact?.recordedAt ?? 0) ||
          right.updatedAt - left.updatedAt
      );

    if (artifacts.length) {
      for (const artifact of artifacts) {
        const category = classifySiteCategory(
          artifact.artifact?.pageUrl ??
            artifact.artifact?.referrerUrl ??
            artifact.artifact?.sourceUrl ??
            null
        );
        const row = createHtmlElement(this.ownerDocument, "div", `nodely-shell__drawer-row nodely-shell__drawer-row--${category}`);
        const copy = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-link");
        const strong = createHtmlElement(this.ownerDocument, "strong");
        strong.textContent = artifact.title || "File";
        const span = createHtmlElement(this.ownerDocument, "span");
        span.textContent =
          artifact.kind === "upload"
            ? `Upload • ${artifact.artifact?.inputLabel || "Captured from page"}`
            : `${artifact.artifact?.status || "pending"} • ${artifact.artifact?.sourceUrl || artifact.artifact?.referrerUrl || "Page file"}`;
        copy.append(strong, span);
        const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-action-row");
        actions.append(
          createActionButton(this.ownerDocument, "Show", "nodely-shell__drawer-pill", {
            action: "show-artifact-node",
            dataset: { nodeId: artifact.id }
          }),
          createActionButton(this.ownerDocument, "Open", "nodely-shell__drawer-pill", {
            action: "open-artifact-node-file",
            dataset: { nodeId: artifact.id },
            disabled: !artifact.artifact?.filePath
          }),
          createActionButton(this.ownerDocument, "Reveal", "nodely-shell__drawer-pill", {
            action: "reveal-artifact-node-file",
            dataset: { nodeId: artifact.id },
            disabled: !artifact.artifact?.filePath
          }),
          createActionButton(this.ownerDocument, "Source", "nodely-shell__drawer-pill", {
            action: "show-artifact-node-source",
            dataset: { nodeId: artifact.id }
          })
        );
        row.append(copy, actions);
        body.append(row);
      }
    } else {
      const empty = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-empty");
      empty.textContent = "Files captured from the current research graph will appear here.";
      body.append(empty);
    }

    this.downloadsDrawer.append(header, body);
  }

  renderRecoverDrawer(workspace) {
    this.recoverDrawer.hidden = this.drawer !== "recover";
    this.recoverDrawer.replaceChildren();

    const chromeState = this.state.chrome ?? {};
    const sessionRecovery = chromeState.sessionRecovery ?? {
      canRestoreLastSession: false,
      closedTabs: [],
      closedWindows: [],
      lastSessionWindows: []
    };
    const crashedNodes = chromeState.crashedNodes ?? [];
    const header = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-header");
    const title = createHtmlElement(this.ownerDocument, "strong");
    title.textContent = "Recover";
    header.append(title);

    const body = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-body");

    if (sessionRecovery.lastSessionWindows.length) {
      const section = createDrawerSection(this.ownerDocument, "Last Session");
      if (sessionRecovery.canRestoreLastSession) {
        section.append(
          createActionButton(this.ownerDocument, "Restore All As Roots", "nodely-shell__primary", {
            action: "restore-last-session"
          })
        );
      }
      sessionRecovery.lastSessionWindows.forEach((windowEntry) => {
        const row = createDrawerActionRow(
          this.ownerDocument,
          windowEntry.title,
          `${windowEntry.tabCount} tabs`,
          [
            {
              label: "Restore Window",
              action: "restore-last-session-window",
              dataset: { windowId: windowEntry.id }
            }
          ]
        );
        section.append(row);
      });
      body.append(section);
    }

    if (sessionRecovery.closedTabs.length) {
      const section = createDrawerSection(this.ownerDocument, "Recently Closed Pages");
      sessionRecovery.closedTabs.forEach((entry) => {
        section.append(
          createDrawerActionRow(this.ownerDocument, entry.title, entry.url || "Closed page", [
            {
              label: "Restore As Root",
              action: "restore-closed-tab",
              dataset: { closedId: String(entry.closedId) }
            }
          ])
        );
      });
      body.append(section);
    }

    if (sessionRecovery.closedWindows.length) {
      const section = createDrawerSection(this.ownerDocument, "Closed Windows");
      sessionRecovery.closedWindows.forEach((entry) => {
        section.append(
          createDrawerActionRow(this.ownerDocument, entry.title, `${entry.tabCount} tabs`, [
            {
              label: "Restore Window",
              action: "restore-closed-window",
              dataset: { closedId: String(entry.closedId) }
            }
          ])
        );
      });
      body.append(section);
    }

    if (crashedNodes.length) {
      const section = createDrawerSection(this.ownerDocument, "Crashed Pages");
      crashedNodes.forEach((entry) => {
        section.append(
          createDrawerActionRow(this.ownerDocument, entry.title, entry.url || "Content process crashed", [
            {
              label: "Reload",
              action: "restore-crashed-node",
              dataset: { nodeId: entry.id }
            },
            {
              label: "Show",
              action: "show-node",
              dataset: { nodeId: entry.id }
            }
          ])
        );
      });
      body.append(section);
    }

    if (!body.childElementCount) {
      const empty = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-empty");
      empty.textContent = workspace?.nodes?.length
        ? "Nothing needs recovery right now."
        : "Recovered pages and sessions will appear here.";
      body.append(empty);
    }

    this.recoverDrawer.append(header, body);
  }

  renderExtensionsDrawer() {
    const compatExtensionsState = this.state.chrome?.compatExtensions ?? {
      experimentalMode: false,
      checkingUpdates: false,
      busyExtensionId: null,
      busyAction: null,
      lastActionError: null,
      extensions: []
    };

    this.extensionsDrawer.hidden = this.drawer !== "extensions";
    this.extensionsDrawer.replaceChildren();

    const header = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-header");
    const title = createHtmlElement(this.ownerDocument, "strong");
    title.textContent = "Extensions";
    const headerActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-header-actions");
    headerActions.append(
      createActionButton(this.ownerDocument, "Check Updates", "nodely-shell__drawer-pill", {
        action: "check-compat-extension-updates",
        disabled:
          compatExtensionsState.checkingUpdates ||
          compatExtensionsState.busyAction === "check-compat-extension-updates"
      })
    );
    header.append(title, headerActions);

    const body = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-body");
    const toggleRow = createHtmlElement(
      this.ownerDocument,
      "div",
      "nodely-shell__drawer-row nodely-shell__drawer-row--extensions-toggle"
    );
    const toggleCopy = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-link");
    const toggleTitle = createHtmlElement(this.ownerDocument, "strong");
    toggleTitle.textContent = "Experimental Chrome Extensions";
    const toggleSubtitle = createHtmlElement(this.ownerDocument, "span");
    toggleSubtitle.textContent = compatExtensionsState.experimentalMode
      ? "Enabled. Supported Chrome Web Store pages can install into Nodely."
      : "Off by default. Turn this on to install supported Chrome extensions like Kondo.";
    toggleCopy.append(toggleTitle, toggleSubtitle);
    const toggleLabel = createHtmlElement(this.ownerDocument, "label", "nodely-shell__drawer-toggle");
    const toggleInput = createHtmlElement(this.ownerDocument, "input");
    toggleInput.type = "checkbox";
    toggleInput.checked = compatExtensionsState.experimentalMode;
    toggleInput.dataset.action = "toggle-experimental-chrome-extensions";
    toggleLabel.append(toggleInput);
    toggleRow.append(toggleCopy, toggleLabel);
    body.append(toggleRow);

    if (compatExtensionsState.lastActionError) {
      const errorRow = createHtmlElement(
        this.ownerDocument,
        "div",
        "nodely-shell__drawer-row nodely-shell__drawer-row--error"
      );
      const copy = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-link");
      const errorTitle = createHtmlElement(this.ownerDocument, "strong");
      errorTitle.textContent = "Compat install error";
      const errorBody = createHtmlElement(this.ownerDocument, "span");
      errorBody.textContent = compatExtensionsState.lastActionError;
      copy.append(errorTitle, errorBody);
      errorRow.append(copy);
      body.append(errorRow);
    }

    if (!compatExtensionsState.extensions.length) {
      const empty = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-empty");
      empty.textContent = "No Chrome Web Store compat extensions installed yet.";
      body.append(empty);
    } else {
      compatExtensionsState.extensions.forEach((record) => {
        const row = createHtmlElement(
          this.ownerDocument,
          "div",
          "nodely-shell__drawer-row nodely-shell__drawer-row--extension"
        );
        const copy = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-link");
        const heading = createHtmlElement(this.ownerDocument, "strong");
        heading.textContent = record.name;
        const summary = createHtmlElement(this.ownerDocument, "span");
        const summaryParts = [];
        if (record.installedVersion) {
          summaryParts.push(`Installed ${record.installedVersion}`);
        }
        summaryParts.push(record.active ? "Active" : record.enabled ? "Ready" : "Disabled");
        if (record.updateAvailableVersion) {
          summaryParts.push(`Update ${record.updateAvailableVersion} available`);
        } else if (record.lastCheckedAt) {
          summaryParts.push(`Checked ${new Date(record.lastCheckedAt).toLocaleString()}`);
        }
        summary.textContent = summaryParts.join(" • ");
        copy.append(heading, summary);

        if (record.lastError) {
          const error = createHtmlElement(this.ownerDocument, "span", "nodely-shell__drawer-note");
          error.textContent = record.lastError;
          copy.append(error);
        }

        const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-action-row");
        actions.append(
          createActionButton(
            this.ownerDocument,
            record.enabled ? "Disable" : "Enable",
            "nodely-shell__drawer-pill",
            {
              action: record.enabled ? "disable-compat-extension" : "enable-compat-extension",
              dataset: { extensionId: record.extensionId },
              disabled: compatExtensionsState.busyExtensionId === record.extensionId
            }
          )
        );

        if (record.updateAvailableVersion) {
          actions.append(
            createActionButton(this.ownerDocument, "Update", "nodely-shell__primary", {
              action: "install-chrome-store-extension",
              dataset: { extensionId: record.extensionId },
              disabled: compatExtensionsState.busyExtensionId === record.extensionId
            })
          );
        }

        actions.append(
          createActionButton(this.ownerDocument, "Remove", "nodely-shell__drawer-pill is-danger", {
            action: "remove-compat-extension",
            dataset: { extensionId: record.extensionId },
            disabled: compatExtensionsState.busyExtensionId === record.extensionId
          })
        );

        row.append(copy, actions);
        body.append(row);
      });
    }

    this.extensionsDrawer.append(header, body);
  }

  renderTreesDrawer(workspace, activeFavoriteIds = new Set()) {
    this.treesDrawer.hidden = this.drawer !== "trees";
    this.treesDrawer.replaceChildren();

    const header = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-header");
    const title = createHtmlElement(this.ownerDocument, "strong");
    title.textContent = "Trees";
    header.append(title);

    const body = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-body");

    if (workspace) {
      for (const root of findRoots(workspace)) {
        const form = createHtmlElement(this.ownerDocument, "form", "nodely-shell__drawer-row nodely-shell__drawer-row--tree");
        form.dataset.rootId = root.id;
        const input = createHtmlElement(this.ownerDocument, "input", "nodely-shell__drawer-input");
        input.name = "title";
        input.value = treeDisplayTitle(workspace, root.id);
        input.dataset.initialValue = input.value;
        input.title = input.value;
        const treeFavoriteId = buildTreeFavoriteId(workspace.id, root.id);
        const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-action-row");
        actions.append(
          createActionButton(this.ownerDocument, "Show", "nodely-shell__drawer-pill", {
            action: "show-tree",
            dataset: { rootId: root.id }
          }),
          createActionButton(
            this.ownerDocument,
            "",
            `nodely-shell__icon-button${activeFavoriteIds.has(treeFavoriteId) ? " is-active" : ""}`,
            {
              action: "toggle-tree-favorite",
              dataset: { rootId: root.id },
              disabled: !treeHasInitializedPage(workspace, root.id),
              title: activeFavoriteIds.has(treeFavoriteId) ? "Unfavorite tree" : "Favorite tree",
              icon: iconStar(activeFavoriteIds.has(treeFavoriteId))
            }
          ),
          createActionButton(this.ownerDocument, "", "nodely-shell__icon-button nodely-shell__icon-button--danger", {
            action: "delete-tree",
            dataset: { rootId: root.id }
            ,
            title: `Delete tree: ${input.value || "Tree"}`,
            icon: iconClose()
          })
        );
        form.append(input, actions);
        body.append(form);
      }
    }

    this.treesDrawer.append(header, body);
  }

  renderTreePreview(workspace) {
    const rootId = this.treePreviewRootId;
    const rootNode = rootId ? findNode(workspace, rootId) : null;

    this.treePreviewDialog.hidden = !rootNode;
    this.treePreviewDialog.replaceChildren();

    if (!rootNode) {
      return;
    }

    const backdrop = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-preview-backdrop");
    backdrop.dataset.action = "close-tree-preview";
    const dialog = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-preview-dialog");
    const header = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-preview-header");
    const heading = createHtmlElement(this.ownerDocument, "div");
    const title = createHtmlElement(this.ownerDocument, "strong");
    title.textContent = treeDisplayTitle(workspace, rootId);
    const summary = createHtmlElement(this.ownerDocument, "span");
    const counts = summarizeTreeContents(workspace, rootId);
    summary.textContent = `${counts.pageCount} pages${counts.artifactCount ? ` • ${counts.artifactCount} files` : ""}`;
    heading.append(title, summary);
    header.append(
      heading,
      createActionButton(this.ownerDocument, "", "nodely-shell__icon-button", {
        action: "close-tree-preview",
        title: "Close tree picker",
        icon: iconClose()
      })
    );

    const body = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-preview-body");
    orderTreeNodesForTabs(workspace, rootId).forEach((node) => {
      const button = createActionButton(this.ownerDocument, "", "nodely-shell__tree-preview-node", {
        action: "show-tree-node",
        dataset: { nodeId: node.id },
        title: node.title || node.url || "Untitled page"
      });
      const copy = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-preview-copy");
      const nodeTitle = createHtmlElement(this.ownerDocument, "strong");
      nodeTitle.textContent = node.title || "Untitled page";
      const nodeSubtitle = createHtmlElement(this.ownerDocument, "span");
      nodeSubtitle.textContent = node.url || "No URL yet";
      copy.append(nodeTitle, nodeSubtitle);
      button.append(
        createFaviconChip(
          this.ownerDocument,
          node,
          "nodely-shell__tab-favicon nodely-shell__tree-preview-favicon"
        ),
        copy
      );
      body.append(button);
    });

    dialog.append(header, body);
    this.treePreviewDialog.append(backdrop, dialog);
  }

  renderChromeStoreCompatPanel(storePage, compatExtensionsState) {
    const panel = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-panel nodely-shell__compat-panel");
    const heading = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-panel-heading");
    const title = createHtmlElement(this.ownerDocument, "strong");
    title.textContent = "Chrome Web Store";
    const subtitle = createHtmlElement(this.ownerDocument, "span");
    subtitle.textContent = storePage.supported
      ? `${storePage.recipe.name} is supported in Nodely's experimental Chrome-extension mode.`
      : "This Chrome Web Store listing is not yet supported in Nodely.";
    heading.append(title, subtitle);
    panel.append(heading);

    const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-actions");
    const record = resolveCompatExtensionRecord(compatExtensionsState, storePage.extensionId);

    if (!storePage.supported) {
      actions.append(
        createActionButton(this.ownerDocument, "Open Extensions", "nodely-shell__drawer-pill", {
          action: "open-extensions-drawer"
        })
      );
      panel.append(actions);
      return panel;
    }

    const copy = createHtmlElement(this.ownerDocument, "p", "nodely-shell__prompt-card-copy");

    if (!compatExtensionsState.experimentalMode) {
      copy.textContent =
        "Turn on Experimental Chrome Extensions to install this supported Chrome Web Store extension into Nodely.";
      actions.append(
        createActionButton(this.ownerDocument, "Enable Experimental Mode", "nodely-shell__primary", {
          action: "enable-experimental-chrome-extensions"
        }),
        createActionButton(this.ownerDocument, "Open Extensions", "nodely-shell__drawer-pill", {
          action: "open-extensions-drawer"
        })
      );
      panel.append(copy, actions);
      return panel;
    }

    if (!record || record.installState === "missing") {
      copy.textContent =
        "Nodely can download this Chrome Web Store package, convert it into a Gecko-compatible local add-on, and install it as a managed experimental extension.";
      actions.append(
        createActionButton(
          this.ownerDocument,
          compatExtensionsState.busyExtensionId === storePage.extensionId
            ? "Installing…"
            : storePage.recipe.storeLabel,
          "nodely-shell__primary",
          {
            action: "install-chrome-store-extension",
            dataset: { extensionId: storePage.extensionId },
            disabled: compatExtensionsState.busyExtensionId === storePage.extensionId
          }
        ),
        createActionButton(this.ownerDocument, "Open Extensions", "nodely-shell__drawer-pill", {
          action: "open-extensions-drawer"
        })
      );
      panel.append(copy, actions);
      return panel;
    }

    copy.textContent = [
      record.installedVersion ? `Installed ${record.installedVersion}` : "Installed",
      record.active ? "active in Nodely" : record.enabled ? "ready to re-enable" : "disabled"
    ].join(" • ");
    panel.append(copy);

    actions.append(
      createActionButton(
        this.ownerDocument,
        record.enabled ? "Disable" : "Enable",
        "nodely-shell__drawer-pill",
        {
          action: record.enabled ? "disable-compat-extension" : "enable-compat-extension",
          dataset: { extensionId: record.extensionId },
          disabled: compatExtensionsState.busyExtensionId === record.extensionId
        }
      )
    );

    if (record.updateAvailableVersion) {
      actions.append(
        createActionButton(
          this.ownerDocument,
          `Update to ${record.updateAvailableVersion}`,
          "nodely-shell__primary",
          {
            action: "install-chrome-store-extension",
            dataset: { extensionId: record.extensionId },
            disabled: compatExtensionsState.busyExtensionId === record.extensionId
          }
        )
      );
    }

    actions.append(
      createActionButton(this.ownerDocument, "Remove", "nodely-shell__drawer-pill is-danger", {
        action: "remove-compat-extension",
        dataset: { extensionId: record.extensionId },
        disabled: compatExtensionsState.busyExtensionId === record.extensionId
      }),
      createActionButton(this.ownerDocument, "Open Extensions", "nodely-shell__drawer-pill", {
        action: "open-extensions-drawer"
      })
    );
    panel.append(actions);

    return panel;
  }

  renderContextMenu(workspace) {
    this.contextMenu.hidden = !this.contextMenuState;
    this.contextMenu.replaceChildren();

    if (!this.contextMenuState) {
      this.contextMenu.style.removeProperty("left");
      this.contextMenu.style.removeProperty("top");
      return;
    }

    const node = this.contextMenuState.nodeId
      ? findNode(workspace, this.contextMenuState.nodeId)
      : null;
    const killSubtreeLabel =
      node == null ? "Kill Sub-Tree" : node.parentId === null ? "Kill Tree" : "Kill Sub-Tree";

    const body = createHtmlElement(this.ownerDocument, "div", "nodely-shell__menu-body");

    if (this.contextMenuState.kind === "ancestry") {
      for (const ancestorId of this.contextMenuState.nodeIds ?? []) {
        const ancestorNode = findNode(workspace, ancestorId);

        if (!ancestorNode || isArtifactNode(ancestorNode)) {
          continue;
        }

        body.append(
          createActionButton(
            this.ownerDocument,
            ancestorNode.title || ancestorNode.url || "Untitled page",
            "nodely-shell__menu-item",
            {
              action: "select-ancestor-node",
              dataset: { nodeId: ancestorNode.id },
              title: ancestorNode.title || ancestorNode.url || "Untitled page"
            }
          )
        );
      }
    }

    if (this.contextMenuState.kind === "tab" && node && !isArtifactNode(node) && node.url) {
      body.append(
        createActionButton(this.ownerDocument, "Duplicate As Child", "nodely-shell__menu-item", {
          action: "duplicate-tab",
          dataset: { nodeId: node.id }
        })
      );
      body.append(
        createActionButton(
          this.ownerDocument,
          killSubtreeLabel,
          "nodely-shell__menu-item nodely-shell__menu-item--danger",
          {
            action: "kill-subtree-context",
            dataset: { nodeId: node.id }
          }
        )
      );
    }

    if (this.contextMenuState.kind === "node" && node) {
      body.append(
        createActionButton(
          this.ownerDocument,
          killSubtreeLabel,
          "nodely-shell__menu-item nodely-shell__menu-item--danger",
          {
            action: "kill-node-context",
            dataset: { nodeId: node.id }
          }
        )
      );
    }

    if (!body.childElementCount) {
      this.contextMenu.hidden = true;
      return;
    }

    this.contextMenu.append(body);
  }

  renderPromptStack() {
    this.promptStack.replaceChildren();

    const transientAuth = this.state.chrome?.transientAuth ?? null;
    const authPrompt = this.state.chrome?.authPrompt ?? null;
    const permissionPrompt = this.state.chrome?.permissionPrompt ?? null;
    const externalProtocol = this.state.chrome?.externalProtocol ?? null;

    if (!transientAuth && !authPrompt && !permissionPrompt && !externalProtocol) {
      this.promptStack.hidden = true;
      return;
    }

    this.promptStack.hidden = false;

    if (transientAuth) {
      this.promptStack.append(
        createPromptCard(this.ownerDocument, {
          title: "Authentication Flow",
          body:
            transientAuth.url ??
            transientAuth.title ??
            "A sign-in popup is open for the current page.",
          secondary:
            transientAuth.parentNodeId != null
              ? "Nodely is keeping this auth flow out of the graph and will return you to the opener node."
              : "Nodely is keeping this auth flow out of the graph.",
          actions:
            transientAuth.parentNodeId != null
              ? [
                  {
                    label: "Show Node",
                    action: "show-node",
                    dataset: { nodeId: transientAuth.parentNodeId }
                  }
                ]
              : [],
          icon: iconWarning()
        })
      );
    }

    if (authPrompt) {
      this.promptStack.append(
        createPromptCard(this.ownerDocument, {
          title: "Authentication Required",
          body:
            authPrompt.requestingUrl ??
            authPrompt.principalOrigin ??
            authPrompt.title ??
            "A page is requesting credentials.",
          secondary:
            authPrompt.nodeId != null
              ? "A native Gecko auth dialog is open for this node."
              : "A native Gecko auth dialog is open.",
          actions:
            authPrompt.nodeId != null
              ? [
                  {
                    label: "Show Node",
                    action: "show-node",
                    dataset: { nodeId: authPrompt.nodeId }
                  }
                ]
              : [],
          icon: iconWarning()
        })
      );
    }

    if (permissionPrompt) {
      const actions = [
        {
          label: permissionPrompt.allowLabel || "Allow",
          action: "allow-permission-prompt",
          disabled: permissionPrompt.allowDisabled === true
        }
      ];

      if (permissionPrompt.blockLabel) {
        actions.push({
          label: permissionPrompt.blockLabel,
          action: "block-permission-prompt",
          disabled: permissionPrompt.blockDisabled === true
        });
      }

      actions.push({
        label: "Dismiss",
        action: "dismiss-permission-prompt"
      });

      if (permissionPrompt.nodeId != null) {
        actions.unshift({
          label: "Show Node",
          action: "show-node",
          dataset: { nodeId: permissionPrompt.nodeId }
        });
      }

      this.promptStack.append(
        createPromptCard(this.ownerDocument, {
          title: permissionPrompt.title || "Permission Request",
          body:
            permissionPrompt.body ??
            permissionPrompt.requestingUrl ??
            "A page is requesting permission.",
          secondary:
            permissionPrompt.requestingUrl != null
              ? `Requested by ${permissionPrompt.requestingUrl}`
              : "Nodely is keeping the permission prompt stable while you decide.",
          actions,
          icon: iconWarning()
        })
      );
    }

    if (externalProtocol) {
      this.promptStack.append(
        createPromptCard(this.ownerDocument, {
          title: "External App Request",
          body:
            externalProtocol.uri ??
            externalProtocol.scheme?.toUpperCase?.() ??
            "A page is trying to open an external app.",
          secondary:
            externalProtocol.handlerName
              ? `Handler: ${externalProtocol.handlerName}`
              : "Gecko is handling the protocol chooser.",
          actions:
            externalProtocol.nodeId != null
              ? [
                  {
                    label: "Show Node",
                    action: "show-node",
                    dataset: { nodeId: externalProtocol.nodeId }
                  }
                ]
              : [],
          icon: iconWarning()
        })
      );
    }
  }

  syncDocumentLayout(workspace, selectedNode) {
    const root = document.documentElement;
    const isEmptyWorkspace = !workspace?.nodes?.length;
    const contextualComposer = this.isContextualComposer(workspace);
    const topbarHeight = Math.round(this.topbar?.getBoundingClientRect?.().height ?? 52);
    const composerHeight = showComposerHeight(workspace, this.composerOpen, contextualComposer) && !this.composer.hidden
      ? Math.round(this.composer?.getBoundingClientRect?.().height ?? 52)
      : 0;
    const pagebarHeight =
      selectedNode && !this.pagebar.hidden
        ? Math.round(this.pagebar?.getBoundingClientRect?.().height ?? 0)
        : 0;
    const splitWidth = this.splitWidthOverride ?? workspace?.prefs.splitWidth ?? 340;
    const surfaceMode = workspace?.prefs.surfaceMode ?? "page";
    const splitPagebarAnchoredToPageSurface =
      !isEmptyWorkspace && workspace?.prefs.viewMode === "split" && surfaceMode === "page";
    const sharedSurfaceTop = topbarHeight + composerHeight;
    const pageSurfaceTop = sharedSurfaceTop + pagebarHeight;
    const graphWidth =
      isEmptyWorkspace || surfaceMode === "canvas"
        ? "100vw"
        : workspace?.prefs.viewMode === "split"
          ? `${splitWidth}px`
          : "0px";
    const browserSurfaceMode =
      surfaceMode === "page" && selectedNode && isArtifactNode(selectedNode)
        ? "overlay"
        : isEmptyWorkspace || surfaceMode === "canvas"
          ? "canvas"
          : "page";
    root.setAttribute("nodely-active", "true");
    root.setAttribute("nodely-view", workspace?.prefs.viewMode ?? "split");
    root.setAttribute("nodely-surface-mode", surfaceMode);
    root.setAttribute("nodely-theme", workspace?.prefs.themeMode === "dark" ? "dark" : "light");
    root.setAttribute("nodely-empty-workspace", isEmptyWorkspace ? "true" : "false");
    root.setAttribute("nodely-drawer", this.drawer ?? "");
    root.setAttribute("nodely-browser-surface", browserSurfaceMode);
    root.setAttribute("nodely-composer-placement", contextualComposer ? "contextual" : "bar");
    root.setAttribute(
      "nodely-pagebar-layout",
      splitPagebarAnchoredToPageSurface ? "page-pane" : "full-width"
    );
    root.style.setProperty("--nodely-topbar-height", `${topbarHeight}px`);
    root.style.setProperty("--nodely-pagebar-height", `${pagebarHeight}px`);
    root.style.setProperty("--nodely-graph-width", graphWidth);
    root.style.setProperty("--nodely-composer-height", `${composerHeight}px`);
    this.graph.style.width = graphWidth;
    this.graph.style.top = `${splitPagebarAnchoredToPageSurface ? sharedSurfaceTop : pageSurfaceTop}px`;
    this.splitHandle.style.top = `${splitPagebarAnchoredToPageSurface ? sharedSurfaceTop : pageSurfaceTop}px`;
    this.artifactSurface.style.top = `${pageSurfaceTop}px`;
  }

  syncFloatingLayout() {
    this.positionDrawer(this.drawer, this.getDrawerElement(this.drawer));
    this.positionContextMenu();
  }

  scheduleLayoutSync() {
    if (this.layoutSyncFrame != null) {
      window.cancelAnimationFrame(this.layoutSyncFrame);
    }

    this.layoutSyncFrame = window.requestAnimationFrame(() => {
      this.layoutSyncFrame = null;
      const workspace = this.state.workspace;
      const selectedNode = findNode(workspace, workspace?.selectedNodeId);
      this.syncDocumentLayout(workspace, selectedNode);
      this.syncFloatingLayout();
    });
  }

  getDrawerElement(drawerName) {
    switch (drawerName) {
      case "favorites":
        return this.favoritesDrawer;
      case "downloads":
        return this.downloadsDrawer;
      case "recover":
        return this.recoverDrawer;
      case "extensions":
        return this.extensionsDrawer;
      case "trees":
        return this.treesDrawer;
      default:
        return null;
    }
  }

  positionDrawer(drawerName, drawerElement) {
    for (const drawer of [
      this.favoritesDrawer,
      this.downloadsDrawer,
      this.recoverDrawer,
      this.extensionsDrawer,
      this.treesDrawer
    ]) {
      drawer?.style?.removeProperty("left");
      drawer?.style?.removeProperty("top");
    }

    if (!drawerName || !drawerElement || drawerElement.hidden) {
      return;
    }

    const trigger = this.topbar?.querySelector(
      `[data-action="toggle-drawer"][data-drawer="${drawerName}"]`
    );

    if (!trigger) {
      return;
    }

    const position = resolveDropdownPosition(
      trigger.getBoundingClientRect(),
      this.ownerDocument?.defaultView ?? window,
      Math.round(drawerElement.getBoundingClientRect().width || 320),
      Math.round(drawerElement.getBoundingClientRect().height || 360),
      Math.round(this.topbar?.getBoundingClientRect?.().height ?? 52)
    );
    drawerElement.style.left = `${position.left}px`;
    drawerElement.style.top = `${position.top}px`;
  }

  positionContextMenu() {
    this.contextMenu.style.removeProperty("left");
    this.contextMenu.style.removeProperty("top");

    if (!this.contextMenuState || this.contextMenu.hidden) {
      return;
    }

    const position = resolveFloatingMenuPosition(
      this.contextMenuState.anchor,
      this.ownerDocument?.defaultView ?? window,
      Math.round(this.contextMenu.getBoundingClientRect().width || FLOATING_MENU_WIDTH),
      Math.round(this.contextMenu.getBoundingClientRect().height || 120),
      Math.round(this.topbar?.getBoundingClientRect?.().height ?? 52)
    );
    this.contextMenu.style.left = `${position.left}px`;
    this.contextMenu.style.top = `${position.top}px`;
  }

  handleSplitResizeStart(event) {
    const workspace = this.state.workspace;

    if (!workspace?.nodes?.length || workspace.prefs.viewMode !== "split") {
      return;
    }

    event.preventDefault();
    this.splitResizeState = {
      pointerId: event.pointerId
    };
    this.splitWidthOverride = workspace.prefs.splitWidth ?? 340;
    this.splitHandle.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", this.boundSplitResizeMove);
    window.addEventListener("pointerup", this.boundSplitResizeUp);
  }

  handleSplitResizeMove(event) {
    if (!this.splitResizeState || event.pointerId !== this.splitResizeState.pointerId) {
      return;
    }

    const nextWidth = clampSplitWidth(event.clientX, window.innerWidth);
    this.splitWidthOverride = nextWidth;
    this.syncDocumentLayout(this.state.workspace, findNode(this.state.workspace, this.state.workspace?.selectedNodeId));
  }

  handleSplitResizeUp(event) {
    if (!this.splitResizeState || event.pointerId !== this.splitResizeState.pointerId) {
      return;
    }

    const nextWidth = this.splitWidthOverride ?? this.state.workspace?.prefs.splitWidth ?? 340;
    this.splitHandle.releasePointerCapture?.(event.pointerId);
    this.splitResizeState = null;
    window.removeEventListener("pointermove", this.boundSplitResizeMove);
    window.removeEventListener("pointerup", this.boundSplitResizeUp);
    this.controller?.setSplitWidth(nextWidth);
  }

  quitBrowser() {
    try {
      if (typeof window.goQuitApplication === "function") {
        window.goQuitApplication();
        return;
      }
    } catch {}

    try {
      if (typeof window.BrowserCommands?.tryToCloseWindow === "function") {
        window.BrowserCommands.tryToCloseWindow();
        return;
      }
    } catch {}

    window.close();
  }

  handleTopbarClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "toggle-composer") {
      if (this.composerOpen) {
        this.closeComposer();
        this.render();
      } else {
        this.openComposer();
      }
      return;
    }

    if (action === "toggle-drawer") {
      this.toggleDrawer(button.dataset.drawer);
      return;
    }

    if (action === "center-view") {
      const workspace = this.state.workspace;
      const selectedNodeId = workspace?.selectedNodeId ?? (workspace ? findRoots(workspace)[0]?.id ?? null : null);
      if (selectedNodeId) {
        this.graph.centerOnNode(selectedNodeId);
      }
      return;
    }

    if (action === "auto-organize") {
      this.controller?.autoOrganize();
      return;
    }

    if (action === "quit-browser") {
      this.quitBrowser();
      return;
    }

    if (action === "set-view") {
      this.controller?.setViewMode(button.dataset.view);
      return;
    }

    if (action === "toggle-surface") {
      this.toggleFocusSurface();
      return;
    }

    if (action === "set-theme") {
      this.controller?.setThemeMode(button.dataset.theme);
      return;
    }

    if (action === "toggle-fullscreen") {
      this.controller?.toggleFullscreen();
    }
  }

  handleTopbarChange(event) {
    const select = event.target.closest("select[data-action='search-provider']");

    if (select) {
      this.controller?.setSearchProvider(select.value);
    }
  }

  handleComposerSubmit(event) {
    event.preventDefault();
    const form = event.target.closest("form");
    const input = form?.querySelector("input[name='root-input']");

    if (input?.value.trim()) {
      this.composerDraft = "";
      this.composerSuggestions = [];
      this.controller?.createRootFromInput(input.value, {
        position: this.resolveContextualRootPosition()
      });
      this.closeComposer();
      this.render();
    }
  }

  handleComposerClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    if (button.dataset.action === "jump-node-suggestion") {
      void this.jumpToSuggestedNode(button.dataset.nodeId, { closeComposer: true });
    }
  }

  handleComposerInput(event) {
    const input = event.target.closest("input[name='root-input']");

    if (!input) {
      return;
    }

    this.composerDraft = input.value;
    this.refreshSuggestionState("composer");
  }

  handleAddressSubmit(event) {
    const treeRenameForm = event.target.closest(".nodely-shell__tree-rename-form");

    if (treeRenameForm) {
      event.preventDefault();
      const input = treeRenameForm.querySelector("input[name='tree-title']");
      this.commitInlineTreeRename(treeRenameForm.dataset.rootId, input?.value ?? "");
      return;
    }

    const findForm = event.target.closest(".nodely-shell__find-form");

    if (findForm) {
      event.preventDefault();
      this.controller?.findInPage(this.findQuery);
      return;
    }

    const form = event.target.closest(".nodely-shell__address-form");

    if (!form) {
      return;
    }

    event.preventDefault();
    const input = form.querySelector("input[name='address']");
    this.addressDraft = "";
    this.addressSuggestions = [];
    this.controller?.submitAddress(input.value);
  }

  handlePagebarClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "page-command") {
      this.controller?.pageCommand(button.dataset.command);
      return;
    }

    if (action === "toggle-page-favorite") {
      this.controller?.togglePageFavorite();
      return;
    }

    if (action === "start-tree-rename") {
      const rootId = button.dataset.rootId;
      const rootNode = findNode(this.state.workspace, rootId);
      this.openTreeRename(
        rootId,
        rootNode ? treeDisplayTitle(this.state.workspace, rootNode.id) : ""
      );
      return;
    }

    if (action === "cancel-tree-rename") {
      this.closeTreeRename();
      this.render();
      return;
    }

    if (action === "open-favorite") {
      this.controller?.openFavorite(button.dataset.favoriteId);
      return;
    }

    if (action === "toggle-composer") {
      if (this.composerOpen) {
        this.closeComposer();
        this.render();
      } else {
        this.openComposer();
      }
      return;
    }

    if (action === "create-child-node") {
      this.controller?.createChildNode({ origin: "tab-button" });
      return;
    }

    if (action === "open-ancestry-menu") {
      const selectedNode =
        findNode(this.state.workspace, this.state.workspace?.selectedNodeId) ?? null;
      const activePageNode =
        selectedNode && isArtifactNode(selectedNode)
          ? findOwningPageNode(this.state.workspace, selectedNode)
          : selectedNode;
      const subtreeModel = deriveSubtreeTabBarModel(
        this.state.workspace,
        activePageNode?.id ?? null
      );
      const hiddenAncestorIds = subtreeModel.hiddenAncestors.map((node) => node.id);

      if (!hiddenAncestorIds.length) {
        return;
      }

      const anchorRect = button.getBoundingClientRect?.() ?? null;
      const anchor = anchorRect
        ? {
            clientX: Math.round(anchorRect.left),
            clientY: Math.round(anchorRect.bottom)
          }
        : {
            clientX: event.clientX ?? 0,
            clientY: event.clientY ?? 0
          };

      this.openContextMenu({
        kind: "ancestry",
        nodeIds: hiddenAncestorIds,
        anchor
      });
      return;
    }

    if (action === "toggle-permissions-panel") {
      const nextOpen = !this.permissionsPanelOpen;
      this.closeInlinePanels();
      this.drawer = null;
      this.permissionsPanelOpen = nextOpen;
      this.render();
      return;
    }

    if (action === "open-native-permissions") {
      this.controller?.showPermissions(button);
      return;
    }

    if (action === "toggle-find") {
      if (this.findOpen) {
        this.closeInlinePanels();
        this.render();
      } else {
        this.openFindPanel();
      }
      return;
    }

    if (action === "find-next") {
      this.controller?.findAgain(false);
      return;
    }

    if (action === "find-prev") {
      this.controller?.findAgain(true);
      return;
    }

    if (action === "close-find") {
      this.closeInlinePanels();
      this.render();
      return;
    }

    if (action === "toggle-print") {
      if (this.printSheetOpen) {
        this.closeInlinePanels({ closeFind: false });
        this.render();
      } else {
        this.openPrintPanel();
      }
      return;
    }

    if (action === "preview-print") {
      this.controller?.previewPrint();
      return;
    }

    if (action === "print-page") {
      this.controller?.printPage();
      return;
    }

    if (action === "toggle-fullscreen") {
      this.controller?.toggleFullscreen();
      return;
    }

    if (action === "open-artifact-file") {
      this.controller?.openSelectedArtifactFile();
      return;
    }

    if (action === "reveal-artifact-file") {
      this.controller?.revealSelectedArtifactFile();
      return;
    }

    if (action === "show-artifact-source") {
      this.controller?.showSelectedArtifactSource();
      return;
    }

    if (action === "kill-node") {
      this.controller?.killNode(button.dataset.nodeId);
      return;
    }

    if (action === "kill-tab-node") {
      this.controller?.killNode(button.dataset.nodeId);
      return;
    }

    if (action === "set-view") {
      this.controller?.setViewMode(button.dataset.view);
      return;
    }

    if (action === "set-surface") {
      this.closeInlinePanels();
      this.closeTreeRename();
      this.controller?.setSurfaceMode(button.dataset.surface);
      return;
    }

    if (action === "select-node") {
      void this.openNodeFromGraph(button.dataset.nodeId);
      return;
    }

    if (action === "hide-focus-hint") {
      this.controller?.setShowFocusHint(false);
      return;
    }

    if (action === "open-extensions-drawer") {
      this.drawer = "extensions";
      this.render();
      return;
    }

    if (action === "enable-experimental-chrome-extensions") {
      this.controller?.setExperimentalChromeExtensionsEnabled(true);
      return;
    }

    if (action === "install-chrome-store-extension") {
      this.controller?.installChromeStoreExtension(button.dataset.extensionId);
      return;
    }

    if (action === "enable-compat-extension") {
      this.controller?.setCompatExtensionEnabled(button.dataset.extensionId, true);
      return;
    }

    if (action === "disable-compat-extension") {
      this.controller?.setCompatExtensionEnabled(button.dataset.extensionId, false);
      return;
    }

    if (action === "remove-compat-extension") {
      this.controller?.removeCompatExtension(button.dataset.extensionId);
      return;
    }

    if (action === "check-compat-extension-updates") {
      this.controller?.checkCompatExtensionUpdates();
      return;
    }

    if (action === "jump-node-suggestion") {
      void this.jumpToSuggestedNode(button.dataset.nodeId);
    }
  }

  handlePagebarContextMenu(event) {
    const tab = event.target.closest(".nodely-shell__tab[data-node-id]");

    if (!tab) {
      return;
    }

    const node = findNode(this.state.workspace, tab.dataset.nodeId);

    if (!node || isArtifactNode(node) || !node.url) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.openContextMenu({
      kind: "tab",
      nodeId: node.id,
      anchor: {
        clientX: event.clientX,
        clientY: event.clientY
      }
    });
  }

  handlePagebarChange(_event) {}

  handlePagebarFocusOut(event) {
    const input = event.target.closest("input[name='tree-title']");

    if (!input) {
      return;
    }

    const form = input.closest(".nodely-shell__tree-rename-form");

    if (!form || form.contains(event.relatedTarget)) {
      return;
    }

    this.commitInlineTreeRename(form.dataset.rootId, input.value);
  }

  handlePagebarInput(event) {
    const treeRenameInput = event.target.closest("input[name='tree-title']");

    if (treeRenameInput) {
      this.inlineTreeRenameValue = treeRenameInput.value;
      return;
    }

    const input = event.target.closest("input[name='find-query']");

    if (input) {
      this.findQuery = input.value;
      this.controller?.findInPage(this.findQuery);
      return;
    }

    const addressInput = event.target.closest("input[name='address']");

    if (!addressInput) {
      return;
    }

    this.addressDraft = addressInput.value;
    this.refreshSuggestionState("address");
  }

  handleFavoritesClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    if (button.dataset.action === "open-favorite") {
      this.controller?.openFavorite(button.dataset.favoriteId);
      return;
    }

    if (button.dataset.action === "remove-favorite") {
      this.controller?.removeFavorite(button.dataset.favoriteId);
      return;
    }

    if (button.dataset.action === "start-favorite-folder") {
      this.favoriteFolderComposerOpen = true;
      this.favoriteFolderDraft = "";
      this.render();
      this.favoritesDrawer.querySelector("input[name='folder-title']")?.focus();
      return;
    }

    if (button.dataset.action === "cancel-favorite-folder") {
      this.favoriteFolderComposerOpen = false;
      this.favoriteFolderDraft = "";
      this.render();
    }
  }

  handleFavoritesChange(event) {
    const select = event.target.closest("select[data-action='move-favorite-folder']");

    if (!select) {
      return;
    }

    this.controller?.moveFavoriteToFolder(select.dataset.favoriteId, select.value || null);
  }

  handleFavoritesInput(event) {
    const input = event.target.closest("input[name='folder-title']");

    if (!input) {
      return;
    }

    this.favoriteFolderDraft = input.value;
  }

  handleFavoritesSubmit(event) {
    const form = event.target.closest(".nodely-shell__drawer-folder-form");

    if (!form) {
      return;
    }

    event.preventDefault();
    const input = form.querySelector("input[name='folder-title']");
    const title = String(input?.value ?? "").trim();

    if (!title) {
      return;
    }

    this.favoriteFolderComposerOpen = false;
    this.favoriteFolderDraft = "";
    this.controller?.createFavoriteFolder(title);
    this.render();
  }

  handleDownloadsClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    switch (button.dataset.action) {
      case "show-artifact-node":
        void this.openNodeFromGraph(button.dataset.nodeId);
        this.graph.centerOnNode(button.dataset.nodeId);
        break;
      case "open-artifact-node-file":
        this.controller?.openArtifactFile(button.dataset.nodeId);
        break;
      case "reveal-artifact-node-file":
        this.controller?.revealArtifactFile(button.dataset.nodeId);
        break;
      case "show-artifact-node-source":
        this.controller?.showArtifactSource(button.dataset.nodeId);
        break;
      default:
        break;
    }
  }

  handleRecoverClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    switch (button.dataset.action) {
      case "restore-last-session":
        this.controller?.restoreLastSession();
        break;
      case "restore-last-session-window": {
        const windowEntry =
          this.state.chrome?.sessionRecovery?.lastSessionWindows?.find(
            (entry) => entry.id === button.dataset.windowId
          ) ?? null;
        if (windowEntry?.tabs?.length) {
          this.controller?.restoreEntriesAsRoots(windowEntry.tabs, "last-session-window");
        }
        break;
      }
      case "restore-closed-tab":
        this.controller?.restoreClosedTab(Number(button.dataset.closedId));
        break;
      case "restore-closed-window":
        this.controller?.restoreClosedWindow(Number(button.dataset.closedId));
        break;
      case "restore-crashed-node":
        this.controller?.restoreCrashedNode(button.dataset.nodeId);
        break;
      case "show-node":
        void this.openNodeFromGraph(button.dataset.nodeId);
        this.graph.centerOnNode(button.dataset.nodeId);
        break;
      default:
        break;
    }
  }

  handleExtensionsClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    switch (button.dataset.action) {
      case "check-compat-extension-updates":
        this.controller?.checkCompatExtensionUpdates();
        break;
      case "enable-compat-extension":
        this.controller?.setCompatExtensionEnabled(button.dataset.extensionId, true);
        break;
      case "disable-compat-extension":
        this.controller?.setCompatExtensionEnabled(button.dataset.extensionId, false);
        break;
      case "install-chrome-store-extension":
        this.controller?.installChromeStoreExtension(button.dataset.extensionId);
        break;
      case "remove-compat-extension":
        this.controller?.removeCompatExtension(button.dataset.extensionId);
        break;
      default:
        break;
    }
  }

  handleExtensionsChange(event) {
    const input = event.target.closest("input[data-action='toggle-experimental-chrome-extensions']");

    if (!input) {
      return;
    }

    this.controller?.setExperimentalChromeExtensionsEnabled(input.checked);
  }

  handleTreesClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const form = button.closest("form[data-root-id]");

    if (form && button.dataset.action !== "delete-tree") {
      this.commitDrawerTreeRename(form);
    }

    if (button.dataset.action === "show-tree") {
      this.openTreePreview(button.dataset.rootId);
      return;
    }

    if (button.dataset.action === "delete-tree") {
      this.controller?.deleteTree(button.dataset.rootId);
      return;
    }

    if (button.dataset.action === "toggle-tree-favorite") {
      this.controller?.toggleTreeFavorite(button.dataset.rootId);
    }
  }

  handleTreesFocusOut(event) {
    const input = event.target.closest("input[name='title']");

    if (!input) {
      return;
    }

    const form = input.closest("form[data-root-id]");

    if (!form || form.contains(event.relatedTarget)) {
      return;
    }

    this.commitDrawerTreeRename(form);
  }

  handleContextMenuClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    if (button.dataset.action === "duplicate-tab") {
      const node = findNode(this.state.workspace, button.dataset.nodeId);

      if (node?.url) {
        this.controller?.createChildNode({
          parentNodeId: node.id,
          url: node.url,
          origin: "tab-duplicate"
        });
      }

      this.closeContextMenu();
      this.render();
      return;
    }

    if (button.dataset.action === "select-ancestor-node") {
      this.closeContextMenu();
      this.render();
      void this.controller?.selectNode?.(button.dataset.nodeId);
      return;
    }

    if (button.dataset.action === "kill-node-context" || button.dataset.action === "kill-subtree-context") {
      this.controller?.killSubtree(button.dataset.nodeId);
      this.closeContextMenu();
      this.render();
    }
  }

  handleTreesSubmit(event) {
    const form = event.target.closest("form[data-root-id]");

    if (!form) {
      return;
    }

    event.preventDefault();
    this.commitDrawerTreeRename(form);
  }

  handleTreePreviewClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    if (button.dataset.action === "close-tree-preview") {
      this.closeTreePreview();
      this.render();
      return;
    }

    if (button.dataset.action === "show-tree-node") {
      this.drawer = null;
      this.closeTreePreview();
      this.render();
      void this.openNodeFromGraph(button.dataset.nodeId);
      this.graph.centerOnNode(button.dataset.nodeId);
    }
  }

  handleArtifactSurfaceClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    switch (button.dataset.action) {
      case "open-artifact-file":
        this.controller?.openSelectedArtifactFile();
        break;
      case "reveal-artifact-file":
        this.controller?.revealSelectedArtifactFile();
        break;
      case "show-artifact-source":
        this.controller?.showSelectedArtifactSource();
        break;
      case "kill-node":
        this.controller?.killNode(button.dataset.nodeId);
        break;
      default:
        break;
    }
  }

  handlePromptStackClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    switch (button.dataset.action) {
      case "show-node":
        void this.openNodeFromGraph(button.dataset.nodeId);
        this.graph.centerOnNode(button.dataset.nodeId);
        break;
      case "allow-permission-prompt":
        void this.controller?.allowPermissionPrompt?.();
        break;
      case "block-permission-prompt":
        void this.controller?.blockPermissionPrompt?.();
        break;
      case "dismiss-permission-prompt":
        void this.controller?.dismissPermissionPrompt?.();
        break;
      default:
        break;
    }
  }

  handleWindowKeydown(event) {
    const target = event.target;
    const tagName = target?.tagName?.toLowerCase?.() ?? "";
    const isTextEntry =
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      Boolean(target?.isContentEditable);

    if (event.key === "Escape") {
      if (this.dismissTransientUi()) {
        event.preventDefault();
        return;
      }

      const workspace = this.state.workspace;

      if (
        workspace?.prefs.viewMode === "focus" &&
        workspace?.prefs.surfaceMode !== "canvas"
      ) {
        this.controller?.setSurfaceMode("canvas");
        event.preventDefault();
      }
      return;
    }

    if (isTextEntry) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "l") {
      this.dismissNativeLocationOverlay();
      if (this.focusPreferredLocationInput()) {
        event.preventDefault();
      }
      return;
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.code === "Backslash"
    ) {
      if (this.toggleFocusSurface()) {
        event.preventDefault();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") {
      if (this.openFindPanel()) {
        event.preventDefault();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "p") {
      if (this.openPrintPanel()) {
        event.preventDefault();
      }
    }
  }

  handleWindowFocusIn(event) {
    if (!event.target?.closest?.(NATIVE_LOCATION_FOCUS_SELECTOR)) {
      return;
    }

    const view = this.ownerDocument?.defaultView ?? globalThis.window ?? null;
    const schedule = view?.requestAnimationFrame?.bind?.(view) ?? null;

    (schedule ?? queueMicrotask)(() => {
      this.dismissNativeLocationOverlay({ refocus: true });
    });
  }

  handleDocumentCommand(event) {
    const commandId =
      event.target?.id ?? event.target?.getAttribute?.("command") ?? event.target?.dataset?.command ?? "";

    if (commandId !== "Browser:OpenLocation") {
      return;
    }

    this.dismissNativeLocationOverlay();
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    const schedule = (this.ownerDocument?.defaultView ?? globalThis.window ?? null)?.requestAnimationFrame;
    const focusLater = () => {
      this.focusPreferredLocationInput();
    };

    if (typeof schedule === "function") {
      schedule.call(this.ownerDocument?.defaultView ?? globalThis.window, focusLater);
    } else {
      queueMicrotask(focusLater);
    }
  }

  handleWindowClick(event) {
    if (!this.contextMenuState) {
      return;
    }

    if (this.contextMenu?.contains?.(event.target)) {
      return;
    }

    const button = Number.isFinite(event.button) ? event.button : 0;

    if (button !== 0) {
      return;
    }

    if (Date.now() - this.contextMenuOpenedAt < CONTEXT_MENU_OPEN_GRACE_MS) {
      return;
    }

    this.closeContextMenu();
    this.render();
  }

  async jumpToSuggestedNode(nodeId, { closeComposer = false } = {}) {
    if (!nodeId) {
      return;
    }

    this.composerSuggestions = [];
    this.addressSuggestions = [];
    this.composerDraft = "";
    this.addressDraft = "";

    if (closeComposer) {
      this.closeComposer();
    }

    await this.openNodeFromGraph(nodeId);
    this.graph.centerOnNode(nodeId);
    this.render();
  }

  refreshSuggestionState(kind) {
    const selectedNode = findNode(this.state.workspace, this.state.workspace?.selectedNodeId);
    const currentNodeId = kind === "address" && !isArtifactNode(selectedNode) ? selectedNode?.id ?? null : null;
    const suggestions = findNodeJumpSuggestions(
      this.state.workspace,
      kind === "composer" ? this.composerDraft : this.addressDraft,
      currentNodeId
    );

    if (kind === "composer") {
      this.composerSuggestions = suggestions;
    } else {
      this.addressSuggestions = suggestions;
    }

    this.refreshSuggestionPanel(kind);
  }

  refreshSuggestionPanel(kind) {
    const panel = kind === "composer" ? this.composerSuggestionsPanel : this.addressSuggestionsPanel;
    const suggestions = kind === "composer" ? this.composerSuggestions : this.addressSuggestions;

    if (!panel) {
      return;
    }

    panel.replaceChildren();
    panel.hidden = !suggestions.length;

    suggestions.forEach((suggestion) => {
      const button = createActionButton(
        this.ownerDocument,
        "",
        "nodely-shell__combo-suggestion",
        {
          action: "jump-node-suggestion",
          dataset: {
            nodeId: suggestion.nodeId
          },
          title: `Jump to node: ${suggestion.title}`
        }
      );
      const header = createHtmlElement(
        this.ownerDocument,
        "div",
        "nodely-shell__combo-suggestion-header"
      );
      const title = createHtmlElement(this.ownerDocument, "strong");
      title.textContent = suggestion.title;
      const scope = createHtmlElement(
        this.ownerDocument,
        "span",
        "nodely-shell__combo-suggestion-label"
      );
      scope.textContent = `Jump to node in ${suggestion.treeTitle || "this tree"}`;
      header.append(title, scope);
      button.append(header);

      if (suggestion.hostname) {
        const meta = createHtmlElement(
          this.ownerDocument,
          "span",
          "nodely-shell__combo-suggestion-meta"
        );
        meta.textContent = suggestion.hostname;
        button.append(meta);
      }

      panel.append(button);
    });
  }
}

function clampSplitWidth(value, windowWidth = 1366) {
  const safeWidth = Number.isFinite(value) ? value : 340;
  const maxWidth = Math.max(240, Math.round(windowWidth * 0.5));
  return Math.max(240, Math.min(maxWidth, Math.round(safeWidth)));
}

function clampToRange(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value ?? "");
}

if (!customElements.get("nodely-shell")) {
  customElements.define("nodely-shell", NodelyShell);
}

function createHtmlElement(documentRef, tagName, className = "") {
  const element = documentRef.createElementNS(HTML_NS, tagName);

  if (className) {
    element.setAttribute("class", className);
  }

  return element;
}

function createSvgElement(documentRef, tagName, attributes = {}) {
  const element = documentRef.createElementNS(SVG_NS, tagName);

  for (const [name, value] of Object.entries(attributes)) {
    if (value != null) {
      element.setAttribute(name, String(value));
    }
  }

  return element;
}

function createActionButton(documentRef, text, className, { action = "", dataset = {}, title = "", icon = null, type = "button", disabled = false } = {}) {
  const button = createHtmlElement(documentRef, "button", className);
  button.type = type;

  if (action) {
    button.dataset.action = action;
  }

  for (const [key, value] of Object.entries(dataset)) {
    if (value != null) {
      button.dataset[key] = value;
    }
  }

  if (title) {
    button.title = title;

    if (!text) {
      button.setAttribute("aria-label", title);
    }
  }

  button.disabled = disabled;

  if (icon) {
    button.classList.add("has-icon");
    appendSvgIcon(documentRef, button, icon);
  }

  if (text) {
    if (icon) {
      button.classList.add("has-icon-label");
      const label = createHtmlElement(documentRef, "span");
      label.textContent = text;
      button.append(label);
    } else {
      button.textContent = text;
    }
  }

  return button;
}

function appendSvgIcon(documentRef, element, icon) {
  if (!icon?.paths?.length) {
    return;
  }

  const svg = createSvgElement(documentRef, "svg", {
    viewBox: icon.viewBox ?? "0 0 20 20",
    "aria-hidden": "true"
  });

  for (const pathAttributes of icon.paths) {
    svg.append(createSvgElement(documentRef, "path", pathAttributes));
  }

  element.append(svg);
}

function createCountButton(documentRef, text, count, className, options = {}) {
  const button = createActionButton(documentRef, text, className, options);

  if (count > 0) {
    const badge = createHtmlElement(documentRef, "span", "nodely-shell__button-badge");
    badge.textContent = count > 99 ? "99+" : String(count);
    button.append(badge);
  }

  return button;
}

function createOption(documentRef, value, label, selected = false) {
  const option = createHtmlElement(documentRef, "option");
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  return option;
}

function createDrawerSection(documentRef, title) {
  const section = createHtmlElement(documentRef, "section", "nodely-shell__drawer-section");
  const heading = createHtmlElement(documentRef, "strong", "nodely-shell__drawer-section-title");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function createDrawerActionRow(documentRef, title, subtitle, actions = []) {
  const row = createHtmlElement(documentRef, "div", "nodely-shell__drawer-row nodely-shell__drawer-row--stacked");
  const copy = createHtmlElement(documentRef, "div", "nodely-shell__drawer-link");
  const strong = createHtmlElement(documentRef, "strong");
  strong.textContent = title;
  const span = createHtmlElement(documentRef, "span");
  span.textContent = subtitle;
  copy.append(strong, span);
  const actionRow = createHtmlElement(documentRef, "div", "nodely-shell__drawer-action-row");
  actions.forEach((action) => {
    actionRow.append(
      createActionButton(documentRef, action.label, "nodely-shell__drawer-pill", {
        action: action.action,
        dataset: action.dataset
      })
    );
  });
  row.append(copy, actionRow);
  return row;
}

function createPromptCard(documentRef, { title, body, secondary, action = null, actions = [], icon }) {
  const card = createHtmlElement(documentRef, "div", "nodely-shell__prompt-card");
  const header = createHtmlElement(documentRef, "div", "nodely-shell__prompt-card-header");
  const glyph = createHtmlElement(documentRef, "span", "nodely-shell__prompt-card-glyph");
  appendSvgIcon(documentRef, glyph, icon);
  const copy = createHtmlElement(documentRef, "div");
  const strong = createHtmlElement(documentRef, "strong");
  strong.textContent = title;
  const bodyText = createHtmlElement(documentRef, "span");
  bodyText.textContent = body;
  copy.append(strong, bodyText);
  header.append(glyph, copy);
  card.append(header);

  if (secondary) {
    const secondaryText = createHtmlElement(documentRef, "p", "nodely-shell__prompt-card-copy");
    secondaryText.textContent = secondary;
    card.append(secondaryText);
  }

  const normalizedActions = [...(action ? [action] : []), ...actions].filter(Boolean);

  if (normalizedActions.length) {
    const actionRow = createHtmlElement(documentRef, "div", "nodely-shell__drawer-action-row");
    normalizedActions.forEach((entry) => {
      actionRow.append(
        createActionButton(documentRef, entry.label, "nodely-shell__drawer-pill", {
          action: entry.action,
          dataset: entry.dataset,
          disabled: entry.disabled === true
        })
      );
    });
    card.append(actionRow);
  }

  return card;
}

function normalizeComposerAnchor(anchor) {
  if (!anchor) {
    return null;
  }

  return {
    clientX: Math.round(Number(anchor.clientX) || 0),
    clientY: Math.round(Number(anchor.clientY) || 0)
  };
}

function normalizeFloatingAnchor(anchor) {
  if (!anchor) {
    return null;
  }

  return {
    clientX: Math.round(Number(anchor.clientX) || 0),
    clientY: Math.round(Number(anchor.clientY) || 0)
  };
}

function resolveContextualComposerPosition(anchor, view, topbarHeight = 52) {
  const viewportWidth = Math.max(
    CONTEXTUAL_COMPOSER_WIDTH + CONTEXTUAL_COMPOSER_MARGIN * 2,
    Math.round(view?.innerWidth ?? 1366)
  );
  const viewportHeight = Math.max(
    CONTEXTUAL_COMPOSER_HEIGHT + topbarHeight + CONTEXTUAL_COMPOSER_MARGIN * 2,
    Math.round(view?.innerHeight ?? 768)
  );
  const width = Math.min(
    CONTEXTUAL_COMPOSER_WIDTH,
    viewportWidth - CONTEXTUAL_COMPOSER_MARGIN * 2
  );
  const minimumTop = topbarHeight + 8;
  const maximumLeft = Math.max(
    CONTEXTUAL_COMPOSER_MARGIN,
    viewportWidth - width - CONTEXTUAL_COMPOSER_MARGIN
  );
  const maximumTop = Math.max(
    minimumTop,
    viewportHeight - CONTEXTUAL_COMPOSER_HEIGHT - CONTEXTUAL_COMPOSER_MARGIN
  );

  return {
    left: clampToRange(
      (anchor?.clientX ?? 0) + CONTEXTUAL_COMPOSER_OFFSET,
      CONTEXTUAL_COMPOSER_MARGIN,
      maximumLeft
    ),
    top: clampToRange(
      (anchor?.clientY ?? 0) + CONTEXTUAL_COMPOSER_OFFSET,
      minimumTop,
      maximumTop
    ),
    width
  };
}

function resolveDropdownPosition(anchorRect, view, width = 320, height = 360, topbarHeight = 52) {
  const viewportWidth = Math.max(width + FLOATING_PANEL_MARGIN * 2, Math.round(view?.innerWidth ?? 1366));
  const viewportHeight = Math.max(height + topbarHeight + FLOATING_PANEL_MARGIN * 2, Math.round(view?.innerHeight ?? 768));
  const minimumTop = topbarHeight + 8;
  const maximumLeft = Math.max(
    FLOATING_PANEL_MARGIN,
    viewportWidth - width - FLOATING_PANEL_MARGIN
  );
  const maximumTop = Math.max(
    minimumTop,
    viewportHeight - height - FLOATING_PANEL_MARGIN
  );
  const preferredLeft =
    anchorRect.left + width + FLOATING_PANEL_MARGIN <= viewportWidth
      ? anchorRect.left
      : anchorRect.right - width;

  return {
    left: clampToRange(preferredLeft, FLOATING_PANEL_MARGIN, maximumLeft),
    top: clampToRange(anchorRect.bottom + FLOATING_PANEL_GAP, minimumTop, maximumTop)
  };
}

function resolveFloatingMenuPosition(anchor, view, width = FLOATING_MENU_WIDTH, height = 120, topbarHeight = 52) {
  const viewportWidth = Math.max(width + FLOATING_PANEL_MARGIN * 2, Math.round(view?.innerWidth ?? 1366));
  const viewportHeight = Math.max(height + topbarHeight + FLOATING_PANEL_MARGIN * 2, Math.round(view?.innerHeight ?? 768));
  const minimumTop = topbarHeight + 8;
  const maximumLeft = Math.max(
    FLOATING_PANEL_MARGIN,
    viewportWidth - width - FLOATING_PANEL_MARGIN
  );
  const maximumTop = Math.max(
    minimumTop,
    viewportHeight - height - FLOATING_PANEL_MARGIN
  );

  return {
    left: clampToRange((anchor?.clientX ?? 0) + FLOATING_PANEL_GAP, FLOATING_PANEL_MARGIN, maximumLeft),
    top: clampToRange((anchor?.clientY ?? 0) + FLOATING_PANEL_GAP, minimumTop, maximumTop)
  };
}

function showComposerHeight(workspace, composerOpen, contextualComposer = false) {
  return !contextualComposer && (composerOpen || !workspace?.nodes?.length);
}

function urlHostname(url) {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function normalizeSuggestionText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.:/-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function favoriteFolders(favorites) {
  return [...favorites]
    .filter((favorite) => favorite.kind === "folder")
    .sort(
      (left, right) =>
        String(left.title ?? "").localeCompare(String(right.title ?? "")) ||
        (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    );
}

export function findNodeJumpSuggestions(workspace, query, currentNodeId = null, limit = 5) {
  const normalizedQuery = normalizeSuggestionText(query);

  if (!workspace?.nodes?.length || normalizedQuery.length < 2) {
    return [];
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const currentNode = findNode(workspace, currentNodeId);
  const currentRootId = currentNode?.rootId ?? null;

  return workspace.nodes
    .filter((node) => !isArtifactNode(node) && node.id !== currentNodeId)
    .map((node) => {
      const title = String(node.title || "Untitled page").trim();
      const treeTitle = treeDisplayTitle(workspace, node.rootId);
      const hostname = urlHostname(node.url);
      const searchQuery = String(node.searchQuery ?? "").trim();
      const titleMatch = normalizeSuggestionText(title);
      const treeMatch = normalizeSuggestionText(treeTitle);
      const hostMatch = normalizeSuggestionText(hostname);
      const searchMatch = normalizeSuggestionText(searchQuery);
      const combined = `${titleMatch} ${treeMatch} ${hostMatch} ${searchMatch}`.trim();
      let score = 0;

      if (!combined) {
        return null;
      }

      if (titleMatch === normalizedQuery) {
        score += 120;
      }

      if (titleMatch.startsWith(normalizedQuery)) {
        score += 96;
      } else if (titleMatch.includes(normalizedQuery)) {
        score += 72;
      }

      if (treeMatch.startsWith(normalizedQuery)) {
        score += 56;
      } else if (treeMatch.includes(normalizedQuery)) {
        score += 34;
      }

      if (hostMatch.includes(normalizedQuery.replace(/\s+/gu, ""))) {
        score += 42;
      }

      if (searchMatch.includes(normalizedQuery)) {
        score += 30;
      }

      score += tokens.filter((token) => combined.includes(token)).length * 12;
      score += Math.max(0, 8 - Math.min(node.depth ?? 0, 8));
      score += currentRootId && node.rootId === currentRootId ? 10 : 0;
      score += node.lastActiveAt ? 6 : 0;

      if (score < 28) {
        return null;
      }

      return {
        nodeId: node.id,
        title,
        treeTitle,
        hostname,
        sameTree: currentRootId != null && node.rootId === currentRootId,
        score,
        updatedAt: node.updatedAt ?? 0
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.updatedAt - left.updatedAt ||
        left.title.localeCompare(right.title)
    )
    .slice(0, limit);
}

function createFaviconChip(documentRef, node, className) {
  const chip = createHtmlElement(documentRef, "span", className);
  const fallback =
    (String(node?.title || urlHostname(node?.url) || "N").trim().slice(0, 1) || "N").toUpperCase();

  if (node?.faviconUrl) {
    const image = createHtmlElement(documentRef, "img");
    image.src = node.faviconUrl;
    image.alt = "";
    image.setAttribute("loading", "eager");
    chip.append(image);
  } else {
    chip.textContent = fallback;
  }

  return chip;
}

function permissionSummaryLabel(permissions) {
  if (!permissions?.activeCount) {
    return "Permissions";
  }

  return permissions.blockedCount
    ? `${permissions.activeCount} permissions, ${permissions.blockedCount} blocked`
    : `${permissions.activeCount} permissions active`;
}

function artifactStatusCopy(node) {
  const artifact = node.artifact ?? {};
  const base =
    node.kind === "upload"
      ? "Captured from a file input on this page."
      : artifact.status === "complete"
            ? "Downloaded from this page."
            : artifact.status === "failed"
              ? "This download failed."
              : artifact.status === "canceled"
                ? "This download was canceled."
                : artifact.status === "removed"
                  ? "This download was removed from Nodely's download list."
                  : "This download is still in progress.";

  if (artifact.receivedBytes && artifact.totalBytes && artifact.receivedBytes < artifact.totalBytes) {
    return `${base} ${formatBytes(artifact.receivedBytes)} of ${formatBytes(artifact.totalBytes)} received.`;
  }

  return base;
}

function appendDefinitionRow(documentRef, list, term, value) {
  const dt = createHtmlElement(documentRef, "dt");
  dt.textContent = term;
  const dd = createHtmlElement(documentRef, "dd");
  dd.textContent = value;
  list.append(dt, dd);
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value == null || value < 0) {
    return "Unknown";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
