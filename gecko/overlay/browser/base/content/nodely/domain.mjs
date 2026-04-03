const WORKSPACE_VERSION = 1;
const DEFAULT_SURFACE_MODE = "page";
const DEFAULT_SPLIT_WIDTH = 340;
const MIN_SPLIT_WIDTH = 240;
const MAX_SPLIT_WIDTH = 640;
const MAX_EVENT_LOG_LENGTH = 250;

const URL_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const IP_ADDRESS_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/.*)?$/;
const LOCALHOST_PATTERN = /^localhost(?::\d+)?(?:\/.*)?$/i;

const ROOT_RING_RADIUS = 1040;
const ROOT_RING_STEP = 920;
const ROOT_CHILD_RADIUS = 268;
const CHILD_RADIUS = 214;
const COMPACT_CHILD_RADIUS = 182;
const ARTIFACT_CHILD_RADIUS = 104;
const ARTIFACT_RING_STEP = 14;
const DEPTH_RADIUS_STEP = 24;
const COMPACT_DEPTH_RADIUS_STEP = 10;
const SIBLING_RADIUS_STEP = 14;
const SINGLE_CHILD_ZIGZAG_ANGLE = Math.PI / 5.4;
const MULTI_CHILD_DEPTH_SWAY = Math.PI / 20;

const RESEARCH_HOST_PATTERNS = [
  /(^|\.)google\./u,
  /(^|\.)bing\.com$/u,
  /(^|\.)duckduckgo\.com$/u,
  /(^|\.)wikipedia\.org$/u,
  /(^|\.)arxiv\.org$/u,
  /(^|\.)ncbi\.nlm\.nih\.gov$/u,
  /(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/u,
  /(^|\.)semanticscholar\.org$/u,
  /(^|\.)researchgate\.net$/u,
  /(^|\.)scholar\.google\.com$/u,
  /(^|\.)jstor\.org$/u,
  /(^|\.)science\.org$/u,
  /(^|\.)nature\.com$/u,
  /(^|\.)springer\.com$/u,
  /(^|\.)sciencedirect\.com$/u,
  /(^|\.)britannica\.com$/u,
  /(^|\.)doi\.org$/u
];

const SOCIAL_HOST_PATTERNS = [
  /(^|\.)x\.com$/u,
  /(^|\.)twitter\.com$/u,
  /(^|\.)facebook\.com$/u,
  /(^|\.)instagram\.com$/u,
  /(^|\.)linkedin\.com$/u,
  /(^|\.)reddit\.com$/u,
  /(^|\.)youtube\.com$/u,
  /(^|\.)tiktok\.com$/u,
  /(^|\.)discord\.com$/u,
  /(^|\.)threads\.net$/u
];

const COMMERCIAL_HOST_PATTERNS = [
  /(^|\.)amazon\./u,
  /(^|\.)ebay\.com$/u,
  /(^|\.)walmart\.com$/u,
  /(^|\.)target\.com$/u,
  /(^|\.)bestbuy\.com$/u,
  /(^|\.)etsy\.com$/u,
  /(^|\.)shopify\.com$/u,
  /(^|\.)aliexpress\.com$/u,
  /(^|\.)alibaba\.com$/u,
  /(^|\.)costco\.com$/u,
  /(^|\.)wayfair\.com$/u,
  /(^|\.)newegg\.com$/u
];

export const SITE_CATEGORY_STYLES = {
  research: {
    label: "Research",
    fill: "#dfeeff",
    border: "#5a8fe0",
    accent: "#285eb6",
    minimapFill: "#6f99df"
  },
  social: {
    label: "Social",
    fill: "#ffe9d3",
    border: "#cf8a46",
    accent: "#a8641e",
    minimapFill: "#dea165"
  },
  commercial: {
    label: "Commercial",
    fill: "#dff1e4",
    border: "#4f8c60",
    accent: "#2f6b3f",
    minimapFill: "#74ab80"
  },
  general: {
    label: "General",
    fill: "#e3e9f1",
    border: "#708194",
    accent: "#4d6073",
    minimapFill: "#91a0b1"
  }
};

export const GRAPH_NODE_WIDTH = 142;
export const GRAPH_NODE_HEIGHT = 126;
export const GRAPH_ARTIFACT_WIDTH = 96;
export const GRAPH_ARTIFACT_HEIGHT = 52;
export const GRAPH_NODE_GAP = 16;
export const GRAPH_EDGE_CLEARANCE = 16;

const DRAG_SNAP_STEP = 24;
const DRAG_SNAP_RINGS = 36;

function now() {
  return Date.now();
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `nodely-${now()}-${Math.random().toString(16).slice(2)}`;
}

function makeEmptyNodeTitle() {
  return "Untitled thread";
}

function defaultPosition() {
  return { x: 0, y: 0 };
}

function createNode({ parentId, rootId, origin, slotIndex }) {
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
    kind: "page",
    artifact: null,
    runtimeState: "empty",
    position: defaultPosition(),
    manualPosition: false,
    slotIndex,
    depth: parentId ? 1 : 0,
    searchQuery: null,
    history: null,
    canGoBack: false,
    canGoForward: false,
    errorMessage: null,
    permissions: null
  };
}

