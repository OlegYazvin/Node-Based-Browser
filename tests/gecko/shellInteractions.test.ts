import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const originalWindow = globalThis.window;
const originalHTMLElement = globalThis.HTMLElement;
const originalResizeObserver = globalThis.ResizeObserver;
const originalCustomElements = globalThis.customElements;

let NodelyShell;
let findNodeJumpSuggestions;
let createEmptyWorkspace;
let createRootNode;
let createChildNode;
let updateNodeMetadata;

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

  ({ NodelyShell, findNodeJumpSuggestions } = await import(
    "../../gecko/overlay/browser/base/content/nodely/nodely-shell.mjs"
  ));
  ({ createEmptyWorkspace, createRootNode, createChildNode, updateNodeMetadata } = await import(
    "../../gecko/overlay/browser/base/content/nodely/domain.mjs"
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

  it("uses Ctrl/Cmd+\\ to reopen the selected node from focus-mode canvas", () => {
    const shell = new NodelyShell();
    const selectNode = vi.fn();
    shell.state = {
      workspace: {
        selectedNodeId: "node-7",
        prefs: {
          viewMode: "focus",
          surfaceMode: "canvas"
        }
      }
    };
    shell.controller = { selectNode };
    shell.dismissTransientUi = vi.fn(() => false);
    const preventDefault = vi.fn();

    shell.handleWindowKeydown({
      key: "\\",
      code: "Backslash",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target: { tagName: "DIV" },
      preventDefault
    });

    expect(selectNode).toHaveBeenCalledWith("node-7");
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("uses Ctrl/Cmd+\\ to hide the active node and return to canvas in focus mode", () => {
    const shell = new NodelyShell();
    const setSurfaceMode = vi.fn();
    shell.state = {
      workspace: {
        selectedNodeId: "node-7",
        prefs: {
          viewMode: "focus",
          surfaceMode: "page"
        }
      }
    };
    shell.controller = { setSurfaceMode };
    const preventDefault = vi.fn();

    shell.handleWindowKeydown({
      key: "\\",
      code: "Backslash",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
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

  it("finds good node jump suggestions from typed combo-bar text", () => {
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = updateNodeMetadata(workspace, rootId, {
      title: "Company List - Google Docs",
      url: "https://docs.google.com/document/d/example/edit"
    });
    workspace = createChildNode(workspace, rootId, "manual", { selectChild: false });
    const childId = workspace.nodes.at(-1)?.id as string;
    workspace = updateNodeMetadata(workspace, childId, {
      title: "OpenAI Pricing Overview",
      url: "https://openai.com/pricing"
    });

    const suggestions = findNodeJumpSuggestions(workspace, "pricing");

    expect(suggestions[0]).toEqual(
      expect.objectContaining({
        nodeId: childId,
        title: "OpenAI Pricing Overview"
      })
    );
  });

  it("lets the graph pane grow to half of the viewport in split mode", () => {
    const shell = new NodelyShell();
    globalThis.window.innerWidth = 1440;
    shell.state = {
      workspace: {
        nodes: [
          {
            id: "node-1",
            kind: "page",
            parentId: null,
            rootId: "node-1",
            title: "Example",
            url: "https://example.com",
            position: { x: 0, y: 0 }
          }
        ],
        selectedNodeId: "node-1",
        prefs: {
          viewMode: "split",
          splitWidth: 340
        }
      }
    };
    shell.splitResizeState = {
      pointerId: 7
    };
    shell.syncDocumentLayout = vi.fn();

    shell.handleSplitResizeMove({
      pointerId: 7,
      clientX: 720
    });

    expect(shell.splitWidthOverride).toBe(720);
    expect(shell.syncDocumentLayout).toHaveBeenCalledTimes(1);
  });
});
