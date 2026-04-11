import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const originalWindow = globalThis.window;
const originalHTMLElement = globalThis.HTMLElement;
const originalResizeObserver = globalThis.ResizeObserver;
const originalCustomElements = globalThis.customElements;

let NodelyShell;

beforeAll(async () => {
  class FakeHTMLElement extends EventTarget {}

  class FakeResizeObserver {
    observe() {}

    disconnect() {}
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn(() => 0),
      cancelAnimationFrame: vi.fn()
    }
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeHTMLElement
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: FakeResizeObserver
  });
  Object.defineProperty(globalThis, "customElements", {
    configurable: true,
    value: {
      define: vi.fn(),
      get: vi.fn(() => undefined)
    }
  });

  ({ NodelyShell } = await import(
    "../../gecko/overlay/browser/base/content/nodely/nodely-shell.mjs"
  ));
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: originalHTMLElement
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: originalResizeObserver
  });
  Object.defineProperty(globalThis, "customElements", {
    configurable: true,
    value: originalCustomElements
  });
});

describe("NodelyShell focus and context interactions", () => {
  it("uses Escape to return to the canvas from focus mode when no transient UI is open", () => {
    const shell = new NodelyShell();
    const setSurfaceMode = vi.fn();
    shell.state = {
      workspace: {
        prefs: {
          viewMode: "focus",
          surfaceMode: "page"
        }
      }
    };
    shell.controller = { setSurfaceMode };
    shell.dismissTransientUi = vi.fn(() => false);
    const preventDefault = vi.fn();

    shell.handleWindowKeydown({
      key: "Escape",
      target: { tagName: "DIV" },
      preventDefault
    });

    expect(setSurfaceMode).toHaveBeenCalledWith("canvas");
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("keeps a freshly opened context menu available until the opening click cycle has passed", () => {
    const shell = new NodelyShell();
    shell.contextMenu = {
      contains: vi.fn(() => false)
    };
    shell.contextMenuState = {
      kind: "node",
      nodeId: "node-1",
      anchor: { clientX: 64, clientY: 96 }
    };
    shell.contextMenuOpenedAt = 1000;
    const closeContextMenu = vi.spyOn(shell, "closeContextMenu");
    const render = vi.spyOn(shell, "render").mockImplementation(() => {});
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(1100);
    shell.handleWindowClick({
      button: 0,
      target: {}
    });

    expect(closeContextMenu).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(1300);
    shell.handleWindowClick({
      button: 0,
      target: {}
    });

    expect(closeContextMenu).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
