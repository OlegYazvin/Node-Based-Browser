import { describe, expect, it } from "vitest";
import { relayoutWorkspace } from "../src/shared/layout";
import { createChildNode, createEmptyWorkspace, createRootNode, findNode, replaceNode } from "../src/shared/workspace";

describe("relayoutWorkspace", () => {
  it("places the selected root at the center and other roots on outer rings", () => {
    const workspace = createRootNode(createRootNode(createEmptyWorkspace()));
    const laidOut = relayoutWorkspace(workspace);
    const roots = laidOut.nodes.filter((node) => node.parentId === null);

    expect(roots).toHaveLength(2);
    expect(findNode(laidOut, laidOut.selectedNodeId as string)?.position).toEqual({ x: 0, y: 0 });
    expect(roots[0]?.position).not.toEqual(roots[1]?.position);
  });

  it("preserves manual pinned positions", () => {
    const withRoot = createRootNode(createEmptyWorkspace());
    const parentId = withRoot.selectedNodeId as string;
    const withChild = createChildNode(withRoot, parentId, "link");
    const childId = withChild.selectedNodeId as string;
    const pinned = replaceNode(withChild, childId, (node) => ({
      ...node,
      manualPosition: true,
      position: { x: 777, y: -222 }
    }));
    const laidOut = relayoutWorkspace(pinned);

    expect(findNode(laidOut, childId)?.position).toEqual({ x: 777, y: -222 });
  });
});
