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

The final user-downloadable installers live in [Installer](./Installer).

- `npm run installers` builds the installer for the current platform from the staged Gecko package in `gecko/release-artifacts`.
- `npm run installers:sync -- --platform <platform> --arch <arch>` copies a finished installer from `out/make/<platform>/<arch>` into `Installer/` and refreshes `Installer/manifest.json`.
- Linux uses a self-contained `.run` installer so the downloaded file is enough to install and launch Nodely on common desktop distributions.
- Windows and macOS installers are built from native packaged Gecko outputs and should be produced on native runners through [`.github/workflows/installers.yml`](./.github/workflows/installers.yml).
- `Installer/` should only contain installers that were actually built and synced for this version.

## Project Status

This is an active V1 browser focused on making research trails visible and manageable on top of Gecko.
