import { test } from "@playwright/test";

test.describe("nodely browser smoke flow", () => {
  test.skip("launches the Electron shell and exercises the core Nodely flow", async () => {
    // This scaffold is intentionally skipped in automated runs until a stable
    // CI launch harness is added for the packaged Electron app.
  });
});
