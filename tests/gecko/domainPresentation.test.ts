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

  it("keeps orphan-prone origin titles compact by adding height before wasting width", () => {
    const compactRoot = nodeDimensions({
      kind: "page",
      parentId: null,
      title: "Short"
    });
    const seafoodRoot = nodeDimensions({
      kind: "page",
      parentId: null,
      title: "YamaSeafood - Delivering The Best Seafood Since 1977"
    });

    expect(seafoodRoot.width).toBe(compactRoot.width);
    expect(seafoodRoot.height).toBeGreaterThan(compactRoot.height);
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
    const rootIds = [workspace.selectedNodeId as string];

    for (let rootIndex = 0; rootIndex < 5; rootIndex += 1) {
      const rootId = rootIds.at(-1) as string;
      for (let childIndex = 0; childIndex < 7; childIndex += 1) {
        workspace = createChildNode(workspace, rootId, "manual", { selectChild: false });
      }

      if (rootIndex < 4) {
        workspace = createRootNode(workspace);
        rootIds.push(workspace.selectedNodeId as string);
      }
    }

    workspace = relayoutWorkspace(workspace);

    const treeBounds = rootIds.map((rootId) => {
      const rects = workspace.nodes
        .filter((node) => node.rootId === rootId)
        .map((node) => nodeRect(node));

      return {
        rootId,
        x: Math.min(...rects.map((rect) => rect.x)),
        y: Math.min(...rects.map((rect) => rect.y)),
        width:
          Math.max(...rects.map((rect) => rect.x + rect.width)) -
          Math.min(...rects.map((rect) => rect.x)),
        height:
          Math.max(...rects.map((rect) => rect.y + rect.height)) -
          Math.min(...rects.map((rect) => rect.y))
      };
    });

    for (let leftIndex = 0; leftIndex < treeBounds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < treeBounds.length; rightIndex += 1) {
        expect(rectsOverlap(treeBounds[leftIndex], treeBounds[rightIndex])).toBe(false);
      }
    }
  });
});
