import { access, lstat, mkdtemp, mkdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ensureMacArtifactCompatibility,
  patchApplicationIni,
  refreshBranding
} from "../../gecko/scripts/refresh-artifact-branding.mjs";

describe("refresh-artifact-branding", () => {
  it("routes crash report metadata through the Nodely crash contact", () => {
    const patched = patchApplicationIni(
      [
        "[App]",
        "Vendor=Mozilla",
        "Name=Firefox",
        "RemotingName=firefox",
        "CodeName=Firefox",
        "Version=140.9.1esr",
        "BuildID=20260410000102",
        "ID={ec8030f7-c20a-464f-9b0e-13a3a9e97384}",
        "[Crash Reporter]",
        "ServerURL=https://crashes.nodely.invalid/submit?id=old&version=old&buildid=old",
        "[AppUpdate]",
        "URL=https://example.invalid"
      ].join("\n")
    );

    expect(patched).toContain(
      "ServerURL=https://crashes.nodely.invalid/submit?to=olegyazvin%40gmail.com&id={a75f9f03-78b1-4c8a-a2c7-f12d45088b29}&version=140.9.1esr&buildid=20260410000102"
    );
    expect(patched).toContain("Vendor=Nodely");
    expect(patched).toContain("Name=Nodely");
    expect(patched).toContain("URL=");
  });

  it("creates the full mac dist/bin alias set for app bundle artifacts", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-mac-compat-"));
    const executablePath = path.join(
      tempDirectory,
      "obj-nodely",
      "dist",
      "Firefox Nightly.app",
      "Contents",
      "MacOS",
      "firefox"
    );

    try {
      await mkdir(path.dirname(executablePath), { recursive: true });
      await writeFile(executablePath, "binary", "utf8");

      const updates = await ensureMacArtifactCompatibility(tempDirectory);
      const distBinDirectory = path.join(tempDirectory, "obj-nodely", "dist", "bin");
      const expectedReference = path.join("..", "Firefox Nightly.app", "Contents", "MacOS", "firefox");

      expect(updates).toBe(4);

      for (const aliasName of ["firefox", "firefox-bin", "nodely", "nodely-bin"]) {
        const aliasPath = path.join(distBinDirectory, aliasName);
        const aliasStat = await lstat(aliasPath);

        await access(aliasPath);

        if (aliasStat.isSymbolicLink()) {
          expect(await readlink(aliasPath)).toBe(expectedReference);
        } else {
          expect(await readFile(aliasPath, "utf8")).toBe("binary");
        }
      }
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("preserves an existing dist/bin/firefox and fills the remaining aliases", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-mac-compat-existing-"));
    const aliasPath = path.join(tempDirectory, "obj-nodely", "dist", "bin", "firefox");

    try {
      await mkdir(path.dirname(aliasPath), { recursive: true });
      await writeFile(aliasPath, "existing", "utf8");

      const updates = await ensureMacArtifactCompatibility(tempDirectory);

      expect(updates).toBe(3);
      expect(await readFile(aliasPath, "utf8")).toBe("existing");

      for (const siblingAlias of ["firefox-bin", "nodely", "nodely-bin"]) {
        const siblingPath = path.join(tempDirectory, "obj-nodely", "dist", "bin", siblingAlias);
        const siblingStat = await lstat(siblingPath);

        await access(siblingPath);

        if (siblingStat.isSymbolicLink()) {
          expect(await readlink(siblingPath)).toBe("firefox");
        } else {
          expect(await readFile(siblingPath, "utf8")).toBe("existing");
        }
      }
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("falls back to firefox-bin when that is the only bundle executable", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-mac-compat-firefox-bin-"));
    const executablePath = path.join(
      tempDirectory,
      "obj-nodely",
      "dist",
      "Firefox.app",
      "Contents",
      "MacOS",
      "firefox-bin"
    );

    try {
      await mkdir(path.dirname(executablePath), { recursive: true });
      await writeFile(executablePath, "binary", "utf8");

      const updates = await ensureMacArtifactCompatibility(tempDirectory);
      const distBinDirectory = path.join(tempDirectory, "obj-nodely", "dist", "bin");
      const expectedReference = path.join("..", "Firefox.app", "Contents", "MacOS", "firefox-bin");

      expect(updates).toBe(4);

      for (const aliasName of ["firefox", "firefox-bin", "nodely", "nodely-bin"]) {
        const aliasPath = path.join(distBinDirectory, aliasName);
        const aliasStat = await lstat(aliasPath);

        await access(aliasPath);

        if (aliasStat.isSymbolicLink()) {
          expect(await readlink(aliasPath)).toBe(expectedReference);
        } else {
          expect(await readFile(aliasPath, "utf8")).toBe("binary");
        }
      }
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("makes the packaged nodely wrapper desktop-aware on Linux builds", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-linux-wrapper-"));
    const packagedTargetPath = path.join(tempDirectory, "obj-nodely", "dist", "nodely", "nodely-bin");

    try {
      await mkdir(path.dirname(packagedTargetPath), { recursive: true });
      await writeFile(packagedTargetPath, "binary", "utf8");

      await refreshBranding({ checkoutDir: tempDirectory, mode: "full" });

      const wrapper = await readFile(
        path.join(tempDirectory, "obj-nodely", "dist", "nodely", "nodely"),
        "utf8"
      );

      expect(wrapper).toContain('desktop_file_name="nodely-local-build.desktop"');
      expect(wrapper).toContain('MOZ_APP_REMOTINGNAME="${MOZ_APP_REMOTINGNAME:-nodely}"');
      expect(wrapper).toContain('MOZ_DESKTOP_FILE_NAME="${MOZ_DESKTOP_FILE_NAME:-$desktop_file_name}"');
      expect(wrapper).toContain('NoDisplay=true');
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