export function cloneWorkspace(workspace) {
  return globalThis.structuredClone ? structuredClone(workspace) : JSON.parse(JSON.stringify(workspace));
}

export function createEmptyWorkspace(id = "default", name = "Nodely Workspace") {
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
      surfaceMode: DEFAULT_SURFACE_MODE,
      searchProvider: "google",
      captureNextNavigation: false,
      showFocusHint: true,
      splitWidth: DEFAULT_SPLIT_WIDTH,
      viewport: {
        x: 0,
        y: 0,
        zoom: 0.85
      }
    }
  };
}

export function normalizeSearchProvider(searchProvider) {
  return searchProvider === "wikipedia" ? "wikipedia" : "google";
}

function normalizeCandidateUrl(input) {
  const trimmed = input.trim();

  if (!trimmed || (!URL_PROTOCOL_PATTERN.test(trimmed) && /\s/.test(trimmed))) {
    return null;
  }

  if (URL_PROTOCOL_PATTERN.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  }

  const looksLikeHost =
    trimmed.includes(".") || IP_ADDRESS_PATTERN.test(trimmed) || LOCALHOST_PATTERN.test(trimmed);

  if (!looksLikeHost) {
    return null;
  }

  const prefix =
    LOCALHOST_PATTERN.test(trimmed) || IP_ADDRESS_PATTERN.test(trimmed) ? "http://" : "https://";

  try {
    return new URL(`${prefix}${trimmed}`).toString();
  } catch {
    return null;
  }
}

export function buildSearchUrl(query, provider) {
  const encoded = encodeURIComponent(query.trim());

  return provider === "wikipedia"
    ? `https://en.wikipedia.org/w/index.php?search=${encoded}`
    : `https://www.google.com/search?q=${encoded}`;
}

export function resolveOmniboxInput(input, provider) {
  const normalizedInput = input.trim();
  const normalizedUrl = normalizeCandidateUrl(normalizedInput);

  if (normalizedUrl) {
    return {
      kind: "url",
      url: normalizedUrl,
      input: normalizedInput,
      query: null,
      origin: "omnibox-url"
    };
  }

  return {
    kind: "search",
    url: buildSearchUrl(normalizedInput, provider),
    input: normalizedInput,
    query: normalizedInput,
    origin: "search"
  };
}

function hostnameForUrl(url) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesAny(hostname, patterns) {
  return patterns.some((pattern) => pattern.test(hostname));
}

export function classifySiteCategory(url) {
  const hostname = hostnameForUrl(url);

  if (!hostname) {
    return "general";
  }

  if (matchesAny(hostname, RESEARCH_HOST_PATTERNS)) {
    return "research";
  }

  if (matchesAny(hostname, SOCIAL_HOST_PATTERNS)) {
    return "social";
  }

  if (matchesAny(hostname, COMMERCIAL_HOST_PATTERNS)) {
    return "commercial";
  }

  return "general";
}

export function siteCategoryLabel(category) {
  return SITE_CATEGORY_STYLES[category]?.label ?? SITE_CATEGORY_STYLES.general.label;
}

export function isArtifactNode(node) {
  return Boolean(node && node.kind && node.kind !== "page");
}

export function isPageNode(node) {
  return Boolean(node) && !isArtifactNode(node);
}

function defaultArtifactData(kind = "download") {
  return {
    kind,
    transferId: null,
    fileName: null,
    filePath: null,
    sourceUrl: null,
    referrerUrl: null,
    pageUrl: null,
    mimeType: null,
    inputLabel: null,
    totalBytes: null,
    receivedBytes: null,
    status: kind === "download" ? "in-progress" : "captured",
    recordedAt: now()
  };
}

function normalizeArtifactData(node) {
  if (!isArtifactNode(node)) {
    return null;
  }

  return {
    ...defaultArtifactData(node.kind),
    ...(node.artifact ?? {})
  };
}

function normalizeNode(node) {
  const kind = node?.kind === "download" || node?.kind === "upload" ? node.kind : "page";

  return {
    ...node,
    kind,
    artifact: kind === "page" ? null : normalizeArtifactData({ ...node, kind }),
    permissions:
      kind === "page" && node?.permissions
        ? {
            activeCount: Math.max(0, Number(node.permissions.activeCount) || 0),
            blockedCount: Math.max(0, Number(node.permissions.blockedCount) || 0),
            labels: Array.isArray(node.permissions.labels) ? [...node.permissions.labels] : []
          }
        : null
  };
}

function artifactTitle(kind, artifact) {
  return artifact.fileName || (kind === "upload" ? "Uploaded file" : "Downloaded file");
}

export function findNode(workspace, nodeId) {
  if (!workspace || !nodeId) {
    return null;
  }

  return workspace.nodes.find((node) => node.id === nodeId) ?? null;
}

export function findChildren(workspace, nodeId) {
  if (!workspace) {
    return [];
  }

  return workspace.nodes
    .filter((node) => node.parentId === nodeId)
    .sort((left, right) => left.slotIndex - right.slotIndex || left.createdAt - right.createdAt);
}

