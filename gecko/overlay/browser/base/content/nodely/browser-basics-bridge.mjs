const AUTH_PROMPT_EVENT = "nodely-auth-prompt-state";
const EXTERNAL_PROTOCOL_EVENT = "nodely-external-protocol-state";
const SESSION_CLOSED_OBJECTS_TOPIC = "sessionstore-closed-objects-changed";
const SESSION_LAST_CLEARED_TOPIC = "sessionstore-last-session-cleared";
const SESSION_LAST_ENABLED_TOPIC = "sessionstore-last-session-re-enable";

const lazy = {};
const ServicesRef = globalThis.Services ?? null;
let uploadActorRegistered = false;
let promptParentPatched = false;
let contentDispatchChooserPatched = false;

try {
  if (typeof ChromeUtils !== "undefined") {
    ChromeUtils.defineESModuleGetters(lazy, {
      Downloads: "resource://gre/modules/Downloads.sys.mjs",
      DownloadsCommon: "resource:///modules/DownloadsCommon.sys.mjs",
      FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
      SitePermissions: "resource:///modules/SitePermissions.sys.mjs",
      SessionStoreModule:
        "resource:///modules/sessionstore/SessionStore.sys.mjs",
    });
  }
} catch {}

function safeSpec(value) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.spec ?? null;
}

function principalOrigin(principal) {
  if (!principal) {
    return null;
  }

  try {
    return principal.originNoSuffix ?? principal.origin ?? null;
  } catch {}

  try {
    return principal.URI?.displaySpec ?? principal.URI?.spec ?? null;
  } catch {}

  return null;
}

function fileNameFromPathOrUrl(filePath, sourceUrl) {
  if (filePath) {
    if (typeof PathUtils !== "undefined" && typeof PathUtils.filename === "function") {
      return PathUtils.filename(filePath);
    }

    const segments = filePath.split(/[\\/]/u);
    return segments[segments.length - 1] || filePath;
  }

  if (!sourceUrl) {
    return null;
  }

  try {
    const url = new URL(sourceUrl);
    const leaf = url.pathname.split("/").pop();
    return leaf || url.hostname;
  } catch {
    return sourceUrl;
  }
}

function downloadTransferId(download) {
  return [
    download.target?.path ?? "",
    download.source?.originalUrl ?? download.source?.url ?? "",
    safeSpec(download.source?.referrerInfo?.originalReferrer),
    download.startTime instanceof Date ? download.startTime.toISOString() : "",
  ].join("::");
}

function downloadStatus(download) {
  if (download.error) {
    return "failed";
  }

  if (download.canceled) {
    return "canceled";
  }

  if (download.succeeded) {
    return "complete";
  }

  if (download.stopped) {
    return "paused";
  }

  return "in-progress";
}

function snapshotDownload(download) {
  const sourceUrl = download.source?.originalUrl ?? download.source?.url ?? null;
  const referrerUrl = safeSpec(download.source?.referrerInfo?.originalReferrer);
  const filePath = download.target?.path ?? null;

  return {
    transferId: downloadTransferId(download),
    fileName: fileNameFromPathOrUrl(filePath, sourceUrl),
    filePath,
    sourceUrl,
    referrerUrl,
    pageUrl: referrerUrl ?? sourceUrl,
    mimeType: download.contentType ?? null,
    totalBytes: Number.isFinite(download.totalBytes) ? download.totalBytes : null,
    receivedBytes: Number.isFinite(download.currentBytes) ? download.currentBytes : null,
    status: downloadStatus(download),
    succeeded: Boolean(download.succeeded),
    removed: false,
  };
}

function summarizePermissionsForBrowser(browser) {
  if (!browser || !lazy.SitePermissions?.getAllForBrowser) {
    return {
      activeCount: 0,
      blockedCount: 0,
      labels: [],
    };
  }

  const labels = [];
  let blockedCount = 0;

  for (const permission of lazy.SitePermissions.getAllForBrowser(browser)) {
    if (
      permission.state === lazy.SitePermissions.UNKNOWN ||
      permission.state === lazy.SitePermissions.PROMPT
    ) {
      continue;
    }

    labels.push(permission.id);

    if (
      permission.state === lazy.SitePermissions.BLOCK ||
      permission.state === lazy.SitePermissions.AUTOPLAY_BLOCKED_ALL
    ) {
      blockedCount += 1;
    }
  }

  const popupBlockerCount = browser.popupBlocker?.getBlockedPopupCount?.() ?? 0;

  if (popupBlockerCount > 0) {
    labels.push("popup");
    blockedCount += 1;
  }

  return {
    activeCount: labels.length,
    blockedCount,
    labels,
  };
}

