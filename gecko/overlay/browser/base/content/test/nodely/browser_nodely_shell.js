async function waitForNodely(win) {
  if (win.__nodelyTest?.getState?.().workspace) {
    return win.__nodelyTest;
  }

  await BrowserTestUtils.waitForEvent(win, "nodely-ready");
  return win.__nodelyTest;
}

add_task(async function test_nodely_first_root_focus_and_drawer_overlay() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["nodely.shell.enabled", true],
      ["nodely.testing.enabled", true],
      ["nodely.testing.workspace_namespace", "nodely-browser-test-startup"],
    ],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow();

  try {
    const api = await waitForNodely(win);

    await TestUtils.waitForCondition(
      () => win.document.documentElement.getAttribute("nodely-active") === "true",
      "The Nodely shell should own the browser chrome."
    );
    Assert.equal(
      win.document.documentElement.getAttribute("nodely-empty-workspace"),
      "true",
      "A fresh testing workspace should start empty."
    );

    await api.controller.createRootFromInput("https://example.com/");
    const state = await api.waitForState(
      current =>
        current.workspace?.nodes?.length === 1 &&
        current.workspace.nodes[0].url?.includes("example.com"),
      "The first root should be created."
    );

    Assert.equal(state.workspace.nodes.length, 1, "The workspace should contain one root node.");
    Assert.equal(
      win.document.documentElement.getAttribute("nodely-empty-workspace"),
      "false",
      "The empty workspace attribute should clear once a page exists."
    );

    await api.controller.setViewMode("focus");
    await TestUtils.waitForCondition(
      () => win.document.documentElement.getAttribute("nodely-view") === "focus",
      "Focus mode should apply to the browser chrome."
    );
    Assert.ok(api.shell.graph.hidden, "The canvas rail should hide in focus mode.");

    const favoritesButton = win.document.querySelector(
      ".nodely-shell__topbar [data-drawer='favorites']"
    );
    favoritesButton.click();

    await TestUtils.waitForCondition(
      () => win.document.documentElement.getAttribute("nodely-drawer") === "favorites",
      "The favorites drawer should open."
    );
    Assert.equal(
      win.document.documentElement.getAttribute("nodely-browser-surface"),
      "overlay",
      "Opening a drawer should hide the hosted page surface behind the overlay."
    );

    EventUtils.synthesizeKey("KEY_Escape", {}, win);
    await TestUtils.waitForCondition(
      () => win.document.documentElement.getAttribute("nodely-drawer") === "",
      "Escape should dismiss the active drawer."
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_nodely_workspace_restore_and_keyboard_panels() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["nodely.shell.enabled", true],
      ["nodely.testing.enabled", true],
      ["nodely.testing.workspace_namespace", "nodely-browser-test-restore"],
    ],
  });

  let win = await BrowserTestUtils.openNewBrowserWindow();

  try {
    let api = await waitForNodely(win);

    await api.controller.createRootFromInput("https://example.org/");
    await api.waitForState(
      current =>
        current.workspace?.nodes?.length === 1 &&
        current.workspace.nodes[0].url?.includes("example.org"),
      "The restore workspace should get a saved root."
    );
    await api.flushWorkspace();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }

  win = await BrowserTestUtils.openNewBrowserWindow();

  try {
    const api = await waitForNodely(win);
    const restoredState = await api.waitForState(
      current =>
        current.workspace?.nodes?.length === 1 &&
        current.workspace.nodes[0].url?.includes("example.org"),
      "The saved workspace should reopen in a new browser window."
    );

    Assert.equal(restoredState.workspace.nodes.length, 1, "The saved root should restore.");

    EventUtils.synthesizeKey("f", { accelKey: true }, win);
    await TestUtils.waitForCondition(() => api.shell.findOpen, "Accel+F should open the Nodely find panel.");

    EventUtils.synthesizeKey("p", { accelKey: true }, win);
    await TestUtils.waitForCondition(() => api.shell.printSheetOpen, "Accel+P should open the Nodely print panel.");
    Assert.ok(!api.shell.findOpen, "Opening print should close the inline find surface.");

    EventUtils.synthesizeKey("KEY_Escape", {}, win);
    await TestUtils.waitForCondition(
      () => !api.shell.printSheetOpen,
      "Escape should dismiss the print panel."
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
});
