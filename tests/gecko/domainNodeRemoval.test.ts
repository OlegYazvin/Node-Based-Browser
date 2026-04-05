import { describe, expect, it } from "vitest";

import {
  createChildNode,
  createEmptyWorkspace,
  createRootNode,
  findNode,
  findPageChildren,
  killNode,
  upsertArtifactNode
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

describe("killNode domain graph splicing", () => {
  it("reconnects a linear middle page node to its child and removes direct artifacts", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    workspace = createChildNode(workspace, rootId, "manual");
    const middleId = workspace.selectedNodeId as string;
    workspace = createChildNode(workspace, middleId, "manual");
    const leafId = workspace.selectedNodeId as string;
    workspace = upsertArtifactNode(workspace, middleId, "download", {
      transferId: "download-1",
      fileName: "paper.pdf"
    });
    const artifactId =
      workspace.nodes.find((node: { kind: string; parentId: string | null }) => node.kind === "download" && node.parentId === middleId)?.id ??
      null;

    workspace = {
      ...workspace,
      selectedNodeId: middleId
    };

    const result = killNode(workspace, middleId);

    expect(result.removedNodeIds).toEqual(expect.arrayContaining([middleId, artifactId]));
    expect(findNode(result.workspace, middleId)).toBeNull();
    expect(findNode(result.workspace, artifactId)).toBeNull();
    expect(findNode(result.workspace, leafId)?.parentId).toBe(rootId);
    expect(result.workspace.selectedNodeId).toBe(leafId);
    expect(result.workspace.edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: rootId, target: leafId })])
    );
  });

  it("promotes multiple child pages into the removed node slot order", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    workspace = createChildNode(workspace, rootId, "manual");
    const middleId = workspace.selectedNodeId as string;
    workspace = createChildNode(workspace, rootId, "manual", { selectChild: false });
    const siblingId = workspace.nodes.at(-1)?.id as string;
    workspace = createChildNode(workspace, middleId, "manual", { selectChild: false });
    const promotedLeftId = workspace.nodes.at(-1)?.id as string;
    workspace = createChildNode(workspace, middleId, "manual", { selectChild: false });
    const promotedRightId = workspace.nodes.at(-1)?.id as string;
    workspace = {
      ...workspace,
      selectedNodeId: middleId
    };

    const result = killNode(workspace, middleId);

    expect(findPageChildren(result.workspace, rootId).map((node: { id: string }) => node.id)).toEqual([
      promotedLeftId,
      promotedRightId,
      siblingId
    ]);
    expect(result.workspace.selectedNodeId).toBe(rootId);
  });
});
