import { describe, expect, it } from "vitest";

import {
  describeNodelyShellEligibility,
  isPopupLikeBrowserWindow
} from "../../gecko/overlay/browser/base/content/nodely/node-runtime-manager.mjs";

function makeDocument(attributes: Record<string, string> = {}) {
  return {
    documentElement: {
      getAttribute(name: string) {
        return attributes[name] ?? "";
      },
      hasAttribute(name: string) {
        return Object.prototype.hasOwnProperty.call(attributes, name);
      }
    }
  };
}

function makeWindow(overrides: Record<string, unknown> = {}) {
  return {
    toolbar: { visible: true },
    locationbar: { visible: true },
    menubar: { visible: true },
    ...overrides
  };
}

describe("window-context", () => {
  it("boots the Nodely shell in a primary browser window", () => {
    const documentRef = makeDocument({ windowtype: "navigator:browser" });
    const windowRef = makeWindow({ document: documentRef });

    expect(describeNodelyShellEligibility(windowRef as any, documentRef as any)).toEqual({
      enabled: true,
      reason: "primary-window"
    });
  });

  it("treats toolbar-hidden browser windows as popup auth surfaces", () => {
    const documentRef = makeDocument({ windowtype: "navigator:browser" });
    const windowRef = makeWindow({
      document: documentRef,
      toolbar: { visible: false }
    });

    expect(isPopupLikeBrowserWindow(windowRef as any, documentRef as any)).toBe(true);
    expect(describeNodelyShellEligibility(windowRef as any, documentRef as any)).toEqual({
      enabled: false,
      reason: "popup-window"
    });
  });

  it("treats chromehidden popup windows as ineligible for the Nodely shell", () => {
    const documentRef = makeDocument({
      windowtype: "navigator:browser",
      chromehidden: "toolbar location menubar"
    });
    const windowRef = makeWindow({ document: documentRef });

    expect(describeNodelyShellEligibility(windowRef as any, documentRef as any)).toEqual({
      enabled: false,
      reason: "popup-window"
    });
  });

  it("keeps taskbar-tab windows out of the shell", () => {
    const documentRef = makeDocument({
      windowtype: "navigator:browser",
      taskbartab: ""
    });
    const windowRef = makeWindow({ document: documentRef });

    expect(describeNodelyShellEligibility(windowRef as any, documentRef as any)).toEqual({
      enabled: false,
      reason: "taskbar-tab"
    });
  });
});
