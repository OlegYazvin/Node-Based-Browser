import { WebContentsView, type BrowserWindow } from "electron";
import { LIVE_NODE_IDLE_MS, listNodesToSuspend } from "../shared/lifecycle";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  BrowserCommand,
  GraphNode,
  PageBounds,
  SavedNavigationHistory,
  SerializedNavigationEntry,
  Workspace
} from "../shared/types";
import { appendEvent, findNode, replaceNode } from "../shared/workspace";
import { attachNavigationInterceptors, type BranchNavigationRequest } from "./navigationInterceptor";
import type { WorkspaceSessionManager } from "./workspaceSessionManager";

interface LiveNodeRuntime {
  nodeId: string;
  view: WebContentsView;
  teardownNavigation: () => void;
}

interface PageManagerOptions {
  window: BrowserWindow;
  sessionManager: WorkspaceSessionManager;
  getWorkspace: () => Workspace;
  mutateWorkspace: (
    updater: (workspace: Workspace) => Workspace,
    options?: { relayout?: boolean; persist?: boolean; broadcast?: boolean }
  ) => Workspace;
  onBranchNavigation: (request: BranchNavigationRequest) => Promise<void>;
}

function navigationEntryToJSON(entry: Electron.NavigationEntry): SerializedNavigationEntry {
  return JSON.parse(JSON.stringify(entry)) as SerializedNavigationEntry;
}

function extractHistory(contents: Electron.WebContents): SavedNavigationHistory | null {
  const entries = contents.navigationHistory.getAllEntries();

  if (!entries.length) {
    return null;
  }

  return {
    index: contents.navigationHistory.getActiveIndex(),
    entries: entries.map(navigationEntryToJSON)
  };
}

function destroyWebContents(contents: Electron.WebContents) {
  const destroyable = contents as Electron.WebContents & { destroy?: () => void };

  if (typeof destroyable.destroy === "function") {
    destroyable.destroy();
    return;
  }

  contents.close({ waitForBeforeUnload: false });
}

export class PageManager {
  private readonly options: PageManagerOptions;
  private readonly runtimes = new Map<string, LiveNodeRuntime>();
  private readonly pruneTimer: NodeJS.Timeout;
  private currentBounds: PageBounds = { x: 0, y: 0, width: 0, height: 0, visible: false };
  private attachedNodeId: string | null = null;

  constructor(options: PageManagerOptions) {
    this.options = options;
    this.pruneTimer = setInterval(() => {
      void this.pruneRuntimes();
    }, 60_000);
  }

  async hydrate() {
    await this.presentSelectedNode();
  }

  async reset() {
    this.hideAttachedRuntime();

    for (const nodeId of [...this.runtimes.keys()]) {
      await this.suspendNode(nodeId, false);
    }
  }

  dispose() {
    clearInterval(this.pruneTimer);
    void this.reset();
  }

  updateBounds(bounds: PageBounds) {
    this.currentBounds = bounds;
    this.refreshAttachedRuntimeBounds();
  }

  async presentSelectedNode() {
    const workspace = this.options.getWorkspace();
    const selectedNode = findNode(workspace, workspace.selectedNodeId);

    if (!selectedNode) {
      this.hideAttachedRuntime();
      return;
    }

    this.markNodeActive(selectedNode.id);

    if (!selectedNode.url && !selectedNode.history) {
      this.hideAttachedRuntime();
      await this.pruneRuntimes();
      return;
    }

    const runtime = await this.ensureRuntime(selectedNode.id);
    this.attachRuntime(runtime.nodeId);
    await this.pruneRuntimes();
  }

  async loadNode(nodeId: string, url: string, options: { searchQuery?: string | null } = {}) {
    this.options.mutateWorkspace(
      (workspace) =>
        replaceNode(workspace, nodeId, (node) => ({
          ...node,
          url,
          title: options.searchQuery ? `Search: ${options.searchQuery}` : node.title,
          searchQuery: options.searchQuery ?? null,
          runtimeState: "loading",
          history: null,
          errorMessage: null,
          updatedAt: Date.now()
        })),
      { relayout: false }
    );

    const runtime = await this.ensureRuntime(nodeId, true);
    await runtime.view.webContents.loadURL(url);
    this.attachRuntime(nodeId);
  }

