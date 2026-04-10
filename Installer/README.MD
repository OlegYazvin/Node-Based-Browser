# Nodely Installer Guide

This directory is the small, machine-readable installer index used by release automation. Large generated installers are published as GitHub Release assets instead of committed to the repo when they exceed normal GitHub file limits. `Installer/manifest.json` describes the installers staged in this directory when files are present, and this file is regenerated from that manifest.

## Quick guide

- Use **Linux x64** on most Linux Mint, Ubuntu, Debian, and Fedora desktop PCs.
- Use **Linux arm64** only on ARM64 Linux hardware.
- On **Linux Mint**, prefer the **Ubuntu DEB** package if you want the cleanest install and uninstall experience.
- The cross-platform installer workflow publishes release assets for the current Nodely version after Windows, macOS, and Linux checks pass.
- Each staged installer records whether it came from a local build or GitHub Actions promotion.
- If a section below says no installers are staged, check the [GitHub Releases](https://github.com/OlegYazvin/Node-Based-Browser/releases) page for published CI assets for the current version.
- First-pass Windows and macOS installers may be unsigned unless separate signing credentials are configured.

Generated from `Installer/manifest.json` at 2026-04-10T08:53:08.541Z.

## Windows 10 and 11

Use this on most Windows 10 or Windows 11 PCs. This installer is x64, so it does not target Windows on ARM.

No installers are currently staged in this repo for this target.

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