function registerUploadActor() {
  if (uploadActorRegistered || typeof ChromeUtils?.registerWindowActor !== "function") {
    return;
  }

  ChromeUtils.registerWindowActor("NodelyUpload", {
    parent: {
      esModuleURI: "chrome://browser/content/nodely/nodely-upload-parent.mjs",
    },
    child: {
      esModuleURI: "chrome://browser/content/nodely/nodely-upload-child.mjs",
      events: {
        change: {
          capture: true,
        },
      },
    },
    allFrames: true,
  });
  uploadActorRegistered = true;
}

function dispatchPromptEvent(windowRef, name, detail) {
  if (!windowRef?.dispatchEvent || typeof CustomEvent === "undefined") {
    return;
  }

  windowRef.dispatchEvent(new CustomEvent(name, { detail }));
}

function isAuthPromptArgs(args) {
  const promptType = String(args?.promptType ?? "").toLowerCase();
  return Boolean(
    args?.channel?.URI ||
      args?.isTopLevelCrossDomainAuth ||
      promptType.includes("password") ||
      promptType.includes("user")
  );
}

function patchPromptParent() {
  if (promptParentPatched || typeof ChromeUtils === "undefined") {
    return;
  }

  try {
    const { PromptParent } = ChromeUtils.importESModule(
      "resource:///actors/PromptParent.sys.mjs"
    );
    const originalOpenPromptWithTabDialogBox =
      PromptParent.prototype.openPromptWithTabDialogBox;

    PromptParent.prototype.openPromptWithTabDialogBox = async function (...args) {
      const promptArgs = args[0] ?? {};
      const browser = this.browsingContext?.top?.embedderElement ?? null;
      const windowRef =
        browser?.ownerGlobal ?? this.browsingContext?.topChromeWindow ?? null;
      const isAuthPrompt = isAuthPromptArgs(promptArgs);

      if (isAuthPrompt && windowRef) {
        dispatchPromptEvent(windowRef, AUTH_PROMPT_EVENT, {
          open: true,
          browser,
          promptType: promptArgs.promptType ?? null,
          message: promptArgs.text ?? null,
          title: promptArgs.title ?? null,
          requestingUrl:
            safeSpec(promptArgs.channel?.URI) ?? browser?.currentURI?.spec ?? null,
          principalOrigin: principalOrigin(promptArgs.promptPrincipal),
        });
      }

      try {
        return await originalOpenPromptWithTabDialogBox.apply(this, args);
      } finally {
        if (isAuthPrompt && windowRef) {
          dispatchPromptEvent(windowRef, AUTH_PROMPT_EVENT, {
            open: false,
            browser,
            promptType: promptArgs.promptType ?? null,
            requestingUrl:
              safeSpec(promptArgs.channel?.URI) ?? browser?.currentURI?.spec ?? null,
          });
        }
      }
    };

    promptParentPatched = true;
  } catch {}
}

function patchContentDispatchChooser() {
  if (contentDispatchChooserPatched || typeof ChromeUtils === "undefined") {
    return;
  }

  try {
    const { nsContentDispatchChooser } = ChromeUtils.importESModule(
      "resource://gre/modules/ContentDispatchChooser.sys.mjs"
    );
    const originalPrompt = nsContentDispatchChooser.prototype._prompt;

    nsContentDispatchChooser.prototype._prompt = async function (...args) {
      const [handler, principal, hasPermission, browsingContext, uri] = args;
      const browser = browsingContext?.topFrameElement ?? null;
      const windowRef =
        browsingContext?.topChromeWindow ??
        browser?.ownerGlobal ??
        ServicesRef?.wm?.getMostRecentWindow?.("navigator:browser") ??
        null;

      if (windowRef) {
        dispatchPromptEvent(windowRef, EXTERNAL_PROTOCOL_EVENT, {
          open: true,
          browser,
          uri: safeSpec(uri),
          scheme: uri?.scheme ?? null,
          handlerName: this._getHandlerName?.(handler) ?? null,
          principalOrigin: principalOrigin(principal),
          requiresPermission: !hasPermission,
        });
      }

      try {
        return await originalPrompt.apply(this, args);
      } finally {
        if (windowRef) {
          dispatchPromptEvent(windowRef, EXTERNAL_PROTOCOL_EVENT, {
            open: false,
            browser,
            uri: safeSpec(uri),
            scheme: uri?.scheme ?? null,
          });
        }
      }
    };

    contentDispatchChooserPatched = true;
  } catch {}
}

