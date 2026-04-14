let ServicesModule = null;

try {
  if (typeof ChromeUtils !== "undefined") {
    ServicesModule = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
  }
} catch {
  ServicesModule = null;
}

const ServicesRef = ServicesModule?.Services ?? globalThis.Services ?? null;
const TRANSIENT_AUTH_TOKEN_PATTERN =
  /(oauth|signin|sign-in|login|consent|checkpoint|identifier|selectaccount|authorize|accountchooser)/iu;
const POPUP_CHROME_TOKENS = new Set(["toolbar", "location", "menubar", "extrachrome"]);

function documentElementFor(documentRef) {
  return documentRef?.documentElement ?? null;
}

function getRootAttribute(documentRef, name) {
  return documentElementFor(documentRef)?.getAttribute?.(name) ?? "";
}

function hasRootAttribute(documentRef, name) {
  return documentElementFor(documentRef)?.hasAttribute?.(name) ?? false;
}

function chromehiddenTokens(documentRef) {
  return new Set(
    getRootAttribute(documentRef, "chromehidden")
      .split(/[\s,]+/u)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isBrowserChromeWindow(documentRef = globalThis.document ?? null) {
  const windowType = getRootAttribute(documentRef, "windowtype");
  return !windowType || windowType === "navigator:browser";
}

export function isPopupLikeBrowserWindow(
  windowRef = globalThis.window ?? null,
  documentRef = windowRef?.document ?? globalThis.document ?? null
) {
  const hiddenChrome = chromehiddenTokens(documentRef);

  if (windowRef?.toolbar?.visible === false) {
    return true;
  }

  if (windowRef?.locationbar?.visible === false) {
    return true;
  }

  if (windowRef?.menubar?.visible === false) {
    return true;
  }

  for (const token of POPUP_CHROME_TOKENS) {
    if (hiddenChrome.has(token)) {
      return true;
    }
  }

  return false;
}

export function describeNodelyShellEligibility(
  windowRef = globalThis.window ?? null,
  documentRef = windowRef?.document ?? globalThis.document ?? null
) {
  if (!isBrowserChromeWindow(documentRef)) {
    return {
      enabled: false,
      reason: "non-browser-window"
    };
  }

  if (hasRootAttribute(documentRef, "taskbartab")) {
    return {
      enabled: false,
      reason: "taskbar-tab"
    };
  }

  if (isPopupLikeBrowserWindow(windowRef, documentRef)) {
    return {
      enabled: false,
      reason: "popup-window"
    };
  }

  return {
    enabled: true,
    reason: "primary-window"
  };
}

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

export function classifyForeignNavigationTarget(url) {
  if (!url) {
    return "page";
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const haystack = `${host}${parsed.pathname}${parsed.search}${parsed.hash}`.toLowerCase();

    if (host === "accounts.google.com" || host.endsWith(".accounts.google.com")) {
      return "transient-auth";
    }

    if (host.endsWith(".linkedin.com") && TRANSIENT_AUTH_TOKEN_PATTERN.test(haystack)) {
      return "transient-auth";
    }

    if (TRANSIENT_AUTH_TOKEN_PATTERN.test(haystack)) {
      return "transient-auth";
    }

    return "page";
  } catch {
    return TRANSIENT_AUTH_TOKEN_PATTERN.test(String(url)) ? "transient-auth" : "page";
  }
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

function domWindowFromXulWindow(xulWindow) {
  try {
    return xulWindow?.docShell?.domWindow ?? null;
  } catch {}

  try {
    if (typeof Ci !== "undefined") {
      return xulWindow
        ?.QueryInterface?.(Ci.nsIInterfaceRequestor)
        ?.getInterface?.(Ci.nsIDOMWindow) ?? null;
    }
  } catch {}

  return null;
}

function tabForBrowser(gBrowser, browser) {
  return gBrowser?.getTabForBrowser?.(browser) ?? null;
}

function foreignOpenDetails(record, overrides = {}) {
  return {
    kind: record.kind,
    parentNodeId: record.parentNodeId,
    background: record.background === true,
    url: record.url ?? null,
    title: record.title ?? null,
    ...overrides
  };
}

export class NodeRuntimeManager {
  constructor(window, callbacks = {}) {
    this.window = window;
    this.callbacks = callbacks;
    this.tabByNodeId = new Map();
    this.nodeIdByTab = new WeakMap();
    this.ownedTabs = new WeakSet();
    this.intentionalClosingTabs = new WeakSet();
    this.seedTab = null;
    this.attached = false;
    this.pendingNavigationByNodeId = new Map();
    this.pendingForeignTabByTab = new Map();
    this.transientAuthTabByTab = new Map();
    this.pendingForeignWindowByWindow = new Map();
    this.transientAuthWindowByWindow = new Map();
    this.handleTabOpen = this.handleTabOpen.bind(this);
    this.handleTabSelect = this.handleTabSelect.bind(this);
    this.handleTabClose = this.handleTabClose.bind(this);
    this.handleTabAttrModified = this.handleTabAttrModified.bind(this);
    this.handleWindowOpen = this.handleWindowOpen.bind(this);
    this.handleWindowClose = this.handleWindowClose.bind(this);
    this.expectingOwnedTabOpen = false;
    this.windowMediatorListener = {
      onOpenWindow: this.handleWindowOpen,
      onCloseWindow: this.handleWindowClose,
      onWindowTitleChange() {}
    };
    this.progressListener = {
      onLocationChange: (browser, progress, request, location, flags) => {
        void progress;
        void request;
        void flags;
        this.handleManagedLocationChange(browser, location?.spec ?? browser?.currentURI?.spec ?? null);
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
    ServicesRef?.wm?.addListener?.(this.windowMediatorListener);
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
    this.intentionalClosingTabs = new WeakSet();
    this.pendingNavigationByNodeId.clear();
    this.pendingForeignTabByTab.clear();
    this.transientAuthTabByTab.clear();

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
    this.pendingForeignTabByTab.delete(tab);
    this.transientAuthTabByTab.delete(tab);
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
    this.pendingForeignTabByTab.delete(tab);
    this.transientAuthTabByTab.delete(tab);

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

  currentUrlForNode(nodeId) {
    const tab = this.tabForNode(nodeId);
    return tab?.linkedBrowser?.currentURI?.spec ?? null;
  }

  nodeIdForBrowser(browser) {
    const tab = tabForBrowser(this.window.gBrowser, browser);
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
    this.pendingNavigationByNodeId.set(node.id, {
      url,
      startedAt: Date.now()
    });
    this.prepareTabForManagedNavigation(tab, url);

    if (!background) {
      this.window.gBrowser.selectedTab = tab;
    }

    const targetUri = ServicesRef?.io?.newURI?.(url) ?? null;

    if (typeof browser?.fixupAndLoadURIString === "function") {
      browser.fixupAndLoadURIString(url, {
        triggeringPrincipal: systemPrincipal()
      });
    } else if (targetUri && typeof browser?.loadURI === "function") {
      browser.loadURI(targetUri, {
        triggeringPrincipal: systemPrincipal()
      });
    } else if (targetUri && !background && typeof this.window.gBrowser?.loadURI === "function") {
      this.window.gBrowser.loadURI(targetUri, {
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

  closeNodeRuntime(nodeId) {
    const tab = this.tabForNode(nodeId);

    if (!tab) {
      return false;
    }

    this.intentionalClosingTabs.add(tab);

    try {
      this.window.gBrowser?.removeTab?.(tab, {
        animate: false,
        skipPermitUnload: true
      });
      trace("close-runtime", {
        nodeId
      });
      return true;
    } catch {
      this.intentionalClosingTabs.delete(tab);
      return false;
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

  handleManagedLocationChange(browser, url) {
    const tab = tabForBrowser(this.window.gBrowser, browser);

    if (tab) {
      this.maybeResolvePendingForeignTab(tab, url);

      if (this.window.gBrowser?.selectedTab === tab) {
        this.syncNodeMetadataFromTab(tab);
      }

      return;
    }

    this.syncSelectedTabMetadata();
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

    const record = {
      kind: "tab",
      parentNodeId,
      background: tab !== this.window.gBrowser.selectedTab,
      tab,
      url: tab?.linkedBrowser?.currentURI?.spec ?? null,
      title: tab?.label ?? null
    };

    this.pendingForeignTabByTab.set(tab, record);
    this.callbacks.onForeignOpenPending?.(foreignOpenDetails(record));
    trace("foreign-tab-pending", foreignOpenDetails(record));
    this.maybeResolvePendingForeignTab(tab, record.url);
  }

  maybeResolvePendingForeignTab(tab, url) {
    const record = this.pendingForeignTabByTab.get(tab);

    if (!record || !url || isTransientStartupUrl(url)) {
      return;
    }

    record.background = tab !== this.window.gBrowser?.selectedTab;
    record.url = url;
    record.title = tab?.label ?? record.title ?? null;

    if (classifyForeignNavigationTarget(url) === "transient-auth") {
      this.pendingForeignTabByTab.delete(tab);
      this.transientAuthTabByTab.set(tab, record);
      this.callbacks.onTransientAuthChanged?.({
        open: true,
        ...foreignOpenDetails(record)
      });
      trace("transient-auth-open", foreignOpenDetails(record));
      return;
    }

    this.pendingForeignTabByTab.delete(tab);
    this.callbacks.onForeignTabOpen?.(tab, foreignOpenDetails(record));
    trace("foreign-tab-open", foreignOpenDetails(record));
  }

  handleTabSelect(event) {
    const tab = event.target;
    const nodeId = this.nodeIdForTab(tab);

    if (nodeId) {
      this.syncNodeMetadataFromTab(tab);
      this.callbacks.onNodeSelected?.(nodeId);
    }
  }

  handleTabClose(event) {
    const tab = event.target;
    const nodeId = this.nodeIdForTab(tab);
    const pendingRecord = this.pendingForeignTabByTab.get(tab) ?? null;
    const transientAuthRecord = this.transientAuthTabByTab.get(tab) ?? null;

    if (this.seedTab === tab) {
      this.seedTab = null;
    }

    this.unregisterTab(tab);

    if (transientAuthRecord) {
      this.callbacks.onTransientAuthChanged?.({
        open: false,
        ...foreignOpenDetails(transientAuthRecord)
      });
      trace("transient-auth-close", foreignOpenDetails(transientAuthRecord));
      return;
    }

    if (pendingRecord) {
      this.callbacks.onForeignOpenCancelled?.(foreignOpenDetails(pendingRecord));
      trace("foreign-tab-cancelled", foreignOpenDetails(pendingRecord));
      return;
    }

    if (nodeId) {
      if (this.intentionalClosingTabs.has(tab)) {
        this.intentionalClosingTabs.delete(tab);
        return;
      }

      this.callbacks.onNodeRuntimeClosed?.(nodeId);
    }
  }

  handleTabAttrModified(event) {
    const tab = event.target;
    if (this.nodeIdForTab(tab)) {
      this.syncNodeMetadataFromTab(tab);
    }
  }

  handleWindowOpen(xulWindow) {
    const windowRef = domWindowFromXulWindow(xulWindow);

    if (!windowRef || windowRef === this.window) {
      return;
    }

    const parentNodeId = this.nodeIdForTab(this.window.gBrowser?.selectedTab);

    if (!parentNodeId) {
      return;
    }

    const finalizeTracking = () => {
      if (windowRef.closed || !windowRef.gBrowser || windowRef.opener !== this.window) {
        return;
      }

      this.trackPopupWindow(windowRef, parentNodeId);
    };

    if (windowRef.document?.readyState === "complete") {
      finalizeTracking();
      return;
    }

    windowRef.addEventListener("load", finalizeTracking, { once: true });
  }

  handleWindowClose(xulWindow) {
    const windowRef = domWindowFromXulWindow(xulWindow);

    if (!windowRef) {
      return;
    }

    this.finishPopupWindowTracking(windowRef);
  }

  trackPopupWindow(windowRef, parentNodeId) {
    if (
      this.pendingForeignWindowByWindow.has(windowRef) ||
      this.transientAuthWindowByWindow.has(windowRef)
    ) {
      return;
    }

    const record = {
      kind: "window",
      parentNodeId,
      background: false,
      windowRef,
      url: windowRef.gBrowser?.selectedBrowser?.currentURI?.spec ?? null,
      title: windowRef.document?.title ?? null,
      progressListener: null
    };
    const progressListener = {
      onLocationChange: (browser, progress, request, location, flags) => {
        void progress;
        void request;
        void flags;

        if (browser !== windowRef.gBrowser?.selectedBrowser) {
          return;
        }

        this.maybeResolvePendingPopupWindow(windowRef, location?.spec ?? browser?.currentURI?.spec ?? null);
      },
      onStateChange: () => {},
      onProgressChange: () => {},
      onStatusChange: () => {},
      onSecurityChange: () => {},
      onContentBlockingEvent: () => {}
    };

    record.progressListener = progressListener;
    this.pendingForeignWindowByWindow.set(windowRef, record);
    this.callbacks.onForeignOpenPending?.(foreignOpenDetails(record));
    trace("foreign-window-pending", foreignOpenDetails(record));
    windowRef.gBrowser?.addTabsProgressListener?.(progressListener);
    windowRef.addEventListener(
      "unload",
      () => {
        this.finishPopupWindowTracking(windowRef);
      },
      { once: true }
    );
    this.maybeResolvePendingPopupWindow(windowRef, record.url);
  }

  maybeResolvePendingPopupWindow(windowRef, url) {
    const record = this.pendingForeignWindowByWindow.get(windowRef);

    if (!record || !url || isTransientStartupUrl(url)) {
      return;
    }

    record.url = url;
    record.title = windowRef.document?.title ?? null;

    if (classifyForeignNavigationTarget(url) !== "transient-auth") {
      return;
    }

    this.pendingForeignWindowByWindow.delete(windowRef);
    this.transientAuthWindowByWindow.set(windowRef, record);
    this.callbacks.onTransientAuthChanged?.({
      open: true,
      ...foreignOpenDetails(record)
    });
    trace("transient-auth-open", foreignOpenDetails(record));
  }

  finishPopupWindowTracking(windowRef) {
    const pendingRecord = this.pendingForeignWindowByWindow.get(windowRef) ?? null;
    const transientAuthRecord = this.transientAuthWindowByWindow.get(windowRef) ?? null;
    const record = transientAuthRecord ?? pendingRecord;

    if (!record) {
      return;
    }

    try {
      windowRef.gBrowser?.removeTabsProgressListener?.(record.progressListener);
    } catch {}

    this.pendingForeignWindowByWindow.delete(windowRef);
    this.transientAuthWindowByWindow.delete(windowRef);

    if (transientAuthRecord) {
      this.callbacks.onTransientAuthChanged?.({
        open: false,
        ...foreignOpenDetails(transientAuthRecord)
      });
      trace("transient-auth-close", foreignOpenDetails(transientAuthRecord));
      return;
    }

    this.callbacks.onForeignOpenCancelled?.(foreignOpenDetails(pendingRecord));
    trace("foreign-window-cancelled", foreignOpenDetails(pendingRecord));
  }
}
