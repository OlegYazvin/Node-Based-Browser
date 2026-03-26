import type { GraphNode } from "./types";

export const LIVE_NODE_LIMIT = 8;
export const LIVE_NODE_IDLE_MS = 10 * 60 * 1000;

function isLiveNode(node: GraphNode) {
  return node.runtimeState === "live" || node.runtimeState === "loading" || node.runtimeState === "error";
}

export function computeKeepAliveNodeIds(nodes: GraphNode[], selectedNodeId: string | null) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const keepAliveIds = new Set<string>();

  if (selectedNodeId) {
    keepAliveIds.add(selectedNodeId);
    const selectedNode = nodeById.get(selectedNodeId);

    if (selectedNode?.parentId) {
      keepAliveIds.add(selectedNode.parentId);
    }
  }

  const recentNodes = [...nodes]
    .filter((node) => node.lastActiveAt !== null && !keepAliveIds.has(node.id))
    .sort((left, right) => (right.lastActiveAt ?? 0) - (left.lastActiveAt ?? 0))
    .slice(0, 6);

  recentNodes.forEach((node) => keepAliveIds.add(node.id));

  return keepAliveIds;
}

export function listNodesToSuspend(nodes: GraphNode[], selectedNodeId: string | null, currentTime = Date.now()) {
  const keepAliveIds = computeKeepAliveNodeIds(nodes, selectedNodeId);
  const liveNodes = nodes.filter(isLiveNode);
  const idleCandidates = liveNodes
    .filter((node) => !keepAliveIds.has(node.id))
    .filter((node) => currentTime - (node.lastActiveAt ?? 0) >= LIVE_NODE_IDLE_MS)
    .sort((left, right) => (left.lastActiveAt ?? 0) - (right.lastActiveAt ?? 0));

  if (liveNodes.length <= LIVE_NODE_LIMIT) {
    return idleCandidates;
  }

  const overflowCount = liveNodes.length - LIVE_NODE_LIMIT;
  const overflowCandidates = liveNodes
    .filter((node) => !keepAliveIds.has(node.id))
    .sort((left, right) => (left.lastActiveAt ?? 0) - (right.lastActiveAt ?? 0))
    .slice(0, overflowCount);

  const combined = [...idleCandidates, ...overflowCandidates];

  return combined.filter((node, index) => combined.findIndex((candidate) => candidate.id === node.id) === index);
}
