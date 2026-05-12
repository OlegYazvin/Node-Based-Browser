# Nodely Installer Guide

This directory contains the installers that actually exist in this repo right now. `Installer/manifest.json` is the machine-readable source of truth, and this file is regenerated from that manifest.

## Quick guide

- Use **Linux x64** on most Linux Mint, Ubuntu, Debian, and Fedora desktop PCs.
- Use **Linux arm64** only on ARM64 Linux hardware.
- On **Linux Mint**, prefer the **Ubuntu DEB** package if you want the cleanest install and uninstall experience.
- Windows and macOS installers are produced on native GitHub Actions runners and only show up here after a real native build has been promoted into this directory.
- The cross-platform installer workflow also publishes GitHub Release assets for the current Nodely version after a full successful matrix run.
- Each staged installer records whether it came from a local build or GitHub Actions promotion.
- `Installer/RELEASE_NOTES.MD` captures the latest push-triggered installer/release summary for this repo.
- If a section below says no installers are staged, check the [GitHub Releases](https://github.com/OlegYazvin/Node-Based-Browser/releases/latest) page for the latest published assets for that target.
- Windows installers may be unsigned unless separate signing credentials are configured.
- macOS DMG and PKG installers are only staged or published after Developer ID signing, notarization, and Gatekeeper checks pass on GitHub Actions.
- When Apple signing credentials are unavailable, GitHub Actions may stage a macOS app archive (`.zip`) instead. That fallback requires the person installing Nodely to use macOS Privacy & Security -> Open Anyway the first time they launch it.
- Current Nodely version: `0.1`

Generated from `Installer/manifest.json` at 2026-05-12T20:55:25.892Z.

## Windows 10 and 11

Use this on most Windows 10 or Windows 11 PCs. This installer is x64, so it does not target Windows on ARM.

| File | Type | Supported systems | Built by |
| --- | --- | --- | --- |
| [Nodely-Browser-0.1-windows-x64.installer.exe](./windows/Nodely-Browser-0.1-windows-x64.installer.exe) | Windows installer (`.exe`) | Windows 10, Windows 11; x64 only | [GitHub Actions](https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/25759942989) (`installers.yml`) |

## macOS Intel

Use this on Intel Macs.

No installers are currently staged in this repo for this target.

## macOS Apple Silicon

Use this on Apple Silicon Macs.

No installers are currently staged in this repo for this target.

## Linux x64

Use this on most Linux Mint, Ubuntu, Debian, and Fedora desktop PCs with Intel/AMD processors. On Linux Mint, prefer the Ubuntu DEB for easy install and uninstall through Software Manager.

| File | Type | Supported systems | Built by |
| --- | --- | --- | --- |
| [Nodely-Browser-0.1-debian-x64.deb](./linux/Nodely-Browser-0.1-debian-x64.deb) | Debian DEB package | Debian; x64 only | [GitHub Actions](https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/25759942989) (`installers.yml`) |
| [Nodely-Browser-0.1-fedora-x64.rpm](./linux/Nodely-Browser-0.1-fedora-x64.rpm) | Fedora RPM package | Fedora; x64 only | [GitHub Actions](https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/25759942989) (`installers.yml`) |
| [Nodely-Browser-0.1-linux-x64.flatpak](./linux/Nodely-Browser-0.1-linux-x64.flatpak) | Flatpak bundle | Linux Mint, Fedora, Ubuntu, Debian, other Flatpak-enabled Linux distros; x64 only | [GitHub Actions](https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/25759942989) (`installers.yml`) |
| [Nodely-Browser-0.1-linux-x64.run](./linux/Nodely-Browser-0.1-linux-x64.run) | Self-extracting installer (`.run`) | Ubuntu, Debian, Fedora, Linux Mint, other common desktop Linux distros; x64 only | [GitHub Actions](https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/25759942989) (`installers.yml`) |
| [Nodely-Browser-0.1-ubuntu-x64.deb](./linux/Nodely-Browser-0.1-ubuntu-x64.deb) | Ubuntu DEB package | Ubuntu, Linux Mint; x64 only | [GitHub Actions](https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/25759942989) (`installers.yml`) |

## Linux arm64

Use this only on ARM64 Linux hardware. On Linux Mint ARM64, prefer the Ubuntu DEB for easy install and uninstall through Software Manager.

No installers are currently staged in this repo for this target.
