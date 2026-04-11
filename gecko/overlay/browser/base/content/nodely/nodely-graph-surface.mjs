import {
  buildEdgePath,
  classifyNodeCategory,
  findNode,
  findRoots,
  isArtifactNode,
  nodeDimensions,
  nodeRect,
  rectCenter,
  SITE_CATEGORY_STYLES,
  snapNodePosition,
  summarizeTreeContents,
  treeDisplayTitle,
  shouldCurveEdgeWithPositions
} from "./domain.mjs";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const POINTER_DRAG_THRESHOLD = 6;
const CLICK_SUPPRESSION_MS = 220;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function safeHostname(url, fallback) {
  if (!url) {
    return fallback;
  }

  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return fallback;
  }
}

function fitTextToWidth(context, text, maxWidth) {
  const value = String(text ?? "").trim();

  if (!value) {
    return "";
  }

  if (context.measureText(value).width <= maxWidth) {
    return value;
  }

  const ellipsis = "…";
  let end = value.length;

  while (end > 0 && context.measureText(`${value.slice(0, end).trimEnd()}${ellipsis}`).width > maxWidth) {
    end -= 1;
  }

  return end > 0 ? `${value.slice(0, end).trimEnd()}${ellipsis}` : ellipsis;
}

function createIcon(paths, viewBox = "0 0 20 20") {
  return {
    viewBox,
    paths
  };
}

