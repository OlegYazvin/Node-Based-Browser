import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const originalWindow = globalThis.window;
const originalHTMLElement = globalThis.HTMLElement;
const originalResizeObserver = globalThis.ResizeObserver;
const originalCustomElements = globalThis.customElements;

let NodelyGraphSurface;

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

  ({ NodelyGraphSurface } = await import(
    "../../gecko/overlay/browser/base/content/nodely/nodely-graph-surface.mjs"
  ));
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

describe("NodelyGraphSurface pointer selection", () => {
  it("dispatches node selection on click", () => {
    const surface = new NodelyGraphSurface();
    const dispatchNodeSelection = vi
      .spyOn(surface, "dispatchNodeSelection")
      .mockImplementation(() => {});
    const nodeElement = {
      dataset: { nodeId: "node-1" }
    };

    surface.handleNodeClick({
      target: {
        closest: vi.fn(() => nodeElement)
      }
    });

    expect(dispatchNodeSelection).toHaveBeenCalledWith("node-1");
  });

  it("opens a node menu on node contextmenu", () => {
    const surface = new NodelyGraphSurface();
    const dispatchNodeMenuOpen = vi
      .spyOn(surface, "dispatchNodeMenuOpen")
      .mockImplementation(() => {});
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    surface.handleContextMenu({
      clientX: 96,
      clientY: 164,
      target: {
        closest: vi.fn((selector) =>
          selector.includes(".nodely-graph-node")
            ? { dataset: { nodeId: "node-1" } }
            : null
        )
      },
      preventDefault,
      stopPropagation
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchNodeMenuOpen).toHaveBeenCalledWith("node-1", {
      clientX: 96,
      clientY: 164
    });
  });

  it("opens the root composer on background contextmenu", () => {
    const surface = new NodelyGraphSurface();
    const dispatchComposerOpen = vi
      .spyOn(surface, "dispatchComposerOpen")
      .mockImplementation(() => {});
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    surface.handleContextMenu({
      target: {
        closest: vi.fn((selector) => {
          if (selector.includes(".nodely-graph-node")) {
            return null;
          }

          if (selector.includes(".nodely-graph-surface__stage")) {
            return { className: "nodely-graph-surface__stage" };
          }

          return null;
        })
      },
      clientX: 140,
      clientY: 220,
      preventDefault,
      stopPropagation
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchComposerOpen).toHaveBeenCalledWith({
      clientX: 140,
      clientY: 220
    });
  });

  it("dispatches auto-organize from the canvas toolbar", () => {
    const surface = new NodelyGraphSurface();
    const dispatchEvent = vi.spyOn(surface, "dispatchEvent");
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    surface.handleMinimapToolbarClick({
      preventDefault,
      stopPropagation,
      target: {
        closest: vi.fn(() => ({
          dataset: { action: "auto-organize" }
        }))
      }
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "nodely-auto-organize"
      })
    );
  });

  it("creates graph node buttons through the surface ownerDocument", () => {
    const surface = new NodelyGraphSurface();
    const createdElement = {
      type: "",
      className: "",
      dataset: {},
      style: { setProperty: vi.fn() },
      addEventListener: vi.fn(),
      remove: vi.fn(),
      innerHTML: ""
    };
    const createElementNS = vi.fn(() => createdElement);

    surface.ownerDocument = {
      createElementNS
    };
    surface.nodeLayer = {
      appendChild: vi.fn()
    };
    surface.nodeElements = new Map();
    surface.viewport = { x: 0, y: 0, zoom: 1 };
    surface.workspace = {
      nodes: [
        {
          id: "node-1",
          kind: "page",
          parentId: null,
          title: "Example",
          url: "https://example.com",
          position: { x: 20, y: 30 }
        }
      ],
      edges: [],
      selectedNodeId: "node-1"
    };

    surface.reconcileNodes(new Map());

    expect(createElementNS).toHaveBeenCalledWith("http://www.w3.org/1999/xhtml", "button");
    expect(surface.nodeLayer.appendChild).toHaveBeenCalledWith(createdElement);
  });

  it("tracks hovered nodes through the render path", () => {
    const surface = new NodelyGraphSurface();
    const requestRender = vi.spyOn(surface, "requestRender").mockImplementation(() => {});

    surface.setHoveredNode("node-1");

    expect(requestRender).toHaveBeenCalledWith({
      nodes: true
    });
    expect(surface.hoveredNodeId).toBe("node-1");

    surface.setHoveredNode(null);

    expect(surface.hoveredNodeId).toBeNull();
  });

  it("renders a readable hover label overlay for the hovered node", () => {
    const surface = new NodelyGraphSurface();
    const style = {
      maxWidth: "",
      transform: "",
      setProperty: vi.fn()
    };

    surface.dataset = {};
    surface.hoverLabel = {
      hidden: true,
      textContent: "",
      style,
      getBoundingClientRect: vi.fn(() => ({
        width: 180,
        height: 42
      }))
    };
    surface.viewport = { x: 0, y: 0, zoom: 0.6 };
    surface.workspace = {
      nodes: [
        {
          id: "node-1",
          kind: "page",
          parentId: null,
          rootId: "node-1",
          title: "Yama Seafood Delivery",
          url: "https://example.com",
          position: { x: 240, y: 180 }
        }
      ],
      edges: [],
      selectedNodeId: "node-1"
    };
    surface.hoveredNodeId = "node-1";

    surface.updateHoverLabel(
      {
        width: 800,
        height: 600
      },
      new Map()
    );

    expect(surface.hoverLabel.hidden).toBe(false);
    expect(surface.hoverLabel.textContent).toBe("Yama Seafood Delivery");
    expect(surface.dataset.hoverLabelVisible).toBe("true");
    expect(style.setProperty).toHaveBeenCalledWith("--nodely-hover-accent", expect.any(String));
    expect(style.transform).toMatch(/^translate3d\(/u);
  });
});