export function findPageChildren(workspace, nodeId) {
  return findChildren(workspace, nodeId).filter(isPageNode);
}

export function findArtifactChildren(workspace, nodeId) {
  return findChildren(workspace, nodeId).filter(isArtifactNode);
}

export function findRoots(workspace) {
  if (!workspace) {
    return [];
  }

  return workspace.nodes
    .filter((node) => node.parentId === null)
    .sort((left, right) => left.slotIndex - right.slotIndex || left.createdAt - right.createdAt);
}

export function orderTreeNodesForTabs(workspace, rootId) {
  if (!workspace) {
    return [];
  }

  const rootNode = findNode(workspace, rootId);

  if (!rootNode) {
    return [];
  }

  const orderedNodes = [];

  const visit = (node) => {
    orderedNodes.push(node);

    for (const childNode of findPageChildren(workspace, node.id)) {
      if (childNode.rootId === rootId) {
        visit(childNode);
      }
    }
  };

  visit(rootNode);
  return orderedNodes;
}

export function isFreshRootNode(node) {
  return Boolean(node && node.parentId === null && !node.url);
}

export function findOwningPageNode(workspace, nodeOrId) {
  let currentNode = typeof nodeOrId === "string" ? findNode(workspace, nodeOrId) : nodeOrId;

  while (currentNode) {
    if (isPageNode(currentNode)) {
      return currentNode;
    }
    currentNode = currentNode.parentId ? findNode(workspace, currentNode.parentId) : null;
  }

  return null;
}

export function appendEvent(workspace, type, nodeId, details) {
  const event = {
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

export function replaceNode(workspace, nodeId, updater) {
  return {
    ...workspace,
    updatedAt: now(),
    nodes: workspace.nodes.map((node) => (node.id === nodeId ? updater(node) : node))
  };
}

export function createRootNode(workspace) {
  const rootNode = createNode({
    parentId: null,
    rootId: "",
    origin: "root",
    slotIndex: findRoots(workspace).length
  });

  rootNode.rootId = rootNode.id;

  return appendEvent(
    {
      ...workspace,
      updatedAt: now(),
      selectedNodeId: rootNode.id,
      nodes: [...workspace.nodes, rootNode]
    },
    "node_created",
    rootNode.id,
    {
      origin: "root",
      parentId: null
    }
  );
}

export function createChildNode(workspace, parentId, origin, options = {}) {
  const parentNode = findNode(workspace, parentId);

  if (!parentNode) {
    throw new Error(`Parent node ${parentId} was not found.`);
  }

  const childNode = createNode({
    parentId,
    rootId: parentNode.rootId,
    origin,
    slotIndex: findPageChildren(workspace, parentId).length
  });

  childNode.depth = parentNode.depth + 1;
  const timestamp = now();

  return appendEvent(
    {
      ...workspace,
      updatedAt: timestamp,
      selectedNodeId: options.selectChild === false ? workspace.selectedNodeId : childNode.id,
      nodes: [...workspace.nodes, childNode],
      edges: [...workspace.edges, { id: makeId(), source: parentId, target: childNode.id, createdAt: timestamp }]
    },
    "node_created",
    childNode.id,
    {
      origin,
      parentId
    }
  );
}

export function upsertArtifactNode(workspace, parentId, kind, artifactData, options = {}) {
  const parentNode = findNode(workspace, parentId);

  if (!parentNode) {
    throw new Error(`Parent node ${parentId} was not found.`);
  }

  const normalizedKind = kind === "upload" ? "upload" : "download";
  const artifact = {
    ...defaultArtifactData(normalizedKind),
    ...artifactData,
    kind: normalizedKind,
    recordedAt: artifactData?.recordedAt ?? now()
  };
  const existingNode =
    artifact.transferId == null
      ? null
      : findArtifactChildren(workspace, parentId).find(
          (node) => node.kind === normalizedKind && node.artifact?.transferId === artifact.transferId
        ) ?? null;

  if (existingNode) {
    return appendEvent(
      replaceNode(workspace, existingNode.id, (node) => ({
        ...node,
        title: artifactTitle(normalizedKind, artifact),
        artifact: {
          ...node.artifact,
          ...artifact
        },
        updatedAt: now()
      })),
      "artifact_updated",
      existingNode.id,
      {
        artifactKind: normalizedKind,
        parentId
      }
    );
  }

  const childNode = createNode({
    parentId,
    rootId: parentNode.rootId,
    origin: normalizedKind,
    slotIndex: findArtifactChildren(workspace, parentId).length
  });

  childNode.depth = parentNode.depth + 1;
  childNode.kind = normalizedKind;
  childNode.title = artifactTitle(normalizedKind, artifact);
  childNode.runtimeState = "artifact";
  childNode.artifact = artifact;
  childNode.permissions = null;
  childNode.url = null;
  childNode.faviconUrl = null;
  childNode.canGoBack = false;
  childNode.canGoForward = false;

  const timestamp = now();

  return appendEvent(
    {
      ...workspace,
      updatedAt: timestamp,
      selectedNodeId: options.selectArtifact === true ? childNode.id : workspace.selectedNodeId,
      nodes: [...workspace.nodes, childNode],
      edges: [...workspace.edges, { id: makeId(), source: parentId, target: childNode.id, createdAt: timestamp }]
    },
    "artifact_recorded",
    childNode.id,
    {
      artifactKind: normalizedKind,
      parentId,
      fileName: artifact.fileName
    }
  );
}

function sortNodesForSlots(nodes) {
  return [...nodes].sort((left, right) => left.slotIndex - right.slotIndex || left.createdAt - right.createdAt);
}

function reindexWorkspaceSlots(workspace) {
  const rootSlotById = new Map();
  sortNodesForSlots(findRoots(workspace)).forEach((rootNode, index) => rootSlotById.set(rootNode.id, index));

  const pageChildSlotById = new Map();
  const artifactChildSlotById = new Map();

  for (const parentNode of workspace.nodes) {
    sortNodesForSlots(findPageChildren(workspace, parentNode.id)).forEach((childNode, index) =>
      pageChildSlotById.set(childNode.id, index)
    );
    sortNodesForSlots(findArtifactChildren(workspace, parentNode.id)).forEach((childNode, index) =>
      artifactChildSlotById.set(childNode.id, index)
    );
  }

  return {
    ...workspace,
    nodes: workspace.nodes.map((node) => ({
      ...node,
      slotIndex:
        node.parentId === null
          ? rootSlotById.get(node.id) ?? node.slotIndex
          : isArtifactNode(node)
            ? artifactChildSlotById.get(node.id) ?? node.slotIndex
            : pageChildSlotById.get(node.id) ?? node.slotIndex
    }))
  };
}

export function renameTree(workspace, rootId, title) {
  const rootNode = findNode(workspace, rootId);

  if (!rootNode || rootNode.parentId !== null) {
    return workspace;
  }

  const nextTitle = title.trim() || rootNode.title || makeEmptyNodeTitle();

  return replaceNode(workspace, rootId, (node) => ({
    ...node,
    title: nextTitle
  }));
}

export function removeTree(workspace, rootId) {
  const removedNodeIds = new Set(workspace.nodes.filter((node) => node.rootId === rootId).map((node) => node.id));

  if (!removedNodeIds.size) {
    return workspace;
  }

  const nextNodes = workspace.nodes.filter((node) => !removedNodeIds.has(node.id));
  const nextEdges = workspace.edges.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target));
  const nextSelectedNodeId =
    workspace.selectedNodeId && removedNodeIds.has(workspace.selectedNodeId)
      ? sortNodesForSlots(nextNodes.filter((node) => node.parentId === null))[0]?.id ?? null
      : workspace.selectedNodeId;

  return reindexWorkspaceSlots({
    ...workspace,
    updatedAt: now(),
    selectedNodeId: nextSelectedNodeId,
    nodes: nextNodes,
    edges: nextEdges
  });
}

