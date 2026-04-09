import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildFlatpakWrapper,
  buildSystemWrapper,
  debControl,
  resolveExtractedLinuxAppDirectory
} from "../../scripts/build-installers.mjs";

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("build-installers wrappers", () => {
  it("uses session-aware backend detection for system installs", () => {
    const wrapper = buildSystemWrapper({
      installRoot: "/opt/nodely-browser/app",
      desktopFileName: "nodely-browser.desktop"
    });

    expect(wrapper).toContain('moz_enable_wayland="${MOZ_ENABLE_WAYLAND:-}"');
    expect(wrapper).toContain('WAYLAND_DISPLAY');
    expect(wrapper).toContain('XDG_SESSION_TYPE');
    expect(wrapper).toContain('MOZ_ENABLE_WAYLAND="$moz_enable_wayland"');
    expect(wrapper).not.toContain('MOZ_ENABLE_WAYLAND="${MOZ_ENABLE_WAYLAND:-1}"');
  });

  it("routes system wrapper version checks through the packaged app directly", () => {
    const wrapper = buildSystemWrapper({
      installRoot: "/opt/nodely-browser/app",
      desktopFileName: "nodely-browser.desktop"
    });

    expect(wrapper).toContain('if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then');
    expect(wrapper).toContain('if [[ "$version_only" -eq 1 ]]; then');
    expect(wrapper).toContain('set +e');
    expect(wrapper).toContain('"/opt/nodely-browser/app/nodely-bin"');
    expect(wrapper).toContain('status=$?');
    expect(wrapper).toContain("printf '%s");
    expect(wrapper).toContain("sed 's/^Mozilla Firefox /Nodely /'");
    expect(wrapper).toContain('-new-instance');
  });

  it("uses session-aware backend detection for flatpak installs", () => {
    const wrapper = buildFlatpakWrapper();

    expect(wrapper).toContain('moz_enable_wayland="${MOZ_ENABLE_WAYLAND:-}"');
    expect(wrapper).toContain('WAYLAND_DISPLAY');
    expect(wrapper).toContain('XDG_SESSION_TYPE');
    expect(wrapper).toContain('MOZ_ENABLE_WAYLAND="$moz_enable_wayland"');
    expect(wrapper).not.toContain('MOZ_ENABLE_WAYLAND="${MOZ_ENABLE_WAYLAND:-1}"');
  });

  it("routes flatpak wrapper version checks through the packaged app directly", () => {
    const wrapper = buildFlatpakWrapper();

    expect(wrapper).toContain('if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then');
    expect(wrapper).toContain('if [[ "$version_only" -eq 1 ]]; then');
    expect(wrapper).toContain('set +e');
    expect(wrapper).toContain('/app/lib/nodely/nodely-bin');
    expect(wrapper).toContain('status=$?');
    expect(wrapper).toContain("printf '%s");
    expect(wrapper).toContain("sed 's/^Mozilla Firefox /Nodely /'");
    expect(wrapper).toContain('-new-instance');
  });

  it("declares the Gecko runtime libraries needed by Ubuntu and Mint", () => {
    const control = debControl({
      version: "140.10.0",
      arch: "x64",
      distribution: "ubuntu"
    });

    expect(control).toContain("Depends:");
    expect(control).toContain("libatk1.0-0");
    expect(control).toContain("libdbus-1-3");
    expect(control).toContain("libfontconfig1");
    expect(control).toContain("libgdk-pixbuf-2.0-0");
    expect(control).toContain("libnspr4");
    expect(control).toContain("libnss3");
    expect(control).toContain("libatk-bridge2.0-0");
    expect(control).toContain("libatspi2.0-0");
    expect(control).toContain("libcups2");
    expect(control).toContain("libepoxy0");
    expect(control).toContain("libharfbuzz0b");
    expect(control).toContain("libjpeg8");
    expect(control).toContain("libpangoft2-1.0-0");
    expect(control).toContain("libpng16-16");
    expect(control).toContain("libthai0");
    expect(control).toContain("libwayland-client0");
    expect(control).toContain("libwayland-cursor0");
    expect(control).toContain("libwayland-egl1");
    expect(control).toContain("libx11-6");
    expect(control).toContain("libxcomposite1");
    expect(control).toContain("libxdamage1");
    expect(control).toContain("libxext6");
    expect(control).toContain("libxfixes3");
    expect(control).toContain("libxinerama1");
    expect(control).toContain("libxkbcommon0");
    expect(control).toContain("libxi6");
    expect(control).toContain("libxml2");
    expect(control).toContain("libxrandr2");
    expect(control).toContain("libxrender1");
    expect(control).toContain("libxcb1");
    expect(control).toContain("libxcb-render0");
    expect(control).toContain("libxcb-shm0");
    expect(control).toContain("libgcc-s1");
    expect(control).toContain("zlib1g");
  });

  it("finds the packaged app inside an extra wrapper directory", async () => {
    const extractedDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-build-installers-"));
    tempDirectories.push(extractedDirectory);

    const outerDirectory = path.join(extractedDirectory, "nodely-browser");
    const appDirectory = path.join(outerDirectory, "nodely");

    await mkdir(appDirectory, { recursive: true });
    await writeFile(path.join(appDirectory, "nodely-bin"), "");
    await writeFile(path.join(appDirectory, "application.ini"), "");

    await expect(resolveExtractedLinuxAppDirectory(extractedDirectory)).resolves.toBe(appDirectory);
  });

  it("ignores a metadata-only wrapper directory and keeps descending to the runnable app", async () => {
    const extractedDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-build-installers-"));
    tempDirectories.push(extractedDirectory);

    const outerDirectory = path.join(extractedDirectory, "nodely-browser");
    const metadataOnlyDirectory = path.join(outerDirectory, "nodely");
    const appDirectory = path.join(metadataOnlyDirectory, "nodely");

    await mkdir(appDirectory, { recursive: true });
    await writeFile(path.join(metadataOnlyDirectory, "application.ini"), "");
    await writeFile(path.join(appDirectory, "application.ini"), "");
    await writeFile(path.join(appDirectory, "nodely-bin"), "");

    await expect(resolveExtractedLinuxAppDirectory(extractedDirectory)).resolves.toBe(appDirectory);
  });
});
