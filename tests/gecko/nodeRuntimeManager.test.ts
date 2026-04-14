import { describe, expect, it, vi } from "vitest";

import {
  classifyForeignNavigationTarget,
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
  const browserToTab = new Map([
    [primaryTab.linkedBrowser, primaryTab],
    [extraTab.linkedBrowser, extraTab]
  ]);
  const addTab = vi.fn((_url, _options) => makeTab("created"));
  const removeTab = vi.fn();

  return {
    browserToTab,
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
      getIcon: vi.fn(() => null),
      getTabForBrowser: vi.fn((browser) => browserToTab.get(browser) ?? null)
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
    const onForeignOpenPending = vi.fn();
    const manager = new NodeRuntimeManager(windowRef, {
      onForeignOpenPending,
      onForeignTabOpen
    });

    manager.expectingOwnedTabOpen = true;
    manager.handleTabOpen({ target: makeTab("owned") });
    expect(onForeignTabOpen).not.toHaveBeenCalled();

    manager.registerNodeTab("node-1", windowRef.primaryTab, { owned: true });
    const foreignTab = makeTab("foreign");
    foreignTab.openerTab = windowRef.primaryTab;
    windowRef.browserToTab.set(foreignTab.linkedBrowser, foreignTab);
    manager.expectingOwnedTabOpen = false;
    manager.handleTabOpen({ target: foreignTab });
    expect(onForeignOpenPending).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "tab", background: true, parentNodeId: "node-1" })
    );
    foreignTab.linkedBrowser.currentURI.spec = "https://example.com/child";
    manager.progressListener.onLocationChange(
      foreignTab.linkedBrowser,
      null,
      null,
      { spec: "https://example.com/child" } as any,
      null
    );
    expect(onForeignTabOpen).toHaveBeenCalledWith(
      foreignTab,
      expect.objectContaining({
        kind: "tab",
        background: true,
        parentNodeId: "node-1",
        url: "https://example.com/child"
      })
    );
  });

  it("reclassifies a pending foreign tab as foreground when it becomes selected before the page commits", () => {
    const windowRef = makeWindow();
    const onForeignTabOpen = vi.fn();
    const manager = new NodeRuntimeManager(windowRef, {
      onForeignTabOpen
    });

    manager.registerNodeTab("node-1", windowRef.primaryTab, { owned: true });
    const foreignTab = makeTab("foreign-selected");
    foreignTab.owner = windowRef.primaryTab;
    windowRef.browserToTab.set(foreignTab.linkedBrowser, foreignTab);

    manager.handleTabOpen({ target: foreignTab });
    windowRef.gBrowser.selectedTab = foreignTab;
    foreignTab.linkedBrowser.currentURI.spec = "https://example.com/foreground-child";
    manager.progressListener.onLocationChange(
      foreignTab.linkedBrowser,
      null,
      null,
      { spec: "https://example.com/foreground-child" } as any,
      null
    );

    expect(onForeignTabOpen).toHaveBeenCalledWith(
      foreignTab,
      expect.objectContaining({
        kind: "tab",
        background: false,
        parentNodeId: "node-1",
        url: "https://example.com/foreground-child"
      })
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

  it("classifies opener-owned OAuth tabs as transient auth flows instead of child graph nodes", () => {
    const windowRef = makeWindow();
    const onForeignTabOpen = vi.fn();
    const onTransientAuthChanged = vi.fn();
    const manager = new NodeRuntimeManager(windowRef, {
      onForeignTabOpen,
      onTransientAuthChanged
    });

    manager.registerNodeTab("node-1", windowRef.primaryTab, { owned: true });
    const foreignTab = makeTab("google-auth");
    foreignTab.openerTab = windowRef.primaryTab;
    windowRef.browserToTab.set(foreignTab.linkedBrowser, foreignTab);

    manager.handleTabOpen({ target: foreignTab });
    foreignTab.linkedBrowser.currentURI.spec =
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc123";
    manager.progressListener.onLocationChange(
      foreignTab.linkedBrowser,
      null,
      null,
      {
        spec: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc123"
      } as any,
      null
    );

    expect(onForeignTabOpen).not.toHaveBeenCalled();
    expect(onTransientAuthChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        kind: "tab",
        parentNodeId: "node-1"
      })
    );

    manager.handleTabClose({ target: foreignTab });

    expect(onTransientAuthChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: false,
        kind: "tab",
        parentNodeId: "node-1"
      })
    );
  });

  it("uses the same auth classification for popup windows and popup tabs", () => {
    const windowRef = makeWindow();
    const onTransientAuthChanged = vi.fn();
    const manager = new NodeRuntimeManager(windowRef, {
      onTransientAuthChanged
    });

    manager.registerNodeTab("node-1", windowRef.primaryTab, { owned: true });
    const popupWindow = {
      opener: windowRef,
      document: {
        readyState: "complete",
        title: "Google sign-in"
      },
      gBrowser: {
        selectedBrowser: {
          currentURI: { spec: "about:blank" }
        },
        addTabsProgressListener: vi.fn(),
        removeTabsProgressListener: vi.fn()
      },
      addEventListener: vi.fn(),
      closed: false
    };

    expect(
      classifyForeignNavigationTarget("https://accounts.google.com/o/oauth2/v2/auth?client_id=abc123")
    ).toBe("transient-auth");

    manager.trackPopupWindow(popupWindow as any, "node-1");
    manager.maybeResolvePendingPopupWindow(
      popupWindow as any,
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc123"
    );

    expect(onTransientAuthChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        kind: "window",
        parentNodeId: "node-1"
      })
    );

    manager.finishPopupWindowTracking(popupWindow as any);

    expect(onTransientAuthChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: false,
        kind: "window",
        parentNodeId: "node-1"
      })
    );
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
