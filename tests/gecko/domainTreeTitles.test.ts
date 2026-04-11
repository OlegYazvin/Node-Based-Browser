import { describe, expect, it } from "vitest";

import {
  applyNodeNavigation,
  buildTreeFavoriteEntry,
  createChildNode,
  createEmptyWorkspace,
  createRootNode,
  findNode,
  findPageChildren,
  refreshAutoTreeTitles,
  relayoutWorkspace,
  renameTree,
  resolveOmniboxInput,
  treeDisplayTitle,
  updateNodeMetadata
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

function angleDistance(left: number, right: number) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

describe("Gecko tree title and root layout helpers", () => {
  it("derives an auto title from search intent and repeated page-title phrases", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    workspace = applyNodeNavigation(
      workspace,
      rootId,
      resolveOmniboxInput("budget espresso machine", workspace.prefs.searchProvider)
    );
    workspace = updateNodeMetadata(workspace, rootId, {
      title: "Budget Espresso Machine Buying Guide",
      url: "https://seriouseats.com/budget-espresso-machine-guide"
    });

    const childTitles = [
      ["Budget Espresso Machine Review", "https://www.nytimes.com/wirecutter/reviews/budget-espresso-machine/"],
      ["Budget Espresso Machine Tips", "https://www.reddit.com/r/espresso/comments/example"],
      ["Budget Espresso Machine Comparison", "https://www.youtube.com/watch?v=example"]
    ];

    childTitles.forEach(([title, url]) => {
      workspace = createChildNode(workspace, rootId, "manual", { selectChild: false });
      const childId = workspace.nodes.at(-1)?.id as string;
      workspace = applyNodeNavigation(
        workspace,
        childId,
        resolveOmniboxInput(url, workspace.prefs.searchProvider)
      );
      workspace = updateNodeMetadata(workspace, childId, {
        title,
        url
      });
    });

    workspace = refreshAutoTreeTitles(workspace);

    expect(findNode(workspace, rootId)?.treeTitleAuto).toBe("Budget Espresso Machine");
    expect(treeDisplayTitle(workspace, rootId)).toBe("Budget Espresso Machine");
  });

  it("keeps manual tree titles separate from the root page title", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    workspace = updateNodeMetadata(workspace, rootId, {
      title: "Company List - Google Docs",
      url: "https://docs.google.com/document/d/example/edit"
    });
    workspace = refreshAutoTreeTitles(workspace);
    const originalPageTitle = findNode(workspace, rootId)?.title;

    workspace = renameTree(workspace, rootId, "Target Accounts");

    expect(findNode(workspace, rootId)?.title).toBe(originalPageTitle);
    expect(findNode(workspace, rootId)?.treeTitleManual).toBe("Target Accounts");
    expect(treeDisplayTitle(workspace, rootId)).toBe("Target Accounts");
    expect(buildTreeFavoriteEntry(workspace, rootId).title).toBe("Target Accounts");
  });

  it("keeps first-level root children out of the title lane below the root", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;

    for (let index = 0; index < 6; index += 1) {
      workspace = createChildNode(workspace, rootId, "manual", { selectChild: false });
    }

    workspace = relayoutWorkspace(workspace);
    const rootNode = findNode(workspace, rootId) as { position: { x: number; y: number } };
    const childAngles = findPageChildren(workspace, rootId).map((child) =>
      Math.atan2(child.position.y - rootNode.position.y, child.position.x - rootNode.position.x)
    );

    expect(childAngles.every((angle) => angleDistance(angle, Math.PI / 2) > 0.45)).toBe(true);
  });
});
