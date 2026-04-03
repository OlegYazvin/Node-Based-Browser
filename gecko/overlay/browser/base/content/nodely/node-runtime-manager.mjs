let ServicesModule = null;

try {
  if (typeof ChromeUtils !== "undefined") {
    ServicesModule = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
  }
} catch {
  ServicesModule = null;
}

const ServicesRef = ServicesModule?.Services ?? globalThis.Services ?? null;

export function isTransientStartupUrl(url) {
  if (!url) {
    return true;
  }

  return (
    url === "about:blank" ||
    url === "about:home" ||
    url === "about:newtab" ||
    url.startsWith("about:welcome") ||
    url.startsWith("about:sessionrestore")
  );
}

function isCrashUrl(url) {
  return typeof url === "string" && url.startsWith("about:tabcrashed");
}

function trace(stage, details = {}) {
  const payload = JSON.stringify(details);

  try {
    dump(`[nodely] runtime:${stage} ${payload}\n`);
  } catch {}

  try {
    console.info(`[nodely] runtime:${stage}`, details);
  } catch {}
}

function systemPrincipal() {
  return ServicesRef?.scriptSecurityManager?.getSystemPrincipal?.() ?? null;
}

function relatedTabForForeignOpen(tab, eventDetail = {}) {
  return (
    tab?.openerTab ??
    tab?.owner ??
    eventDetail?.openerTab ??
    eventDetail?.ownerTab ??
    null
  );
}

export class NodeRuntimeManager {
  constructor(window, callbacks = {}) {
    this.window = window;
    this.callbacks = callbacks;
    this.tabByNodeId = new Map();
    this.nodeIdByTab = new WeakMap();
    this.ownedTabs = new WeakSet();
    this.seedTab = null;
    this.attached = false;
    this.pendingNavigationByNodeId = new Map();
    this.handleTabOpen = this.handleTabOpen.bind(this);
    this.handleTabSelect = this.handleTabSelect.bind(this);
    this.handleTabClose = this.handleTabClose.bind(this);
    this.handleTabAttrModified = this.handleTabAttrModified.bind(this);
    this.expectingOwnedTabOpen = false;
    this.progressListener = {
      onLocationChange: (_browser, progress, request, location, flags) => {
        void progress;
        void request;
        void location;
        void flags;
        this.syncSelectedTabMetadata();
      },
      onStateChange: () => {
        this.syncSelectedTabMetadata();
      },
      onProgressChange: () => {},
      onStatusChange: () => {},
      onSecurityChange: () => {},
      onContentBlockingEvent: () => {}
    };
  }

  attach() {
    if (this.attached || !this.window.gBrowser?.tabContainer) {
      return;
    }

    this.attached = true;
    trace("attach", {
      existingTabs: this.window.gBrowser.tabs?.length ?? 0
    });
    this.resetBrowserTabs();
    this.window.gBrowser.tabContainer.addEventListener("TabOpen", this.handleTabOpen);
    this.window.gBrowser.tabContainer.addEventListener("TabSelect", this.handleTabSelect);
    this.window.gBrowser.tabContainer.addEventListener("TabClose", this.handleTabClose);
    this.window.gBrowser.tabContainer.addEventListener("TabAttrModified", this.handleTabAttrModified);
    this.window.gBrowser.addTabsProgressListener(this.progressListener);
  }

  resetBrowserTabs() {
    const gBrowser = this.window.gBrowser;
    const tabs = Array.from(gBrowser?.tabs ?? []);

    if (!tabs.length) {
      return;
    }

    this.tabByNodeId.clear();
    this.nodeIdByTab = new WeakMap();
    this.ownedTabs = new WeakSet();
    this.pendingNavigationByNodeId.clear();

    const [primaryTab, ...extraTabs] = tabs;

    for (const tab of extraTabs) {
      gBrowser.removeTab(tab, {
        animate: false,
        skipPermitUnload: true
      });
    }

    gBrowser.selectedTab = primaryTab;
    this.seedTab = primaryTab;
    this.prepareTabForManagedNavigation(primaryTab, "about:blank");
    trace("reset-tabs", {
      keptPrimaryTab: Boolean(primaryTab),
      removedTabs: extraTabs.length
    });
  }