function iconAutoOrganize() {
  return createIcon([
    {
      d: "M4.4 4.5h3.2v3.2H4.4Zm8 0h3.2v3.2h-3.2Zm-4 8h3.2v3.2H8.4Zm-2.3-5.3h6.8m-3.4.1v5",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.4",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }
  ]);
}

export class NodelyGraphSurface extends HTMLElement {
  constructor() {
    super();
    this.workspace = null;
    this.selectedNodeId = null;
    this.viewport = { x: 0, y: 0, zoom: 0.85 };
    this.persistedViewport = { ...this.viewport };
    this.livePositions = new Map();
    this.nodeElements = new Map();
    this.dragState = null;
    this.panState = null;
    this.minimapState = null;
    this.suppressClickNodeId = null;
    this.suppressClickUntil = 0;
    this.lastWorkspaceNodeCount = 0;
    this.lastWorkspaceSelectedNodeId = null;
    this.pendingFrame = 0;
    this.renderFlags = {
      resize: true,
      edges: true,
      nodes: true,
      minimap: true
    };
    this.resizeObserver = new ResizeObserver(() =>
      this.requestRender({
        resize: true,
        edges: true,
        nodes: true,
        minimap: true
      })
    );
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleBackgroundPointerDown = this.handleBackgroundPointerDown.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleNodePointerDown = this.handleNodePointerDown.bind(this);
    this.handleNodePointerUp = this.handleNodePointerUp.bind(this);
    this.handleNodeClick = this.handleNodeClick.bind(this);
    this.handleMinimapPointerDown = this.handleMinimapPointerDown.bind(this);
    this.handleMinimapToolbarClick = this.handleMinimapToolbarClick.bind(this);
  }

  connectedCallback() {
    if (!this.isConnected || this.canvas) {
      return;
    }

    this.className = "nodely-graph-surface";
    this.replaceChildren();

    this.stage = createHtmlElement(this.ownerDocument, "div", "nodely-graph-surface__stage");
    this.canvas = createHtmlElement(this.ownerDocument, "canvas", "nodely-graph-surface__edges");
    this.nodeLayer = createHtmlElement(this.ownerDocument, "div", "nodely-graph-surface__nodes");
    this.emptyState = createHtmlElement(this.ownerDocument, "div", "nodely-graph-surface__empty");
    this.emptyState.hidden = true;
    const emptyCard = createHtmlElement(this.ownerDocument, "div", "nodely-graph-surface__empty-card");
    const emptyTitle = createHtmlElement(this.ownerDocument, "strong");
    emptyTitle.textContent = "Start With A Root";
    const emptyCopy = createHtmlElement(this.ownerDocument, "p");
    emptyCopy.textContent = "Type a URL or search term in the bar above to get going.";
    this.minimap = createHtmlElement(this.ownerDocument, "div", "nodely-graph-surface__minimap");
    this.minimapToolbar = createHtmlElement(
      this.ownerDocument,
      "div",
      "nodely-graph-surface__minimap-toolbar"
    );
    this.minimapToolbar.append(
      createGraphToolbarButton(this.ownerDocument, "Organize tree", "auto-organize", "", iconAutoOrganize()),
      createGraphToolbarButton(this.ownerDocument, "Zoom out", "zoom-out", "−"),
      createGraphToolbarButton(this.ownerDocument, "Zoom in", "zoom-in", "+"),
      createGraphToolbarButton(this.ownerDocument, "Center tree", "center-tree", "◎")
    );

    emptyCard.append(emptyTitle, emptyCopy);
    this.emptyState.append(emptyCard);
    this.dataset.treeLabelMode = "canvas";
    this.dataset.treeLabelCount = "0";
    this.stage.append(this.canvas, this.nodeLayer);
    this.append(this.stage, this.emptyState, this.minimap, this.minimapToolbar);

    this.context = this.canvas.getContext("2d");
    this.stage.addEventListener("pointerdown", this.handleBackgroundPointerDown);
    this.addEventListener("contextmenu", this.handleContextMenu);
    this.stage.addEventListener("wheel", this.handleWheel, { passive: false });
    this.minimap.addEventListener("pointerdown", this.handleMinimapPointerDown);
    this.minimapToolbar.addEventListener("click", this.handleMinimapToolbarClick);
    this.resizeObserver.observe(this);
    this.requestRender({
      resize: true,
      edges: true,
      nodes: true,
      minimap: true
    });
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);

    if (this.pendingFrame) {
      window.cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = 0;
    }
  }

  setWorkspace(workspace) {
    const nextViewport = { ...(workspace?.prefs.viewport ?? { x: 0, y: 0, zoom: 0.85 }) };
    const nextSelectedNodeId = workspace?.selectedNodeId ?? null;
    const nextNodeCount = workspace?.nodes?.length ?? 0;
    const selectedChanged =
      nextSelectedNodeId != null && nextSelectedNodeId !== this.lastWorkspaceSelectedNodeId;
    const nodeCountGrew = nextNodeCount > this.lastWorkspaceNodeCount;
    const firstNodeCreated = this.lastWorkspaceNodeCount === 0 && nextNodeCount === 1;

    this.workspace = workspace;
    this.selectedNodeId = nextSelectedNodeId;

    if (!this.dragState && !this.panState && !this.minimapState && !sameViewport(nextViewport, this.persistedViewport)) {
      this.viewport = nextViewport;
    }

    this.persistedViewport = nextViewport;
    this.lastWorkspaceSelectedNodeId = nextSelectedNodeId;
    this.lastWorkspaceNodeCount = nextNodeCount;

    if (!this.dragState) {
      this.livePositions.clear();
    } else {
      const validNodeIds = new Set(workspace?.nodes?.map((node) => node.id) ?? []);

      for (const nodeId of [...this.livePositions.keys()]) {
        if (nodeId !== this.dragState.nodeId || !validNodeIds.has(nodeId)) {
          this.livePositions.delete(nodeId);
        }
      }
    }

    this.requestRender({
      resize: true,
      edges: true,
      nodes: true,
      minimap: true
    });

    if ((selectedChanged || nodeCountGrew) && nextSelectedNodeId) {
      window.requestAnimationFrame(() => {
        if (
          this.selectedNodeId === nextSelectedNodeId &&
          (firstNodeCreated || !this.isNodeVisible(nextSelectedNodeId))
        ) {
          this.centerOnNode(nextSelectedNodeId);
        }
      });
    }
  }

  setSelectedNode(nodeId) {
    this.selectedNodeId = nodeId;
    this.requestRender({
      nodes: true,
      minimap: true
    });
  }

  centerOnNode(nodeId) {
    const node = findNode(this.workspace, nodeId) ?? findRoots(this.workspace)[0] ?? null;

    if (!node) {
      return;
    }

    const positions = positionsForWorkspace(this.workspace, this.livePositions);
    const position = positions.get(node.id) ?? node.position;
    this.centerOnPoint(rectCenter(nodeRect({ ...node, position })));
  }

  isNodeVisible(nodeId, padding = 40) {
    const node = findNode(this.workspace, nodeId);

    if (!node) {
      return true;
    }

    const rect = this.getBoundingClientRect();
    const position = positionsForWorkspace(this.workspace, this.livePositions).get(node.id) ?? node.position;
    const dimensions = nodeDimensions(node);
    const topLeft = this.screenFromWorld(position);
    const screenRect = {
      left: topLeft.x,
      top: topLeft.y,
      right: topLeft.x + dimensions.width * this.viewport.zoom,
      bottom: topLeft.y + dimensions.height * this.viewport.zoom
    };

    return (
      screenRect.left >= -padding &&
      screenRect.top >= -padding &&
      screenRect.right <= rect.width + padding &&
      screenRect.bottom <= rect.height + padding
    );
  }

  centerOnPoint(point, { persist = true } = {}) {
    const rect = this.getBoundingClientRect();
    this.viewport = {
      ...this.viewport,
      x: rect.width / 2 - point.x * this.viewport.zoom,
      y: rect.height / 2 - point.y * this.viewport.zoom
    };

    if (persist) {
      this.emitViewportChange();
    }

    this.requestRender({
      edges: true,
      nodes: true,
      minimap: true
    });
  }

  centerOnMinimapClientPoint(clientX, clientY, { persist = false } = {}) {
    const projection = minimapProjection(this, positionsForWorkspace(this.workspace, this.livePositions));

    if (!projection) {
      return;
    }

    const worldPoint = {
      x:
        projection.bounds.minX +
        (clientX - projection.rect.left - projection.padding) / projection.scale,
      y:
        projection.bounds.minY +
        (clientY - projection.rect.top - projection.padding) / projection.scale
    };

    this.centerOnPoint(worldPoint, { persist });
  }

  worldFromClient(clientX, clientY) {
    const rect = this.getBoundingClientRect();

    return {
      x: (clientX - rect.left - this.viewport.x) / this.viewport.zoom,
      y: (clientY - rect.top - this.viewport.y) / this.viewport.zoom
    };
  }

  screenFromWorld(point) {
    return {
      x: point.x * this.viewport.zoom + this.viewport.x,
      y: point.y * this.viewport.zoom + this.viewport.y
    };
  }

  emitViewportChange() {
    this.dispatchEvent(
      new CustomEvent("nodely-viewport-change", {
        bubbles: true,
        detail: { viewport: this.viewport }
      })
    );
  }

  requestRender(flags = {}) {
    this.renderFlags = {
      resize: this.renderFlags.resize || Boolean(flags.resize),
      edges: this.renderFlags.edges || Boolean(flags.edges),
      nodes: this.renderFlags.nodes || Boolean(flags.nodes),
      minimap: this.renderFlags.minimap || Boolean(flags.minimap)
    };

    if (this.pendingFrame) {
      return;
    }

    this.pendingFrame = window.requestAnimationFrame(() => {
      this.pendingFrame = 0;
      const nextFlags = this.renderFlags;
      this.renderFlags = {
        resize: false,
        edges: false,
        nodes: false,
        minimap: false
      };
      this.flushRender(nextFlags);
    });
  }

  flushRender(flags) {
    if (!this.context || !this.isConnected) {
      return;
    }

    const rect = this.getBoundingClientRect();

    if (flags.resize) {
      this.ensureCanvasSize(rect);
    }

    const isEmpty = !this.workspace?.nodes?.length;
    this.emptyState.hidden = !isEmpty;
    this.emptyState.style.display = isEmpty ? "grid" : "none";
    this.minimap.hidden = isEmpty;
    this.minimap.style.display = isEmpty ? "none" : "";
    this.minimapToolbar.hidden = isEmpty;
    this.minimapToolbar.style.display = isEmpty ? "none" : "";

    if (isEmpty) {
      this.clearGraphLayer();
      this.clearCanvas(rect);
      this.minimap.replaceChildren();
      return;
    }

    const positions = positionsForWorkspace(this.workspace, this.livePositions);

    if (flags.edges || flags.resize || flags.nodes) {
      this.drawEdges(rect, positions);
    }

    if (flags.nodes || flags.resize) {
      this.reconcileNodes(positions);
    }

    if (flags.minimap || flags.resize) {
      this.renderMinimap(positions, rect);
    }
  }

  ensureCanvasSize(rect) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.floor(rect.width * devicePixelRatio));
    const pixelHeight = Math.max(1, Math.floor(rect.height * devicePixelRatio));

    if (this.canvas.width !== pixelWidth || this.canvas.style.width !== `${rect.width}px`) {
      this.canvas.width = pixelWidth;
      this.canvas.style.width = `${rect.width}px`;
    }

    if (this.canvas.height !== pixelHeight || this.canvas.style.height !== `${rect.height}px`) {
      this.canvas.height = pixelHeight;
      this.canvas.style.height = `${rect.height}px`;
    }
  }

  clearCanvas(rect = this.getBoundingClientRect()) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.context.clearRect(0, 0, rect.width, rect.height);
  }

  clearGraphLayer() {
    for (const element of this.nodeElements.values()) {
      element.remove();
    }

    this.nodeElements.clear();
    this.dataset.treeLabelCount = "0";
  }

  drawEdges(rect, positions) {
    this.clearCanvas(rect);

    this.context.save();
    this.context.setTransform(
      this.viewport.zoom * window.devicePixelRatio,
      0,
      0,
      this.viewport.zoom * window.devicePixelRatio,
      this.viewport.x * window.devicePixelRatio,
      this.viewport.y * window.devicePixelRatio
    );
    this.context.lineCap = "round";
    this.context.lineJoin = "round";

    for (const edge of this.workspace.edges) {
      const source = findNode(this.workspace, edge.source);
      const target = findNode(this.workspace, edge.target);

      if (!source || !target) {
        continue;
      }

      if (isArtifactNode(source) || isArtifactNode(target)) {
        continue;
      }

      const sourcePosition = positions.get(source.id) ?? source.position;
      const targetPosition = positions.get(target.id) ?? target.position;
      const curved = shouldCurveEdgeWithPositions(edge, this.workspace, positions);
      const path = buildEdgePath(
        { ...source, position: sourcePosition },
        { ...target, position: targetPosition },
        curved
      );
      this.context.strokeStyle = "rgba(88, 115, 148, 0.82)";
      this.context.lineWidth = 2.4 / this.viewport.zoom;
      this.context.stroke(new Path2D(path.path));
    }

    this.context.restore();
    this.drawTreeLabels(rect, positions);
  }

  drawTreeLabels(rect, positions) {
    if (!this.workspace) {
      this.dataset.treeLabelCount = "0";
      return;
    }

    const roots = findRoots(this.workspace);
    this.dataset.treeLabelMode = "canvas";
    this.dataset.treeLabelCount = String(roots.length);

    if (!roots.length) {
      return;
    }

    const computedStyle = window.getComputedStyle(this);
    const fontFamily =
      computedStyle.fontFamily ||
      '"SF Pro Text", "Segoe UI", "Noto Sans", system-ui, sans-serif';
    const textColor = computedStyle.getPropertyValue("--nodely-text").trim() || "#203246";
    const mutedTextColor = computedStyle.getPropertyValue("--nodely-muted").trim() || textColor;
    const darkTheme = document.documentElement?.getAttribute("nodely-theme") === "dark";
    const shadowColor = darkTheme ? "rgba(0, 0, 0, 0.62)" : "rgba(255, 255, 255, 0.84)";
    const activeSelectedNode =
      findNode(this.workspace, this.selectedNodeId ?? this.workspace.selectedNodeId) ?? null;
    const activeRootId = activeSelectedNode?.rootId ?? null;
    const devicePixelRatio = window.devicePixelRatio || 1;

    this.context.save();
    this.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.context.textAlign = "left";
    this.context.textBaseline = "alphabetic";

    for (const root of roots) {
      const category = classifyNodeCategory(this.workspace, root);
      const colors = SITE_CATEGORY_STYLES[category];
      const position = positions.get(root.id) ?? root.position;
      const point = this.screenFromWorld(position);
      const dimensions = nodeDimensions(root);
      const stats = summarizeTreeContents(this.workspace, root.id);
      const meta = `${stats.pageCount} page${stats.pageCount === 1 ? "" : "s"}${
        stats.artifactCount ? ` • ${stats.artifactCount} file${stats.artifactCount === 1 ? "" : "s"}` : ""
      }`;
      const blockHeight = 30;
      const preferredTop = Math.round(point.y + dimensions.height * this.viewport.zoom + 10);
      const fallbackTop = Math.round(point.y - blockHeight - 10);
      const maxTop = Math.max(8, Math.round(rect.height - blockHeight - 8));
      const labelTop =
        preferredTop <= maxTop
          ? preferredTop
          : clamp(fallbackTop, 8, maxTop);
      const maxWidth = Math.max(220, Math.round(dimensions.width * this.viewport.zoom + 88));
      const maxLeft = Math.max(8, Math.round(rect.width - maxWidth - 8));
      const labelLeft = clamp(Math.round(point.x + 8), 8, maxLeft);
      const isActive = root.id === activeRootId;

      this.context.shadowColor = shadowColor;
      this.context.shadowBlur = isActive ? 8 : 2;
      this.context.shadowOffsetX = 0;
      this.context.shadowOffsetY = 1;

      this.context.font = `800 15px ${fontFamily}`;
      this.context.fillStyle = isActive ? colors.accent : textColor;
      this.context.fillText(
        fitTextToWidth(this.context, treeDisplayTitle(this.workspace, root.id), maxWidth),
        labelLeft,
        labelTop + 14,
        maxWidth
      );

      this.context.font = `500 11.5px ${fontFamily}`;
      this.context.fillStyle = isActive ? colors.accent : mutedTextColor;
      this.context.fillText(
        fitTextToWidth(this.context, meta, maxWidth),
        labelLeft,
        labelTop + 27,
        maxWidth
      );
    }

    this.context.restore();
  }

  reconcileNodes(positions) {
    if (!this.workspace || !this.nodeLayer) {
      return;
    }

    const activeSelectedNodeId = this.selectedNodeId ?? this.workspace.selectedNodeId;
    const seenNodeIds = new Set();

    for (const node of this.workspace.nodes) {
      seenNodeIds.add(node.id);
      const category = classifyNodeCategory(this.workspace, node);
      const colors = SITE_CATEGORY_STYLES[category];
      const point = this.screenFromWorld(positions.get(node.id) ?? node.position);
      const dimensions = nodeDimensions(node);
      const element = this.nodeElements.get(node.id) ?? createHtmlElement(this.ownerDocument, "button");

      if (!this.nodeElements.has(node.id)) {
        element.type = "button";
        element.addEventListener("pointerdown", this.handleNodePointerDown);
        element.addEventListener("pointerup", this.handleNodePointerUp);
        element.addEventListener("click", this.handleNodeClick);
        this.nodeElements.set(node.id, element);
        this.nodeLayer.appendChild(element);
      }

      element.className = `nodely-graph-node${node.id === activeSelectedNodeId ? " nodely-graph-node--selected" : ""}${node.parentId === null ? " nodely-graph-node--root" : ""}${isArtifactNode(node) ? " nodely-graph-node--artifact" : ""}`;
      element.dataset.nodeId = node.id;
      element.dataset.nodeKind = node.kind;
      element.style.setProperty("--node-fill", colors.fill);
      element.style.setProperty("--node-border", colors.border);
      element.style.setProperty("--node-accent", colors.accent);
      element.style.width = `${dimensions.width}px`;
      element.style.height = `${dimensions.height}px`;
      element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) scale(${this.viewport.zoom})`;

      const contentSignature = JSON.stringify([
        node.kind,
        node.parentId,
        node.title,
        node.url,
        node.faviconUrl,
        node.artifact?.status ?? null,
        node.artifact?.inputLabel ?? null,
        node.artifact?.fileName ?? null,
        category
      ]);

      if (element.dataset.contentSignature !== contentSignature) {
        if (isArtifactNode(node)) {
          const glyph = node.kind === "upload" ? "↑" : "↓";
          const artifactMeta = artifactMetaLabel(node);
          element.innerHTML = `
            <span class="nodely-graph-node__artifact-glyph">${glyph}</span>
            <strong class="nodely-graph-node__artifact-title">${escapeHtml(node.title || "File")}</strong>
            <span class="nodely-graph-node__artifact-meta">${escapeHtml(artifactMeta)}</span>
          `;
        } else {
          const hostname = safeHostname(node.url, siteCategoryFallbackLabel(category));
          const favicon = node.faviconUrl
            ? `<img src="${node.faviconUrl}" alt="" loading="eager" />`
            : `<span>${(node.title || hostname || "N").slice(0, 1).toUpperCase()}</span>`;

          element.innerHTML = `
            ${node.parentId === null ? '<span class="nodely-graph-node__origin">Origin</span>' : ""}
            <span class="nodely-graph-node__favicon">${favicon}</span>
            <strong class="nodely-graph-node__title">${escapeHtml(node.title || "Untitled page")}</strong>
            <span class="nodely-graph-node__meta">${escapeHtml(hostname)}</span>
          `;
        }

        element.dataset.contentSignature = contentSignature;
      }
    }

    for (const [nodeId, element] of this.nodeElements.entries()) {
      if (!seenNodeIds.has(nodeId)) {
        element.remove();
        this.nodeElements.delete(nodeId);
      }
    }
  }

  renderMinimap(positions, viewportRect = this.getBoundingClientRect()) {
    if (!this.workspace || !this.minimap) {
      return;
    }

    const bounds = graphBounds(this.workspace, positions);

    if (!bounds) {
      this.minimap.replaceChildren();
      return;
    }

    const width = 176;
    const height = 132;
    const padding = 14;
    const usableWidth = width - padding * 2;
    const usableHeight = height - padding * 2;
    const scale = Math.min(
      usableWidth / Math.max(bounds.maxX - bounds.minX, 1),
      usableHeight / Math.max(bounds.maxY - bounds.minY, 1)
    );
    const projectX = (value) => padding + (value - bounds.minX) * scale;
    const projectY = (value) => padding + (value - bounds.minY) * scale;
    const worldViewport = {
      x: (-this.viewport.x) / this.viewport.zoom,
      y: (-this.viewport.y) / this.viewport.zoom,
      width: viewportRect.width / this.viewport.zoom,
      height: viewportRect.height / this.viewport.zoom
    };
    const activeSelectedNodeId = this.selectedNodeId ?? this.workspace.selectedNodeId;
    const svg = this.ownerDocument.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "nodely-graph-surface__minimap-svg");
    svg.setAttribute("aria-label", "Canvas minimap");

    const backdrop = this.ownerDocument.createElementNS(SVG_NS, "rect");
    backdrop.setAttribute("x", "0");
    backdrop.setAttribute("y", "0");
    backdrop.setAttribute("width", String(width));
    backdrop.setAttribute("height", String(height));
    backdrop.setAttribute("rx", "14");
    backdrop.setAttribute("class", "nodely-graph-surface__minimap-backdrop");
    svg.append(backdrop);

    for (const edge of this.workspace.edges) {
      const source = findNode(this.workspace, edge.source);
      const target = findNode(this.workspace, edge.target);

      if (!source || !target) {
        continue;
      }

      if (isArtifactNode(source) || isArtifactNode(target)) {
        continue;
      }

      const sourcePosition = positions.get(source.id) ?? source.position;
      const targetPosition = positions.get(target.id) ?? target.position;
      const path = buildEdgePath(
        { ...source, position: sourcePosition },
        { ...target, position: targetPosition },
        shouldCurveEdgeWithPositions(edge, this.workspace, positions)
      );
      const line = this.ownerDocument.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(projectX(path.start.x)));
      line.setAttribute("y1", String(projectY(path.start.y)));
      line.setAttribute("x2", String(projectX(path.end.x)));
      line.setAttribute("y2", String(projectY(path.end.y)));
      line.setAttribute("class", "nodely-graph-surface__minimap-edge");
      svg.append(line);
    }

    for (const node of this.workspace.nodes) {
      const category = classifyNodeCategory(this.workspace, node);
      const fill = SITE_CATEGORY_STYLES[category].minimapFill;
      const dimensions = nodeDimensions(node);
      const position = positions.get(node.id) ?? node.position;
      const rect = this.ownerDocument.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(projectX(position.x)));
      rect.setAttribute("y", String(projectY(position.y)));
      rect.setAttribute("width", String(Math.max(8, dimensions.width * scale)));
      rect.setAttribute("height", String(Math.max(6, dimensions.height * scale)));
      rect.setAttribute("rx", isArtifactNode(node) ? "3" : "4");
      rect.setAttribute("fill", fill);
      rect.setAttribute(
        "stroke",
        node.id === activeSelectedNodeId ? "#0b5cad" : "rgba(44, 61, 87, 0.55)"
      );
      rect.setAttribute("stroke-width", node.id === activeSelectedNodeId ? "2" : "1.2");
      svg.append(rect);
    }

    const viewport = this.ownerDocument.createElementNS(SVG_NS, "rect");
    viewport.setAttribute("x", String(projectX(worldViewport.x)));
    viewport.setAttribute("y", String(projectY(worldViewport.y)));
    viewport.setAttribute("width", String(Math.max(12, worldViewport.width * scale)));
    viewport.setAttribute("height", String(Math.max(10, worldViewport.height * scale)));
    viewport.setAttribute("rx", "6");
    viewport.setAttribute("class", "nodely-graph-surface__minimap-viewport");
    svg.append(viewport);

    this.minimap.replaceChildren(svg);
  }

  handleMinimapToolbarClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (button.dataset.action === "zoom-in") {
      this.adjustZoom(1.12);
      return;
    }

    if (button.dataset.action === "zoom-out") {
      this.adjustZoom(0.9);
      return;
    }

    if (button.dataset.action === "center-tree") {
      this.centerOnNode(this.selectedNodeId ?? this.workspace?.selectedNodeId ?? null);
      return;
    }

    if (button.dataset.action === "auto-organize") {
      this.dispatchEvent(
        new CustomEvent("nodely-auto-organize", {
          bubbles: true
        })
      );
    }
  }

  handleWheel(event) {
    event.preventDefault();
    const rect = this.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const zoomBefore = this.viewport.zoom;
    const worldPoint = this.worldFromClient(event.clientX, event.clientY);
    const nextZoom = clamp(zoomBefore * (event.deltaY > 0 ? 0.92 : 1.08), 0.45, 1.45);

    this.viewport = {
      x: pointer.x - worldPoint.x * nextZoom,
      y: pointer.y - worldPoint.y * nextZoom,
      zoom: nextZoom
    };

    this.emitViewportChange();
    this.requestRender({
      edges: true,
      nodes: true,
      minimap: true
    });
  }

  handleBackgroundPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    if (event.target !== this.stage && event.target !== this.canvas && event.target !== this.nodeLayer) {
      return;
    }

    event.preventDefault();
    this.panState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewport: { ...this.viewport },
      moved: false
    };
    try {
      this.stage.setPointerCapture?.(event.pointerId);
    } catch {}

    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  handleNodePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const nodeElement = event.target.closest(".nodely-graph-node");

    if (!nodeElement || !this.workspace) {
      return;
    }

    event.stopPropagation();

    const node = findNode(this.workspace, nodeElement.dataset.nodeId);

    if (!node) {
      return;
    }

    const position = this.livePositions.get(node.id) ?? node.position;
    const worldPoint = this.worldFromClient(event.clientX, event.clientY);
    this.dragState = {
      pointerId: event.pointerId,
      nodeId: node.id,
      offsetX: worldPoint.x - position.x,
      offsetY: worldPoint.y - position.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false
    };
    this.livePositions.set(node.id, { ...position });
    try {
      nodeElement.setPointerCapture?.(event.pointerId);
    } catch {}

    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  handleNodePointerUp(event) {
    if (!this.finalizeNodePointerInteraction(event)) {
      return;
    }

    this.cleanupPointerListenersIfIdle();
  }

  handlePointerMove(event) {
    if (this.minimapState && event.pointerId === this.minimapState.pointerId) {
      this.centerOnMinimapClientPoint(event.clientX, event.clientY);
      return;
    }

    if (this.dragState && event.pointerId === this.dragState.pointerId) {
      const distance = Math.hypot(
        event.clientX - this.dragState.startClientX,
        event.clientY - this.dragState.startClientY
      );

      if (!this.dragState.moved && distance < POINTER_DRAG_THRESHOLD) {
        return;
      }

      this.dragState.moved = true;
      const nextWorld = this.worldFromClient(event.clientX, event.clientY);
      const nextPosition = {
        x: nextWorld.x - this.dragState.offsetX,
        y: nextWorld.y - this.dragState.offsetY
      };
      this.livePositions.set(this.dragState.nodeId, nextPosition);
      this.requestRender({
        edges: true,
        nodes: true,
        minimap: true
      });
      return;
    }

    if (this.panState && event.pointerId === this.panState.pointerId) {
      this.panState.moved =
        this.panState.moved ||
        Math.hypot(event.clientX - this.panState.startX, event.clientY - this.panState.startY) >=
          POINTER_DRAG_THRESHOLD;
      this.viewport = {
        ...this.viewport,
        x: this.panState.viewport.x + (event.clientX - this.panState.startX),
        y: this.panState.viewport.y + (event.clientY - this.panState.startY)
      };
      this.requestRender({
        edges: true,
        nodes: true,
        minimap: true
      });
    }
  }

  handlePointerUp(event) {
    if (this.minimapState && event.pointerId === this.minimapState.pointerId) {
      try {
        this.minimap.releasePointerCapture?.(event.pointerId);
      } catch {}
      this.minimapState = null;
      this.emitViewportChange();
    }

    this.finalizeNodePointerInteraction(event);

    if (this.panState && event.pointerId === this.panState.pointerId) {
      try {
        this.stage.releasePointerCapture?.(event.pointerId);
      } catch {}
      this.panState = null;
      this.emitViewportChange();
    }

    this.cleanupPointerListenersIfIdle();
  }

  handleNodeClick(event) {
    const nodeElement = event.target.closest(".nodely-graph-node");

    if (!nodeElement) {
      return;
    }

    if (
      nodeElement.dataset.nodeId === this.suppressClickNodeId &&
      performance.now() < this.suppressClickUntil
    ) {
      return;
    }

    this.dispatchNodeSelection(nodeElement.dataset.nodeId);
  }

  handleContextMenu(event) {
    const target = event.target;

    if (!target?.closest) {
      return;
    }

    const nodeElement = target.closest(".nodely-graph-node");

    if (nodeElement?.dataset?.nodeId) {
      event.preventDefault();
      event.stopPropagation();
      this.dispatchNodeMenuOpen(nodeElement.dataset.nodeId, {
        clientX: event.clientX,
        clientY: event.clientY
      });
      return;
    }

    if (
      target.closest(".nodely-graph-surface__minimap, .nodely-graph-surface__minimap-toolbar")
    ) {
      return;
    }

    if (!target.closest(".nodely-graph-surface__stage, .nodely-graph-surface__empty")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.dispatchComposerOpen({
      clientX: event.clientX,
      clientY: event.clientY
    });
  }

  handleMinimapPointerDown(event) {
    if (event.button !== 0 || !this.workspace) {
      return;
    }

    if (event.target.closest(".nodely-graph-surface__minimap-toolbar")) {
      return;
    }

    event.preventDefault();
    this.minimapState = {
      pointerId: event.pointerId
    };
    try {
      this.minimap.setPointerCapture?.(event.pointerId);
    } catch {}
    this.centerOnMinimapClientPoint(event.clientX, event.clientY, { persist: false });
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  adjustZoom(multiplier) {
    const rect = this.getBoundingClientRect();
    const center = {
      x: rect.width / 2,
      y: rect.height / 2
    };
    const worldPoint = {
      x: (center.x - this.viewport.x) / this.viewport.zoom,
      y: (center.y - this.viewport.y) / this.viewport.zoom
    };
    const nextZoom = clamp(this.viewport.zoom * multiplier, 0.45, 1.65);

    this.viewport = {
      x: center.x - worldPoint.x * nextZoom,
      y: center.y - worldPoint.y * nextZoom,
      zoom: nextZoom
    };

    this.emitViewportChange();
    this.requestRender({
      edges: true,
      nodes: true,
      minimap: true
    });
  }

  dispatchNodeSelection(nodeId) {
    if (!nodeId) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("nodely-select-node", {
        bubbles: true,
        detail: { nodeId }
      })
    );
  }

  dispatchComposerOpen(anchor = null) {
    this.dispatchEvent(
      new CustomEvent("nodely-open-composer", {
        bubbles: true,
        detail: anchor ? { anchor } : {}
      })
    );
  }

  dispatchNodeMenuOpen(nodeId, anchor = null) {
    if (!nodeId) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("nodely-open-node-menu", {
        bubbles: true,
        detail: {
          nodeId,
          ...(anchor ? { anchor } : {})
        }
      })
    );
  }

  finalizeNodePointerInteraction(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return false;
    }

    const node = findNode(this.workspace, this.dragState.nodeId);
    const currentPosition = this.livePositions.get(this.dragState.nodeId) ?? node?.position;

    if (this.dragState.moved && node && currentPosition) {
      const snappedPosition = snapNodePosition(this.workspace, node.id, currentPosition);
      this.livePositions.set(node.id, snappedPosition);
      this.requestRender({
        edges: true,
        nodes: true,
        minimap: true
      });
      this.dispatchEvent(
        new CustomEvent("nodely-node-moved", {
          bubbles: true,
          detail: {
            nodeId: node.id,
            position: snappedPosition
          }
        })
      );
      this.suppressClickNodeId = node.id;
      this.suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
    } else if (node) {
      this.livePositions.delete(node.id);
    }

    try {
      this.nodeElements.get(node?.id)?.releasePointerCapture?.(event.pointerId);
    } catch {}
    this.dragState = null;
    return true;
  }

  cleanupPointerListenersIfIdle() {
    if (!this.dragState && !this.panState && !this.minimapState) {
      window.removeEventListener("pointermove", this.handlePointerMove);
      window.removeEventListener("pointerup", this.handlePointerUp);
    }
  }
}

function minimapProjection(surface, positions) {
  const bounds = graphBounds(surface.workspace, positions);

  if (!bounds) {
    return null;
  }

  const svg = surface.minimap?.querySelector("svg");

  if (!svg) {
    return null;
  }

  const rect = svg.getBoundingClientRect();
  const padding = 14;
  const usableWidth = rect.width - padding * 2;
  const usableHeight = rect.height - padding * 2;
  const scale = Math.min(
    usableWidth / Math.max(bounds.maxX - bounds.minX, 1),
    usableHeight / Math.max(bounds.maxY - bounds.minY, 1)
  );

  return {
    bounds,
    rect,
    padding,
    scale
  };
}

function createGraphToolbarButton(documentRef, title, action, text, icon = null) {
  const button = createHtmlElement(
    documentRef,
    "button",
    "nodely-graph-surface__minimap-button"
  );
  button.type = "button";
  button.dataset.action = action;
  button.title = title;

  if (icon) {
    appendSvgIcon(documentRef, button, icon);
  }

  if (text) {
    button.textContent = text;
  }

  return button;
}

function positionsForWorkspace(workspace, livePositions = new Map()) {
  return new Map(
    (workspace?.nodes ?? []).map((node) => [node.id, livePositions.get(node.id) ?? node.position])
  );
}

function sameViewport(left, right) {
  return (
    Math.abs((left?.x ?? 0) - (right?.x ?? 0)) < 0.5 &&
    Math.abs((left?.y ?? 0) - (right?.y ?? 0)) < 0.5 &&
    Math.abs((left?.zoom ?? 0.85) - (right?.zoom ?? 0.85)) < 0.001
  );
}

function graphBounds(workspace, positions = positionsForWorkspace(workspace)) {
  if (!workspace?.nodes.length) {
    return null;
  }

  const rects = workspace.nodes.map((node) =>
    nodeRect({ ...node, position: positions.get(node.id) ?? node.position })
  );
  const xs = rects.flatMap((rect) => [rect.x, rect.x + rect.width]);
  const ys = rects.flatMap((rect) => [rect.y, rect.y + rect.height]);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function siteCategoryFallbackLabel(category) {
  return SITE_CATEGORY_STYLES[category]?.label ?? "General";
}

function artifactMetaLabel(node) {
  const status = node.artifact?.status ?? (node.kind === "upload" ? "captured" : "in-progress");

  switch (status) {
    case "complete":
      return node.kind === "upload" ? "Uploaded" : "Downloaded";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    case "paused":
      return "Paused";
    case "removed":
      return "Removed";
    default:
      return node.kind === "upload" ? "Captured" : "Downloading";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function appendSvgIcon(documentRef, element, icon) {
  if (!icon?.paths?.length) {
    return;
  }

  const svg = documentRef.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", icon.viewBox ?? "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");

  for (const pathAttributes of icon.paths) {
    const path = documentRef.createElementNS(SVG_NS, "path");

    for (const [name, value] of Object.entries(pathAttributes)) {
      if (value != null) {
        path.setAttribute(name, String(value));
      }
    }

    svg.append(path);
  }

  element.append(svg);
}

if (!customElements.get("nodely-graph-surface")) {
  customElements.define("nodely-graph-surface", NodelyGraphSurface);
}

function createHtmlElement(documentRef, tagName, className = "") {
  const element = documentRef.createElementNS(HTML_NS, tagName);

  if (className) {
    element.setAttribute("class", className);
  }

  return element;
}
