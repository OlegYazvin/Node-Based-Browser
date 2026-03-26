import { describe, expect, it } from "vitest";
import { workspacePartitionForId } from "../src/main/workspaceSessionManager";

describe("workspacePartitionForId", () => {
  it("creates a stable persistent partition name", () => {
    expect(workspacePartitionForId("default")).toBe("persist:research-graph-default");
  });
});