  registerNodeTab(nodeId, tab, { owned = false } = {}) {
    this.tabByNodeId.set(nodeId, tab);
    this.nodeIdByTab.set(tab, nodeId);
    tab.setAttribute?.("nodely-node-id", nodeId);
    if (this.seedTab === tab) {
      this.seedTab = null;
    }

    if (owned) {
      this.ownedTabs.add(tab);
    }
  }

  unregisterTab(tab) {
    const nodeId = this.nodeIdByTab.get(tab);

    if (nodeId) {
      this.tabByNodeId.delete(nodeId);
      this.nodeIdByTab.delete(tab);
      this.pendingNavigationByNodeId.delete(nodeId);
    }
  }

  nodeIdForTab(tab) {
    return this.nodeIdByTab.get(tab) ?? null;
  }

  tabForNode(nodeId) {
    return this.tabByNodeId.get(nodeId) ?? null;
  }

  nodeIdForBrowser(browser) {
    const tab = this.window.gBrowser?.getTabForBrowser?.(browser) ?? null;
    return tab ? this.nodeIdForTab(tab) : null;
  }

  createRuntimeForNode(node, { background = false } = {}) {
    this.expectingOwnedTabOpen = true;
    const tab = this.window.gBrowser.addTab("about:blank", {
      inBackground: background,
      skipAnimation: true,
      triggeringPrincipal: systemPrincipal()
    });
    this.expectingOwnedTabOpen = false;

    this.registerNodeTab(node.id, tab, { owned: true });
    trace("create-runtime", {
      nodeId: node.id,
      background
    });
    return tab;
  }

  ensureRuntime(node, options = {}) {
    const existingTab = this.tabForNode(node.id);

    if (existingTab) {
      return existingTab;
    }

    if (!options.background && this.seedTab?.linkedBrowser) {
      const tab = this.seedTab;
      this.registerNodeTab(node.id, tab, { owned: true });
      trace("reuse-seed-tab", {
        nodeId: node.id
      });
      return tab;
    }

    return this.createRuntimeForNode(node, options);
  }

  adoptOpenedTab(nodeId, tab) {
    this.registerNodeTab(nodeId, tab);
    this.syncNodeMetadataFromTab(tab);
  }

  loadNode(node, url, { background = false } = {}) {
    const tab = this.ensureRuntime(node, { background });
    const browser = tab.linkedBrowser;
    const gBrowser = this.window.gBrowser;
    this.pendingNavigationByNodeId.set(node.id, {
      url,
      startedAt: Date.now()
    });
    this.prepareTabForManagedNavigation(tab, url);

    if (!background) {
      gBrowser.selectedTab = tab;
    }

    const targetUri = ServicesRef?.io?.newURI?.(url) ?? null;

    if (targetUri && !background && typeof gBrowser?.loadURI === "function") {
      gBrowser.loadURI(targetUri, {
        triggeringPrincipal: systemPrincipal()
      });
    } else if (targetUri && typeof browser?.loadURI === "function") {
      browser.loadURI(targetUri, {
        triggeringPrincipal: systemPrincipal()
      });
    } else if (typeof browser?.fixupAndLoadURIString === "function") {
      browser.fixupAndLoadURIString(url, {
        triggeringPrincipal: systemPrincipal()
      });
    }

    trace("load-node", {
      nodeId: node.id,
      url,
      background,
      seedTabReused: tab === this.seedTab
    });

    return tab;
  }

  selectNode(nodeId) {
    const tab = this.tabForNode(nodeId);

    if (tab) {
      this.window.gBrowser.selectedTab = tab;
      this.syncNodeMetadataFromTab(tab);
    }
  }

  prepareTabForManagedNavigation(tab, userTypedValue = "") {
    const browser = tab?.linkedBrowser;

    try {
      browser?.stop?.();
    } catch {}

    try {
      if (browser && "userTypedValue" in browser) {
        browser.userTypedValue = userTypedValue;
      }
    } catch {}
  }

  syncSelectedTabMetadata() {
    const tab = this.window.gBrowser?.selectedTab;

    if (tab) {
      this.syncNodeMetadataFromTab(tab);
    }
  }

