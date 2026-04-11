import { describe, expect, it } from "vitest";

import {
  classifySiteCategory,
  GRAPH_NODE_WIDTH,
  nodeDimensions
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

describe("Gecko domain presentation helpers", () => {
  it("widens root nodes for longer titles without shrinking below the base width", () => {
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
    expect(expandedRoot.width).toBeGreaterThan(compactRoot.width);
  });

  it("recognizes active AI chat interfaces without recoloring generic OpenAI pages", () => {
    expect(classifySiteCategory("https://chatgpt.com/c/abc123", "ChatGPT")).toBe("ai-chat");
    expect(classifySiteCategory("https://claude.ai/new", "Claude")).toBe("ai-chat");
    expect(classifySiteCategory("https://openai.com/", "OpenAI")).toBe("general");
    expect(classifySiteCategory("https://platform.openai.com/docs", "OpenAI API Docs")).toBe(
      "general"
    );
  });
});