export function selectNode(workspace, nodeId) {
  return appendEvent(
    {
      ...workspace,
      updatedAt: now(),
      selectedNodeId: nodeId
    },
    "node_selected",
    nodeId,
    {}
  );
}

export function setViewMode(workspace, viewMode) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      viewMode: viewMode === "focus" ? "focus" : "split"
    }
  };
}

export function setSurfaceMode(workspace, surfaceMode) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      surfaceMode: normalizeSurfaceMode(surfaceMode)
    }
  };
}

export function setSearchProvider(workspace, searchProvider) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      searchProvider: normalizeSearchProvider(searchProvider)
    }
  };
}

export function setCaptureNextNavigation(workspace, captureNextNavigation) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      captureNextNavigation: captureNextNavigation === true
    }
  };
}

export function setShowFocusHint(workspace, showFocusHint) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      showFocusHint: showFocusHint !== false
    }
  };
}

export function setViewport(workspace, viewport) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      viewport
    }
  };
}

export function setSplitWidth(workspace, splitWidth) {
  return {
    ...workspace,
    updatedAt: now(),
    prefs: {
      ...workspace.prefs,
      splitWidth: clampSplitWidth(splitWidth)
    }
  };
}

export function summarizeWorkspace(workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    updatedAt: workspace.updatedAt
  };
}

export function normalizeWorkspace(workspace) {
  return {
    ...workspace,
    nodes: Array.isArray(workspace.nodes) ? workspace.nodes.map(normalizeNode) : [],
    edges: Array.isArray(workspace.edges) ? workspace.edges : [],
    eventLog: Array.isArray(workspace.eventLog) ? workspace.eventLog : [],
    prefs: {
      ...workspace.prefs,
      viewMode: workspace.prefs.viewMode === "focus" ? "focus" : "split",
      surfaceMode: normalizeSurfaceMode(workspace.prefs.surfaceMode),
      searchProvider: normalizeSearchProvider(workspace.prefs.searchProvider),
      captureNextNavigation: workspace.prefs.captureNextNavigation === true,
      showFocusHint: workspace.prefs.showFocusHint !== false,
      splitWidth: clampSplitWidth(workspace.prefs.splitWidth),
      viewport: {
        x: typeof workspace.prefs.viewport?.x === "number" ? workspace.prefs.viewport.x : 0,
        y: typeof workspace.prefs.viewport?.y === "number" ? workspace.prefs.viewport.y : 0,
        zoom: typeof workspace.prefs.viewport?.zoom === "number" ? workspace.prefs.viewport.zoom : 0.85
      }
    }
  };
}

