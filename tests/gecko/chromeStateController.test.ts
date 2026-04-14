import { describe, expect, it, vi } from "vitest";

import { ChromeStateController } from "../../gecko/overlay/browser/base/content/nodely/chrome-state-controller.mjs";
import {
  applyNodeNavigation,
  createChildNode,
  createEmptyWorkspace,
  createRootNode,
  findNode,
  nodeRect,
  upsertArtifactNode
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

function makeRuntimeManager() {
  return {
    callbacks: {},
    attach: vi.fn(),
    tabForNode: vi.fn((_nodeId?: string) => null as { id: string } | null),
    currentUrlForNode: vi.fn((_nodeId?: string) => null as string | null),
    loadNode: vi.fn(),
    ensureRuntime: vi.fn(),
    selectNode: vi.fn(),
    adoptOpenedTab: vi.fn(),
    closeNodeRuntime: vi.fn()
  };
}

function makeBasicsBridge() {
  return {
    callbacks: {},
    attach: vi.fn(async () => {}),
    pageCommand: vi.fn(),
    findInPage: vi.fn(),
    findAgain: vi.fn(),
    closeFind: vi.fn(),
    getFindQuery: vi.fn(() => ""),
    showDownloads: vi.fn(),
    showPermissions: vi.fn(),
    printPage: vi.fn(),
    previewPrint: vi.fn(),
    toggleFullscreen: vi.fn(),
    toggleDevTools: vi.fn(),
    getPermissionSummary: vi.fn(() => ({
      activeCount: 0,
      blockedCount: 0,
      labels: []
    })),
    getSessionRecoveryState: vi.fn(() => ({
      canRestoreLastSession: false,
      closedTabs: [],
      closedWindows: [],
      lastSessionWindows: []
    })),
    forgetClosedTab: vi.fn(() => true),
    forgetClosedWindow: vi.fn(() => true),
    clearLastSession: vi.fn(() => true),
    openLocalFile: vi.fn(() => true),
    revealLocalFile: vi.fn(() => true)
  };
}

describe("ChromeStateController Gecko startup/runtime flow", () => {
  it("restores the selected saved node into a runtime on initialize", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const root = workspace.nodes[0];
    workspace = applyNodeNavigation(workspace, root.id, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => nextWorkspace)
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();

    expect(runtimeManager.attach).toHaveBeenCalledTimes(1);
    expect(runtimeManager.loadNode).toHaveBeenCalledTimes(1);
    expect(runtimeManager.loadNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: root.id, url: "https://example.com/" }),
      "https://example.com/"
    );
  });

  it("creates the first root from the inline composer input and loads it", async () => {
    let workspace = createEmptyWorkspace();
    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    await controller.createRootFromInput("quantum tunneling");

    expect(workspace.nodes).toHaveLength(1);
    expect(workspace.selectedNodeId).toBe(workspace.nodes[0].id);
    expect(workspace.nodes[0].url).toContain("google.com/search");
    expect(runtimeManager.loadNode).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: workspace.nodes[0].id }),
      expect.stringContaining("google.com/search")
    );
  });

  it("places a contextual root near the requested point without overlapping an existing node", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const existingRootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, existingRootId, {
      kind: "url",
      url: "https://example.com/root",
      input: "https://example.com/root",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    const anchoredRoot = findNode(workspace, existingRootId);

    await controller.createRootFromInput("https://example.com/placed", {
      position: anchoredRoot?.position
    });

    const newRoot = findNode(workspace, workspace.selectedNodeId as string);

    expect(newRoot?.parentId).toBeNull();
    expect(newRoot?.manualPosition).toBe(true);
    expect(newRoot?.position).not.toEqual(anchoredRoot?.position);
    expect(
      rectsOverlap(
        nodeRect(anchoredRoot as { position: { x: number; y: number } }),
        nodeRect(newRoot as { position: { x: number; y: number } })
      )
    ).toBe(false);
    expect(runtimeManager.loadNode).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: newRoot?.id }),
      "https://example.com/placed"
    );
  });

  it("records download provenance as an attached artifact node on the matching page", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const basicsBridge = makeBasicsBridge();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager: makeRuntimeManager(),
      basicsBridge
    });

    await controller.initialize();
    await controller.handleDownloadObserved({
      transferId: "download-1",
      fileName: "paper.pdf",
      filePath: "/tmp/paper.pdf",
      sourceUrl: "https://example.com/paper.pdf",
      referrerUrl: "https://example.com/",
      pageUrl: "https://example.com/",
      mimeType: "application/pdf",
      totalBytes: 4096,
      receivedBytes: 4096,
      status: "complete",
      removed: false
    });

    const artifactNode = workspace.nodes.find((node: { kind: string }) => node.kind === "download");
    expect(artifactNode).toBeTruthy();
    expect(artifactNode?.parentId).toBe(rootId);
    expect(artifactNode?.artifact?.filePath).toBe("/tmp/paper.pdf");
    expect(artifactNode?.artifact?.status).toBe("complete");
  });

  it("records upload provenance using the owning page node id", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/form",
      input: "https://example.com/form",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager: makeRuntimeManager(),
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    await controller.handleUploadObserved({
      nodeId: rootId,
      pageUrl: "https://example.com/form",
      inputLabel: "Resume upload",
      files: [
        {
          fileName: "resume.pdf",
          filePath: "/tmp/resume.pdf",
          mimeType: "application/pdf",
          totalBytes: 2048
        }
      ]
    });

    const uploadNode = workspace.nodes.find((node: { kind: string }) => node.kind === "upload");
    expect(uploadNode).toBeTruthy();
    expect(uploadNode?.parentId).toBe(rootId);
    expect(uploadNode?.artifact?.inputLabel).toBe("Resume upload");
  });

  it("adopts a foreign tab as a child of the actual opener node instead of polluting the active tree", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();

    const foreignTab = { linkedBrowser: {} };
    await controller.handleForeignTabOpen(foreignTab as any, {
      parentNodeId: rootId,
      background: true
    });

    expect(workspace.nodes).toHaveLength(2);
    const childNode = workspace.nodes.find((node: { parentId: string | null }) => node.parentId === rootId);
    expect(childNode).toBeTruthy();
    expect(workspace.selectedNodeId).toBe(rootId);
    expect(runtimeManager.adoptOpenedTab).toHaveBeenCalledWith(childNode?.id, foreignTab);
  });

  it("reopens the owning page runtime when selecting an artifact node", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    runtimeManager.currentUrlForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? "https://example.com/" : null
    );
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    await controller.handleDownloadObserved({
      transferId: "download-2",
      fileName: "paper.pdf",
      filePath: "/tmp/paper.pdf",
      sourceUrl: "https://example.com/paper.pdf",
      referrerUrl: "https://example.com/",
      pageUrl: "https://example.com/",
      mimeType: "application/pdf",
      totalBytes: 4096,
      receivedBytes: 4096,
      status: "complete",
      removed: false
    });

    const artifactNode = workspace.nodes.find((node: { kind: string }) => node.kind === "download");
    runtimeManager.loadNode.mockClear();
    runtimeManager.ensureRuntime.mockClear();

    await controller.selectNode(artifactNode.id);

    expect(findNode(workspace, workspace.selectedNodeId)?.id).toBe(artifactNode.id);
    expect(runtimeManager.loadNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: rootId, url: "https://example.com/" }),
      "https://example.com/"
    );
    expect(runtimeManager.ensureRuntime).not.toHaveBeenCalled();
  });

  it("restores a closed tab as a new root and forgets the closed-tab entry", async () => {
    let workspace = createEmptyWorkspace();
    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const basicsBridge = makeBasicsBridge();
    (basicsBridge.getSessionRecoveryState as any).mockReturnValue({
      canRestoreLastSession: false,
      closedTabs: [
        {
          id: "tab-1",
          closedId: 91,
          sourceClosedId: null,
          title: "Recovered page",
          url: "https://example.com/recovered"
        }
      ],
      closedWindows: [],
      lastSessionWindows: []
    });

    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge
    });

    await controller.initialize();
    await controller.restoreClosedTab(91);

    expect(workspace.nodes).toHaveLength(1);
    expect(workspace.nodes[0].url).toBe("https://example.com/recovered");
    expect(runtimeManager.loadNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: workspace.nodes[0].id }),
      "https://example.com/recovered",
      expect.objectContaining({ background: false })
    );
    expect(basicsBridge.forgetClosedTab).toHaveBeenCalledWith(91, null);
  });

  it("marks crashed nodes in chrome state and can reload them through recovery", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const basicsBridge = makeBasicsBridge();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge
    });

    await controller.initialize();
    await controller.handleBrowserCrashed({ nodeId: rootId });

    expect(findNode(workspace, rootId)?.runtimeState).toBe("crashed");
    expect(controller.getState().chrome.crashedNodes).toEqual([
      expect.objectContaining({ id: rootId })
    ]);

    await controller.restoreCrashedNode(rootId);

    expect(basicsBridge.pageCommand).toHaveBeenCalledWith("reload");
  });

  it("reopens the current node surface when selecting it from canvas mode", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    await controller.setSurfaceMode("canvas");
    runtimeManager.loadNode.mockClear();

    await controller.selectNode(rootId);

    expect(workspace.prefs.surfaceMode).toBe("page");
    expect(workspace.selectedNodeId).toBe(rootId);
    expect(runtimeManager.loadNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: rootId }),
      "https://example.com/"
    );
  });

  it("reselects the existing runtime tab when reopening a node from canvas mode", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    runtimeManager.tabForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? { id: "tab-1" } : null
    );
    runtimeManager.currentUrlForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? "https://example.com/" : null
    );
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    await controller.setSurfaceMode("canvas");
    runtimeManager.loadNode.mockClear();
    runtimeManager.selectNode.mockClear();

    await controller.selectNode(rootId);

    expect(workspace.prefs.surfaceMode).toBe("page");
    expect(workspace.selectedNodeId).toBe(rootId);
    expect(runtimeManager.selectNode).toHaveBeenCalledWith(rootId);
    expect(runtimeManager.loadNode).not.toHaveBeenCalled();
  });

  it("persists theme mode changes through the workspace store", async () => {
    let workspace = createEmptyWorkspace();
    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager: makeRuntimeManager(),
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    await controller.setThemeMode("dark");

    expect(workspace.prefs.themeMode).toBe("dark");
    expect(workspaceStore.saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        prefs: expect.objectContaining({
          themeMode: "dark"
        })
      })
    );
  });

  it("forwards fullscreen toggles to the browser basics bridge", async () => {
    const basicsBridge = makeBasicsBridge();
    const controller = new ChromeStateController({
      workspaceStore: {
        loadWorkspace: vi.fn(async () => createEmptyWorkspace()),
        saveWorkspace: vi.fn(async (nextWorkspace) => nextWorkspace)
      },
      favoritesStore: {
        listFavorites: vi.fn(async () => [])
      },
      runtimeManager: makeRuntimeManager(),
      basicsBridge
    });

    await controller.initialize();
    controller.toggleFullscreen();

    expect(basicsBridge.toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("does not let a slow child metadata save overwrite a newer selected root node", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/root",
      input: "https://example.com/root",
      query: null,
      origin: "omnibox-url"
    });
    workspace = createChildNode(workspace, rootId, "manual");
    const childId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, childId, {
      kind: "url",
      url: "https://example.com/child",
      input: "https://example.com/child",
      query: null,
      origin: "omnibox-url"
    });

    let releaseMetadataSave: (() => void) | null = null;
    let metadataSavePending = false;
    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        const childNode = findNode(nextWorkspace, childId);

        if (
          !metadataSavePending &&
          nextWorkspace.selectedNodeId === childId &&
          childNode?.title === "Child loaded"
        ) {
          metadataSavePending = true;
          await new Promise<void>((resolve) => {
            releaseMetadataSave = resolve;
          });
        }

        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    runtimeManager.tabForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? { id: "root-tab" } : null
    );
    runtimeManager.currentUrlForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? "https://example.com/root" : null
    );
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    runtimeManager.selectNode.mockClear();

    const metadataPromise = controller.handleNodeMetaChanged(childId, {
      title: "Child loaded",
      runtimeState: "live"
    });

    await vi.waitFor(() => {
      expect(releaseMetadataSave).not.toBeNull();
    });

    const selectPromise = controller.selectNode(rootId);
    releaseMetadataSave?.();

    await Promise.all([metadataPromise, selectPromise]);

    expect(workspace.selectedNodeId).toBe(rootId);
    expect(findNode(workspace, childId)?.title).toBe("Child loaded");
    expect(runtimeManager.selectNode).toHaveBeenCalledWith(rootId);
  });

  it("reloads an existing mapped runtime when it no longer matches the node url", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    runtimeManager.tabForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? { id: "tab-1" } : null
    );
    runtimeManager.currentUrlForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? "https://elsewhere.example/" : null
    );
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    runtimeManager.loadNode.mockClear();
    runtimeManager.selectNode.mockClear();

    await controller.selectNode(rootId);

    expect(runtimeManager.loadNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: rootId, url: "https://example.com/" }),
      "https://example.com/"
    );
    expect(runtimeManager.selectNode).not.toHaveBeenCalled();
  });

  it("keeps transient OAuth tabs out of the graph and returns focus to the opener node when they close", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://www.linkedin.com/",
      input: "https://www.linkedin.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    controller.handleTransientAuthChanged({
      open: true,
      kind: "tab",
      parentNodeId: rootId,
      url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc123"
    });

    expect(workspace.nodes).toHaveLength(1);
    expect(controller.getState().chrome.transientAuth).toEqual(
      expect.objectContaining({
        kind: "tab",
        parentNodeId: rootId
      })
    );

    controller.handleTransientAuthChanged({
      open: false,
      kind: "tab",
      parentNodeId: rootId,
      url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc123"
    });

    expect(controller.getState().chrome.transientAuth).toBeNull();
    expect(runtimeManager.selectNode).toHaveBeenCalledWith(rootId);
  });

  it("kills a middle page node, promotes its only page child, removes direct artifacts, and closes the removed runtime", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/root",
      input: "https://example.com/root",
      query: null,
      origin: "omnibox-url"
    });
    workspace = createChildNode(workspace, rootId, "manual");
    const middleId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, middleId, {
      kind: "url",
      url: "https://example.com/middle",
      input: "https://example.com/middle",
      query: null,
      origin: "omnibox-url"
    });
    workspace = createChildNode(workspace, middleId, "manual");
    const leafId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, leafId, {
      kind: "url",
      url: "https://example.com/leaf",
      input: "https://example.com/leaf",
      query: null,
      origin: "omnibox-url"
    });
    workspace = upsertArtifactNode(workspace, middleId, "download", {
      transferId: "download-1",
      fileName: "paper.pdf"
    });
    const artifactId = workspace.nodes.find((node: { kind: string }) => node.kind === "download")?.id as string;
    workspace = {
      ...workspace,
      selectedNodeId: middleId
    };

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [
        {
          id: "page:default:middle",
          kind: "page",
          workspaceId: "default",
          nodeId: middleId
        }
      ]),
      removeNodeFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    runtimeManager.tabForNode.mockImplementation((nodeId?: string) =>
      nodeId === leafId ? { id: "leaf-tab" } : nodeId === middleId ? { id: "middle-tab" } : null
    );
    runtimeManager.currentUrlForNode.mockImplementation((nodeId?: string) =>
      nodeId === leafId
        ? "https://example.com/leaf"
        : nodeId === middleId
          ? "https://example.com/middle"
          : null
    );
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    runtimeManager.selectNode.mockClear();
    runtimeManager.closeNodeRuntime.mockClear();

    await controller.killNode(middleId);

    expect(findNode(workspace, middleId)).toBeNull();
    expect(findNode(workspace, artifactId)).toBeNull();
    expect(findNode(workspace, leafId)?.parentId).toBe(rootId);
    expect(workspace.selectedNodeId).toBe(leafId);
    expect(favoritesStore.removeNodeFavorites).toHaveBeenCalledWith(
      workspace.id,
      expect.arrayContaining([middleId, artifactId])
    );
    expect(runtimeManager.selectNode).toHaveBeenCalledWith(leafId);
    expect(runtimeManager.closeNodeRuntime).toHaveBeenCalledWith(middleId);
  });

  it("kills an artifact node and returns selection to its owning page", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/root",
      input: "https://example.com/root",
      query: null,
      origin: "omnibox-url"
    });
    workspace = upsertArtifactNode(workspace, rootId, "download", {
      transferId: "download-2",
      fileName: "notes.pdf"
    }, {
      selectArtifact: true
    });
    const artifactId = workspace.selectedNodeId as string;

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => []),
      removeNodeFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    runtimeManager.tabForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? { id: "root-tab" } : null
    );
    runtimeManager.currentUrlForNode.mockImplementation((nodeId?: string) =>
      nodeId === rootId ? "https://example.com/root" : null
    );
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    runtimeManager.selectNode.mockClear();

    await controller.killNode(artifactId);

    expect(findNode(workspace, artifactId)).toBeNull();
    expect(workspace.selectedNodeId).toBe(rootId);
    expect(runtimeManager.selectNode).toHaveBeenCalledWith(rootId);
    expect(favoritesStore.removeNodeFavorites).toHaveBeenCalledWith(
      workspace.id,
      expect.arrayContaining([artifactId])
    );
  });

  it("keeps the current page selected when creating a background child node", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/",
      input: "https://example.com",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    runtimeManager.loadNode.mockClear();

    await controller.createChildNode({
      background: true,
      url: "https://example.org/",
      origin: "manual"
    });

    const childNode = workspace.nodes.find((node: { parentId: string | null }) => node.parentId === rootId);
    expect(childNode).toBeTruthy();
    expect(workspace.selectedNodeId).toBe(rootId);
    expect(workspace.prefs.surfaceMode).toBe("page");
    expect(runtimeManager.loadNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: childNode?.id }),
      "https://example.org/",
      expect.objectContaining({ background: true })
    );
  });

  it("selects the new foreground child runtime when the tab button creates a node", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.org/",
      input: "https://example.org/",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    runtimeManager.ensureRuntime.mockClear();
    runtimeManager.selectNode.mockClear();

    await controller.createChildNode({ origin: "tab-button" });

    const childNode = workspace.nodes.find((node: { parentId: string | null }) => node.parentId === rootId);
    expect(childNode).toBeTruthy();
    expect(workspace.selectedNodeId).toBe(childNode?.id);
    expect(runtimeManager.ensureRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ id: childNode?.id }),
      expect.objectContaining({ background: false })
    );
    expect(runtimeManager.selectNode).toHaveBeenCalledWith(childNode?.id);
  });

  it("duplicates a tab from an explicit parent node when requested", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/source",
      input: "https://example.com/source",
      query: null,
      origin: "omnibox-url"
    });
    workspace = createChildNode(workspace, rootId, "manual");
    const selectedChildId = workspace.selectedNodeId as string;

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    runtimeManager.loadNode.mockClear();

    await controller.createChildNode({
      parentNodeId: rootId,
      url: "https://example.com/source",
      origin: "tab-duplicate"
    });

    const duplicatedNode = workspace.nodes.find(
      (node: { id: string; parentId: string | null }) =>
        node.parentId === rootId && node.id !== selectedChildId
    );

    expect(duplicatedNode).toBeTruthy();
    expect(workspace.selectedNodeId).toBe(duplicatedNode?.id);
    expect(runtimeManager.loadNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: duplicatedNode?.id }),
      "https://example.com/source",
      expect.anything()
    );
  });

  it("selects a foreground foreign-opened tab after adopting it into the graph", async () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = applyNodeNavigation(workspace, rootId, {
      kind: "url",
      url: "https://example.com/source",
      input: "https://example.com/source",
      query: null,
      origin: "omnibox-url"
    });

    const workspaceStore = {
      loadWorkspace: vi.fn(async () => workspace),
      saveWorkspace: vi.fn(async (nextWorkspace) => {
        workspace = nextWorkspace;
        return nextWorkspace;
      })
    };
    const favoritesStore = {
      listFavorites: vi.fn(async () => [])
    };
    const runtimeManager = makeRuntimeManager();
    const controller = new ChromeStateController({
      workspaceStore,
      favoritesStore,
      runtimeManager,
      basicsBridge: makeBasicsBridge()
    });

    await controller.initialize();
    runtimeManager.adoptOpenedTab.mockClear();
    runtimeManager.selectNode.mockClear();

    const foreignTab = { id: "tab-2" };
    const foreignUrl = "https://example.com/child-tab";
    await controller.handleForeignTabOpen(foreignTab, {
      parentNodeId: rootId,
      background: false,
      url: foreignUrl,
      title: "Child tab"
    });

    const childNode = workspace.nodes.find((node: { parentId: string | null }) => node.parentId === rootId);
    expect(childNode).toBeTruthy();
    expect(workspace.selectedNodeId).toBe(childNode?.id);
    expect(childNode?.url).toBe(foreignUrl);
    expect(childNode?.title).toBe("Child tab");
    expect(runtimeManager.adoptOpenedTab).toHaveBeenCalledWith(childNode?.id, foreignTab);
    expect(runtimeManager.selectNode).toHaveBeenCalledWith(childNode?.id);
  });
});

function rectsOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
