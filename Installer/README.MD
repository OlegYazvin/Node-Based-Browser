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
- If a section below says no installers are staged, check the GitHub Releases page for the latest published assets for that target.
- First-pass Windows and macOS installers may be unsigned unless separate signing credentials are configured.

Generated from `Installer/manifest.json` at 2026-04-11T03:12:20.186Z.

## Windows 10 and 11

Use this on most Windows 10 or Windows 11 PCs. This installer is x64, so it does not target Windows on ARM.

| File | Type | Supported systems | Built by |
| --- | --- | --- | --- |
| [Nodely-Browser-140.10.0-windows-x64.installer.exe](./windows/Nodely-Browser-140.10.0-windows-x64.installer.exe) | Windows installer (`.exe`) | Windows 10, Windows 11; x64 only | [GitHub Actions](https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/24272453838) (`installers.yml`) |

## macOS Intel

Use this on Intel Macs.

No installers are currently staged in this repo for this target.

## macOS Apple Silicon

Use this on Apple Silicon Macs.

No installers are currently staged in this repo for this target.

## Linux x64

Use this on most Linux Mint, Ubuntu, Debian, and Fedora desktop PCs with Intel/AMD processors. On Linux Mint, prefer the Ubuntu DEB for easy install and uninstall through Software Manager.

No installers are currently staged in this repo for this target.

## Linux arm64

Use this only on ARM64 Linux hardware. On Linux Mint ARM64, prefer the Ubuntu DEB for easy install and uninstall through Software Manager.

No installers are currently staged in this repo for this target.
