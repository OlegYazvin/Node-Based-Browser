import {
  buildCompatExtensionFilePatches,
  buildChromeStoreCrxDownloadUrl,
  compareVersionStrings,
  createCompatExtensionRecord,
  getCompatRecipe,
  normalizeCompatExtensionsState,
  stripCrxHeader,
  transformChromeManifestForRecipe
} from "./chrome-extension-compat.mjs";

const AUTH_PROMPT_EVENT = "nodely-auth-prompt-state";
const EXTERNAL_PROTOCOL_EVENT = "nodely-external-protocol-state";
const SESSION_CLOSED_OBJECTS_TOPIC = "sessionstore-closed-objects-changed";
const SESSION_LAST_CLEARED_TOPIC = "sessionstore-last-session-cleared";
const SESSION_LAST_ENABLED_TOPIC = "sessionstore-last-session-re-enable";
const MIRRORED_PERMISSION_NOTIFICATION_IDS = ["webRTC-shareDevices", "persistent-storage"];

const lazy = {};
const ServicesRef = globalThis.Services ?? null;
let uploadActorRegistered = false;
let promptParentPatched = false;
let contentDispatchChooserPatched = false;

try {
  if (typeof ChromeUtils !== "undefined") {
    ChromeUtils.defineESModuleGetters(lazy, {
      AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
      Downloads: "resource://gre/modules/Downloads.sys.mjs",
      DownloadsCommon: "resource:///modules/DownloadsCommon.sys.mjs",
      FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
      SitePermissions: "resource:///modules/SitePermissions.sys.mjs",
      SessionStoreModule:
        "resource:///modules/sessionstore/SessionStore.sys.mjs",
    });
  }
} catch {}

const ArrayBufferInputStream =
  typeof Components !== "undefined"
    ? Components.Constructor(
        "@mozilla.org/io/arraybuffer-input-stream;1",
        "nsIArrayBufferInputStream",
        "setData"
      )
    : null;
const BinaryInputStream =
  typeof Components !== "undefined"
    ? Components.Constructor(
        "@mozilla.org/binaryinputstream;1",
        "nsIBinaryInputStream",
        "setInputStream"
      )
    : null;

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

  try {
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
  } catch (error) {
    const message = String(error?.message ?? error ?? "");

    if (error?.name === "NotSupportedError" || /already registered/iu.test(message)) {
      uploadActorRegistered = true;
      return;
    }

    console.error?.("[nodely] registerUploadActor", error);
  }
}

function dispatchPromptEvent(windowRef, name, detail) {
  if (!windowRef?.dispatchEvent || typeof CustomEvent === "undefined") {
    return;
  }

  windowRef.dispatchEvent(new CustomEvent(name, { detail }));
}

function formatPermissionPromptBody(notification, browser) {
  const siteName =
    notification?.options?.name ??
    browser?.contentPrincipal?.siteOriginNoSuffix ??
    principalOrigin(browser?.contentPrincipal) ??
    safeSpec(browser?.currentURI) ??
    "this site";
  const rawMessage = String(notification?.message ?? "").trim();

  if (rawMessage) {
    return rawMessage.replace("<>", siteName);
  }

  return `Allow ${siteName} to store data in persistent storage?`;
}

function permissionPromptKindForNotificationId(notificationId) {
  switch (notificationId) {
    case "webRTC-shareDevices":
      return "media-devices";
    case "persistent-storage":
      return "persistent-storage";
    default:
      return "permission";
  }
}

function formatMediaPermissionPromptTitle(notification) {
  const promptDetails = `${notification?.anchorID ?? ""} ${notification?.message ?? ""}`.toLowerCase();
  const hasCamera = promptDetails.includes("camera");
  const hasMicrophone = promptDetails.includes("microphone");

  if (promptDetails.includes("screen")) {
    return hasMicrophone ? "Screen and Microphone Request" : "Screen Sharing Request";
  }

  if (promptDetails.includes("speaker") || promptDetails.includes("audio output")) {
    return "Speaker Request";
  }

  if (hasCamera && hasMicrophone) {
    return "Camera and Microphone Request";
  }

  if (hasCamera) {
    return "Camera Request";
  }

  if (hasMicrophone) {
    return "Microphone Request";
  }

  return "Media Device Request";
}

