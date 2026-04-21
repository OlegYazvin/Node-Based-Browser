const CHROME_STORE_DETAIL_HOSTS = new Set([
  "chromewebstore.google.com",
  "chrome.google.com"
]);

const CHROME_STORE_ID_PATTERN = /^[a-p]{32}$/u;
const CHROME_STORE_VERSION = "140.0.0.0";
const COMPAT_STATE_VERSION = 1;
const CRX3_SIGNED_HEADER_FIELD = 10000;
const CRX3_PROOF_FIELDS = new Set([2, 3]);
const DANGEROUS_MANIFEST_KEYS = new Set([
  "chrome_settings_overrides",
  "devtools_page",
  "externally_connectable",
  "file_browser_handlers",
  "file_handlers",
  "minimum_chrome_version",
  "offscreen",
  "sandbox",
  "side_panel"
]);
const DANGEROUS_PERMISSIONS = new Set([
  "certificateProvider",
  "debugger",
  "enterprise.deviceAttributes",
  "enterprise.hardwarePlatform",
  "nativeMessaging",
  "platformKeys",
  "proxy",
  "vpnProvider",
  "webRequestBlocking"
]);

const KONDO_EXTENSION_ID = "kojhnafkiednagnljfgakalcbfbklbdk";

export const CHROME_COMPAT_RECIPES = Object.freeze({
  [KONDO_EXTENSION_ID]: Object.freeze({
    recipeId: "kondo",
    extensionId: KONDO_EXTENSION_ID,
    name: "Kondo",
    geckoId: "kondo.chrome-compat@nodely.browser",
    storeLabel: "Add to Nodely (Experimental)",
    chromeStoreUrl: `https://chromewebstore.google.com/detail/kondo/${KONDO_EXTENSION_ID}`
  })
});

