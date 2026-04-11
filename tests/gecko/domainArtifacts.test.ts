import { describe, expect, it } from "vitest";

import {
  createEmptyWorkspace,
  createRootNode,
  findNode,
  GRAPH_ARTIFACT_HEIGHT,
  GRAPH_NODE_HEIGHT,
  nodeDimensions,
  orderTreeNodesForTabs,
  relayoutWorkspace,
  summarizeTreeContents,
  upsertArtifactNode
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

describe("Gecko domain artifact nodes", () => {
  it("upserts download artifacts without polluting tree tabs", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    workspace = upsertArtifactNode(workspace, rootId, "download", {
      transferId: "download-1",
      fileName: "paper.pdf",
      filePath: "/tmp/paper.pdf",
      status: "in-progress"
    });
    workspace = upsertArtifactNode(workspace, rootId, "download", {
      transferId: "download-1",
      fileName: "paper.pdf",
      filePath: "/tmp/paper.pdf",
      status: "complete"
    });

    expect(workspace.nodes).toHaveLength(2);
    expect(workspace.nodes.find((node: { kind: string }) => node.kind === "download")?.artifact?.status).toBe("complete");
    expect(orderTreeNodesForTabs(workspace, rootId).map((node: { id: string }) => node.id)).toEqual([rootId]);
    expect(summarizeTreeContents(workspace, rootId)).toEqual({
      pageCount: 1,
      artifactCount: 1
    });
  });

  it("positions artifact nodes as attached nubbins under their page node", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    workspace = upsertArtifactNode(workspace, rootId, "download", {
      transferId: "download-2",
      fileName: "attached.pdf",
      status: "complete"
    });
    workspace = relayoutWorkspace(workspace);

    const rootNode = findNode(workspace, rootId);
    const artifactNode =
      workspace.nodes.find(
        (node: { kind: string; parentId: string | null }) =>
          node.kind === "download" && node.parentId === rootId
      ) ?? null;

    expect(rootNode).toBeTruthy();
    expect(artifactNode).toBeTruthy();

    const rootWidth = nodeDimensions(rootNode!).width;
    const rootBottom = rootNode!.position.y + GRAPH_NODE_HEIGHT;
    const artifactBottom = artifactNode!.position.y + GRAPH_ARTIFACT_HEIGHT;

    expect(artifactNode!.position.y).toBeGreaterThanOrEqual(rootBottom - 8);
    expect(artifactNode!.position.y).toBeLessThan(rootBottom + 2);
    expect(artifactBottom).toBeGreaterThan(rootBottom + 40);
    expect(artifactNode!.position.x).toBeGreaterThanOrEqual(rootNode!.position.x - 2);
    expect(artifactNode!.position.x).toBeLessThanOrEqual(rootNode!.position.x + rootWidth - 24);
  });
});
