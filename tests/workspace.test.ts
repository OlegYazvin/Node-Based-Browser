import { describe, expect, it } from "vitest";
import { createEmptyWorkspace, createChildNode, createRootNode, findNode, normalizeWorkspace } from "../src/shared/workspace";

describe("workspace graph creation", () => {
  it("creates root nodes as selected roots", () => {
    const workspace = createRootNode(createEmptyWorkspace());

    expect(workspace.nodes).toHaveLength(1);
    expect(workspace.selectedNodeId).toBe(workspace.nodes[0]?.id);
    expect(workspace.nodes[0]?.parentId).toBeNull();
    expect(workspace.prefs.searchProvider).toBe("google");
  });

  it("creates a child node and edge when branching from a parent", () => {
    const rootWorkspace = createRootNode(createEmptyWorkspace());
    const parentId = rootWorkspace.selectedNodeId as string;
    const branchedWorkspace = createChildNode(rootWorkspace, parentId, "link");
    const childId = branchedWorkspace.selectedNodeId as string;

    expect(findNode(branchedWorkspace, childId)?.parentId).toBe(parentId);
    expect(branchedWorkspace.edges).toHaveLength(1);
    expect(branchedWorkspace.edges[0]?.source).toBe(parentId);
  });

  it("round-trips through JSON serialization", () => {
    const withRoot = createRootNode(createEmptyWorkspace());
    const workspace = createChildNode(withRoot, withRoot.selectedNodeId as string, "link");
    const rehydrated = JSON.parse(JSON.stringify(workspace));

    expect(rehydrated.version).toBe(1);
    expect(Array.isArray(rehydrated.nodes)).toBe(true);
    expect(Array.isArray(rehydrated.edges)).toBe(true);
  });

  it("normalizes legacy search providers to Google", () => {
    const workspace = createEmptyWorkspace();
    const normalizedWorkspace = normalizeWorkspace({
      ...workspace,
      prefs: {
        ...workspace.prefs,
        searchProvider: "duckduckgo" as never
      }
    });

    expect(normalizedWorkspace.prefs.searchProvider).toBe("google");
  });
});
