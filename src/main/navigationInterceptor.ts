import type { NodeOrigin } from "../shared/types";

export interface BranchNavigationRequest {
  parentNodeId: string;
  url: string;
  origin: Extract<NodeOrigin, "link" | "window-open">;
}

export interface InterceptableContents {
  on: Electron.WebContents["on"];
  removeListener: Electron.WebContents["removeListener"];
  setWindowOpenHandler: Electron.WebContents["setWindowOpenHandler"];
}

interface NormalizedNavigationDetails {
  preventDefault(): void;
  url: string;
  isMainFrame: boolean;
  isSameDocument: boolean;
}

function normalizeNavigationArgs(args: any[]): NormalizedNavigationDetails | null {
  const [firstArg, secondArg, thirdArg, fourthArg] = args;

  if (firstArg && typeof firstArg === "object" && typeof firstArg.url === "string") {
    return {
      preventDefault: typeof firstArg.preventDefault === "function" ? () => firstArg.preventDefault() : () => {},
      url: firstArg.url,
      isMainFrame: Boolean(firstArg.isMainFrame),
      isSameDocument: Boolean(firstArg.isSameDocument)
    };
  }

  if (firstArg && typeof firstArg.preventDefault === "function" && typeof secondArg === "string") {
    return {
      preventDefault: () => firstArg.preventDefault(),
      url: secondArg,
      isSameDocument: Boolean(thirdArg),
      isMainFrame: Boolean(fourthArg)
    };
  }

  return null;
}

export function attachNavigationInterceptors(
  contents: InterceptableContents,
  nodeId: string,
  onBranchNavigation: (request: BranchNavigationRequest) => void | Promise<void>
) {
  const interceptableContents = contents as unknown as {
    on(eventName: string, listener: (...args: any[]) => void): unknown;
    removeListener(eventName: string, listener: (...args: any[]) => void): unknown;
    setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" | "allow" }): unknown;
  };
  let lastNavigationKey: string | null = null;
  let lastNavigationTimestamp = 0;

  const handleNavigation = (details: NormalizedNavigationDetails) => {
    if (!details.isMainFrame || details.isSameDocument) {
      return;
    }

    const navigationKey = `${nodeId}:${details.url}`;
    const now = Date.now();

    if (lastNavigationKey === navigationKey && now - lastNavigationTimestamp < 250) {
      return;
    }

    lastNavigationKey = navigationKey;
    lastNavigationTimestamp = now;
    details.preventDefault();
    void onBranchNavigation({
      parentNodeId: nodeId,
      url: details.url,
      origin: "link"
    });
  };

  const willNavigateListener = (...args: any[]) => {
    const details = normalizeNavigationArgs(args);

    if (!details) {
      return;
    }

    handleNavigation(details);
  };

  interceptableContents.on("will-navigate", willNavigateListener);
  interceptableContents.on("will-frame-navigate", willNavigateListener);
  interceptableContents.setWindowOpenHandler((details) => {
    void onBranchNavigation({
      parentNodeId: nodeId,
      url: details.url,
      origin: "window-open"
    });

    return { action: "deny" };
  });

  return () => {
    interceptableContents.removeListener("will-navigate", willNavigateListener);
    interceptableContents.removeListener("will-frame-navigate", willNavigateListener);
    interceptableContents.setWindowOpenHandler(() => ({ action: "deny" }));
  };
}
