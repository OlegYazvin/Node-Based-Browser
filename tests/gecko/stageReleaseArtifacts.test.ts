import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  inspectWindowsArtifactBundle,
  inspectWindowsBrowserOmniListing,
  inspectWindowsInstallerListing,
  isPackagedWindowsInstallerName,
  selectPackagedArtifact
} from "../../gecko/scripts/stage-release-artifacts.mjs";
import { runtimeOverlayFileNames } from "../../gecko/scripts/sync-overlay.mjs";

type ArchiveEntry = {
  path: string;
  contents?: string;
};

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createTarball(rootDirectory: string, fileName: string, entries: ArchiveEntry[]) {
  const sourceDirectory = path.join(rootDirectory, fileName.replace(/\.tar\.(?:xz|bz2|gz)$/u, ""));
  await mkdir(sourceDirectory, { recursive: true });

  for (const entry of entries) {
    const entryPath = path.join(sourceDirectory, entry.path);
    await mkdir(path.dirname(entryPath), { recursive: true });
    await writeFile(entryPath, entry.contents ?? "", "utf8");
  }

  const tarballPath = path.join(rootDirectory, fileName);
  execFileSync("tar", ["-cJf", tarballPath, "-C", rootDirectory, path.basename(sourceDirectory)]);
  return tarballPath;
}

async function createZipArchive(rootDirectory: string, fileName: string, entries: ArchiveEntry[]) {
  const sourceDirectory = path.join(rootDirectory, fileName.replace(/\.(?:zip|ja|exe)$/u, ""));
  await mkdir(sourceDirectory, { recursive: true });

  for (const entry of entries) {
    const entryPath = path.join(sourceDirectory, entry.path);
    await mkdir(path.dirname(entryPath), { recursive: true });
    await writeFile(entryPath, entry.contents ?? "", "utf8");
  }

  const archivePath = path.join(rootDirectory, fileName);
  execFileSync("7z", ["a", "-tzip", archivePath, "."], {
    cwd: sourceDirectory,
    stdio: ["ignore", "ignore", "ignore"]
  });
  return archivePath;
}

