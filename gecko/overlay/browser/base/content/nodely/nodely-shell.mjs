import {
  buildPageFavoriteId,
  buildTreeFavoriteId,
  classifySiteCategory,
  findNode,
  findOwningPageNode,
  findRoots,
  isArtifactNode,
  orderTreeNodesForTabs,
  siteCategoryLabel,
  summarizeTreeContents,
  treeHasInitializedPage
} from "./domain.mjs";
import "./nodely-graph-surface.mjs";

const HTML_NS = "http://www.w3.org/1999/xhtml";

function iconBranch() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v8m0 0c0 2.2 1.8 4 4 4h4m-8-4c0-2.2 1.8-4 4-4h4m0-3.5A1.5 1.5 0 1 0 14 7a1.5 1.5 0 0 0 0-3Zm0 8A1.5 1.5 0 1 0 14 15a1.5 1.5 0 0 0 0-3ZM6 2.5A1.5 1.5 0 1 0 6 5.5a1.5 1.5 0 0 0 0-3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function iconStar(filled = false) {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2.8 2.25 4.56 5.03.73-3.64 3.55.86 5.01L10 14.37 5.5 16.65l.86-5.01L2.72 8.1l5.03-.73L10 2.8Z" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"></path></svg>`;
}

function iconTree(filled = false) {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.2 6.6 6h2.1L5 10h2.25L4.4 14h4.35V17h2.5v-3h4.35l-2.85-4H15L11.3 6h2.1L10 2.2Z" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"></path></svg>`;
}

function iconCanvas() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4h12v12H4Zm6-1.2v14.4M2.8 10h14.4" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"></path></svg>`;
}

function iconClose() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.2 5.2 9.6 9.6m0-9.6-9.6 9.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>`;
}

function iconFolder() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.7 5.5A1.8 1.8 0 0 1 4.5 3.7h3.1l1.25 1.5h6.65a1.8 1.8 0 0 1 1.8 1.8v7.55a1.8 1.8 0 0 1-1.8 1.8H4.5a1.8 1.8 0 0 1-1.8-1.8Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path></svg>`;
}

function iconDownload() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.2v8.5m0 0 3.2-3.2M10 11.7 6.8 8.5M3.4 14.7h13.2" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function iconUpload() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16.8V8.3m0 0 3.2 3.2M10 8.3 6.8 11.5M3.4 5.3h13.2" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function iconShield() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.6 15.7 4.7v4.6c0 3.5-2 6-5.7 8.1-3.7-2.1-5.7-4.6-5.7-8.1V4.7L10 2.6Z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"></path></svg>`;
}

function iconFind() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.7 3.1a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2Zm7.1 12.7-3.1-3.1" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function iconPrint() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.3 6.2V3.5h9.4v2.7M4.2 9h11.6A1.8 1.8 0 0 1 17.6 10.8v2.5H14.7v3.2H5.3v-3.2H2.4v-2.5A1.8 1.8 0 0 1 4.2 9Zm1.8 4.3h8m-8 2.1h6.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function iconWarning() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 3.1 7 12.3H3l7-12.3Zm0 4.1v4.4m0 2.8h.01" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