function selectedHistoryEntry(stateLike) {
  const state = stateLike?.state ?? stateLike ?? null;
  const entries = state?.entries;

  if (!Array.isArray(entries) || !entries.length) {
    return null;
  }

  const rawIndex =
    Number.isFinite(state?.index) && state.index > 0 ? state.index - 1 : entries.length - 1;
  return entries[Math.max(0, Math.min(entries.length - 1, rawIndex))] ?? null;
}

function snapshotClosedTab(tabData, index) {
  const entry = selectedHistoryEntry(tabData);
  return {
    id: String(tabData?.closedId ?? `tab-${index}`),
    closedId: tabData?.closedId ?? null,
    sourceClosedId: tabData?.sourceClosedId ?? null,
    title: tabData?.title ?? entry?.title ?? entry?.url ?? "Untitled page",
    url: entry?.url ?? null,
    closedAt: tabData?.closedAt ?? null,
  };
}

function snapshotClosedWindow(windowData, index) {
  const tabs = Array.isArray(windowData?.tabs)
    ? windowData.tabs
        .map((tabState, tabIndex) => {
          const entry = selectedHistoryEntry(tabState);
          if (!entry?.url) {
            return null;
          }

          return {
            id: `${windowData?.closedId ?? "window"}-tab-${tabIndex}`,
            title: entry.title ?? entry.url,
            url: entry.url,
          };
        })
        .filter(Boolean)
    : [];

  return {
    id: String(windowData?.closedId ?? `window-${index}`),
    closedId: windowData?.closedId ?? null,
    title: tabs[0]?.title ?? `Closed window ${index + 1}`,
    url: tabs[0]?.url ?? null,
    tabCount: tabs.length,
    tabs,
    closedAt: windowData?.closedAt ?? null,
  };
}

function snapshotLastSessionWindow(windowState, index) {
  const tabs = Array.isArray(windowState?.tabs)
    ? windowState.tabs
        .map((tabState, tabIndex) => {
          const entry = selectedHistoryEntry(tabState);
          if (!entry?.url) {
            return null;
          }

          return {
            id: `last-window-${index}-tab-${tabIndex}`,
            title: entry.title ?? entry.url,
            url: entry.url,
          };
        })
        .filter(Boolean)
    : [];

  return {
    id: `last-window-${index}`,
    title: tabs[0]?.title ?? `Last session window ${index + 1}`,
    url: tabs[0]?.url ?? null,
    tabCount: tabs.length,
    tabs,
  };
}

export class BrowserBasicsBridge {
  constructor(window, { runtimeManager = null, callbacks = {} } = {}) {
    this.window = window;
    this.runtimeManager = runtimeManager;
    this.callbacks = callbacks;
    this.attached = false;
    this.downloadObservers = [];
    this.seenDownloadIds = new Set();
    this.lastFindQuery = "";
    this.handleUploadObserved = this.handleUploadObserved.bind(this);
    this.handleSessionStoreChanged = this.handleSessionStoreChanged.bind(this);
    this.handleAuthPromptState = this.handleAuthPromptState.bind(this);
    this.handleExternalProtocolState = this.handleExternalProtocolState.bind(this);
    this.handleBrowserCrashed = this.handleBrowserCrashed.bind(this);
  }

  async attach() {
    if (this.attached) {
      return;
    }

    this.attached = true;
    registerUploadActor();
    patchPromptParent();
    patchContentDispatchChooser();

    this.window.addEventListener("nodely-upload-observed", this.handleUploadObserved);
    this.window.addEventListener(AUTH_PROMPT_EVENT, this.handleAuthPromptState);
    this.window.addEventListener(
      EXTERNAL_PROTOCOL_EVENT,
      this.handleExternalProtocolState
    );
    this.window.gBrowser?.tabContainer?.addEventListener(
      "oop-browser-crashed",
      this.handleBrowserCrashed
    );

    if (typeof ServicesRef?.obs?.addObserver === "function") {
      ServicesRef.obs.addObserver(
        this.handleSessionStoreChanged,
        SESSION_CLOSED_OBJECTS_TOPIC
      );
      ServicesRef.obs.addObserver(
        this.handleSessionStoreChanged,
        SESSION_LAST_CLEARED_TOPIC
      );
      ServicesRef.obs.addObserver(
        this.handleSessionStoreChanged,
        SESSION_LAST_ENABLED_TOPIC
      );
    }

    await Promise.allSettled([
      this.observeDownloadList(lazy.Downloads?.PUBLIC),
      this.observeDownloadList(lazy.Downloads?.PRIVATE),
    ]);
    this.handleSessionStoreChanged();
  }

