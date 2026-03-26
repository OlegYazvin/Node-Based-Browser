import { create } from "zustand";
import type { GraphNode, Point, SearchProvider, ViewMode, Workspace } from "../../shared/types";

interface WorkspaceState {
  workspace: Workspace | null;
  isBootstrapping: boolean;
  bootstrap(): Promise<void>;
  applyWorkspace(workspace: Workspace): void;
  applyNodeMeta(node: GraphNode): void;
  createRootNode(): Promise<void>;
  selectNode(nodeId: string | null): Promise<void>;
  submitOmnibox(input: string): Promise<void>;
  updateNodePosition(nodeId: string, position: Point): Promise<void>;
  autoOrganize(): Promise<void>;
  setViewMode(viewMode: ViewMode): Promise<void>;
  setSearchProvider(searchProvider: SearchProvider): Promise<void>;
  setViewport(viewport: Workspace["prefs"]["viewport"]): Promise<void>;
  pageCommand(command: "back" | "forward" | "reload"): Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: null,
  isBootstrapping: false,
  async bootstrap() {
    set({ isBootstrapping: true });
    const workspace = await window.researchGraph.loadWorkspace("default");
    set({ workspace, isBootstrapping: false });
  },
  applyWorkspace(workspace) {
    set({ workspace });
  },
  applyNodeMeta(node) {
    set((state) => {
      if (!state.workspace) {
        return state;
      }

      return {
        workspace: {
          ...state.workspace,
          nodes: state.workspace.nodes.map((existingNode) => (existingNode.id === node.id ? node : existingNode))
        }
      };
    });
  },
  async createRootNode() {
    await window.researchGraph.createRootNode();
  },
  async selectNode(nodeId) {
    await window.researchGraph.selectNode(nodeId);
  },
  async submitOmnibox(input) {
    await window.researchGraph.submitOmnibox(input);
  },
  async updateNodePosition(nodeId, position) {
    await window.researchGraph.updateNodePosition(nodeId, position);
  },
  async autoOrganize() {
    await window.researchGraph.autoOrganize();
  },
  async setViewMode(viewMode) {
    await window.researchGraph.setViewMode(viewMode);
  },
  async setSearchProvider(searchProvider) {
    await window.researchGraph.setSearchProvider(searchProvider);
  },
  async setViewport(viewport) {
    await window.researchGraph.setViewport(viewport);
  },
  async pageCommand(command) {
    await window.researchGraph.pageCommand(command);
  }
}));