export class NodelyShell extends HTMLElement {
  constructor() {
    super();
    this.controller = null;
    this.state = { workspace: null, favorites: [], chrome: null };
    this.composerOpen = false;
    this.drawer = null;
    this.permissionsPanelOpen = false;
    this.findOpen = false;
    this.findQuery = "";
    this.printSheetOpen = false;
    this.lastSelectedNodeId = null;
    this.layoutSyncFrame = null;
    this.splitResizeState = null;
    this.splitWidthOverride = null;
    this.layoutObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
          this.scheduleLayoutSync();
        })
        : null;
    this.boundWindowKeydown = (event) => this.handleWindowKeydown(event);
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
    this.treesDrawer = createHtmlElement(
      this.ownerDocument,
      "aside",
      "nodely-shell__drawer nodely-shell__drawer--trees"
    );
    this.promptStack = createHtmlElement(
      this.ownerDocument,
      "section",
      "nodely-shell__prompt-stack"
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
      this.promptStack,
      this.treesDrawer
    );

    this.topbar.addEventListener("click", (event) => this.handleTopbarClick(event));
    this.topbar.addEventListener("change", (event) => this.handleTopbarChange(event));
    this.composer.addEventListener("submit", (event) => this.handleComposerSubmit(event));
    this.pagebar.addEventListener("click", (event) => this.handlePagebarClick(event));
    this.pagebar.addEventListener("submit", (event) => this.handleAddressSubmit(event));
    this.pagebar.addEventListener("change", (event) => this.handlePagebarChange(event));
    this.pagebar.addEventListener("input", (event) => this.handlePagebarInput(event));
    this.favoritesDrawer.addEventListener("click", (event) => this.handleFavoritesClick(event));
    this.downloadsDrawer.addEventListener("click", (event) => this.handleDownloadsClick(event));
    this.recoverDrawer.addEventListener("click", (event) => this.handleRecoverClick(event));
    this.treesDrawer.addEventListener("click", (event) => this.handleTreesClick(event));
    this.treesDrawer.addEventListener("submit", (event) => this.handleTreesSubmit(event));
    this.artifactSurface.addEventListener("click", (event) => this.handleArtifactSurfaceClick(event));
    this.promptStack.addEventListener("click", (event) => this.handlePromptStackClick(event));
    this.graph.addEventListener("nodely-select-node", (event) => {
      void this.openNodeFromGraph(event.detail.nodeId);
    });
    this.graph.addEventListener("nodely-node-moved", (event) => this.controller?.updateNodePosition(event.detail.nodeId, event.detail.position));
    this.graph.addEventListener("nodely-viewport-change", (event) => this.controller?.setViewport(event.detail.viewport));
    this.graph.addEventListener("nodely-open-composer", () => {
      this.composerOpen = true;
      this.render();
      this.composer.querySelector("input")?.focus();
    });
    this.splitHandle.addEventListener("pointerdown", (event) => this.handleSplitResizeStart(event));
    window.addEventListener("keydown", this.boundWindowKeydown);
    this.layoutObserver?.observe(this.topbar);
    this.layoutObserver?.observe(this.composer);
    this.layoutObserver?.observe(this.pagebar);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.boundWindowKeydown);

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

  toggleDrawer(drawerName) {
    this.closeInlinePanels();
    this.drawer = this.drawer === drawerName ? null : drawerName;
    this.render();
  }

  openFindPanel() {
    if (!this.hasSelectedPageNode()) {
      return false;
    }

    this.drawer = null;
    this.permissionsPanelOpen = false;
    this.printSheetOpen = false;
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
    this.permissionsPanelOpen = false;

    if (this.findOpen) {
      this.controller?.closeFind();
    }

    this.findOpen = false;
    this.printSheetOpen = true;
    this.render();
    return true;
  }

  async openNodeFromGraph(nodeId) {
    if (!nodeId || !this.controller) {
      return;
    }

    const workspace = this.state.workspace;

    if (workspace?.prefs.surfaceMode === "canvas") {
      this.closeInlinePanels();
      this.drawer = null;
      await this.controller.setSurfaceMode("page");
    }

    await this.controller.selectNode(nodeId);
  }

  dismissTransientUi() {
    if (this.drawer) {
      this.drawer = null;
      this.render();
      return true;
    }

    if (this.permissionsPanelOpen || this.findOpen || this.printSheetOpen) {
      this.closeInlinePanels();
      this.render();
      return true;
    }

    if (this.composerOpen) {
      this.composerOpen = false;
      this.render();
      return true;
    }

    return false;
  }

  render() {
    const workspace = this.state.workspace;
    const surfaceMode = workspace?.prefs.surfaceMode ?? "page";
    const selectedNode = findNode(workspace, workspace?.selectedNodeId);
    const selectedRoot = selectedNode ? findNode(workspace, selectedNode.rootId) : null;
    const favoritePageNode = selectedNode && isArtifactNode(selectedNode) ? findOwningPageNode(workspace, selectedNode) : selectedNode;
    const activePageFavoriteId = favoritePageNode ? buildPageFavoriteId(workspace.id, favoritePageNode.id) : null;
    const activeTreeFavoriteId = selectedRoot ? buildTreeFavoriteId(workspace.id, selectedRoot.id) : null;
    const activeFavoriteIds = new Set(this.state.favorites.map((favorite) => favorite.id));
    const showComposer = this.composerOpen || !workspace?.nodes?.length;

    if (this.lastSelectedNodeId !== (selectedNode?.id ?? null)) {
      this.permissionsPanelOpen = false;
      this.printSheetOpen = false;
      this.findOpen = false;
      this.findQuery = this.controller?.getFindQuery?.() ?? "";
      this.lastSelectedNodeId = selectedNode?.id ?? null;
    }

    if (!selectedNode || isArtifactNode(selectedNode)) {
      this.permissionsPanelOpen = false;
      this.printSheetOpen = false;
      this.findOpen = false;
    }

    this.renderTopbar(workspace);
    this.renderComposer(showComposer);
    this.renderPagebar(workspace, selectedNode, selectedRoot, activeFavoriteIds, activePageFavoriteId, activeTreeFavoriteId);
    this.renderArtifactSurface(workspace, selectedNode);
    this.renderFavoritesDrawer();
    this.renderDownloadsDrawer(workspace);
    this.renderRecoverDrawer(workspace);
    this.renderTreesDrawer(workspace);
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
    this.scheduleLayoutSync();
  }

  renderTopbar(workspace) {
    this.topbar.replaceChildren();
    const artifactCount = (workspace?.nodes ?? []).filter((node) => isArtifactNode(node)).length;
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

    const actions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__topbar-actions");
    const primaryActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__topbar-primary");
    primaryActions.append(
      createActionButton(this.ownerDocument, "New Root", "nodely-shell__button", { action: "toggle-composer" }),
      createActionButton(this.ownerDocument, "Center", "nodely-shell__button", { action: "center-view" }),
      createActionButton(this.ownerDocument, "Organize", "nodely-shell__button", { action: "auto-organize" }),
      createActionButton(this.ownerDocument, "Trees", `nodely-shell__button${this.drawer === "trees" ? " is-active" : ""}`, {
        action: "toggle-drawer",
        dataset: { drawer: "trees" }
      }),
      createActionButton(this.ownerDocument, "Favorites", `nodely-shell__button${this.drawer === "favorites" ? " is-active" : ""}`, {
        action: "toggle-drawer",
        dataset: { drawer: "favorites" }
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

    const segmented = createHtmlElement(this.ownerDocument, "div", "nodely-shell__segmented");
    segmented.append(
      createActionButton(this.ownerDocument, "Split", workspace?.prefs.viewMode === "split" ? "is-active" : "", {
        action: "set-view",
        dataset: { view: "split" }
      }),
      createActionButton(this.ownerDocument, "Focus", workspace?.prefs.viewMode === "focus" ? "is-active" : "", {
        action: "set-view",
        dataset: { view: "focus" }
      })
    );
    const utilities = createHtmlElement(this.ownerDocument, "div", "nodely-shell__topbar-utilities");
    utilities.append(segmented);

    const searchLabel = createHtmlElement(this.ownerDocument, "label", "nodely-shell__search");
    const searchText = createHtmlElement(this.ownerDocument, "span");
    searchText.textContent = "Default Search";
    const select = createHtmlElement(this.ownerDocument, "select");
    select.dataset.action = "search-provider";
    select.append(
      createOption(this.ownerDocument, "google", "Google", workspace?.prefs.searchProvider === "google"),
      createOption(this.ownerDocument, "wikipedia", "Wikipedia", workspace?.prefs.searchProvider === "wikipedia")
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

  renderComposer(showComposer) {
    this.composer.hidden = !showComposer;
    this.composer.toggleAttribute("data-visible", showComposer);
    this.composer.replaceChildren();

    if (!showComposer) {
      return;
    }

    const form = createHtmlElement(this.ownerDocument, "form", "nodely-shell__composer-form");
    const input = createHtmlElement(this.ownerDocument, "input", "nodely-shell__input");
    input.name = "root-input";
    input.setAttribute("placeholder", "Enter a URL or search term for a new root");
    input.setAttribute("autocomplete", "off");
    const button = createActionButton(this.ownerDocument, "Open Root", "nodely-shell__primary", { type: "submit" });
    form.append(input, button);
    this.composer.append(form);
  }

  renderPagebar(workspace, selectedNode, selectedRoot, activeFavoriteIds, activePageFavoriteId, activeTreeFavoriteId) {
    this.pagebar.hidden = !selectedNode || workspace?.prefs.surfaceMode === "canvas";
    this.pagebar.replaceChildren();

    if (!selectedNode || workspace?.prefs.surfaceMode === "canvas") {
      return;
    }

    const pageActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__page-actions");
    const pageActionsHeader = createHtmlElement(this.ownerDocument, "div", "nodely-shell__page-actions-header");
    const treeCounts = selectedRoot ? summarizeTreeContents(workspace, selectedRoot.id) : { pageCount: 0, artifactCount: 0 };
    const activeTabNodeId = isArtifactNode(selectedNode) ? findOwningPageNode(workspace, selectedNode)?.id ?? null : selectedNode.id;
    const closeSurfaceButton = createActionButton(this.ownerDocument, "", "nodely-shell__button nodely-shell__button--surface nodely-shell__surface-close", {
      action: "set-surface",
      dataset: { surface: "canvas" },
      title: "Return to the canvas",
      html: `${iconCanvas()}<span>Canvas</span>`
    });
    const selectedNodeActions = createHtmlElement(this.ownerDocument, "div", "nodely-shell__inline-actions");
    selectedNodeActions.append(closeSurfaceButton);

    if (selectedNode.parentId !== null) {
      selectedNodeActions.append(
        createActionButton(this.ownerDocument, "Kill Node", "nodely-shell__drawer-pill is-danger", {
          action: "kill-node",
          dataset: { nodeId: selectedNode.id }
        })
      );
    }

    if (isArtifactNode(selectedNode)) {
      const artifactBar = createHtmlElement(this.ownerDocument, "div", "nodely-shell__artifact-bar");
      const artifactSummary = createHtmlElement(this.ownerDocument, "div", "nodely-shell__artifact-summary");
      const artifactGlyph = createHtmlElement(this.ownerDocument, "span", "nodely-shell__artifact-glyph");
      artifactGlyph.innerHTML = selectedNode.kind === "upload" ? iconUpload() : iconDownload();
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
      pageActionsHeader.append(artifactBar, selectedNodeActions);
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

      const addressForm = createHtmlElement(this.ownerDocument, "form", "nodely-shell__address-form");
      const addressInput = createHtmlElement(this.ownerDocument, "input", "nodely-shell__input nodely-shell__address-input");
      addressInput.name = "address";
      addressInput.value = selectedNode.url || "";
      addressInput.setAttribute("placeholder", "Enter a URL or search term");
      addressInput.setAttribute("autocomplete", "off");

      const favoritePageButton = createActionButton(this.ownerDocument, "", `nodely-shell__icon-button${activeFavoriteIds.has(activePageFavoriteId) ? " is-active" : ""}`, {
        action: "toggle-page-favorite",
        title: "Favorite page",
        html: iconStar(activeFavoriteIds.has(activePageFavoriteId))
      });
      const branchButton = createActionButton(this.ownerDocument, "", `nodely-shell__icon-button${workspace.prefs.captureNextNavigation ? " is-active" : ""}`, {
        action: "toggle-branch-next",
        title: "Branch next",
        html: iconBranch()
      });
      const permissionsButton = createActionButton(
        this.ownerDocument,
        "",
        `nodely-shell__icon-button nodely-shell__permissions-button${selectedNode.permissions?.activeCount ? " has-count" : ""}`,
        {
          action: "toggle-permissions-panel",
          title: permissionSummaryLabel(selectedNode.permissions),
          html: iconShield()
        }
      );
      const findButton = createActionButton(this.ownerDocument, "", `nodely-shell__icon-button${this.findOpen ? " is-active" : ""}`, {
        action: "toggle-find",
        title: "Find in page",
        html: iconFind()
      });
      const printButton = createActionButton(this.ownerDocument, "", `nodely-shell__icon-button${this.printSheetOpen ? " is-active" : ""}`, {
        action: "toggle-print",
        title: "Print page",
        html: iconPrint()
      });

      if (selectedNode.permissions?.activeCount) {
        const count = createHtmlElement(this.ownerDocument, "span", "nodely-shell__icon-count");
        count.textContent = String(selectedNode.permissions.activeCount);
        permissionsButton.append(count);
      }

      addressForm.append(
        addressInput,
        favoritePageButton,
        branchButton,
        permissionsButton,
        findButton,
        printButton
      );

      surfaceMain.append(navGroup, addressForm);
      pageActionsHeader.append(surfaceMain, selectedNodeActions);
      pageActions.append(pageActionsHeader);

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
    }

    const treeStrip = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-strip");
    const treeHeader = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tree-header");
    const treeHeading = createHtmlElement(this.ownerDocument, "div");
    const treeTitle = createHtmlElement(this.ownerDocument, "strong");
    treeTitle.textContent = selectedRoot?.title || "Tree";
    const treeMeta = createHtmlElement(this.ownerDocument, "span");
    treeMeta.textContent = `${treeCounts.pageCount} pages${treeCounts.artifactCount ? ` • ${treeCounts.artifactCount} files` : ""}`;
    treeHeading.append(treeTitle, treeMeta);
    treeHeader.append(treeHeading);
    treeHeader.append(
      createActionButton(this.ownerDocument, "", `nodely-shell__icon-button${activeFavoriteIds.has(activeTreeFavoriteId) ? " is-active" : ""}`, {
        action: "toggle-tree-favorite",
        disabled: !(selectedRoot && treeHasInitializedPage(workspace, selectedRoot.id)),
        title: "Favorite tree",
        html: iconTree(activeFavoriteIds.has(activeTreeFavoriteId))
      })
    );

    const tabs = createHtmlElement(this.ownerDocument, "div", "nodely-shell__tabs");
    if (selectedRoot) {
      for (const node of orderTreeNodesForTabs(workspace, selectedRoot.id)) {
        const category = classifySiteCategory(node.url);
        const tab = createActionButton(
          this.ownerDocument,
          "",
          `nodely-shell__tab${node.id === activeTabNodeId ? " is-active" : ""} nodely-shell__tab--${category}`,
          {
            action: "select-node",
            dataset: { nodeId: node.id }
          }
        );
        const label = createHtmlElement(this.ownerDocument, "strong");
        label.textContent = node.title || "Untitled";
        const categoryText = createHtmlElement(this.ownerDocument, "span");
        categoryText.textContent = siteCategoryLabel(category);
        tab.append(label, categoryText);
        tabs.append(tab);
      }
    }

    treeStrip.append(treeHeader, tabs);
    this.pagebar.append(pageActions, treeStrip);

    if (workspace.prefs.viewMode === "focus" && workspace.prefs.showFocusHint !== false) {
      const focusHint = createHtmlElement(this.ownerDocument, "div", "nodely-shell__focus-hint");
      const hintCopy = createHtmlElement(this.ownerDocument, "div");
      const hintTitle = createHtmlElement(this.ownerDocument, "strong");
      hintTitle.textContent = "Focus Mode";
      const hintText = createHtmlElement(this.ownerDocument, "p");
      hintText.textContent = "The page now uses the full browser content area. Use the X button to hide the page and return to the canvas.";
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
    badge.innerHTML = selectedNode.kind === "upload" ? `${iconUpload()} Upload` : `${iconDownload()} Download`;
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
    header.append(title);

    const body = createHtmlElement(this.ownerDocument, "div", "nodely-shell__drawer-body");

    if (this.state.favorites.length) {
      for (const favorite of this.state.favorites) {
        const row = createHtmlElement(this.ownerDocument, "div", `nodely-shell__drawer-row nodely-shell__drawer-row--${favorite.category}`);
        const link = createActionButton(this.ownerDocument, "", "nodely-shell__drawer-link", {
          action: "open-favorite",
          dataset: { favoriteId: favorite.id }
        });
        const strong = createHtmlElement(this.ownerDocument, "strong");
        strong.textContent = favorite.title;
        const span = createHtmlElement(this.ownerDocument, "span");
        span.textContent = favorite.kind === "tree" ? "Tree" : favorite.url || "Page";
        link.append(strong, span);
        row.append(
          link,
          createActionButton(this.ownerDocument, "Remove", "nodely-shell__drawer-pill", {
            action: "remove-favorite",
            dataset: { favoriteId: favorite.id }
          })
        );
        body.append(row);
      }
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

  renderTreesDrawer(workspace) {
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
        input.value = root.title || "Untitled thread";
        form.append(
          input,
          createActionButton(this.ownerDocument, "Show", "nodely-shell__drawer-pill", {
            action: "show-tree",
            dataset: { rootId: root.id }
          }),
          createActionButton(this.ownerDocument, "Save", "nodely-shell__drawer-pill", { type: "submit" }),
          createActionButton(this.ownerDocument, "Kill", "nodely-shell__drawer-pill is-danger", {
            action: "delete-tree",
            dataset: { rootId: root.id }
          })
        );
        body.append(form);
      }
    }

    this.treesDrawer.append(header, body);
  }

  renderPromptStack() {
    this.promptStack.replaceChildren();

    const transientAuth = this.state.chrome?.transientAuth ?? null;
    const authPrompt = this.state.chrome?.authPrompt ?? null;
    const externalProtocol = this.state.chrome?.externalProtocol ?? null;

    if (!transientAuth && !authPrompt && !externalProtocol) {
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
          action:
            transientAuth.parentNodeId != null
              ? {
                  label: "Show Node",
                  action: "show-node",
                  dataset: { nodeId: transientAuth.parentNodeId }
                }
              : null,
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
          action:
            authPrompt.nodeId != null
              ? {
                  label: "Show Node",
                  action: "show-node",
                  dataset: { nodeId: authPrompt.nodeId }
                }
              : null,
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
          action:
            externalProtocol.nodeId != null
              ? {
                  label: "Show Node",
                  action: "show-node",
                  dataset: { nodeId: externalProtocol.nodeId }
                }
              : null,
          icon: iconWarning()
        })
      );
    }
  }

  syncDocumentLayout(workspace, selectedNode) {
    const root = document.documentElement;
    const isEmptyWorkspace = !workspace?.nodes?.length;
    const topbarHeight = Math.round(this.topbar?.getBoundingClientRect?.().height ?? 52);
    const composerHeight = showComposerHeight(workspace, this.composerOpen) && !this.composer.hidden
      ? Math.round(this.composer?.getBoundingClientRect?.().height ?? 52)
      : 0;
    const pagebarHeight =
      selectedNode && !this.pagebar.hidden
        ? Math.round(this.pagebar?.getBoundingClientRect?.().height ?? 0)
        : 0;
    const splitWidth = this.splitWidthOverride ?? workspace?.prefs.splitWidth ?? 340;
    const surfaceMode = workspace?.prefs.surfaceMode ?? "page";
    const graphWidth =
      isEmptyWorkspace || surfaceMode === "canvas"
        ? "100vw"
        : workspace?.prefs.viewMode === "split"
          ? `${splitWidth}px`
          : "0px";
    const browserSurfaceMode =
      this.drawer || (surfaceMode === "page" && selectedNode && isArtifactNode(selectedNode))
        ? "overlay"
        : isEmptyWorkspace || surfaceMode === "canvas"
          ? "canvas"
          : "page";
    root.setAttribute("nodely-active", "true");
    root.setAttribute("nodely-view", workspace?.prefs.viewMode ?? "split");
    root.setAttribute("nodely-surface-mode", surfaceMode);
    root.setAttribute("nodely-empty-workspace", isEmptyWorkspace ? "true" : "false");
    root.setAttribute("nodely-drawer", this.drawer ?? "");
    root.setAttribute("nodely-browser-surface", browserSurfaceMode);
    root.style.setProperty("--nodely-topbar-height", `${topbarHeight}px`);
    root.style.setProperty("--nodely-pagebar-height", `${pagebarHeight}px`);
    root.style.setProperty("--nodely-graph-width", graphWidth);
    root.style.setProperty("--nodely-composer-height", `${composerHeight}px`);
    this.graph.style.width = graphWidth;
    this.graph.style.top = `${topbarHeight + composerHeight + pagebarHeight}px`;
    this.splitHandle.style.top = `${topbarHeight + composerHeight + pagebarHeight}px`;
    this.artifactSurface.style.top = `${topbarHeight + composerHeight + pagebarHeight}px`;
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
    });
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
      this.composerOpen = !this.composerOpen;
      if (this.composerOpen) {
        this.drawer = null;
      }
      this.render();
      this.composer.querySelector("input")?.focus();
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
      this.controller?.createRootFromInput(input.value);
      this.composerOpen = false;
      this.render();
    }
  }

  handleAddressSubmit(event) {
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

    if (action === "toggle-tree-favorite") {
      const selectedNode = findNode(this.state.workspace, this.state.workspace?.selectedNodeId);
      if (selectedNode) {
        this.controller?.toggleTreeFavorite(selectedNode.rootId);
      }
      return;
    }

    if (action === "toggle-branch-next") {
      this.controller?.setCaptureNextNavigation(!this.state.workspace.prefs.captureNextNavigation);
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

    if (action === "set-view") {
      this.controller?.setViewMode(button.dataset.view);
      return;
    }

    if (action === "set-surface") {
      this.closeInlinePanels();
      this.controller?.setSurfaceMode(button.dataset.surface);
      return;
    }

    if (action === "select-node") {
      void this.openNodeFromGraph(button.dataset.nodeId);
      return;
    }

    if (action === "hide-focus-hint") {
      this.controller?.setShowFocusHint(false);
    }
  }

  handlePagebarChange(_event) {}

  handlePagebarInput(event) {
    const input = event.target.closest("input[name='find-query']");

    if (!input) {
      return;
    }

    this.findQuery = input.value;
    this.controller?.findInPage(this.findQuery);
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
    }
  }

  handleDownloadsClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    switch (button.dataset.action) {
      case "show-artifact-node":
        this.controller?.selectNode(button.dataset.nodeId);
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
        this.controller?.selectNode(button.dataset.nodeId);
        this.graph.centerOnNode(button.dataset.nodeId);
        break;
      default:
        break;
    }
  }

  handleTreesClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    if (button.dataset.action === "show-tree") {
      this.controller?.selectNode(button.dataset.rootId);
      this.graph.centerOnNode(button.dataset.rootId);
      return;
    }

    if (button.dataset.action === "delete-tree") {
      this.controller?.deleteTree(button.dataset.rootId);
    }
  }

  handleTreesSubmit(event) {
    const form = event.target.closest("form[data-root-id]");

    if (!form) {
      return;
    }

    event.preventDefault();
    const input = form.querySelector("input[name='title']");
    this.controller?.renameTree(form.dataset.rootId, input.value);
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
    const button = event.target.closest("[data-action='show-node']");

    if (!button) {
      return;
    }

    this.controller?.selectNode(button.dataset.nodeId);
    this.graph.centerOnNode(button.dataset.nodeId);
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
      }
      return;
    }

    if (isTextEntry) {
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
}

