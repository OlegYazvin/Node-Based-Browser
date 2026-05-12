import os from "node:os";
import path from "node:path";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  inspectMacosAppSymlinks,
  inspectOrMaterializeMacosApps,
  materializeMacosAppSymlinks
} from "../../scripts/materialize-macos-app-symlinks.mjs";

const tempDirectories: string[] = [];
const describeUnlessWindows = process.platform === "win32" ? describe.skip : describe;

async function createMacosApp(rootDirectory: string) {
  const appBundle = path.join(rootDirectory, "dist", "Nodely.app");
  await mkdir(path.join(appBundle, "Contents", "Resources", "res"), { recursive: true });
  await writeFile(path.join(appBundle, "Contents", "Resources", "firefox"), "launcher", { mode: 0o755 });
  return appBundle;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describeUnlessWindows("materialize-macos-app-symlinks", () => {
  it("replaces external bundle symlinks with real files and keeps internal symlinks", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-macos-symlinks-"));
    tempDirectories.push(rootDirectory);

    const appBundle = await createMacosApp(rootDirectory);
    const sourceDirectory = path.join(rootDirectory, "gecko-source");
    const sourceNib = path.join(sourceDirectory, "MainMenu.nib");
    await mkdir(sourceNib, { recursive: true });
    await writeFile(path.join(sourceDirectory, "language.properties"), "lang\n");
    await writeFile(path.join(sourceNib, "keyedobjects.nib"), "nib\n");

    const resourcesDirectory = path.join(appBundle, "Contents", "Resources");
    const absoluteLink = path.join(resourcesDirectory, "res", "language.properties");
    const relativeLink = path.join(resourcesDirectory, "res", "MainMenu.nib");
    const internalLink = path.join(resourcesDirectory, "nodely");

    await symlink(path.join(sourceDirectory, "language.properties"), absoluteLink);
    await symlink(path.relative(path.dirname(relativeLink), sourceNib), relativeLink, "dir");
    await symlink("firefox", internalLink);

    const before = await inspectMacosAppSymlinks(appBundle);
    expect(before.externalSymlinks).toHaveLength(2);
    expect(before.internalSymlinks).toHaveLength(1);

    const summary = await materializeMacosAppSymlinks(appBundle);
    expect(summary.materializedSymlinks).toBe(2);

    await expect(inspectOrMaterializeMacosApps([appBundle], { check: true })).resolves.toHaveLength(1);
    await expect(readFile(absoluteLink, "utf8")).resolves.toBe("lang\n");
    await expect(readFile(path.join(relativeLink, "keyedobjects.nib"), "utf8")).resolves.toBe("nib\n");

    expect((await lstat(absoluteLink)).isSymbolicLink()).toBe(false);
    expect((await lstat(relativeLink)).isSymbolicLink()).toBe(false);
    expect((await lstat(internalLink)).isSymbolicLink()).toBe(true);
    await expect(readlink(internalLink)).resolves.toBe("firefox");
  });

  it("fails check mode when an app bundle still points outside itself", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-macos-symlink-check-"));
    tempDirectories.push(rootDirectory);

    const appBundle = await createMacosApp(rootDirectory);
    const sourceFile = path.join(rootDirectory, "external.txt");
    const linkPath = path.join(appBundle, "Contents", "Resources", "external.txt");
    await writeFile(sourceFile, "outside");
    await symlink(sourceFile, linkPath);

    await expect(inspectOrMaterializeMacosApps([rootDirectory], { check: true })).rejects.toThrow(/external symlink/i);
  });

  it("fails materialization when an app bundle has a broken symlink", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-macos-symlink-broken-"));
    tempDirectories.push(rootDirectory);

    const appBundle = await createMacosApp(rootDirectory);
    const missingTarget = path.join(rootDirectory, "missing-source-file");
    await symlink(missingTarget, path.join(appBundle, "Contents", "Resources", "missing-source-file"));

    await expect(materializeMacosAppSymlinks(appBundle)).rejects.toThrow(/broken symlink/i);
  });
});
