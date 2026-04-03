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
```

## Release Artifacts

The user-facing staged artifacts live in [gecko/release-artifacts](./gecko/release-artifacts).

- stage exactly one packaged artifact per platform, architecture, and channel
- keep auxiliary Gecko build outputs outside the user-facing staging area
- use [gecko/RELEASE.md](./gecko/RELEASE.md) for release flow details

## Project Status

This is an active V1 browser focused on making research trails visible and manageable on top of Gecko.
