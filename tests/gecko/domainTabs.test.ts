import { describe, expect, it } from "vitest";

import {
  createChildNode,
  createEmptyWorkspace,
  createRootNode,
  deriveSubtreeTabBarModel,
  findNode,
  selectNode,
  updateNodeMetadata,
  upsertArtifactNode
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

function retitleNode(workspace, nodeId, title) {
  return updateNodeMetadata(workspace, nodeId, { title });
}

describe("deriveSubtreeTabBarModel", () => {
  it("returns root and direct children when the selected node is the root", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId;

    workspace = retitleNode(workspace, rootId, "Root");
    workspace = createChildNode(workspace, rootId, "manual", { selectChild: false });
    const firstChildId = findNode(workspace, workspace.nodes.at(-1)?.id)?.id ?? null;
    workspace = retitleNode(workspace, firstChildId, "First Child");
    workspace = createChildNode(workspace, rootId, "manual", { selectChild: false });
    const secondChildId = findNode(workspace, workspace.nodes.at(-1)?.id)?.id ?? null;
    workspace = retitleNode(workspace, secondChildId, "Second Child");
    workspace = selectNode(workspace, rootId);

    const model = deriveSubtreeTabBarModel(workspace, rootId);

    expect(model.root?.id).toBe(rootId);
    expect(model.parent).toBeNull();
    expect(model.current?.id).toBe(rootId);
    expect(model.hiddenAncestors).toEqual([]);
    expect(model.children.map((node) => node.id)).toEqual([firstChildId, secondChildId]);
  });

  it("returns root, current, and current children when the selected node is depth 1", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId;

    workspace = retitleNode(workspace, rootId, "Root");
    workspace = createChildNode(workspace, rootId, "manual");
    const currentId = workspace.selectedNodeId;
    workspace = retitleNode(workspace, currentId, "Current");
    workspace = createChildNode(workspace, currentId, "manual", { selectChild: false });
    const childId = findNode(workspace, workspace.nodes.at(-1)?.id)?.id ?? null;
    workspace = retitleNode(workspace, childId, "Leaf");
    workspace = selectNode(workspace, currentId);

    const model = deriveSubtreeTabBarModel(workspace, currentId);

    expect(model.root?.id).toBe(rootId);
    expect(model.parent?.id).toBe(rootId);
    expect(model.hiddenAncestors).toEqual([]);
    expect(model.current?.id).toBe(currentId);
    expect(model.children.map((node) => node.id)).toEqual([childId]);
  });

  it("returns root, hidden ancestors, parent, current, and child descendant counts for deeper nodes", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId;

    workspace = retitleNode(workspace, rootId, "Root");

    workspace = createChildNode(workspace, rootId, "manual");
    const hiddenAncestorId = workspace.selectedNodeId;
    workspace = retitleNode(workspace, hiddenAncestorId, "Hidden Ancestor");

    workspace = createChildNode(workspace, hiddenAncestorId, "manual");
    const parentId = workspace.selectedNodeId;
    workspace = retitleNode(workspace, parentId, "Parent");

    workspace = createChildNode(workspace, parentId, "manual");
    const currentId = workspace.selectedNodeId;
    workspace = retitleNode(workspace, currentId, "Current");

    workspace = createChildNode(workspace, currentId, "manual", { selectChild: false });
    const childWithBranchId = workspace.nodes.at(-1)?.id ?? null;
    workspace = retitleNode(workspace, childWithBranchId, "Branch Child");
    workspace = createChildNode(workspace, childWithBranchId, "manual");
    const grandchildId = workspace.selectedNodeId;
    workspace = retitleNode(workspace, grandchildId, "Grandchild");
    workspace = upsertArtifactNode(workspace, childWithBranchId, "download", {
      fileName: "quote.pdf"
    });

    workspace = selectNode(workspace, currentId);

    const model = deriveSubtreeTabBarModel(workspace, currentId);

    expect(model.root?.id).toBe(rootId);
    expect(model.hiddenAncestors.map((node) => node.id)).toEqual([hiddenAncestorId]);
    expect(model.parent?.id).toBe(parentId);
    expect(model.current?.id).toBe(currentId);
    expect(model.children.map((node) => node.id)).toEqual([childWithBranchId]);
    expect(model.descendantPageCounts[childWithBranchId]).toBe(1);
    expect(model.descendantPageCounts[childWithBranchId]).not.toBe(2);
    expect(findNode(workspace, grandchildId)?.parentId).toBe(childWithBranchId);
  });
});
