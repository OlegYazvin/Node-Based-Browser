import { describe, expect, it, vi } from "vitest";

import {
  isTransientStartupUrl,
  NodeRuntimeManager
} from "../../gecko/overlay/browser/base/content/nodely/node-runtime-manager.mjs";

function makeTab(id: string) {
  return {
    id,
    linkedPanel: `panel-${id}`,
    label: `Tab ${id}`,
    openerTab: null as any,
    owner: null as any,
    linkedBrowser: {
      currentURI: { spec: "about:blank" },
      canGoBack: false,
      canGoForward: false,
      isLoadingDocument: false,
      stop: vi.fn(),
      loadURI: vi.fn(),
      fixupAndLoadURIString: vi.fn()
    },
    setAttribute: vi.fn()
  };
}

function makeWindow() {
  const primaryTab = makeTab("primary");
  const extraTab = makeTab("extra");
  const addTab = vi.fn((_url, _options) => makeTab("created"));
  const removeTab = vi.fn();

  return {
    primaryTab,
    extraTab,
    gBrowser: {
      tabs: [primaryTab, extraTab],
      selectedTab: primaryTab,
      tabContainer: {
        addEventListener: vi.fn()
      },
      addTabsProgressListener: vi.fn(),
      removeTab,
      addTab,
      getIcon: vi.fn(() => null)
    }
  };
}

describe("NodeRuntimeManager Gecko tab ownership", () => {
  it("reuses the seed tab for the first foreground node and prunes extra startup tabs", () => {
    const windowRef = makeWindow();
    const manager = new NodeRuntimeManager(windowRef);

    manager.attach();

    expect(windowRef.gBrowser.removeTab).toHaveBeenCalledTimes(1);
    expect(windowRef.gBrowser.removeTab).toHaveBeenCalledWith(
      windowRef.extraTab,
      expect.objectContaining({ animate: false, skipPermitUnload: true })
    );

    const reusedTab = manager.ensureRuntime({ id: "node-1" });
    expect(reusedTab).toBe(windowRef.primaryTab);
    expect(manager.tabForNode("node-1")).toBe(windowRef.primaryTab);
  });

  it("suppresses foreign-tab callbacks for owned tab opens and reports real foreign tabs", () => {
    const windowRef = makeWindow();
    const onForeignTabOpen = vi.fn();
    const manager = new NodeRuntimeManager(windowRef, {
      onForeignTabOpen
    });

    manager.expectingOwnedTabOpen = true;
    manager.handleTabOpen({ target: makeTab("owned") });
    expect(onForeignTabOpen).not.toHaveBeenCalled();

    manager.registerNodeTab("node-1", windowRef.primaryTab, { owned: true });
    const foreignTab = makeTab("foreign");
    foreignTab.openerTab = windowRef.primaryTab;
    manager.expectingOwnedTabOpen = false;
    manager.handleTabOpen({ target: foreignTab });
    expect(onForeignTabOpen).toHaveBeenCalledWith(
      foreignTab,
      expect.objectContaining({ background: true, parentNodeId: "node-1" })
    );
  });

  it("ignores unrelated browser tabs that do not originate from a managed Nodely node", () => {
    const windowRef = makeWindow();
    const onForeignTabOpen = vi.fn();
    const manager = new NodeRuntimeManager(windowRef, {
      onForeignTabOpen
    });

    manager.handleTabOpen({ target: makeTab("stray") });

    expect(onForeignTabOpen).not.toHaveBeenCalled();
  });
});

describe("isTransientStartupUrl", () => {
  it("treats built-in startup surfaces as transient until a real page commits", () => {
    expect(isTransientStartupUrl("about:blank")).toBe(true);
    expect(isTransientStartupUrl("about:home")).toBe(true);
    expect(isTransientStartupUrl("about:newtab")).toBe(true);
    expect(isTransientStartupUrl("about:welcome")).toBe(true);
    expect(isTransientStartupUrl("https://example.com/")).toBe(false);
  });
});
