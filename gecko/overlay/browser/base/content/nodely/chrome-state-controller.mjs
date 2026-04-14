import {
  applyNodeNavigation,
  autoOrganizeWorkspace,
  buildPageFavoriteEntry,
  buildTreeFavoriteId,
  buildTreeFavoriteEntry,
  createChildNode as createPageChildNode,
  createRootNode,
  findNode,
  findOwningPageNode,
  findRoots,
  isFreshRootNode,
  isArtifactNode,
  killNode as removeNodeFromWorkspace,
  relayoutWorkspace,
  refreshAutoTreeTitles,
  refreshTreeFavoriteEntries,
  removeTree,
  renameTree,
  resolveFavoriteOpenPlan,
  resolveOmniboxInput,
  selectNode,
  setCaptureNextNavigation,
  setSearchProvider,
  setThemeMode,
  setShowFocusHint,
  setSurfaceMode,
  setSplitWidth,
  setViewMode,
  setViewport,
  snapNodePosition,
  treeHasInitializedPage,
  upsertArtifactNode,
  updateNodeMetadata
} from "./domain.mjs";

export class ChromeStateController extends EventTarget {
  constructor({ workspaceStore, favoritesStore, runtimeManager, basicsBridge }) {
    super();
    this.workspaceStore = workspaceStore;
    this.favoritesStore = favoritesStore;
    this.runtimeManager = runtimeManager;
    this.basicsBridge = basicsBridge;
    this.workspace = null;
    this.workspacePersistChain = Promise.resolve();
    this.treeTitleRefreshTimer = null;
    this.treeTitleRefreshChain = Promise.resolve();
    this.favorites = [];
    this.chrome = createChromeState();
    this.basicsBridge.callbacks = {
      ...(this.basicsBridge.callbacks ?? {}),
      onDownloadObserved: (download) => this.handleDownloadObserved(download),
      onUploadObserved: (upload) => this.handleUploadObserved(upload),
      onSessionRecoveryChanged: (sessionRecovery) =>
        this.handleSessionRecoveryChanged(sessionRecovery),
      onAuthPromptChanged: (authPrompt) => this.handleAuthPromptChanged(authPrompt),
      onExternalProtocolChanged: (externalProtocol) =>
        this.handleExternalProtocolChanged(externalProtocol),
      onBrowserCrashed: (crash) => this.handleBrowserCrashed(crash)
    };
    this.runtimeManager.callbacks.onNodeMetaChanged = (nodeId, metadata) => this.handleNodeMetaChanged(nodeId, metadata);
    this.runtimeManager.callbacks.onNodeSelected = (nodeId) => this.handleRuntimeNodeSelected(nodeId);
    this.runtimeManager.callbacks.onForeignOpenPending = (details) => this.handleForeignOpenPending(details);
    this.runtimeManager.callbacks.onForeignOpenCancelled = (details) => this.handleForeignOpenCancelled(details);
    this.runtimeManager.callbacks.onForeignTabOpen = (tab, details) => this.handleForeignTabOpen(tab, details);
    this.runtimeManager.callbacks.onTransientAuthChanged = (details) => this.handleTransientAuthChanged(details);
  }

  trace(stage, details = {}) {
    const payload = JSON.stringify(details);

    try {
      dump(`[nodely] controller:${stage} ${payload}\n`);
    } catch {}

    try {
      console.info(`[nodely] controller:${stage}`, details);
    } catch {}
  }

  getState() {
    return {
      workspace: this.workspace,
      favorites: this.favorites,
      chrome: {
        ...this.chrome,
        crashedNodes: this.workspace
          ? this.workspace.nodes
              .filter((node) => node.runtimeState === "crashed")
              .map((node) => ({
                id: node.id,
                rootId: node.rootId,
                title: node.title || node.url || "Crashed page",
                url: node.url ?? null,
                updatedAt: node.updatedAt
              }))
          : []
      }
    };
  }

  emitStateChange() {
    this.dispatchEvent(new CustomEvent("state-changed", { detail: this.getState() }));
  }

  async initialize() {
    this.trace("initialize:start");
    this.runtimeManager.attach();
    await this.basicsBridge.attach?.();
    this.workspace = relayoutWorkspace(await this.workspaceStore.loadWorkspace());
    this.favorites = await this.favoritesStore.listFavorites();
    this.chrome.sessionRecovery = this.basicsBridge.getSessionRecoveryState?.() ?? createChromeState().sessionRecovery;
    this.trace("initialize:workspace-loaded", {
      nodeCount: this.workspace.nodes.length,
      selectedNodeId: this.workspace.selectedNodeId,
      viewMode: this.workspace.prefs.viewMode
    });
    this.emitStateChange();
    this.scheduleTreeTitleRefresh();
    await this.restoreSelectedNodeRuntime();
    this.trace("initialize:complete", {
      selectedNodeId: this.workspace.selectedNodeId
    });
  }