function normalizeSurfaceMode(surfaceMode) {
  return surfaceMode === "canvas" ? "canvas" : DEFAULT_SURFACE_MODE;
}

function clampSplitWidth(splitWidth) {
  if (typeof splitWidth !== "number" || !Number.isFinite(splitWidth)) {
    return DEFAULT_SPLIT_WIDTH;
  }

  return Math.max(MIN_SPLIT_WIDTH, Math.min(MAX_SPLIT_WIDTH, Math.round(splitWidth)));
}

export function applyNodeNavigation(workspace, nodeId, resolution) {
  const targetNode = findNode(workspace, nodeId);

  if (!isPageNode(targetNode)) {
    return workspace;
  }

  return appendEvent(
    replaceNode(workspace, nodeId, (node) => ({
      ...node,
      url: resolution.url,
      searchQuery: resolution.query,
      origin: resolution.origin,
      runtimeState: "loading",
      updatedAt: now(),
      errorMessage: null
    })),
    "node_navigated",
    nodeId,
    {
      url: resolution.url,
      kind: resolution.kind
    }
  );
}

export function updateNodeMetadata(workspace, nodeId, metadata) {
  return replaceNode(workspace, nodeId, (node) => ({
    ...node,
    title: metadata.title ?? node.title,
    url: metadata.url ?? node.url,
    faviconUrl: metadata.faviconUrl ?? node.faviconUrl,
    runtimeState: metadata.runtimeState ?? node.runtimeState,
    canGoBack: metadata.canGoBack ?? node.canGoBack,
    canGoForward: metadata.canGoForward ?? node.canGoForward,
    history: metadata.history ?? node.history,
    permissions: metadata.permissions ?? node.permissions,
    errorMessage: metadata.errorMessage ?? node.errorMessage,
    lastVisitedAt: metadata.url ? now() : node.lastVisitedAt,
    lastActiveAt: now(),
    updatedAt: now()
  }));
}

export function clearManualPositions(workspace) {
  return {
    ...workspace,
    updatedAt: now(),
    nodes: workspace.nodes.map((node) => ({
      ...node,
      manualPosition: false
    }))
  };
}

function orderedRoots(workspace) {
  const roots = sortNodesForSlots(findRoots(workspace));
  const selectedNode = findNode(workspace, workspace.selectedNodeId);
  const centerRootId = selectedNode?.rootId ?? roots[0]?.id ?? null;

  if (!centerRootId) {
    return roots;
  }

  return roots.sort((left, right) => {
    if (left.id === centerRootId) {
      return -1;
    }

    if (right.id === centerRootId) {
      return 1;
    }

    return left.slotIndex - right.slotIndex || left.createdAt - right.createdAt;
  });
}

