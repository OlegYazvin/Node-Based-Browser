export type ViewMode = "split" | "focus";
export type SearchProvider = "google" | "wikipedia";
export type NodeOrigin =
  | "root"
  | "link"
  | "window-open"
  | "omnibox-url"
  | "search"
  | "restore";
export type NodeRuntimeState = "empty" | "loading" | "live" | "suspended" | "error";
export type EventLogType =
  | "workspace_loaded"
  | "node_created"
  | "node_selected"
  | "node_navigated"
  | "node_suspended"
  | "node_restored";
export type BrowserCommand = "back" | "forward" | "reload";

export interface Point {
  x: number;
  y: number;
}

export interface GraphViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface SerializedNavigationEntry {
  url: string;
  title: string;
  [key: string]: unknown;
}

export interface SavedNavigationHistory {
  index: number;
  entries: SerializedNavigationEntry[];
}

export interface GraphNode {
  id: string;
  parentId: string | null;
  rootId: string;
  title: string;
  url: string | null;
  faviconUrl: string | null;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number | null;
  lastActiveAt: number | null;
  origin: NodeOrigin;
  runtimeState: NodeRuntimeState;
  position: Point;
  manualPosition: boolean;
  slotIndex: number;
  depth: number;
  searchQuery: string | null;
  history: SavedNavigationHistory | null;
  canGoBack: boolean;
  canGoForward: boolean;
  errorMessage: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  createdAt: number;
}

export interface WorkspacePrefs {
  viewMode: ViewMode;
  searchProvider: SearchProvider;
  viewport: GraphViewport;
}

export interface NavigationEventRecord {
  id: string;
  type: EventLogType;
  nodeId: string | null;
  timestamp: number;
  details: Record<string, string | number | boolean | null>;
}

export interface Workspace {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  selectedNodeId: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  eventLog: NavigationEventRecord[];
  prefs: WorkspacePrefs;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export interface OmniboxResolution {
  kind: "url" | "search";
  url: string;
  input: string;
  query: string | null;
  origin: NodeOrigin;
}
