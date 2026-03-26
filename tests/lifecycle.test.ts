import { describe, expect, it } from "vitest";
import { LIVE_NODE_IDLE_MS, computeKeepAliveNodeIds, listNodesToSuspend } from "../src/shared/lifecycle";
import type { GraphNode } from "../src/shared/types";

function makeNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    parentId: overrides.parentId ?? null,
    rootId: overrides.rootId ?? overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? "Node",
    url: overrides.url ?? "https://example.com",
    faviconUrl: overrides.faviconUrl ?? null,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    lastVisitedAt: overrides.lastVisitedAt ?? 0,
    lastActiveAt: overrides.lastActiveAt ?? 0,
    origin: overrides.origin ?? "link",
    runtimeState: overrides.runtimeState ?? "live",
    position: overrides.position ?? { x: 0, y: 0 },
    manualPosition: overrides.manualPosition ?? false,
    slotIndex: overrides.slotIndex ?? 0,
    depth: overrides.depth ?? 0,
    searchQuery: overrides.searchQuery ?? null,
    history: overrides.history ?? null,
    canGoBack: overrides.canGoBack ?? false,
    canGoForward: overrides.canGoForward ?? false,
    errorMessage: overrides.errorMessage ?? null
  };
}

describe("lifecycle helpers", () => {
  it("keeps the selected node, its parent, and recent peers alive", () => {
    const now = Date.now();
    const nodes = [
      makeNode({ id: "root", parentId: null, lastActiveAt: now - 1000 }),
      makeNode({ id: "selected", parentId: "root", rootId: "root", lastActiveAt: now }),
      makeNode({ id: "peer-1", parentId: null, lastActiveAt: now - 2_000 }),
      makeNode({ id: "peer-2", parentId: null, lastActiveAt: now - 3_000 }),
      makeNode({ id: "peer-3", parentId: null, lastActiveAt: now - 4_000 })
    ];

    const keepAlive = computeKeepAliveNodeIds(nodes, "selected");

    expect(keepAlive.has("selected")).toBe(true);
    expect(keepAlive.has("root")).toBe(true);
    expect(keepAlive.has("peer-1")).toBe(true);
  });

  it("suspends stale overflow nodes first", () => {
    const currentTime = Date.now();
    const nodes = Array.from({ length: 10 }, (_, index) =>
      makeNode({
        id: `node-${index}`,
        parentId: index === 1 ? "node-0" : null,
        rootId: "node-0",
        lastActiveAt: currentTime - LIVE_NODE_IDLE_MS - index * 1000
      })
    );

    const candidates = listNodesToSuspend(nodes, "node-1", currentTime);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((node) => node.id === "node-9")).toBe(true);
  });
});
