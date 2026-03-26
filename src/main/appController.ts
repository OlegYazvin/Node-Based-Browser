import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, app, ipcMain } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { snapNodePosition } from "../shared/graphGeometry";
import { IPC_CHANNELS } from "../shared/ipc";
import { relayoutWorkspace } from "../shared/layout";
import { resolveOmniboxInput } from "../shared/navigation";
import type { BrowserCommand, PageBounds, Point, SearchProvider, ViewMode, Workspace } from "../shared/types";
import {
  appendEvent,
  createChildNode,
  createEmptyWorkspace,
  createRootNode,
  findNode,
  isFreshRootNode,
  normalizeWorkspace,
  replaceNode,
  selectNode,
  setSearchProvider,
  setViewMode,
  setViewport
} from "../shared/workspace";
import type { BranchNavigationRequest } from "./navigationInterceptor";
import { PageManager } from "./pageManager";
import { WorkspacePersistence } from "./workspacePersistence";
import { WorkspaceSessionManager } from "./workspaceSessionManager";

if (squirrelStartup) {
  app.quit();
}

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export class AppController {
  private readonly persistence = new WorkspacePersistence();
  private readonly sessionManager = new WorkspaceSessionManager();
  private mainWindow: BrowserWindow | null = null;
  private pageManager: PageManager | null = null;
  private workspace: Workspace = createEmptyWorkspace();
  private saveTimer: NodeJS.Timeout | null = null;
  private ipcRegistered = false;

  async initialize() {
    this.workspace = this.prepareWorkspace(
      appendEvent(await this.persistence.loadWorkspace("default"), "workspace_loaded", null, {
        workspaceId: "default"
      })
    );

    this.mainWindow = this.createWindow();
    Menu.setApplicationMenu(null);
    this.mainWindow.removeMenu();
    this.pageManager = new PageManager({
      window: this.mainWindow,
      sessionManager: this.sessionManager,
      getWorkspace: () => this.workspace,
      mutateWorkspace: (updater, options) => this.mutateWorkspace(updater, options),
      onBranchNavigation: async (request) => this.branchFromNode(request)
    });

    if (!this.ipcRegistered) {
      this.registerIpc();
      this.ipcRegistered = true;
    }

    this.mainWindow.on("closed", () => {
      this.pageManager?.dispose();
      this.pageManager = null;
      this.mainWindow = null;
    });

    this.mainWindow.webContents.on("did-finish-load", () => {
      this.broadcastWorkspace();
    });

    await this.loadRenderer();
    await this.pageManager.hydrate();
    this.scheduleSave();
  }

  dispose() {
    this.pageManager?.dispose();
    this.pageManager = null;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private createWindow() {
    return new BrowserWindow({
      width: 1680,
      height: 1020,
      minWidth: 1240,
      minHeight: 780,
      backgroundColor: "#f5efdf",
      title: "Nodely Browser",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(moduleDirectory, "preload.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    });
  }

  private async loadRenderer() {
    if (!this.mainWindow) {
      return;
    }

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await this.mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      return;
    }

    await this.mainWindow.loadFile(path.join(moduleDirectory, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  private registerIpc() {
    ipcMain.handle(IPC_CHANNELS.listWorkspaces, async () => this.persistence.listWorkspaces());
    ipcMain.handle(IPC_CHANNELS.loadWorkspace, async (_event, workspaceId?: string) => this.loadWorkspace(workspaceId ?? "default"));
    ipcMain.handle(IPC_CHANNELS.createRoot, async () => this.addRootNode());
    ipcMain.handle(IPC_CHANNELS.selectNode, async (_event, nodeId: string | null) => this.handleNodeSelection(nodeId));
    ipcMain.handle(IPC_CHANNELS.submitOmnibox, async (_event, input: string) => this.handleOmniboxSubmit(input));
    ipcMain.handle(IPC_CHANNELS.updateNodePosition, async (_event, nodeId: string, position: Point) =>
      this.updateNodePosition(nodeId, position)
    );
    ipcMain.handle(IPC_CHANNELS.autoOrganize, async () => this.autoOrganizeWorkspace());
    ipcMain.handle(IPC_CHANNELS.setViewMode, async (_event, viewMode: ViewMode) => this.updateViewMode(viewMode));
    ipcMain.handle(IPC_CHANNELS.setSearchProvider, async (_event, searchProvider: SearchProvider) =>
      this.updateSearchProvider(searchProvider)
    );
    ipcMain.handle(IPC_CHANNELS.setViewport, async (_event, viewport) => this.updateViewport(viewport));
    ipcMain.handle(IPC_CHANNELS.setReaderBounds, async (_event, bounds: PageBounds) => {
      this.pageManager?.updateBounds(bounds);
    });
    ipcMain.handle(IPC_CHANNELS.pageCommand, async (_event, command: BrowserCommand) => {
      this.pageManager?.sendCommand(command);
    });
  }

  private async loadWorkspace(workspaceId: string) {
    await this.pageManager?.reset();

    this.workspace = this.prepareWorkspace(
      appendEvent(await this.persistence.loadWorkspace(workspaceId), "workspace_loaded", null, {
        workspaceId
      })
    );
    this.broadcastWorkspace();
    await this.pageManager?.hydrate();
    this.scheduleSave();
    return this.workspace;
  }

  private prepareWorkspace(workspace: Workspace) {
    const hydratedWorkspace = workspace.nodes.length ? normalizeWorkspace(workspace) : createRootNode(normalizeWorkspace(workspace));
    return relayoutWorkspace(hydratedWorkspace);
  }

  private mutateWorkspace(
    updater: (workspace: Workspace) => Workspace,
    options: { relayout?: boolean; persist?: boolean; broadcast?: boolean } = {}
  ) {
    const relayout = options.relayout ?? true;
    const persist = options.persist ?? true;
    const broadcast = options.broadcast ?? true;

    this.workspace = updater(this.workspace);

    if (relayout) {
      this.workspace = relayoutWorkspace(this.workspace);
    }

    if (persist) {
      this.scheduleSave();
    }

    if (broadcast) {
      this.broadcastWorkspace();
    }

    return this.workspace;
  }

  private broadcastWorkspace() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send(IPC_CHANNELS.workspaceChanged, this.workspace);
  }

  private scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      void this.persistence.saveWorkspace(this.workspace);
    }, 250);
  }

  private async addRootNode() {
    this.mutateWorkspace((workspace) => createRootNode(workspace));
    await this.pageManager?.presentSelectedNode();
    return this.workspace;
  }

  private async handleNodeSelection(nodeId: string | null) {
    this.mutateWorkspace((workspace) => selectNode(workspace, nodeId), { relayout: false });
    await this.pageManager?.presentSelectedNode();
    return this.workspace;
  }

  private async handleOmniboxSubmit(input: string) {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return this.workspace;
    }

    const resolution = resolveOmniboxInput(trimmedInput, this.workspace.prefs.searchProvider);
    const selectedNode = findNode(this.workspace, this.workspace.selectedNodeId);
    let targetNodeId: string;

    if (!selectedNode) {
      this.mutateWorkspace((workspace) => createRootNode(workspace));
      targetNodeId = this.workspace.selectedNodeId as string;
    } else if (isFreshRootNode(selectedNode)) {
      targetNodeId = selectedNode.id;
    } else {
      this.mutateWorkspace((workspace) => createChildNode(workspace, selectedNode.id, resolution.origin));
      targetNodeId = this.workspace.selectedNodeId as string;
    }

    this.mutateWorkspace(
      (workspace) =>
        replaceNode(workspace, targetNodeId, (node) => ({
          ...node,
          url: resolution.url,
          searchQuery: resolution.query,
          origin: resolution.origin,
          runtimeState: "loading",
          errorMessage: null,
          updatedAt: Date.now()
        })),
      { relayout: false }
    );

    await this.pageManager?.loadNode(targetNodeId, resolution.url, {
      searchQuery: resolution.query
    });

    return this.workspace;
  }

  private async branchFromNode(request: BranchNavigationRequest) {
    this.mutateWorkspace((workspace) => createChildNode(workspace, request.parentNodeId, request.origin));
    const targetNodeId = this.workspace.selectedNodeId as string;

    this.mutateWorkspace(
      (workspace) =>
        replaceNode(workspace, targetNodeId, (node) => ({
          ...node,
          url: request.url,
          runtimeState: "loading",
          searchQuery: null,
          errorMessage: null,
          updatedAt: Date.now()
        })),
      { relayout: false }
    );

    await this.pageManager?.loadNode(targetNodeId, request.url);
  }

  private async updateNodePosition(nodeId: string, position: Point) {
    const snappedPosition = snapNodePosition(this.workspace, nodeId, position);

    this.mutateWorkspace(
      (workspace) =>
        replaceNode(workspace, nodeId, (node) => ({
          ...node,
          manualPosition: true,
          position: snappedPosition,
          updatedAt: Date.now()
        })),
      { relayout: true }
    );

    return this.workspace;
  }

  private async autoOrganizeWorkspace() {
    this.mutateWorkspace(
      (workspace) => ({
        ...workspace,
        updatedAt: Date.now(),
        nodes: workspace.nodes.map((node) => ({
          ...node,
          manualPosition: false
        }))
      }),
      { relayout: true }
    );

    return this.workspace;
  }

  private async updateViewMode(viewMode: ViewMode) {
    this.mutateWorkspace((workspace) => setViewMode(workspace, viewMode), { relayout: false });
    return this.workspace;
  }

  private async updateSearchProvider(searchProvider: SearchProvider) {
    this.mutateWorkspace((workspace) => setSearchProvider(workspace, searchProvider), { relayout: false });
    return this.workspace;
  }

  private async updateViewport(viewport: Workspace["prefs"]["viewport"]) {
    this.mutateWorkspace((workspace) => setViewport(workspace, viewport), { relayout: false });
    return this.workspace;
  }
}