function rootAnchor(index) {
  if (index === 0) {
    return { x: 0, y: 0 };
  }

  let remaining = index - 1;
  let ring = 1;
  let ringCapacity = 6;

  while (remaining >= ringCapacity) {
    remaining -= ringCapacity;
    ring += 1;
    ringCapacity = ring * 6;
  }

  const angle = -Math.PI / 2 + (Math.PI * 2 * remaining) / ringCapacity;
  const radius = ROOT_RING_RADIUS + (ring - 1) * ROOT_RING_STEP;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

function radialPoint(origin, angle, radius) {
  return {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius
  };
}

function placeNode(workspace, node, position, angle, positionedNodes, branchAxis = angle) {
  const resolvedPosition = node.manualPosition ? node.position : position;

  positionedNodes.set(node.id, {
    ...node,
    position: resolvedPosition
  });

  const pageChildren = sortNodesForSlots(findPageChildren(workspace, node.id));
  const artifactChildren = sortNodesForSlots(findArtifactChildren(workspace, node.id));

  if (artifactChildren.length) {
    const artifactBaseAngle = node.parentId === null ? Math.PI / 2 : (angle ?? -Math.PI / 2) + Math.PI / 2;
    const artifactSpread = Math.min(1.18, 0.42 + artifactChildren.length * 0.12);

    artifactChildren.forEach((child, childIndex) => {
      const artifactAngle =
        artifactChildren.length === 1
          ? artifactBaseAngle
          : artifactBaseAngle -
            artifactSpread / 2 +
            (artifactSpread * (childIndex + 0.5)) / artifactChildren.length;
      const artifactRadius = ARTIFACT_CHILD_RADIUS + Math.max(0, artifactChildren.length - 1) * ARTIFACT_RING_STEP;

      placeNode(workspace, child, radialPoint(resolvedPosition, artifactAngle, artifactRadius), artifactAngle, positionedNodes, artifactAngle);
    });
  }

  if (!pageChildren.length) {
    return;
  }

  const spread =
    node.parentId === null ? Math.PI * 2 : Math.min(Math.PI * 1.05, Math.PI / 2.8 + pageChildren.length * 0.26);
  const baseAngle = node.parentId === null ? -Math.PI / 2 : angle ?? -Math.PI / 2;
  const laneAxis = branchAxis ?? baseAngle;

  pageChildren.forEach((child, childIndex) => {
    const childAngle =
      node.parentId === null
        ? pageChildren.length === 1
          ? -Math.PI / 2
          : -Math.PI / 2 + (Math.PI * 2 * childIndex) / pageChildren.length
        : pageChildren.length === 1
          ? laneAxis + (node.depth % 2 === 0 ? 1 : -1) * SINGLE_CHILD_ZIGZAG_ANGLE
          : laneAxis -
            spread / 2 +
            (spread * (childIndex + 0.5)) / pageChildren.length +
            (node.depth % 2 === 0 ? MULTI_CHILD_DEPTH_SWAY : -MULTI_CHILD_DEPTH_SWAY);

    const radius =
      node.parentId === null
        ? ROOT_CHILD_RADIUS + Math.max(0, pageChildren.length - 1) * SIBLING_RADIUS_STEP
        : pageChildren.length === 1
          ? COMPACT_CHILD_RADIUS + node.depth * COMPACT_DEPTH_RADIUS_STEP
          : CHILD_RADIUS + node.depth * DEPTH_RADIUS_STEP + Math.max(0, pageChildren.length - 1) * SIBLING_RADIUS_STEP;

    placeNode(
      workspace,
      child,
      radialPoint(resolvedPosition, childAngle, radius),
      childAngle,
      positionedNodes,
      pageChildren.length === 1 ? laneAxis : childAngle
    );
  });
}

export function relayoutWorkspace(workspace) {
  const positionedNodes = new Map();
  const roots = orderedRoots(workspace);
  roots.forEach((rootNode, rootIndex) => placeNode(workspace, rootNode, rootAnchor(rootIndex), null, positionedNodes));

  return {
    ...workspace,
    nodes: workspace.nodes.map((node) => positionedNodes.get(node.id) ?? node)
  };
}

export function autoOrganizeWorkspace(workspace) {
  return relayoutWorkspace(clearManualPositions(workspace));
}

function normalizePoint(point) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };
}

export function nodeDimensions(node) {
  if (node?.kind === "download" || node?.kind === "upload") {
    return {
      width: GRAPH_ARTIFACT_WIDTH,
      height: GRAPH_ARTIFACT_HEIGHT
    };
  }

  return {
    width: GRAPH_NODE_WIDTH,
    height: GRAPH_NODE_HEIGHT
  };
}

export function nodeRect(positionOrNode, dimensions = null) {
  if (positionOrNode && typeof positionOrNode === "object" && "position" in positionOrNode) {
    const node = positionOrNode;
    const size = nodeDimensions(node);

    return {
      x: node.position.x,
      y: node.position.y,
      width: size.width,
      height: size.height
    };
  }

  const size = dimensions ?? {
    width: GRAPH_NODE_WIDTH,
    height: GRAPH_NODE_HEIGHT
  };

  return {
    x: positionOrNode.x,
    y: positionOrNode.y,
    width: size.width,
    height: size.height
  };
}

