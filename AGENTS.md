# Agent Notes

- When Gecko overlay code, packaging scripts, release metadata, or staged artifacts change, keep `gecko/release-artifacts/manifest.json` current for the artifacts that were actually produced.
- Do not claim Gecko release artifacts were built for platforms, architectures, or channels that were not actually packaged.
- Prefer the CI workflow at `.github/workflows/gecko-verify.yml` for cross-platform verification and staged release refreshes after Gecko-facing changes.
- Keep `gecko/release-artifacts/` user-facing: stage the single packaged artifact a person should download for each platform/channel, not auxiliary build outputs.
- Keep one visible Nodely release version across `gecko/release-artifacts/` and `Installer/` at a time. Platform-specific installers are fine, but do not stage mixed Nodely versions in the same repo snapshot.
- For Nodely interaction regressions, verify the packaged app's actual runtime tab or browser surface behavior; workspace selection alone is not enough to prove a page opened.
- For Nodely canvas/split input regressions, packaged smoke must confirm the live `nodely-graph-surface` and split handle both report `pointerEvents: "auto"` when they should be interactive. Synthetic activation alone is not enough to clear a manual mouse bug.
- For Nodely icon-only controls or contextual overlays, packaged smoke should verify rendered icon/path presence and placement mode, not just that wrapper buttons exist in the DOM.
- For Nodely dropdowns and context menus, packaged smoke should verify they anchor to the live trigger area and keep `nodely-browser-surface="page"` when the page is supposed to stay interactive.
- Local Gecko browser launch directory: `../Nodely-Gecko/firefox-esr/obj-nodely/dist/nodely`. Treat `obj-nodely/dist/nodely/nodely` as the only supported local runnable Gecko app for Nodely. Do not fall back to `obj-nodely/dist/bin/*` when launching or verifying local Gecko behavior.
- Before calling a bug fixed, reproduce it on the relevant runtime first and rerun an explicit verification after the change. For local Gecko/Nodely bugs, prefer a packaged-build smoke run or equivalent concrete execution path over source-only reasoning.
- On this Wayland workstation, prefer packaged-build smoke plus `pyatspi` for real UI verification. Native Nodely windows may not be reachable through X11-only click tools, so do not treat failed X11 input synthesis as proof that the UI itself is broken.

## Lean Implementation Rules

- Prefer the smallest change that fully solves the problem. Do not add new layers, files, or abstractions unless they clearly reduce complexity or are reused.
- Keep code paths tight in hot or frequently used flows. Avoid repeated full-tree scans, duplicate work, unnecessary DOM churn, and avoidable async hops when a simpler approach works.
- Do not add dependencies, frameworks, helpers, or configuration unless they are justified by a concrete current need.
- Favor extending existing modules over creating parallel versions of the same logic. If a path is replaced, remove the obsolete path instead of leaving dead or duplicate code behind.
- Avoid speculative architecture. Build only what the current feature or fix needs, not future-facing infrastructure that is not yet required.
- Keep build, smoke, and installer tooling lightweight. Do not add steps that slow iteration unless they provide clear verification value.
- Keep tests targeted and high-signal. Add regression coverage for real behavior, but avoid bulky test scaffolding that duplicates what existing tests already cover.
- Prefer clear, direct code over clever code, but keep it compact. Comments, utilities, and wrappers should earn their keep.
