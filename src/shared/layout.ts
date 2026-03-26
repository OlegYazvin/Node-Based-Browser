import type { GraphNode, Point, Workspace } from "./types";
import { findChildren, findRoots } from "./workspace";

const ROOT_RING_RADIUS = 1180;
const ROOT_RING_STEP = 1040;
const ROOT_CHILD_RADIUS = 300;
const CHILD_RADIUS = 240;
const DEPTH_RADIUS_STEP = 32;
const SIBLING_RADIUS_STEP = 20;

function sortNodes(nodes: GraphNode[]) {
  return [...nodes].sort((left, right) => left.slotIndex - right.slotIndex || left.createdAt - right.createdAt);
}

function orderedRoots(workspace: Workspace) {
  const roots = sortNodes(findRoots(workspace));
  const selectedNode = workspace.nodes.find((node) => node.id === workspace.selectedNodeId) ?? null;
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

function rootAnchor(index: number): Point {
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

function radialPoint(origin: Point, angle: number, radius: number): Point {
  return {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius
  };
}

function placeNode(
  workspace: Workspace,
  node: GraphNode,
  position: Point,
  angle: number | null,
  positionedNodes: Map<string, GraphNode>
) {
  const resolvedPosition = node.manualPosition ? node.position : position;

  positionedNodes.set(node.id, {
    ...node,
    position: resolvedPosition
  });

  const children = sortNodes(findChildren(workspace, node.id));

  if (!children.length) {
    return;
  }

  const spread = node.parentId === null ? Math.PI * 2 : Math.min(Math.PI * 1.05, Math.PI / 2.8 + children.length * 0.26);
  const baseAngle = node.parentId === null ? -Math.PI / 2 : angle ?? -Math.PI / 2;

  children.forEach((child, childIndex) => {
    const childAngle =
      node.parentId === null
        ? children.length === 1
          ? -Math.PI / 2
          : -Math.PI / 2 + (Math.PI * 2 * childIndex) / children.length
        : children.length === 1
          ? baseAngle
          : baseAngle - spread / 2 + (spread * (childIndex + 0.5)) / children.length;

    const radius =
      (node.parentId === null ? ROOT_CHILD_RADIUS : CHILD_RADIUS + node.depth * DEPTH_RADIUS_STEP) +
      Math.max(0, children.length - 1) * SIBLING_RADIUS_STEP;

    placeNode(workspace, child, radialPoint(resolvedPosition, childAngle, radius), childAngle, positionedNodes);
  });
}

export function relayoutWorkspace(workspace: Workspace) {
  const positionedNodes = new Map<string, GraphNode>();
  const roots = orderedRoots(workspace);

  roots.forEach((rootNode, rootIndex) => {
    placeNode(workspace, rootNode, rootAnchor(rootIndex), null, positionedNodes);
  });

  return {
    ...workspace,
    nodes: workspace.nodes.map((node) => positionedNodes.get(node.id) ?? node)
  };
}