  async observeDownloadList(type) {
    if (type == null || !lazy.Downloads?.getList) {
      return;
    }

    const list = await lazy.Downloads.getList(type);
    const existingDownloads = typeof list.getAll === "function" ? await list.getAll() : [];

    for (const download of existingDownloads) {
      this.seenDownloadIds.add(downloadTransferId(download));
    }

    const view = {
      onDownloadAdded: download => {
        const transferId = downloadTransferId(download);

        if (this.seenDownloadIds.has(transferId)) {
          return;
        }

        this.seenDownloadIds.add(transferId);
        this.callbacks.onDownloadObserved?.(snapshotDownload(download));
      },
      onDownloadChanged: download => {
        const transferId = downloadTransferId(download);
        this.seenDownloadIds.add(transferId);
        this.callbacks.onDownloadObserved?.(snapshotDownload(download));
      },
      onDownloadRemoved: download => {
        this.callbacks.onDownloadObserved?.({
          ...snapshotDownload(download),
          removed: true,
          status: "removed",
        });
      },
    };

    await list.addView(view);
    this.downloadObservers.push({ list, view });
  }

  handleUploadObserved(event) {
    const detail = event.detail ?? {};
    const browser = detail.browser ?? null;
    const nodeId = detail.nodeId ?? this.runtimeManager?.nodeIdForBrowser?.(browser) ?? null;

    this.callbacks.onUploadObserved?.({
      ...detail,
      nodeId,
    });
  }

  handleAuthPromptState(event) {
    const detail = event.detail ?? {};
    const browser = detail.browser ?? null;
    const nodeId = this.runtimeManager?.nodeIdForBrowser?.(browser) ?? null;

    this.callbacks.onAuthPromptChanged?.({
      ...detail,
      nodeId,
      title:
        detail.title ??
        detail.message ??
        detail.requestingUrl ??
        detail.principalOrigin ??
        "Authentication required",
    });
  }

  handleExternalProtocolState(event) {
    const detail = event.detail ?? {};
    const browser = detail.browser ?? null;
    const nodeId = this.runtimeManager?.nodeIdForBrowser?.(browser) ?? null;

    this.callbacks.onExternalProtocolChanged?.({
      ...detail,
      nodeId,
      title:
        detail.handlerName ??
        detail.scheme?.toUpperCase?.() ??
        detail.uri ??
        "External protocol request",
    });
  }

  handleBrowserCrashed(event) {
    const browser = event.target ?? null;
    const nodeId = this.runtimeManager?.nodeIdForBrowser?.(browser) ?? null;

    this.callbacks.onBrowserCrashed?.({
      nodeId,
      browser,
      url: browser?.currentURI?.spec ?? null,
      title: browser?.contentTitle ?? null,
      crashedAt: Date.now(),
    });
  }

  handleSessionStoreChanged() {
    this.callbacks.onSessionRecoveryChanged?.(this.getSessionRecoveryState());
  }

  pageCommand(command) {
    const browser = this.window.gBrowser?.selectedBrowser;

    switch (command) {
      case "back":
        if (browser?.canGoBack) {
          browser.goBack();
        }
        break;
      case "forward":
        if (browser?.canGoForward) {
          browser.goForward();
        }
        break;
      case "reload":
      default:
        browser?.reload?.();
        break;
    }
  }

  async ensureFindBar() {
    try {
      if (!this.window.gFindBarInitialized) {
        await this.window.gFindBarPromise;
      }
    } catch {}

    if (this.window.gFindBar) {
      return this.window.gFindBar;
    }

    try {
      this.window.gLazyFindCommand?.("onFindCommand");
      await this.window.gFindBarPromise;
      return this.window.gFindBar ?? null;
    } catch {
      return null;
    }
  }