  async persistWorkspace(nextWorkspaceOrUpdater, { scheduleTreeTitleRefresh = true } = {}) {
    let persistedWorkspace = this.workspace;

    this.workspacePersistChain = this.workspacePersistChain
      .catch(() => {})
      .then(async () => {
        const nextWorkspace =
          typeof nextWorkspaceOrUpdater === "function"
            ? nextWorkspaceOrUpdater(this.workspace)
            : nextWorkspaceOrUpdater;
        this.workspace = await this.workspaceStore.saveWorkspace(nextWorkspace);
        this.emitStateChange();
        if (scheduleTreeTitleRefresh) {
          this.scheduleTreeTitleRefresh();
        }
        persistedWorkspace = this.workspace;
        return this.workspace;
      });

    await this.workspacePersistChain;
    return persistedWorkspace;
  }

  scheduleTreeTitleRefresh() {
    if (!this.workspace?.nodes?.length) {
      return;
    }

    if (this.treeTitleRefreshTimer != null) {
      globalThis.clearTimeout?.(this.treeTitleRefreshTimer);
    }

    this.treeTitleRefreshTimer = globalThis.setTimeout?.(() => {
      this.treeTitleRefreshTimer = null;
      void this.runTreeTitleRefresh();
    }, 260);
  }

  async runTreeTitleRefresh() {
    this.treeTitleRefreshChain = this.treeTitleRefreshChain
      .catch(() => {})
      .then(async () => {
        if (!this.workspace?.nodes?.length) {
          return;
        }

        if (typeof globalThis.requestIdleCallback === "function") {
          await new Promise((resolve) => globalThis.requestIdleCallback(resolve, { timeout: 600 }));
        } else {
          await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
        }

        const nextWorkspace = refreshAutoTreeTitles(this.workspace);

        if (nextWorkspace === this.workspace) {
          return;
        }

        await this.persistWorkspace(nextWorkspace, {
          scheduleTreeTitleRefresh: false
        });
        await this.syncTreeFavorites(this.workspace);
      });

    await this.treeTitleRefreshChain;
  }

  async createRootFromInput(input, options = {}) {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    let nextWorkspace = createRootNode(this.workspace);
    const rootNode = findNode(nextWorkspace, nextWorkspace.selectedNodeId);
    const resolution = resolveOmniboxInput(trimmed, nextWorkspace.prefs.searchProvider);
    nextWorkspace = applyNodeNavigation(nextWorkspace, rootNode.id, resolution);

    if (options.position) {
      nextWorkspace = {
        ...nextWorkspace,
        nodes: nextWorkspace.nodes.map((node) =>
          node.id === rootNode.id
            ? {
                ...node,
                position: snapNodePosition(nextWorkspace, rootNode.id, options.position),
                manualPosition: true
              }
            : node
        )
      };
    }

    nextWorkspace = relayoutWorkspace(nextWorkspace);
    nextWorkspace = setSurfaceMode(nextWorkspace, "page");
    await this.persistWorkspace(nextWorkspace);
    this.runtimeManager.loadNode(findNode(nextWorkspace, rootNode.id), resolution.url);
    this.trace("create-root", {
      nodeId: rootNode.id,
      url: resolution.url,
      kind: resolution.kind,
      viewMode: nextWorkspace.prefs.viewMode
    });
  }

  async createChildNode({ background = false, parentNodeId = null, url = null, origin = "manual" } = {}) {
    const parentNode = findNode(this.workspace, parentNodeId ?? this.workspace.selectedNodeId);
    const anchorNode = isArtifactNode(parentNode) ? findOwningPageNode(this.workspace, parentNode) : parentNode;

    if (!anchorNode) {
      return;
    }

    let nextWorkspace = createPageChildNode(this.workspace, anchorNode.id, origin, {
      selectChild: !background
    });

    const childNode = findNode(nextWorkspace, nextWorkspace.nodes.at(-1)?.id ?? null);

    if (url) {
      const resolution = resolveOmniboxInput(url, nextWorkspace.prefs.searchProvider);
      nextWorkspace = applyNodeNavigation(nextWorkspace, childNode.id, resolution);
    }

    nextWorkspace = relayoutWorkspace(nextWorkspace);
    if (!background) {
      nextWorkspace = setSurfaceMode(nextWorkspace, "page");
    }
    await this.persistWorkspace(nextWorkspace);

    const persistedChildNode = findNode(nextWorkspace, childNode.id);

    if (url) {
      this.runtimeManager.loadNode(persistedChildNode, persistedChildNode.url, { background });
    } else {
      this.runtimeManager.ensureRuntime(persistedChildNode, { background });
    }

    if (!background) {
      this.runtimeManager.selectNode(persistedChildNode.id);
    }

    this.trace("create-child", {
      parentId: anchorNode.id,
      childId: childNode.id,
      background,
      origin,
      url
    });
  }

