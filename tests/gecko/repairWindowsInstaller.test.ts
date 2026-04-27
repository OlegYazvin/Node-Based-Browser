import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  computeMissingArchiveEntries,
  findWindowsInstallers,
  parse7zTechnicalListing,
  repairWindowsInstaller
} from "../../gecko/scripts/repair-windows-installer.mjs";
import { runtimeOverlayFileNames } from "../../gecko/scripts/sync-overlay.mjs";

type ArchiveEntry = [entryPath: string, contents: string];

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createArchive(archivePath: string, entries: ArchiveEntry[]) {
  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-windows-archive-stage-"));
  tempDirectories.push(stagingDirectory);

  for (const [entryPath, contents] of entries) {
    const targetPath = path.join(stagingDirectory, entryPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents, "utf8");
  }

  execFileSync("7z", ["a", archivePath, ...entries.map(([entryPath]) => entryPath)], {
    cwd: stagingDirectory,
    stdio: ["ignore", "ignore", "inherit"]
  });
}

async function createBrowserOmniArchive(rootDirectory: string) {
  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-browser-omni-stage-"));
  tempDirectories.push(stagingDirectory);

  for (const fileName of runtimeOverlayFileNames()) {
    const targetPath = path.join(
      stagingDirectory,
      "chrome",
      "browser",
      "content",
      "browser",
      "nodely",
      fileName
    );
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `// ${fileName}\n`, "utf8");
  }

  const archivePath = path.join(rootDirectory, "browser.omni.ja");
  execFileSync("7z", ["a", "-tzip", archivePath, "."], {
    cwd: stagingDirectory,
    stdio: ["ignore", "ignore", "inherit"]
  });
  return archivePath;
}

async function createIncompleteBrowserOmniArchive(rootDirectory: string) {
  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-browser-omni-incomplete-stage-"));
  tempDirectories.push(stagingDirectory);

  const browserXhtmlPath = path.join(
    stagingDirectory,
    "chrome",
    "browser",
    "content",
    "browser",
    "browser.xhtml"
  );
  const firefoxDefaultsPath = path.join(stagingDirectory, "defaults", "preferences", "firefox.js");
  await mkdir(path.dirname(browserXhtmlPath), { recursive: true });
  await mkdir(path.dirname(firefoxDefaultsPath), { recursive: true });
  await writeFile(browserXhtmlPath, "<html><head></head><body></body></html>", "utf8");
  await writeFile(
    firefoxDefaultsPath,
    [
      'pref("browser.startup.page",                1);',
      'pref("browser.startup.homepage",            "about:home");',
      'pref("browser.aboutwelcome.enabled", true);'
    ].join("\n"),
    "utf8"
  );

  const archivePath = path.join(rootDirectory, "incomplete-browser.omni.ja");
  execFileSync("7z", ["a", "-tzip", archivePath, "."], {
    cwd: stagingDirectory,
    stdio: ["ignore", "ignore", "inherit"]
  });
  return archivePath;
}

async function addBrowserOmniToInstaller(installerPath: string, browserOmniPath: string) {
  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-browser-omni-copy-"));
  tempDirectories.push(stagingDirectory);
  await mkdir(path.join(stagingDirectory, "core", "browser"), { recursive: true });
  await copyFile(browserOmniPath, path.join(stagingDirectory, "core", "browser", "omni.ja"));
  execFileSync("7z", ["u", installerPath, "core/browser/omni.ja"], {
    cwd: stagingDirectory,
    stdio: ["ignore", "ignore", "inherit"]
  });
}