function shouldHideNativePermissionPrompt(notification) {
  if (!notification) {
    return false;
  }

  // WebRTC permission requests depend on the live doorhanger remaining open so
  // Gecko can keep its device selectors and allow flow intact.
  return notification.id !== "webRTC-shareDevices";
}

function snapshotPermissionPrompt(notification, browser, nodeId = null) {
  if (!notification || !MIRRORED_PERMISSION_NOTIFICATION_IDS.includes(notification.id)) {
    return null;
  }

  const requestingUrl = safeSpec(browser?.currentURI) ?? null;
  const rawMessage = String(notification?.message ?? "").trim();

  if (notification.id === "webRTC-shareDevices") {
    return {
      open: true,
      kind: permissionPromptKindForNotificationId(notification.id),
      notificationId: notification.id,
      nodeId,
      requestingUrl,
      title: formatMediaPermissionPromptTitle(notification),
      body:
        rawMessage ||
        `Allow ${notification?.options?.name ?? requestingUrl ?? "this site"} to use media devices?`,
      allowLabel: notification.mainAction?.label ?? "Allow",
      blockLabel: notification.secondaryActions?.[0]?.label ?? null
    };
  }

  return {
    open: true,
    kind: permissionPromptKindForNotificationId(notification.id),
    notificationId: notification.id,
    nodeId,
    requestingUrl,
    title: notification.options?.name ?? browser?.contentTitle ?? "Persistent Storage Request",
    body: formatPermissionPromptBody(notification, browser),
    allowLabel: notification.mainAction?.label ?? "Allow",
    blockLabel: notification.secondaryActions?.[0]?.label ?? "Block"
  };
}

function addonManagerRef() {
  return lazy.AddonManager ?? globalThis.AddonManager ?? null;
}

function canUseProfileStorage() {
  return (
    typeof IOUtils !== "undefined" &&
    typeof PathUtils !== "undefined" &&
    typeof PathUtils.profileDir === "string"
  );
}

function compatExtensionsRootPath() {
  return canUseProfileStorage()
    ? PathUtils.join(PathUtils.profileDir, "nodely-compat-extensions")
    : null;
}

function compatPackagesRootPath() {
  const rootPath = compatExtensionsRootPath();
  return rootPath ? PathUtils.join(rootPath, "packages") : null;
}

function compatWorkRootPath() {
  const rootPath = compatExtensionsRootPath();
  return rootPath ? PathUtils.join(rootPath, "work") : null;
}

function sanitizePathSegment(value, fallback = "item") {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized || fallback;
}

function nsFileForPath(filePath) {
  if (!filePath || typeof Cc === "undefined" || typeof Ci === "undefined") {
    return null;
  }

  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(filePath);
  return file;
}

async function ensureDirectory(directoryPath) {
  if (directoryPath && canUseProfileStorage()) {
    await IOUtils.makeDirectory(directoryPath, {
      createAncestors: true,
      ignoreExisting: true
    });
  }
}

