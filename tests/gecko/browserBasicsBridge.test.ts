import { describe, expect, it, vi } from "vitest";

import { BrowserBasicsBridge } from "../../gecko/overlay/browser/base/content/nodely/browser-basics-bridge.mjs";

function makePersistentStorageHarness() {
  const notification = {
    id: "persistent-storage",
    message: "Allow <> to store data in persistent storage?",
    options: {
      name: "ChatGPT"
    },
    mainAction: {
      label: "Allow",
      callback: vi.fn(async () => {})
    },
    secondaryActions: [
      {
        label: "Block",
        callback: vi.fn(async () => {})
      }
    ]
  };

  const browser = {
    currentURI: { spec: "https://chatgpt.com/" },
    contentTitle: "ChatGPT",
    contentPrincipal: {
      siteOriginNoSuffix: "https://chatgpt.com"
    }
  };

  const panel = {
    state: "open",
    hidePopup: vi.fn(),
    firstElementChild: {
      checkbox: {
        checked: true
      }
    }
  };

  const windowRef = {
    gBrowser: {
      selectedBrowser: browser,
      tabContainer: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    },
    PopupNotifications: {
      getNotification: vi.fn((id) => (id === "persistent-storage" ? notification : null)),
      _remove: vi.fn(),
      panel
    }
  };

  return {
    browser,
    notification,
    panel,
    windowRef
  };
}

function makeWebRTCPromptHarness() {
  const notification = {
    id: "webRTC-shareDevices",
    anchorID: "webRTC-shareDevices-notification-icon",
    message: "Allow meet.google.com to use your camera and microphone?",
    options: {
      name: "meet.google.com"
    },
    mainAction: {
      label: "Allow",
      callback: vi.fn(async () => {})
    },
    secondaryActions: [
      {
        label: "Block",
        callback: vi.fn(async () => {})
      }
    ]
  };

  const browser = {
    currentURI: { spec: "https://meet.google.com/" },
    contentTitle: "Meet",
    contentPrincipal: {
      siteOriginNoSuffix: "https://meet.google.com"
    }
  };

  const panel = {
    state: "open",
    hidePopup: vi.fn(),
    firstElementChild: {
      checkbox: {
        checked: false
      }
    }
  };

  const windowRef = {
    gBrowser: {
      selectedBrowser: browser,
      tabContainer: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    },
    PopupNotifications: {
      getNotification: vi.fn((id) => (id === "webRTC-shareDevices" ? notification : null)),
      _remove: vi.fn(),
      panel
    }
  };

  return {
    browser,
    notification,
    panel,
    windowRef
  };
}

describe("BrowserBasicsBridge permission prompt handling", () => {
  it("mirrors the persistent storage prompt into Nodely and hides the native popup", () => {
    const { browser, notification, panel, windowRef } = makePersistentStorageHarness();
    const onPermissionPromptChanged = vi.fn();
    const bridge = new BrowserBasicsBridge(windowRef, {
      runtimeManager: {
        nodeIdForBrowser: vi.fn((targetBrowser) =>
          targetBrowser === browser ? "node-chatgpt" : null
        )
      },
      callbacks: {
        onPermissionPromptChanged
      }
    });

    bridge.syncPermissionPromptState({ hideNative: true });

    expect(windowRef.PopupNotifications.getNotification).toHaveBeenCalledWith(
      "persistent-storage",
      browser
    );
    expect(onPermissionPromptChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        kind: "persistent-storage",
        nodeId: "node-chatgpt",
        requestingUrl: "https://chatgpt.com/",
        title: "ChatGPT",
        allowLabel: notification.mainAction.label,
        blockLabel: notification.secondaryActions[0].label
      })
    );
    expect(panel.hidePopup).toHaveBeenCalledTimes(1);
  });

  it("mirrors the WebRTC camera and microphone prompt into Nodely", () => {
    const { browser, notification, panel, windowRef } = makeWebRTCPromptHarness();
    const onPermissionPromptChanged = vi.fn();
    const bridge = new BrowserBasicsBridge(windowRef, {
      runtimeManager: {
        nodeIdForBrowser: vi.fn((targetBrowser) =>
          targetBrowser === browser ? "node-meet" : null
        )
      },
      callbacks: {
        onPermissionPromptChanged
      }
    });

    bridge.syncPermissionPromptState({ hideNative: true });

    expect(windowRef.PopupNotifications.getNotification).toHaveBeenCalledWith(
      "webRTC-shareDevices",
      browser
    );
    expect(onPermissionPromptChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        kind: "media-devices",
        nodeId: "node-meet",
        requestingUrl: "https://meet.google.com/",
        title: "Camera and Microphone Request",
        body: notification.message,
        allowLabel: notification.mainAction.label,
        blockLabel: notification.secondaryActions[0].label
      })
    );
    expect(panel.hidePopup).not.toHaveBeenCalled();
  });

  it("allows the mirrored persistent storage prompt through the original Gecko callback", async () => {
    const { notification, windowRef } = makePersistentStorageHarness();
    const onPermissionPromptChanged = vi.fn();
    const bridge = new BrowserBasicsBridge(windowRef, {
      callbacks: {
        onPermissionPromptChanged
      }
    });

    bridge.activePermissionPrompt = notification;

    await expect(bridge.resolvePermissionPrompt("allow")).resolves.toBe(true);

    expect(notification.mainAction.callback).toHaveBeenCalledWith({
      checkboxChecked: true,
      source: "nodely"
    });
    expect(windowRef.PopupNotifications._remove).toHaveBeenCalledWith(notification);
    expect(onPermissionPromptChanged).toHaveBeenLastCalledWith({
      open: false,
      kind: "persistent-storage"
    });
  });

  it("allows the mirrored WebRTC prompt through the original Gecko callback", async () => {
    const { notification, windowRef } = makeWebRTCPromptHarness();
    const onPermissionPromptChanged = vi.fn();
    const bridge = new BrowserBasicsBridge(windowRef, {
      callbacks: {
        onPermissionPromptChanged
      }
    });

    bridge.activePermissionPrompt = notification;

    await expect(bridge.resolvePermissionPrompt("allow")).resolves.toBe(true);

    expect(notification.mainAction.callback).toHaveBeenCalledWith({
      checkboxChecked: false,
      source: "nodely"
    });
    expect(windowRef.PopupNotifications._remove).toHaveBeenCalledWith(notification);
    expect(onPermissionPromptChanged).toHaveBeenLastCalledWith({
      open: false,
      kind: "media-devices"
    });
  });
});