  async submitAddress(input) {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    const selectedNode = findNode(this.workspace, this.workspace.selectedNodeId);
    const addressTarget = isArtifactNode(selectedNode) ? findOwningPageNode(this.workspace, selectedNode) : selectedNode;

    if (!addressTarget) {
      await this.createRootFromInput(trimmed);
      return;
    }

    const resolution = resolveOmniboxInput(trimmed, this.workspace.prefs.searchProvider);

    if (isFreshRootNode(addressTarget)) {
      let nextWorkspace = applyNodeNavigation(this.workspace, addressTarget.id, resolution);
      nextWorkspace = relayoutWorkspace(nextWorkspace);
      nextWorkspace = setSurfaceMode(nextWorkspace, "page");
      await this.persistWorkspace(nextWorkspace);
      this.runtimeManager.loadNode(findNode(nextWorkspace, addressTarget.id), resolution.url);
      return;
    }

    if (this.workspace.prefs.captureNextNavigation) {
      let nextWorkspace = createPageChildNode(this.workspace, addressTarget.id, resolution.origin);
      const childNode = findNode(nextWorkspace, nextWorkspace.selectedNodeId);
      nextWorkspace = applyNodeNavigation(nextWorkspace, childNode.id, resolution);
      nextWorkspace = setCaptureNextNavigation(nextWorkspace, false);
      nextWorkspace = relayoutWorkspace(nextWorkspace);
      nextWorkspace = setSurfaceMode(nextWorkspace, "page");
      await this.persistWorkspace(nextWorkspace);
      this.runtimeManager.loadNode(findNode(nextWorkspace, childNode.id), resolution.url);
      return;
    }

    let nextWorkspace = applyNodeNavigation(this.workspace, addressTarget.id, resolution);
    nextWorkspace = setSurfaceMode(nextWorkspace, "page");
    nextWorkspace = await this.persistWorkspace(nextWorkspace);
    this.runtimeManager.loadNode(findNode(nextWorkspace, addressTarget.id), resolution.url);
  }

  async selectNode(nodeId, options = {}) {
    return this.revealNode(nodeId, {
      fromRuntime: options.fromRuntime === true,
      ensureRuntime: options.ensureRuntime !== false
    });
  }

  async handleRuntimeNodeSelected(nodeId) {
    if (this.workspace?.selectedNodeId !== nodeId) {
      await this.selectNode(nodeId, { fromRuntime: true });
      return;
    }

    await this.refreshSelectedPermissions(this.workspace, findNode(this.workspace, nodeId));
  }

  async handleNodeMetaChanged(nodeId, metadata) {
    const currentNode = findNode(this.workspace, nodeId);

    if (!currentNode) {
      return;
    }

    if (!hasMeaningfulNodeMetadataChange(currentNode, metadata)) {
      this.trace("metadata:skip", {
        nodeId,
        transientStartupUrl: metadata.transientStartupUrl ?? null
      });
      return;
    }

    this.trace("metadata:apply", {
      nodeId,
      url: metadata.url ?? currentNode.url,
      transientStartupUrl: metadata.transientStartupUrl ?? null,
      runtimeState: metadata.runtimeState ?? currentNode.runtimeState
    });
    const nextWorkspace = await this.persistWorkspace((workspace) => {
      if (!findNode(workspace, nodeId)) {
        return workspace;
      }

      return updateNodeMetadata(workspace, nodeId, metadata);
    });
    if (nextWorkspace.selectedNodeId === nodeId) {
      await this.refreshSelectedPermissions(nextWorkspace, findNode(nextWorkspace, nodeId));
    }
  }

