import type { BrowserCommand, GraphNode, PageBounds, Point, SearchProvider, ViewMode, Workspace, WorkspaceSummary } from "./types";

export interface ResearchGraphApi {
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  loadWorkspace(workspaceId?: string): Promise<Workspace>;
  createRootNode(): Promise<Workspace>;
  selectNode(nodeId: string | null): Promise<Workspace>;
  submitOmnibox(input: string): Promise<Workspace>;
  updateNodePosition(nodeId: string, position: Point): Promise<Workspace>;
  autoOrganize(): Promise<Workspace>;
  setViewMode(viewMode: ViewMode): Promise<Workspace>;
  setSearchProvider(searchProvider: SearchProvider): Promise<Workspace>;
  setViewport(viewport: Workspace["prefs"]["viewport"]): Promise<Workspace>;
  setReaderBounds(bounds: PageBounds): Promise<void>;
  pageCommand(command: BrowserCommand): Promise<void>;
  onWorkspaceChanged(listener: (workspace: Workspace) => void): () => void;
  onNodeMetaChanged(listener: (node: GraphNode) => void): () => void;
}
