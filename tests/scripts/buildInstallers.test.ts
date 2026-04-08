import { describe, expect, it } from "vitest";

import { buildFlatpakWrapper, buildSystemWrapper } from "../../scripts/build-installers.mjs";

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
});