  async handleForeignTabOpen(tab, details) {
    const openerNode = findNode(this.workspace, details.parentNodeId);
    const parentNode = isArtifactNode(openerNode) ? findOwningPageNode(this.workspace, openerNode) : openerNode;

    if (!parentNode) {
      this.trace("foreign-tab-ignored", {
        reason: "missing-parent",
        parentNodeId: details.parentNodeId ?? null
      });
      return;
    }

    let nextWorkspace = relayoutWorkspace(
      createPageChildNode(this.workspace, parentNode.id, "window-open", {
        selectChild: !details.background
      })
    );
    let childNode = nextWorkspace.nodes.at(-1);

    if (childNode && (details.url || details.title)) {
      nextWorkspace = updateNodeMetadata(nextWorkspace, childNode.id, {
        title: details.title ?? null,
        url: details.url ?? null,
        runtimeState: details.url ? "live" : "loading"
      });
      childNode = findNode(nextWorkspace, childNode.id);
    }

    await this.persistWorkspace(
      details.background ? nextWorkspace : setSurfaceMode(nextWorkspace, "page")
    );
    this.runtimeManager.adoptOpenedTab(childNode.id, tab);

    if (!details.background) {
      this.runtimeManager.selectNode(childNode.id);
    }

    this.trace("foreign-tab-adopted", {
      parentId: parentNode.id,
      childId: childNode.id,
      background: details.background
    });
  }

  handleForeignOpenPending(details) {
    this.trace("foreign-open-pending", {
      kind: details?.kind ?? "tab",
      parentNodeId: details?.parentNodeId ?? null,
      background: details?.background === true
    });
  }

  handleForeignOpenCancelled(details) {
    this.trace("foreign-open-cancelled", {
      kind: details?.kind ?? "tab",
      parentNodeId: details?.parentNodeId ?? null
    });
  }