async function removePath(path, { recursive = false } = {}) {
  if (!path || !canUseProfileStorage()) {
    return;
  }

  await IOUtils.remove(path, {
    ignoreAbsent: true,
    recursive
  });
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function encodeUtf8(value) {
  return new TextEncoder().encode(value);
}

function readInputStreamBytes(inputStream) {
  if (!BinaryInputStream || !inputStream) {
    return new Uint8Array();
  }

  const stream = new BinaryInputStream(inputStream);
  const available = inputStream.available?.() ?? 0;
  const byteArray = available > 0 ? stream.readByteArray(available) : [];
  return Uint8Array.from(byteArray);
}

function zipEntryNames(zipReader) {
  const entries = [];

  for (const entryName of zipReader.findEntries(null)) {
    entries.push(entryName);
  }

  return entries.sort();
}

async function readZipEntryBytes(zipPath, entryName) {
  const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  zipReader.open(nsFileForPath(zipPath));

  try {
    const inputStream = zipReader.getInputStream(entryName);

    try {
      return readInputStreamBytes(inputStream);
    } finally {
      inputStream.close();
    }
  } finally {
    zipReader.close();
  }
}

async function readZipManifest(zipPath) {
  return JSON.parse(decodeUtf8(await readZipEntryBytes(zipPath, "manifest.json")));
}

async function extractZipToDirectory(zipPath, directoryPath) {
  await ensureDirectory(directoryPath);
  const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  zipReader.open(nsFileForPath(zipPath));

  try {
    for (const entryName of zipEntryNames(zipReader)) {
      const entry = zipReader.getEntry(entryName);
      const targetPath = PathUtils.join(directoryPath, ...entryName.split("/"));

      if (entry.isDirectory) {
        await ensureDirectory(targetPath);
        continue;
      }

      await ensureDirectory(PathUtils.parent(targetPath));
      const inputStream = zipReader.getInputStream(entryName);

      try {
        await IOUtils.write(targetPath, readInputStreamBytes(inputStream));
      } finally {
        inputStream.close();
      }
    }
  } finally {
    zipReader.close();
  }
}

function collectDirectoryFiles(directoryFile, rootPath, files = []) {
  if (!directoryFile?.exists?.()) {
    return files;
  }

  if (directoryFile.isFile()) {
    const relativePath = directoryFile.path
      .slice(rootPath.length + 1)
      .replaceAll("\\", "/");
    files.push({
      relativePath,
      file: directoryFile
    });
    return files;
  }

  for (const entry of directoryFile.directoryEntries) {
    collectDirectoryFiles(entry.QueryInterface(Ci.nsIFile), rootPath, files);
  }

  return files;
}

async function zipDirectoryToFile(directoryPath, targetZipPath) {
  await ensureDirectory(PathUtils.parent(targetZipPath));
  const directoryFile = nsFileForPath(directoryPath);
  const zipWriter = Cc["@mozilla.org/zipwriter;1"].createInstance(Ci.nsIZipWriter);
  zipWriter.open(
    nsFileForPath(targetZipPath),
    lazy.FileUtils.MODE_RDWR | lazy.FileUtils.MODE_CREATE | lazy.FileUtils.MODE_TRUNCATE
  );

  try {
    const files = collectDirectoryFiles(directoryFile, directoryPath).sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    );

    files.forEach(({ relativePath, file }) => {
      zipWriter.addEntryFile(
        relativePath,
        Ci.nsIZipWriter.COMPRESSION_DEFAULT,
        file,
        false
      );
    });
  } finally {
    zipWriter.close();
  }
}

function installAddonFromFile(filePath) {
  return addonManagerRef()?.getInstallForFile?.(nsFileForPath(filePath)) ?? null;
}

async function finalizeAddonInstall(install) {
  if (!install) {
    throw new Error("Nodely could not prepare the compat extension install.");
  }

  install.promptHandler = () => Promise.resolve();

  const addonPromise = new Promise((resolve, reject) => {
    install.addListener({
      onInstallEnded(_install, addon) {
        resolve(addon);
      },
      onInstallCancelled(cancelledInstall) {
        reject(cancelledInstall?.error ?? new Error("Compat extension install was cancelled."));
      },
      onInstallFailed(failedInstall) {
        reject(
          failedInstall?.error ??
            new Error("Compat extension install failed before Firefox could enable it.")
        );
      }
    });
  });

  await install.install();
  return addonPromise;
}

async function setAddonEnabledState(addon, enabled) {
  if (!addon) {
    return;
  }

  if (enabled) {
    if (typeof addon.enable === "function") {
      await addon.enable();
    } else {
      addon.userDisabled = false;
    }
    return;
  }

  if (typeof addon.disable === "function") {
    await addon.disable();
  } else {
    addon.userDisabled = true;
  }
}

