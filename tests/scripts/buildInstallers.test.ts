import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDesktopEntry,
  buildFlatpakWrapper,
  buildSystemWrapper,
  copyNativeInstaller,
  copyTreePreservingSymlinks,
  debControl,
  rpmSpec,
  resolveInstallerVersion,
  resolveExtractedLinuxAppDirectory
} from "../../scripts/build-installers.mjs";

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("build-installers wrappers", () => {
  it("uses an absolute desktop launcher path for system installs", () => {
    const entry = buildDesktopEntry({
      name: "Nodely Browser",
      exec: "/usr/bin/nodely-browser",
      icon: "nodely-browser"
    });

    expect(entry).toContain("TryExec=/usr/bin/nodely-browser");
    expect(entry).toContain("Exec=/usr/bin/nodely-browser %u");
  });

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
    expect(wrapper).toContain("app_candidates=(");
    expect(wrapper).toContain('"/opt/nodely-browser/app/nodely"');
    expect(wrapper).toContain('set +e');
    expect(wrapper).toContain('"/opt/nodely-browser/app/nodely-bin"');
    expect(wrapper).toContain('"/opt/nodely-browser/app/firefox-bin"');
    expect(wrapper.indexOf('"/opt/nodely-browser/app/nodely"')).toBeLessThan(
      wrapper.indexOf('"/opt/nodely-browser/app/firefox"')
    );
    expect(wrapper).toContain('"$app_executable"');
    expect(wrapper).toContain('status=$?');
    expect(wrapper).toContain("printf '%s");
    expect(wrapper).toContain("sed 's/^Mozilla Firefox /Nodely /'");
    expect(wrapper).toContain("/nodely-browser/gecko-profile");
    expect(wrapper).not.toContain("/nodely/gecko-profile");
    expect(wrapper).not.toContain('-new-instance');
    expect(wrapper).not.toContain('-no-remote');
  });

  it("falls back to a runnable packaged executable for system wrapper version checks", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-build-installers-"));
    tempDirectories.push(rootDirectory);

    const appDirectory = path.join(rootDirectory, "app");
    const wrapperPath = path.join(rootDirectory, "nodely-browser");

    await mkdir(appDirectory, { recursive: true });
    await writeFile(
      path.join(appDirectory, "nodely"),
      [
        "#!/usr/bin/env bash",
        'if [[ "${1:-}" == "--version" ]]; then',
        "  echo 'Mozilla Firefox 140.10.0esr'",
        "  exit 0",
        "fi",
        "echo launched"
      ].join("\n"),
      { mode: 0o755 }
    );
    await writeFile(
      path.join(appDirectory, "nodely-bin"),
      ['#!/usr/bin/env bash', 'script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)', 'exec "$script_dir/firefox-bin" "$@"'].join("\n"),
      { mode: 0o755 }
    );
    await writeFile(
      wrapperPath,
      buildSystemWrapper({
        installRoot: appDirectory,
        desktopFileName: "nodely-browser.desktop"
      }),
      { mode: 0o755 }
    );

    const version = execFileSync(wrapperPath, ["--version"], {
      encoding: "utf8"
    });

    expect(version.trim()).toBe("Nodely 140.10.0esr");
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
    expect(wrapper).toContain("app_candidates=(");
    expect(wrapper).toContain("/app/lib/nodely/nodely");
    expect(wrapper).toContain('set +e');
    expect(wrapper).toContain('/app/lib/nodely/nodely-bin');
    expect(wrapper).toContain('/app/lib/nodely/firefox-bin');
    expect(wrapper.indexOf("/app/lib/nodely/nodely")).toBeLessThan(
      wrapper.indexOf("/app/lib/nodely/firefox")
    );
    expect(wrapper).toContain('"$app_executable"');
    expect(wrapper).toContain('status=$?');
    expect(wrapper).toContain("printf '%s");
    expect(wrapper).toContain("sed 's/^Mozilla Firefox /Nodely /'");
    expect(wrapper).toContain("/nodely-browser/gecko-profile");
    expect(wrapper).not.toContain("/nodely/gecko-profile");
    expect(wrapper).not.toContain('-new-instance');
    expect(wrapper).not.toContain('-no-remote');
  });

  it("declares the Gecko runtime libraries needed by Ubuntu and Mint", () => {
    const control = debControl({
      version: "140.10.0",
      arch: "x64",
      distribution: "ubuntu"
    });

    expect(control).toContain("Version: 140.10.0-5");
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

  it("declares the Debian jpeg runtime package", () => {
    const control = debControl({
      version: "140.10.0",
      arch: "x64",
      distribution: "debian"
    });

    expect(control).toContain("libjpeg62-turbo");
    expect(control).not.toContain("libjpeg8");
  });

  it("declares the Gecko runtime libraries needed by Fedora", () => {
    const spec = rpmSpec({
      version: "140.9.1esr",
      arch: "x64"
    });

    expect(spec).toContain("BuildArch:      x86_64");
    expect(spec).toContain("Release:        5");
    expect(spec).toContain("%global __os_install_post %{nil}");
    expect(spec).toContain("Source0:        nodely-browser-payload.tar.gz");
    expect(spec).toContain("Requires:       gtk3");
    expect(spec).toContain("Requires:       dbus-glib");
    expect(spec).toContain("Requires:       nspr");
    expect(spec).toContain("Requires:       nss");
    expect(spec).toContain("Requires:       libX11");
    expect(spec).toContain("Requires:       libxcb");
    expect(spec).toContain("Requires:       libxkbcommon");
    expect(spec).toContain("Requires:       libwayland-client");
    expect(spec).toContain("Requires:       libwayland-cursor");
    expect(spec).toContain("Requires:       libwayland-egl");
    expect(spec).not.toContain("Requires:       wayland-libs");
    expect(spec).toContain("Requires:       zlib");
    expect(spec).toContain("tar --no-same-owner --no-same-permissions -xzf %{SOURCE0} -C %{buildroot}");
  });

  it("copies native installers to canonical platform and architecture names", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-build-installers-native-"));
    tempDirectories.push(tempDirectory);

    const sourceDirectory = path.join(tempDirectory, "source");
    const outDirectory = path.join(tempDirectory, "out");
    const windowsSource = path.join(sourceDirectory, "nodely-browser-140.9.1esr.en-US.win64.installer.exe");
    const macSource = path.join(sourceDirectory, "nodely-browser-140.9.1esr.en-US.mac.pkg");

    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(windowsSource, "win");
    await writeFile(macSource, "mac");

    await expect(
      copyNativeInstaller({
        platform: "win32",
        arch: "x64",
        sourceArtifactPath: windowsSource,
        outDirectory
      })
    ).resolves.toEqual([path.join(outDirectory, "win32", "x64", "Nodely-Browser-140.9.1esr-windows-x64.installer.exe")]);

    await expect(
      copyNativeInstaller({
        platform: "darwin",
        arch: "arm64",
        sourceArtifactPath: macSource,
        outDirectory
      })
    ).resolves.toEqual([path.join(outDirectory, "darwin", "arm64", "Nodely-Browser-140.9.1esr-macos-arm64.pkg")]);
  });

  it("uses an explicit ESR version for native installers that omit the suffix", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-build-installers-native-esr-"));
    tempDirectories.push(tempDirectory);

    const sourceDirectory = path.join(tempDirectory, "source");
    const outDirectory = path.join(tempDirectory, "out");
    const windowsSource = path.join(sourceDirectory, "nodely-browser-140.9.1.en-US.win64.installer.exe");

    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(windowsSource, "win");

    await expect(
      copyNativeInstaller({
        platform: "win32",
        arch: "x64",
        sourceArtifactPath: windowsSource,
        outDirectory,
        versionOverride: "140.9.1esr"
      })
    ).resolves.toEqual([path.join(outDirectory, "win32", "x64", "Nodely-Browser-140.9.1esr-windows-x64.installer.exe")]);
  });

  it("rejects installer version overrides that do not match the packaged artifact", () => {
    expect(() => resolveInstallerVersion("140.10.0", "140.9.1esr", "native installer test.exe")).toThrow(
      "Installer version override 140.9.1esr does not match packaged artifact version 140.10.0"
    );
  });

  it("preserves relative app-bundle symlinks instead of making build-temp links", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-build-installers-symlinks-"));
    tempDirectories.push(tempDirectory);

    const sourceDirectory = path.join(tempDirectory, "source");
    const destinationDirectory = path.join(tempDirectory, "destination");

    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(path.join(sourceDirectory, "firefox-bin"), "binary");
    await symlink("firefox-bin", path.join(sourceDirectory, "nodely-bin"));

    await copyTreePreservingSymlinks(sourceDirectory, destinationDirectory);

    const copiedLink = path.join(destinationDirectory, "nodely-bin");
    expect((await lstat(copiedLink)).isSymbolicLink()).toBe(true);
    expect(await readlink(copiedLink)).toBe("firefox-bin");
  });

  it("finds the packaged app inside an extra wrapper directory", async () => {
    const extractedDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-build-installers-"));
    tempDirectories.push(extractedDirectory);

    const outerDirectory = path.join(extractedDirectory, "nodely-browser");
    const appDirectory = path.join(outerDirectory, "nodely");

    await mkdir(appDirectory, { recursive: true });
    await writeFile(path.join(appDirectory, "nodely-bin"), "");
    await writeFile(path.join(appDirectory, "application.ini"), "");
    await writeFile(path.join(appDirectory, "libxul.so"), "");

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
    await writeFile(path.join(appDirectory, "libxul.so"), "");

    await expect(resolveExtractedLinuxAppDirectory(extractedDirectory)).resolves.toBe(appDirectory);
  });

  it("rejects a Linux bundle that never reaches a runnable app directory", async () => {
    const extractedDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-build-installers-"));
    tempDirectories.push(extractedDirectory);

    const outerDirectory = path.join(extractedDirectory, "nodely-browser");
    const metadataOnlyDirectory = path.join(outerDirectory, "nodely");

    await mkdir(metadataOnlyDirectory, { recursive: true });
    await writeFile(path.join(metadataOnlyDirectory, "application.ini"), "");

    await expect(resolveExtractedLinuxAppDirectory(extractedDirectory)).rejects.toThrow(
      "Unable to determine the packaged Linux app directory"
    );
  });
});
