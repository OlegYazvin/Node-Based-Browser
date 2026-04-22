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
let selectNode;
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
      requestAnimationFrame: vi.fn((callback) => {
        callback();
        return 0;
      }),
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
  ({ createEmptyWorkspace, createRootNode, createChildNode, selectNode, updateNodeMetadata } = await import(
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

  it("reroutes Ctrl/Cmd+L into Nodely's own location input", () => {
    const shell = new NodelyShell();
    const focusPreferredLocationInput = vi.spyOn(shell, "focusPreferredLocationInput").mockReturnValue(true);
    const dismissNativeLocationOverlay = vi
      .spyOn(shell, "dismissNativeLocationOverlay")
      .mockReturnValue(true);
    const preventDefault = vi.fn();

    shell.handleWindowKeydown({
      key: "l",
      code: "KeyL",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target: { tagName: "DIV" },
      preventDefault
    });

    expect(focusPreferredLocationInput).toHaveBeenCalledTimes(1);
    expect(dismissNativeLocationOverlay).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("reroutes Browser:OpenLocation commands into Nodely's own location input", () => {
    const shell = new NodelyShell();
    const focusPreferredLocationInput = vi.spyOn(shell, "focusPreferredLocationInput").mockReturnValue(true);
    const dismissNativeLocationOverlay = vi
      .spyOn(shell, "dismissNativeLocationOverlay")
      .mockReturnValue(true);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const stopImmediatePropagation = vi.fn();

    shell.handleDocumentCommand({
      target: { id: "Browser:OpenLocation" },
      preventDefault,
      stopPropagation,
      stopImmediatePropagation
    });

    expect(focusPreferredLocationInput).toHaveBeenCalledTimes(1);
    expect(dismissNativeLocationOverlay).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });

  it("dispatches the experimental Chrome extension enable action from the pagebar", () => {
    const shell = new NodelyShell();
    const setExperimentalChromeExtensionsEnabled = vi.fn();
    shell.controller = {
      setExperimentalChromeExtensionsEnabled
    };

    shell.handlePagebarClick({
      target: {
        closest: vi.fn((selector) =>
          selector === "[data-action]"
            ? {
                dataset: {
                  action: "enable-experimental-chrome-extensions"
                }
              }
            : null
        )
      }
    });

    expect(setExperimentalChromeExtensionsEnabled).toHaveBeenCalledWith(true);
  });

  it("dispatches a Chrome Web Store compat install from the pagebar", () => {
    const shell = new NodelyShell();
    const installChromeStoreExtension = vi.fn();
    shell.controller = {
      installChromeStoreExtension
    };

    shell.handlePagebarClick({
      target: {
        closest: vi.fn((selector) =>
          selector === "[data-action]"
            ? {
                dataset: {
                  action: "install-chrome-store-extension",
                  extensionId: "kojhnafkiednagnljfgakalcbfbklbdk"
                }
              }
            : null
        )
      }
    });

    expect(installChromeStoreExtension).toHaveBeenCalledWith(
      "kojhnafkiednagnljfgakalcbfbklbdk"
    );
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

  it("autosaves tree drawer renames when the input blurs out of the row", () => {
    const shell = new NodelyShell();
    const renameTree = vi.fn();
    const form = {
      dataset: { rootId: "root-1" },
      contains: vi.fn(() => false),
      querySelector: vi.fn(() => ({
        value: "Renamed Tree",
        dataset: { initialValue: "Original Tree" },
        title: "Original Tree"
      }))
    };
    const input = {
      closest: vi.fn((selector) => (selector === "form[data-root-id]" ? form : null))
    };
    shell.controller = { renameTree };

    shell.handleTreesFocusOut({
      target: {
        closest: vi.fn((selector) => (selector === "input[name='title']" ? input : null))
      },
      relatedTarget: null
    });

    expect(renameTree).toHaveBeenCalledWith("root-1", "Renamed Tree");
  });

  it("opens the tree preview picker instead of immediately switching trees from the drawer", () => {
    const shell = new NodelyShell();
    const form = { dataset: { rootId: "root-7" } };
    const button = {
      dataset: { action: "show-tree", rootId: "root-7" },
      closest: vi.fn((selector) => (selector === "form[data-root-id]" ? form : null))
    };
    const commitDrawerTreeRename = vi
      .spyOn(shell, "commitDrawerTreeRename")
      .mockImplementation(() => {});
    const openTreePreview = vi.spyOn(shell, "openTreePreview").mockImplementation(() => {});

    shell.handleTreesClick({
      target: {
        closest: vi.fn((selector) => (selector === "[data-action]" ? button : null))
      }
    });

    expect(commitDrawerTreeRename).toHaveBeenCalledWith(form);
    expect(openTreePreview).toHaveBeenCalledWith("root-7");
  });

  it("lets the pagebar tree action reopen the root composer", () => {
    const shell = new NodelyShell();
    const openComposer = vi.spyOn(shell, "openComposer").mockImplementation(() => {});
    const closeComposer = vi.spyOn(shell, "closeComposer").mockImplementation(() => {});
    const render = vi.spyOn(shell, "render").mockImplementation(() => {});

    shell.composerOpen = false;
    shell.handlePagebarClick({
      target: {
        closest: vi.fn((selector) =>
          selector === "[data-action]"
            ? {
                dataset: { action: "toggle-composer" }
              }
            : null
        )
      }
    });

    expect(openComposer).toHaveBeenCalledTimes(1);

    shell.composerOpen = true;
    shell.handlePagebarClick({
      target: {
        closest: vi.fn((selector) =>
          selector === "[data-action]"
            ? {
                dataset: { action: "toggle-composer" }
              }
            : null
        )
      }
    });

    expect(closeComposer).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("opens an ancestry menu from the pagebar ellipsis using the hidden ancestors of the selected node", () => {
    const shell = new NodelyShell();
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId;
    workspace = updateNodeMetadata(workspace, rootId, { title: "Root" });
    workspace = createChildNode(workspace, rootId, "manual");
    const hiddenAncestorId = workspace.selectedNodeId;
    workspace = updateNodeMetadata(workspace, hiddenAncestorId, { title: "Hidden" });
    workspace = createChildNode(workspace, hiddenAncestorId, "manual");
    const parentId = workspace.selectedNodeId;
    workspace = updateNodeMetadata(workspace, parentId, { title: "Parent" });
    workspace = createChildNode(workspace, parentId, "manual");
    const currentId = workspace.selectedNodeId;
    workspace = updateNodeMetadata(workspace, currentId, { title: "Current" });
    workspace = selectNode(workspace, currentId);
    shell.state = { workspace };

    const openContextMenu = vi.spyOn(shell, "openContextMenu").mockImplementation(() => {});

    shell.handlePagebarClick({
      clientX: 0,
      clientY: 0,
      target: {
        closest: vi.fn((selector) =>
          selector === "[data-action]"
            ? {
                dataset: { action: "open-ancestry-menu" },
                getBoundingClientRect: () => ({ left: 12, bottom: 44 })
              }
            : null
        )
      }
    });

    expect(openContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "ancestry",
        nodeIds: [hiddenAncestorId],
        anchor: { clientX: 12, clientY: 44 }
      })
    );
  });

  it("opens a tab context menu when right-clicking a page tab", () => {
    const shell = new NodelyShell();
    let workspace = createRootNode(createEmptyWorkspace());
    const rootId = workspace.selectedNodeId as string;
    workspace = updateNodeMetadata(workspace, rootId, {
      title: "Root",
      url: "https://example.com/root"
    });
    shell.state = { workspace };

    const openContextMenu = vi.spyOn(shell, "openContextMenu").mockImplementation(() => {});
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    shell.handlePagebarContextMenu({
      clientX: 18,
      clientY: 42,
      preventDefault,
      stopPropagation,
      target: {
        closest: vi.fn((selector) =>
          selector === ".nodely-shell__tab[data-node-id]"
            ? {
                dataset: { nodeId: rootId }
              }
            : null
        )
      }
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(openContextMenu).toHaveBeenCalledWith({
      kind: "tab",
      nodeId: rootId,
      anchor: { clientX: 18, clientY: 42 }
    });
  });

  it("selects a hidden ancestor from the ancestry menu and closes the menu", () => {
    const shell = new NodelyShell();
    const selectNodeController = vi.fn();
    const render = vi.spyOn(shell, "render").mockImplementation(() => {});
    shell.controller = {
      selectNode: selectNodeController
    };
    shell.contextMenuState = {
      kind: "ancestry",
      nodeIds: ["node-hidden"],
      anchor: { clientX: 1, clientY: 1 }
    };

    shell.handleContextMenuClick({
      target: {
        closest: vi.fn((selector) =>
          selector === "[data-action]"
            ? {
                dataset: {
                  action: "select-ancestor-node",
                  nodeId: "node-hidden"
                }
              }
            : null
        )
      }
    });

    expect(selectNodeController).toHaveBeenCalledWith("node-hidden");
    expect(shell.contextMenuState).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("dispatches subtree deletion from the context menu and closes it", () => {
    const shell = new NodelyShell();
    const killSubtree = vi.fn();
    const render = vi.spyOn(shell, "render").mockImplementation(() => {});
    shell.controller = { killSubtree };
    shell.contextMenuState = {
      kind: "node",
      nodeId: "node-branch",
      anchor: { clientX: 1, clientY: 1 }
    };

    shell.handleContextMenuClick({
      target: {
        closest: vi.fn((selector) =>
          selector === "[data-action]"
            ? {
                dataset: {
                  action: "kill-subtree-context",
                  nodeId: "node-branch"
                }
              }
            : null
        )
      }
    });

    expect(killSubtree).toHaveBeenCalledWith("node-branch");
    expect(shell.contextMenuState).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
