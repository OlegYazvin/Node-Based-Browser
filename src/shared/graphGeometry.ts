import type { GraphEdge, Point, Workspace } from "./types";

export const GRAPH_NODE_WIDTH = 154;
export const GRAPH_NODE_HEIGHT = 146;
export const GRAPH_NODE_GAP = 18;
export const GRAPH_EDGE_CLEARANCE = 18;
const DRAG_SNAP_STEP = 24;
const DRAG_SNAP_RINGS = 36;

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Segment {
  start: Point;
  end: Point;
}

export interface GraphEdgePath {
  start: Point;
  end: Point;
  path: string;
}

function normalizePoint(point: Point): Point {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };
}

export function nodeRect(position: Point): CanvasRect {
  return {
    x: position.x,
    y: position.y,
    width: GRAPH_NODE_WIDTH,
    height: GRAPH_NODE_HEIGHT
  };
}

export function rectCenter(rect: CanvasRect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

export function expandRect(rect: CanvasRect, padding: number): CanvasRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

function rectsOverlap(left: CanvasRect, right: CanvasRect) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function orientation(first: Point, second: Point, third: Point) {
  return (second.y - first.y) * (third.x - second.x) - (second.x - first.x) * (third.y - second.y);
}

function onSegment(first: Point, second: Point, third: Point) {
  return (
    second.x <= Math.max(first.x, third.x) &&
    second.x >= Math.min(first.x, third.x) &&
    second.y <= Math.max(first.y, third.y) &&
    second.y >= Math.min(first.y, third.y)
  );
}

export function segmentsIntersect(firstStart: Point, firstEnd: Point, secondStart: Point, secondEnd: Point) {
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

function pointInsideRect(point: Point, rect: CanvasRect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function lineIntersectsRect(start: Point, end: Point, rect: CanvasRect) {
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

function edgeTouchesNode(edge: GraphEdge, nodeId: string) {
  return edge.source === nodeId || edge.target === nodeId;
}

function sharesEndpoint(left: GraphEdge, right: GraphEdge) {
  return left.source === right.source || left.source === right.target || left.target === right.source || left.target === right.target;
}

function buildPositionIndex(workspace: Workspace, movingNodeId?: string, movingPosition?: Point) {
  return new Map(
    workspace.nodes.map((node) => [
      node.id,
      node.id === movingNodeId && movingPosition ? normalizePoint(movingPosition) : node.position
    ])
  );
}

function safeRatio(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return Math.abs(numerator / denominator);
}

export function edgeAnchorPoint(fromNodePosition: Point, towardNodePosition: Point) {
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

export function edgeAnchorPoints(sourceNodePosition: Point, targetNodePosition: Point) {
  return {
    source: edgeAnchorPoint(sourceNodePosition, targetNodePosition),
    target: edgeAnchorPoint(targetNodePosition, sourceNodePosition)
  };
}

export function buildEdgePath(sourceNodePosition: Point, targetNodePosition: Point, curved = false): GraphEdgePath {
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

function edgeSegment(edge: GraphEdge, positions: Map<string, Point>): Segment | null {
  const sourcePosition = positions.get(edge.source);
  const targetPosition = positions.get(edge.target);

  if (!sourcePosition || !targetPosition) {
    return null;
  }

  const anchors = edgeAnchorPoints(sourcePosition, targetPosition);

  return {
    start: anchors.source,
    end: anchors.target
  };
}

export function shouldCurveEdgeWithPositions(edge: GraphEdge, workspace: Workspace, positions: Map<string, Point>) {
  const segment = edgeSegment(edge, positions);

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
      expandRect(nodeRect(positions.get(node.id) ?? node.position), GRAPH_EDGE_CLEARANCE)
    );
  });
}

export function shouldCurveEdge(edge: GraphEdge, workspace: Workspace) {
  return shouldCurveEdgeWithPositions(edge, workspace, buildPositionIndex(workspace));
}

export function isNodePositionValid(workspace: Workspace, nodeId: string, candidatePosition: Point) {
  const normalizedCandidate = normalizePoint(candidatePosition);
  const positions = buildPositionIndex(workspace, nodeId, normalizedCandidate);
  const candidateRect = expandRect(nodeRect(normalizedCandidate), GRAPH_NODE_GAP);

  for (const node of workspace.nodes) {
    if (node.id === nodeId) {
      continue;
    }

    if (rectsOverlap(candidateRect, expandRect(nodeRect(positions.get(node.id) ?? node.position), GRAPH_NODE_GAP))) {
      return false;
    }
  }

  const connectedEdges = workspace.edges.filter((edge) => edgeTouchesNode(edge, nodeId));
  const staticEdges = workspace.edges.filter((edge) => !edgeTouchesNode(edge, nodeId));

  for (const edge of staticEdges) {
    const segment = edgeSegment(edge, positions);

    if (!segment) {
      continue;
    }

    if (lineIntersectsRect(segment.start, segment.end, candidateRect)) {
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

      if (lineIntersectsRect(segment.start, segment.end, expandRect(nodeRect(positions.get(node.id) ?? node.position), GRAPH_EDGE_CLEARANCE))) {
        return false;
      }
    }

    for (const otherEdge of staticEdges) {
      if (sharesEndpoint(edge, otherEdge)) {
        continue;
      }

      const otherSegment = edgeSegment(otherEdge, positions);

      if (!otherSegment) {
        continue;
      }

      if (segmentsIntersect(segment.start, segment.end, otherSegment.start, otherSegment.end)) {
        return false;
      }
    }
  }

  return true;
}

function ringCandidates(center: Point, ring: number) {
  const candidates: Point[] = [];

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

export function snapNodePosition(workspace: Workspace, nodeId: string, desiredPosition: Point) {
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