  async updateNodePosition(nodeId, position) {
    const nextWorkspace = {
      ...this.workspace,
      nodes: this.workspace.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              position: snapNodePosition(this.workspace, nodeId, position),
              manualPosition: true
            }
          : node
      )
    };

    await this.persistWorkspace(nextWorkspace);
  }

  async autoOrganize() {
    await this.persistWorkspace(autoOrganizeWorkspace(this.workspace));
  }

  async renameTree(rootId, title) {
    await this.persistWorkspace(renameTree(this.workspace, rootId, title));
    await this.syncTreeFavorites(this.workspace);
  }

  async deleteTree(rootId) {
    const treeNodeIds = this.workspace.nodes.filter((node) => node.rootId === rootId).map((node) => node.id);
    await this.favoritesStore.removeTreeFavorites(this.workspace.id, rootId, treeNodeIds);
    this.favorites = await this.favoritesStore.listFavorites();
    await this.persistWorkspace(removeTree(this.workspace, rootId));
  }

  async killNode(nodeId = this.workspace?.selectedNodeId) {
    const node = findNode(this.workspace, nodeId);

    if (!node) {
      return;
    }

    const {
      workspace: nextWorkspace,
      removedNodeIds,
      invalidatedNodeIds = removedNodeIds
    } = removeNodeFromWorkspace(this.workspace, node.id);

    if (!removedNodeIds.length && !invalidatedNodeIds.length) {
      return;
    }

    if (invalidatedNodeIds.length) {
      this.favorites = await this.favoritesStore.removeNodeFavorites(
        this.workspace.id,
        invalidatedNodeIds
      );
    }

    if (node.parentId === null && !findNode(nextWorkspace, node.id)) {
      this.favorites = await this.favoritesStore.removeFavorite(
        buildTreeFavoriteId(this.workspace.id, node.id)
      );
    }

    const persistedWorkspace = await this.persistWorkspace(relayoutWorkspace(nextWorkspace));
    const selectedNode = findNode(persistedWorkspace, persistedWorkspace.selectedNodeId);

    if (persistedWorkspace.prefs.surfaceMode === "page" && selectedNode && !isArtifactNode(selectedNode)) {
      await this.ensureNodeRuntime(selectedNode);
    }

    await this.refreshSelectedPermissions(persistedWorkspace, selectedNode);
    this.runtimeManager.closeNodeRuntime(node.id);
    this.trace("kill-node", {
      nodeId: node.id,
      removedNodeIds,
      invalidatedNodeIds,
      selectedNodeId: persistedWorkspace.selectedNodeId
    });
  }

  async togglePageFavorite() {
    const node = findNode(this.workspace, this.workspace.selectedNodeId);

    if (!node?.url || isArtifactNode(node)) {
      return;
    }

    this.favorites = await this.favoritesStore.toggleFavorite(buildPageFavoriteEntry(this.workspace, node));
    this.emitStateChange();
  }

  async toggleTreeFavorite(rootId) {
    if (!treeHasInitializedPage(this.workspace, rootId)) {
      return;
    }

    this.favorites = await this.favoritesStore.toggleFavorite(buildTreeFavoriteEntry(this.workspace, rootId));
    this.emitStateChange();
  }

  async syncTreeFavorites(workspace = this.workspace) {
    const nextFavorites = refreshTreeFavoriteEntries(this.favorites, workspace);

    if (nextFavorites === this.favorites) {
      return;
    }

    this.favorites = await this.favoritesStore.saveFavorites(nextFavorites);
    this.emitStateChange();
  }

  async openFavorite(favoriteId) {
    const favorite = this.favorites.find((entry) => entry.id === favoriteId);

    if (!favorite) {
      return;
    }

    const openPlan = resolveFavoriteOpenPlan(this.workspace, favorite);

    if (openPlan.action === "select-node") {
      await this.selectNode(openPlan.nodeId);
      return;
    }

    if (openPlan.action === "select-root") {
      await this.selectNode(openPlan.rootId);
      return;
    }

    if (openPlan.url) {
      await this.createRootFromInput(openPlan.url);
    }
  }

  async removeFavorite(favoriteId) {
    this.favorites = await this.favoritesStore.removeFavorite(favoriteId);
    this.emitStateChange();
  }

  async setViewMode(viewMode) {
    await this.persistWorkspace(setViewMode(this.workspace, viewMode));
  }

  async setSurfaceMode(surfaceMode) {
    await this.persistWorkspace(setSurfaceMode(this.workspace, surfaceMode));
  }

  async setSearchProvider(searchProvider) {
    await this.persistWorkspace(setSearchProvider(this.workspace, searchProvider));
  }

  async setThemeMode(themeMode) {
    await this.persistWorkspace(setThemeMode(this.workspace, themeMode));
  }

  async setCaptureNextNavigation(captureNextNavigation) {
    await this.persistWorkspace(setCaptureNextNavigation(this.workspace, captureNextNavigation));
  }

  async setShowFocusHint(showFocusHint) {
    await this.persistWorkspace(setShowFocusHint(this.workspace, showFocusHint));
  }

  async setViewport(viewport) {
    await this.persistWorkspace(setViewport(this.workspace, viewport));
  }

  async setSplitWidth(splitWidth) {
    await this.persistWorkspace(setSplitWidth(this.workspace, splitWidth));
  }

  async restoreSelectedNodeRuntime() {
    const selectedNode =
      findNode(this.workspace, this.workspace?.selectedNodeId) ??
      (this.workspace ? findRoots(this.workspace)[0] ?? null : null);

    if (!selectedNode) {
      return;
    }

    this.trace("restore-runtime:start", {
      selectedNodeId: selectedNode.id,
      selectedNodeUrl: selectedNode.url
    });

    if (selectedNode.id !== this.workspace.selectedNodeId) {
      this.workspace = selectNode(this.workspace, selectedNode.id);
      await this.workspaceStore.saveWorkspace(this.workspace);
      this.emitStateChange();
    }

    await this.ensureNodeRuntime(isArtifactNode(selectedNode) ? findOwningPageNode(this.workspace, selectedNode) : selectedNode);
    await this.refreshSelectedPermissions(this.workspace, selectedNode);
    this.trace("restore-runtime:complete", {
      selectedNodeId: selectedNode.id,
      selectedNodeUrl: selectedNode.url
    });
  }

  async revealNode(nodeId, { fromRuntime = false, ensureRuntime = true, surfaceMode = "page" } = {}) {
    if (!nodeId) {
      return this.workspace;
    }

    let nextWorkspace = this.workspace;

    if (
      nextWorkspace.selectedNodeId !== nodeId ||
      nextWorkspace.prefs.surfaceMode !== surfaceMode
    ) {
      nextWorkspace = await this.persistWorkspace((workspace) => {
        let updatedWorkspace = workspace;

        if (updatedWorkspace.selectedNodeId !== nodeId) {
          updatedWorkspace = selectNode(updatedWorkspace, nodeId);
        }

        if (updatedWorkspace.prefs.surfaceMode !== surfaceMode) {
          updatedWorkspace = setSurfaceMode(updatedWorkspace, surfaceMode);
        }

        return updatedWorkspace;
      });
    }

    const selectedNode = findNode(nextWorkspace, nodeId);

    if (!selectedNode) {
      return nextWorkspace;
    }

    const runtimeTarget = resolveRuntimeTarget(nextWorkspace, selectedNode);

    if (surfaceMode === "page" && ensureRuntime && !fromRuntime && runtimeTarget) {
      await this.ensureNodeRuntime(runtimeTarget);
    }

    await this.refreshSelectedPermissions(nextWorkspace, selectedNode);
    return nextWorkspace;
  }

  async ensureNodeRuntime(node) {
    if (!node) {
      return;
    }

    if (this.runtimeManager.tabForNode(node.id)) {
      const currentUrl = this.runtimeManager.currentUrlForNode?.(node.id) ?? null;

      if (node.url && !urlsMatchForRuntime(currentUrl, node.url)) {
        this.runtimeManager.loadNode(node, node.url);
        this.trace("ensure-runtime:reload-existing", {
          nodeId: node.id,
          currentUrl,
          url: node.url
        });
        return;
      }

      this.runtimeManager.selectNode(node.id);
      this.trace("ensure-runtime:select-existing", {
        nodeId: node.id
      });
      return;
    }

    if (node.url) {
      this.runtimeManager.loadNode(node, node.url);
      this.trace("ensure-runtime:load-url", {
        nodeId: node.id,
        url: node.url
      });
      return;
    }

    this.runtimeManager.ensureRuntime(node);
    this.runtimeManager.selectNode(node.id);
    this.trace("ensure-runtime:blank-node", {
      nodeId: node.id
    });
  }

  pageCommand(command) {
    this.basicsBridge.pageCommand(command);
  }

  findInPage(query) {
    return this.basicsBridge.findInPage(query);
  }

  findAgain(findPrevious = false) {
    return this.basicsBridge.findAgain(findPrevious);
  }

  closeFind() {
    return this.basicsBridge.closeFind();
  }

  getFindQuery() {
    return this.basicsBridge.getFindQuery?.() ?? "";
  }

  showPermissions(anchorNode) {
    this.basicsBridge.showPermissions(anchorNode);
  }

  async openSelectedArtifactFile() {
    return this.openArtifactFile(this.workspace?.selectedNodeId);
  }

  async revealSelectedArtifactFile() {
    return this.revealArtifactFile(this.workspace?.selectedNodeId);
  }

  async showSelectedArtifactSource() {
    return this.showArtifactSource(this.workspace?.selectedNodeId);
  }

  printPage() {
    this.basicsBridge.printPage();
  }

  previewPrint() {
    this.basicsBridge.previewPrint?.();
  }

  toggleFullscreen() {
    this.basicsBridge.toggleFullscreen?.();
  }

  toggleDevTools() {
    this.basicsBridge.toggleDevTools();
  }

  async refreshSelectedPermissions(workspace = this.workspace, selectedNode = findNode(workspace, workspace?.selectedNodeId)) {
    const pageNode = isArtifactNode(selectedNode) ? findOwningPageNode(workspace, selectedNode) : selectedNode;

    if (!pageNode?.id) {
      return;
    }

    const permissions = this.basicsBridge.getPermissionSummary();

    if (
      pageNode.permissions?.activeCount === permissions.activeCount &&
      pageNode.permissions?.blockedCount === permissions.blockedCount &&
      JSON.stringify(pageNode.permissions?.labels ?? []) === JSON.stringify(permissions.labels)
    ) {
      return;
    }

    await this.persistWorkspace((currentWorkspace) => {
      if (!findNode(currentWorkspace, pageNode.id)) {
        return currentWorkspace;
      }

      return updateNodeMetadata(currentWorkspace, pageNode.id, { permissions });
    });
  }

  async handleDownloadObserved(download) {
    if (!this.workspace) {
      return;
    }

    const existingNode = findArtifactNodeByTransferId(this.workspace, download.transferId);

    if (download.removed && !existingNode) {
      return;
    }

    const parentNode =
      existingNode
        ? findNode(this.workspace, existingNode.parentId)
        : resolveArtifactParentPage(this.workspace, download);

    if (!parentNode) {
      return;
    }

    const nextWorkspace = relayoutWorkspace(
      upsertArtifactNode(this.workspace, parentNode.id, "download", {
        transferId: download.transferId,
        fileName: download.fileName,
        filePath: download.filePath,
        sourceUrl: download.sourceUrl,
        referrerUrl: download.referrerUrl,
        pageUrl: download.pageUrl,
        mimeType: download.mimeType,
        totalBytes: download.totalBytes,
        receivedBytes: download.receivedBytes,
        status: download.status,
        recordedAt: Date.now()
      })
    );

    await this.persistWorkspace(nextWorkspace);
  }

  async handleUploadObserved(upload) {
    if (!this.workspace || !Array.isArray(upload.files) || !upload.files.length) {
      return;
    }

    const parentNode = resolveArtifactParentPage(this.workspace, upload);

    if (!parentNode) {
      return;
    }

    let nextWorkspace = this.workspace;
    const capturedAt = Date.now();

    upload.files.forEach((file, index) => {
      nextWorkspace = upsertArtifactNode(nextWorkspace, parentNode.id, "upload", {
        transferId: `upload::${parentNode.id}::${capturedAt}::${index}::${file.filePath ?? file.fileName ?? "file"}`,
        fileName: file.fileName,
        filePath: file.filePath,
        sourceUrl: null,
        referrerUrl: upload.pageUrl ?? parentNode.url,
        pageUrl: upload.pageUrl ?? parentNode.url,
        mimeType: file.mimeType,
        totalBytes: file.totalBytes,
        receivedBytes: file.totalBytes,
        status: "captured",
        inputLabel: upload.inputLabel,
        recordedAt: capturedAt
      });
    });

    await this.persistWorkspace(relayoutWorkspace(nextWorkspace));
  }

  handleSessionRecoveryChanged(sessionRecovery) {
    this.chrome = {
      ...this.chrome,
      sessionRecovery: sessionRecovery ?? createChromeState().sessionRecovery
    };
    this.emitStateChange();
  }

  handleAuthPromptChanged(authPrompt) {
    this.chrome = {
      ...this.chrome,
      authPrompt: authPrompt?.open ? authPrompt : null
    };
    this.emitStateChange();
  }

  handleTransientAuthChanged(transientAuth) {
    this.chrome = {
      ...this.chrome,
      transientAuth: transientAuth?.open ? transientAuth : null
    };
    this.emitStateChange();

    if (!transientAuth?.open && transientAuth?.parentNodeId) {
      this.runtimeManager.selectNode(transientAuth.parentNodeId);
    }
  }

  handleExternalProtocolChanged(externalProtocol) {
    this.chrome = {
      ...this.chrome,
      externalProtocol: externalProtocol?.open ? externalProtocol : null
    };
    this.emitStateChange();
  }

  async handleBrowserCrashed(crash) {
    if (!this.workspace || !crash?.nodeId) {
      return;
    }

    const node = findNode(this.workspace, crash.nodeId);

    if (!node || isArtifactNode(node)) {
      return;
    }

    await this.persistWorkspace((currentWorkspace) => {
      if (!findNode(currentWorkspace, node.id)) {
        return currentWorkspace;
      }

      return updateNodeMetadata(currentWorkspace, node.id, {
        runtimeState: "crashed",
        errorMessage: "Content process crashed"
      });
    });
  }

  async openArtifactFile(nodeId = this.workspace?.selectedNodeId) {
    const selectedNode = findNode(this.workspace, nodeId);

    if (!isArtifactNode(selectedNode)) {
      return false;
    }

    return this.basicsBridge.openLocalFile(selectedNode.artifact?.filePath ?? null);
  }

  async revealArtifactFile(nodeId = this.workspace?.selectedNodeId) {
    const selectedNode = findNode(this.workspace, nodeId);

    if (!isArtifactNode(selectedNode)) {
      return false;
    }

    return this.basicsBridge.revealLocalFile(selectedNode.artifact?.filePath ?? null);
  }

  async showArtifactSource(nodeId = this.workspace?.selectedNodeId) {
    const selectedNode = findNode(this.workspace, nodeId);
    const pageNode = findOwningPageNode(this.workspace, selectedNode);

    if (pageNode) {
      await this.selectNode(pageNode.id);
    }
  }

  async restoreClosedTab(closedId) {
    const entry =
      this.chrome.sessionRecovery.closedTabs.find((tab) => tab.closedId === closedId) ??
      null;

    if (!entry?.url) {
      return;
    }

    await this.restoreEntriesAsRoots(
      [{ title: entry.title, url: entry.url }],
      "session-recovery-tab"
    );
    this.basicsBridge.forgetClosedTab?.(entry.closedId, entry.sourceClosedId ?? null);
  }

  async restoreClosedWindow(closedId) {
    const entry =
      this.chrome.sessionRecovery.closedWindows.find(
        (windowEntry) => windowEntry.closedId === closedId
      ) ?? null;

    if (!entry?.tabs?.length) {
      return;
    }

    await this.restoreEntriesAsRoots(entry.tabs, "session-recovery-window");
    this.basicsBridge.forgetClosedWindow?.(entry.closedId);
  }

  async restoreLastSession() {
    const windows = this.chrome.sessionRecovery.lastSessionWindows ?? [];
    const entries = windows.flatMap((windowEntry) => windowEntry.tabs ?? []);

    if (!entries.length) {
      return;
    }

    await this.restoreEntriesAsRoots(entries, "last-session");
    this.basicsBridge.clearLastSession?.();
  }

  async restoreCrashedNode(nodeId) {
    await this.selectNode(nodeId);
    this.pageCommand("reload");
  }

  async restoreEntriesAsRoots(entries, origin = "session-recovery") {
    const restorableEntries = entries.filter((entry) => entry?.url);

    if (!restorableEntries.length) {
      return;
    }

    let nextWorkspace = this.workspace;
    const plannedLoads = [];

    restorableEntries.forEach((entry) => {
      nextWorkspace = createRootNode(nextWorkspace);
      const rootId = nextWorkspace.selectedNodeId;
      nextWorkspace = applyNodeNavigation(nextWorkspace, rootId, {
        kind: "url",
        url: entry.url,
        input: entry.url,
        query: null,
        origin
      });

      if (entry.title) {
        nextWorkspace = updateNodeMetadata(nextWorkspace, rootId, { title: entry.title });
      }

      plannedLoads.push({
        nodeId: rootId,
        url: entry.url
      });
    });

    nextWorkspace = relayoutWorkspace(nextWorkspace);
    await this.persistWorkspace(nextWorkspace);

    plannedLoads.forEach((plan, index) => {
      this.runtimeManager.loadNode(findNode(nextWorkspace, plan.nodeId), plan.url, {
        background: index < plannedLoads.length - 1
      });
    });
  }
}

