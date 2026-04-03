import { describe, expect, it } from "vitest";

import {
  createEmptyWorkspace,
  createRootNode,
  orderTreeNodesForTabs,
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
});