function compatExtensionRecordFromAddon(record, addon, experimentalMode) {
  const active = experimentalMode ? Boolean(addon?.isActive ?? !addon?.userDisabled) : false;

  return createCompatExtensionRecord({
    ...record,
    installedVersion: addon?.version ?? record.installedVersion,
    enabled: record.enabled,
    active,
    installState: addon ? "installed" : "missing",
    updatedAt: Date.now(),
    lastError: record.lastError ?? null
  });
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
    this.activePermissionPrompt = null;
    this.activePermissionPromptSnapshotKey = "";
    this.lastFindQuery = "";
    this.handleUploadObserved = this.handleUploadObserved.bind(this);
    this.handleSessionStoreChanged = this.handleSessionStoreChanged.bind(this);
    this.handleAuthPromptState = this.handleAuthPromptState.bind(this);
    this.handlePermissionPromptPanelState = this.handlePermissionPromptPanelState.bind(this);
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
    this.window.addEventListener(EXTERNAL_PROTOCOL_EVENT, this.handleExternalProtocolState);
    this.window.gBrowser?.tabContainer?.addEventListener(
      "oop-browser-crashed",
      this.handleBrowserCrashed
    );
    this.window.gBrowser?.tabContainer?.addEventListener(
      "TabSelect",
      this.handlePermissionPromptPanelState
    );
    this.window.PopupNotifications?.panel?.addEventListener(
      "popupshown",
      this.handlePermissionPromptPanelState
    );
    this.window.PopupNotifications?.panel?.addEventListener(
      "popuphidden",
      this.handlePermissionPromptPanelState
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
    this.syncPermissionPromptState();
  }

  getActivePermissionNotification() {
    const browser = this.window.gBrowser?.selectedBrowser ?? null;
    const popupNotifications = this.window.PopupNotifications ?? null;

    for (const notificationId of MIRRORED_PERMISSION_NOTIFICATION_IDS) {
      const notification =
        popupNotifications?.getNotification?.(notificationId, browser) ??
        popupNotifications?.getNotification?.(notificationId) ??
        null;

      if (notification) {
        return notification;
      }
    }

    return null;
  }

  syncPermissionPromptState({ hideNative = false } = {}) {
    const browser = this.window.gBrowser?.selectedBrowser ?? null;
    const notification = this.getActivePermissionNotification();
    const promptSnapshot = snapshotPermissionPrompt(
      notification,
      browser,
      this.runtimeManager?.nodeIdForBrowser?.(browser) ?? null
    );

    if (!promptSnapshot) {
      if (this.activePermissionPrompt) {
        const closedKind = permissionPromptKindForNotificationId(this.activePermissionPrompt.id);
        this.activePermissionPrompt = null;
        this.activePermissionPromptSnapshotKey = "";
        this.callbacks.onPermissionPromptChanged?.({ open: false, kind: closedKind });
      }

      return;
    }

    this.activePermissionPrompt = notification;
    const snapshotKey = JSON.stringify(promptSnapshot);
    if (snapshotKey !== this.activePermissionPromptSnapshotKey) {
      this.activePermissionPromptSnapshotKey = snapshotKey;
      this.callbacks.onPermissionPromptChanged?.(promptSnapshot);
    }

    if (
      hideNative &&
      shouldHideNativePermissionPrompt(notification) &&
      this.window.PopupNotifications?.panel?.state === "open"
    ) {
      this.window.PopupNotifications.panel.hidePopup?.();
    }
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

  handlePermissionPromptPanelState() {
    this.syncPermissionPromptState({ hideNative: true });
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

  async resolvePermissionPrompt(action = "allow") {
    const notification = this.activePermissionPrompt ?? this.getActivePermissionNotification();

    if (!notification) {
      return false;
    }

    const popupNotification = this.window.PopupNotifications?.panel?.firstElementChild ?? null;
    const callback =
      action === "block"
        ? notification.secondaryActions?.[0]?.callback
        : notification.mainAction?.callback;

    if (typeof callback !== "function") {
      return false;
    }

    await callback({
      checkboxChecked: Boolean(popupNotification?.checkbox?.checked),
      source: "nodely"
    });
    this.window.PopupNotifications?._remove?.(notification);
    this.activePermissionPrompt = null;
    this.activePermissionPromptSnapshotKey = "";
    this.callbacks.onPermissionPromptChanged?.({
      open: false,
      kind: permissionPromptKindForNotificationId(notification.id)
    });
    return true;
  }

  async dismissPermissionPrompt() {
    const notification = this.activePermissionPrompt ?? this.getActivePermissionNotification();

    if (!notification) {
      return false;
    }

    this.window.PopupNotifications?.panel?.hidePopup?.();
    this.window.PopupNotifications?._remove?.(notification);
    this.activePermissionPrompt = null;
    this.activePermissionPromptSnapshotKey = "";
    this.callbacks.onPermissionPromptChanged?.({
      open: false,
      kind: permissionPromptKindForNotificationId(notification.id)
    });
    return true;
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

  toggleFullscreen() {
    this.window.document.getElementById("View:FullScreen")?.doCommand?.();
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

  async syncCompatExtensionsState(state, { applyMode = true } = {}) {
    const normalizedState = normalizeCompatExtensionsState(state);
    const records = [];

    for (const record of normalizedState.extensions) {
      const syncedRecord = await this.syncCompatExtensionRecord(record, {
        experimentalMode: normalizedState.experimentalMode,
        applyMode
      });
      records.push(syncedRecord);
    }

    return normalizeCompatExtensionsState({
      ...normalizedState,
      extensions: records
    });
  }

  async syncCompatExtensionRecord(record, { experimentalMode = false, applyMode = false } = {}) {
    const addonManager = addonManagerRef();

    if (!addonManager?.getAddonByID || !record?.geckoId) {
      return createCompatExtensionRecord({
        ...record,
        active: false,
        installState: record?.installState ?? "missing"
      });
    }

    const addon = await addonManager.getAddonByID(record.geckoId);

    if (!addon) {
      return createCompatExtensionRecord({
        ...record,
        active: false,
        installState: record?.installState === "error" ? "error" : "missing"
      });
    }

    if (applyMode) {
      await setAddonEnabledState(addon, experimentalMode && record.enabled !== false);
    }

    return compatExtensionRecordFromAddon(record, addon, experimentalMode);
  }

  async downloadChromeStorePackage(extensionId) {
    const recipe = getCompatRecipe(extensionId);

    if (!recipe) {
      throw new Error("Not yet supported in Nodely experimental Chrome extensions.");
    }

    const response = await fetch(buildChromeStoreCrxDownloadUrl(extensionId), {
      credentials: "omit",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`Chrome Web Store download failed with status ${response.status}.`);
    }

    const crxBytes = new Uint8Array(await response.arrayBuffer());
    const strippedCrx = await stripCrxHeader(crxBytes);

    if (strippedCrx.derivedExtensionId !== extensionId) {
      throw new Error("The downloaded Chrome Web Store package did not match the expected extension ID.");
    }

    return {
      recipe,
      ...strippedCrx
    };
  }

  async prepareCompatExtensionPackage(extensionId) {
    const downloadedPackage = await this.downloadChromeStorePackage(extensionId);
    const { recipe, zipBytes } = downloadedPackage;
    const rootPath = compatExtensionsRootPath();
    const workRootPath = compatWorkRootPath();
    const packagesRootPath = compatPackagesRootPath();

    if (!rootPath || !workRootPath || !packagesRootPath) {
      throw new Error("Nodely compat extensions need profile storage to be available.");
    }

    const workDirectory = PathUtils.join(workRootPath, sanitizePathSegment(extensionId));
    const extractDirectory = PathUtils.join(workDirectory, "extracted");
    const sourceZipPath = PathUtils.join(workDirectory, "source.zip");

    await removePath(workDirectory, { recursive: true });
    await ensureDirectory(workDirectory);
    await IOUtils.write(sourceZipPath, zipBytes);
    await extractZipToDirectory(sourceZipPath, extractDirectory);

    const manifestPath = PathUtils.join(extractDirectory, "manifest.json");
    const originalManifest = JSON.parse(await IOUtils.readUTF8(manifestPath));
    const transformedManifest = transformChromeManifestForRecipe(originalManifest, recipe);
    const extractedFiles = collectDirectoryFiles(nsFileForPath(extractDirectory), extractDirectory);
    const sourceFiles = {};

    for (const { relativePath } of extractedFiles) {
      if (!relativePath.endsWith(".js")) {
        continue;
      }

      const filePath = PathUtils.join(extractDirectory, ...relativePath.split("/"));
      sourceFiles[relativePath] = await IOUtils.readUTF8(filePath);
    }

    const filePatches = buildCompatExtensionFilePatches(sourceFiles, recipe, {
      originalManifest,
      transformedManifest
    });

    for (const [relativePath, source] of Object.entries(filePatches)) {
      const filePath = PathUtils.join(extractDirectory, ...relativePath.split("/"));
      await ensureDirectory(PathUtils.parent(filePath));
      await IOUtils.write(filePath, encodeUtf8(source));
    }

    await IOUtils.write(manifestPath, encodeUtf8(JSON.stringify(transformedManifest, null, 2)));

    const version = transformedManifest.version ?? "0.0.0";
    const packageDirectory = PathUtils.join(packagesRootPath, sanitizePathSegment(extensionId), sanitizePathSegment(version));
    const packagePath = PathUtils.join(
      packageDirectory,
      `${sanitizePathSegment(recipe.name, "chrome-extension")}.xpi`
    );

    await ensureDirectory(packageDirectory);
    await zipDirectoryToFile(extractDirectory, packagePath);

    return {
      recipe,
      manifest: transformedManifest,
      packagePath
    };
  }

  async installCompatExtensionPackage(packageInfo) {
    const addon = await finalizeAddonInstall(
      await installAddonFromFile(packageInfo.packagePath)
    );

    return createCompatExtensionRecord({
      extensionId: packageInfo.recipe.extensionId,
      recipeId: packageInfo.recipe.recipeId,
      geckoId: packageInfo.recipe.geckoId,
      name: packageInfo.manifest.name ?? packageInfo.recipe.name,
      chromeStoreUrl: packageInfo.recipe.chromeStoreUrl,
      installedVersion: addon?.version ?? packageInfo.manifest.version,
      enabled: true,
      active: Boolean(addon?.isActive ?? true),
      installState: "installed",
      artifactPath: packageInfo.packagePath,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      lastError: null
    });
  }

  async installChromeStoreExtension(extensionId, currentRecord = null) {
    const packageInfo = await this.prepareCompatExtensionPackage(extensionId);
    const nextRecord = await this.installCompatExtensionPackage(packageInfo);

    return createCompatExtensionRecord({
      ...currentRecord,
      ...nextRecord,
      artifactPath: packageInfo.packagePath,
      enabled: currentRecord?.enabled ?? true
    });
  }

  async setCompatExtensionEnabled(record, enabled, experimentalMode) {
    const addonManager = addonManagerRef();
    const addon = record?.geckoId ? await addonManager?.getAddonByID?.(record.geckoId) : null;

    if (addon) {
      await setAddonEnabledState(addon, experimentalMode && enabled);
    }

    return this.syncCompatExtensionRecord(
      {
        ...record,
        enabled: enabled === true
      },
      {
        experimentalMode,
        applyMode: false
      }
    );
  }

  async removeCompatExtension(record) {
    const addonManager = addonManagerRef();
    const addon = record?.geckoId ? await addonManager?.getAddonByID?.(record.geckoId) : null;

    if (addon?.uninstall) {
      await addon.uninstall();
    }

    if (record?.artifactPath) {
      await removePath(PathUtils.parent(record.artifactPath), { recursive: true });
    }
  }

  async checkCompatExtensionUpdates(records) {
    const nextRecords = [];

    for (const record of records ?? []) {
      const nextRecord = await this.checkCompatExtensionUpdate(record);
      nextRecords.push(nextRecord);
    }

    return nextRecords;
  }

  async checkCompatExtensionUpdate(record) {
    const recipe = getCompatRecipe(record?.extensionId ?? "");

    if (!recipe) {
      return createCompatExtensionRecord({
        ...record,
        updateAvailableVersion: null,
        lastCheckedAt: Date.now()
      });
    }

    const downloadedPackage = await this.downloadChromeStorePackage(recipe.extensionId);
    const rootPath = compatWorkRootPath();

    if (!rootPath) {
      throw new Error("Nodely compat updates need profile storage to be available.");
    }

    const probeDirectory = PathUtils.join(rootPath, sanitizePathSegment(recipe.extensionId), "probe");
    const zipPath = PathUtils.join(probeDirectory, "source.zip");

    await removePath(probeDirectory, { recursive: true });
    await ensureDirectory(probeDirectory);
    await IOUtils.write(zipPath, downloadedPackage.zipBytes);

    const manifest = await readZipManifest(zipPath);
    const updateAvailableVersion =
      compareVersionStrings(manifest.version, record.installedVersion ?? "") > 0
        ? manifest.version
        : null;

    return createCompatExtensionRecord({
      ...record,
      name: manifest.name ?? record.name,
      updateAvailableVersion,
      lastCheckedAt: Date.now(),
      lastError: null
    });
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