  sendCommand(command: BrowserCommand) {
    const workspace = this.options.getWorkspace();
    const selectedNode = findNode(workspace, workspace.selectedNodeId);

    if (!selectedNode) {
      return;
    }

    const runtime = this.runtimes.get(selectedNode.id);

    if (!runtime) {
      return;
    }

    switch (command) {
      case "back":
        if (runtime.view.webContents.navigationHistory.canGoBack()) {
          runtime.view.webContents.navigationHistory.goBack();
        }
        break;
      case "forward":
        if (runtime.view.webContents.navigationHistory.canGoForward()) {
          runtime.view.webContents.navigationHistory.goForward();
        }
        break;
      case "reload":
        runtime.view.webContents.reload();
        break;
    }
  }

  private markNodeActive(nodeId: string) {
    this.options.mutateWorkspace(
      (workspace) =>
        replaceNode(workspace, nodeId, (node) => ({
          ...node,
          lastActiveAt: Date.now(),
          updatedAt: Date.now()
        })),
      { relayout: false, persist: false, broadcast: false }
    );
  }

  private attachRuntime(nodeId: string) {
    const runtime = this.runtimes.get(nodeId);

    if (!runtime) {
      return;
    }

    this.hideAttachedRuntime();
    this.options.window.contentView.addChildView(runtime.view);
    this.attachedNodeId = nodeId;
    this.refreshAttachedRuntimeBounds();
  }

  private hideAttachedRuntime() {
    if (!this.attachedNodeId) {
      return;
    }

    const attachedRuntime = this.runtimes.get(this.attachedNodeId);

    if (attachedRuntime) {
      this.options.window.contentView.removeChildView(attachedRuntime.view);
      attachedRuntime.view.setBounds({ x: -10_000, y: -10_000, width: 1, height: 1 });
    }

    this.attachedNodeId = null;
  }

  private refreshAttachedRuntimeBounds() {
    if (!this.attachedNodeId) {
      return;
    }

    const runtime = this.runtimes.get(this.attachedNodeId);

    if (!runtime) {
      return;
    }

    if (!this.currentBounds.visible || this.currentBounds.width <= 0 || this.currentBounds.height <= 0) {
      runtime.view.setBounds({ x: -10_000, y: -10_000, width: 1, height: 1 });
      return;
    }

    runtime.view.setBounds({
      x: Math.round(this.currentBounds.x),
      y: Math.round(this.currentBounds.y),
      width: Math.round(this.currentBounds.width),
      height: Math.round(this.currentBounds.height)
    });
  }

  private async ensureRuntime(nodeId: string, forceRecreate = false) {
    const existingRuntime = this.runtimes.get(nodeId);

    if (existingRuntime && !forceRecreate) {
      return existingRuntime;
    }

    if (existingRuntime && forceRecreate) {
      await this.suspendNode(nodeId, false);
    }

    const workspace = this.options.getWorkspace();
    const node = findNode(workspace, nodeId);

    if (!node) {
      throw new Error(`Node ${nodeId} does not exist.`);
    }

    const view = new WebContentsView({
      webPreferences: {
        session: this.options.sessionManager.getSession(workspace.id),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: true,
        spellcheck: false
      }
    });

    const teardownNavigation = attachNavigationInterceptors(view.webContents, node.id, (request) =>
      this.options.onBranchNavigation(request)
    );

    this.attachMetadataListeners(node.id, view);

    const runtime: LiveNodeRuntime = {
      nodeId,
      view,
      teardownNavigation
    };

    this.runtimes.set(nodeId, runtime);
    this.options.mutateWorkspace(
      (currentWorkspace) =>
        replaceNode(currentWorkspace, nodeId, (currentNode) => ({
          ...currentNode,
          runtimeState: "loading",
          updatedAt: Date.now()
        })),
      { relayout: false }
    );

    await this.restoreRuntime(node, !forceRecreate);

    return runtime;
  }

  private async restoreRuntime(node: GraphNode, restoreState: boolean) {
    const runtime = this.runtimes.get(node.id);

    if (!runtime || !restoreState) {
      return;
    }

    const { webContents } = runtime.view;

    if (node.history?.entries.length) {
      try {
        await webContents.navigationHistory.restore({
          entries: node.history.entries as unknown as Electron.NavigationEntry[],
          index: Math.min(node.history.index, node.history.entries.length - 1)
        });
        this.options.mutateWorkspace(
          (workspace) => appendEvent(workspace, "node_restored", node.id, { source: "history" }),
          { relayout: false }
        );
        return;
      } catch {
        if (node.url) {
          await webContents.loadURL(node.url);
          return;
        }
      }
    }

    if (node.url) {
      await webContents.loadURL(node.url);
    }
  }

