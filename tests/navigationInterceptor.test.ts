import { describe, expect, it, vi } from "vitest";
import { attachNavigationInterceptors } from "../src/main/navigationInterceptor";

class MockContents {
  private readonly listeners = new Map<string, (...args: any[]) => void>();
  private windowOpenHandler: ((details: { url: string }) => { action: "deny" | "allow" }) | null = null;

  on(eventName: string, listener: (...args: any[]) => void) {
    this.listeners.set(eventName, listener);
    return this;
  }

  removeListener(eventName: string, listener: (...args: any[]) => void) {
    const currentListener = this.listeners.get(eventName);

    if (currentListener === listener) {
      this.listeners.delete(eventName);
    }

    return this;
  }

  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" | "allow" }) {
    this.windowOpenHandler = handler;
    return this;
  }

  emitWillNavigate(details: { url: string; isMainFrame: boolean; isSameDocument: boolean }, eventName = "will-navigate") {
    let prevented = false;
    this.listeners.get(eventName)?.({
      ...details,
      preventDefault() {
        prevented = true;
      }
    });

    return prevented;
  }

  emitLegacyWillNavigate(details: { url: string; isMainFrame: boolean; isSameDocument: boolean }) {
    let prevented = false;
    this.listeners.get("will-navigate")?.(
      {
        preventDefault() {
          prevented = true;
        }
      },
      details.url,
      details.isSameDocument,
      details.isMainFrame
    );

    return prevented;
  }

  emitWindowOpen(url: string) {
    return this.windowOpenHandler?.({ url });
  }
}

describe("attachNavigationInterceptors", () => {
  it("branches and prevents default on top-level navigations", async () => {
    const onBranchNavigation = vi.fn();
    const contents = new MockContents();

    attachNavigationInterceptors(contents as never, "parent-node", onBranchNavigation);

    const prevented = contents.emitWillNavigate({
      url: "https://example.com/branch",
      isMainFrame: true,
      isSameDocument: false
    });

    expect(prevented).toBe(true);
    expect(onBranchNavigation).toHaveBeenCalledWith({
      parentNodeId: "parent-node",
      url: "https://example.com/branch",
      origin: "link"
    });
  });

  it("branches once when Electron emits both frame and top-level navigate events", () => {
    const onBranchNavigation = vi.fn();
    const contents = new MockContents();

    attachNavigationInterceptors(contents as never, "parent-node", onBranchNavigation);

    contents.emitWillNavigate(
      {
        url: "https://example.com/branch",
        isMainFrame: true,
        isSameDocument: false
      },
      "will-frame-navigate"
    );
    contents.emitWillNavigate({
      url: "https://example.com/branch",
      isMainFrame: true,
      isSameDocument: false
    });

    expect(onBranchNavigation).toHaveBeenCalledTimes(1);
    expect(onBranchNavigation).toHaveBeenCalledWith({
      parentNodeId: "parent-node",
      url: "https://example.com/branch",
      origin: "link"
    });
  });

  it("denies window.open and turns it into a child branch", () => {
    const onBranchNavigation = vi.fn();
    const contents = new MockContents();

    attachNavigationInterceptors(contents as never, "parent-node", onBranchNavigation);

    const response = contents.emitWindowOpen("https://example.com/new-window");

    expect(response).toEqual({ action: "deny" });
    expect(onBranchNavigation).toHaveBeenCalledWith({
      parentNodeId: "parent-node",
      url: "https://example.com/new-window",
      origin: "window-open"
    });
  });

  it("does not branch subframe or same-document navigations", () => {
    const onBranchNavigation = vi.fn();
    const contents = new MockContents();

    attachNavigationInterceptors(contents as never, "parent-node", onBranchNavigation);

    const preventedSubframe = contents.emitWillNavigate({
      url: "https://example.com/frame",
      isMainFrame: false,
      isSameDocument: false
    });
    const preventedSameDocument = contents.emitWillNavigate({
      url: "https://example.com/page#section",
      isMainFrame: true,
      isSameDocument: true
    });

    expect(preventedSubframe).toBe(false);
    expect(preventedSameDocument).toBe(false);
    expect(onBranchNavigation).not.toHaveBeenCalled();
  });

  it("supports Electron's legacy will-navigate callback arguments", () => {
    const onBranchNavigation = vi.fn();
    const contents = new MockContents();

    attachNavigationInterceptors(contents as never, "parent-node", onBranchNavigation);

    const prevented = contents.emitLegacyWillNavigate({
      url: "https://example.com/legacy",
      isMainFrame: true,
      isSameDocument: false
    });

    expect(prevented).toBe(true);
    expect(onBranchNavigation).toHaveBeenCalledWith({
      parentNodeId: "parent-node",
      url: "https://example.com/legacy",
      origin: "link"
    });
  });
});
