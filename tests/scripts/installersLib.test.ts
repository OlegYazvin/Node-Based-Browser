import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractGeckoArtifactVersion,
  extractInstallerVersion,
  pruneInstallers,
  renderInstallerReadme,
  syncInstallers
} from "../../scripts/installers-lib.mjs";

describe("installers-lib", () => {
  it("parses the visible Nodely version from installer and packaged artifact file names", () => {
    expect(extractInstallerVersion("Nodely-Browser-140.10.0-linux-arm64.run")).toBe("140.10.0");
    expect(extractInstallerVersion("nodely-browser-140.10.0.en-US.win64.installer.exe")).toBe("140.10.0");
    expect(extractGeckoArtifactVersion("nodely-browser-140.10.0.en-US.linux-aarch64.tar.xz")).toBe("140.10.0");
  });

  it("renders a support matrix from the installer manifest", () => {
    const readme = renderInstallerReadme({
      generatedAt: "2026-04-05T00:00:00.000Z",
      installers: [
        {
          version: "0.1.0",
          platform: "linux",
          arch: "arm64",
          variant: "generic",
          distribution: "generic",
          compatibility: ["Ubuntu", "Debian"],
          path: "linux/Nodely-Browser-0.1.0-linux-arm64.run",
          fileName: "Nodely-Browser-0.1.0-linux-arm64.run",
          source: "out/make/linux/arm64/Nodely-Browser-0.1.0-linux-arm64.run",
          size: 7,
          builtBy: "local",
          syncedAt: "2026-04-05T00:00:00.000Z"
        },
        {
          version: "0.1.0",
          platform: "darwin",
          arch: "arm64",
          variant: "dmg",
          distribution: "macos",
          compatibility: ["macOS Apple Silicon"],
          path: "macos/Nodely-Browser-0.1.0-macos-arm64.dmg",
          fileName: "Nodely-Browser-0.1.0-macos-arm64.dmg",
          source: "out/make/darwin/arm64/Nodely-Browser-0.1.0-macos-arm64.dmg",
          size: 9,
          builtBy: "github-actions",
          buildWorkflow: ".github/workflows/installers.yml",
          buildRunUrl: "https://github.com/example/repo/actions/runs/123",
          syncedAt: "2026-04-05T00:00:00.000Z"
        }
      ]
    });

    expect(readme).toContain("## Windows 10 and 11");
    expect(readme).toContain("No installers are currently staged in this repo for this target.");
    expect(readme).toContain("[Nodely-Browser-0.1.0-linux-arm64.run](./linux/Nodely-Browser-0.1.0-linux-arm64.run)");
    expect(readme).toContain("Ubuntu, Debian; arm64 only");
    expect(readme).toContain("macOS Apple Silicon");
    expect(readme).toContain("Built by");
    expect(readme).toContain("Local build");
    expect(readme).toContain("[GitHub Actions](https://github.com/example/repo/actions/runs/123) (`installers.yml`)");
  });

  it("replaces stale installer entries for the synced platform and architecture", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-installers-lib-"));
    const makeDirectory = path.join(tempDirectory, "out", "make");
    const targetDirectory = path.join(tempDirectory, "Installer");

    try {
      await mkdir(path.join(makeDirectory, "linux", "arm64"), { recursive: true });
      await writeFile(
        path.join(makeDirectory, "linux", "arm64", "Nodely-Browser-140.10.0-linux-arm64.run"),
        "payload",
        "utf8"
      );

      await mkdir(path.join(targetDirectory, "linux"), { recursive: true });
      await writeFile(
        path.join(targetDirectory, "linux", "Nodely-Browser-0.1.0-debian-arm64.deb"),
        "stale",
        "utf8"
      );
      await writeFile(
        path.join(targetDirectory, "manifest.json"),
        `${JSON.stringify(
          {
            generatedAt: "2026-04-04T00:00:00.000Z",
            installers: [
              {
                version: "140.10.0",
                platform: "linux",
                arch: "arm64",
                variant: "deb",
                distribution: "debian",
                compatibility: ["Debian"],
                path: "linux/Nodely-Browser-0.1.0-debian-arm64.deb",
                fileName: "Nodely-Browser-0.1.0-debian-arm64.deb",
                source: "out/make/linux/arm64/Nodely-Browser-0.1.0-debian-arm64.deb",
                size: 5,
                syncedAt: "2026-04-04T00:00:00.000Z"
              }
            ]
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      const manifest = await syncInstallers({
        platform: "linux",
        arch: "arm64",
        makeDirectory,
        targetDirectory,
        builtBy: "github-actions",
        buildWorkflow: ".github/workflows/installers.yml",
        buildRunUrl: "https://github.com/example/repo/actions/runs/456"
      });

      expect(manifest.installers).toHaveLength(1);
      expect(manifest.installers[0].version).toBe("140.10.0");
      expect(manifest.installers[0].fileName).toBe("Nodely-Browser-140.10.0-linux-arm64.run");
      expect(manifest.installers[0].builtBy).toBe("github-actions");
      expect(manifest.installers[0].buildWorkflow).toBe(".github/workflows/installers.yml");
      expect(manifest.installers[0].buildRunUrl).toBe("https://github.com/example/repo/actions/runs/456");
      await expect(
        access(path.join(targetDirectory, "linux", "Nodely-Browser-0.1.0-debian-arm64.deb"))
      ).rejects.toThrow();

      const readme = await readFile(path.join(targetDirectory, "README.MD"), "utf8");
      expect(readme).toContain("Nodely-Browser-140.10.0-linux-arm64.run");
      expect(readme).toContain("[GitHub Actions](https://github.com/example/repo/actions/runs/456) (`installers.yml`)");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("rejects syncing installers when staging would mix Nodely versions", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-installers-lib-mixed-"));
    const makeDirectory = path.join(tempDirectory, "out", "make");
    const targetDirectory = path.join(tempDirectory, "Installer");

    try {
      await mkdir(path.join(makeDirectory, "linux", "arm64"), { recursive: true });
      await writeFile(
        path.join(makeDirectory, "linux", "arm64", "Nodely-Browser-140.10.0-linux-arm64.run"),
        "payload",
        "utf8"
      );

      await mkdir(path.join(targetDirectory, "windows"), { recursive: true });
      await writeFile(
        path.join(targetDirectory, "manifest.json"),
        `${JSON.stringify(
          {
            generatedAt: "2026-04-04T00:00:00.000Z",
            installers: [
              {
                version: "0.1.0",
                platform: "win32",
                arch: "x64",
                variant: "installer",
                distribution: "windows",
                compatibility: ["Windows 10", "Windows 11"],
                path: "windows/nodely-browser-0.1.0.en-US.win64.installer.exe",
                fileName: "nodely-browser-0.1.0.en-US.win64.installer.exe",
                source: "out/make/win32/x64/nodely-browser-0.1.0.en-US.win64.installer.exe",
                size: 3,
                syncedAt: "2026-04-04T00:00:00.000Z"
              }
            ]
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      await expect(
        syncInstallers({
          platform: "linux",
          arch: "arm64",
          makeDirectory,
          targetDirectory
        })
      ).rejects.toThrow(/multiple Nodely versions/i);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("marks Ubuntu DEB installers as Linux Mint-compatible", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-installers-lib-mint-"));
    const makeDirectory = path.join(tempDirectory, "out", "make");
    const targetDirectory = path.join(tempDirectory, "Installer");

    try {
      await mkdir(path.join(makeDirectory, "linux", "x64"), { recursive: true });
      await writeFile(
        path.join(makeDirectory, "linux", "x64", "Nodely-Browser-140.10.0-ubuntu-x64.deb"),
        "payload",
        "utf8"
      );

      const manifest = await syncInstallers({
        platform: "linux",
        arch: "x64",
        makeDirectory,
        targetDirectory
      });

      expect(manifest.installers).toHaveLength(1);
      expect(manifest.installers[0].fileName).toBe("Nodely-Browser-140.10.0-ubuntu-x64.deb");
      expect(manifest.installers[0].compatibility).toContain("Linux Mint");

      const readme = await readFile(path.join(targetDirectory, "README.MD"), "utf8");
      expect(readme).toContain("On **Linux Mint**, prefer the **Ubuntu DEB** package");
      expect(readme).toContain("Ubuntu, Linux Mint; x64 only");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("prunes only the targeted installer slices and preserves unrelated entries", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-prune-installers-"));
    const targetDirectory = path.join(tempDirectory, "Installer");

    try {
      await mkdir(path.join(targetDirectory, "linux"), { recursive: true });
      await mkdir(path.join(targetDirectory, "windows"), { recursive: true });
      await writeFile(path.join(targetDirectory, "linux", "Nodely-Browser-0.1.0-linux-arm64.run"), "arm", "utf8");
      await writeFile(path.join(targetDirectory, "windows", "Nodely-Browser-0.1.0-win32-x64.exe"), "win", "utf8");
      await writeFile(
        path.join(targetDirectory, "manifest.json"),
        `${JSON.stringify(
          {
            generatedAt: "2026-04-05T00:00:00.000Z",
            installers: [
              {
                version: "0.1.0",
                platform: "linux",
                arch: "arm64",
                variant: "generic",
                distribution: "generic",
                compatibility: ["Ubuntu"],
                path: "linux/Nodely-Browser-0.1.0-linux-arm64.run",
                fileName: "Nodely-Browser-0.1.0-linux-arm64.run",
                source: "out/make/linux/arm64/Nodely-Browser-0.1.0-linux-arm64.run",
                size: 3,
                syncedAt: "2026-04-05T00:00:00.000Z"
              },
              {
                version: "0.1.0",
                platform: "win32",
                arch: "x64",
                variant: "installer",
                distribution: "windows",
                compatibility: ["Windows 10", "Windows 11"],
                path: "windows/Nodely-Browser-0.1.0-win32-x64.exe",
                fileName: "Nodely-Browser-0.1.0-win32-x64.exe",
                source: "out/make/win32/x64/Nodely-Browser-0.1.0-win32-x64.exe",
                size: 3,
                syncedAt: "2026-04-05T00:00:00.000Z"
              }
            ]
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      const manifest = await pruneInstallers({
        targets: ["win32:x64"],
        targetDirectory
      });

      expect(manifest.installers).toHaveLength(1);
      expect(manifest.installers[0].platform).toBe("linux");
      await access(path.join(targetDirectory, "linux", "Nodely-Browser-0.1.0-linux-arm64.run"));
      await expect(access(path.join(targetDirectory, "windows", "Nodely-Browser-0.1.0-win32-x64.exe"))).rejects.toThrow();
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
