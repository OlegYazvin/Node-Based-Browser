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

describe("BrowserBasicsBridge persistent storage prompt handling", () => {
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
});
