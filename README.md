# Nodely Browser

Nodely Browser is a Gecko-based research browser that replaces traditional tab sprawl with a visible node graph.

Instead of losing context across dozens of tabs, you build trees of pages:
- a root node starts a research thread
- child nodes represent follow-up leads
- the canvas shows where information came from
- page view and graph view stay connected

## Why It Exists

Normal browsers are optimized for linear browsing. Research usually is not.

When you are investigating a topic, you branch:
- search results
- source documents
- social posts
- store pages
- side leads you may want to revisit later

Nodely Browser is designed to make that branching visible. The graph is the navigation model, not an afterthought.

## Active Codepath

This repository is now Gecko-only.

- The maintained browser surface lives under [gecko](./gecko).
- The overlay syncs into a sibling Gecko source checkout and becomes the Nodely browser there.
- The older Electron/Blink reference app and installer pipeline have been removed from this repo.

## Core Ideas

- `Roots` are the starting points for distinct lines of inquiry.
- `Nodes` represent pages in a tree.
- `Canvas mode` lets you manage the graph directly.
- `Split mode` keeps the graph and the current page visible together.
- `Focus mode` keeps the graph as the default surface, with full-page node viewing when you open a page.
- `Favorites` work for both individual pages and entire trees.
- `Trees` gives you a compact manager for renaming, focusing, or killing root threads.

## Development

Requirements:
- Node.js and npm
- a sibling Gecko source checkout for build and run work

Useful commands:

```bash
npm install
npm test
npm run lint
npm run gecko:bootstrap
npm run gecko:doctor -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:mozconfig -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:refresh-branding -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:smoke -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run installers
```

## Release Artifacts

The user-facing staged artifacts live in [gecko/release-artifacts](./gecko/release-artifacts).

- stage exactly one packaged artifact per platform, architecture, and channel
- keep auxiliary Gecko build outputs outside the user-facing staging area
- use [gecko/RELEASE.md](./gecko/RELEASE.md) for release flow details

## Installers

The public download page for installers is GitHub Releases:

- latest release: <https://github.com/OlegYazvin/Node-Based-Browser/releases/latest>
- all releases: <https://github.com/OlegYazvin/Node-Based-Browser/releases>

The [Installer](./Installer) directory is the repo-staged installer snapshot and maintainer metadata, not the primary user download destination.

- Visible release numbering follows Nodely’s own app version from `package.json`, starting at `0.1`.
- Gecko ESR remains tracked separately in staged artifact and installer metadata so the engine base is always visible.
- `npm run installers` builds the installer for the current platform from the staged Gecko package in `gecko/release-artifacts`.
- `npm run installers:sync -- --platform <platform> --arch <arch>` copies a finished installer from `out/make/<platform>/<arch>` into `Installer/` and refreshes both `Installer/manifest.json` and [Installer/README.MD](./Installer/README.MD).
- `npm run installers:prune -- --target <platform:arch>` removes stale installer slices before a CI promotion refresh.
- Keep a single visible Nodely release version across `gecko/release-artifacts/` and `Installer/`; the repo snapshot can contain multiple platform installers, but they should all belong to the same Nodely version.
- Linux uses a self-contained `.run` installer so the downloaded file is enough to install and launch Nodely on common desktop distributions.
- Download links shared with end users should point to GitHub Releases, not the repo tree.
- The full [`.github/workflows/installers.yml`](./.github/workflows/installers.yml) workflow is the unified promotion path: it refreshes the repo-staged `Installer/` snapshot, generates `Installer/RELEASE_NOTES.MD`, and republishes the full GitHub Release asset set only after the entire matrix succeeds.
- Windows x64 also has a dedicated [`.github/workflows/windows-x64-installer.yml`](./.github/workflows/windows-x64-installer.yml) path so a successful Windows build can refresh the public `.exe` on every real push to `main`, even when unrelated Linux or macOS jobs are failing elsewhere.
- Linux x64 has a dedicated [`.github/workflows/linux-mint-x64-installer.yml`](./.github/workflows/linux-mint-x64-installer.yml) path so the public Linux Mint / Ubuntu-family assets refresh directly on normal pushes to `main`.
- macOS Intel and Apple Silicon have a dedicated [`.github/workflows/macos-installers.yml`](./.github/workflows/macos-installers.yml) path so the public `.dmg` / `.pkg` assets refresh directly on normal pushes to `main`.
- Public end-user downloads should come from GitHub Releases; `Installer/` is the repo-staged snapshot for the latest fully successful matrix promotion.
- `Installer/` should only contain installers that were actually built and synced for this version.
- [INSTALLER_BOUNDARIES.MD](./INSTALLER_BOUNDARIES.MD) is the maintainer guide for keeping Gecko browser packaging separate from installer generation.

## Project Status

This is an active V1 browser focused on making research trails visible and manageable on top of Gecko.
