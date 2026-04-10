import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  patchCrashReporterFtlContents,
  patchCrashReporterMacPlistContents,
  syncLooseRuntimeOverlay,
  syncPackagedRuntimeOmniOverlay
} from "../../gecko/scripts/sync-overlay.mjs";

describe("sync-overlay", () => {
  it("brands crash reporter strings with Nodely and the report email", () => {
    const patched = patchCrashReporterFtlContents(
      [
        "crashreporter-branded-title = { -brand-short-name } Crash Reporter",
        "crashreporter-crashed-and-restore = { -brand-short-name } had a problem and crashed. We’ll try to restore your tabs and windows when it restarts.",
        "crashreporter-plea = To help us diagnose and fix the problem, you can send us a crash report.",
        "crashreporter-information = This application is run after a crash to report the problem to { -vendor-short-name }. It should not be run directly.",
        "crashreporter-error = { -brand-short-name } had a problem and crashed. Unfortunately, the crash reporter is unable to submit a report for this crash.",
        "crashreporter-no-run-message = This application is run after a crash to report the problem to the application vendor. It should not be run directly.",
        "crashreporter-checkbox-send-report = Tell { -vendor-short-name } about this crash so they can fix it.",
        "crashreporter-submit-success = Report submitted successfully!",
        "crashreporter-submit-failure = There was a problem submitting your report."
      ].join("\n")
    );

    expect(patched).toContain("crashreporter-branded-title = Nodely Crash Reporter");
    expect(patched).toContain("Nodely had a problem and crashed.");
    expect(patched).toContain("send a crash report to olegyazvin@gmail.com");
    expect(patched).toContain("Send this crash report to olegyazvin@gmail.com so Nodely can be fixed.");
    expect(patched).toContain("Crash report sent to olegyazvin@gmail.com.");
  });

  it("brands macOS crash reporter bundle strings idempotently", () => {
    const original = [
      "<key>CFBundleDisplayName</key>",
      "<string>@APP_NAME@ Crash Reporter</string>",
      "<key>CFBundleIdentifier</key>",
      "<string>org.mozilla.crashreporter</string>",
      "<key>CFBundleName</key>",
      "<string>Crash Reporter</string>",
      'CFBundleName = "Crash Reporter";'
    ].join("\n");

    const patched = patchCrashReporterMacPlistContents(original);
    const patchedAgain = patchCrashReporterMacPlistContents(patched);

    expect(patched).toContain("<string>Nodely Crash Reporter</string>");
    expect(patched).toContain("<string>org.nodely.crashreporter</string>");
    expect(patched).toContain('CFBundleName = "Nodely Crash Reporter";');
    expect(patchedAgain).toBe(patched);
    expect(patchedAgain).not.toContain("Nodely Nodely Crash Reporter");
  });

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
    const appArchiveDirectory = path.join(tempDirectory, "obj-nodely", "dist", "nodely");
    const stagingDirectory = path.join(tempDirectory, "archive-stage");
    const appStagingDirectory = path.join(tempDirectory, "app-archive-stage");
    const archivePath = path.join(archiveDirectory, "omni.ja");
    const appArchivePath = path.join(appArchiveDirectory, "omni.ja");

    try {
      await mkdir(path.join(stagingDirectory, "chrome", "browser", "content", "browser", "nodely"), {
        recursive: true
      });
      await mkdir(path.join(stagingDirectory, "defaults", "preferences"), {
        recursive: true
      });
      await mkdir(path.join(appStagingDirectory, "localization", "en-US", "crashreporter"), {
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
      await writeFile(
        path.join(appStagingDirectory, "localization", "en-US", "crashreporter", "crashreporter.ftl"),
        [
          "crashreporter-branded-title = { -brand-short-name } Crash Reporter",
          "crashreporter-plea = To help us diagnose and fix the problem, you can send us a crash report."
        ].join("\n"),
        "utf8"
      );

      const zipResult = spawnSync("zip", ["-qr", archivePath, "."], {
        cwd: stagingDirectory,
        encoding: "utf8"
      });
      const appZipResult = spawnSync("zip", ["-qr", appArchivePath, "."], {
        cwd: appStagingDirectory,
        encoding: "utf8"
      });

      expect(zipResult.status).toBe(0);
      expect(appZipResult.status).toBe(0);
      await writeFile(archivePath, Buffer.concat([Buffer.from("MOZLZ40\0"), await readFile(archivePath)]));
      await writeFile(appArchivePath, Buffer.concat([Buffer.from("MOZLZ40\0"), await readFile(appArchivePath)]));
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
      const crashReporterFtl = spawnSync(
        "unzip",
        ["-p", appArchivePath, "localization/en-US/crashreporter/crashreporter.ftl"],
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
      expect(crashReporterFtl).toContain("crashreporter-branded-title = Nodely Crash Reporter");
      expect(crashReporterFtl).toContain("send a crash report to olegyazvin@gmail.com");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