  syncNodeMetadataFromTab(tab) {
    const nodeId = this.nodeIdForTab(tab);

    if (!nodeId) {
      return;
    }

    const browser = tab.linkedBrowser;
    const currentUrl = browser?.currentURI?.spec ?? null;
    const pendingNavigation = this.pendingNavigationByNodeId.get(nodeId) ?? null;
    const transientStartupUrl = isTransientStartupUrl(currentUrl) ? currentUrl : null;
    const crashed = Boolean(tab?.hasAttribute?.("crashed") || browser?.isCrashed || isCrashUrl(currentUrl));
    const shouldSuppressUrl = Boolean(transientStartupUrl || crashed);
    const runtimeState = crashed
      ? "crashed"
      : pendingNavigation
      ? shouldSuppressUrl
        ? "loading"
        : browser?.isLoadingDocument
          ? "loading"
          : "live"
      : shouldSuppressUrl
        ? "empty"
        : browser?.isLoadingDocument
          ? "loading"
          : "live";

    if (pendingNavigation && currentUrl && !shouldSuppressUrl) {
      this.pendingNavigationByNodeId.delete(nodeId);
      trace("commit-node", {
        nodeId,
        committedUrl: currentUrl,
        expectedUrl: pendingNavigation.url
      });
    } else if (pendingNavigation && transientStartupUrl) {
      trace("suppress-startup-url", {
        nodeId,
        currentUrl: transientStartupUrl,
        expectedUrl: pendingNavigation.url
      });
    }

    this.callbacks.onNodeMetaChanged?.(nodeId, {
      title: shouldSuppressUrl ? null : tab.label || browser?.contentTitle || "Untitled page",
      url: shouldSuppressUrl ? null : currentUrl,
      faviconUrl: shouldSuppressUrl ? null : this.window.gBrowser?.getIcon?.(tab) ?? null,
      canGoBack: browser?.canGoBack ?? false,
      canGoForward: browser?.canGoForward ?? false,
      runtimeState,
      errorMessage: crashed ? "Content process crashed" : null,
      pendingUrl: pendingNavigation?.url ?? null,
      transientStartupUrl
    });
  }

  handleTabOpen(event) {
    const tab = event.target;
    const eventDetail = event.detail ?? {};

    if (this.expectingOwnedTabOpen) {
      this.ownedTabs.add(tab);
      trace("owned-tab-open", {
        tabId: tab?.linkedPanel ?? "unknown"
      });
      return;
    }

    if (this.ownedTabs.has(tab)) {
      this.ownedTabs.delete(tab);
      return;
    }

    const relatedTab = relatedTabForForeignOpen(tab, eventDetail);
    const parentNodeId = relatedTab ? this.nodeIdForTab(relatedTab) : null;

    if (!parentNodeId) {
      trace("foreign-tab-ignored", {
        reason: "unowned-opener",
        hasOpenerTab: Boolean(tab?.openerTab),
        hasOwnerTab: Boolean(tab?.owner),
        background: tab !== this.window.gBrowser.selectedTab
      });
      return;
    }

    this.callbacks.onForeignTabOpen?.(tab, {
      background: tab !== this.window.gBrowser.selectedTab,
      parentNodeId
    });
    trace("foreign-tab-open", {
      background: tab !== this.window.gBrowser.selectedTab,
      parentNodeId
    });
  }

  handleTabSelect(event) {
    const tab = event.target;
    const nodeId = this.nodeIdForTab(tab);

    if (nodeId) {
      this.callbacks.onNodeSelected?.(nodeId);
      this.syncNodeMetadataFromTab(tab);
    }
  }

  handleTabClose(event) {
    const tab = event.target;
    const nodeId = this.nodeIdForTab(tab);

    if (this.seedTab === tab) {
      this.seedTab = null;
    }

    this.unregisterTab(tab);

    if (nodeId) {
      this.callbacks.onNodeRuntimeClosed?.(nodeId);
    }
  }

  handleTabAttrModified(event) {
    const tab = event.target;
    if (this.nodeIdForTab(tab)) {
      this.syncNodeMetadataFromTab(tab);
    }
  }
}
