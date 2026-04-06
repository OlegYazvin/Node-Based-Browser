# Nodely Installer Guide

This directory contains the installers that actually exist in this repo right now. `Installer/manifest.json` is the machine-readable source of truth, and this file is regenerated from that manifest.

## Quick guide

- Use **Linux x64** on most Linux Mint, Ubuntu, Debian, and Fedora desktop PCs.
- Use **Linux arm64** only on ARM64 Linux hardware.
- Windows and macOS installers are produced on native GitHub Actions runners and only show up here after a real native build has been promoted into this directory.
- If a section below says no installers are staged, there is nothing in this repo for that target today.
- First-pass Windows and macOS installers may be unsigned unless separate signing credentials are configured.

Generated from `Installer/manifest.json` at 2026-04-06T03:11:34.195Z.

## Windows 10 and 11

Use this on Intel/AMD Windows 10 or Windows 11 PCs.

| File | Type | Supported systems |
| --- | --- | --- |
| [nodely-browser-140.10.0.en-US.win64.installer.exe](./windows/nodely-browser-140.10.0.en-US.win64.installer.exe) | Windows installer (`.exe`) | Windows 10, Windows 11; x64 only |

## macOS Intel

Use this on Intel Macs.

No installers are currently staged in this repo for this target.

## macOS Apple Silicon

Use this on Apple Silicon Macs.

No installers are currently staged in this repo for this target.

## Linux x64

Use this on most Linux Mint, Ubuntu, Debian, and Fedora desktop PCs with Intel/AMD processors.

No installers are currently staged in this repo for this target.

## Linux arm64

Use this only on ARM64 Linux hardware.

| File | Type | Supported systems |
| --- | --- | --- |
| [Nodely-Browser-0.1.0-debian-arm64.deb](./linux/Nodely-Browser-0.1.0-debian-arm64.deb) | Debian DEB package | Debian; arm64 only |
| [Nodely-Browser-0.1.0-fedora-arm64.rpm](./linux/Nodely-Browser-0.1.0-fedora-arm64.rpm) | Fedora RPM package | Fedora; arm64 only |
| [Nodely-Browser-0.1.0-linux-arm64.flatpak](./linux/Nodely-Browser-0.1.0-linux-arm64.flatpak) | Flatpak bundle | Linux Mint, Fedora, Ubuntu, Debian, other Flatpak-enabled Linux distros; arm64 only |
| [Nodely-Browser-0.1.0-linux-arm64.run](./linux/Nodely-Browser-0.1.0-linux-arm64.run) | Self-extracting installer (`.run`) | Ubuntu, Debian, Fedora, Linux Mint, other common desktop Linux distros; arm64 only |
| [Nodely-Browser-0.1.0-ubuntu-arm64.deb](./linux/Nodely-Browser-0.1.0-ubuntu-arm64.deb) | Ubuntu DEB package | Ubuntu; arm64 only |