  private attachMetadataListeners(nodeId: string, view: WebContentsView) {
    const { webContents } = view;

    webContents.on("page-title-updated", (event, title) => {
      event.preventDefault();
      this.patchNode(nodeId, {
        title: title || "Untitled thread"
      });
    });

    webContents.on("page-favicon-updated", (_event, faviconUrls) => {
      this.patchNode(nodeId, {
        faviconUrl: faviconUrls[0] ?? null
      });
    });

    webContents.on("did-start-loading", () => {
      this.patchNode(nodeId, {
        runtimeState: "loading",
        errorMessage: null
      });
    });

    webContents.on("did-stop-loading", () => {
      this.patchNode(nodeId, {
        runtimeState: "live"
      });
      this.syncNavigationState(nodeId);
      this.captureHistory(nodeId);
    });

    webContents.on("did-navigate", (_event, url) => {
      this.patchNode(nodeId, {
        url,
        lastVisitedAt: Date.now(),
        runtimeState: "live",
        errorMessage: null
      });
      this.captureHistory(nodeId);
      this.options.mutateWorkspace(
        (workspace) => appendEvent(workspace, "node_navigated", nodeId, { url }),
        { relayout: false }
      );
    });

    webContents.on("did-navigate-in-page", (_event, url) => {
      this.patchNode(nodeId, {
        url,
        lastVisitedAt: Date.now()
      });
      this.captureHistory(nodeId);
    });

    webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) {
        return;
      }

      this.patchNode(nodeId, {
        url: validatedUrl,
        runtimeState: "error",
        errorMessage: errorDescription
      });
      this.captureHistory(nodeId);
      this.syncNavigationState(nodeId);
    });
  }

  private patchNode(nodeId: string, patch: Partial<GraphNode>) {
    const workspace = this.options.mutateWorkspace(
      (currentWorkspace) =>
        replaceNode(currentWorkspace, nodeId, (node) => ({
          ...node,
          ...patch,
          updatedAt: Date.now()
        })),
      { relayout: false, broadcast: false }
    );

    const node = findNode(workspace, nodeId);

    if (node) {
      this.options.window.webContents.send(IPC_CHANNELS.nodeMetaChanged, node);
    }
  }

  private captureHistory(nodeId: string) {
    const runtime = this.runtimes.get(nodeId);

    if (!runtime) {
      return;
    }

    const history = extractHistory(runtime.view.webContents);

    this.patchNode(nodeId, {
      history
    });
  }

  private syncNavigationState(nodeId: string) {
    const runtime = this.runtimes.get(nodeId);

    if (!runtime) {
      return;
    }

    this.patchNode(nodeId, {
      canGoBack: runtime.view.webContents.navigationHistory.canGoBack(),
      canGoForward: runtime.view.webContents.navigationHistory.canGoForward()
    });
  }

  private async pruneRuntimes() {
    const workspace = this.options.getWorkspace();
    const suspensionCandidates = listNodesToSuspend(workspace.nodes, workspace.selectedNodeId, Date.now());

    for (const node of suspensionCandidates) {
      if (Date.now() - (node.lastActiveAt ?? 0) < LIVE_NODE_IDLE_MS && this.runtimes.size <= 8) {
        continue;
      }

      await this.suspendNode(node.id);
    }
  }

  private async suspendNode(nodeId: string, persistEvent = true) {
    const runtime = this.runtimes.get(nodeId);

    if (!runtime) {
      return;
    }

    if (this.attachedNodeId === nodeId) {
      this.hideAttachedRuntime();
    }

    const history = extractHistory(runtime.view.webContents);

    runtime.teardownNavigation();
    runtime.view.webContents.removeAllListeners();
    destroyWebContents(runtime.view.webContents);
    this.runtimes.delete(nodeId);

    this.options.mutateWorkspace(
      (workspace) => {
        const nextWorkspace = replaceNode(workspace, nodeId, (node) => ({
          ...node,
          runtimeState: node.url ? "suspended" : "empty",
          history,
          updatedAt: Date.now()
        }));

        return persistEvent ? appendEvent(nextWorkspace, "node_suspended", nodeId, {}) : nextWorkspace;
      },
      { relayout: false }
    );
  }
}
