import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  syncLooseRuntimeOverlay,
  syncPackagedRuntimeOmniOverlay
} from "../../gecko/scripts/sync-overlay.mjs";

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

  it("patches packaged browser omni.ja overlays so the real runnable build stays current", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-runtime-omni-sync-"));
    const archiveDirectory = path.join(tempDirectory, "obj-nodely", "dist", "nodely", "browser");
    const stagingDirectory = path.join(tempDirectory, "archive-stage");
    const archivePath = path.join(archiveDirectory, "omni.ja");

    try {
      await mkdir(path.join(stagingDirectory, "chrome", "browser", "content", "browser", "nodely"), {
        recursive: true
      });
      await mkdir(path.join(stagingDirectory, "defaults", "preferences"), {
        recursive: true
      });
      await mkdir(archiveDirectory, { recursive: true });

      await writeFile(
        path.join(stagingDirectory, "chrome", "browser", "content", "browser", "browser.xhtml"),
        "<html><head></head><html:body></html:body></html>",
        "utf8"
      );
      await writeFile(
        path.join(stagingDirectory, "defaults", "preferences", "firefox.js"),
        [
          'pref("browser.startup.page",                1);',
          'pref("browser.startup.homepage",            "about:home");',
          'pref("browser.aboutwelcome.enabled", true);'
        ].join("\n"),
        "utf8"
      );
      await writeFile(
        path.join(
          stagingDirectory,
          "chrome",
          "browser",
          "content",
          "browser",
          "nodely",
          "nodely-graph-surface.mjs"
        ),
        "export const stale = true;\n",
        "utf8"
      );

      const zipResult = spawnSync("zip", ["-qr", archivePath, "."], {
        cwd: stagingDirectory,
        encoding: "utf8"
      });

      expect(zipResult.status).toBe(0);
      await writeFile(archivePath, Buffer.concat([Buffer.from("MOZLZ40\0"), await readFile(archivePath)]));
      expect(syncPackagedRuntimeOmniOverlay(tempDirectory)).toBe(true);

      const browserXhtml = spawnSync("unzip", ["-p", archivePath, "chrome/browser/content/browser/browser.xhtml"], {
        encoding: "utf8"
      }).stdout;
      const firefoxDefaults = spawnSync("unzip", ["-p", archivePath, "defaults/preferences/firefox.js"], {
        encoding: "utf8"
      }).stdout;
      const graphSurface = spawnSync(
        "unzip",
        ["-p", archivePath, "chrome/browser/content/browser/nodely/nodely-graph-surface.mjs"],
        {
          encoding: "utf8"
        }
      ).stdout;

      expect(browserXhtml).toContain("chrome://browser/content/nodely/nodely-shell.css");
      expect(browserXhtml).toContain("chrome://browser/content/nodely/nodely-bootstrap.mjs");
      expect(firefoxDefaults).toContain('pref("browser.startup.page",                0);');
      expect(firefoxDefaults).toContain('pref("browser.newtabpage.enabled", false);');
      expect(graphSurface).toContain("handleNodePointerUp");
      expect(graphSurface).not.toContain("export const stale = true;");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
