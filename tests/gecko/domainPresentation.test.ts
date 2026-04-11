import { describe, expect, it } from "vitest";

import {
  buildSearchUrl,
  classifySiteCategory,
  createChildNode,
  createEmptyWorkspace,
  createRootNode,
  GRAPH_NODE_WIDTH,
  nodeDimensions,
  nodeRect,
  relayoutWorkspace
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

function rectsOverlap(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

describe("Gecko domain presentation helpers", () => {
  it("expands root nodes minimally, favoring extra height for longer titles", () => {
    const compactRoot = nodeDimensions({
      kind: "page",
      parentId: null,
      title: "Short"
    });
    const expandedRoot = nodeDimensions({
      kind: "page",
      parentId: null,
      title: "A much longer page title that should need a wider root card in the graph"
    });

    expect(compactRoot.width).toBeGreaterThanOrEqual(GRAPH_NODE_WIDTH);
    expect(expandedRoot.height).toBeGreaterThan(compactRoot.height);
    expect(expandedRoot.width - compactRoot.width).toBeLessThanOrEqual(72);
  });

  it("recognizes active AI chat interfaces without recoloring generic OpenAI pages", () => {
    expect(classifySiteCategory("https://chatgpt.com/c/abc123", "ChatGPT")).toBe("ai-chat");
    expect(classifySiteCategory("https://claude.ai/new", "Claude")).toBe("ai-chat");
    expect(classifySiteCategory("https://openai.com/", "OpenAI")).toBe("general");
    expect(classifySiteCategory("https://platform.openai.com/docs", "OpenAI API Docs")).toBe(
      "general"
    );
  });

  it("builds supported search URLs for the default provider set", () => {
    expect(buildSearchUrl("nodely browser", "google")).toContain("google.com/search?q=");
    expect(buildSearchUrl("nodely browser", "wikipedia")).toContain("wikipedia.org/w/index.php?search=");
    expect(buildSearchUrl("nodely browser", "bing")).toContain("bing.com/search?q=");
    expect(buildSearchUrl("nodely browser", "yahoo")).toContain("search.yahoo.com/search?p=");
  });

  it("pushes tree layouts apart so different roots do not overlap after auto arrange", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const firstRootId = workspace.selectedNodeId as string;

    for (let index = 0; index < 5; index += 1) {
      workspace = createChildNode(workspace, firstRootId, "manual", { selectChild: false });
    }

    workspace = createRootNode(workspace);
    const secondRootId = workspace.selectedNodeId as string;

    for (let index = 0; index < 5; index += 1) {
      workspace = createChildNode(workspace, secondRootId, "manual", { selectChild: false });
    }

    workspace = relayoutWorkspace(workspace);

    const firstRects = workspace.nodes
      .filter((node) => node.rootId === firstRootId)
      .map((node) => nodeRect(node));
    const secondRects = workspace.nodes
      .filter((node) => node.rootId === secondRootId)
      .map((node) => nodeRect(node));

    const firstBounds = {
      x: Math.min(...firstRects.map((rect) => rect.x)),
      y: Math.min(...firstRects.map((rect) => rect.y)),
      width:
        Math.max(...firstRects.map((rect) => rect.x + rect.width)) -
        Math.min(...firstRects.map((rect) => rect.x)),
      height:
        Math.max(...firstRects.map((rect) => rect.y + rect.height)) -
        Math.min(...firstRects.map((rect) => rect.y))
    };
    const secondBounds = {
      x: Math.min(...secondRects.map((rect) => rect.x)),
      y: Math.min(...secondRects.map((rect) => rect.y)),
      width:
        Math.max(...secondRects.map((rect) => rect.x + rect.width)) -
        Math.min(...secondRects.map((rect) => rect.x)),
      height:
        Math.max(...secondRects.map((rect) => rect.y + rect.height)) -
        Math.min(...secondRects.map((rect) => rect.y))
    };

    expect(rectsOverlap(firstBounds, secondBounds)).toBe(false);
  });
});
