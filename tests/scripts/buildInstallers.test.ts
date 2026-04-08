import { describe, expect, it } from "vitest";

import { buildFlatpakWrapper, buildSystemWrapper, debControl } from "../../scripts/build-installers.mjs";

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

  it("uses session-aware backend detection for flatpak installs", () => {
    const wrapper = buildFlatpakWrapper();

    expect(wrapper).toContain('moz_enable_wayland="${MOZ_ENABLE_WAYLAND:-}"');
    expect(wrapper).toContain('WAYLAND_DISPLAY');
    expect(wrapper).toContain('XDG_SESSION_TYPE');
    expect(wrapper).toContain('MOZ_ENABLE_WAYLAND="$moz_enable_wayland"');
    expect(wrapper).not.toContain('MOZ_ENABLE_WAYLAND="${MOZ_ENABLE_WAYLAND:-1}"');
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
    expect(control).toContain("libx11-6");
    expect(control).toContain("libxcomposite1");
    expect(control).toContain("libxdamage1");
    expect(control).toContain("libxext6");
    expect(control).toContain("libxfixes3");
    expect(control).toContain("libxi6");
    expect(control).toContain("libxrandr2");
    expect(control).toContain("libxrender1");
    expect(control).toContain("libxcb1");
    expect(control).toContain("libxcb-shm0");
    expect(control).toContain("libgcc-s1");
    expect(control).toContain("zlib1g");
  });
});
