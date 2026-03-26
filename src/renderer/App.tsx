import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type OnMoveEnd,
  type ReactFlowInstance,
  useNodesInitialized
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, buildEdgePath, shouldCurveEdgeWithPositions } from "../shared/graphGeometry";
import type { Point } from "../shared/types";
import { ResearchEdge } from "./components/ResearchEdge";
import type { ResearchGraphNode } from "./components/ResearchNode";
import { ResearchNode } from "./components/ResearchNode";
import { useWorkspaceStore } from "./store/useWorkspaceStore";

const nodeTypes = {
  research: ResearchNode
};

const edgeTypes = {
  research: ResearchEdge
};

const DEFAULT_VIEWPORT = {
  x: 0,
  y: 0,
  zoom: 0.85
};

function AppShell() {
  const {
    workspace,
    isBootstrapping,
    bootstrap,
    applyWorkspace,
    applyNodeMeta,
    createRootNode,
    selectNode,
    submitOmnibox,
    updateNodePosition,
    autoOrganize,
    setViewMode,
    setSearchProvider,
    setViewport,
    pageCommand
  } = useWorkspaceStore();
  const pagePaneRef = useRef<HTMLDivElement | null>(null);
  const launchpadInputRef = useRef<HTMLInputElement | null>(null);
  const pageInputRef = useRef<HTMLInputElement | null>(null);
  const didHydrateViewportRef = useRef(false);
  const didAutoCenterInitialRootRef = useRef(false);
  const previousNodeCountRef = useRef<number | null>(null);
  const pendingAutoCenterRef = useRef(false);
  const [navigationValue, setNavigationValue] = useState("");
  const [isFocusPageOpen, setIsFocusPageOpen] = useState(false);
  const [dragPositions, setDragPositions] = useState<Record<string, Point>>({});
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const nodesInitialized = useNodesInitialized();

  const selectedNode = useMemo(() => {
    if (!workspace) {
      return null;
    }

    return workspace.nodes.find((node) => node.id === workspace.selectedNodeId) ?? null;
  }, [workspace]);
  const rootCount = workspace ? workspace.nodes.filter((node) => node.parentId === null).length : 0;
  const hasInitializedNode = workspace ? workspace.nodes.some((node) => Boolean(node.url || node.history)) : false;
  const showWorkspaceLaunchpad = workspace ? workspace.nodes.length > 0 && !hasInitializedNode : false;

  useEffect(() => {
    if (!workspace && !isBootstrapping) {
      void bootstrap();
    }
  }, [bootstrap, isBootstrapping, workspace]);

  useEffect(() => {
    const unsubscribeWorkspace = window.researchGraph.onWorkspaceChanged((nextWorkspace) => {
      applyWorkspace(nextWorkspace);
    });
    const unsubscribeNodeMeta = window.researchGraph.onNodeMetaChanged((node) => {
      applyNodeMeta(node);
    });

    return () => {
      unsubscribeWorkspace();
      unsubscribeNodeMeta();
    };
  }, [applyNodeMeta, applyWorkspace]);

  useEffect(() => {
    if (!workspace) {
      setDragPositions({});
      return;
    }

    setDragPositions((currentPositions) => {
      const validNodeIds = new Set(workspace.nodes.map((node) => node.id));
      let changed = false;
      const nextPositions: Record<string, Point> = {};

      for (const [nodeId, position] of Object.entries(currentPositions)) {
        if (validNodeIds.has(nodeId)) {
          nextPositions[nodeId] = position;
          continue;
        }

        changed = true;
      }

      return changed ? nextPositions : currentPositions;
    });
  }, [workspace]);

  useEffect(() => {
    if (!selectedNode) {
      setNavigationValue("");
      return;
    }

    setNavigationValue(selectedNode.searchQuery ?? selectedNode.url ?? "");
  }, [selectedNode?.id, selectedNode?.searchQuery, selectedNode?.url]);

  useEffect(() => {
    if (!showWorkspaceLaunchpad) {
      return;
    }

    window.setTimeout(() => {
      launchpadInputRef.current?.focus();
      launchpadInputRef.current?.select();
    }, 50);
  }, [showWorkspaceLaunchpad]);

  const isSplitView = workspace?.prefs.viewMode !== "focus";
  const selectedNodeHasPage = Boolean(selectedNode?.url || selectedNode?.history?.entries.length);
  const isPagePanelOpen = Boolean(selectedNode) && (isSplitView || isFocusPageOpen);
  const isPageVisible = selectedNodeHasPage && isPagePanelOpen;

  const visualPositions = useMemo(() => {
    if (!workspace) {
      return new Map<string, Point>();
    }

    return new Map(workspace.nodes.map((node) => [node.id, dragPositions[node.id] ?? node.position]));
  }, [dragPositions, workspace]);

  useEffect(() => {
    if (isSplitView || !selectedNode) {
      setIsFocusPageOpen(false);
    }
  }, [isSplitView, selectedNode]);

  async function centerNodeById(nodeId: string, zoom = 0.95) {
    if (!reactFlowInstance || !workspace) {
      return;
    }

    const workspaceNode = workspace.nodes.find((candidate) => candidate.id === nodeId);

    if (!workspaceNode) {
      return;
    }

    const renderedNode = reactFlowInstance.getNode(nodeId);
    const width = renderedNode?.width ?? GRAPH_NODE_WIDTH;
    const height = renderedNode?.height ?? GRAPH_NODE_HEIGHT;

    await reactFlowInstance.setCenter(workspaceNode.position.x + width / 2, workspaceNode.position.y + height / 2, {
      zoom,
      duration: 250
    });

    await setViewport(reactFlowInstance.getViewport());
  }

  const centerTargetNodeId = useMemo(() => {
    if (selectedNode) {
      return selectedNode.id;
    }

    if (!workspace?.nodes.length) {
      return null;
    }

    const anchorPool = workspace.nodes.filter((node) => node.parentId === null);
    const candidateNodes = anchorPool.length ? anchorPool : workspace.nodes;

    return [...candidateNodes]
      .sort(
        (left, right) =>
          Math.hypot(left.position.x, left.position.y) - Math.hypot(right.position.x, right.position.y) ||
          left.createdAt - right.createdAt
      )[0]?.id ?? null;
  }, [workspace, selectedNode]);

  const centerRootNodeId = useMemo(() => {
    if (!workspace?.nodes.length) {
      return null;
    }

    if (selectedNode) {
      return selectedNode.rootId;
    }

    return workspace.nodes
      .filter((node) => node.parentId === null)
      .sort(
        (left, right) =>
          Math.hypot(left.position.x, left.position.y) - Math.hypot(right.position.x, right.position.y) ||
          left.createdAt - right.createdAt
      )[0]?.id ?? null;
  }, [workspace, selectedNode]);

  const centerCurrentView = async (zoom = 0.95) => {
    if (!centerTargetNodeId) {
      return;
    }

    await centerNodeById(centerTargetNodeId, zoom);
  };

  useEffect(() => {
    if (!workspace) {
      didHydrateViewportRef.current = false;
      didAutoCenterInitialRootRef.current = false;
      previousNodeCountRef.current = null;
      return;
    }

    if (!reactFlowInstance || !nodesInitialized || didHydrateViewportRef.current) {
      return;
    }

    didHydrateViewportRef.current = true;
    const isDefaultViewport =
      workspace.prefs.viewport.x === DEFAULT_VIEWPORT.x &&
      workspace.prefs.viewport.y === DEFAULT_VIEWPORT.y &&
      workspace.prefs.viewport.zoom === DEFAULT_VIEWPORT.zoom;

    if (workspace.nodes.length > 0 && isDefaultViewport) {
      window.requestAnimationFrame(() => {
        const firstNodeId = workspace.selectedNodeId ?? workspace.nodes[0]?.id;

        if (firstNodeId) {
          void centerNodeById(firstNodeId, 0.92);
        }
      });
      return;
    }

    void reactFlowInstance.setViewport(workspace.prefs.viewport, { duration: 0 });
  }, [nodesInitialized, reactFlowInstance, workspace]);

  useEffect(() => {
    if (!workspace || !selectedNode || !reactFlowInstance || !nodesInitialized) {
      return;
    }

    const isSingleEmptyRoot =
      workspace.nodes.length === 1 &&
      workspace.nodes[0]?.parentId === null &&
      !workspace.nodes[0]?.url;

    if (!isSingleEmptyRoot || didAutoCenterInitialRootRef.current) {
      return;
    }

    didAutoCenterInitialRootRef.current = true;
    window.setTimeout(() => {
      void centerNodeById(selectedNode.id, 0.92);
    }, 100);
  }, [workspace, nodesInitialized, reactFlowInstance, selectedNode]);

  useEffect(() => {
    const nodeCount = workspace?.nodes.length ?? 0;

    if (previousNodeCountRef.current === null) {
      previousNodeCountRef.current = nodeCount;
      return;
    }

    if (!workspace || !reactFlowInstance || !nodesInitialized) {
      previousNodeCountRef.current = nodeCount;
      return;
    }

    if (nodeCount > previousNodeCountRef.current && centerTargetNodeId) {
      window.setTimeout(() => {
        void centerNodeById(centerTargetNodeId, 0.92);
      }, 40);
    }

    previousNodeCountRef.current = nodeCount;
  }, [centerTargetNodeId, workspace?.nodes.length, nodesInitialized, reactFlowInstance]);

  useEffect(() => {
    const pagePane = pagePaneRef.current;

    if (!pagePane) {
      return;
    }

    const syncBounds = () => {
      const pageRect = pagePane.getBoundingClientRect();
      const hasVisiblePage = isPageVisible && pageRect.width > 0 && pageRect.height > 0;

      void window.researchGraph.setReaderBounds({
        x: pageRect.x,
        y: pageRect.y,
        width: pageRect.width,
        height: pageRect.height,
        visible: hasVisiblePage
      });
    };

    const resizeObserver = new ResizeObserver(syncBounds);
    resizeObserver.observe(pagePane);
    window.addEventListener("resize", syncBounds);
    syncBounds();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncBounds);
      void window.researchGraph.setReaderBounds({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        visible: false
      });
    };
  }, [isPageVisible, selectedNode?.id, workspace?.prefs.viewMode]);

  const onMoveEnd: OnMoveEnd = (_event, viewport) => {
    void setViewport(viewport);
  };

  const handleOmniboxSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitOmnibox(navigationValue);
  };

  const handleAutoOrganize = async () => {
    pendingAutoCenterRef.current = true;
    await autoOrganize();
  };

  const handleNodeDragStop = async (
    _event: MouseEvent,
    node: {
      id: string;
      position: { x: number; y: number };
    }
  ) => {
    setDragPositions((currentPositions) => ({
      ...currentPositions,
      [node.id]: node.position
    }));
    await updateNodePosition(node.id, node.position);
    setDragPositions((currentPositions) => {
      if (!(node.id in currentPositions)) {
        return currentPositions;
      }

      const nextPositions = { ...currentPositions };
      delete nextPositions[node.id];
      return nextPositions;
    });
  };
  const handleNodeDrag = (
    _event: MouseEvent,
    node: {
      id: string;
      position: { x: number; y: number };
    }
  ) => {
    setDragPositions((currentPositions) => {
      const currentPosition = currentPositions[node.id];

      if (currentPosition && currentPosition.x === node.position.x && currentPosition.y === node.position.y) {
        return currentPositions;
      }

      return {
        ...currentPositions,
        [node.id]: node.position
      };
    });
  };
  const showCanvasOnboarding = workspace
    ? workspace.nodes.length > 0 && workspace.nodes.every((node) => !node.url)
    : false;
  const showInitialRootLaunchpad = workspace
    ? workspace.nodes.length === 1 &&
      workspace.nodes[0]?.parentId === null &&
      !workspace.nodes[0]?.url
    : false;

  const focusNodeAddressBar = () => {
    if (!isSplitView) {
      setIsFocusPageOpen(true);
    }

    window.setTimeout(() => {
      pageInputRef.current?.focus();
      pageInputRef.current?.select();
    }, 40);
  };

  const handleNodeActivation = useCallback(async (nodeId: string) => {
    await selectNode(nodeId);

    if (!isSplitView) {
      setIsFocusPageOpen(true);
    }
  }, [isSplitView, selectNode]);

  const openSelectedNodePage = () => {
    if (!selectedNode) {
      return;
    }

    setIsFocusPageOpen(true);
  };

  useEffect(() => {
    if (!pendingAutoCenterRef.current || !workspace || !reactFlowInstance || !nodesInitialized) {
      return;
    }

    pendingAutoCenterRef.current = false;

    if (!centerRootNodeId) {
      return;
    }

    window.setTimeout(() => {
      void centerNodeById(centerRootNodeId, 0.88);
    }, 60);
  }, [centerRootNodeId, nodesInitialized, reactFlowInstance, workspace]);

  const flowNodes = useMemo<ResearchGraphNode[]>(() => {
    if (!workspace) {
      return [];
    }

    return workspace.nodes.map((node) => ({
      id: node.id,
      type: "research",
      position: visualPositions.get(node.id) ?? node.position,
      selected: node.id === workspace.selectedNodeId,
      data: {
        nodeId: node.id,
        title: node.title || "Untitled thread",
        url: node.url,
        faviconUrl: node.faviconUrl,
        runtimeState: node.runtimeState,
        errorMessage: node.errorMessage,
        depth: node.depth,
        origin: node.origin,
        onActivateNode: handleNodeActivation
      }
    }));
  }, [handleNodeActivation, visualPositions, workspace]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (!workspace) {
      return [];
    }

    return workspace.edges.map((edge) => {
      const sourcePosition = visualPositions.get(edge.source);
      const targetPosition = visualPositions.get(edge.target);

      if (!sourcePosition || !targetPosition) {
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "research"
        };
      }

      const curved = shouldCurveEdgeWithPositions(edge, workspace, visualPositions);
      const renderedEdge = buildEdgePath(sourcePosition, targetPosition, curved);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "research",
        data: {
          path: renderedEdge.path
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16
        },
        style: {
          stroke: "#6e87a3",
          strokeWidth: 1.8
        }
      };
    });
  }, [visualPositions, workspace]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__eyebrow">Nodely Browser</span>
        </div>
        <div className="topbar__controls">
          <button
            type="button"
            className="chrome-button"
            onClick={() => void createRootNode()}
          >
            New Root Node
          </button>
          <button
            type="button"
            className="chrome-button chrome-button--soft"
            onClick={() => void centerCurrentView()}
            disabled={!centerTargetNodeId}
          >
            Center View
          </button>
          <button
            type="button"
            className="chrome-button chrome-button--soft"
            onClick={() => void handleAutoOrganize()}
            disabled={!workspace?.nodes.length}
          >
            Auto-Organize
          </button>
          <button
            type="button"
            className="chrome-button"
            onClick={() => void pageCommand("back")}
            disabled={!selectedNode?.canGoBack}
          >
            Back
          </button>
          <button
            type="button"
            className="chrome-button"
            onClick={() => void pageCommand("forward")}
            disabled={!selectedNode?.canGoForward}
          >
            Forward
          </button>
          <button
            type="button"
            className="chrome-button"
            onClick={() => void pageCommand("reload")}
            disabled={!selectedNode?.url}
          >
            Reload
          </button>
        </div>
        <label className="search-provider">
          <span>Search</span>
          <select
            value={workspace?.prefs.searchProvider ?? "google"}
            onChange={(event) => {
              void setSearchProvider(event.target.value as "google" | "wikipedia");
            }}
          >
            <option value="google">Google</option>
            <option value="wikipedia">Wikipedia</option>
          </select>
        </label>
        <div className="topbar__mode-switch">
          <button
            type="button"
            className={isSplitView ? "mode-button mode-button--active" : "mode-button"}
            onClick={() => void setViewMode("split")}
          >
            Split
          </button>
          <button
            type="button"
            className={!isSplitView ? "mode-button mode-button--active" : "mode-button"}
            onClick={() => {
              setIsFocusPageOpen(false);
              void setViewMode("focus");
            }}
          >
            Focus
          </button>
          {!isSplitView ? (
            <button
              type="button"
              className={isFocusPageOpen ? "chrome-button chrome-button--soft" : "chrome-button"}
              onClick={() => {
                if (isFocusPageOpen) {
                  setIsFocusPageOpen(false);
                  return;
                }

                openSelectedNodePage();
              }}
              disabled={!selectedNode}
            >
              {isFocusPageOpen ? "Back To Canvas" : "Open Selected Node"}
            </button>
          ) : null}
        </div>
      </header>

      {showWorkspaceLaunchpad ? (
        <main className="workspace-launchpad-screen">
          <section className="workspace-launchpad">
            <div className="workspace-launchpad__hero">
              <span className="workspace-launchpad__eyebrow">Nodely Browser Onboarding</span>
              <h1>Start your first node</h1>
              <p>
                Your initial root already exists. Enter a URL or search term here and it will become the first visible node
                at the center of your Nodely canvas.
              </p>
              <form
                className="workspace-launchpad__form"
                onSubmit={(event) => {
                  void handleOmniboxSubmit(event);
                }}
              >
                <input
                  ref={launchpadInputRef}
                  value={navigationValue}
                  onChange={(event) => setNavigationValue(event.target.value)}
                  placeholder="Type a URL or search to initialize the first node"
                />
                <div className="workspace-launchpad__actions">
                  <button
                    type="submit"
                    className="launchpad-button launchpad-button--primary"
                    disabled={!navigationValue.trim()}
                  >
                    Initialize First Node
                  </button>
                  <button
                    type="button"
                    className="launchpad-button"
                    onClick={() => void createRootNode()}
                  >
                    Create Another Blank Root
                  </button>
                  <button
                    type="button"
                    className="launchpad-button"
                    onClick={() => void centerCurrentView()}
                  >
                    Reveal Root on Canvas
                  </button>
                </div>
              </form>
              <div className="workspace-launchpad__meta">
                <span>Selected root: {selectedNode?.title ?? "Untitled thread"}</span>
                <span>Roots ready: {rootCount}</span>
                <span>Search provider: {workspace?.prefs.searchProvider ?? "google"}</span>
              </div>
            </div>
            <div className="workspace-launchpad__preview">
              <div className="workspace-launchpad__halo" />
              <div className="workspace-launchpad__node-card">
                <div className="workspace-launchpad__node-favicon">{(selectedNode?.title ?? "U").charAt(0)}</div>
                <div className="workspace-launchpad__node-body">
                  <strong>{selectedNode?.title ?? "Untitled thread"}</strong>
                  <span>{selectedNode?.url ?? "Blank root waiting for its first page"}</span>
                </div>
              </div>
              <div className="workspace-launchpad__steps">
                <div>
                  <strong>1. Initialize</strong>
                  <span>Start with a URL or search term.</span>
                </div>
                <div>
                  <strong>2. Branch</strong>
                  <span>Every top-level link becomes a child node.</span>
                </div>
                <div>
                  <strong>3. Trace</strong>
                  <span>See where every lead came from.</span>
                </div>
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className={isSplitView ? "workspace workspace--split" : "workspace workspace--focus"}>
          <section className={isSplitView ? "graph-column" : "graph-column graph-column--focus"}>
            <div className="canvas-header">
              <div>
                <span className="canvas-header__label">Canvas</span>
                <strong>{workspace?.nodes.length ?? 0} nodes</strong>
              </div>
              <div>
                <span className="canvas-header__label">Roots</span>
                <strong>{workspace?.nodes.filter((node) => node.parentId === null).length ?? 0}</strong>
              </div>
              <div>
                <span className="canvas-header__label">Selected</span>
                <strong>{selectedNode?.title ?? "None"}</strong>
              </div>
            </div>

            <div className="graph-surface">
              <div className="graph-surface__actions">
                <button
                  type="button"
                  className="chrome-button chrome-button--soft"
                  onClick={() => void centerCurrentView()}
                  disabled={!centerTargetNodeId}
                >
                  Center View
                </button>
                <button
                  type="button"
                  className="chrome-button chrome-button--soft"
                  onClick={() => void handleAutoOrganize()}
                  disabled={!workspace?.nodes.length}
                >
                  Auto-Organize
                </button>
              </div>
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                proOptions={{ hideAttribution: true }}
                nodesFocusable={false}
                edgesFocusable={false}
                selectionOnDrag={false}
                onNodeDrag={handleNodeDrag}
                onNodeDragStop={(event, node) => {
                  void handleNodeDragStop(event, node);
                }}
                onMoveEnd={onMoveEnd}
                onInit={setReactFlowInstance}
                fitView={false}
                minZoom={0.25}
                maxZoom={1.8}
              >
                <Background
                  color="#d6c7ab"
                  gap={28}
                  size={1.1}
                />
                <Controls
                  position="bottom-right"
                  showInteractive={false}
                />
              </ReactFlow>
              {showCanvasOnboarding ? (
                <div className={showInitialRootLaunchpad ? "canvas-onboarding canvas-onboarding--centered" : "canvas-onboarding"}>
                  <span className="canvas-onboarding__eyebrow">First thread</span>
                  <h3>{showInitialRootLaunchpad ? "Your initial root node is ready" : "Blank roots are ready"}</h3>
                  <p>
                    {showInitialRootLaunchpad
                      ? "The blank root already exists. Reveal it on the canvas, initialize it from the node panel, or create another root if you want a separate Nodely trail."
                      : "Your blank roots already exist. Reveal the selected one, initialize it from the node panel, or create another root."}
                  </p>
                  <div className="canvas-onboarding__actions">
                    <button
                      type="button"
                      className="chrome-button"
                      onClick={() => void centerCurrentView()}
                    >
                      Center Canvas
                    </button>
                    <button
                      type="button"
                      className="chrome-button chrome-button--soft"
                      onClick={() => void handleAutoOrganize()}
                    >
                      Auto-Organize
                    </button>
                    <button
                      type="button"
                      className="chrome-button"
                      onClick={() => void createRootNode()}
                    >
                      Create Another Root
                    </button>
                    <button
                      type="button"
                      className="chrome-button chrome-button--soft"
                      onClick={focusNodeAddressBar}
                    >
                      Focus Node Bar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          {isSplitView || isFocusPageOpen ? (
            <section className={isSplitView ? "page-pane" : "page-pane page-pane--focus-overlay"}>
              <div className="page-toolbar">
                <span className="page-pane__eyebrow">Selected node</span>
                <form
                  className="page-toolbar__form"
                  onSubmit={(event) => {
                    void handleOmniboxSubmit(event);
                  }}
                >
                  <input
                    ref={pageInputRef}
                    value={navigationValue}
                    onChange={(event) => setNavigationValue(event.target.value)}
                    disabled={!selectedNode}
                    placeholder={
                      !selectedNode
                        ? "Select a node to open a page"
                        : selectedNodeHasPage
                          ? "Open a URL or search to branch from this node"
                          : "Type a URL or search to initialize this node"
                    }
                  />
                  <button
                    type="submit"
                    className="chrome-button"
                    disabled={!selectedNode || !navigationValue.trim()}
                  >
                    {selectedNodeHasPage ? "Open As Child" : "Open In Node"}
                  </button>
                </form>
              </div>
              <div
                ref={pagePaneRef}
                className="page-pane__viewport"
              >
                {!selectedNodeHasPage ? (
                  <div className="page-pane__empty">
                    <span className="page-pane__eyebrow">Rendered page</span>
                    <h2>{selectedNode ? "This node is ready to be initialized" : "Start a new Nodely trail"}</h2>
                    <p>
                      {selectedNode
                        ? "A blank root node is already selected on the canvas. Use the node bar here to initialize it, or create another root node if you want a separate thread."
                        : "Create a new root node, then enter a URL or search query in the node bar to begin building the web."}
                    </p>
                    <div className="page-pane__actions">
                      <button
                        type="button"
                        className="chrome-button"
                        onClick={() => void createRootNode()}
                      >
                        Create Root Node
                      </button>
                      <button
                        type="button"
                        className="chrome-button chrome-button--soft"
                        onClick={() => void centerCurrentView()}
                      >
                        Center Canvas
                      </button>
                      <button
                        type="button"
                        className="chrome-button chrome-button--soft"
                        onClick={() => void handleAutoOrganize()}
                      >
                        Auto-Organize
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="page-pane__overlay">
                    <div className="page-pane__badge">{selectedNode?.runtimeState}</div>
                    <div className="page-pane__meta">
                      <strong>{selectedNode?.title}</strong>
                      <span>{selectedNode?.url}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {!isSplitView && !isFocusPageOpen ? (
            <section className="focus-hint">
              <span className="focus-hint__eyebrow">Focus mode</span>
              <strong>Canvas stays in front</strong>
              <p>Select any populated node to open its page, or use the button in the top bar.</p>
            </section>
          ) : null}
        </main>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  );
}
