import { describe, expect, it } from "vitest";

import {
  buildCompatExtensionFilePatches,
  buildChromeStoreCrxDownloadUrl,
  deriveChromeExtensionIdFromPublicKey,
  parseChromeWebStoreDetailUrl,
  resolveChromeStorePageSupport,
  stripCrxHeader,
  transformChromeManifestForRecipe
} from "../../gecko/overlay/browser/base/content/nodely/chrome-extension-compat.mjs";

function writeUint32LE(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
  target[offset + 2] = (value >> 16) & 0xff;
  target[offset + 3] = (value >> 24) & 0xff;
}

function encodeVarint(value: number) {
  const bytes = [];
  let remaining = value >>> 0;

  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining);

  return Uint8Array.from(bytes);
}

function encodeLengthDelimited(fieldNumber: number, value: Uint8Array) {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const length = encodeVarint(value.length);
  const bytes = new Uint8Array(tag.length + length.length + value.length);
  bytes.set(tag, 0);
  bytes.set(length, tag.length);
  bytes.set(value, tag.length + length.length);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }

  return bytes;
}

function buildCrx2(publicKey: Uint8Array, signature: Uint8Array, zipBytes: Uint8Array) {
  const bytes = new Uint8Array(16 + publicKey.length + signature.length + zipBytes.length);
  bytes.set([0x43, 0x72, 0x32, 0x34], 0);
  writeUint32LE(bytes, 4, 2);
  writeUint32LE(bytes, 8, publicKey.length);
  writeUint32LE(bytes, 12, signature.length);
  bytes.set(publicKey, 16);
  bytes.set(signature, 16 + publicKey.length);
  bytes.set(zipBytes, 16 + publicKey.length + signature.length);
  return bytes;
}

function buildCrx3(headerBytes: Uint8Array, zipBytes: Uint8Array) {
  const bytes = new Uint8Array(12 + headerBytes.length + zipBytes.length);
  bytes.set([0x43, 0x72, 0x32, 0x34], 0);
  writeUint32LE(bytes, 4, 3);
  writeUint32LE(bytes, 8, headerBytes.length);
  bytes.set(headerBytes, 12);
  bytes.set(zipBytes, 12 + headerBytes.length);
  return bytes;
}

