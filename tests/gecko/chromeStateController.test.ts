import { describe, expect, it, vi } from "vitest";

import { ChromeStateController } from "../../gecko/overlay/browser/base/content/nodely/chrome-state-controller.mjs";
import {
  applyNodeNavigation,
  createEmptyWorkspace,
  createRootNode,
  findNode
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

function makeRuntimeManager() {
  return {
    callbacks: {},
    attach: vi.fn(),
    tabForNode: vi.fn((_nodeId?: string) => null as { id: string } | null),
    loadNode: vi.fn(),
    ensureRuntime: vi.fn(),
    selectNode: vi.fn(),
    adoptOpenedTab: vi.fn()
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

  it("does not try to spin up a browser runtime when selecting an artifact node", async () => {
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
    expect(runtimeManager.loadNode).not.toHaveBeenCalled();
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
});
