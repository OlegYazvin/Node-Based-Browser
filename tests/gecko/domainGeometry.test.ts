import { describe, expect, it } from "vitest";

import {
  buildEdgePath,
  edgeAnchorPoints
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

function pageNodeAt(x: number, y: number) {
  return {
    kind: "page",
    position: { x, y }
  };
}

describe("Gecko graph edge geometry", () => {
  it("anchors straight horizontal edges to node borders", () => {
    const anchors = edgeAnchorPoints(pageNodeAt(0, 0), pageNodeAt(220, 0));

    expect(anchors.source.x).toBeCloseTo(142, 4);
    expect(anchors.source.y).toBeCloseTo(63, 4);
    expect(anchors.target.x).toBeCloseTo(220, 4);
    expect(anchors.target.y).toBeCloseTo(63, 4);
  });

  it("returns a center-to-border path contract for diagonal edges", () => {
    const path = buildEdgePath(pageNodeAt(0, 0), pageNodeAt(220, 180), false);

    expect(path.start.x).toBeGreaterThan(71);
    expect(path.start.y).toBeGreaterThan(63);
    expect(path.end.x).toBeLessThan(291);
    expect(path.end.y).toBeLessThan(243);
    expect(path.path.startsWith("M ")).toBe(true);
  });
});