describe("stage-release-artifacts", () => {
  it("prefers a Linux tarball that contains the runnable app bundle", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-stage-release-"));
    tempDirectories.push(tempDirectory);

    const partialArtifact = await createTarball(tempDirectory, "nodely-browser-140.10.0.en-US.linux-x86_64.tar.xz", [
      { path: "nodely/application.ini" },
      { path: "nodely/nodely-bin" },
      { path: "nodely/omni.ja" }
    ]);
    const runnableArtifact = await createTarball(tempDirectory, "nodely-140.10.0.en-US.linux-x86_64.tar.xz", [
      { path: "nodely/application.ini" },
      { path: "nodely/nodely-bin" },
      { path: "nodely/libxul.so" }
    ]);

    expect(selectPackagedArtifact([partialArtifact, runnableArtifact], "linux")).toBe(runnableArtifact);
  });

  it("rejects Linux tarballs that do not contain a runnable app bundle", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-stage-release-"));
    tempDirectories.push(tempDirectory);

    const partialArtifact = await createTarball(tempDirectory, "nodely-browser-140.10.0.en-US.linux-x86_64.tar.xz", [
      { path: "nodely/application.ini" },
      { path: "nodely/nodely-bin" },
      { path: "nodely/omni.ja" }
    ]);

    expect(selectPackagedArtifact([partialArtifact], "linux")).toBeNull();
  });

  it("prefers DMG artifacts over PKG artifacts for macOS staging", () => {
    const dmgArtifact = "/tmp/nodely-140.10.0.en-US.mac.dmg";
    const pkgArtifact = "/tmp/nodely-140.10.0.en-US.mac.pkg";

    expect(selectPackagedArtifact([pkgArtifact, dmgArtifact], "darwin")).toBe(dmgArtifact);
  });

  it("prefers a Windows installer that contains a runnable app bundle", () => {
    const partialArtifact = "/tmp/nodely-browser-140.10.0.en-US.win64.installer.exe";
    const runnableArtifact = "/tmp/nodely-140.10.0.en-US.win64.installer.exe";

    expect(
      selectPackagedArtifact([partialArtifact, runnableArtifact], "win32", {
        inspectWindowsArtifact: (artifactPath: string) => artifactPath === runnableArtifact
      })
    ).toBe(runnableArtifact);
  });

  it("rejects Windows installers that do not contain a runnable app bundle", () => {
    const partialArtifact = "/tmp/nodely-browser-140.10.0.en-US.win64.installer.exe";

    expect(
      selectPackagedArtifact([partialArtifact], "win32", {
        inspectWindowsArtifact: () => false
      })
    ).toBeNull();
  });

  it("flags Windows installers that ship metadata but no executable payload", () => {
    const brokenListing = `
2026-04-23 13:38:42 ....A          679  core/application.ini
2026-04-23 13:38:42 ....A     46945902  core/browser/omni.ja
2026-04-23 13:38:42 ....A     38279515  core/omni.ja
2026-04-23 13:38:42 ....A       973433  setup.exe
`;

    expect(inspectWindowsInstallerListing(brokenListing)).toEqual({
      hasMetadata: true,
      hasBrowserBinary: false,
      hasRuntimeLibrary: false
    });
  });

  it("accepts Windows installers that include the browser executable and runtime library", () => {
    const runnableListing = `
2026-04-23 13:38:42 ....A          679  core/application.ini
2026-04-23 13:38:42 ....A      667648  core/nodely.exe
2026-04-23 13:38:42 ....A   209715200  core/xul.dll
2026-04-23 13:38:42 ....A       973433  setup.exe
`;

    expect(inspectWindowsInstallerListing(runnableListing)).toEqual({
      hasMetadata: true,
      hasBrowserBinary: true,
      hasRuntimeLibrary: true
    });
  });

  it("flags Windows browser omni archives missing Nodely module dependencies", () => {
    const incompleteListing = `
2010-01-01 00:00:00 ..... chrome/browser/content/browser/nodely/browser-basics-bridge.mjs
2010-01-01 00:00:00 ..... chrome/browser/content/browser/nodely/nodely-bootstrap.mjs
2010-01-01 00:00:00 ..... chrome/browser/content/browser/nodely/nodely-shell.mjs
`;

    const inspection = inspectWindowsBrowserOmniListing(incompleteListing);

    expect(inspection.hasCompleteNodelyChrome).toBe(false);
    expect(inspection.missingNodelyFiles).toContain("compat-extensions-store.mjs");
    expect(inspection.missingNodelyFiles).toContain("chrome-extension-compat.mjs");
  });

  it("accepts Windows browser omni listings that use backslash separators", () => {
    const completeListing = (runtimeOverlayFileNames() as string[])
      .map((fileName: string) => `2010-01-01 00:00:00 ..... chrome\\browser\\content\\browser\\nodely\\${fileName}`)
      .join("\n");

    expect(inspectWindowsBrowserOmniListing(completeListing)).toEqual({
      hasCompleteNodelyChrome: true,
      missingNodelyFiles: []
    });
  });

  it("accepts Windows installers only when the nested browser omni has all Nodely files", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-stage-release-"));
    tempDirectories.push(tempDirectory);

    const browserOmni = await createZipArchive(
      tempDirectory,
      "browser.omni.ja",
      (runtimeOverlayFileNames() as string[]).map((fileName: string) => ({
        path: path.posix.join("chrome", "browser", "content", "browser", "nodely", fileName)
      }))
    );

    const outerSourceDirectory = path.join(tempDirectory, "installer-source");
    await mkdir(path.join(outerSourceDirectory, "core", "browser"), { recursive: true });
    await writeFile(path.join(outerSourceDirectory, "core", "application.ini"), "[App]\nName=Nodely\n", "utf8");
    await writeFile(path.join(outerSourceDirectory, "core", "firefox.exe"), "", "utf8");
    await writeFile(path.join(outerSourceDirectory, "core", "xul.dll"), "", "utf8");
    await copyFile(browserOmni, path.join(outerSourceDirectory, "core", "browser", "omni.ja"));

    const installerPath = path.join(tempDirectory, "nodely-140.10.0.en-US.win64.installer.exe");
    execFileSync("7z", ["a", "-tzip", installerPath, "."], {
      cwd: outerSourceDirectory,
      stdio: ["ignore", "ignore", "ignore"]
    });

    expect(inspectWindowsArtifactBundle(installerPath)).toMatchObject({
      hasMetadata: true,
      hasBrowserBinary: true,
      hasRuntimeLibrary: true,
      hasCompleteNodelyChrome: true,
      missingNodelyFiles: []
    });
  });

  it("accepts Windows installer listings that use backslash separators", () => {
    const runnableListing = `
2026-04-23 13:38:42 ....A          679  core\\application.ini
2026-04-23 13:38:42 ....A      667648  core\\firefox.exe
2026-04-23 13:38:42 ....A   209715200  core\\xul.dll
2026-04-23 13:38:42 ....A       973433  setup.exe
`;

    expect(inspectWindowsInstallerListing(runnableListing)).toEqual({
      hasMetadata: true,
      hasBrowserBinary: true,
      hasRuntimeLibrary: true
    });
  });

  it("matches packaged Windows installer names without treating runtime executables as installers", () => {
    expect(isPackagedWindowsInstallerName("nodely-browser-140.10.0.en-US.win64.installer.exe")).toBe(true);
    expect(isPackagedWindowsInstallerName("Nodely-Browser-0.1-windows-x64.installer.exe")).toBe(true);
    expect(isPackagedWindowsInstallerName("nodely-bin.exe")).toBe(false);
    expect(isPackagedWindowsInstallerName("firefox-bin.exe")).toBe(false);
  });
});