describe("chrome-extension-compat", () => {
  it("recognizes supported Chrome Web Store detail pages", () => {
    const detail = parseChromeWebStoreDetailUrl(
      "https://chromewebstore.google.com/detail/kondo/kojhnafkiednagnljfgakalcbfbklbdk"
    );

    expect(detail).toEqual(
      expect.objectContaining({
        extensionId: "kojhnafkiednagnljfgakalcbfbklbdk",
        slug: "kondo"
      })
    );

    expect(resolveChromeStorePageSupport(detail?.storeUrl)).toEqual(
      expect.objectContaining({
        supported: true,
        extensionId: "kojhnafkiednagnljfgakalcbfbklbdk"
      })
    );
  });

  it("builds the Chrome Web Store CRX download URL for a supported id", () => {
    expect(
      buildChromeStoreCrxDownloadUrl("kojhnafkiednagnljfgakalcbfbklbdk")
    ).toContain("id%3Dkojhnafkiednagnljfgakalcbfbklbdk%26uc");
  });

  it("strips a CRX2 header and derives the expected extension id", async () => {
    const publicKey = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const signature = Uint8Array.from([9, 10, 11]);
    const zipBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const stripped = await stripCrxHeader(buildCrx2(publicKey, signature, zipBytes));

    expect(stripped.version).toBe(2);
    expect([...stripped.zipBytes]).toEqual([...zipBytes]);
    expect(stripped.derivedExtensionId).toBe(
      await deriveChromeExtensionIdFromPublicKey(publicKey)
    );
  });

  it("prefers the CRX3 crx_id from signed header data over proof keys", async () => {
    const crxIdBytes = Uint8Array.from([
      0xae, 0x97, 0xd0, 0x5a, 0x84, 0x3d, 0x06, 0xdb,
      0x95, 0x60, 0xa0, 0xb2, 0x15, 0x1a, 0xb1, 0x3a
    ]);
    const wrongPublicKey = Uint8Array.from([1, 2, 3, 4]);
    const proof = encodeLengthDelimited(2, encodeLengthDelimited(1, wrongPublicKey));
    const signedHeaderData = encodeLengthDelimited(1, crxIdBytes);
    const header = concatBytes(proof, encodeLengthDelimited(10000, signedHeaderData));
    const zipBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const stripped = await stripCrxHeader(buildCrx3(header, zipBytes));

    expect(stripped.version).toBe(3);
    expect([...stripped.zipBytes]).toEqual([...zipBytes]);
    expect(stripped.derivedExtensionId).toBe("kojhnafkiednagnljfgakalcbfbklbdk");
  });

  it("transforms Kondo's background service worker into a Gecko background document script", () => {
    const manifest = {
      manifest_version: 3,
      name: "Kondo",
      version: "1.12.1",
      permissions: ["alarms", "cookies", "storage"],
      host_permissions: ["https://*.linkedin.com/*"],
      background: {
        service_worker: "service-worker-loader.js",
        type: "module"
      }
    };

    const transformed = transformChromeManifestForRecipe(
      manifest,
      "kojhnafkiednagnljfgakalcbfbklbdk"
    );

    expect(transformed.background).toEqual(
      expect.objectContaining({
        scripts: ["service-worker-loader.js"],
        type: "module",
        preferred_environment: ["document"]
      })
    );
    expect(transformed.background.service_worker).toBeUndefined();
    expect(transformed.browser_specific_settings.gecko.id).toBe(
      "kondo.chrome-compat@nodely.browser"
    );
  });

  it("patches Kondo runtime files so the generated compat package looks like the Chrome install path", () => {
    const originalManifest = {
      manifest_version: 3,
      name: "Kondo",
      version: "1.12.1",
      background: {
        service_worker: "service-worker-loader.js",
        type: "module"
      }
    };
    const transformedManifest = transformChromeManifestForRecipe(
      originalManifest,
      "kojhnafkiednagnljfgakalcbfbklbdk"
    );
    const patches = buildCompatExtensionFilePatches(
      {
        "service-worker-loader.js": "import './assets/background-vYAqPXIO.js';\n",
        "assets/content-loader.js":
          '(async () => { const { onExecute } = await import("./content-DQEAdWiS.js"); onExecute?.(); })().catch(console.error);',
        "assets/settings.js":
          'window.addEventListener("message",async t=>{(await navigator.serviceWorker.ready).active?.postMessage({},[t.ports[0]])});',
        "assets/content-DQEAdWiS.js":
          'e.setAttribute("id","kondo-ext"),e.setAttribute("key",chrome.runtime.id),e.setAttribute("version",chrome.runtime.getManifest().version);'
      },
      "kojhnafkiednagnljfgakalcbfbklbdk",
      {
        originalManifest,
        transformedManifest
      }
    );

    expect(patches["service-worker-loader.js"]).toContain(
      'import "./nodely-kondo-background-bridge.js";'
    );
    expect(patches["nodely-kondo-background-bridge.js"]).toContain(
      'if (runtimePort.name !== "kondo-iframe")'
    );
    expect(patches["assets/settings.js"]).toContain(
      'chrome.runtime.connect({ name: "kondo-iframe" })'
    );
    expect(patches["assets/content-loader.js"]).toContain(
      'chrome.runtime.getURL("assets/content-DQEAdWiS.js")'
    );
    expect(patches["assets/content-DQEAdWiS.js"]).toContain(
      'setAttribute("key","kojhnafkiednagnljfgakalcbfbklbdk")'
    );
  });

  it("rejects unsupported manifest permissions for compat installs", () => {
    expect(() =>
      transformChromeManifestForRecipe(
        {
          manifest_version: 3,
          name: "Kondo",
          version: "1.12.1",
          permissions: ["nativeMessaging"],
          background: {
            service_worker: "service-worker-loader.js"
          }
        },
        "kojhnafkiednagnljfgakalcbfbklbdk"
      )
    ).toThrow(/unsupported Chrome permission/i);
  });
});
