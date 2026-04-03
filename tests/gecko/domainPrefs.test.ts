import { describe, expect, it } from "vitest";

import {
  createEmptyWorkspace,
  normalizeWorkspace,
  setSurfaceMode,
  setSplitWidth
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

describe("Gecko workspace preferences", () => {
  it("defaults split width and surface mode for fresh and legacy workspaces", () => {
    expect(createEmptyWorkspace().prefs.splitWidth).toBe(340);
    expect(createEmptyWorkspace().prefs.surfaceMode).toBe("page");

    const legacyWorkspace = normalizeWorkspace({
      ...createEmptyWorkspace(),
      prefs: {
        ...createEmptyWorkspace().prefs,
        splitWidth: undefined,
        surfaceMode: undefined
      }
    });

    expect(legacyWorkspace.prefs.splitWidth).toBe(340);
    expect(legacyWorkspace.prefs.surfaceMode).toBe("page");
  });

  it("clamps split width into the supported range", () => {
    const workspace = createEmptyWorkspace();

    expect(setSplitWidth(workspace, 180).prefs.splitWidth).toBe(240);
    expect(setSplitWidth(workspace, 420).prefs.splitWidth).toBe(420);
    expect(setSplitWidth(workspace, 900).prefs.splitWidth).toBe(640);
  });

  it("normalizes surface mode to page or canvas", () => {
    const workspace = createEmptyWorkspace();

    expect(setSurfaceMode(workspace, "canvas").prefs.surfaceMode).toBe("canvas");
    expect(setSurfaceMode(workspace, "anything-else").prefs.surfaceMode).toBe("page");
  });
});
