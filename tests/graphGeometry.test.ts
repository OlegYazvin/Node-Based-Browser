import { describe, expect, it } from "vitest";
import { buildEdgePath, edgeAnchorPoints, isNodePositionValid, snapNodePosition } from "../src/shared/graphGeometry";
import { createChildNode, createEmptyWorkspace, createRootNode, replaceNode } from "../src/shared/workspace";

function pinNode<T extends ReturnType<typeof createEmptyWorkspace>>(workspace: T, nodeId: string, x: number, y: number) {
  return replaceNode(workspace, nodeId, (node) => ({
    ...node,
    manualPosition: true,
    position: { x, y }
  })) as T;
}

describe("graph geometry snapping", () => {
  it("keeps a dragged node in place when the target position is already clear", () => {
    let workspace = createRootNode(createRootNode(createEmptyWorkspace()));
    const [firstRoot, secondRoot] = workspace.nodes.map((node) => node.id);

    workspace = pinNode(workspace, firstRoot as string, 0, 0);
    workspace = pinNode(workspace, secondRoot as string, 420, 0);

    const snapped = snapNodePosition(workspace, secondRoot as string, { x: 420, y: 0 });

    expect(snapped).toEqual({ x: 420, y: 0 });
    expect(isNodePositionValid(workspace, secondRoot as string, snapped)).toBe(true);
  });

  it("snaps away from overlapping another node", () => {
    let workspace = createRootNode(createRootNode(createEmptyWorkspace()));
    const [firstRoot, secondRoot] = workspace.nodes.map((node) => node.id);

    workspace = pinNode(workspace, firstRoot as string, 0, 0);
    workspace = pinNode(workspace, secondRoot as string, 420, 0);

    const desired = { x: 30, y: 10 };
    const snapped = snapNodePosition(workspace, secondRoot as string, desired);

    expect(snapped).not.toEqual(desired);
    expect(isNodePositionValid(workspace, secondRoot as string, snapped)).toBe(true);
  });

  it("snaps away when the node would land on top of an existing edge", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = createChildNode(workspace, rootId, "link");
    const childId = workspace.selectedNodeId as string;
    workspace = createRootNode(workspace);
    const movingRootId = workspace.selectedNodeId as string;

    workspace = pinNode(workspace, rootId, 0, 0);
    workspace = pinNode(workspace, childId, 320, 0);
    workspace = pinNode(workspace, movingRootId, 540, 200);

    const desired = { x: 110, y: 8 };
    const snapped = snapNodePosition(workspace, movingRootId, desired);

    expect(snapped).not.toEqual(desired);
    expect(isNodePositionValid(workspace, movingRootId, snapped)).toBe(true);
  });

  it("snaps away when a dragged node would make its edge cross another edge", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const topRootId = workspace.selectedNodeId as string;
    workspace = createChildNode(workspace, topRootId, "link");
    const topChildId = workspace.selectedNodeId as string;

    workspace = createRootNode(workspace);
    const bottomRootId = workspace.selectedNodeId as string;
    workspace = createChildNode(workspace, bottomRootId, "link");
    const bottomChildId = workspace.selectedNodeId as string;

    workspace = pinNode(workspace, topRootId, 0, 0);
    workspace = pinNode(workspace, topChildId, 320, 0);
    workspace = pinNode(workspace, bottomRootId, 0, 260);
    workspace = pinNode(workspace, bottomChildId, 400, 260);

    const desired = { x: 160, y: -140 };
    const snapped = snapNodePosition(workspace, bottomRootId, desired);

    expect(snapped).not.toEqual(desired);
    expect(isNodePositionValid(workspace, bottomRootId, snapped)).toBe(true);
  });

  it("anchors edges from the actual center-to-center direction", () => {
    const anchors = edgeAnchorPoints({ x: 0, y: 0 }, { x: 260, y: 170 });

    expect(anchors.source.x).toBeGreaterThan(77);
    expect(anchors.source.y).toBeGreaterThan(73);
    expect(anchors.target.x).toBeLessThan(337);
    expect(anchors.target.y).toBeLessThan(243);
  });

  it("builds straight edge paths from directional border intersections", () => {
    const path = buildEdgePath({ x: 0, y: 0 }, { x: 260, y: 170 }, false);

    expect(path.path.startsWith("M ")).toBe(true);
    expect(path.path.includes(" L ")).toBe(true);
    expect(path.start).not.toEqual({ x: 77, y: 73 });
    expect(path.end).not.toEqual({ x: 337, y: 243 });
  });
});
