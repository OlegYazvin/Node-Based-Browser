import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { verifyMacosPackagedApp } from "../../scripts/verify-macos-packaged-app.mjs";

const tempDirectories: string[] = [];
const describeUnlessWindows = process.platform === "win32" ? describe.skip : describe;

async function createPackagedApp(rootDirectory: string) {
  const appBundle = path.join(rootDirectory, "Nodely.app");
  await mkdir(path.join(appBundle, "Contents", "MacOS"), { recursive: true });
  await mkdir(path.join(appBundle, "Contents", "Resources", "browser"), { recursive: true });
  await writeFile(
    path.join(appBundle, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>firefox</string>
</dict>
</plist>
`
  );
  await writeFile(path.join(appBundle, "Contents", "MacOS", "firefox"), "launcher", { mode: 0o755 });
  await writeFile(path.join(appBundle, "Contents", "MacOS", "XUL"), "xul", { mode: 0o755 });
  await writeFile(path.join(appBundle, "Contents", "Resources", "application.ini"), "[App]\nName=Nodely\n");
  await writeFile(path.join(appBundle, "Contents", "Resources", "omni.ja"), "root omni");
  await writeFile(path.join(appBundle, "Contents", "Resources", "browser", "omni.ja"), "browser omni");
  return appBundle;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describeUnlessWindows("verify-macos-packaged-app", () => {
  it("accepts a release-shaped packaged app", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-macos-packaged-"));
    tempDirectories.push(rootDirectory);

    const appBundle = await createPackagedApp(rootDirectory);

    await expect(verifyMacosPackagedApp(appBundle)).resolves.toMatchObject({
      appBundlePath: appBundle,
      requiredPaths: 6
    });
  });

  it("rejects developer Info.plist keys", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-macos-packaged-dev-"));
    tempDirectories.push(rootDirectory);

    const appBundle = await createPackagedApp(rootDirectory);
    await writeFile(
      path.join(appBundle, "Contents", "Info.plist"),
      "<plist><dict><key>MozillaDeveloperRepoPath</key><string>/tmp/firefox-esr</string></dict></plist>"
    );

    await expect(verifyMacosPackagedApp(appBundle)).rejects.toThrow(/MozillaDeveloperRepoPath/);
  });

  it("rejects apps missing packaged omni archives", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-macos-packaged-omni-"));
    tempDirectories.push(rootDirectory);

    const appBundle = await createPackagedApp(rootDirectory);
    await rm(path.join(appBundle, "Contents", "Resources", "browser", "omni.ja"));

    await expect(verifyMacosPackagedApp(appBundle)).rejects.toThrow(/browser\/omni\.ja/);
  });

  it("rejects apps with external symlinks", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-macos-packaged-link-"));
    tempDirectories.push(rootDirectory);

    const appBundle = await createPackagedApp(rootDirectory);
    const externalTarget = path.join(rootDirectory, "external.txt");
    await writeFile(externalTarget, "outside");
    await symlink(externalTarget, path.join(appBundle, "Contents", "Resources", "external.txt"));

    await expect(verifyMacosPackagedApp(appBundle)).rejects.toThrow(/external symlink/i);
  });
});
