import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { syncLooseRuntimeOverlay } from "../../gecko/scripts/sync-overlay.mjs";

describe("sync-overlay", () => {
  it("patches loose runtime browser files after artifact extraction", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-runtime-sync-"));
    const runtimeBrowserDirectory = path.join(
      tempDirectory,
      "obj-nodely",
      "dist",
      "bin",
      "browser",
      "chrome",
      "browser",
      "content",
      "browser"
    );
    const runtimeDefaultsDirectory = path.join(
      tempDirectory,
      "obj-nodely",
      "dist",
      "bin",
      "browser",
      "defaults",
      "preferences"
    );

    try {
      await mkdir(runtimeBrowserDirectory, { recursive: true });
      await mkdir(runtimeDefaultsDirectory, { recursive: true });
      await writeFile(
        path.join(runtimeBrowserDirectory, "browser.xhtml"),
        "<html><head></head><html:body></html:body></html>",
        "utf8"
      );
      await writeFile(
        path.join(runtimeDefaultsDirectory, "firefox.js"),
        [
          'pref("browser.startup.page",                1);',
          'pref("browser.startup.homepage",            "about:home");',
          'pref("browser.aboutwelcome.enabled", true);'
        ].join("\n"),
        "utf8"
      );

      expect(syncLooseRuntimeOverlay(tempDirectory)).toBe(true);

      const browserXhtml = await readFile(path.join(runtimeBrowserDirectory, "browser.xhtml"), "utf8");
      const firefoxDefaults = await readFile(path.join(runtimeDefaultsDirectory, "firefox.js"), "utf8");

      expect(browserXhtml).toContain("chrome://browser/content/nodely/nodely-shell.css");
      expect(browserXhtml).toContain("chrome://browser/content/nodely/nodely-bootstrap.mjs");
      expect(firefoxDefaults).toContain('pref("browser.startup.page",                0);');
      expect(firefoxDefaults).toContain('pref("browser.newtabpage.enabled", false);');

      await access(path.join(runtimeBrowserDirectory, "nodely", "nodely-shell.mjs"));
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