function clone(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function normalizeTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeString(value, fallback = null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function normalizeNullableString(value) {
  return normalizeString(value, null);
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function sortCompatExtensionRecords(records) {
  return [...records].sort((left, right) => {
    const leftInstalled = normalizeTimestamp(left.updatedAt || left.installedAt);
    const rightInstalled = normalizeTimestamp(right.updatedAt || right.installedAt);

    if (leftInstalled !== rightInstalled) {
      return rightInstalled - leftInstalled;
    }

    return String(left.name ?? left.extensionId ?? "").localeCompare(
      String(right.name ?? right.extensionId ?? "")
    );
  });
}

export function getCompatRecipe(extensionId) {
  return CHROME_COMPAT_RECIPES[extensionId] ?? null;
}

export function createEmptyCompatExtensionsState() {
  return {
    version: COMPAT_STATE_VERSION,
    experimentalMode: false,
    checkingUpdates: false,
    busyExtensionId: null,
    busyAction: null,
    lastActionError: null,
    extensions: []
  };
}

export function normalizeCompatExtensionRecord(record) {
  const recipe = getCompatRecipe(record?.extensionId ?? "");

  return {
    extensionId: normalizeString(record?.extensionId, recipe?.extensionId ?? ""),
    recipeId: normalizeString(record?.recipeId, recipe?.recipeId ?? null),
    geckoId: normalizeString(record?.geckoId, recipe?.geckoId ?? null),
    name: normalizeString(record?.name, recipe?.name ?? "Chrome Extension"),
    chromeStoreUrl: normalizeString(record?.chromeStoreUrl, recipe?.chromeStoreUrl ?? null),
    installedVersion: normalizeNullableString(record?.installedVersion),
    updateAvailableVersion: normalizeNullableString(record?.updateAvailableVersion),
    enabled: normalizeBoolean(record?.enabled, true),
    active: normalizeBoolean(record?.active, false),
    installState: normalizeString(record?.installState, "missing"),
    artifactPath: normalizeNullableString(record?.artifactPath),
    lastCheckedAt: normalizeTimestamp(record?.lastCheckedAt),
    installedAt: normalizeTimestamp(record?.installedAt),
    updatedAt: normalizeTimestamp(record?.updatedAt),
    lastError: normalizeNullableString(record?.lastError)
  };
}

export function normalizeCompatExtensionsState(state) {
  const normalized = state && typeof state === "object" ? state : createEmptyCompatExtensionsState();
  const records = Array.isArray(normalized.extensions)
    ? normalized.extensions.map(normalizeCompatExtensionRecord)
    : [];

  return {
    version: COMPAT_STATE_VERSION,
    experimentalMode: normalizeBoolean(normalized.experimentalMode, false),
    checkingUpdates: normalizeBoolean(normalized.checkingUpdates, false),
    busyExtensionId: normalizeNullableString(normalized.busyExtensionId),
    busyAction: normalizeNullableString(normalized.busyAction),
    lastActionError: normalizeNullableString(normalized.lastActionError),
    extensions: sortCompatExtensionRecords(records)
  };
}

export function resolveCompatExtensionRecord(state, extensionId) {
  return normalizeCompatExtensionsState(state).extensions.find(
    (record) => record.extensionId === extensionId
  ) ?? null;
}

export function replaceCompatExtensionRecord(state, nextRecord) {
  const normalizedState = normalizeCompatExtensionsState(state);
  const record = normalizeCompatExtensionRecord(nextRecord);
  const filtered = normalizedState.extensions.filter(
    (existingRecord) => existingRecord.extensionId !== record.extensionId
  );

  return normalizeCompatExtensionsState({
    ...normalizedState,
    extensions: [...filtered, record]
  });
}

export function removeCompatExtensionRecord(state, extensionId) {
  const normalizedState = normalizeCompatExtensionsState(state);
  return normalizeCompatExtensionsState({
    ...normalizedState,
    extensions: normalizedState.extensions.filter((record) => record.extensionId !== extensionId)
  });
}

export function setCompatExtensionsBusyState(
  state,
  { busyExtensionId = null, busyAction = null, checkingUpdates = false, lastActionError = null } = {}
) {
  const normalizedState = normalizeCompatExtensionsState(state);
  return normalizeCompatExtensionsState({
    ...normalizedState,
    busyExtensionId,
    busyAction,
    checkingUpdates,
    lastActionError
  });
}

export function parseChromeWebStoreDetailUrl(url) {
  if (!url) {
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (!CHROME_STORE_DETAIL_HOSTS.has(hostname)) {
    return null;
  }

  const segments = parsedUrl.pathname.split("/").filter(Boolean);

  if (!segments.length) {
    return null;
  }

  let extensionId = null;
  let slug = null;

  if (hostname === "chromewebstore.google.com") {
    const detailIndex = segments.indexOf("detail");

    if (detailIndex === -1) {
      return null;
    }

    extensionId = segments[detailIndex + 2] ?? segments[detailIndex + 1] ?? null;
    slug = segments[detailIndex + 1] ?? null;
  } else {
    const detailIndex = segments.indexOf("detail");

    if (detailIndex === -1) {
      return null;
    }

    extensionId = segments[detailIndex + 2] ?? null;
    slug = segments[detailIndex + 1] ?? null;
  }

  if (!extensionId || !CHROME_STORE_ID_PATTERN.test(extensionId)) {
    return null;
  }

  return {
    storeUrl: parsedUrl.toString(),
    extensionId,
    slug: normalizeNullableString(slug),
    recipe: getCompatRecipe(extensionId)
  };
}

export function resolveChromeStorePageSupport(url) {
  const detail = parseChromeWebStoreDetailUrl(url);

  if (!detail) {
    return null;
  }

  return {
    ...detail,
    supported: Boolean(detail.recipe),
    supportLabel: detail.recipe
      ? detail.recipe.storeLabel
      : "Not yet supported in Nodely experimental Chrome extensions"
  };
}

export function buildChromeStoreCrxDownloadUrl(extensionId, { prodVersion = CHROME_STORE_VERSION } = {}) {
  return (
    "https://clients2.google.com/service/update2/crx?" +
    `response=redirect&prodversion=${encodeURIComponent(prodVersion)}` +
    "&acceptformat=crx2,crx3" +
    `&x=${encodeURIComponent(`id=${extensionId}&uc`)}`
  );
}

function bytesFrom(value) {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  throw new Error("Expected Uint8Array-compatible bytes");
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readVarint(bytes, offset) {
  let value = 0;
  let shift = 0;
  let cursor = offset;

  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    value |= (byte & 0x7f) << shift;
    cursor += 1;

    if ((byte & 0x80) === 0) {
      return {
        value,
        offset: cursor
      };
    }

    shift += 7;
  }

  throw new Error("Truncated protobuf varint");
}

function skipLengthDelimited(bytes, offset) {
  const { value: length, offset: nextOffset } = readVarint(bytes, offset);
  return nextOffset + length;
}

function skipProtobufField(bytes, offset, wireType) {
  switch (wireType) {
    case 0:
      return readVarint(bytes, offset).offset;
    case 1:
      return offset + 8;
    case 2:
      return skipLengthDelimited(bytes, offset);
    case 5:
      return offset + 4;
    default:
      throw new Error(`Unsupported protobuf wire type: ${wireType}`);
  }
}

function extractCrx3SignedHeaderData(headerBytes) {
  let offset = 0;

  while (offset < headerBytes.length) {
    const tag = readVarint(headerBytes, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >> 3;
    const wireType = tag.value & 0x07;

    if (fieldNumber === CRX3_SIGNED_HEADER_FIELD) {
      if (wireType !== 2) {
        throw new Error("Invalid CRX3 signed header data");
      }

      const lengthInfo = readVarint(headerBytes, offset);
      return headerBytes.slice(lengthInfo.offset, lengthInfo.offset + lengthInfo.value);
    }

    offset = skipProtobufField(headerBytes, offset, wireType);
  }

  return null;
}

function extractCrx3IdBytes(headerBytes) {
  let offset = 0;

  while (offset < headerBytes.length) {
    const tag = readVarint(headerBytes, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >> 3;
    const wireType = tag.value & 0x07;

    if (fieldNumber === 1) {
      if (wireType !== 2) {
        throw new Error("Invalid CRX3 crx_id field");
      }

      const lengthInfo = readVarint(headerBytes, offset);
      return headerBytes.slice(lengthInfo.offset, lengthInfo.offset + lengthInfo.value);
    }

    offset = skipProtobufField(headerBytes, offset, wireType);
  }

  return null;
}

function extractCrx3PublicKey(headerBytes) {
  let offset = 0;

  while (offset < headerBytes.length) {
    const tag = readVarint(headerBytes, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >> 3;
    const wireType = tag.value & 0x07;

    if (!CRX3_PROOF_FIELDS.has(fieldNumber)) {
      offset = skipProtobufField(headerBytes, offset, wireType);
      continue;
    }

    if (wireType !== 2) {
      throw new Error("Invalid CRX3 proof field");
    }

    const lengthInfo = readVarint(headerBytes, offset);
    const proofBytes = headerBytes.slice(lengthInfo.offset, lengthInfo.offset + lengthInfo.value);
    let proofOffset = 0;

    while (proofOffset < proofBytes.length) {
      const proofTag = readVarint(proofBytes, proofOffset);
      proofOffset = proofTag.offset;
      const proofField = proofTag.value >> 3;
      const proofWireType = proofTag.value & 0x07;

      if (proofField === 1) {
        if (proofWireType !== 2) {
          throw new Error("Invalid CRX3 public key field");
        }

        const keyLength = readVarint(proofBytes, proofOffset);
        return proofBytes.slice(keyLength.offset, keyLength.offset + keyLength.value);
      }

      proofOffset = skipProtobufField(proofBytes, proofOffset, proofWireType);
    }

    offset = lengthInfo.offset + lengthInfo.value;
  }

  return null;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytesFrom(bytes));
  return new Uint8Array(digest);
}

function extensionIdFromDigest(digestBytes) {
  let extensionId = "";

  for (let index = 0; index < 16; index += 1) {
    const value = digestBytes[index];
    extensionId += String.fromCharCode(97 + ((value >> 4) & 0x0f));
    extensionId += String.fromCharCode(97 + (value & 0x0f));
  }

  return extensionId;
}

function extensionIdFromRawBytes(idBytes) {
  const bytes = bytesFrom(idBytes);

  if (bytes.length !== 16) {
    throw new Error("Invalid CRX extension id bytes");
  }

  return extensionIdFromDigest(bytes);
}

export async function deriveChromeExtensionIdFromPublicKey(publicKeyBytes) {
  return extensionIdFromDigest(await sha256(publicKeyBytes));
}

export async function stripCrxHeader(bytesLike) {
  const bytes = bytesFrom(bytesLike);

  if (bytes.length < 16) {
    throw new Error("CRX file is too short");
  }

  if (
    bytes[0] !== 0x43 ||
    bytes[1] !== 0x72 ||
    bytes[2] !== 0x32 ||
    bytes[3] !== 0x34
  ) {
    throw new Error("Invalid CRX header");
  }

  const version = readUint32LE(bytes, 4);

  if (version === 2) {
    const publicKeyLength = readUint32LE(bytes, 8);
    const signatureLength = readUint32LE(bytes, 12);
    const publicKey = bytes.slice(16, 16 + publicKeyLength);
    const zipOffset = 16 + publicKeyLength + signatureLength;

    return {
      version,
      zipBytes: bytes.slice(zipOffset),
      publicKey,
      derivedExtensionId: await deriveChromeExtensionIdFromPublicKey(publicKey)
    };
  }

  if (version !== 3) {
    throw new Error(`Unsupported CRX version: ${version}`);
  }

  const headerLength = readUint32LE(bytes, 8);
  const headerBytes = bytes.slice(12, 12 + headerLength);
  const signedHeaderData = extractCrx3SignedHeaderData(headerBytes);
  const crxIdBytes = signedHeaderData ? extractCrx3IdBytes(signedHeaderData) : null;
  const publicKey =
    (signedHeaderData && extractCrx3PublicKey(signedHeaderData)) || extractCrx3PublicKey(headerBytes);
  const derivedExtensionId =
    crxIdBytes ? extensionIdFromRawBytes(crxIdBytes) : publicKey
      ? await deriveChromeExtensionIdFromPublicKey(publicKey)
      : null;

  if (!derivedExtensionId) {
    throw new Error("Unable to read CRX3 extension identity");
  }

  return {
    version,
    zipBytes: bytes.slice(12 + headerLength),
    publicKey,
    derivedExtensionId
  };
}

function cloneManifest(manifest) {
  return clone(manifest ?? {});
}

function assertSupportedManifest(recipe, manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("The Chrome extension manifest is missing or invalid");
  }

  if (manifest.manifest_version !== 3) {
    throw new Error(`${recipe.name} must use manifest_version 3`);
  }

  for (const key of Object.keys(manifest)) {
    if (DANGEROUS_MANIFEST_KEYS.has(key)) {
      throw new Error(`${recipe.name} uses unsupported Chrome manifest key: ${key}`);
    }
  }

  for (const permission of manifest.permissions ?? []) {
    if (DANGEROUS_PERMISSIONS.has(permission)) {
      throw new Error(`${recipe.name} uses unsupported Chrome permission: ${permission}`);
    }
  }

  if (manifest.background?.page) {
    throw new Error(`${recipe.name} uses background.page, which is not supported in Nodely compat installs`);
  }

  if (!manifest.background?.service_worker) {
    throw new Error(`${recipe.name} is missing a background service worker`);
  }
}

function transformKondoManifest(manifest, recipe) {
  assertSupportedManifest(recipe, manifest);

  const nextManifest = cloneManifest(manifest);
  const background = {
    ...(nextManifest.background ?? {})
  };
  const backgroundEntry = normalizeString(background.service_worker);

  if (!backgroundEntry) {
    throw new Error("Kondo is missing a usable background service worker");
  }

  background.scripts = [backgroundEntry];

  if (background.type === "module") {
    background.type = "module";
  } else if (background.type === "classic") {
    background.type = "classic";
  } else {
    delete background.type;
  }

  background.preferred_environment = ["document"];
  delete background.service_worker;
  nextManifest.background = background;

  const browserSpecificSettings = cloneManifest(nextManifest.browser_specific_settings);
  browserSpecificSettings.gecko = {
    ...(browserSpecificSettings.gecko ?? {}),
    id: recipe.geckoId
  };
  nextManifest.browser_specific_settings = browserSpecificSettings;

  return nextManifest;
}

export function transformChromeManifestForRecipe(manifest, recipeOrExtensionId) {
  const recipe =
    typeof recipeOrExtensionId === "string"
      ? getCompatRecipe(recipeOrExtensionId)
      : recipeOrExtensionId;

  if (!recipe) {
    throw new Error("This Chrome extension is not yet supported in Nodely experimental mode");
  }

  switch (recipe.recipeId) {
    case "kondo":
      return transformKondoManifest(manifest, recipe);
    default:
      throw new Error(`No compat transformer exists for recipe: ${recipe.recipeId}`);
  }
}

function kondoCompatIframeBridgeSource() {
  return `window.addEventListener("message", handleKondoIframeMessage);

function handleKondoIframeMessage(event) {
  const session = new URLSearchParams(location.search).get("session");

  if (!session || event.data !== session) {
    return;
  }

  const pagePort = event.ports?.[0] ?? null;

  if (!pagePort) {
    return;
  }

  const runtimePort = chrome.runtime.connect({ name: "kondo-iframe" });

  pagePort.start?.();
  runtimePort.onMessage.addListener((message) => {
    try {
      pagePort.postMessage(message);
    } catch {}
  });
  runtimePort.onDisconnect.addListener(() => {
    try {
      pagePort.close?.();
    } catch {}
  });
  pagePort.onmessage = (messageEvent) => {
    try {
      runtimePort.postMessage(messageEvent.data);
    } catch {}
  };
}
`;
}

function kondoCompatBackgroundBridgeSource() {
  return `const __nodelyKondoMessageListeners = new Set();
const __nodelyKondoOriginalAddEventListener = self.addEventListener.bind(self);

function __nodelyKondoWrapRuntimePort(runtimePort) {
  const wrappedPort = {
    onmessage: null,
    postMessage(message) {
      runtimePort.postMessage(message);
    },
    close() {
      try {
        runtimePort.disconnect();
      } catch {}
    }
  };

  runtimePort.onMessage.addListener((message) => {
    wrappedPort.onmessage?.({ data: message });
  });

  return wrappedPort;
}

self.addEventListener = function patchedAddEventListener(type, listener, options) {
  if (type === "message" && listener) {
    __nodelyKondoMessageListeners.add(listener);
    return;
  }

  return __nodelyKondoOriginalAddEventListener(type, listener, options);
};

chrome.runtime.onConnect.addListener((runtimePort) => {
  if (runtimePort.name !== "kondo-iframe") {
    return;
  }

  const wrappedPort = __nodelyKondoWrapRuntimePort(runtimePort);
  const event = {
    data: { source: "kondo-iframe" },
    ports: [wrappedPort]
  };

  for (const listener of __nodelyKondoMessageListeners) {
    try {
      if (typeof listener === "function") {
        listener.call(self, event);
      } else {
        listener?.handleEvent?.(event);
      }
    } catch (error) {
      console.error("Nodely Kondo compat bridge listener failed", error);
    }
  }
});
`;
}

function rewriteKondoContentBundle(source, recipe) {
  if (typeof source !== "string" || !source.includes("kondo-ext")) {
    return source;
  }

  return source.replace(
    /setAttribute\((['"`])key\1,\s*chrome\.runtime\.id\)/u,
    `setAttribute("key","${recipe.extensionId}")`
  );
}

function rewriteKondoContentLoader(source) {
  if (typeof source !== "string" || !source.includes('import(')) {
    return source;
  }

  return source.replace(
    /\(\s*["'`]\.\/content-DQEAdWiS\.js["'`]\s*\)/u,
    'chrome.runtime.getURL("assets/content-DQEAdWiS.js")'
  );
}

export function buildCompatExtensionFilePatches(
  sourceFiles,
  recipeOrExtensionId,
  { originalManifest = null, transformedManifest = null } = {}
) {
  const recipe =
    typeof recipeOrExtensionId === "string"
      ? getCompatRecipe(recipeOrExtensionId)
      : recipeOrExtensionId;

  if (!recipe) {
    return {};
  }

  if (recipe.recipeId !== "kondo") {
    return {};
  }

  const patches = {};
  const backgroundLoaderPath = normalizeString(
    originalManifest?.background?.service_worker ??
      transformedManifest?.background?.scripts?.[0] ??
      null
  );

  if (backgroundLoaderPath && typeof sourceFiles?.[backgroundLoaderPath] === "string") {
    const loaderSource = sourceFiles[backgroundLoaderPath];

    patches[backgroundLoaderPath] = loaderSource.includes("./nodely-kondo-background-bridge.js")
      ? loaderSource
      : `import "./nodely-kondo-background-bridge.js";\n${loaderSource}`;
    patches["nodely-kondo-background-bridge.js"] = kondoCompatBackgroundBridgeSource();
  }

  if (typeof sourceFiles?.["assets/settings.js"] === "string") {
    patches["assets/settings.js"] = kondoCompatIframeBridgeSource();
  }

  if (typeof sourceFiles?.["assets/content-loader.js"] === "string") {
    patches["assets/content-loader.js"] = rewriteKondoContentLoader(
      sourceFiles["assets/content-loader.js"]
    );
  }

  for (const [relativePath, source] of Object.entries(sourceFiles ?? {})) {
    if (!relativePath.endsWith(".js")) {
      continue;
    }

    if (!source.includes("kondo-ext") || !source.includes("chrome.runtime.id")) {
      continue;
    }

    patches[relativePath] = rewriteKondoContentBundle(source, recipe);
  }

  return patches;
}

export function compareVersionStrings(left, right) {
  const tokenize = (value) =>
    String(value ?? "")
      .split(/[^a-zA-Z0-9]+/u)
      .filter(Boolean)
      .map((token) => (/^\d+$/u.test(token) ? Number(token) : token.toLowerCase()));

  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const length = Math.max(leftTokens.length, rightTokens.length);

  for (let index = 0; index < length; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];

    if (leftToken == null && rightToken == null) {
      return 0;
    }

    if (leftToken == null) {
      return -1;
    }

    if (rightToken == null) {
      return 1;
    }

    if (typeof leftToken === "number" && typeof rightToken === "number") {
      if (leftToken !== rightToken) {
        return leftToken > rightToken ? 1 : -1;
      }
      continue;
    }

    const leftText = String(leftToken);
    const rightText = String(rightToken);

    if (leftText !== rightText) {
      return leftText.localeCompare(rightText);
    }
  }

  return 0;
}

export function createCompatExtensionRecord(details) {
  return normalizeCompatExtensionRecord({
    extensionId: details.extensionId,
    recipeId: details.recipeId,
    geckoId: details.geckoId,
    name: details.name,
    chromeStoreUrl: details.chromeStoreUrl,
    installedVersion: details.installedVersion,
    updateAvailableVersion: details.updateAvailableVersion ?? null,
    enabled: details.enabled ?? true,
    active: details.active ?? false,
    installState: details.installState ?? "installed",
    artifactPath: details.artifactPath ?? null,
    lastCheckedAt: details.lastCheckedAt ?? 0,
    installedAt: details.installedAt ?? Date.now(),
    updatedAt: details.updatedAt ?? Date.now(),
    lastError: details.lastError ?? null
  });
}
