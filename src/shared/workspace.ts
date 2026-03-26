import type {
  EventLogType,
  GraphNode,
  NavigationEventRecord,
  NodeOrigin,
  Point,
  SearchProvider,
  ViewMode,
  Workspace,
  WorkspaceSummary
} from "./types";
import { normalizeSearchProvider } from "./navigation";

const WORKSPACE_VERSION = 1;
const MAX_EVENT_LOG_LENGTH = 250;

function now() {
  return Date.now();
}

function makeId() {
  return crypto.randomUUID();
}

function makeEmptyNodeTitle() {
  return "Untitled thread";
}

function defaultPosition(): Point {
  return { x: 0, y: 0 };
}

function createNode({
  parentId,
  rootId,
  origin,
  slotIndex
}: {
  parentId: string | null;
  rootId: string;
  origin: NodeOrigin;
  slotIndex: number;
}): GraphNode {
  const timestamp = now();

  return {
    id: makeId(),
    parentId,
    rootId,
    title: makeEmptyNodeTitle(),
    url: null,
    faviconUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastVisitedAt: null,
    lastActiveAt: null,
    origin,
    runtimeState: "empty",
    position: defaultPosition(),
    manualPosition: false,
    slotIndex,
    depth: parentId ? 1 : 0,
    searchQuery: null,
    history: null,
    canGoBack: false,
    canGoForward: false,
    errorMessage: null
  };
}

export function createEmptyWorkspace(id = "default", name = "Nodely Workspace"): Workspace {
  const timestamp = now();

  return {
    version: WORKSPACE_VERSION,
    id,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    selectedNodeId: null,
    nodes: [],
    edges: [],
    eventLog: [],
    prefs: {
      viewMode: "split",
      searchProvider: "google",
      viewport: {
        x: 0,
        y: 0,
        zoom: 0.85
      }
    }
  };
}

export function cloneWorkspace(workspace: Workspace) {
  return structuredClone(workspace);
}

export function findNode(workspace: Workspace, nodeId: string | null | undefined) {
  if (!nodeId) {
    return null;
  }

  return workspace.nodes.find((node) => node.id === nodeId) ?? null;
}

export function findChildren(workspace: Workspace, nodeId: string) {
  return workspace.nodes
    .filter((node) => node.parentId === nodeId)
    .sort((left, right) => left.slotIndex - right.slotIndex || left.createdAt - right.createdAt);
}

export function findRoots(workspace: Workspace) {
  return workspace.nodes
    .filter((node) => node.parentId === null)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function isFreshRootNode(node: GraphNode | null) {
  return Boolean(node && node.parentId === null && !node.url);
}

export function createRootNode(workspace: Workspace) {
  const rootNode = createNode({
    parentId: null,
    rootId: "",
    origin: "root",
    slotIndex: findRoots(workspace).length
  });

  rootNode.rootId = rootNode.id;

  const nextWorkspace = {
    ...workspace,
    updatedAt: now(),
    selectedNodeId: rootNode.id,
    nodes: [...workspace.nodes, rootNode]
  };

  return appendEvent(nextWorkspace, "node_created", rootNode.id, {
    origin: "root",
    parentId: null
  });
}

export function createChildNode(workspace: Workspace, parentId: string, origin: NodeOrigin) {
  const parentNode = findNode(workspace, parentId);

  if (!parentNode) {
    throw new Error(`Parent node ${parentId} was not found.`);
  }

  const childNode = createNode({
    parentId,
    rootId: parentNode.rootId,
    origin,
    slotIndex: findChildren(workspace, parentId).length
  });

  childNode.depth = parentNode.depth + 1;

  const timestamp = now();

  const nextWorkspace = {
    ...workspace,
    updatedAt: timestamp,
    selectedNodeId: childNode.id,
    nodes: [...workspace.nodes, childNode],
    edges: [
      ...workspace.edges,
      {
        id: makeId(),
        source: parentId,
        target: childNode.id,
        createdAt: timestamp
      }
    ]
  };

  return appendEvent(nextWorkspace, "node_created", childNode.id, {
    origin,
    parentId
  });
}

export function replaceNode(workspace: Workspace, nodeId: string, updater: (node: GraphNode) => GraphNode) {
  const nextNodes = workspace.nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    return updater(node);
  });

  return {
    ...workspace,
    updatedAt: now(),
    nodes: nextNodes
  };
}

export function selectNode(workspace: Workspace, nodeId: string | null) {
  const nextWorkspace = {
    ...workspace,
    updatedAt: now(),
    selectedNodeId: nodeId
  };

  return appendEvent(nextWorkspace, "node_selected", nodeId, {});
}

export function setViewMode(workspace: Workspace, viewMode: ViewMode) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      viewMode
    }
  };
}

export function setSearchProvider(workspace: Workspace, searchProvider: SearchProvider) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      searchProvider
    }
  };
}

export function setViewport(workspace: Workspace, viewport: Workspace["prefs"]["viewport"]) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      viewport
    }
  };
}

export function normalizeWorkspace(workspace: Workspace) {
  const viewMode: ViewMode = workspace.prefs.viewMode === "focus" ? "focus" : "split";

  return {
    ...workspace,
    prefs: {
      ...workspace.prefs,
      viewMode,
      searchProvider: normalizeSearchProvider(workspace.prefs.searchProvider),
      viewport: {
        x: typeof workspace.prefs.viewport?.x === "number" ? workspace.prefs.viewport.x : 0,
        y: typeof workspace.prefs.viewport?.y === "number" ? workspace.prefs.viewport.y : 0,
        zoom: typeof workspace.prefs.viewport?.zoom === "number" ? workspace.prefs.viewport.zoom : 0.85
      }
    }
  };
}

export function summarizeWorkspace(workspace: Workspace): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    updatedAt: workspace.updatedAt
  };
}

export function appendEvent(
  workspace: Workspace,
  type: EventLogType,
  nodeId: string | null,
  details: NavigationEventRecord["details"]
) {
  const event: NavigationEventRecord = {
    id: makeId(),
    type,
    nodeId,
    timestamp: now(),
    details
  };

  return {
    ...workspace,
    eventLog: [...workspace.eventLog.slice(-(MAX_EVENT_LOG_LENGTH - 1)), event]
  };
}