function clampSplitWidth(value, windowWidth = 1366) {
  const safeWidth = Number.isFinite(value) ? value : 340;
  const maxWidth = Math.max(360, Math.min(640, Math.round(windowWidth * 0.5)));
  return Math.max(240, Math.min(maxWidth, Math.round(safeWidth)));
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

function createActionButton(documentRef, text, className, { action = "", dataset = {}, title = "", html = "", type = "button", disabled = false } = {}) {
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
  }

  button.disabled = disabled;

  if (html) {
    button.innerHTML = html;
  } else {
    button.textContent = text;
  }

  return button;
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

function createPromptCard(documentRef, { title, body, secondary, action, icon }) {
  const card = createHtmlElement(documentRef, "div", "nodely-shell__prompt-card");
  const header = createHtmlElement(documentRef, "div", "nodely-shell__prompt-card-header");
  const glyph = createHtmlElement(documentRef, "span", "nodely-shell__prompt-card-glyph");
  glyph.innerHTML = icon;
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

  if (action) {
    card.append(
      createActionButton(documentRef, action.label, "nodely-shell__drawer-pill", {
        action: action.action,
        dataset: action.dataset
      })
    );
  }

  return card;
}

function showComposerHeight(workspace, composerOpen) {
  return composerOpen || !workspace?.nodes?.length;
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