  async findInPage(query = this.lastFindQuery) {
    const findBar = await this.ensureFindBar();

    if (!findBar) {
      return false;
    }

    await findBar.onFindCommand?.();
    this.lastFindQuery = String(query ?? "");
    findBar._findField.value = this.lastFindQuery;

    if (this.lastFindQuery) {
      findBar.onFindAgainCommand?.(false);
    }

    return true;
  }

  async findAgain(findPrevious = false) {
    const findBar = await this.ensureFindBar();

    if (!findBar) {
      return false;
    }

    findBar.onFindAgainCommand?.(findPrevious);
    return true;
  }

  async closeFind() {
    const findBar = await this.ensureFindBar();

    if (!findBar) {
      return false;
    }

    findBar.close?.();
    return true;
  }

  getFindQuery() {
    return this.window.gFindBar?._findField?.value ?? this.lastFindQuery ?? "";
  }

  showDownloads() {
    this.window.document.getElementById("Tools:Downloads")?.doCommand?.();
  }

  printPage() {
    this.window.goDoCommand?.("cmd_print");
  }

  previewPrint() {
    this.window.goDoCommand?.("cmd_printPreviewToggle");
  }

  toggleDevTools() {
    this.window.document.getElementById("menu_devToolbox")?.doCommand?.();
  }

  getPermissionSummary(browser = this.window.gBrowser?.selectedBrowser) {
    return summarizePermissionsForBrowser(browser);
  }

  showPermissions(anchorNode) {
    const permissionPanel = this.window.gPermissionPanel;

    if (!permissionPanel) {
      return;
    }

    permissionPanel.setAnchor(anchorNode, "bottomright topright");
    permissionPanel.openPopup();
  }

  openLocalFile(filePath) {
    if (!filePath || !lazy.FileUtils?.File) {
      return false;
    }

    try {
      new lazy.FileUtils.File(filePath).launch();
      return true;
    } catch {
      return false;
    }
  }

  revealLocalFile(filePath) {
    if (!filePath || !lazy.FileUtils?.File) {
      return false;
    }

    try {
      const file = new lazy.FileUtils.File(filePath);
      lazy.DownloadsCommon?.showDownloadedFile?.(file);
      return true;
    } catch {
      return false;
    }
  }

  getSessionRecoveryState() {
    const sessionStore = lazy.SessionStoreModule?.SessionStore ?? null;
    const lastSession = lazy.SessionStoreModule?._LastSession ?? null;
    const closedTabs = sessionStore?.getClosedTabDataForWindow
      ? sessionStore.getClosedTabDataForWindow(this.window).map(snapshotClosedTab)
      : [];
    const closedWindows = sessionStore?.getClosedWindowData
      ? sessionStore.getClosedWindowData().map(snapshotClosedWindow)
      : [];
    const lastSessionWindows = Array.isArray(lastSession?.getState?.()?.windows)
      ? lastSession.getState().windows.map(snapshotLastSessionWindow)
      : [];

    return {
      canRestoreLastSession: Boolean(
        sessionStore?.canRestoreLastSession && lastSessionWindows.length
      ),
      closedTabs,
      closedWindows,
      lastSessionWindows,
    };
  }

  forgetClosedTab(closedId, sourceClosedId = null) {
    const sessionStore = lazy.SessionStoreModule?.SessionStore ?? null;

    if (!sessionStore?.forgetClosedTabById || closedId == null) {
      return false;
    }

    try {
      sessionStore.forgetClosedTabById(
        closedId,
        sourceClosedId != null
          ? { sourceClosedId }
          : this.window
      );
      this.handleSessionStoreChanged();
      return true;
    } catch {
      return false;
    }
  }

  forgetClosedWindow(closedId) {
    const sessionStore = lazy.SessionStoreModule?.SessionStore ?? null;

    if (!sessionStore?.forgetClosedWindowById || closedId == null) {
      return false;
    }

    try {
      sessionStore.forgetClosedWindowById(closedId);
      this.handleSessionStoreChanged();
      return true;
    } catch {
      return false;
    }
  }

  clearLastSession() {
    const lastSession = lazy.SessionStoreModule?._LastSession ?? null;

    if (!lastSession?.clear) {
      return false;
    }

    try {
      lastSession.clear();
      this.handleSessionStoreChanged();
      return true;
    } catch {
      return false;
    }
  }
}