function createChromeState() {
  return {
    sessionRecovery: {
      canRestoreLastSession: false,
      closedTabs: [],
      closedWindows: [],
      lastSessionWindows: []
    },
    transientAuth: null,
    authPrompt: null,
    externalProtocol: null
  };
}

function hasMeaningfulNodeMetadataChange(node, metadata) {
  if ((metadata.title ?? null) !== null && metadata.title !== node.title) {
    return true;
  }

  if ((metadata.url ?? null) !== null && metadata.url !== node.url) {
    return true;
  }

  if ((metadata.faviconUrl ?? null) !== null && metadata.faviconUrl !== node.faviconUrl) {
    return true;
  }

  if ((metadata.runtimeState ?? node.runtimeState) !== node.runtimeState) {
    return true;
  }

  if ((metadata.canGoBack ?? node.canGoBack) !== node.canGoBack) {
    return true;
  }

  if ((metadata.canGoForward ?? node.canGoForward) !== node.canGoForward) {
    return true;
  }

  if ((metadata.errorMessage ?? node.errorMessage) !== node.errorMessage) {
    return true;
  }

  if ((metadata.history ?? node.history) !== node.history) {
    return true;
  }

  if (
    JSON.stringify(metadata.permissions ?? node.permissions ?? null) !== JSON.stringify(node.permissions ?? null)
  ) {
    return true;
  }

  return false;
}

