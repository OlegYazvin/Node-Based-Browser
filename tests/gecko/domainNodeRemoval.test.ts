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

  it("promotes a root node's lone child to become the new root", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    workspace = createChildNode(workspace, rootId, "manual");
    const childId = workspace.selectedNodeId as string;
    workspace = createChildNode(workspace, childId, "manual", { selectChild: false });
    const grandchildId = workspace.nodes.at(-1)?.id as string;
    workspace = {
      ...workspace,
      selectedNodeId: rootId
    };

    const result = killNode(workspace, rootId);

    expect(findNode(result.workspace, rootId)).toBeNull();
    expect(findNode(result.workspace, childId)?.parentId).toBeNull();
    expect(findNode(result.workspace, childId)?.rootId).toBe(childId);
    expect(findNode(result.workspace, grandchildId)?.rootId).toBe(childId);
    expect(result.workspace.selectedNodeId).toBe(childId);
    expect(result.invalidatedNodeIds).toEqual(expect.arrayContaining([rootId]));
  });

  it("replaces a branching root with a dummy Origin node", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    workspace = createChildNode(workspace, rootId, "manual");
    const firstChildId = workspace.selectedNodeId as string;
    workspace = createChildNode(workspace, rootId, "manual", { selectChild: false });
    const secondChildId = workspace.nodes.at(-1)?.id as string;
    workspace = upsertArtifactNode(workspace, rootId, "download", {
      transferId: "root-download",
      fileName: "outline.pdf"
    });
    const artifactId =
      workspace.nodes.find((node: { kind: string; parentId: string | null }) => node.kind === "download" && node.parentId === rootId)?.id ??
      null;
    workspace = {
      ...workspace,
      selectedNodeId: rootId
    };

    const result = killNode(workspace, rootId);
    const originNode = findNode(result.workspace, rootId);

    expect(originNode?.title).toBe("Origin");
    expect(originNode?.url).toBeNull();
    expect(findNode(result.workspace, artifactId)).toBeNull();
    expect(findNode(result.workspace, firstChildId)?.parentId).toBe(rootId);
    expect(findNode(result.workspace, secondChildId)?.parentId).toBe(rootId);
    expect(result.workspace.selectedNodeId).toBe(firstChildId);
    expect(result.removedNodeIds).toEqual(expect.arrayContaining([artifactId]));
    expect(result.invalidatedNodeIds).toEqual(expect.arrayContaining([rootId, artifactId]));
  });
});