describe("repair-windows-installer", () => {
  it("parses 7z technical listings into file and directory entries", () => {
    const listing = `
Path = /tmp/archive.exe
Type = 7z
----------
Path = core
Attributes = D

Path = core/application.ini
Attributes = A

Path = core/xul.dll
Attributes = A
`;

    expect(parse7zTechnicalListing(listing)).toEqual([
      { path: "core", isDirectory: true },
      { path: "core/application.ini", isDirectory: false },
      { path: "core/xul.dll", isDirectory: false }
    ]);
  });

  it("computes the missing donor entries without clobbering existing payload files", () => {
    const partialEntries = ["core/application.ini", "core/browser/omni.ja", "setup.exe"];
    const donorEntries = [
      { path: "core/application.ini", isDirectory: false },
      { path: "core/firefox.exe", isDirectory: false },
      { path: "core/xul.dll", isDirectory: false },
      { path: "setup.exe", isDirectory: false }
    ];

    expect(computeMissingArchiveEntries(partialEntries, donorEntries)).toEqual([
      { path: "core/firefox.exe", isDirectory: false },
      { path: "core/xul.dll", isDirectory: false }
    ]);
  });

  it("repairs an incomplete Windows installer with donor runtime files while preserving Nodely metadata", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-windows-installer-repair-"));
    tempDirectories.push(tempDirectory);

    const partialInstallerPath = path.join(tempDirectory, "partial.exe");
    const donorInstallerPath = path.join(tempDirectory, "donor.exe");
    const browserOmniPath = await createBrowserOmniArchive(tempDirectory);

    await createArchive(partialInstallerPath, [
      ["core/application.ini", "[App]\nVendor=Nodely\nName=Nodely\n"],
      ["core/omni.ja", "nodely-omni"],
      ["setup.exe", "setup"]
    ]);
    await addBrowserOmniToInstaller(partialInstallerPath, browserOmniPath);

    await createArchive(donorInstallerPath, [
      ["core/application.ini", "[App]\nVendor=Mozilla\nName=Firefox\n"],
      ["core/firefox.exe", "firefox-binary"],
      ["core/xul.dll", "xul-binary"],
      ["core/mozglue.dll", "mozglue-binary"],
      ["setup.exe", "official-setup"]
    ]);

    const result = await repairWindowsInstaller({
      installerPath: partialInstallerPath,
      officialInstallerPath: donorInstallerPath
    });

    expect(result.repaired).toBe(true);
    expect(result.addedEntries).toEqual(["core/firefox.exe", "core/mozglue.dll", "core/xul.dll"]);

    const listing = execFileSync("7z", ["l", partialInstallerPath], { encoding: "utf8" });
    expect(listing).toContain("core/firefox.exe");
    expect(listing).toContain("core/xul.dll");
    expect(listing).toContain("core/mozglue.dll");

    const applicationIni = execFileSync("7z", ["x", "-so", partialInstallerPath, "core/application.ini"], {
      encoding: "utf8"
    });
    expect(applicationIni).toContain("Vendor=Nodely");
    expect(applicationIni).toContain("Name=Nodely");

    const browserOmni = execFileSync("7z", ["x", "-so", partialInstallerPath, "core/browser/omni.ja"]);
    const extractedBrowserOmniPath = path.join(tempDirectory, "repaired-browser.omni.ja");
    await writeFile(extractedBrowserOmniPath, browserOmni);
    const browserOmniListing = execFileSync("7z", ["l", extractedBrowserOmniPath], { encoding: "utf8" });
    expect(browserOmniListing).toContain("chrome/browser/content/browser/nodely/chrome-extension-compat.mjs");
    expect(browserOmniListing).toContain("chrome/browser/content/browser/nodely/compat-extensions-store.mjs");
  });

  it("refreshes Nodely browser chrome in an otherwise complete Windows installer", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-windows-installer-chrome-repair-"));
    tempDirectories.push(tempDirectory);

    const installerPath = path.join(tempDirectory, "complete-with-firefox-chrome.exe");
    const donorInstallerPath = path.join(tempDirectory, "donor.exe");
    const browserOmniPath = await createIncompleteBrowserOmniArchive(tempDirectory);

    await createArchive(installerPath, [
      ["core/application.ini", "[App]\nVendor=Nodely\nName=Nodely\n"],
      ["core/firefox.exe", "firefox-binary"],
      ["core/xul.dll", "xul-binary"],
      ["setup.exe", "setup"]
    ]);
    await addBrowserOmniToInstaller(installerPath, browserOmniPath);

    await createArchive(donorInstallerPath, [
      ["core/application.ini", "[App]\nVendor=Mozilla\nName=Firefox\n"],
      ["core/firefox.exe", "firefox-binary"],
      ["core/xul.dll", "xul-binary"],
      ["setup.exe", "official-setup"]
    ]);

    const result = await repairWindowsInstaller({
      installerPath,
      officialInstallerPath: donorInstallerPath
    });

    expect(result).toEqual({
      repaired: true,
      addedEntries: ["core/browser/omni.ja"]
    });

    const browserOmni = execFileSync("7z", ["x", "-so", installerPath, "core/browser/omni.ja"]);
    const extractedBrowserOmniPath = path.join(tempDirectory, "repaired-complete-browser.omni.ja");
    await writeFile(extractedBrowserOmniPath, browserOmni);
    const browserOmniListing = execFileSync("7z", ["l", extractedBrowserOmniPath], { encoding: "utf8" });
    expect(browserOmniListing).toContain("chrome/browser/content/browser/nodely/chrome-extension-compat.mjs");
    expect(browserOmniListing).toContain("chrome/browser/content/browser/nodely/compat-extensions-store.mjs");
  });

  it("fails verification-only mode when the installer is incomplete", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-windows-installer-verify-"));
    tempDirectories.push(tempDirectory);

    const partialInstallerPath = path.join(tempDirectory, "partial.exe");
    const donorInstallerPath = path.join(tempDirectory, "donor.exe");

    await createArchive(partialInstallerPath, [
      ["core/application.ini", "[App]\nVendor=Nodely\nName=Nodely\n"],
      ["setup.exe", "setup"]
    ]);
    await createArchive(donorInstallerPath, [
      ["core/application.ini", "[App]\nVendor=Mozilla\nName=Firefox\n"],
      ["core/firefox.exe", "firefox-binary"],
      ["core/xul.dll", "xul-binary"],
      ["setup.exe", "official-setup"]
    ]);

    await expect(
      repairWindowsInstaller({
        installerPath: partialInstallerPath,
        officialInstallerPath: donorInstallerPath,
        verifyOnly: true
      })
    ).rejects.toThrow(/is incomplete/u);
  });

  it("discovers packaged Windows installers without picking runtime executables", async () => {
    const checkoutDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-windows-installer-discovery-"));
    tempDirectories.push(checkoutDirectory);

    const distDirectory = path.join(checkoutDirectory, "obj-nodely", "dist");
    await mkdir(path.join(distDirectory, "nodely"), { recursive: true });
    await writeFile(path.join(distDirectory, "nodely", "nodely-bin.exe"), "runtime", "utf8");
    await writeFile(path.join(distDirectory, "nodely", "firefox-bin.exe"), "runtime", "utf8");

    const installerPath = path.join(distDirectory, "nodely-browser-140.10.0.en-US.win64.installer.exe");
    await writeFile(installerPath, "installer", "utf8");

    await expect(findWindowsInstallers(checkoutDirectory)).resolves.toEqual([installerPath]);
  });
});