describe("BrowserBasicsBridge compat extension management", () => {
  it("syncs managed compat add-ons against Gecko add-on state", async () => {
    const windowRef = {
      gBrowser: {
        selectedBrowser: null,
        tabContainer: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        }
      },
      PopupNotifications: {
        getNotification: vi.fn(() => null),
        panel: {
          state: "closed"
        }
      }
    };
    const addon = {
      id: "kondo.chrome-compat@nodely.browser",
      version: "1.12.1",
      isActive: true,
      userDisabled: false
    };
    Object.defineProperty(globalThis, "AddonManager", {
      configurable: true,
      value: {
        getAddonByID: vi.fn(async (id) =>
          id === "kondo.chrome-compat@nodely.browser" ? addon : null
        )
      }
    });

    const bridge = new BrowserBasicsBridge(windowRef as any);
    const synced = await bridge.syncCompatExtensionsState({
      experimentalMode: true,
      extensions: [
        {
          extensionId: "kojhnafkiednagnljfgakalcbfbklbdk",
          recipeId: "kondo",
          geckoId: "kondo.chrome-compat@nodely.browser",
          name: "Kondo",
          installedVersion: "1.0.0",
          enabled: true
        }
      ]
    });

    expect(synced.extensions[0]).toEqual(
      expect.objectContaining({
        installedVersion: "1.12.1",
        installState: "installed",
        active: true
      })
    );
  });

  it("updates the desired enable state even when experimental mode is off", async () => {
    const addon = {
      disable: vi.fn(async () => {}),
      enable: vi.fn(async () => {}),
      isActive: false,
      userDisabled: true,
      version: "1.12.1"
    };
    Object.defineProperty(globalThis, "AddonManager", {
      configurable: true,
      value: {
        getAddonByID: vi.fn(async () => addon)
      }
    });

    const bridge = new BrowserBasicsBridge({
      gBrowser: {
        selectedBrowser: null,
        tabContainer: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        }
      },
      PopupNotifications: {
        getNotification: vi.fn(() => null),
        panel: {
          state: "closed"
        }
      }
    } as any);

    const record = await bridge.setCompatExtensionEnabled(
      {
        extensionId: "kojhnafkiednagnljfgakalcbfbklbdk",
        recipeId: "kondo",
        geckoId: "kondo.chrome-compat@nodely.browser",
        name: "Kondo",
        installedVersion: "1.12.1",
        enabled: true
      },
      false,
      false
    );

    expect(addon.disable).toHaveBeenCalledTimes(1);
    expect(record).toEqual(
      expect.objectContaining({
        enabled: false,
        active: false
      })
    );
  });
});

describe("BrowserBasicsBridge window attach", () => {
  it("treats duplicate upload actor registration as a harmless already-registered case", async () => {
    const duplicateRegistrationError = Object.assign(
      new Error("ChromeUtils.registerWindowActor: 'NodelyUpload' actor is already registered."),
      { name: "NotSupportedError" }
    );
    const registerWindowActor = vi.fn(() => {
      throw duplicateRegistrationError;
    });
    const importESModule = vi.fn((specifier: string) => {
      if (specifier === "resource:///actors/PromptParent.sys.mjs") {
        return {
          PromptParent: class PromptParent {
            async openPromptWithTabDialogBox() {}
          }
        };
      }

      if (specifier === "resource://gre/modules/ContentDispatchChooser.sys.mjs") {
        return {
          nsContentDispatchChooser: class nsContentDispatchChooser {
            async _prompt() {}
          }
        };
      }

      return {};
    });
    Object.defineProperty(globalThis, "ChromeUtils", {
      configurable: true,
      value: {
        registerWindowActor,
        importESModule
      }
    });

    const windowRef = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      gBrowser: {
        selectedBrowser: null,
        tabContainer: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        }
      },
      PopupNotifications: {
        getNotification: vi.fn(() => null),
        panel: {
          state: "closed",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        }
      }
    };

    const bridge = new BrowserBasicsBridge(windowRef as any);

    await expect(bridge.attach()).resolves.toBeUndefined();
    expect(registerWindowActor).toHaveBeenCalledTimes(1);
    expect(windowRef.addEventListener).toHaveBeenCalledWith(
      "nodely-upload-observed",
      expect.any(Function)
    );
  });
});