export function rectCenter(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function expandRect(rect, padding) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

function rectsOverlap(left, right) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function orientation(first, second, third) {
  return (second.y - first.y) * (third.x - second.x) - (second.x - first.x) * (third.y - second.y);
}

function onSegment(first, second, third) {
  return (
    second.x <= Math.max(first.x, third.x) &&
    second.x >= Math.min(first.x, third.x) &&
    second.y <= Math.max(first.y, third.y) &&
    second.y >= Math.min(first.y, third.y)
  );
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

  if (firstOrientation === 0 && onSegment(firstStart, secondStart, firstEnd)) {
    return true;
  }

  if (secondOrientation === 0 && onSegment(firstStart, secondEnd, firstEnd)) {
    return true;
  }

  if (thirdOrientation === 0 && onSegment(secondStart, firstStart, secondEnd)) {
    return true;
  }

  if (fourthOrientation === 0 && onSegment(secondStart, firstEnd, secondEnd)) {
    return true;
  }

  return (firstOrientation > 0) !== (secondOrientation > 0) && (thirdOrientation > 0) !== (fourthOrientation > 0);
}

function pointInsideRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function lineIntersectsRect(start, end, rect) {
  if (pointInsideRect(start, rect) || pointInsideRect(end, rect)) {
    return true;
  }

  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };

  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

function buildPositionIndex(workspace, movingNodeId, movingPosition) {
  return new Map(
    workspace.nodes.map((node) => [
      node.id,
      node.id === movingNodeId && movingPosition ? normalizePoint(movingPosition) : node.position
    ])
  );
}

function safeRatio(numerator, denominator) {
  return denominator === 0 ? 0 : Math.abs(numerator / denominator);
}

export function edgeAnchorPoint(fromNodePosition, towardNodePosition) {
  const rect = nodeRect(fromNodePosition);
  const center = rectCenter(rect);
  const towardCenter = rectCenter(nodeRect(towardNodePosition));
  const direction = {
    x: towardCenter.x - center.x,
    y: towardCenter.y - center.y
  };

  if (direction.x === 0 && direction.y === 0) {
    return center;
  }

  const scale = 1 / Math.max(safeRatio(direction.x, rect.width / 2), safeRatio(direction.y, rect.height / 2));

  return {
    x: center.x + direction.x * scale,
    y: center.y + direction.y * scale
  };
}

export function edgeAnchorPoints(sourceNodePosition, targetNodePosition) {
  return {
    source: edgeAnchorPoint(sourceNodePosition, targetNodePosition),
    target: edgeAnchorPoint(targetNodePosition, sourceNodePosition)
  };
}

export function buildEdgePath(sourceNodePosition, targetNodePosition, curved = false) {
  const { source, target } = edgeAnchorPoints(sourceNodePosition, targetNodePosition);

  if (!curved) {
    return {
      start: source,
      end: target,
      path: `M ${source.x} ${source.y} L ${target.x} ${target.y}`
    };
  }

  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const length = Math.max(1, Math.hypot(deltaX, deltaY));
  const normal = {
    x: -deltaY / length,
    y: deltaX / length
  };
  const bendDirection = deltaX >= 0 ? (deltaY >= 0 ? 1 : -1) : deltaY >= 0 ? -1 : 1;
  const bend = Math.max(42, Math.min(118, length * 0.22));
  const controlX = (source.x + target.x) / 2 + normal.x * bend * bendDirection;
  const controlY = (source.y + target.y) / 2 + normal.y * bend * bendDirection;

  return {
    start: source,
    end: target,
    path: `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`
  };
}

function edgeSegment(edge, positions) {
  const sourceNode = findNode(edge.workspace ?? null, edge.source);
  const targetNode = findNode(edge.workspace ?? null, edge.target);
  const sourcePosition = positions.get(edge.source);
  const targetPosition = positions.get(edge.target);

  if (!sourcePosition || !targetPosition || !sourceNode || !targetNode) {
    return null;
  }

  const anchors = edgeAnchorPoints(
    { ...sourceNode, position: sourcePosition },
    { ...targetNode, position: targetPosition }
  );
  return {
    start: anchors.source,
    end: anchors.target
  };
}

export function shouldCurveEdgeWithPositions(edge, workspace, positions) {
  const segment = edgeSegment({ ...edge, workspace }, positions);

  if (!segment) {
    return false;
  }

  return workspace.nodes.some((node) => {
    if (node.id === edge.source || node.id === edge.target) {
      return false;
    }

    return lineIntersectsRect(
      segment.start,
      segment.end,
      expandRect(nodeRect({ ...node, position: positions.get(node.id) ?? node.position }), GRAPH_EDGE_CLEARANCE)
    );
  });
}

function isNodePositionValid(workspace, nodeId, candidatePosition) {
  const normalizedCandidate = normalizePoint(candidatePosition);
  const positions = buildPositionIndex(workspace, nodeId, normalizedCandidate);
  const movingNode = findNode(workspace, nodeId);
  const candidateRect = expandRect(
    nodeRect(normalizedCandidate, nodeDimensions(movingNode)),
    GRAPH_NODE_GAP
  );

  for (const node of workspace.nodes) {
    if (node.id === nodeId) {
      continue;
    }

    if (
      rectsOverlap(
        candidateRect,
        expandRect(nodeRect({ ...node, position: positions.get(node.id) ?? node.position }), GRAPH_NODE_GAP)
      )
    ) {
      return false;
    }
  }

  const connectedEdges = workspace.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
  const staticEdges = workspace.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);

  for (const edge of staticEdges) {
    const segment = edgeSegment(edge, positions);

    if (segment && lineIntersectsRect(segment.start, segment.end, candidateRect)) {
      return false;
    }
  }

  for (const edge of connectedEdges) {
    const segment = edgeSegment(edge, positions);

    if (!segment) {
      continue;
    }

    for (const node of workspace.nodes) {
      if (node.id === nodeId || node.id === edge.source || node.id === edge.target) {
        continue;
      }

      if (
        lineIntersectsRect(
          segment.start,
          segment.end,
          expandRect(nodeRect({ ...node, position: positions.get(node.id) ?? node.position }), GRAPH_EDGE_CLEARANCE)
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

function ringCandidates(center, ring) {
  const candidates = [];

  for (let gridX = -ring; gridX <= ring; gridX += 1) {
    for (let gridY = -ring; gridY <= ring; gridY += 1) {
      if (Math.abs(gridX) !== ring && Math.abs(gridY) !== ring) {
        continue;
      }

      candidates.push({
        x: center.x + gridX * DRAG_SNAP_STEP,
        y: center.y + gridY * DRAG_SNAP_STEP
      });
    }
  }

  return candidates.sort(
    (left, right) =>
      Math.hypot(left.x - center.x, left.y - center.y) - Math.hypot(right.x - center.x, right.y - center.y) ||
      left.y - right.y ||
      left.x - right.x
  );
}

export function snapNodePosition(workspace, nodeId, desiredPosition) {
  const normalizedDesired = normalizePoint(desiredPosition);

  if (isNodePositionValid(workspace, nodeId, normalizedDesired)) {
    return normalizedDesired;
  }

  for (let ring = 1; ring <= DRAG_SNAP_RINGS; ring += 1) {
    for (const candidate of ringCandidates(normalizedDesired, ring)) {
      if (isNodePositionValid(workspace, nodeId, candidate)) {
        return normalizePoint(candidate);
      }
    }
  }

  return normalizedDesired;
}

export function buildPageFavoriteId(workspaceId, nodeId) {
  return `page:${workspaceId}:${nodeId}`;
}

export function buildTreeFavoriteId(workspaceId, rootId) {
  return `tree:${workspaceId}:${rootId}`;
}

export function sortFavorites(favorites) {
  return [...favorites].sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title));
}

export function toggleFavorite(entries, favorite) {
  const exists = entries.some((entry) => entry.id === favorite.id);
  const nextEntries = exists ? entries.filter((entry) => entry.id !== favorite.id) : [...entries, favorite];
  return sortFavorites(nextEntries);
}

export function removeFavorite(entries, favoriteId) {
  return sortFavorites(entries.filter((entry) => entry.id !== favoriteId));
}

export function removeTreeFavorites(entries, workspaceId, rootId, nodeIds) {
  const removedNodeIds = new Set(nodeIds);

  return sortFavorites(
    entries.filter((entry) => {
      if (entry.workspaceId !== workspaceId) {
        return true;
      }

      if (entry.rootId === rootId) {
        return false;
      }

      return !(entry.nodeId && removedNodeIds.has(entry.nodeId));
    })
  );
}

function findTreeNodes(workspace, rootId) {
  return workspace ? workspace.nodes.filter((node) => node.rootId === rootId) : [];
}

export function treeHasInitializedPage(workspace, rootId) {
  return findTreeNodes(workspace, rootId)
    .filter(isPageNode)
    .some((node) => Boolean(node.url || node.history?.entries?.length));
}

function representativeTreeNode(workspace, rootId) {
  const treeNodes = findTreeNodes(workspace, rootId).filter(isPageNode);
  return treeNodes.find((node) => Boolean(node.url || node.history?.entries?.length)) ?? findNode(workspace, rootId) ?? treeNodes[0] ?? null;
}

export function summarizeTreeContents(workspace, rootId) {
  const treeNodes = findTreeNodes(workspace, rootId);

  return {
    pageCount: treeNodes.filter(isPageNode).length,
    artifactCount: treeNodes.filter(isArtifactNode).length
  };
}

export function classifyNodeCategory(workspace, node) {
  if (!node) {
    return "general";
  }

  if (isPageNode(node)) {
    return classifySiteCategory(node.url);
  }

  return classifySiteCategory(
    node.artifact?.referrerUrl ??
      node.artifact?.pageUrl ??
      node.artifact?.sourceUrl ??
      findOwningPageNode(workspace, node)?.url ??
      null
  );
}

export function buildPageFavoriteEntry(workspace, node) {
  return {
    id: buildPageFavoriteId(workspace.id, node.id),
    kind: "page",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    nodeId: node.id,
    rootId: node.rootId,
    title: node.title || "Untitled page",
    url: node.url,
    faviconUrl: node.faviconUrl,
    category: classifySiteCategory(node.url),
    updatedAt: now()
  };
}

export function buildTreeFavoriteEntry(workspace, rootId) {
  const rootNode = findNode(workspace, rootId);

  if (!rootNode) {
    throw new Error(`Root node ${rootId} was not found.`);
  }

  const representativeNode = representativeTreeNode(workspace, rootId) ?? rootNode;

  return {
    id: buildTreeFavoriteId(workspace.id, rootId),
    kind: "tree",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    nodeId: null,
    rootId,
    title: rootNode.title || representativeNode.title || "Untitled tree",
    url: representativeNode.url,
    faviconUrl: representativeNode.faviconUrl,
    category: classifySiteCategory(representativeNode.url),
    updatedAt: now()
  };
}

export function resolveFavoriteOpenPlan(workspace, favorite) {
  if (favorite.kind === "page" && favorite.nodeId) {
    const pageNode = findNode(workspace, favorite.nodeId);

    if (pageNode) {
      return {
        action: "select-node",
        nodeId: pageNode.id,
        centerNodeId: pageNode.id
      };
    }

    if (favorite.url) {
      return {
        action: "create-root",
        url: favorite.url
      };
    }
  }

  const rootNode = findNode(workspace, favorite.rootId);

  if (rootNode) {
    return {
      action: "select-root",
      rootId: rootNode.id,
      centerNodeId: rootNode.id
    };
  }

  return {
    action: "create-root",
    url: favorite.url
  };
}
