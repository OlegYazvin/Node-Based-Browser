import { contextBridge, ipcRenderer } from "electron";
import type { ResearchGraphApi } from "../shared/api";
import { IPC_CHANNELS } from "../shared/ipc";
import type { GraphNode, Workspace } from "../shared/types";

const api: ResearchGraphApi = {
  listWorkspaces: () => ipcRenderer.invoke(IPC_CHANNELS.listWorkspaces),
  loadWorkspace: (workspaceId?: string) => ipcRenderer.invoke(IPC_CHANNELS.loadWorkspace, workspaceId),
  createRootNode: () => ipcRenderer.invoke(IPC_CHANNELS.createRoot),
  selectNode: (nodeId: string | null) => ipcRenderer.invoke(IPC_CHANNELS.selectNode, nodeId),
  submitOmnibox: (input: string) => ipcRenderer.invoke(IPC_CHANNELS.submitOmnibox, input),
  updateNodePosition: (nodeId, position) => ipcRenderer.invoke(IPC_CHANNELS.updateNodePosition, nodeId, position),
  autoOrganize: () => ipcRenderer.invoke(IPC_CHANNELS.autoOrganize),
  setViewMode: (viewMode) => ipcRenderer.invoke(IPC_CHANNELS.setViewMode, viewMode),
  setSearchProvider: (searchProvider) => ipcRenderer.invoke(IPC_CHANNELS.setSearchProvider, searchProvider),
  setViewport: (viewport) => ipcRenderer.invoke(IPC_CHANNELS.setViewport, viewport),
  setReaderBounds: (bounds) => ipcRenderer.invoke(IPC_CHANNELS.setReaderBounds, bounds),
  pageCommand: (command) => ipcRenderer.invoke(IPC_CHANNELS.pageCommand, command),
  onWorkspaceChanged: (listener: (workspace: Workspace) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspace: Workspace) => {
      listener(workspace);
    };

    ipcRenderer.on(IPC_CHANNELS.workspaceChanged, handler);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.workspaceChanged, handler);
    };
  },
  onNodeMetaChanged: (listener: (node: GraphNode) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, node: GraphNode) => {
      listener(node);
    };

    ipcRenderer.on(IPC_CHANNELS.nodeMetaChanged, handler);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.nodeMetaChanged, handler);
    };
  }
};

contextBridge.exposeInMainWorld("researchGraph", api);