function resolveRuntimeTarget(workspace, selectedNode) {
  return isArtifactNode(selectedNode) ? findOwningPageNode(workspace, selectedNode) : selectedNode;
}

function normalizeUrlForRuntime(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(url);
  }
}

function urlsMatchForRuntime(left, right) {
  return normalizeUrlForRuntime(left) === normalizeUrlForRuntime(right);
}

function normalizedUrl(url) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function resolveArtifactParentPage(workspace, details) {
  if (!workspace) {
    return null;
  }

  if (details?.nodeId) {
    const node = findNode(workspace, details.nodeId);
    const owningNode = findOwningPageNode(workspace, node);

    if (owningNode) {
      return owningNode;
    }
  }

  const pageNodes = workspace.nodes.filter((node) => !isArtifactNode(node) && node.url);
  const selectedPage = findOwningPageNode(workspace, workspace.selectedNodeId);
  const preferredUrls = [details?.pageUrl, details?.referrerUrl, details?.sourceUrl]
    .map(normalizedUrl)
    .filter(Boolean);

  for (const candidateUrl of preferredUrls) {
    const exactMatch =
      pageNodes.find((node) => normalizedUrl(node.url) === candidateUrl && node.id === selectedPage?.id) ??
      [...pageNodes]
        .sort((left, right) => (right.lastVisitedAt ?? 0) - (left.lastVisitedAt ?? 0) || right.updatedAt - left.updatedAt)
        .find((node) => normalizedUrl(node.url) === candidateUrl);

    if (exactMatch) {
      return exactMatch;
    }
  }

  return selectedPage;
}

function findArtifactNodeByTransferId(workspace, transferId) {
  if (!workspace || !transferId) {
    return null;
  }

  return (
    workspace.nodes.find(
      (node) => isArtifactNode(node) && node.artifact?.transferId === transferId
    ) ?? null
  );
}
